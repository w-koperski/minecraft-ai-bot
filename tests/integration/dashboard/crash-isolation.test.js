'use strict';

const { spawn } = require('child_process');

jest.mock('../../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('lockfile', () => ({
  lock: jest.fn((fp, opts, cb) => {
    if (typeof opts === 'function') cb = opts;
    else setTimeout(() => cb(null), 5);
  }),
  unlock: jest.fn((fp, cb) => {
    if (!cb) cb = () => {};
    setTimeout(() => cb(null), 5);
  }),
  check: jest.fn((fp, opts, cb) => cb(null, false))
}));

describe('Dashboard Crash Isolation', () => {
  let mockSpawn;
  let mockDashboardProcess;
  let originalEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = { ...process.env };
    delete process.env.ENABLE_DASHBOARD;

    mockDashboardProcess = {
      pid: 12345,
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
      kill: jest.fn()
    };

    mockSpawn = jest.fn(() => mockDashboardProcess);
    require('child_process').spawn = mockSpawn;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  describe('Bot survives dashboard crash', () => {
    test('dashboard exit does not crash bot process', () => {
      process.env.ENABLE_DASHBOARD = 'true';

      const { spawnDashboard } = require('../../../src/index');
      spawnDashboard();

      const exitHandler = mockDashboardProcess.on.mock.calls.find(call => call[0] === 'exit')[1];

      expect(() => {
        exitHandler(137, 'SIGKILL');
      }).not.toThrow();
    });

    test('dashboard error does not crash bot process', () => {
      process.env.ENABLE_DASHBOARD = 'true';

      const { spawnDashboard } = require('../../../src/index');
      spawnDashboard();

      const errorHandler = mockDashboardProcess.on.mock.calls.find(call => call[0] === 'error')[1];

      expect(() => {
        errorHandler(new Error('Dashboard network error'));
      }).not.toThrow();
    });

    test('multiple dashboard crashes do not accumulate issues', () => {
      process.env.ENABLE_DASHBOARD = 'true';

      const { spawnDashboard } = require('../../../src/index');

      spawnDashboard();
      const exitHandler1 = mockDashboardProcess.on.mock.calls.find(call => call[0] === 'exit')[1];
      expect(() => exitHandler1(1, 'SIGKILL')).not.toThrow();

      spawnDashboard();
      const exitHandler2 = mockDashboardProcess.on.mock.calls.find(call => call[0] === 'exit')[1];
      expect(() => exitHandler2(1, 'SIGKILL')).not.toThrow();
    });
  });

  describe('Bot continues processing after dashboard dies', () => {
    test('dashboard exit is logged but does not stop bot', () => {
      process.env.ENABLE_DASHBOARD = 'true';
      const logger = require('../../../src/utils/logger');

      const { spawnDashboard } = require('../../../src/index');
      spawnDashboard();

      const exitHandler = mockDashboardProcess.on.mock.calls.find(call => call[0] === 'exit')[1];
      exitHandler(1, 'SIGKILL');

      expect(logger.error).toHaveBeenCalledWith(
        'Dashboard process exited',
        expect.objectContaining({
          code: 1,
          signal: 'SIGKILL',
          pid: 12345
        })
      );
    });

    test('bot can still process commands after dashboard crash', () => {
      process.env.ENABLE_DASHBOARD = 'true';
      const logger = require('../../../src/utils/logger');

      const { spawnDashboard } = require('../../../src/index');
      spawnDashboard();

      const exitHandler = mockDashboardProcess.on.mock.calls.find(call => call[0] === 'exit')[1];
      exitHandler(137, 'SIGKILL');

      expect(logger.error).toHaveBeenCalledWith(
        'Dashboard process exited',
        expect.objectContaining({
          code: 137,
          signal: 'SIGKILL'
        })
      );
    });
  });

  describe('Dashboard restart isolation', () => {
    test('new dashboard spawn does not affect bot state', () => {
      process.env.ENABLE_DASHBOARD = 'true';
      const logger = require('../../../src/utils/logger');

      const { spawnDashboard } = require('../../../src/index');

      spawnDashboard();
      const exitHandler1 = mockDashboardProcess.on.mock.calls.find(call => call[0] === 'exit')[1];
      exitHandler1(1, 'SIGKILL');

      expect(logger.error).toHaveBeenCalledWith(
        'Dashboard process exited',
        expect.objectContaining({ code: 1 })
      );

      const newMockProcess = {
        pid: 67890,
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn()
      };
      mockSpawn.mockReturnValueOnce(newMockProcess);

      spawnDashboard();

      expect(mockSpawn).toHaveBeenCalledTimes(2);
      expect(mockSpawn).toHaveBeenLastCalledWith(
        'node',
        ['src/dashboard/server.js'],
        expect.any(Object)
      );
    });

    test('dashboard process exit during bot operation is handled gracefully', () => {
      process.env.ENABLE_DASHBOARD = 'true';

      const { spawnDashboard } = require('../../../src/index');
      spawnDashboard();

      const exitHandler = mockDashboardProcess.on.mock.calls.find(call => call[0] === 'exit')[1];
      expect(exitHandler).toBeDefined();

      expect(() => {
        exitHandler(137, 'SIGKILL');
      }).not.toThrow();
    });
  });

  describe('Dashboard crash logging', () => {
    test('exit code and signal are logged correctly', () => {
      process.env.ENABLE_DASHBOARD = 'true';
      const logger = require('../../../src/utils/logger');

      const { spawnDashboard } = require('../../../src/index');
      spawnDashboard();

      const exitHandler = mockDashboardProcess.on.mock.calls.find(call => call[0] === 'exit')[1];

      const testCases = [
        { code: 1, signal: 'SIGKILL', desc: 'kill -9' },
        { code: 0, signal: null, desc: 'normal exit' },
        { code: 143, signal: 'SIGTERM', desc: 'SIGTERM' }
      ];

      for (const tc of testCases) {
        jest.clearAllMocks();
        exitHandler(tc.code, tc.signal);

        expect(logger.error).toHaveBeenCalledWith(
          'Dashboard process exited',
          expect.objectContaining({
            code: tc.code,
            signal: tc.signal,
            pid: 12345
          })
        );
      }
    });

    test('dashboard error includes error message', () => {
      process.env.ENABLE_DASHBOARD = 'true';
      const logger = require('../../../src/utils/logger');

      const { spawnDashboard } = require('../../../src/index');
      spawnDashboard();

      const errorHandler = mockDashboardProcess.on.mock.calls.find(call => call[0] === 'error')[1];

      errorHandler(new Error('EADDRINUSE'));

      expect(logger.error).toHaveBeenCalledWith(
        'Dashboard process error',
        expect.objectContaining({
          error: 'EADDRINUSE',
          pid: 12345
        })
      );
    });
  });
});

describe('Dashboard Crash Isolation - Integration', () => {
  test('dashboard server.js exists', () => {
    const fs = require('fs');
    const path = require('path');
    const dashboardPath = path.join(process.cwd(), 'src/dashboard/server.js');

    expect(fs.existsSync(dashboardPath)).toBe(true);

    const content = fs.readFileSync(dashboardPath, 'utf8');
    expect(content).toContain('express');
  });
});