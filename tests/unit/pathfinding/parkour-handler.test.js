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
const {
  ParkourHandler,
  createParkourHandler,
  PARKOUR_COSTS,
  SAFETY_DEFAULTS
} = require('../../../src/pathfinding/parkour-handler');

function createMockBot(overrides = {}) {
  return {
    health: 20,
    entity: {
      position: {
        x: 100,
        y: 64,
        z: 200,
        floored: jest.fn(() => ({ x: 100, y: 64, z: 200 }))
      }
    },
    blockAt: jest.fn(() => ({ name: 'stone' })),
    pathfinder: {
      setMovements: jest.fn()
    },
    inventory: { items: () => [] },
    ...overrides
  };
}

describe('ParkourHandler', () => {
  let mockBot;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBot = createMockBot();
    featureFlags.isEnabled.mockReturnValue(true);
    Movements.mockImplementation((bot, mcData) => ({
      liquidCost: 1,
      allowFreeMotion: false,
      allowParkour: false,
      allowSprinting: false,
      canDig: false,
      dontCreateFlow: false
    }));
  });

  // ─── Exports ──────────────────────────────────────────────────

  describe('exports', () => {
    it('should export ParkourHandler class', () => {
      expect(typeof ParkourHandler).toBe('function');
    });

    it('should export createParkourHandler factory', () => {
      expect(typeof createParkourHandler).toBe('function');
    });

    it('should export PARKOUR_COSTS constants', () => {
      expect(PARKOUR_COSTS).toEqual({
        gapJump: 5.0,
        sprintJump: 3.0,
        riskyJump: 10.0
      });
    });

    it('should export SAFETY_DEFAULTS constants', () => {
      expect(SAFETY_DEFAULTS).toEqual({
        minHealth: 10,
        maxGapWidth: 4,
        minLandingClearance: 2,
        hazardCheckRadius: 3
      });
    });
  });

  // ─── Feature Flag Integration ─────────────────────────────────

  describe('Feature Flag Integration', () => {
    it('should be enabled when ADVANCED_PATHFINDING flag is true', () => {
      featureFlags.isEnabled.mockReturnValue(true);
      const handler = new ParkourHandler(mockBot);
      expect(handler.enabled).toBe(true);
      expect(featureFlags.isEnabled).toHaveBeenCalledWith('ADVANCED_PATHFINDING');
    });

    it('should be disabled when ADVANCED_PATHFINDING flag is false', () => {
      featureFlags.isEnabled.mockReturnValue(false);
      const handler = new ParkourHandler(mockBot);
      expect(handler.enabled).toBe(false);
    });
  });

  // ─── Constructor ──────────────────────────────────────────────

  describe('constructor', () => {
    it('should use default costs from PARKOUR_COSTS', () => {
      const handler = new ParkourHandler(mockBot);
      expect(handler.costs).toEqual(PARKOUR_COSTS);
    });

    it('should merge custom costs with defaults', () => {
      const handler = new ParkourHandler(mockBot, { costs: { gapJump: 8.0 } });
      expect(handler.costs.gapJump).toBe(8.0);
      expect(handler.costs.sprintJump).toBe(PARKOUR_COSTS.sprintJump);
    });

    it('should use default safety values from SAFETY_DEFAULTS', () => {
      const handler = new ParkourHandler(mockBot);
      expect(handler.minHealth).toBe(SAFETY_DEFAULTS.minHealth);
      expect(handler.maxGapWidth).toBe(SAFETY_DEFAULTS.maxGapWidth);
      expect(handler.minLandingClearance).toBe(SAFETY_DEFAULTS.minLandingClearance);
      expect(handler.hazardCheckRadius).toBe(SAFETY_DEFAULTS.hazardCheckRadius);
    });

    it('should accept custom safety options', () => {
      const handler = new ParkourHandler(mockBot, {
        minHealth: 15,
        maxGapWidth: 3,
        minLandingClearance: 3,
        hazardCheckRadius: 5
      });
      expect(handler.minHealth).toBe(15);
      expect(handler.maxGapWidth).toBe(3);
      expect(handler.minLandingClearance).toBe(3);
      expect(handler.hazardCheckRadius).toBe(5);
    });

    it('should initialize tracking state', () => {
      const handler = new ParkourHandler(mockBot);
      expect(handler._lastGapDetected).toBeNull();
      expect(handler._jumpCount).toBe(0);
    });
  });

  // ─── Gap Detection ────────────────────────────────────────────

  describe('Gap Detection', () => {
    it('should detect a 1-block gap', () => {
      // Block at offset 1 is air, block at offset 2 is solid
      mockBot.blockAt = jest.fn((pos) => {
        const dx = pos.x - 100;
        if (dx === 1) return { name: 'air' };
        return { name: 'stone' };
      });
      const handler = new ParkourHandler(mockBot);
      const result = handler.detectGap({ x: 100, y: 64, z: 200 }, { x: 1, y: 0, z: 0 });
      expect(result.gapDetected).toBe(true);
      expect(result.gapWidth).toBe(1);
    });

    it('should detect a 2-block gap', () => {
      mockBot.blockAt = jest.fn((pos) => {
        const dx = pos.x - 100;
        if (dx === 1 || dx === 2) return { name: 'air' };
        return { name: 'stone' };
      });
      const handler = new ParkourHandler(mockBot);
      const result = handler.detectGap({ x: 100, y: 64, z: 200 }, { x: 1, y: 0, z: 0 });
      expect(result.gapDetected).toBe(true);
      expect(result.gapWidth).toBe(2);
    });

    it('should detect a 3-block gap', () => {
      mockBot.blockAt = jest.fn((pos) => {
        const dx = pos.x - 100;
        if (dx >= 1 && dx <= 3) return { name: 'air' };
        return { name: 'stone' };
      });
      const handler = new ParkourHandler(mockBot);
      const result = handler.detectGap({ x: 100, y: 64, z: 200 }, { x: 1, y: 0, z: 0 });
      expect(result.gapDetected).toBe(true);
      expect(result.gapWidth).toBe(3);
    });

    it('should detect a 4-block gap', () => {
      mockBot.blockAt = jest.fn((pos) => {
        const dx = pos.x - 100;
        if (dx >= 1 && dx <= 4) return { name: 'air' };
        return { name: 'stone' };
      });
      const handler = new ParkourHandler(mockBot);
      const result = handler.detectGap({ x: 100, y: 64, z: 200 }, { x: 1, y: 0, z: 0 });
      expect(result.gapDetected).toBe(true);
      expect(result.gapWidth).toBe(4);
    });

    it('should return gapDetected false when no gap exists', () => {
      mockBot.blockAt = jest.fn(() => ({ name: 'stone' }));
      const handler = new ParkourHandler(mockBot);
      const result = handler.detectGap({ x: 100, y: 64, z: 200 }, { x: 1, y: 0, z: 0 });
      expect(result.gapDetected).toBe(false);
    });

    it('should return gapDetected false when gap is too wide (>4 blocks)', () => {
      mockBot.blockAt = jest.fn((pos) => {
        const dx = pos.x - 100;
        if (dx >= 1 && dx <= 5) return { name: 'air' };
        return { name: 'stone' };
      });
      const handler = new ParkourHandler(mockBot);
      const result = handler.detectGap({ x: 100, y: 64, z: 200 }, { x: 1, y: 0, z: 0 });
      expect(result.gapDetected).toBe(false);
    });

    it('should detect gap in z direction', () => {
      mockBot.blockAt = jest.fn((pos) => {
        const dz = pos.z - 200;
        if (dz >= 1 && dz <= 2) return { name: 'air' };
        return { name: 'stone' };
      });
      const handler = new ParkourHandler(mockBot);
      const result = handler.detectGap({ x: 100, y: 64, z: 200 }, { x: 0, y: 0, z: 1 });
      expect(result.gapDetected).toBe(true);
      expect(result.gapWidth).toBe(2);
    });

    it('should update _lastGapDetected on detection', () => {
      mockBot.blockAt = jest.fn((pos) => {
        const dx = pos.x - 100;
        if (dx === 1) return { name: 'air' };
        return { name: 'stone' };
      });
      const handler = new ParkourHandler(mockBot);
      handler.detectGap({ x: 100, y: 64, z: 200 }, { x: 1, y: 0, z: 0 });
      expect(handler._lastGapDetected).not.toBeNull();
    });
  });

  // ─── Safety Checks ────────────────────────────────────────────

  describe('Safety Checks', () => {
    it('should return true when health is above minHealth', () => {
      mockBot.health = 15;
      const handler = new ParkourHandler(mockBot);
      expect(handler.checkHealthSafety()).toBe(true);
    });

    it('should return false when health is below minHealth', () => {
      mockBot.health = 8;
      const handler = new ParkourHandler(mockBot);
      expect(handler.checkHealthSafety()).toBe(false);
    });

    it('should return false when health equals minHealth', () => {
      mockBot.health = 10;
      const handler = new ParkourHandler(mockBot);
      expect(handler.checkHealthSafety()).toBe(false);
    });

    it('should return true when health is 11 (just above threshold)', () => {
      mockBot.health = 11;
      const handler = new ParkourHandler(mockBot);
      expect(handler.checkHealthSafety()).toBe(true);
    });

    it('should respect custom minHealth option', () => {
      mockBot.health = 12;
      const handler = new ParkourHandler(mockBot, { minHealth: 15 });
      expect(handler.checkHealthSafety()).toBe(false);
    });

    it('should return false when bot health is undefined', () => {
      const botNoHealth = createMockBot({ health: undefined });
      const handler = new ParkourHandler(botNoHealth);
      expect(handler.checkHealthSafety()).toBe(false);
    });
  });

  // ─── Jump Analysis ────────────────────────────────────────────

  describe('Jump Analysis', () => {
    it('should analyze a short walkable jump (distance <= 3)', () => {
      mockBot.blockAt = jest.fn(() => ({ name: 'stone' }));
      const handler = new ParkourHandler(mockBot);
      const result = handler.analyzeJump(
        { x: 0, y: 64, z: 0 },
        { x: 0, y: 64, z: 3 }
      );
      expect(result.jumpable).toBe(true);
      expect(result.requiresSprint).toBe(false);
      expect(result.distance).toBe(3);
    });

    it('should require sprint for distance > 3 blocks', () => {
      mockBot.blockAt = jest.fn(() => ({ name: 'stone' }));
      const handler = new ParkourHandler(mockBot);
      const result = handler.analyzeJump(
        { x: 0, y: 64, z: 0 },
        { x: 0, y: 64, z: 4 }
      );
      expect(result.jumpable).toBe(true);
      expect(result.requiresSprint).toBe(true);
      expect(result.distance).toBe(4);
    });

    it('should mark jump as not jumpable when distance > maxGapWidth', () => {
      mockBot.blockAt = jest.fn(() => ({ name: 'stone' }));
      const handler = new ParkourHandler(mockBot);
      const result = handler.analyzeJump(
        { x: 0, y: 64, z: 0 },
        { x: 0, y: 64, z: 5 }
      );
      expect(result.jumpable).toBe(false);
      expect(result.reason).toContain('too far');
    });

    it('should check landing safety', () => {
      // Landing on air = unsafe
      mockBot.blockAt = jest.fn((pos) => {
        if (pos.y === 63) return { name: 'air' };
        return { name: 'stone' };
      });
      const handler = new ParkourHandler(mockBot);
      const result = handler.analyzeJump(
        { x: 0, y: 64, z: 0 },
        { x: 0, y: 64, z: 2 }
      );
      expect(result.landingSafe).toBe(false);
    });

    it('should mark landing as safe when solid block below', () => {
      mockBot.blockAt = jest.fn(() => ({ name: 'stone' }));
      const handler = new ParkourHandler(mockBot);
      const result = handler.analyzeJump(
        { x: 0, y: 64, z: 0 },
        { x: 0, y: 64, z: 2 }
      );
      expect(result.landingSafe).toBe(true);
    });

    it('should handle diagonal jumps', () => {
      mockBot.blockAt = jest.fn(() => ({ name: 'stone' }));
      const handler = new ParkourHandler(mockBot);
      const result = handler.analyzeJump(
        { x: 0, y: 64, z: 0 },
        { x: 2, y: 64, z: 2 }
      );
      // Distance = sqrt(4+4) ≈ 2.83
      expect(result.jumpable).toBe(true);
      expect(result.distance).toBeCloseTo(2.83, 1);
    });

    it('should return jumpable false for zero distance', () => {
      const handler = new ParkourHandler(mockBot);
      const result = handler.analyzeJump(
        { x: 0, y: 64, z: 0 },
        { x: 0, y: 64, z: 0 }
      );
      expect(result.jumpable).toBe(false);
      expect(result.distance).toBe(0);
    });

    it('should detect lava hazard at landing', () => {
      mockBot.blockAt = jest.fn((pos) => {
        if (pos.y === 63 && pos.z === 2) return { name: 'lava' };
        if (pos.y === 63) return { name: 'stone' };
        return { name: 'air' };
      });
      const handler = new ParkourHandler(mockBot);
      const result = handler.analyzeJump(
        { x: 0, y: 64, z: 0 },
        { x: 0, y: 64, z: 2 }
      );
      expect(result.landingSafe).toBe(false);
    });

    it('should increment jumpCount on successful analysis', () => {
      mockBot.blockAt = jest.fn(() => ({ name: 'stone' }));
      const handler = new ParkourHandler(mockBot);
      handler.analyzeJump({ x: 0, y: 64, z: 0 }, { x: 0, y: 64, z: 2 });
      handler.analyzeJump({ x: 0, y: 64, z: 0 }, { x: 0, y: 64, z: 3 });
      expect(handler._jumpCount).toBe(2);
    });
  });

  // ─── Landing Prediction ───────────────────────────────────────

  describe('Landing Prediction', () => {
    it('should predict safe landing on solid block', () => {
      mockBot.blockAt = jest.fn((pos) => {
        if (pos.y === 63) return { name: 'stone' };
        return { name: 'air' };
      });
      const handler = new ParkourHandler(mockBot);
      const result = handler._predictLanding({ x: 0, y: 64, z: 0 }, { x: 0, z: 3 });
      expect(result.safe).toBe(true);
    });

    it('should predict unsafe landing on air', () => {
      mockBot.blockAt = jest.fn(() => ({ name: 'air' }));
      const handler = new ParkourHandler(mockBot);
      const result = handler._predictLanding({ x: 0, y: 64, z: 0 }, { x: 0, z: 3 });
      expect(result.safe).toBe(false);
    });

    it('should check 2-block vertical clearance at landing', () => {
      // Solid at landing y and y+1 = no clearance
      mockBot.blockAt = jest.fn((pos) => {
        if (pos.y === 63) return { name: 'stone' }; // ground
        if (pos.y === 64) return { name: 'stone' }; // blocking head
        return { name: 'air' };
      });
      const handler = new ParkourHandler(mockBot);
      const result = handler._predictLanding({ x: 0, y: 64, z: 0 }, { x: 0, z: 2 });
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('clearance');
    });

    it('should detect lava at landing position', () => {
      mockBot.blockAt = jest.fn((pos) => {
        if (pos.y === 63) return { name: 'lava' };
        return { name: 'air' };
      });
      const handler = new ParkourHandler(mockBot);
      const result = handler._predictLanding({ x: 0, y: 64, z: 0 }, { x: 0, z: 2 });
      expect(result.safe).toBe(false);
    });

    it('should detect void (null block) at landing', () => {
      mockBot.blockAt = jest.fn(() => null);
      const handler = new ParkourHandler(mockBot);
      const result = handler._predictLanding({ x: 0, y: 64, z: 0 }, { x: 0, z: 2 });
      expect(result.safe).toBe(false);
    });

    it('should handle flowing_lava as hazard', () => {
      mockBot.blockAt = jest.fn((pos) => {
        if (pos.y === 63) return { name: 'flowing_lava' };
        return { name: 'air' };
      });
      const handler = new ParkourHandler(mockBot);
      const result = handler._predictLanding({ x: 0, y: 64, z: 0 }, { x: 0, z: 2 });
      expect(result.safe).toBe(false);
    });

    it('should return landing position in result', () => {
      mockBot.blockAt = jest.fn((pos) => {
        if (pos.y === 63) return { name: 'stone' };
        return { name: 'air' };
      });
      const handler = new ParkourHandler(mockBot);
      const result = handler._predictLanding({ x: 0, y: 64, z: 0 }, { x: 0, z: 3 });
      expect(result.landingPosition).toBeDefined();
      expect(result.landingPosition.z).toBe(3);
    });

    it('should predict safe landing with full clearance', () => {
      mockBot.blockAt = jest.fn((pos) => {
        if (pos.y === 63) return { name: 'stone' }; // ground
        return { name: 'air' }; // clearance above
      });
      const handler = new ParkourHandler(mockBot);
      const result = handler._predictLanding({ x: 0, y: 64, z: 0 }, { x: 0, z: 2 });
      expect(result.safe).toBe(true);
    });
  });

  // ─── Landing Hazards ──────────────────────────────────────────

  describe('Landing Hazards', () => {
    it('should detect lava within hazardCheckRadius', () => {
      mockBot.blockAt = jest.fn((pos) => {
        if (pos.x === 1 && pos.y === 63) return { name: 'lava' };
        return { name: 'stone' };
      });
      const handler = new ParkourHandler(mockBot);
      const result = handler._checkLandingHazards({ x: 0, y: 64, z: 0 });
      expect(result.hasHazards).toBe(true);
      expect(result.hazards).toContain('lava');
    });

    it('should detect flowing_lava as hazard', () => {
      mockBot.blockAt = jest.fn((pos) => {
        if (pos.x === 1 && pos.y === 63) return { name: 'flowing_lava' };
        return { name: 'stone' };
      });
      const handler = new ParkourHandler(mockBot);
      const result = handler._checkLandingHazards({ x: 0, y: 64, z: 0 });
      expect(result.hasHazards).toBe(true);
    });

    it('should detect void (null blocks) as hazard', () => {
      mockBot.blockAt = jest.fn((pos) => {
        if (pos.x === 1) return null;
        return { name: 'stone' };
      });
      const handler = new ParkourHandler(mockBot);
      const result = handler._checkLandingHazards({ x: 0, y: 64, z: 0 });
      expect(result.hasHazards).toBe(true);
    });

    it('should return no hazards when area is safe', () => {
      mockBot.blockAt = jest.fn(() => ({ name: 'stone' }));
      const handler = new ParkourHandler(mockBot);
      const result = handler._checkLandingHazards({ x: 0, y: 64, z: 0 });
      expect(result.hasHazards).toBe(false);
      expect(result.hazards).toHaveLength(0);
    });
  });

  // ─── Movements Integration ────────────────────────────────────

  describe('Movements Integration', () => {
    it('should return null when feature flag is disabled', () => {
      featureFlags.isEnabled.mockReturnValue(false);
      const handler = new ParkourHandler(mockBot);
      const result = handler.createParkourMovement({});
      expect(result).toBeNull();
    });

    it('should create Movements instance with mcData', () => {
      const handler = new ParkourHandler(mockBot);
      const mcData = { version: '1.20.4' };
      const movements = handler.createParkourMovement(mcData);
      expect(Movements).toHaveBeenCalledWith(mockBot, mcData);
      expect(movements).toBeDefined();
    });

    it('should configure parkour-related properties on Movements', () => {
      const handler = new ParkourHandler(mockBot);
      const movements = handler.createParkourMovement({});
      expect(movements.allowParkour).toBe(true);
      expect(movements.allowSprinting).toBe(true);
    });

    it('should return null and log error on Movements failure', () => {
      Movements.mockImplementation(() => { throw new Error('test error'); });
      const handler = new ParkourHandler(mockBot);
      const result = handler.createParkourMovement({});
      expect(result).toBeNull();
      const logger = require('../../../src/utils/logger');
      expect(logger.error).toHaveBeenCalledWith(
        'ParkourHandler: Failed to create parkour movements',
        expect.objectContaining({ error: 'test error' })
      );
    });

    it('should set canDig to true on movements', () => {
      const handler = new ParkourHandler(mockBot);
      const movements = handler.createParkourMovement({});
      expect(movements.canDig).toBe(true);
    });

    it('should set dontCreateFlow to true on movements', () => {
      const handler = new ParkourHandler(mockBot);
      const movements = handler.createParkourMovement({});
      expect(movements.dontCreateFlow).toBe(true);
    });
  });

  // ─── Jump Distance Calculation ────────────────────────────────

  describe('Jump Distance Calculation', () => {
    it('should return 3.0 for walk jump', () => {
      const handler = new ParkourHandler(mockBot);
      expect(handler._calculateJumpDistance(false)).toBe(3.0);
    });

    it('should return 4.5 for sprint jump', () => {
      const handler = new ParkourHandler(mockBot);
      expect(handler._calculateJumpDistance(true)).toBe(4.5);
    });
  });

  // ─── Status Reporting ─────────────────────────────────────────

  describe('Status Reporting', () => {
    it('should return enabled status', () => {
      const handler = new ParkourHandler(mockBot);
      const status = handler.getStatus();
      expect(status.enabled).toBe(true);
    });

    it('should return health info', () => {
      mockBot.health = 18;
      const handler = new ParkourHandler(mockBot);
      const status = handler.getStatus();
      expect(status.health).toBe(18);
      expect(status.minHealth).toBe(SAFETY_DEFAULTS.minHealth);
    });

    it('should return lastGapDetected as null initially', () => {
      const handler = new ParkourHandler(mockBot);
      const status = handler.getStatus();
      expect(status.lastGapDetected).toBeNull();
    });

    it('should return jumpCount', () => {
      mockBot.blockAt = jest.fn(() => ({ name: 'stone' }));
      const handler = new ParkourHandler(mockBot);
      handler.analyzeJump({ x: 0, y: 64, z: 0 }, { x: 0, y: 64, z: 2 });
      const status = handler.getStatus();
      expect(status.jumpCount).toBe(1);
    });
  });

  // ─── Factory Function ─────────────────────────────────────────

  describe('Factory Function', () => {
    it('should create handler and return { handler, applied } when enabled', () => {
      featureFlags.isEnabled.mockReturnValue(true);
      const result = createParkourHandler(mockBot, {});
      expect(result.handler).toBeInstanceOf(ParkourHandler);
      expect(result.applied).toBe(true);
    });

    it('should create handler but not apply when disabled', () => {
      featureFlags.isEnabled.mockReturnValue(false);
      const result = createParkourHandler(mockBot, {});
      expect(result.handler).toBeInstanceOf(ParkourHandler);
      expect(result.applied).toBe(false);
    });

    it('should pass options to ParkourHandler', () => {
      const result = createParkourHandler(mockBot, {}, { minHealth: 15 });
      expect(result.handler.minHealth).toBe(15);
    });

    it('should return applied false when bot has no pathfinder', () => {
      const botNoPathfinder = createMockBot({ pathfinder: null });
      featureFlags.isEnabled.mockReturnValue(true);
      const result = createParkourHandler(botNoPathfinder, {});
      expect(result.handler).toBeInstanceOf(ParkourHandler);
      expect(result.applied).toBe(false);
    });
  });
});
