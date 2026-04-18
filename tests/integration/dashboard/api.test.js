/**
 * Integration Tests for REST API Endpoints
 *
 * Tests the 5 dashboard API endpoints: /api/status, /api/drives,
 * /api/goals, /api/memory, /api/metrics
 */

'use strict';

const http = require('http');
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

process.env.DASHBOARD_PORT = '13002';
process.env.DASHBOARD_HOST = '127.0.0.1';

const { createApp } = require('../../../src/dashboard/server');

const BASE_URL = 'http://127.0.0.1:13002';

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

describe('REST API Endpoints', () => {
  let app;
  let server;

  beforeAll((done) => {
    jest.clearAllMocks();
    app = createApp();
    server = http.createServer(app);
    server.listen(13002, '127.0.0.1', () => done());
  });

  afterAll((done) => {
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

  describe('GET /api/status', () => {
    test('returns bot status object', async () => {
      const response = await makeRequest('/api/status');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('health');
      expect(response.body).toHaveProperty('position');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('status is one of valid modes', async () => {
      const response = await makeRequest('/api/status');

      expect(response.status).toBe(200);
      const validStatuses = ['idle', 'active', 'danger', 'disconnected'];
      expect(validStatuses).toContain(response.body.status);
    });
  });

  describe('GET /api/drives', () => {
    test('returns drive scores object', async () => {
      const response = await makeRequest('/api/drives');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('survival');
      expect(response.body).toHaveProperty('curiosity');
      expect(response.body).toHaveProperty('competence');
      expect(response.body).toHaveProperty('social');
      expect(response.body).toHaveProperty('goalOriented');
    });

    test('all drive scores are numbers', async () => {
      const response = await makeRequest('/api/drives');

      expect(response.status).toBe(200);
      expect(typeof response.body.survival).toBe('number');
      expect(typeof response.body.curiosity).toBe('number');
      expect(typeof response.body.competence).toBe('number');
      expect(typeof response.body.social).toBe('number');
      expect(typeof response.body.goalOriented).toBe('number');
    });

    test('returns defaults when no drive data', async () => {
      const response = await makeRequest('/api/drives');

      expect(response.status).toBe(200);
      expect(response.body.survival).toBe(50);
      expect(response.body.curiosity).toBe(50);
    });
  });

  describe('GET /api/goals', () => {
    test('returns goals object with current and recent', async () => {
      const response = await makeRequest('/api/goals');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('current');
      expect(response.body).toHaveProperty('recent');
      expect(Array.isArray(response.body.recent)).toBe(true);
    });

    test('current can be null when no goal set', async () => {
      const response = await makeRequest('/api/goals');

      expect(response.status).toBe(200);
      expect(response.body.current === null || typeof response.body.current === 'string' || typeof response.body.current === 'object').toBe(true);
    });
  });

  describe('GET /api/memory', () => {
    test('returns memory graph stats', async () => {
      const response = await makeRequest('/api/memory');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('nodeCount');
      expect(response.body).toHaveProperty('edgeCount');
      expect(response.body).toHaveProperty('maxNodes');
      expect(response.body).toHaveProperty('memoryTiers');
    });

    test('nodeCount and edgeCount are numbers', async () => {
      const response = await makeRequest('/api/memory');

      expect(response.status).toBe(200);
      expect(typeof response.body.nodeCount).toBe('number');
      expect(typeof response.body.edgeCount).toBe('number');
    });

    test('memoryTiers has expected structure', async () => {
      const response = await makeRequest('/api/memory');

      expect(response.status).toBe(200);
      expect(response.body.memoryTiers).toHaveProperty('stm');
      expect(response.body.memoryTiers).toHaveProperty('episodic');
      expect(response.body.memoryTiers).toHaveProperty('ltm');
    });
  });

  describe('GET /api/metrics', () => {
    test('returns performance metrics object', async () => {
      const response = await makeRequest('/api/metrics');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('actionSuccessRate');
      expect(response.body).toHaveProperty('itemsPerHour');
      expect(response.body).toHaveProperty('uniqueItemsCollected');
      expect(response.body).toHaveProperty('techTreeLevel');
    });

    test('techTreeLevel is valid', async () => {
      const response = await makeRequest('/api/metrics');

      expect(response.status).toBe(200);
      const validLevels = ['wood_age', 'stone_age', 'iron_age', 'diamond_age', 'nether_age'];
      expect(validLevels).toContain(response.body.techTreeLevel);
    });

    test('itemsPerHour is a number', async () => {
      const response = await makeRequest('/api/metrics');

      expect(response.status).toBe(200);
      expect(typeof response.body.itemsPerHour).toBe('number');
    });

    test('milestones is an array', async () => {
      const response = await makeRequest('/api/metrics');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.milestones)).toBe(true);
    });
  });
});

describe('API Endpoint Error Handling', () => {
  let app;
  let server;

  beforeAll((done) => {
    jest.clearAllMocks();
    app = createApp();
    server = http.createServer(app);
    server.listen(13003, '127.0.0.1', () => done());
  });

  afterAll((done) => {
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

  function makeRequestError(path) {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:13003${path}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }).on('error', reject);
    });
  }

  test('unknown endpoint returns 404', async () => {
    const response = await makeRequestError('/api/nonexistent');

    expect(response.status).toBe(404);
  });

  test('health endpoint still works', async () => {
    const response = await makeRequestError('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  test('broadcaster/stats endpoint still works', async () => {
    const response = await makeRequestError('/api/broadcaster/stats');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('connectedClients');
    expect(response.body).toHaveProperty('broadcasterClients');
  });
});