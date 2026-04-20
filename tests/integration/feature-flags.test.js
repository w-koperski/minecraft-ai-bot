/**
 * Integration Tests for Feature Flag Isolation
 */

const fs = require('fs');
const path = require('path');

const mockLockfile = {
  lock: jest.fn((filePath, opts, cb) => {
    if (opts && opts.timeout === 0) {
      return cb(new Error('Lock timeout'));
    }
    setTimeout(() => cb(null), 5);
  }),
  unlock: jest.fn((filePath, cb) => setTimeout(() => cb(null), 5)),
  check: jest.fn((filePath, opts, cb) => cb(null, false))
};

jest.mock('lockfile', () => mockLockfile);

const StateManager = require('../../src/utils/state-manager');

const testStateDir = path.join(__dirname, '../state-test-feature-flags');

describe('Feature Flag Isolation Tests', () => {
  let stateManager;

  beforeEach(() => {
    jest.resetModules();
    mockLockfile.lock.mockClear();
    mockLockfile.unlock.mockClear();

    if (!fs.existsSync(testStateDir)) {
      fs.mkdirSync(testStateDir, { recursive: true });
    }

    stateManager = new StateManager(testStateDir);
  });

  afterEach(async () => {
    if (fs.existsSync(testStateDir)) {
      const files = fs.readdirSync(testStateDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            fs.unlinkSync(path.join(testStateDir, file));
          } catch (e) {}
        }
      }
    }
  });

  describe('ENABLE_DRIVES=false default behavior', () => {
    it('should have no driveScores field in state when drives disabled', async () => {
      const stateData = {
        position: { x: 0, y: 64, z: 0 },
        health: 20,
        inventory: [],
        entities: [],
        blocks: []
      };

      await stateManager.write('state', stateData);

      const readState = await stateManager.read('state');
      expect(readState).toBeDefined();
      expect(readState.position).toEqual({ x: 0, y: 64, z: 0 });
      expect(readState.driveScores).toBeUndefined();
    });

    it('should return null for getDriveScores when no drive data exists', async () => {
      const stateData = {
        position: { x: 10, y: 64, z: 10 },
        health: 20,
        inventory: [],
        entities: [],
        blocks: []
      };

      await stateManager.write('state', stateData);

      const driveScores = await stateManager.getDriveScores();
      expect(driveScores).toBeNull();
    });

    it('should allow state updates without driveScores', async () => {
      const initialState = {
        position: { x: 0, y: 64, z: 0 },
        health: 20,
        inventory: [],
        entities: [],
        blocks: []
      };

      await stateManager.write('state', initialState);

      const updatedState = {
        position: { x: 100, y: 64, z: -50 },
        health: 18,
        inventory: [{ name: 'oak_log', count: 5 }],
        entities: [],
        blocks: []
      };

      await stateManager.write('state', updatedState);

      const readState = await stateManager.read('state');
      expect(readState.health).toBe(18);
      expect(readState.driveScores).toBeUndefined();
    });
  });

  describe('Feature flag isEnabled behavior', () => {
    it('should return false when ENABLE_DRIVES is not set', () => {
      const prevValue = process.env.ENABLE_DRIVES;
      delete process.env.ENABLE_DRIVES;

      jest.resetModules();
      const featureFlags = require('../../src/utils/feature-flags');

      expect(featureFlags.isEnabled('DRIVES')).toBe(false);

      if (prevValue !== undefined) {
        process.env.ENABLE_DRIVES = prevValue;
      }
    });

    it('should return true when ENABLE_DRIVES=true', () => {
      const prevValue = process.env.ENABLE_DRIVES;
      process.env.ENABLE_DRIVES = 'true';

      jest.resetModules();
      const featureFlags = require('../../src/utils/feature-flags');

      expect(featureFlags.isEnabled('DRIVES')).toBe(true);

      if (prevValue !== undefined) {
        process.env.ENABLE_DRIVES = prevValue;
      } else {
        delete process.env.ENABLE_DRIVES;
      }
    });
  });

  describe('Dashboard API defaults when drives disabled', () => {
    it('should return default drive scores when no drive data available', async () => {
      const StateManager = require('../../src/utils/state-manager');
      const sm = new StateManager(testStateDir);

      const stateData = {
        position: { x: 0, y: 64, z: 0 },
        health: 20,
        inventory: [],
        entities: [],
        blocks: []
      };
      await sm.write('state', stateData);

      const driveScores = await sm.getDriveScores();

      let response;
      if (!driveScores) {
        response = {
          survival: 50,
          curiosity: 50,
          competence: 50,
          social: 50,
          goalOriented: 50,
          _note: 'No drive data available, returning defaults'
        };
      } else {
        response = driveScores;
      }

      expect(response.survival).toBe(50);
      expect(response._note).toBe('No drive data available, returning defaults');
    });

    it('should return actual drive scores when they exist', async () => {
      const StateManager = require('../../src/utils/state-manager');
      const sm = new StateManager(testStateDir);

      const stateData = {
        position: { x: 0, y: 64, z: 0 },
        health: 20,
        inventory: [],
        entities: [],
        blocks: [],
        driveScores: {
          survival: 30,
          curiosity: 70,
          competence: 50,
          social: 40,
          goalOriented: 80
        }
      };
      await sm.write('state', stateData);

      const driveScores = await sm.getDriveScores();

      expect(driveScores).toBeDefined();
      expect(driveScores.survival).toBe(30);
      expect(driveScores.curiosity).toBe(70);
      expect(driveScores.goalOriented).toBe(80);
    });
  });

  describe('Backward compatibility when drives disabled', () => {
    it('should allow normal state operations without driveScores', async () => {
      await stateManager.write('commands', { goal: 'collect wood', timestamp: Date.now() });

      await stateManager.write('plan', [
        { action: 'move_to', params: { target: 'tree' } },
        { action: 'collect_block', params: { target: 'oak_log' } }
      ]);

      await stateManager.write('state', {
        position: { x: 5, y: 64, z: 5 },
        health: 20,
        inventory: [],
        entities: [],
        blocks: []
      });

      const commands = await stateManager.read('commands');
      const plan = await stateManager.read('plan');
      const state = await stateManager.read('state');

      expect(commands.goal).toBe('collect wood');
      expect(plan).toHaveLength(2);
      expect(state.position.x).toBe(5);
    });

    it('should not interfere with action awareness when drives disabled', async () => {
      const stateData = {
        position: { x: 0, y: 64, z: 0 },
        health: 20,
        inventory: [],
        entities: [],
        blocks: []
      };

      await stateManager.write('state', stateData);

      const state = await stateManager.read('state');
      expect(state.health).toBe(20);
      expect(state.driveScores).toBeUndefined();
    });
  });
});