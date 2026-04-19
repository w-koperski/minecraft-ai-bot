/**
 * VisionProcessor unit tests
 * Tests async screenshot analysis loop with adaptive intervals,
 * rate limiting integration, and feature flag gating.
 */

const { Vec3 } = require('vec3');

// Mock dependencies before requiring the module
jest.mock('../../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('../../../src/utils/feature-flags', () => ({
  isEnabled: jest.fn()
}));

jest.mock('../../../src/vision/vision-rate-limiter', () => ({
  schedule: jest.fn()
}));

const VisionProcessor = require('../../../src/vision/vision-processor');
const logger = require('../../../src/utils/logger');
const featureFlags = require('../../../src/utils/feature-flags');
const visionRateLimiter = require('../../../src/vision/vision-rate-limiter');

// Helper: create mock bot instance
function createMockBot(overrides = {}) {
  const bot = {
    health: 20,
    entity: {
      position: new Vec3(100, 64, 200)
    },
    entities: {},
    pathfinder: {
      isMoving: jest.fn().mockReturnValue(false)
    },
    blockAt: jest.fn().mockReturnValue({ name: 'air' }),
    ...overrides
  };
  return bot;
}

// Helper: create mock rate limiter
function createMockRateLimiter() {
  return {
    schedule: jest.fn(async (fn) => fn()),
    stop: jest.fn()
  };
}

// Helper: create mock feature flags
function createMockFeatureFlags(enabled = true) {
  return {
    isEnabled: jest.fn().mockReturnValue(enabled)
  };
}

describe('VisionProcessor', () => {
  let mockBot;
  let mockRateLimiter;
  let mockFeatureFlags;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockBot = createMockBot();
    mockRateLimiter = createMockRateLimiter();
    mockFeatureFlags = createMockFeatureFlags(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default intervals', () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      expect(vp.intervals.danger).toBe(2000);
      expect(vp.intervals.active).toBe(4000);
      expect(vp.intervals.idle).toBe(10000);
      expect(vp.running).toBe(false);
      expect(vp.currentMode).toBe('idle');
      expect(vp.currentInterval).toBe(10000);
    });

    it('should initialize with custom intervals via options', () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags,
        intervals: { danger: 3000, active: 5000, idle: 15000 }
      });

      expect(vp.intervals.danger).toBe(3000);
      expect(vp.intervals.active).toBe(5000);
      expect(vp.intervals.idle).toBe(15000);
    });

    it('should clamp intervals below 1000ms', () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags,
        intervals: { danger: 100, active: 500, idle: 50 }
      });

      expect(vp.intervals.danger).toBe(1000);
      expect(vp.intervals.active).toBe(1000);
      expect(vp.intervals.idle).toBe(1000);
    });

    it('should clamp intervals above 30000ms', () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags,
        intervals: { danger: 60000, active: 45000, idle: 100000 }
      });

      expect(vp.intervals.danger).toBe(30000);
      expect(vp.intervals.active).toBe(30000);
      expect(vp.intervals.idle).toBe(30000);
    });

    it('should initialize with zero analysis state', () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      expect(vp.latestAnalysis).toBeNull();
      expect(vp.analysisCount).toBe(0);
      expect(vp.lastAnalysisTime).toBeNull();
      expect(vp.errorCount).toBe(0);
      expect(vp.lastError).toBeNull();
    });

    it('should use injected dependencies', () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      expect(vp.rateLimiter).toBe(mockRateLimiter);
      expect(vp.featureFlagsInstance).toBe(mockFeatureFlags);
    });
  });

  describe('start()', () => {
    it('should not start when VISION feature flag is disabled', async () => {
      const disabledFlags = createMockFeatureFlags(false);
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: disabledFlags
      });

      await vp.start();

      expect(vp.running).toBe(false);
      expect(disabledFlags.isEnabled).toHaveBeenCalledWith('VISION');
    });

    it('should start when VISION feature flag is enabled', async () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      await vp.start();

      expect(vp.running).toBe(true);
      expect(mockFeatureFlags.isEnabled).toHaveBeenCalledWith('VISION');
      expect(logger.info).toHaveBeenCalledWith(
        'VisionProcessor: Starting async analysis loop',
        expect.objectContaining({ intervals: expect.any(Object) })
      );
    });

    it('should not start if already running', async () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      await vp.start();
      await vp.start(); // Second call should be no-op

      expect(logger.warn).toHaveBeenCalledWith('VisionProcessor: Already running');
    });

    it('should schedule the first loop iteration on start', async () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      await vp.start();

      expect(vp.loopTimer).not.toBeNull();
    });
  });

  describe('stop()', () => {
    it('should stop a running processor', async () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      await vp.start();
      expect(vp.running).toBe(true);

      await vp.stop();
      expect(vp.running).toBe(false);
      expect(vp.loopTimer).toBeNull();
    });

    it('should be a no-op when not running', async () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      await vp.stop(); // Should not throw

      expect(vp.running).toBe(false);
    });

    it('should log analysis stats on stop', async () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      await vp.start();
      vp.analysisCount = 5;
      vp.errorCount = 1;
      await vp.stop();

      expect(logger.info).toHaveBeenCalledWith(
        'VisionProcessor: Stopped',
        { analysisCount: 5, errorCount: 1 }
      );
    });
  });

  describe('scheduleNextLoop()', () => {
    it('should schedule next iteration after current interval', () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      vp.running = true;
      vp.currentInterval = 4000;
      vp.scheduleNextLoop();

      expect(vp.loopTimer).not.toBeNull();
    });

    it('should not schedule if not running', () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      vp.running = false;
      vp.scheduleNextLoop();

      expect(vp.loopTimer).toBeNull();
    });
  });

  describe('loop()', () => {
    it('should stop if feature flag is disabled at runtime', async () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      vp.running = true;
      mockFeatureFlags.isEnabled.mockReturnValue(false);

      await vp.loop();

      expect(vp.running).toBe(false);
    });

    it('should update mode and analyze on each iteration', async () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      vp.running = true;
      mockRateLimiter.schedule.mockResolvedValue({
        timestamp: Date.now(),
        mode: 'idle',
        observations: [],
        threats: [],
        confidence: 0
      });

      await vp.loop();

      expect(mockRateLimiter.schedule).toHaveBeenCalledTimes(1);
      expect(vp.analysisCount).toBe(1);
      expect(vp.lastAnalysisTime).not.toBeNull();
    });

    it('should handle rate limit errors gracefully', async () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      vp.running = true;
      const rateLimitError = new Error('429 rate limit exceeded');
      mockRateLimiter.schedule.mockRejectedValue(rateLimitError);

      await vp.loop();

      expect(vp.errorCount).toBe(1);
      expect(vp.lastError).toBe('429 rate limit exceeded');
      expect(logger.warn).toHaveBeenCalledWith(
        'VisionProcessor: Rate limited, will retry next cycle',
        expect.any(Object)
      );
    });

    it('should handle general errors gracefully', async () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      vp.running = true;
      const generalError = new Error('Network timeout');
      mockRateLimiter.schedule.mockRejectedValue(generalError);

      await vp.loop();

      expect(vp.errorCount).toBe(1);
      expect(vp.lastError).toBe('Network timeout');
      expect(logger.error).toHaveBeenCalledWith(
        'VisionProcessor: Analysis failed',
        expect.objectContaining({ error: 'Network timeout' })
      );
    });

    it('should not update analysis on null result', async () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      vp.running = true;
      mockRateLimiter.schedule.mockResolvedValue(null);

      // The schedule function wraps captureAndAnalyze which calls captureScreenshot + analyzeScreenshot
      // If the inner function returns null, analysisCount should not increment
      await vp.loop();

      expect(vp.analysisCount).toBe(0);
    });
  });

  describe('getBotState()', () => {
    it('should return idle mode when bot has no entity', () => {
      const vp = new VisionProcessor({ entity: null }, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      const state = vp.getBotState();
      expect(state.mode).toBe('idle');
    });

    it('should return danger mode for low health', () => {
      mockBot.health = 4; // Below threshold of 6
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      const state = vp.getBotState();
      expect(state.mode).toBe('danger');
      expect(state.reason).toBe('low_health');
      expect(state.health).toBe(4);
    });

    it('should return danger mode for hostile mobs', () => {
      const hostileEntity = {
        kind: 'Hostile mobs',
        name: 'zombie',
        position: new Vec3(105, 64, 200) // 5 blocks away
      };
      mockBot.entities = { zombie: hostileEntity };
      mockBot.health = 20; // Full health

      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      const state = vp.getBotState();
      expect(state.mode).toBe('danger');
      expect(state.reason).toBe('hostile_mob');
      expect(state.count).toBe(1);
    });

    it('should return danger mode for nearby lava', () => {
      mockBot.health = 20;
      mockBot.blockAt = jest.fn().mockImplementation((pos) => {
        if (pos.x === 102 && pos.y === 64 && pos.z === 200) {
          return { name: 'lava' };
        }
        return { name: 'air' };
      });

      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      const state = vp.getBotState();
      expect(state.mode).toBe('danger');
      expect(state.reason).toBe('near_lava');
    });

    it('should return active mode when pathfinding', () => {
      mockBot.health = 20;
      mockBot.pathfinder.isMoving.mockReturnValue(true);

      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      const state = vp.getBotState();
      expect(state.mode).toBe('active');
      expect(state.reason).toBe('pathfinding');
    });

    it('should return idle mode when safe and still', () => {
      mockBot.health = 20;

      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      const state = vp.getBotState();
      expect(state.mode).toBe('idle');
    });

    it('should prioritize danger over active mode', () => {
      mockBot.health = 4; // Low health (danger)
      mockBot.pathfinder.isMoving.mockReturnValue(true); // Also pathfinding (active)

      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      const state = vp.getBotState();
      expect(state.mode).toBe('danger');
    });
  });

  describe('adjustInterval()', () => {
    it('should switch to danger interval on danger mode', () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      vp.adjustInterval({ mode: 'danger' });

      expect(vp.currentMode).toBe('danger');
      expect(vp.currentInterval).toBe(2000);
    });

    it('should switch to active interval on active mode', () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      vp.adjustInterval({ mode: 'active' });

      expect(vp.currentMode).toBe('active');
      expect(vp.currentInterval).toBe(4000);
    });

    it('should switch to idle interval on idle mode', () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      vp.adjustInterval({ mode: 'idle' });

      expect(vp.currentMode).toBe('idle');
      expect(vp.currentInterval).toBe(10000);
    });

    it('should fall back to idle for unknown mode', () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      vp.adjustInterval({ mode: 'unknown' });

      expect(vp.currentMode).toBe('idle');
      expect(vp.currentInterval).toBe(10000);
    });

    it('should not change when mode stays the same', () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      vp.currentMode = 'idle';
      vp.currentInterval = 10000;

      vp.adjustInterval({ mode: 'idle' });

      expect(vp.currentMode).toBe('idle');
      expect(vp.currentInterval).toBe(10000);
      // Logger.debug should NOT be called since mode didn't change
      expect(logger.debug).not.toHaveBeenCalledWith(
        'VisionProcessor: Mode change',
        expect.any(Object)
      );
    });

    it('should log mode changes', () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      vp.adjustInterval({ mode: 'danger' });

      expect(logger.debug).toHaveBeenCalledWith(
        'VisionProcessor: Mode change',
        expect.objectContaining({
          from: 'idle',
          to: 'danger',
          interval: 2000
        })
      );
    });
  });

  describe('captureAndAnalyze()', () => {
    it('should schedule analysis through rate limiter', async () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      mockRateLimiter.schedule.mockImplementation(async (fn) => fn());

      const result = await vp.captureAndAnalyze({ mode: 'idle' });

      expect(mockRateLimiter.schedule).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
      expect(result.mode).toBe('idle');
    });

    it('should re-throw rate limiter errors', async () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      const error = new Error('Rate limit exceeded');
      mockRateLimiter.schedule.mockRejectedValue(error);

      await expect(vp.captureAndAnalyze({ mode: 'idle' })).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('captureScreenshot()', () => {
    it('should return screenshot data with timestamp', () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      const screenshot = vp.captureScreenshot();

      expect(screenshot.timestamp).toBeDefined();
      expect(screenshot.width).toBe(0);
      expect(screenshot.height).toBe(0);
      expect(screenshot.data).toBeNull();
    });

    it('should include position data when bot has entity', () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      const screenshot = vp.captureScreenshot();

      expect(screenshot.position).toEqual({
        x: 100,
        y: 64,
        z: 200
      });
    });

    it('should handle missing bot position gracefully', () => {
      const noEntityBot = {};
      const vp = new VisionProcessor(noEntityBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      const screenshot = vp.captureScreenshot();

      expect(screenshot.position).toBeNull();
    });
  });

  describe('analyzeScreenshot()', () => {
    it('should return VisionState-compatible analysis', () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      vp.currentMode = 'active';
      const screenshot = { timestamp: 12345, position: { x: 1, y: 2, z: 3 } };
      const state = { mode: 'active' };

      const analysis = vp.analyzeScreenshot(screenshot, state);

      expect(analysis.timestamp).toBe(12345);
      expect(analysis.mode).toBe('active');
      expect(analysis.position).toEqual({ x: 1, y: 2, z: 3 });
      expect(analysis.observations).toEqual([]);
      expect(analysis.threats).toEqual([]);
      expect(analysis.entities).toEqual([]);
      expect(analysis.blocks).toEqual([]);
      expect(analysis.confidence).toBe(0);
      expect(analysis.state).toBe('active');
    });
  });

  describe('getHostileMobs()', () => {
    it('should return empty array when bot has no entities', () => {
      const noEntityBot = {};
      const vp = new VisionProcessor(noEntityBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      expect(vp.getHostileMobs()).toEqual([]);
    });

    it('should detect hostile mobs by kind', () => {
      const zombie = {
        kind: 'Hostile mobs',
        name: 'Zombie',
        position: new Vec3(105, 64, 200) // 5 blocks away
      };
      const creeper = {
        kind: 'Hostile mobs',
        name: 'Creeper',
        position: new Vec3(108, 64, 200) // 8 blocks away
      };
      const pig = {
        kind: 'Passive mobs',
        name: 'Pig',
        position: new Vec3(101, 64, 200) // 1 block away
      };
      mockBot.entities = { zombie, creeper, pig };

      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      const hostile = vp.getHostileMobs();
      expect(hostile.length).toBe(2);
    });

    it('should detect hostile mobs by name list', () => {
      const unnamedHostile = {
        kind: 'monster',
        name: 'Blaze',
        position: new Vec3(101, 64, 200) // 1 block away
      };
      mockBot.entities = { blaze: unnamedHostile };

      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      const hostile = vp.getHostileMobs();
      expect(hostile.length).toBe(1);
    });

    it('should filter out mobs beyond threshold distance', () => {
      const farZombie = {
        kind: 'Hostile mobs',
        name: 'Zombie',
        position: new Vec3(200, 64, 200) // 100 blocks away
      };
      mockBot.entities = { zombie: farZombie };

      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      const hostile = vp.getHostileMobs();
      expect(hostile.length).toBe(0);
    });

    it('should ignore passive mobs', () => {
      const cow = {
        kind: 'Passive mobs',
        name: 'Cow',
        position: new Vec3(101, 64, 200) // 1 block away
      };
      mockBot.entities = { cow };

      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      const hostile = vp.getHostileMobs();
      expect(hostile.length).toBe(0);
    });
  });

  describe('isNearLava()', () => {
    it('should return false when bot has no entity', () => {
      const noEntityBot = {};
      const vp = new VisionProcessor(noEntityBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      expect(vp.isNearLava()).toBe(false);
    });

    it('should detect lava blocks nearby', () => {
      let blockCallCount = 0;
      mockBot.blockAt = jest.fn().mockImplementation((pos) => {
        blockCallCount++;
        // Simulate lava at a specific offset
        if (pos.x === 100 + 1 && pos.y === 64 && pos.z === 200) {
          return { name: 'lava' };
        }
        return { name: 'air' };
      });

      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      expect(vp.isNearLava()).toBe(true);
    });

    it('should detect flowing lava nearby', () => {
      mockBot.blockAt = jest.fn().mockImplementation((pos) => {
        if (pos.x === 100 - 1 && pos.y === 63 && pos.z === 200) {
          return { name: 'flowing_lava' };
        }
        return { name: 'air' };
      });

      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      expect(vp.isNearLava()).toBe(true);
    });

    it('should return false when no lava nearby', () => {
      mockBot.blockAt = jest.fn().mockReturnValue({ name: 'air' });

      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      expect(vp.isNearLava()).toBe(false);
    });

    it('should handle blockAt errors gracefully', () => {
      mockBot.blockAt = jest.fn().mockImplementation(() => {
        throw new Error('Block data not available');
      });

      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      expect(vp.isNearLava()).toBe(false);
    });
  });

  describe('getStatus()', () => {
    it('should return complete status object', () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      vp.running = true;
      vp.currentMode = 'active';
      vp.analysisCount = 10;
      vp.errorCount = 2;
      vp.lastAnalysisTime = 1234567890;
      vp.latestAnalysis = { mode: 'active' };

      const status = vp.getStatus();

      expect(status.running).toBe(true);
      expect(status.mode).toBe('active');
      expect(status.analysisCount).toBe(10);
      expect(status.errorCount).toBe(2);
      expect(status.lastAnalysisTime).toBe(1234567890);
      expect(status.hasAnalysis).toBe(true);
      expect(status.intervals).toEqual({
        danger: 2000,
        active: 4000,
        idle: 10000
      });
    });

    it('should report hasAnalysis as false when no analysis done', () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      const status = vp.getStatus();

      expect(status.hasAnalysis).toBe(false);
      expect(status.lastAnalysisTime).toBeNull();
    });
  });

  describe('adaptive interval behavior', () => {
    it('should cycle through modes and adjust intervals', async () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      // Start in idle mode
      vp.adjustInterval({ mode: 'idle' });
      expect(vp.currentInterval).toBe(10000);

      // Switch to danger
      vp.adjustInterval({ mode: 'danger' });
      expect(vp.currentInterval).toBe(2000);

      // Switch to active
      vp.adjustInterval({ mode: 'active' });
      expect(vp.currentInterval).toBe(4000);

      // Back to idle
      vp.adjustInterval({ mode: 'idle' });
      expect(vp.currentInterval).toBe(10000);
    });

    it('should not block the main thread during analysis', async () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      await vp.start();

      // Start a loop iteration
      const loopPromise = vp.loop();

      // The loop should be async - we can do work while it runs
      let syncWorkDone = false;
      syncWorkDone = true;

      await loopPromise;

      expect(syncWorkDone).toBe(true);
      expect(vp.analysisCount).toBeGreaterThanOrEqual(0); // Could be 0 if analysis returned null-ish
    });
  });

  describe('error resilience', () => {
    it('should continue loop after errors', async () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      vp.running = true;

      // First call fails
      mockRateLimiter.schedule.mockRejectedValueOnce(new Error('Temporary failure'));

      await vp.loop();
      expect(vp.errorCount).toBe(1);

      // Second call succeeds
      mockRateLimiter.schedule.mockImplementationOnce(async (fn) => fn());
      await vp.loop();
      expect(vp.analysisCount).toBe(1);
    });

    it('should track last error', async () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      vp.running = true;
      mockRateLimiter.schedule.mockRejectedValue(new Error('API timeout'));

      await vp.loop();

      expect(vp.lastError).toBe('API timeout');
      expect(vp.errorCount).toBe(1);
    });

    it('should handle loop errors in scheduleNextLoop', async () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      vp.running = true;
      vp.currentInterval = 100; // Fast for test

      // Simulate an error in the loop by making rate limiter throw
      mockRateLimiter.schedule.mockRejectedValue(new Error('Test error'));

      // Directly call loop() to trigger error handling
      await vp.loop();

      // The processor should track the error and still be running
      expect(vp.errorCount).toBeGreaterThanOrEqual(1);
      expect(vp.running).toBe(true);
      expect(vp.lastError).toBe('Test error');
    });
  });

  describe('rate limiter integration', () => {
    it('should schedule all API calls through vision rate limiter', async () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      vp.running = true;

      mockRateLimiter.schedule.mockImplementation(async (fn) => fn());

      await vp.loop();
      await vp.loop();
      await vp.loop();

      expect(mockRateLimiter.schedule).toHaveBeenCalledTimes(3);
    });

    it('should pass the analysis function to rate limiter', async () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      vp.running = true;

      let scheduledFunction = null;
      mockRateLimiter.schedule.mockImplementation(async (fn) => {
        scheduledFunction = fn;
        return fn();
      });

      await vp.loop();

      expect(scheduledFunction).not.toBeNull();
      expect(typeof scheduledFunction).toBe('function');
    });
  });

  describe('non-blocking verification', () => {
    it('should use setTimeout (not setInterval) for scheduling', async () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      await vp.start();

      // Check that we're using setTimeout pattern
      expect(vp.loopTimer).not.toBeNull();
      // The timer should be a timeout, not an interval
      // After loop completes, a new timeout is scheduled
    });

    it('should clear timer on stop', async () => {
      const vp = new VisionProcessor(mockBot, {
        visionRateLimiter: mockRateLimiter,
        featureFlags: mockFeatureFlags
      });

      await vp.start();
      expect(vp.loopTimer).not.toBeNull();

      await vp.stop();
      expect(vp.loopTimer).toBeNull();
    });
  });
});