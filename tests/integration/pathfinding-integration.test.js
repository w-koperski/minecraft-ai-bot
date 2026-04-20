/**
 * Pathfinding Integration Tests
 *
 * Verifies cross-module interactions between all 4 pathfinding modules
 * (water, nether, parkour, safety) and the vision-pathfinding bridge.
 *
 * Tests integration scenarios, NOT individual module logic (that's unit tests).
 */

jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('../../src/utils/feature-flags', () => ({
  isEnabled: jest.fn()
}));

jest.mock('mineflayer-pathfinder', () => ({
  Movements: jest.fn()
}));

const featureFlags = require('../../src/utils/feature-flags');
const { Movements } = require('mineflayer-pathfinder');
const { WaterPathfinder, createWaterPathfinder } = require('../../src/pathfinding/water-pathfinder');
const { NetherPathfinder, createNetherPathfinder } = require('../../src/pathfinding/nether-pathfinder');
const { ParkourHandler, createParkourHandler } = require('../../src/pathfinding/parkour-handler');
const { SafetyChecker, createSafetyChecker } = require('../../src/pathfinding/safety-checker');
const { VisionPathfindingBridge, createVisionPathfindingBridge } = require('../../src/pathfinding/vision-pathfinding-bridge');

// ─── Helpers ──────────────────────────────────────────────────

function createBot(overrides = {}) {
  return {
    health: 20,
    food: 20,
    isInWater: false,
    oxygenLevel: 300,
    entity: {
      position: {
        x: 0, y: 64, z: 0,
        floored: jest.fn().mockReturnValue({ x: 0, y: 64, z: 0, offset: jest.fn((dx, dy, dz) => ({ x: dx, y: 64 + dy, z: dz })) })
      },
      headInWater: false,
      inWater: false
    },
    game: { dimension: 'minecraft:overworld' },
    blockAt: jest.fn(() => ({ name: 'stone' })),
    pathfinder: { setMovements: jest.fn() },
    inventory: { items: jest.fn(() => []) },
    ...overrides
  };
}

function createVisionState(analysis) {
  return { getLatestAnalysis: jest.fn(() => analysis) };
}

function freshTimestamp() {
  return Date.now();
}

function setupMovementsMock() {
  Movements.mockImplementation(() => ({
    liquidCost: 1,
    allowFreeMotion: true,
    infiniteLiquidDropdownDistance: true,
    dontCreateFlow: false,
    canDig: false,
    allowParkour: true,
    allowSprinting: true
  }));
}

// ─── Test Suite ───────────────────────────────────────────────

describe('Pathfinding Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    featureFlags.isEnabled.mockImplementation(() => true);
    setupMovementsMock();
  });

  // ═══════════════════════════════════════════════════════════
  // Scenario 1: Water + Safety Integration
  // ═══════════════════════════════════════════════════════════

  describe('Scenario 1: Water + Safety Integration', () => {
    it('SafetyChecker allows water navigation when under 30s timeout', () => {
      const bot = createBot({ isInWater: true });
      const checker = new SafetyChecker(bot);

      // Simulate bot entering water 29s ago
      checker.startWaterTracking();
      checker._waterEntryTime = Date.now() - 29000;

      const safe = checker.checkWaterTimeout();
      expect(safe).toBe(true);
    });

    it('SafetyChecker blocks water navigation after 30s without boat', () => {
      const bot = createBot({ isInWater: true });
      const checker = new SafetyChecker(bot);

      // Simulate bot in water for 31s
      checker.startWaterTracking();
      checker._waterEntryTime = Date.now() - 31000;

      const safe = checker.checkWaterTimeout();
      expect(safe).toBe(false);
    });

    it('SafetyChecker allows water navigation at exactly 30s (boundary-inclusive)', () => {
      const bot = createBot({ isInWater: true });
      const checker = new SafetyChecker(bot);

      checker.startWaterTracking();
      checker._waterEntryTime = Date.now() - 30000;

      const safe = checker.checkWaterTimeout();
      expect(safe).toBe(true);
    });

    it('boat presence overrides water timeout', () => {
      const bot = createBot({
        isInWater: true,
        inventory: { items: jest.fn(() => [{ name: 'oak_boat' }]) }
      });
      const checker = new SafetyChecker(bot);

      // 60s in water - way past timeout
      checker.startWaterTracking();
      checker._waterEntryTime = Date.now() - 60000;

      const safe = checker.checkWaterTimeout();
      expect(safe).toBe(true);
    });

    it('WaterPathfinder and SafetyChecker share consistent timeout config', () => {
      const bot = createBot();
      const waterPf = new WaterPathfinder(bot, { maxWaterTime: 25000 });
      const checker = new SafetyChecker(bot, { maxWaterTime: 25000 });

      expect(waterPf.maxWaterTime).toBe(25000);
      expect(checker.maxWaterTime).toBe(25000);
    });

    it('WaterPathfinder creates movements while SafetyChecker tracks water time', () => {
      const bot = createBot({ isInWater: true });
      const mcData = {};

      const waterPf = new WaterPathfinder(bot);
      const checker = new SafetyChecker(bot);

      // Water pathfinder creates movement config
      const movements = waterPf.createWaterMovement(mcData);
      expect(movements).not.toBeNull();
      expect(movements.liquidCost).toBeGreaterThanOrEqual(1);

      // Safety checker tracks water time concurrently
      checker.startWaterTracking();
      expect(checker._waterTracking).toBe(true);

      // After some time, check safety
      const safe = checker.checkWaterTimeout();
      expect(safe).toBe(true);

      checker.stopWaterTracking();
      expect(checker._waterTracking).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Scenario 2: Nether + Safety Integration
  // ═══════════════════════════════════════════════════════════

  describe('Scenario 2: Nether + Safety Integration', () => {
    it('NetherPathfinder increases costs near lava while SafetyChecker blocks parkour at low health', () => {
      const bot = createBot({
        health: 8,
        game: { dimension: 'minecraft:the_nether' },
        blockAt: jest.fn((pos) => {
          // Lava at adjacent positions
          if (pos.x === 1 && pos.y === 64) return { name: 'lava' };
          return { name: 'netherrack' };
        })
      });

      const netherPf = new NetherPathfinder(bot);
      const checker = new SafetyChecker(bot);

      // Nether pathfinder detects lava nearby
      const lavaResult = netherPf.isNearLava({ x: 0, y: 64, z: 0 });
      expect(lavaResult.nearLava).toBe(true);
      expect(lavaResult.lavaCount).toBeGreaterThan(0);

      // Safety checker blocks parkour due to low health (8 <= 10)
      const parkourSafe = checker.isParkourSafe(8);
      expect(parkourSafe).toBe(false);
    });

    it('allows navigation in nether with healthy bot and no hazards', () => {
      const bot = createBot({
        health: 20,
        game: { dimension: 'minecraft:the_nether' },
        blockAt: jest.fn(() => ({ name: 'netherrack' }))
      });
      const mcData = {};

      const netherPf = new NetherPathfinder(bot);
      const checker = new SafetyChecker(bot);

      // Nether pathfinder creates movement config
      const movements = netherPf.createNetherMovement(mcData);
      expect(movements).not.toBeNull();

      // No lava nearby
      const lavaResult = netherPf.isNearLava({ x: 0, y: 64, z: 0 });
      expect(lavaResult.nearLava).toBe(false);

      // Safety checker allows parkour at full health
      const parkourSafe = checker.isParkourSafe(20);
      expect(parkourSafe).toBe(true);
    });

    it('nether hazard level influences navigation mode', () => {
      const bot = createBot({
        game: { dimension: 'minecraft:the_nether' },
        blockAt: jest.fn((pos) => {
          // Magma blocks and fire nearby
          if (pos.y === 63) return { name: 'magma_block' };
          if (pos.x === 1 && pos.y === 64) return { name: 'fire' };
          return { name: 'netherrack' };
        })
      });

      const netherPf = new NetherPathfinder(bot);

      // Detect hazards
      const hazards = netherPf.detectHazards({ x: 0, y: 64, z: 0 });
      expect(hazards.hazardLevel).toBeGreaterThan(0);
      expect(hazards.magmaBlocks).toBeGreaterThan(0);

      // Navigation mode reflects hazard level
      const mode = netherPf.getNavigationMode();
      expect(['nether_cautious', 'nether_danger']).toContain(mode);
    });

    it('portal cooldown prevents rapid re-entry', () => {
      const bot = createBot({
        game: { dimension: 'minecraft:the_nether' }
      });

      const netherPf = new NetherPathfinder(bot, { portalCooldownMs: 100 });

      // Use portal
      const result = netherPf.usePortal();
      expect(result.used).toBe(true);

      // Immediate re-use blocked
      const result2 = netherPf.usePortal();
      expect(result2.used).toBe(false);
      expect(result2.cooldownMs).toBeGreaterThan(0);

      // Cleanup timer
      netherPf.clearPortalCooldown();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Scenario 3: Parkour + Safety Integration
  // ═══════════════════════════════════════════════════════════

  describe('Scenario 3: Parkour + Safety Integration', () => {
    it('SafetyChecker blocks parkour when health is at threshold (health=10, minHealth=10)', () => {
      const bot = createBot({ health: 10 });
      const checker = new SafetyChecker(bot, { minHealth: 10 });

      // health=10 is NOT > 10, so parkour blocked (strict greater-than)
      expect(checker.isParkourSafe(10)).toBe(false);
    });

    it('SafetyChecker allows parkour when health is above threshold', () => {
      const bot = createBot({ health: 15 });
      const checker = new SafetyChecker(bot, { minHealth: 10 });

      expect(checker.isParkourSafe(15)).toBe(true);
    });

    it('ParkourHandler detects gap and SafetyChecker validates health for jump', () => {
      const bot = createBot({
        health: 15,
        blockAt: jest.fn((pos) => {
          // 3-block gap: air at y=63 for x=1,2,3, solid at x=4
          if (pos.y === 63) {
            if (pos.x >= 1 && pos.x <= 3) return { name: 'air' };
            if (pos.x === 4) return { name: 'stone' };
          }
          return { name: 'stone' };
        })
      });

      const handler = new ParkourHandler(bot);
      const checker = new SafetyChecker(bot);

      // Detect gap ahead (forward direction +x)
      const gap = handler.detectGap(
        { x: 0, y: 64, z: 0 },
        { x: 1, z: 0 }
      );
      expect(gap.gapDetected).toBe(true);
      expect(gap.gapWidth).toBe(3);

      // Safety checker allows jump at health=15
      expect(checker.isParkourSafe(15)).toBe(true);

      // Analyze the jump
      const jump = handler.analyzeJump(
        { x: 0, y: 64, z: 0 },
        gap.landingPosition
      );
      expect(jump.jumpable).toBe(true);
    });

    it('ParkourHandler detects gap but SafetyChecker blocks at low health', () => {
      const bot = createBot({
        health: 9,
        blockAt: jest.fn((pos) => {
          if (pos.y === 63) {
            if (pos.x >= 1 && pos.x <= 3) return { name: 'air' };
            if (pos.x === 4) return { name: 'stone' };
          }
          return { name: 'stone' };
        })
      });

      const handler = new ParkourHandler(bot);
      const checker = new SafetyChecker(bot);

      // Gap exists
      const gap = handler.detectGap(
        { x: 0, y: 64, z: 0 },
        { x: 1, z: 0 }
      );
      expect(gap.gapDetected).toBe(true);

      // But safety blocks it (health=9 <= 10)
      expect(checker.isParkourSafe(9)).toBe(false);
    });

    it('ParkourHandler health check is consistent with SafetyChecker', () => {
      const bot = createBot({ health: 10 });
      const handler = new ParkourHandler(bot, { minHealth: 10 });
      const checker = new SafetyChecker(bot, { minHealth: 10 });

      // Both use strict greater-than: health=10 is NOT safe
      expect(handler.checkHealthSafety()).toBe(false);
      expect(checker.isParkourSafe(10)).toBe(false);

      // health=11 IS safe
      bot.health = 11;
      expect(handler.checkHealthSafety()).toBe(true);
      expect(checker.isParkourSafe(11)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Scenario 4: Vision Integration with All Pathfinders
  // ═══════════════════════════════════════════════════════════

  describe('Scenario 4: Vision Integration', () => {
    it('vision "deep water" hint increases WaterPathfinder costs', () => {
      const visionState = createVisionState({
        timestamp: freshTimestamp(),
        observations: ['deep water ahead', 'shallow route to right']
      });
      const bridge = createVisionPathfindingBridge({ visionState });
      const bot = createBot();
      const waterPf = new WaterPathfinder(bot, { visionBridge: bridge });

      const hint = bridge.getWaterHint();
      expect(hint).not.toBeNull();
      expect(hint.preferShallow).toBe(true);
      expect(hint.avoidDeep).toBe(true);

      const movements = waterPf.createWaterMovement({});
      expect(movements.allowFreeMotion).toBe(false);
      expect(movements.liquidCost).toBeGreaterThan(1);
    });

    it('vision "lava pool" hint increases NetherPathfinder lava avoidance', () => {
      const visionState = createVisionState({
        timestamp: freshTimestamp(),
        observations: ['lava pool nearby', 'fire ahead']
      });
      const bridge = createVisionPathfindingBridge({ visionState });
      const bot = createBot({ game: { dimension: 'minecraft:the_nether' } });
      const netherPf = new NetherPathfinder(bot, { visionBridge: bridge });

      const hint = bridge.getNetherHint();
      expect(hint).not.toBeNull();
      expect(hint.increaseLavaAvoidance).toBe(true);
      expect(hint.avoidFire).toBe(true);

      const movements = netherPf.createNetherMovement({});
      // Base lava cost is 10.0, vision adds +2
      expect(movements.liquidCost).toBeGreaterThanOrEqual(12);
    });

    it('vision "dangerous gap" hint blocks ParkourHandler jumps', () => {
      const visionState = createVisionState({
        timestamp: freshTimestamp(),
        observations: ['dangerous gap 5 blocks ahead']
      });
      const bridge = createVisionPathfindingBridge({ visionState });
      const bot = createBot();
      const handler = new ParkourHandler(bot, { visionBridge: bridge });

      const hint = bridge.getParkourHint();
      expect(hint).not.toBeNull();
      expect(hint.blockRiskyJump).toBe(true);

      const movements = handler.createParkourMovement({});
      expect(movements.allowParkour).toBe(false);
    });

    it('vision hazards cause SafetyChecker to block parkour', () => {
      const visionState = createVisionState({
        timestamp: freshTimestamp(),
        threats: ['lava', 'drop']
      });
      const bridge = createVisionPathfindingBridge({ visionState });
      const bot = createBot({ health: 20 });
      const checker = new SafetyChecker(bot, { visionBridge: bridge });

      const hint = checker.getVisionSafetyHint();
      expect(hint).not.toBeNull();
      expect(hint.hasHazards).toBe(true);
      expect(hint.hazards).toEqual(expect.arrayContaining(['lava']));

      // Even at full health, vision hazards block parkour
      expect(checker.isParkourSafe(20)).toBe(false);
    });

    it('stale vision data is ignored by all pathfinders', () => {
      const staleTimestamp = Date.now() - 35000; // 35s old (>30s threshold)
      const visionState = createVisionState({
        timestamp: staleTimestamp,
        observations: ['deep water ahead'],
        threats: ['lava']
      });
      const bridge = createVisionPathfindingBridge({ visionState });

      // All hints return null for stale data
      expect(bridge.getWaterHint()).toBeNull();
      expect(bridge.getNetherHint()).toBeNull();
      expect(bridge.getParkourHint()).toBeNull();
      expect(bridge.getSafetyHint()).toBeNull();
    });

    it('vision bridge disabled when VISION flag is off', () => {
      featureFlags.isEnabled.mockImplementation((flag) => {
        if (flag === 'VISION') return false;
        return true;
      });

      const visionState = createVisionState({
        timestamp: freshTimestamp(),
        observations: ['deep water ahead']
      });
      const bridge = createVisionPathfindingBridge({ visionState });

      expect(bridge.isEnabled()).toBe(false);
      expect(bridge.getWaterHint()).toBeNull();
    });

    it('all pathfinders work without vision bridge (graceful degradation)', () => {
      const bot = createBot();
      const mcData = {};

      // Create pathfinders without vision bridge (default null visionState)
      const waterPf = new WaterPathfinder(bot);
      const netherPf = new NetherPathfinder(bot);
      const handler = new ParkourHandler(bot);
      const checker = new SafetyChecker(bot);

      // All create movements successfully
      expect(waterPf.createWaterMovement(mcData)).not.toBeNull();
      expect(netherPf.createNetherMovement(mcData)).not.toBeNull();
      expect(handler.createParkourMovement(mcData)).not.toBeNull();

      // Safety checker works without vision
      expect(checker.isParkourSafe(20)).toBe(true);
    });

    it('vision bridge summary aggregates all hints', () => {
      const visionState = createVisionState({
        timestamp: freshTimestamp(),
        observations: ['deep water ahead', 'lava pool nearby', 'dangerous gap'],
        threats: ['fire']
      });
      const bridge = createVisionPathfindingBridge({ visionState });

      const summary = bridge.getSummary();
      expect(summary.enabled).toBe(true);
      expect(summary.water).not.toBeNull();
      expect(summary.nether).not.toBeNull();
      expect(summary.parkour).not.toBeNull();
      expect(summary.safety).not.toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Scenario 5: Feature Flag Isolation
  // ═══════════════════════════════════════════════════════════

  describe('Scenario 5: Feature Flag Isolation', () => {
    beforeEach(() => {
      featureFlags.isEnabled.mockImplementation(() => false);
    });

    it('WaterPathfinder returns null movements when ADVANCED_PATHFINDING=false', () => {
      const bot = createBot();
      const waterPf = new WaterPathfinder(bot);

      expect(waterPf.enabled).toBe(false);
      expect(waterPf.createWaterMovement({})).toBeNull();
    });

    it('NetherPathfinder returns null movements when ADVANCED_PATHFINDING=false', () => {
      const bot = createBot({ game: { dimension: 'minecraft:the_nether' } });
      const netherPf = new NetherPathfinder(bot);

      expect(netherPf.enabled).toBe(false);
      expect(netherPf.createNetherMovement({})).toBeNull();
    });

    it('ParkourHandler returns null movements when ADVANCED_PATHFINDING=false', () => {
      const bot = createBot();
      const handler = new ParkourHandler(bot);

      expect(handler.enabled).toBe(false);
      expect(handler.createParkourMovement({})).toBeNull();
    });

    it('SafetyChecker returns false for parkour when ADVANCED_PATHFINDING=false', () => {
      const bot = createBot({ health: 20 });
      const checker = new SafetyChecker(bot);

      expect(checker.enabled).toBe(false);
      expect(checker.isParkourSafe(20)).toBe(false);
    });

    it('SafetyChecker returns false for water timeout when ADVANCED_PATHFINDING=false', () => {
      const bot = createBot({ isInWater: true });
      const checker = new SafetyChecker(bot);

      expect(checker.enabled).toBe(false);
      expect(checker.checkWaterTimeout()).toBe(false);
    });

    it('factory functions return applied=false when feature flag disabled', () => {
      const bot = createBot();
      const mcData = {};

      const water = createWaterPathfinder(bot, mcData);
      expect(water.applied).toBe(false);
      expect(water.pathfinder).toBeDefined();

      const nether = createNetherPathfinder(bot, mcData);
      expect(nether.applied).toBe(false);
      expect(nether.pathfinder).toBeDefined();

      const parkour = createParkourHandler(bot, mcData);
      expect(parkour.applied).toBe(false);
      expect(parkour.handler).toBeDefined();

      const safety = createSafetyChecker(bot, mcData);
      expect(safety.applied).toBe(false);
      expect(safety.checker).toBeDefined();
    });

    it('bot pathfinder.setMovements is never called when feature flag disabled', () => {
      const bot = createBot();
      const mcData = {};

      const waterPf = new WaterPathfinder(bot);
      waterPf.applyWaterMovements(mcData);

      const netherPf = new NetherPathfinder(bot);
      netherPf.applyNetherMovements(mcData);

      const handler = new ParkourHandler(bot);
      handler.applyParkourMovements(mcData);

      expect(bot.pathfinder.setMovements).not.toHaveBeenCalled();
    });

    it('VisionPathfindingBridge disabled when ADVANCED_PATHFINDING=false', () => {
      const visionState = createVisionState({
        timestamp: freshTimestamp(),
        observations: ['deep water ahead']
      });
      const bridge = createVisionPathfindingBridge({ visionState });

      expect(bridge.isEnabled()).toBe(false);
      expect(bridge.getWaterHint()).toBeNull();
      expect(bridge.getNetherHint()).toBeNull();
      expect(bridge.getParkourHint()).toBeNull();
      expect(bridge.getSafetyHint()).toBeNull();
    });

    it('re-enabling feature flag activates pathfinders', () => {
      // Start disabled
      featureFlags.isEnabled.mockImplementation(() => false);
      const bot = createBot();
      const disabledWater = new WaterPathfinder(bot);
      expect(disabledWater.enabled).toBe(false);

      // Re-enable
      featureFlags.isEnabled.mockImplementation(() => true);
      const enabledWater = new WaterPathfinder(bot);
      expect(enabledWater.enabled).toBe(true);
      expect(enabledWater.createWaterMovement({})).not.toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Cross-module coordination scenarios
  // ═══════════════════════════════════════════════════════════

  describe('Cross-module coordination', () => {
    it('all pathfinders can be created with shared vision bridge', () => {
      const visionState = createVisionState({
        timestamp: freshTimestamp(),
        observations: ['clear terrain ahead']
      });
      const bridge = createVisionPathfindingBridge({ visionState });
      const bot = createBot();

      const waterPf = new WaterPathfinder(bot, { visionBridge: bridge });
      const netherPf = new NetherPathfinder(bot, { visionBridge: bridge });
      const handler = new ParkourHandler(bot, { visionBridge: bridge });
      const checker = new SafetyChecker(bot, { visionBridge: bridge });

      // All share the same bridge instance
      expect(waterPf.visionBridge).toBe(bridge);
      expect(netherPf.visionBridge).toBe(bridge);
      expect(handler.visionBridge).toBe(bridge);
      expect(checker.visionBridge).toBe(bridge);
    });

    it('status reports from all modules are consistent', () => {
      const bot = createBot({ health: 15 });
      const mcData = {};

      const waterPf = new WaterPathfinder(bot);
      const netherPf = new NetherPathfinder(bot);
      const handler = new ParkourHandler(bot);
      const checker = new SafetyChecker(bot);

      const waterStatus = waterPf.getStatus();
      const netherStatus = netherPf.getStatus();
      const parkourStatus = handler.getStatus();
      const safetyStatus = checker.getStatus();

      // All report enabled state
      expect(waterStatus.enabled).toBe(true);
      expect(netherStatus.enabled).toBe(true);
      expect(parkourStatus.enabled).toBe(true);
      expect(safetyStatus.enabled).toBe(true);
    });

    it('nether pathfinder and safety checker coordinate on hazardous terrain', () => {
      const bot = createBot({
        health: 8,
        game: { dimension: 'minecraft:the_nether' },
        blockAt: jest.fn((pos) => {
          if (pos.y === 63) return { name: 'magma_block' };
          if (pos.x === 2 && pos.y === 64) return { name: 'lava' };
          return { name: 'netherrack' };
        })
      });

      const netherPf = new NetherPathfinder(bot);
      const checker = new SafetyChecker(bot);

      // Nether detects hazards
      const hazards = netherPf.detectHazards({ x: 0, y: 64, z: 0 });
      expect(hazards.hazardLevel).toBeGreaterThan(0);

      // Safety blocks parkour at low health
      expect(checker.isParkourSafe(bot.health)).toBe(false);

      // Combined decision: don't attempt parkour in hazardous nether with low health
      const shouldAttemptParkour = checker.isParkourSafe(bot.health) && hazards.hazardLevel < 0.5;
      expect(shouldAttemptParkour).toBe(false);
    });

    it('water pathfinder and parkour handler can coexist for mixed terrain', () => {
      const bot = createBot({ health: 20 });
      const mcData = {};

      const waterPf = new WaterPathfinder(bot);
      const handler = new ParkourHandler(bot);

      // Both create valid movements
      const waterMov = waterPf.createWaterMovement(mcData);
      const parkourMov = handler.createParkourMovement(mcData);

      expect(waterMov).not.toBeNull();
      expect(parkourMov).not.toBeNull();

      // Water movements allow parkour (for mixed terrain)
      expect(waterMov.allowParkour).toBe(true);
    });
  });
});
