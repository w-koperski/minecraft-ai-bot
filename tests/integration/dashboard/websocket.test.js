/**
 * Integration Tests for WebSocket Endpoints
 *
 * Tests WebSocket server lifecycle: connect, state delivery,
 * heartbeat/ping-pong, state updates, and disconnect handling.
 */

'use strict';

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

jest.mock('../../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('lockfile', () => ({
  lock: jest.fn((fp, opts, cb) => {
    if (typeof opts === 'function') { cb = opts; }
    else { setTimeout(() => cb(null), 5); }
  }),
  unlock: jest.fn((fp, cb) => {
    if (!cb) cb = () => {};
    setTimeout(() => cb(null), 5);
  }),
  check: jest.fn((fp, opts, cb) => cb(null, false))
}));

const ORIGINAL_PORT = process.env.DASHBOARD_PORT;
const ORIGINAL_HOST = process.env.DASHBOARD_HOST;

process.env.DASHBOARD_PORT = '13001';
process.env.DASHBOARD_HOST = '127.0.0.1';

const serverModule = require('../../../src/dashboard/server');
const { createServer, updateBotStatus, setupHeartbeat, sendCurrentState } = serverModule;

const WS_URL = 'ws://127.0.0.1:13001/ws';

function handleError(done) {
  return (err) => done(err);
}

describe('WebSocket Integration Tests', () => {
  let server;

  beforeEach((done) => {
    jest.clearAllMocks();
    server = createServer();
    server.listen(13001, '127.0.0.1', () => done());
  });

  afterEach((done) => {
    if (server && server.listening) {
      server.close(() => done());
    } else {
      done();
    }
  });

  afterAll(() => {
    if (ORIGINAL_PORT !== undefined) process.env.DASHBOARD_PORT = ORIGINAL_PORT;
    else delete process.env.DASHBOARD_PORT;
    if (ORIGINAL_HOST !== undefined) process.env.DASHBOARD_HOST = ORIGINAL_HOST;
    else delete process.env.DASHBOARD_HOST;
  });

  test('client connects to ws://host:port/ws endpoint', (done) => {
    const ws = new WebSocket(WS_URL);
    ws.on('open', () => {
      ws.close();
      done();
    });
    ws.on('error', handleError(done));
  });

  test('client receives initial state message on connect', (done) => {
    const ws = new WebSocket(WS_URL);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      expect(msg.type).toBe('state');
      expect(msg.source).toBe('initial');
      expect(msg.data).toHaveProperty('status');
      expect(msg.data).toHaveProperty('health');
      expect(msg.data).toHaveProperty('position');
      expect(msg.data).toHaveProperty('connectedClients');
      expect(msg.data).toHaveProperty('timestamp');
      ws.close();
      done();
    });
    ws.on('error', handleError(done));
  });

  test('initial state includes updated bot status fields', (done) => {
    updateBotStatus({ health: 18, status: 'active' });
    const ws = new WebSocket(WS_URL);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.source === 'initial') {
        expect(msg.data.health).toBe(18);
        expect(msg.data.status).toBe('active');
        ws.close();
        done();
      }
    });
    ws.on('error', handleError(done));
  });

  test('client receives state updates when broadcaster broadcasts', (done) => {
    const ws = new WebSocket(WS_URL);
    let gotInitial = false;

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (!gotInitial && msg.source === 'initial') {
        gotInitial = true;
        updateBotStatus({ health: 15 });
      } else if (msg.data && msg.data.health === 15) {
        ws.close();
        done();
      }
    });
    ws.on('error', handleError(done));
  }, 10000);

  test('server handles client disconnect gracefully', (done) => {
    const ws = new WebSocket(WS_URL);
    ws.on('open', () => {
      ws.close();
    });
    ws.on('close', () => {
      setTimeout(done, 200);
    });
  });

  test('multiple clients can connect simultaneously', (done) => {
    const clients = [];
    let connectedCount = 0;
    const totalClients = 3;

    for (let i = 0; i < totalClients; i++) {
      const ws = new WebSocket(WS_URL);
      clients.push(ws);
      ws.on('open', () => {
        connectedCount++;
        if (connectedCount === totalClients) {
          expect(connectedCount).toBe(totalClients);
          clients.forEach(c => c.close());
          setTimeout(done, 100);
        }
      });
      ws.on('error', handleError(done));
    }
  });
});

describe('setupHeartbeat', () => {
  let mockWs;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWs = {
      readyState: 1,
      ping: jest.fn(),
      terminate: jest.fn(),
      on: jest.fn(),
    };
    mockWs._eventHandlers = {};
    mockWs.on.mockImplementation((event, handler) => {
      mockWs._eventHandlers[event] = handler;
    });
  });

  test('registers pong, close, and error event handlers', () => {
    setupHeartbeat(mockWs);

    const events = mockWs.on.mock.calls.map(call => call[0]);
    expect(events).toContain('pong');
    expect(events).toContain('close');
    expect(events).toContain('error');
  });

  test('sends ping after heartbeat interval', () => {
    jest.useFakeTimers();

    setupHeartbeat(mockWs);

    jest.advanceTimersByTime(35000);

    expect(mockWs.ping).toHaveBeenCalled();

    jest.useRealTimers();
  });

  test('terminates connection when no pong received after ping', () => {
    jest.useFakeTimers();

    setupHeartbeat(mockWs);

    jest.advanceTimersByTime(30000);
    expect(mockWs.ping).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(30000);
    expect(mockWs.terminate).toHaveBeenCalled();

    jest.useRealTimers();
  });

  test('pong response keeps connection alive', () => {
    jest.useFakeTimers();

    setupHeartbeat(mockWs);

    const pongHandler = mockWs._eventHandlers['pong'];

    jest.advanceTimersByTime(30000);
    expect(mockWs.ping).toHaveBeenCalledTimes(1);
    expect(mockWs.terminate).not.toHaveBeenCalled();

    pongHandler();

    jest.advanceTimersByTime(30000);
    expect(mockWs.ping).toHaveBeenCalledTimes(2);
    expect(mockWs.terminate).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  test('cleans up heartbeat timer on close', () => {
    jest.useFakeTimers();

    setupHeartbeat(mockWs);

    jest.advanceTimersByTime(30000);
    expect(mockWs.ping).toHaveBeenCalledTimes(1);

    const closeHandler = mockWs._eventHandlers['close'];
    closeHandler();

    jest.advanceTimersByTime(60000);
    expect(mockWs.ping).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });

  test('cleans up heartbeat timer on error', () => {
    jest.useFakeTimers();

    setupHeartbeat(mockWs);

    jest.advanceTimersByTime(30000);
    expect(mockWs.ping).toHaveBeenCalledTimes(1);

    const errorHandler = mockWs._eventHandlers['error'];
    errorHandler(new Error('test error'));

    jest.advanceTimersByTime(60000);
    expect(mockWs.ping).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });
});

describe('sendCurrentState', () => {
  let mockWs;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWs = {
      readyState: 1,
      send: jest.fn(),
    };
    updateBotStatus({ health: 20, status: 'idle' });
  });

  test('sends state message with botStatus data', async () => {
    await sendCurrentState(mockWs);

    expect(mockWs.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(mockWs.send.mock.calls[0][0]);
    expect(sent.type).toBe('state');
    expect(sent.source).toBe('initial');
    expect(sent.data.health).toBe(20);
    expect(sent.data.status).toBe('idle');
    expect(sent.data).toHaveProperty('position');
    expect(sent.data).toHaveProperty('connectedClients');
    expect(sent.data).toHaveProperty('timestamp');
  });

  test('does not send if websocket is not open', async () => {
    mockWs.readyState = 3;
    await sendCurrentState(mockWs);
    expect(mockWs.send).not.toHaveBeenCalled();
  });

  test('includes inventory, entities, blocks when state file exists', async () => {
    const stateDir = path.join(process.cwd(), 'state');
    const statePath = path.join(stateDir, 'state.json');
    const originalData = fs.existsSync(statePath) ? fs.readFileSync(statePath, 'utf8') : null;

    const testData = {
      position: { x: 100, y: 64, z: 200 },
      health: 15,
      inventory: [{ name: 'dirt', count: 64 }],
      entities: [],
      blocks: [],
      goal: 'collect wood'
    };

    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
    fs.writeFileSync(statePath, JSON.stringify(testData));

    try {
      await sendCurrentState(mockWs);
      const sent = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sent.data.health).toBe(15);
      expect(sent.data.inventory).toEqual([{ name: 'dirt', count: 64 }]);
    } finally {
      if (originalData) {
        fs.writeFileSync(statePath, originalData);
      } else if (fs.existsSync(statePath)) {
        fs.unlinkSync(statePath);
      }
    }
  });
});