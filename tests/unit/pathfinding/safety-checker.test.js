jest.mock('../../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('../../../src/utils/feature-flags', () => ({
  isEnabled: jest.fn()
}));

const featureFlags = require('../../../src/utils/feature-flags');
const {
  SafetyChecker,
  createSafetyChecker,
  SAFETY_DEFAULTS
} = require('../../../src/pathfinding/safety-checker');

function createMockBot(overrides = {}) {
  return {
    health: 20,
    isInWater: false,
    entity: {
      headInWater: false,
      inWater: false
    },
    inventory: {
      items: jest.fn(() => [])
    },
    ...overrides
  };
}

describe('SafetyChecker', () => {
  let bot;

  beforeEach(() => {
    jest.clearAllMocks();
    bot = createMockBot();
    featureFlags.isEnabled.mockReturnValue(true);
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-19T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('exports', () => {
    it('exports SafetyChecker class', () => {
      expect(typeof SafetyChecker).toBe('function');
    });

    it('exports createSafetyChecker factory', () => {
      expect(typeof createSafetyChecker).toBe('function');
    });

    it('exports SAFETY_DEFAULTS constants', () => {
      expect(SAFETY_DEFAULTS).toEqual({
        minHealth: 10,
        maxWaterTime: 30000
      });
    });
  });

  describe('feature flag integration', () => {
    it('enables checker when ADVANCED_PATHFINDING is true', () => {
      featureFlags.isEnabled.mockReturnValue(true);
      const checker = new SafetyChecker(bot);

      expect(checker.enabled).toBe(true);
      expect(featureFlags.isEnabled).toHaveBeenCalledWith('ADVANCED_PATHFINDING');
    });

    it('disables checker when ADVANCED_PATHFINDING is false', () => {
      featureFlags.isEnabled.mockReturnValue(false);
      const checker = new SafetyChecker(bot);

      expect(checker.enabled).toBe(false);
    });
  });

  describe('constructor', () => {
    it('uses default safety values', () => {
      const checker = new SafetyChecker(bot);

      expect(checker.minHealth).toBe(10);
      expect(checker.maxWaterTime).toBe(30000);
    });

    it('accepts custom minHealth and maxWaterTime', () => {
      const checker = new SafetyChecker(bot, { minHealth: 12, maxWaterTime: 45000 });

      expect(checker.minHealth).toBe(12);
      expect(checker.maxWaterTime).toBe(45000);
    });

    it('initializes water tracking state', () => {
      const checker = new SafetyChecker(bot);

      expect(checker._waterEntryTime).toBeNull();
      expect(checker._waterTracking).toBe(false);
    });
  });

  describe('isParkourSafe', () => {
    it.each([
      [9, false],
      [10, false],
      [11, true]
    ])('returns %s -> %s around the default threshold', (health, expected) => {
      const checker = new SafetyChecker(bot);
      expect(checker.isParkourSafe(health)).toBe(expected);
    });

    it('blocks parkour when health is undefined', () => {
      const checker = new SafetyChecker(createMockBot({ health: undefined }));
      expect(checker.isParkourSafe(undefined)).toBe(false);
    });

    it('blocks parkour when health is null', () => {
      const checker = new SafetyChecker(createMockBot({ health: null }));
      expect(checker.isParkourSafe(null)).toBe(false);
    });

    it('uses bot health when no argument is passed', () => {
      bot.health = 12;
      const checker = new SafetyChecker(bot);

      expect(checker.isParkourSafe()).toBe(true);
    });

    it('honors a custom minHealth threshold', () => {
      const checker = new SafetyChecker(bot, { minHealth: 15 });

      expect(checker.isParkourSafe(15)).toBe(false);
      expect(checker.isParkourSafe(16)).toBe(true);
    });

    it('returns false when disabled', () => {
      featureFlags.isEnabled.mockReturnValue(false);
      const checker = new SafetyChecker(bot);

      expect(checker.isParkourSafe(20)).toBe(false);
    });
  });

  describe('water tracking', () => {
    it('starts tracking water time', () => {
      const checker = new SafetyChecker(bot);
      checker.startWaterTracking();

      expect(checker._waterTracking).toBe(true);
      expect(checker._waterEntryTime).toBe(Date.now());
    });

    it('stops tracking water time', () => {
      const checker = new SafetyChecker(bot);
      checker.startWaterTracking();
      checker.stopWaterTracking();

      expect(checker._waterTracking).toBe(false);
      expect(checker._waterEntryTime).toBeNull();
    });

    it('is safe when not in water', () => {
      const checker = new SafetyChecker(bot);

      expect(checker.checkWaterTimeout()).toBe(true);
      expect(checker._waterTracking).toBe(false);
    });

    it('starts tracking when in water without prior entry time', () => {
      bot.isInWater = true;
      const checker = new SafetyChecker(bot);

      expect(checker.checkWaterTimeout()).toBe(true);
      expect(checker._waterTracking).toBe(true);
      expect(checker._waterEntryTime).toBe(Date.now());
    });

    it.each([
      [29000, true],
      [30000, true],
      [31000, false]
    ])('returns %s ms in water -> safe %s', (elapsed, expected) => {
      bot.isInWater = true;
      const checker = new SafetyChecker(bot);
      checker.startWaterTracking();
      jest.advanceTimersByTime(elapsed);

      expect(checker.checkWaterTimeout()).toBe(expected);
    });

    it('allows water traversal when a boat is present after 31s', () => {
      bot.isInWater = true;
      bot.inventory.items.mockReturnValue([{ name: 'oak_boat' }]);
      const checker = new SafetyChecker(bot);
      checker.startWaterTracking();
      jest.advanceTimersByTime(31000);

      expect(checker.checkWaterTimeout()).toBe(true);
    });

    it('detects a boat from inventory items', () => {
      bot.isInWater = true;
      bot.inventory.items.mockReturnValue([{ name: 'boat' }]);
      const checker = new SafetyChecker(bot);
      checker.startWaterTracking();
      jest.advanceTimersByTime(31000);

      expect(checker.checkWaterTimeout()).toBe(true);
    });

    it('blocks water traversal after timeout', () => {
      bot.isInWater = true;
      const checker = new SafetyChecker(bot);
      checker.startWaterTracking();
      jest.advanceTimersByTime(31001);

      expect(checker.checkWaterTimeout()).toBe(false);
    });

    it('resets tracking when leaving water', () => {
      bot.isInWater = true;
      const checker = new SafetyChecker(bot);
      checker.startWaterTracking();
      jest.advanceTimersByTime(15000);

      bot.isInWater = false;
      expect(checker.checkWaterTimeout()).toBe(true);
      expect(checker._waterTracking).toBe(false);
      expect(checker._waterEntryTime).toBeNull();
    });

    it('uses entity.headInWater when isInWater is not set', () => {
      const fallbackBot = createMockBot({ isInWater: undefined, entity: { headInWater: true, inWater: true } });
      const checker = new SafetyChecker(fallbackBot);

      expect(checker.checkWaterTimeout()).toBe(true);
      expect(checker._waterTracking).toBe(true);
    });

    it('returns false when disabled', () => {
      featureFlags.isEnabled.mockReturnValue(false);
      bot.isInWater = true;
      const checker = new SafetyChecker(bot);

      expect(checker.checkWaterTimeout()).toBe(false);
    });
  });

  describe('status reporting', () => {
    it('returns a status object with core fields', () => {
      const checker = new SafetyChecker(bot);
      const status = checker.getStatus();

      expect(status).toEqual(expect.objectContaining({
        enabled: true,
        health: 20,
        minHealth: 10,
        maxWaterTime: 30000,
        parkourSafe: true,
        inWater: false,
        hasBoat: false,
        waterTracking: false,
        elapsed: 0,
        waterTimeoutSafe: true
      }));
    });

    it('reports tracking and elapsed time while in water', () => {
      bot.isInWater = true;
      const checker = new SafetyChecker(bot);
      checker.startWaterTracking();
      jest.advanceTimersByTime(5000);

      const status = checker.getStatus();

      expect(status.inWater).toBe(true);
      expect(status.waterTracking).toBe(true);
      expect(status.elapsed).toBeGreaterThanOrEqual(5000);
      expect(status.waterTimeoutSafe).toBe(true);
    });

    it('reports boat presence in status', () => {
      bot.isInWater = true;
      bot.inventory.items.mockReturnValue([{ name: 'spruce_boat' }]);
      const checker = new SafetyChecker(bot);

      expect(checker.getStatus().hasBoat).toBe(true);
    });

    it('reports disabled state in status', () => {
      featureFlags.isEnabled.mockReturnValue(false);
      const checker = new SafetyChecker(bot);

      expect(checker.getStatus().enabled).toBe(false);
      expect(checker.getStatus().waterTimeoutSafe).toBe(false);
    });
  });

  describe('factory', () => {
    it('returns checker and applied true when enabled', () => {
      featureFlags.isEnabled.mockReturnValue(true);
      const result = createSafetyChecker(bot, {});

      expect(result.checker).toBeInstanceOf(SafetyChecker);
      expect(result.applied).toBe(true);
    });

    it('returns checker and applied false when disabled', () => {
      featureFlags.isEnabled.mockReturnValue(false);
      const result = createSafetyChecker(bot, {});

      expect(result.checker).toBeInstanceOf(SafetyChecker);
      expect(result.applied).toBe(false);
    });
  });

  describe('integration with bot state', () => {
    it('uses bot health by default for parkour safety', () => {
      bot.health = 8;
      const checker = new SafetyChecker(bot);

      expect(checker.isParkourSafe()).toBe(false);
    });

    it('allows parkour when bot health is above threshold', () => {
      bot.health = 12;
      const checker = new SafetyChecker(bot);

      expect(checker.isParkourSafe()).toBe(true);
    });

    it('tracks water duration across repeated checks', () => {
      bot.isInWater = true;
      const checker = new SafetyChecker(bot);

      expect(checker.checkWaterTimeout()).toBe(true);
      jest.advanceTimersByTime(20000);
      expect(checker.checkWaterTimeout()).toBe(true);
      jest.advanceTimersByTime(11001);
      expect(checker.checkWaterTimeout()).toBe(false);
    });

    it('stays safe in water with a boat even after timeout', () => {
      bot.isInWater = true;
      bot.inventory.items.mockReturnValue([{ name: 'birch_boat' }]);
      const checker = new SafetyChecker(bot);

      checker.startWaterTracking();
      jest.advanceTimersByTime(60000);

      expect(checker.checkWaterTimeout()).toBe(true);
    });

    it('treats empty inventory as no boat', () => {
      bot.isInWater = true;
      bot.inventory.items.mockReturnValue([]);
      const checker = new SafetyChecker(bot);

      checker.startWaterTracking();
      jest.advanceTimersByTime(31000);

      expect(checker.checkWaterTimeout()).toBe(false);
    });
  });
});
