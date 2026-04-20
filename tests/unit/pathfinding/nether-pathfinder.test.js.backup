jest.mock('../../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('../../../src/utils/feature-flags', () => ({
  isEnabled: jest.fn()
}));

jest.mock('mineflayer-pathfinder', () => ({
  Movements: jest.fn()
}));

const featureFlags = require('../../../src/utils/feature-flags');
const { Movements } = require('mineflayer-pathfinder');
const { WaterPathfinder, createWaterPathfinder, WATER_COSTS, SAFETY_DEFAULTS } = require('../../../src/pathfinding/water-pathfinder');

function createMockBot(overrides = {}) {
  const waterBlock = { name: 'water' };
  const flowingWaterBlock = { name: 'flowing_water' };
  const airBlock = { name: 'air' };
  const stoneBlock = { name: 'stone' };

  return {
    entity: {
      position: {
        x: 100,
        y: 64,
        z: 200,
        floored: jest.fn(() => ({ x: 100, y: 64, z: 200, offset: jest.fn(() => ({ x: 100, y: 65, z: 200 })) }))
      }
    },
    blockAt: jest.fn(() => stoneBlock),
    pathfinder: {
      setMovements: jest.fn()
    },
    oxygenLevel: undefined,
    ...overrides
  };
}

function createWaterBlockAt(position) {
  return { name: 'water' };
}

describe('WaterPathfinder', () => {
  let mockBot;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockBot = createMockBot();
    featureFlags.isEnabled.mockReturnValue(true);
    Movements.mockImplementation((bot, mcData) => ({
      liquidCost: 1,
      allowFreeMotion: false,
      infiniteLiquidDropdownDistance: false,
      dontCreateFlow: false,
      canDig: false,
      allowParkour: false,
      allowSprinting: false
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('exports', () => {
    it('should export WaterPathfinder class', () => {
      expect(typeof WaterPathfinder).toBe('function');
    });

    it('should export createWaterPathfinder factory', () => {
      expect(typeof createWaterPathfinder).toBe('function');
    });

    it('should export WATER_COSTS constants', () => {
      expect(WATER_COSTS).toEqual({
        surfaceSwim: 2.0,
        underwaterHorizontal: 3.0,
        verticalSwim: 3.0,
        divePenalty: 1.5
      });
    });

    it('should export SAFETY_DEFAULTS constants', () => {
      expect(SAFETY_DEFAULTS).toEqual({
        maxWaterTime: 30000,
        breathWarning: 150,
        deepWaterThreshold: 5
      });
    });
  });

  describe('constructor', () => {
    it('should set enabled from feature flag', () => {
      featureFlags.isEnabled.mockReturnValue(true);
      const wp = new WaterPathfinder(mockBot);
      expect(wp.enabled).toBe(true);
      expect(featureFlags.isEnabled).toHaveBeenCalledWith('ADVANCED_PATHFINDING');
    });

    it('should be disabled when feature flag is false', () => {
      featureFlags.isEnabled.mockReturnValue(false);
      const wp = new WaterPathfinder(mockBot);
      expect(wp.enabled).toBe(false);
    });

    it('should use default costs from WATER_COSTS', () => {
      const wp = new WaterPathfinder(mockBot);
      expect(wp.costs).toEqual(WATER_COSTS);
    });

    it('should merge custom costs with defaults', () => {
      const wp = new WaterPathfinder(mockBot, { costs: { surfaceSwim: 5.0 } });
      expect(wp.costs.surfaceSwim).toBe(5.0);
      expect(wp.costs.underwaterHorizontal).toBe(WATER_COSTS.underwaterHorizontal);
    });

    it('should use default safety values from SAFETY_DEFAULTS', () => {
      const wp = new WaterPathfinder(mockBot);
      expect(wp.maxWaterTime).toBe(SAFETY_DEFAULTS.maxWaterTime);
      expect(wp.breathWarning).toBe(SAFETY_DEFAULTS.breathWarning);
      expect(wp.deepWaterThreshold).toBe(SAFETY_DEFAULTS.deepWaterThreshold);
    });

    it('should accept custom safety options', () => {
      const wp = new WaterPathfinder(mockBot, { maxWaterTime: 60000, breathWarning: 100, deepWaterThreshold: 10 });
      expect(wp.maxWaterTime).toBe(60000);
      expect(wp.breathWarning).toBe(100);
      expect(wp.deepWaterThreshold).toBe(10);
    });

    it('should set liquidCost from options or default to surfaceSwim cost', () => {
      const wp = new WaterPathfinder(mockBot);
      expect(wp.liquidCost).toBe(WATER_COSTS.surfaceSwim);
    });

    it('should allow overriding liquidCost', () => {
      const wp = new WaterPathfinder(mockBot, { liquidCost: 10 });
      expect(wp.liquidCost).toBe(10);
    });

    it('should default allowFreeMotion to true', () => {
      const wp = new WaterPathfinder(mockBot);
      expect(wp.allowFreeMotion).toBe(true);
    });

    it('should allow overriding allowFreeMotion', () => {
      const wp = new WaterPathfinder(mockBot, { allowFreeMotion: false });
      expect(wp.allowFreeMotion).toBe(false);
    });

    it('should default infiniteLiquidDropdown to true', () => {
      const wp = new WaterPathfinder(mockBot);
      expect(wp.infiniteLiquidDropdown).toBe(true);
    });

    it('should initialize tracking state', () => {
      const wp = new WaterPathfinder(mockBot);
      expect(wp._waterEntryTime).toBeNull();
      expect(wp._inWater).toBe(false);
      expect(wp._safetyCallback).toBeNull();
    });
  });

  describe('createWaterMovement', () => {
    it('should return null when feature flag is disabled', () => {
      featureFlags.isEnabled.mockReturnValue(false);
      const wp = new WaterPathfinder(mockBot);
      const result = wp.createWaterMovement({});
      expect(result).toBeNull();
    });

    it('should create Movements instance with mcData', () => {
      const wp = new WaterPathfinder(mockBot);
      const mcData = { version: '1.20.4' };
      const movements = wp.createWaterMovement(mcData);

      expect(Movements).toHaveBeenCalledWith(mockBot, mcData);
      expect(movements).toBeDefined();
    });

    it('should configure water-related properties on Movements', () => {
      const wp = new WaterPathfinder(mockBot);
      const movements = wp.createWaterMovement({});

      expect(movements.liquidCost).toBe(wp.liquidCost);
      expect(movements.allowFreeMotion).toBe(wp.allowFreeMotion);
      expect(movements.infiniteLiquidDropdownDistance).toBe(wp.infiniteLiquidDropdown);
      expect(movements.dontCreateFlow).toBe(true);
      expect(movements.canDig).toBe(true);
      expect(movements.allowParkour).toBe(true);
      expect(movements.allowSprinting).toBe(true);
    });

    it('should return null and log error on Movements failure', () => {
      Movements.mockImplementation(() => { throw new Error('test error'); });
      const wp = new WaterPathfinder(mockBot);
      const result = wp.createWaterMovement({});
      expect(result).toBeNull();
      const logger = require('../../../src/utils/logger');
      expect(logger.error).toHaveBeenCalledWith(
        'WaterPathfinder: Failed to create water movements',
        expect.objectContaining({ error: 'test error' })
      );
    });
  });

  describe('applyWaterMovements', () => {
    it('should return false when feature flag is disabled', () => {
      featureFlags.isEnabled.mockReturnValue(false);
      const wp = new WaterPathfinder(mockBot);
      expect(wp.applyWaterMovements({})).toBe(false);
    });

    it('should return false when bot has no pathfinder', () => {
      const botNoPathfinder = { ...mockBot, pathfinder: null };
      const wp = new WaterPathfinder(botNoPathfinder);
      expect(wp.applyWaterMovements({})).toBe(false);
    });

    it('should create and set movements on pathfinder', () => {
      const wp = new WaterPathfinder(mockBot);
      const result = wp.applyWaterMovements({});

      expect(result).toBe(true);
      expect(mockBot.pathfinder.setMovements).toHaveBeenCalled();
    });
  });

  describe('getWaterState', () => {
    it('should return default state when bot has no entity', () => {
      const wp = new WaterPathfinder({ entity: null });
      const state = wp.getWaterState();
      expect(state).toEqual({ inWater: false, isSurface: false, depth: 0 });
    });

    it('should return default state when bot has no position', () => {
      const wp = new WaterPathfinder({ entity: {} });
      const state = wp.getWaterState();
      expect(state).toEqual({ inWater: false, isSurface: false, depth: 0 });
    });

    it('should detect not in water (stone block)', () => {
      mockBot.blockAt = jest.fn(() => ({ name: 'stone' }));
      const wp = new WaterPathfinder(mockBot);
      const state = wp.getWaterState();
      expect(state.inWater).toBe(false);
      expect(state.isSurface).toBe(false);
    });

    it('should detect surface swimming (water at feet, air above)', () => {
      mockBot.blockAt = jest.fn((pos) => {
        if (pos.y === 65) return { name: 'air' };
        return { name: 'water' };
      });
      const wp = new WaterPathfinder(mockBot);
      const state = wp.getWaterState();
      expect(state.inWater).toBe(true);
      expect(state.isSurface).toBe(true);
    });

    it('should detect underwater (water at feet and above)', () => {
      mockBot.blockAt = jest.fn(() => ({ name: 'water' }));
      const wp = new WaterPathfinder(mockBot);
      const state = wp.getWaterState();
      expect(state.inWater).toBe(true);
      expect(state.isSurface).toBe(false);
    });

    it('should recognize flowing_water as water', () => {
      mockBot.blockAt = jest.fn((pos) => {
        if (pos.y === 65) return { name: 'air' };
        return { name: 'flowing_water' };
      });
      const wp = new WaterPathfinder(mockBot);
      const state = wp.getWaterState();
      expect(state.inWater).toBe(true);
    });

    it('should handle null block from blockAt', () => {
      mockBot.blockAt = jest.fn(() => null);
      const wp = new WaterPathfinder(mockBot);
      const state = wp.getWaterState();
      expect(state.inWater).toBe(false);
    });
  });

  describe('startWaterTracking', () => {
    it('should set tracking state and start timer', () => {
      const wp = new WaterPathfinder(mockBot);
      const callback = jest.fn();
      wp.startWaterTracking(callback);

      expect(wp._inWater).toBe(true);
      expect(wp._waterEntryTime).toBeDefined();
      expect(wp._safetyCallback).toBe(callback);
    });

    it('should call safety callback when maxWaterTime exceeded', () => {
      const wp = new WaterPathfinder(mockBot, { maxWaterTime: 5000 });
      const callback = jest.fn();
      wp.startWaterTracking(callback);

      jest.advanceTimersByTime(5000);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        elapsed: expect.any(Number),
        maxWaterTime: 5000
      }));
    });

    it('should NOT call safety callback if bot leaves water in time', () => {
      const wp = new WaterPathfinder(mockBot, { maxWaterTime: 5000 });
      const callback = jest.fn();
      wp.startWaterTracking(callback);

      jest.advanceTimersByTime(3000);
      wp.stopWaterTracking();
      jest.advanceTimersByTime(3000);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should work without a callback (null)', () => {
      const wp = new WaterPathfinder(mockBot);
      wp.startWaterTracking(null);
      expect(wp._safetyCallback).toBeNull();

      jest.advanceTimersByTime(wp.maxWaterTime);
    });
  });

  describe('stopWaterTracking', () => {
    it('should clear tracking state', () => {
      const wp = new WaterPathfinder(mockBot);
      wp.startWaterTracking(jest.fn());
      wp.stopWaterTracking();

      expect(wp._inWater).toBe(false);
      expect(wp._waterEntryTime).toBeNull();
    });

    it('should clear the safety timer', () => {
      const wp = new WaterPathfinder(mockBot, { maxWaterTime: 5000 });
      const callback = jest.fn();
      wp.startWaterTracking(callback);
      wp.stopWaterTracking();

      jest.advanceTimersByTime(10000);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should be safe to call when not tracking', () => {
      const wp = new WaterPathfinder(mockBot);
      expect(() => wp.stopWaterTracking()).not.toThrow();
    });
  });

  describe('checkWaterSafety', () => {
    it('should return not exceeded when not in water', () => {
      const wp = new WaterPathfinder(mockBot);
      const safety = wp.checkWaterSafety();
      expect(safety.exceeded).toBe(false);
      expect(safety.elapsed).toBe(0);
      expect(safety.remaining).toBe(wp.maxWaterTime);
    });

    it('should return exceeded after maxWaterTime', () => {
      const wp = new WaterPathfinder(mockBot, { maxWaterTime: 10000 });
      wp.startWaterTracking(jest.fn());

      jest.advanceTimersByTime(10000);
      const safety = wp.checkWaterSafety();

      expect(safety.exceeded).toBe(true);
      expect(safety.remaining).toBe(0);
    });

    it('should show remaining time before expiry', () => {
      const wp = new WaterPathfinder(mockBot, { maxWaterTime: 30000 });
      wp.startWaterTracking(jest.fn());

      jest.advanceTimersByTime(10000);
      const safety = wp.checkWaterSafety();

      expect(safety.exceeded).toBe(false);
      expect(safety.elapsed).toBeGreaterThanOrEqual(10000);
      expect(safety.remaining).toBeLessThanOrEqual(20000);
    });
  });

  describe('analyzePathForWater', () => {
    it('should return no water when bot has no entity', () => {
      const wp = new WaterPathfinder({ entity: null });
      const result = wp.analyzePathForWater({ x: 110, y: 64, z: 200 });
      expect(result.requiresWater).toBe(false);
      expect(result.waterBlocks).toBe(0);
    });

    it('should return no water when goal is at same position', () => {
      const wp = new WaterPathfinder(mockBot);
      const result = wp.analyzePathForWater({ x: 100, y: 64, z: 200 });
      expect(result.requiresWater).toBe(false);
    });

    it('should count water blocks along path', () => {
      mockBot.blockAt = jest.fn((pos) => {
        if (pos.x >= 103 && pos.x <= 107) return { name: 'water' };
        return { name: 'stone' };
      });
      const wp = new WaterPathfinder(mockBot);
      const result = wp.analyzePathForWater({ x: 115, y: 64, z: 200 });
      expect(result.requiresWater).toBe(true);
      expect(result.waterBlocks).toBeGreaterThan(0);
    });

    it('should estimate swim time based on water blocks', () => {
      mockBot.blockAt = jest.fn(() => ({ name: 'water' }));
      const wp = new WaterPathfinder(mockBot);
      const result = wp.analyzePathForWater({ x: 120, y: 64, z: 200 });
      expect(result.estimatedTime).toBeGreaterThan(0);
      expect(result.estimatedTime).toBe(result.waterBlocks * 500);
    });

    it('should use custom sampleInterval', () => {
      mockBot.blockAt = jest.fn(() => ({ name: 'water' }));
      const wp = new WaterPathfinder(mockBot);
      const result1 = wp.analyzePathForWater({ x: 120, y: 64, z: 200 }, 1);
      const result2 = wp.analyzePathForWater({ x: 120, y: 64, z: 200 }, 5);
      expect(result1.waterBlocks).toBeGreaterThanOrEqual(result2.waterBlocks);
    });
  });

  describe('getNavigationMode', () => {
    it('should return land when not in water', () => {
      mockBot.blockAt = jest.fn(() => ({ name: 'stone' }));
      const wp = new WaterPathfinder(mockBot);
      expect(wp.getNavigationMode()).toBe('land');
    });

    it('should return surface_swim when at water surface', () => {
      mockBot.blockAt = jest.fn((pos) => {
        if (pos.y === 65) return { name: 'air' };
        return { name: 'water' };
      });
      const wp = new WaterPathfinder(mockBot);
      expect(wp.getNavigationMode()).toBe('surface_swim');
    });

    it('should return underwater when fully submerged', () => {
      mockBot.blockAt = jest.fn(() => ({ name: 'water' }));
      const wp = new WaterPathfinder(mockBot);
      expect(wp.getNavigationMode()).toBe('underwater');
    });
  });

  describe('getCurrentCostMultiplier', () => {
    it('should return 1.0 for land navigation', () => {
      mockBot.blockAt = jest.fn(() => ({ name: 'stone' }));
      const wp = new WaterPathfinder(mockBot);
      expect(wp.getCurrentCostMultiplier()).toBe(1.0);
    });

    it('should return surfaceSwim cost for surface swimming', () => {
      mockBot.blockAt = jest.fn((pos) => {
        if (pos.y === 65) return { name: 'air' };
        return { name: 'water' };
      });
      const wp = new WaterPathfinder(mockBot);
      expect(wp.getCurrentCostMultiplier()).toBe(WATER_COSTS.surfaceSwim);
    });

    it('should return underwater cost + dive penalty for underwater', () => {
      mockBot.blockAt = jest.fn(() => ({ name: 'water' }));
      const wp = new WaterPathfinder(mockBot);
      expect(wp.getCurrentCostMultiplier()).toBe(
        WATER_COSTS.underwaterHorizontal + WATER_COSTS.divePenalty
      );
    });
  });

  describe('checkBreath', () => {
    it('should return sufficient breath with default 300', () => {
      const wp = new WaterPathfinder(mockBot);
      const breath = wp.checkBreath();
      expect(breath.breathRemaining).toBe(300);
      expect(breath.sufficient).toBe(true);
    });

    it('should detect low breath when oxygenLevel is set', () => {
      mockBot.oxygenLevel = 100;
      const wp = new WaterPathfinder(mockBot);
      const breath = wp.checkBreath();
      expect(breath.breathRemaining).toBe(100);
      expect(breath.sufficient).toBe(false);
    });

    it('should respect custom breathWarning threshold', () => {
      mockBot.oxygenLevel = 180;
      const wp = new WaterPathfinder(mockBot, { breathWarning: 200 });
      const breath = wp.checkBreath();
      expect(breath.sufficient).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return comprehensive status object', () => {
      mockBot.blockAt = jest.fn(() => ({ name: 'stone' }));
      const wp = new WaterPathfinder(mockBot);
      const status = wp.getStatus();

      expect(status).toHaveProperty('enabled', true);
      expect(status).toHaveProperty('inWater', false);
      expect(status).toHaveProperty('navigationMode', 'land');
      expect(status).toHaveProperty('waterDepth');
      expect(status).toHaveProperty('isSurface', false);
      expect(status).toHaveProperty('safety');
      expect(status.safety).toHaveProperty('tracking', false);
      expect(status.safety).toHaveProperty('exceeded', false);
      expect(status.safety).toHaveProperty('maxWaterTime', wp.maxWaterTime);
      expect(status).toHaveProperty('costs');
    });
  });

  describe('createWaterPathfinder factory', () => {
    it('should create instance and apply movements when enabled', () => {
      featureFlags.isEnabled.mockReturnValue(true);
      const result = createWaterPathfinder(mockBot, {});

      expect(result.pathfinder).toBeInstanceOf(WaterPathfinder);
      expect(result.applied).toBe(true);
    });

    it('should create instance but not apply when disabled', () => {
      featureFlags.isEnabled.mockReturnValue(false);
      const result = createWaterPathfinder(mockBot, {});

      expect(result.pathfinder).toBeInstanceOf(WaterPathfinder);
      expect(result.applied).toBe(false);
    });
  });

  describe('_isWaterBlock', () => {
    it('should return false for null block', () => {
      const wp = new WaterPathfinder(mockBot);
      expect(wp._isWaterBlock(null)).toBe(false);
    });

    it('should return true for water block', () => {
      const wp = new WaterPathfinder(mockBot);
      expect(wp._isWaterBlock({ name: 'water' })).toBe(true);
    });

    it('should return true for flowing_water block', () => {
      const wp = new WaterPathfinder(mockBot);
      expect(wp._isWaterBlock({ name: 'flowing_water' })).toBe(true);
    });

    it('should return false for non-water block', () => {
      const wp = new WaterPathfinder(mockBot);
      expect(wp._isWaterBlock({ name: 'stone' })).toBe(false);
    });
  });
});
