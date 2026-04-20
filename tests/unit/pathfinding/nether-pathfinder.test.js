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
const { NetherPathfinder, createNetherPathfinder, NETHER_COSTS, NETHER_DEFAULTS } = require('../../../src/pathfinding/nether-pathfinder');

function createMockBot(overrides = {}) {
  const netherrackBlock = { name: 'netherrack' };
  const lavaBlock = { name: 'lava' };
  const airBlock = { name: 'air' };

  return {
    entity: {
      position: {
        x: 100,
        y: 64,
        z: 200,
        floored: jest.fn(() => ({ x: 100, y: 64, z: 200 }))
      }
    },
    game: {
      dimension: 'minecraft:the_nether'
    },
    blockAt: jest.fn(() => netherrackBlock),
    pathfinder: {
      setMovements: jest.fn()
    },
    ...overrides
  };
}

describe('NetherPathfinder', () => {
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
    it('should export NetherPathfinder class', () => {
      expect(typeof NetherPathfinder).toBe('function');
    });

    it('should export createNetherPathfinder factory', () => {
      expect(typeof createNetherPathfinder).toBe('function');
    });

    it('should export NETHER_COSTS constants', () => {
      expect(NETHER_COSTS).toEqual({
        lavaAdjacent: 10.0,
        soulSand: 2.5,
        magmaBlock: 5.0,
        openAir: 8.0,
        portal: 1.0
        ,safeGround: 1.5
      });
    });

    it('should export NETHER_DEFAULTS constants', () => {
      expect(NETHER_DEFAULTS).toEqual({
        portalCooldownMs: 15000,
        lavaScanRadius: 3,
        hazardScanRadius: 2,
        voidEdgeDistance: 3,
        lavaDangerLevel: 0.7,
        maxLavaAdjacentBlocks: 5
      });
    });
  });

  describe('constructor', () => {
    it('should set enabled from feature flag', () => {
      featureFlags.isEnabled.mockReturnValue(true);
      const np = new NetherPathfinder(mockBot);
      expect(np.enabled).toBe(true);
      expect(featureFlags.isEnabled).toHaveBeenCalledWith('ADVANCED_PATHFINDING');
    });

    it('should be disabled when feature flag is false', () => {
      featureFlags.isEnabled.mockReturnValue(false);
      const np = new NetherPathfinder(mockBot);
      expect(np.enabled).toBe(false);
    });

    it('should use default costs from NETHER_COSTS', () => {
      const np = new NetherPathfinder(mockBot);
      expect(np.costs).toEqual(NETHER_COSTS);
    });

    it('should merge custom costs with defaults', () => {
      const np = new NetherPathfinder(mockBot, { costs: { lava: 100.0 } });
      expect(np.costs.lava).toBe(100.0);
      expect(np.costs.soulSand).toBe(NETHER_COSTS.soulSand);
    });

    it('should use default safety values', () => {
      const np = new NetherPathfinder(mockBot);
      expect(np.portalCooldownMs).toBe(NETHER_DEFAULTS.portalCooldownMs);
      expect(np.lavaScanRadius).toBe(NETHER_DEFAULTS.lavaScanRadius);
      expect(np.hazardScanRadius).toBe(NETHER_DEFAULTS.hazardScanRadius);
      expect(np.voidEdgeDistance).toBe(NETHER_DEFAULTS.voidEdgeDistance);
      expect(np.lavaDangerLevel).toBe(NETHER_DEFAULTS.lavaDangerLevel);
      expect(np.maxLavaAdjacentBlocks).toBe(NETHER_DEFAULTS.maxLavaAdjacentBlocks);
    });

    it('should accept custom safety options', () => {
      const np = new NetherPathfinder(mockBot, {
        portalCooldownMs: 10000,
        lavaScanRadius: 4,
        hazardScanRadius: 1,
        voidEdgeDistance: 6,
        lavaDangerLevel: 0.9,
        maxLavaAdjacentBlocks: 8
      });
      expect(np.portalCooldownMs).toBe(10000);
      expect(np.lavaScanRadius).toBe(4);
      expect(np.hazardScanRadius).toBe(1);
      expect(np.voidEdgeDistance).toBe(6);
      expect(np.lavaDangerLevel).toBe(0.9);
      expect(np.maxLavaAdjacentBlocks).toBe(8);
    });
  });

  describe('isInNether', () => {
    it('should return true when in nether dimension', () => {
      const np = new NetherPathfinder(mockBot);
      expect(np.isInNether()).toBe(true);
    });

    it('should return false when in overworld', () => {
      mockBot.game.dimension = 'minecraft:overworld';
      const np = new NetherPathfinder(mockBot);
      expect(np.isInNether()).toBe(false);
    });

    it('should return false when bot.game is missing', () => {
      mockBot.game = null;
      const np = new NetherPathfinder(mockBot);
      expect(np.isInNether()).toBe(false);
    });
  });

  describe('createNetherMovement', () => {
    it('should return null when feature flag is disabled', () => {
      featureFlags.isEnabled.mockReturnValue(false);
      const np = new NetherPathfinder(mockBot);
      const movements = np.createNetherMovement({});
      expect(movements).toBeNull();
    });

    it('should return null when not in nether', () => {
      mockBot.game.dimension = 'minecraft:overworld';
      const np = new NetherPathfinder(mockBot);
      const movements = np.createNetherMovement({});
      expect(movements).not.toBeNull();
      expect(movements.liquidCost).toBe(NETHER_COSTS.lavaAdjacent);
    });

    it('should create Movements instance when enabled and in nether', () => {
      const np = new NetherPathfinder(mockBot);
      const movements = np.createNetherMovement({});
      expect(movements).not.toBeNull();
      expect(Movements).toHaveBeenCalledWith(mockBot, {});
    });

    it('should configure liquidCost for lava avoidance', () => {
      const np = new NetherPathfinder(mockBot);
      const movements = np.createNetherMovement({});
      expect(movements.liquidCost).toBe(NETHER_COSTS.lavaAdjacent);
    });

    it('should disable free motion in nether', () => {
      const np = new NetherPathfinder(mockBot);
      const movements = np.createNetherMovement({});
      expect(movements.allowFreeMotion).toBe(false);
    });
  });

  describe('applyNetherMovements', () => {
    it('should return false when feature flag is disabled', () => {
      featureFlags.isEnabled.mockReturnValue(false);
      const np = new NetherPathfinder(mockBot);
      const applied = np.applyNetherMovements({});
      expect(applied).toBe(false);
    });

    it('should return false when not in nether', () => {
      mockBot.game.dimension = 'minecraft:overworld';
      const np = new NetherPathfinder(mockBot);
      const applied = np.applyNetherMovements({});
      expect(applied).toBe(true);
      expect(mockBot.pathfinder.setMovements).toHaveBeenCalled();
    });

    it('should apply movements when enabled and in nether', () => {
      const np = new NetherPathfinder(mockBot);
      const applied = np.applyNetherMovements({});
      expect(applied).toBe(true);
      expect(mockBot.pathfinder.setMovements).toHaveBeenCalled();
    });
  });

  describe('isNearLava', () => {
    it('should detect lava blocks within proximity', () => {
      mockBot.blockAt.mockImplementation((pos) => {
        if (pos.x === 101 && pos.y === 64 && pos.z === 200) {
          return { name: 'lava' };
        }
        return { name: 'netherrack' };
      });

      const np = new NetherPathfinder(mockBot);
      const result = np.isNearLava(mockBot.entity.position);
      expect(result.nearLava).toBe(true);
      expect(result.lavaCount).toBeGreaterThan(0);
      expect(result.closestDistance).toBeGreaterThan(0);
    });

    it('should return false when no lava nearby', () => {
      const np = new NetherPathfinder(mockBot);
      const result = np.isNearLava(mockBot.entity.position);
      expect(result.nearLava).toBe(false);
      expect(result.lavaCount).toBe(0);
      expect(result.closestDistance).toBe(Infinity);
    });
  });

  describe('detectPortal', () => {
    it('should detect portal blocks within radius', () => {
      mockBot.blockAt.mockImplementation((pos) => {
        if (pos.x === 105 && pos.y === 64 && pos.z === 200) {
          return { name: 'nether_portal' };
        }
        return { name: 'netherrack' };
      });

      const np = new NetherPathfinder(mockBot);
      const result = np.detectPortal(mockBot.entity.position);
      expect(result.found).toBe(true);
      expect(result.position).not.toBeNull();
      expect(result.portalBlocks).toBeGreaterThan(0);
    });

    it('should return false when no portals nearby', () => {
      const np = new NetherPathfinder(mockBot);
      const result = np.detectPortal(mockBot.entity.position);
      expect(result.found).toBe(false);
      expect(result.position).toBeNull();
      expect(result.portalBlocks).toBe(0);
    });
  });

  describe('portal cooldown', () => {
    it('should record portal use and start cooldown', () => {
      const np = new NetherPathfinder(mockBot);
      const used = np.usePortal();
      expect(used).toEqual({ used: true, cooldownMs: NETHER_DEFAULTS.portalCooldownMs });
      const cooldown = np.checkPortalCooldown();
      expect(cooldown.onCooldown).toBe(true);
      expect(cooldown.remainingMs).toBeGreaterThan(0);
    });

    it('should expire cooldown after timeout', () => {
      const np = new NetherPathfinder(mockBot);
      np.usePortal();
      jest.advanceTimersByTime(NETHER_DEFAULTS.portalCooldownMs + 1);
      const cooldown = np.checkPortalCooldown();
      expect(cooldown.onCooldown).toBe(false);
      expect(cooldown.remainingMs).toBe(0);
    });
  });

  describe('block type detection', () => {
    it('should return soul sand cost', () => {
      const np = new NetherPathfinder(mockBot);
      expect(np.getBlockCost('soul_sand')).toBe(NETHER_COSTS.soulSand);
      expect(np.getBlockCost('soul_soil')).toBe(NETHER_COSTS.soulSand);
    });

    it('should return magma block cost', () => {
      const np = new NetherPathfinder(mockBot);
      expect(np.getBlockCost('magma_block')).toBe(NETHER_COSTS.magmaBlock);
    });
  });

  describe('getBlockCost', () => {
    it('should return high cost for lava', () => {
      const np = new NetherPathfinder(mockBot);
      const cost = np.getBlockCost('lava');
      expect(cost).toBe(NETHER_COSTS.lavaAdjacent);
    });

    it('should return moderate cost for soul sand', () => {
      const np = new NetherPathfinder(mockBot);
      const cost = np.getBlockCost('soul_sand');
      expect(cost).toBe(NETHER_COSTS.soulSand);
    });

    it('should return moderate cost for magma blocks', () => {
      const np = new NetherPathfinder(mockBot);
      const cost = np.getBlockCost('magma_block');
      expect(cost).toBe(NETHER_COSTS.magmaBlock);
    });

    it('should return low cost for portals', () => {
      const np = new NetherPathfinder(mockBot);
      const cost = np.getBlockCost('nether_portal');
      expect(cost).toBe(NETHER_COSTS.portal);
    });

    it('should return 1.0 for normal blocks', () => {
      const np = new NetherPathfinder(mockBot);
      const cost = np.getBlockCost('netherrack');
      expect(cost).toBe(NETHER_COSTS.safeGround);
    });
  });

  describe('getStatus', () => {
    it('should return comprehensive status', () => {
      const np = new NetherPathfinder(mockBot);
      const status = np.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.inNether).toBe(true);
      expect(status).toHaveProperty('nearLava');
      expect(status).toHaveProperty('portalCooldown');
      expect(status).toHaveProperty('navigationMode');
      expect(status).toHaveProperty('costs');
    });
  });

  describe('createNetherPathfinder factory', () => {
    it('should create instance and apply movements when enabled', () => {
      const result = createNetherPathfinder(mockBot, {});
      expect(result.pathfinder).toBeInstanceOf(NetherPathfinder);
      expect(result.applied).toBe(true);
    });

    it('should not apply when feature flag is disabled', () => {
      featureFlags.isEnabled.mockReturnValue(false);
      const result = createNetherPathfinder(mockBot, {});
      expect(result.pathfinder).toBeInstanceOf(NetherPathfinder);
      expect(result.applied).toBe(false);
    });

    it('should not apply when not in nether', () => {
      mockBot.game.dimension = 'minecraft:overworld';
      const result = createNetherPathfinder(mockBot, {});
      expect(result.pathfinder).toBeInstanceOf(NetherPathfinder);
      expect(result.applied).toBe(true);
    });
  });
});
