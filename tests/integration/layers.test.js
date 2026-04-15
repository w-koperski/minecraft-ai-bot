/**
 * Integration Tests for Layer Communication
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
const RateLimiter = require('../../src/utils/rate-limiter');
const { createMockOmniroute } = require('../mocks/mock-omniroute');

const testStateDir = path.join(__dirname, '../state-test-integration');

describe('Layer Integration Tests', () => {
  let stateManager;
  let mockOmniroute;
  let rateLimiter;

  beforeEach(() => {
    jest.resetModules();
    mockLockfile.lock.mockClear();
    mockLockfile.unlock.mockClear();

    if (!fs.existsSync(testStateDir)) {
      fs.mkdirSync(testStateDir, { recursive: true });
    }

    stateManager = new StateManager(testStateDir);
    mockOmniroute = createMockOmniroute();
    rateLimiter = new RateLimiter({
      reservoir: 100,
      reservoirRefreshInterval: 60000,
      maxConcurrent: 5,
      minTime: 50
    });
  });

  afterEach(async () => {
    if (rateLimiter) {
      try {
        await rateLimiter.stop();
      } catch (e) {}
    }

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

    mockOmniroute.reset();
  });

  describe('StateManager + RateLimiter + Omniroute Integration', () => {
    it('should write state and make rate-limited API call', async () => {
      const testState = {
        position: { x: 100, y: 64, z: -200 },
        health: 20,
        inventory: [{ name: 'oak_log', count: 10 }],
        entities: [],
        blocks: []
      };

      await stateManager.write('state', testState);

      const readState = await stateManager.read('state');
      expect(readState).toEqual(testState);

      const result = await rateLimiter.schedule(async () => {
        return mockOmniroute.pilot('test prompt');
      });

      expect(result).toBeDefined();
      expect(result.model).toBe('mock-pilot');
      expect(mockOmniroute.callCount.pilot).toBe(1);
    });

    it('should handle multiple concurrent state writes with API calls', async () => {
      const writes = [];
      const apiCalls = [];

      for (let i = 0; i < 5; i++) {
        const state = {
          position: { x: i * 10, y: 64, z: 0 },
          health: 20,
          inventory: [],
          entities: [],
          blocks: []
        };
        writes.push(stateManager.write('state', state));
      }

      for (let i = 0; i < 5; i++) {
        apiCalls.push(
          rateLimiter.schedule(async () => {
            return mockOmniroute.pilot(`prompt ${i}`);
          })
        );
      }

      await Promise.all(writes);
      const results = await Promise.all(apiCalls);

      expect(results).toHaveLength(5);
      expect(mockOmniroute.callCount.pilot).toBe(5);
    });

    it('should read state and call Strategy layer API', async () => {
      await stateManager.write('commands', { goal: 'collect 10 oak logs', timestamp: Date.now() });

      const state = {
        position: { x: 0, y: 64, z: 0 },
        health: 20,
        inventory: [],
        entities: [],
        blocks: [{ name: 'oak_log', distance: 5 }]
      };
      await stateManager.write('state', state);

      const commands = await stateManager.read('commands');
      expect(commands.goal).toBe('collect 10 oak logs');

      const result = await rateLimiter.schedule(async () => {
        return mockOmniroute.strategy([
          { role: 'system', content: 'You are Strategy' },
          { role: 'user', content: `Goal: ${commands.goal}` }
        ]);
      });

      expect(result).toBeDefined();
      expect(result.model).toBe('mock-strategy');
      expect(mockOmniroute.callCount.strategy).toBe(1);
    });

    it('should enforce rate limits on API calls', async () => {
      const limitedLimiter = new RateLimiter({
        reservoir: 3,
        reservoirRefreshInterval: 1000,
        maxConcurrent: 2,
        minTime: 100
      });

      const startTime = Date.now();
      const calls = [];

      for (let i = 0; i < 5; i++) {
        calls.push(
          limitedLimiter.schedule(async () => {
            return mockOmniroute.pilot(`call ${i}`);
          })
        );
      }

      await Promise.all(calls);
      const duration = Date.now() - startTime;

      expect(mockOmniroute.callCount.pilot).toBe(5);

      await limitedLimiter.stop();
    });
  });

  describe('Layer File Communication (commands.json -> plan.json)', () => {
    it('should flow commands from Commander to Strategy to Pilot', async () => {
      await stateManager.write('commands', {
        goal: 'collect 64 oak logs',
        timestamp: Date.now(),
        source: 'commander'
      });

      const commands = await stateManager.read('commands');
      expect(commands.goal).toBe('collect 64 oak logs');

      const plan = [
        { action: 'move_to', params: { target: 'oak_log' }, description: 'Find oak tree' },
        { action: 'collect_block', params: { target: 'oak_log', count: 10 }, description: 'Collect oak logs' },
        { action: 'wait', params: { duration: 1000 }, description: 'Verify collection' }
      ];
      await stateManager.write('plan', plan);

      const readPlan = await stateManager.read('plan');
      expect(readPlan).toHaveLength(3);
      expect(readPlan[0].action).toBe('move_to');
    });

    it('should handle action_error flow from Pilot back to Strategy', async () => {
      await stateManager.write('plan', [
        { action: 'collect_block', params: { target: 'oak_log' } }
      ]);

      const actionError = {
        action: { action: 'collect_block', params: { target: 'oak_log' } },
        expected: { blockRemoved: true },
        actual: { blockRemoved: false, reason: 'out_of_reach' },
        timestamp: Date.now(),
        severity: 'high'
      };
      await stateManager.write('action_error', actionError);

      const error = await stateManager.read('action_error');
      expect(error).toBeDefined();
      expect(error.severity).toBe('high');

      await stateManager.delete('action_error');

      const clearedError = await stateManager.read('action_error');
      expect(clearedError).toBeNull();
    });

    it('should handle Commander corrections to Strategy', async () => {
      await stateManager.write('plan', [
        { action: 'collect_block', params: { target: 'diamond_ore' } }
      ]);

      await stateManager.write('commands', {
        goal: null,
        correction: 'Diamond is too deep. Collect iron instead.',
        timestamp: Date.now(),
        source: 'commander'
      });

      const commands = await stateManager.read('commands');
      expect(commands.correction).toBe('Diamond is too deep. Collect iron instead.');

      await stateManager.write('plan', []);

      const plan = await stateManager.read('plan');
      expect(plan).toEqual([]);
    });

    it('should track state changes through the full flow', async () => {
      const initialState = {
        position: { x: 0, y: 64, z: 0 },
        health: 20,
        inventory: [],
        entities: [],
        blocks: []
      };
      await stateManager.write('state', initialState);

      await stateManager.write('commands', { goal: 'survive', priority: 'high' });

      await stateManager.write('plan', [
        { action: 'move_to', params: { target: 'safe_area' } },
        { action: 'wait', params: { duration: 5000 } }
      ]);

      const updatedState = {
        position: { x: 10, y: 64, z: 0 },
        health: 20,
        inventory: [],
        entities: [],
        blocks: []
      };
      await stateManager.write('state', updatedState);

      const finalState = await stateManager.read('state');
      const finalCommands = await stateManager.read('commands');
      const finalPlan = await stateManager.read('plan');

      expect(finalState.position.x).toBe(10);
      expect(finalCommands.goal).toBe('survive');
      expect(finalPlan).toHaveLength(2);
    });
  });

  describe('Emergency Stop Flow', () => {
    it('should propagate emergency stop from Commander through all layers', async () => {
      await stateManager.write('commands', { goal: 'build house' });
      await stateManager.write('plan', [
        { action: 'collect_block', params: { target: 'oak_log', count: 64 } }
      ]);

      await stateManager.write('commands', {
        goal: null,
        emergency_stop: true,
        reason: 'Bot in danger',
        timestamp: Date.now(),
        source: 'commander'
      });

      const commands = await stateManager.read('commands');
      expect(commands.emergency_stop).toBe(true);

      await stateManager.write('plan', []);

      const plan = await stateManager.read('plan');
      expect(plan).toEqual([]);
    });
  });

  describe('Full Layer API Integration', () => {
    it('should call all three layer APIs through rate limiter', async () => {
      const pilotResult = await rateLimiter.schedule(async () => {
        return mockOmniroute.pilot('Threat: zombie nearby');
      });
      expect(pilotResult.model).toBe('mock-pilot');

      const strategyResult = await rateLimiter.schedule(async () => {
        return mockOmniroute.strategy([
          { role: 'system', content: 'Plan' },
          { role: 'user', content: 'Collect wood' }
        ]);
      });
      expect(strategyResult.model).toBe('mock-strategy');

      const commanderResult = await rateLimiter.schedule(async () => {
        return mockOmniroute.commander([
          { role: 'system', content: 'Monitor' },
          { role: 'user', content: 'Bot stuck' }
        ]);
      });
      expect(commanderResult.model).toBe('mock-commander');

      expect(mockOmniroute.callCount.pilot).toBe(1);
      expect(mockOmniroute.callCount.strategy).toBe(1);
      expect(mockOmniroute.callCount.commander).toBe(1);
    });

    it('should handle API delays with rate limiter', async () => {
      mockOmniroute.setDelay(100);

      const startTime = Date.now();

      await rateLimiter.schedule(async () => {
        return mockOmniroute.pilot('delayed prompt');
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Concurrent Layer Operations', () => {
    it('should handle concurrent reads from multiple layers', async () => {
      const sharedState = {
        position: { x: 50, y: 64, z: 50 },
        health: 15,
        inventory: [{ name: 'oak_log', count: 32 }],
        entities: [{ name: 'zombie', type: 'hostile', distance: 10 }],
        blocks: []
      };
      await stateManager.write('state', sharedState);

      const reads = [
        stateManager.read('state'),
        stateManager.read('state'),
        stateManager.read('state')
      ];

      const results = await Promise.all(reads);

      results.forEach(result => {
        expect(result).toEqual(sharedState);
      });
    });

    it('should handle concurrent writes to different keys', async () => {
      const writes = [
        stateManager.write('state', {
          position: { x: 0, y: 64, z: 0 },
          health: 20,
          inventory: [],
          entities: [],
          blocks: []
        }),
        stateManager.write('plan', [{ action: 'test' }]),
        stateManager.write('commands', { goal: 'test' })
      ];

      await Promise.all(writes);

      const state = await stateManager.read('state');
      const plan = await stateManager.read('plan');
      const commands = await stateManager.read('commands');

      expect(state).toBeDefined();
      expect(plan).toHaveLength(1);
      expect(commands.goal).toBe('test');
    });
  });
});
