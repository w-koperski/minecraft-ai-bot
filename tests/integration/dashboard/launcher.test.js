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

describe('Dashboard Launcher', () => {
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

  describe('spawnDashboard', () => {
    test('does not spawn dashboard when ENABLE_DASHBOARD is not true', () => {
      const { spawnDashboard } = require('../../../src/index');

      spawnDashboard();

      expect(mockSpawn).not.toHaveBeenCalled();
    });

    test('spawns dashboard process when ENABLE_DASHBOARD=true', () => {
      process.env.ENABLE_DASHBOARD = 'true';

      const { spawnDashboard } = require('../../../src/index');

      spawnDashboard();

      expect(mockSpawn).toHaveBeenCalledWith(
        'node',
        ['src/dashboard/server.js'],
        expect.objectContaining({
          cwd: process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: false
        })
      );
    });

    test('logs dashboard process spawn with pid', () => {
      process.env.ENABLE_DASHBOARD = 'true';
      const logger = require('../../../src/utils/logger');

      const { spawnDashboard } = require('../../../src/index');

      spawnDashboard();

      expect(logger.info).toHaveBeenCalledWith(
        'Dashboard process spawned',
        { pid: 12345 }
      );
    });

    test('sets up stdout listener for dashboard logs', () => {
      process.env.ENABLE_DASHBOARD = 'true';

      const { spawnDashboard } = require('../../../src/index');

      spawnDashboard();

      expect(mockDashboardProcess.stdout.on).toHaveBeenCalledWith('data', expect.any(Function));
    });

    test('sets up stderr listener for dashboard errors', () => {
      process.env.ENABLE_DASHBOARD = 'true';

      const { spawnDashboard } = require('../../../src/index');

      spawnDashboard();

      expect(mockDashboardProcess.stderr.on).toHaveBeenCalledWith('data', expect.any(Function));
    });

    test('handles dashboard exit event without crashing', () => {
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

    test('handles dashboard error event without crashing', () => {
      process.env.ENABLE_DASHBOARD = 'true';
      const logger = require('../../../src/utils/logger');

      const { spawnDashboard } = require('../../../src/index');

      spawnDashboard();

      const errorHandler = mockDashboardProcess.on.mock.calls.find(call => call[0] === 'error')[1];

      errorHandler(new Error('spawn failed'));

      expect(logger.error).toHaveBeenCalledWith(
        'Dashboard process error',
        expect.objectContaining({
          error: 'spawn failed',
          pid: 12345
        })
      );
    });
  });

  describe('Dashboard process lifecycle', () => {
    test('dashboardProcess exit sets it to null', () => {
      process.env.ENABLE_DASHBOARD = 'true';

      const { spawnDashboard } = require('../../../src/index');

      spawnDashboard();

      expect(mockDashboardProcess.on).toHaveBeenCalledWith('exit', expect.any(Function));
    });
  });
});

describe('Dashboard npm script', () => {
  test('dashboard script exists in package.json', () => {
    const fs = require('fs');
    const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

    expect(packageJson.scripts).toHaveProperty('dashboard');
    expect(packageJson.scripts.dashboard).toBe('node src/dashboard/server.js');
  });
});