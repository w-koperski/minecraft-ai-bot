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
  VisionPathfindingBridge,
  createVisionPathfindingBridge,
  VISION_STALE_MS
} = require('../../../src/pathfinding/vision-pathfinding-bridge');

function createVisionState(analysis = null) {
  return {
    getLatestAnalysis: jest.fn(() => analysis)
  };
}

describe('VisionPathfindingBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    featureFlags.isEnabled.mockImplementation((name) => name === 'VISION' || name === 'ADVANCED_PATHFINDING');
  });

  it('disables when either feature flag is off', () => {
    featureFlags.isEnabled.mockImplementation((name) => name !== 'VISION');
    const bridge = new VisionPathfindingBridge({ visionState: createVisionState({ timestamp: Date.now() }) });
    expect(bridge.isEnabled()).toBe(false);
  });

  it('returns null when analysis is stale', () => {
    const bridge = new VisionPathfindingBridge({
      visionState: createVisionState({ timestamp: Date.now() - (VISION_STALE_MS + 1), observations: ['deep water'] })
    });

    expect(bridge.getWaterHint()).toBeNull();
  });

  it('builds water hints from observations', () => {
    const bridge = new VisionPathfindingBridge({
      visionState: createVisionState({
        timestamp: Date.now(),
        observations: ['deep water ahead', 'strong current to the left']
      })
    });

    expect(bridge.getWaterHint()).toEqual(expect.objectContaining({
      avoidDeep: true,
      avoidCurrents: true
    }));
  });

  it('builds nether hints from hazards', () => {
    const bridge = new VisionPathfindingBridge({
      visionState: createVisionState({
        timestamp: Date.now(),
        observations: ['lava pool nearby', 'dangerous drop']
      })
    });

    expect(bridge.getNetherHint()).toEqual(expect.objectContaining({
      increaseLavaAvoidance: true,
      widenVoidBuffer: true
    }));
  });

  it('blocks risky parkour jumps from vision', () => {
    const bridge = new VisionPathfindingBridge({
      visionState: createVisionState({
        timestamp: Date.now(),
        observations: ['dangerous gap 5 blocks ahead']
      })
    });

    expect(bridge.getParkourHint()).toEqual(expect.objectContaining({
      blockRiskyJump: true,
      requireVisualConfirmation: true
    }));
  });

  it('detects safety hazards from vision', () => {
    const bridge = new VisionPathfindingBridge({
      visionState: createVisionState({
        timestamp: Date.now(),
        threats: ['lava', 'fire']
      })
    });

    expect(bridge.getSafetyHint()).toEqual(expect.objectContaining({
      hasHazards: true,
      hazards: expect.arrayContaining(['lava', 'fire'])
    }));
  });

  it('exposes a combined summary', () => {
    const bridge = createVisionPathfindingBridge({
      visionState: createVisionState({
        timestamp: Date.now(),
        observations: ['shallow water', 'lava nearby']
      })
    });

    const summary = bridge.getSummary();
    expect(summary.enabled).toBe(true);
    expect(summary.water).toEqual(expect.objectContaining({ preferShallow: true }));
    expect(summary.nether).toEqual(expect.objectContaining({ increaseLavaAvoidance: true }));
  });
});
