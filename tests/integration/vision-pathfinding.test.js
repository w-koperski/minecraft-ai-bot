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
const { createVisionPathfindingBridge } = require('../../src/pathfinding/vision-pathfinding-bridge');
const { WaterPathfinder } = require('../../src/pathfinding/water-pathfinder');
const { NetherPathfinder } = require('../../src/pathfinding/nether-pathfinder');
const { ParkourHandler } = require('../../src/pathfinding/parkour-handler');
const { SafetyChecker } = require('../../src/pathfinding/safety-checker');

function createVisionState(analysis) {
  return { getLatestAnalysis: jest.fn(() => analysis) };
}

function createBot(overrides = {}) {
  return {
    health: 20,
    entity: {
      position: {
        x: 0,
        y: 64,
        z: 0,
        floored: jest.fn(() => ({ x: 0, y: 64, z: 0 }))
      }
    },
    game: { dimension: 'minecraft:the_nether' },
    blockAt: jest.fn(() => ({ name: 'stone' })),
    pathfinder: { setMovements: jest.fn() },
    inventory: { items: jest.fn(() => []) },
    ...overrides
  };
}

describe('Vision + Pathfinding integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    featureFlags.isEnabled.mockImplementation(() => true);
    Movements.mockImplementation(() => ({
      liquidCost: 1,
      allowFreeMotion: true,
      infiniteLiquidDropdownDistance: true,
      dontCreateFlow: false,
      canDig: false,
      allowParkour: true,
      allowSprinting: true
    }));
  });

  it('uses vision to prefer shallow water routes', () => {
    const visionState = createVisionState({ timestamp: Date.now(), observations: ['deep water ahead', 'shallow route to right'] });
    const bridge = createVisionPathfindingBridge({ visionState });
    const pathfinder = new WaterPathfinder(createBot(), { visionBridge: bridge });

    const movements = pathfinder.createWaterMovement({});
    expect(bridge.getWaterHint()).toEqual(expect.objectContaining({ preferShallow: true, avoidDeep: true }));
    expect(movements.allowFreeMotion).toBe(false);
    expect(movements.liquidCost).toBeGreaterThan(1);
  });

  it('uses vision to widen nether lava avoidance', () => {
    const visionState = createVisionState({ timestamp: Date.now(), observations: ['lava pool and fire ahead'] });
    const bridge = createVisionPathfindingBridge({ visionState });
    const pathfinder = new NetherPathfinder(createBot(), { visionBridge: bridge });

    const movements = pathfinder.createNetherMovement({});
    expect(bridge.getNetherHint()).toEqual(expect.objectContaining({ increaseLavaAvoidance: true, avoidFire: true }));
    expect(movements.liquidCost).toBeGreaterThan(1);
  });

  it('uses vision to block risky parkour jumps', () => {
    const visionState = createVisionState({ timestamp: Date.now(), observations: ['dangerous gap 5 blocks ahead'] });
    const bridge = createVisionPathfindingBridge({ visionState });
    const handler = new ParkourHandler(createBot(), { visionBridge: bridge });

    const movements = handler.createParkourMovement({});
    expect(bridge.getParkourHint()).toEqual(expect.objectContaining({ blockRiskyJump: true }));
    expect(movements.allowParkour).toBe(false);
  });

  it('uses vision hazards in safety checks', () => {
    const visionState = createVisionState({ timestamp: Date.now(), threats: ['lava', 'drop'] });
    const bridge = createVisionPathfindingBridge({ visionState });
    const checker = new SafetyChecker(createBot({ health: 20 }), { visionBridge: bridge });

    expect(checker.getVisionSafetyHint()).toEqual(expect.objectContaining({ hasHazards: true }));
    expect(checker.isParkourSafe(20)).toBe(false);
  });
});
