jest.mock('lockfile', () => ({}));
jest.mock('../../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('../../../src/utils/feature-flags', () => ({
  isEnabled: jest.fn()
}));

jest.mock('../../../src/utils/state-manager', () => {
  return class StateManager {
    constructor() {}
    async read() { return null; }
    async write() { return true; }
  };
});

jest.mock('../../../src/utils/omniroute', () => {
  return class OmnirouteClient {
    async pilot() { return { choices: [{ message: { content: '{}' } }] }; }
  };
});

jest.mock('../../../src/utils/vision-enhanced', () => ({
  extractState: jest.fn(() => ({
    self: { position: { x: 0, y: 64, z: 0 }, health: 20, is_on_ground: true, is_in_lava: false },
    entities: { hostile: [], passive: [], players: [], mobs: [], other: [] },
    blocks: { hazardous: [], valuable: [], summary: {} }
  }))
}));

jest.mock('../../../src/layers/action-awareness', () => {
  return class ActionAwareness {
    constructor() {}
    async executeWithVerification() { return { success: true, outcome: {} }; }
  };
});

jest.mock('../../../src/metrics/item-tracker', () => {
  return class ItemTracker {
    constructor() {}
    track() {}
    getStats() { return {}; }
  };
});

jest.mock('../../../personality/personality-engine', () => ({
  getTraits: jest.fn(() => ({ bravery: 0.5, warmth: 0.5, directness: 0.5, humor: 0.3, curiosity: 0.7, loyalty: 0.6 }))
}));

jest.mock('../../../src/utils/relationship-state', () => ({
  getRelationship: jest.fn(async () => ({ trust: 0.5, familiarity: 0.5 })),
  formatForPrompt: jest.fn(() => 'Relationship: Unknown player relationship.')
}));

const featureFlags = require('../../../src/utils/feature-flags');
const VisionState = require('../../../src/vision/vision-state');
const Pilot = require('../../../src/layers/pilot');

// Default: VISION feature flag enabled
function createMockBot() {
  return {
    entity: { position: { x: 0, y: 64, z: 0 } },
    on: jest.fn(),
    username: 'TestBot'
  };
}

// Helper: create a fresh vision analysis
function createFreshAnalysis(overrides = {}) {
  return {
    timestamp: Date.now() - 1000, // 1 second ago (well within 30s threshold)
    mode: 'active',
    position: { x: 0, y: 64, z: 0 },
    observations: ['oak tree ahead', 'cave entrance to the left'],
    threats: ['zombie nearby'],
    entities: [{ type: 'zombie', distance: 5 }, { type: 'cow', distance: 10 }],
    blocks: [{ type: 'oak_log', distance: 3 }, { type: 'stone', distance: 8 }],
    confidence: 0.85,
    state: 'active',
    ...overrides
  };
}

describe('Pilot - Vision Integration', () => {
  let mockBot;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBot = createMockBot();
    // Default: VISION feature flag enabled
    featureFlags.isEnabled.mockReturnValue(true);
  });

  describe('constructor - visionState injection', () => {
    it('should accept visionState via options', () => {
      const visionState = new VisionState();
      const pilot = new Pilot(mockBot, { visionState });
      expect(pilot.visionState).toBe(visionState);
    });

    it('should default visionState to null when not provided', () => {
      const pilot = new Pilot(mockBot);
      expect(pilot.visionState).toBeNull();
    });

    it('should default visionState to null with empty options', () => {
      const pilot = new Pilot(mockBot, {});
      expect(pilot.visionState).toBeNull();
    });
  });

  describe('_buildVisionBlock - vision context added when available', () => {
    it('should return vision context string when analysis is fresh and complete', () => {
      const visionState = new VisionState();
      visionState.setAnalysis(createFreshAnalysis());
      const pilot = new Pilot(mockBot, { visionState });

      const block = pilot._buildVisionBlock();

      expect(block).toContain('Vision Context:');
      expect(block).toContain('Observations: oak tree ahead, cave entrance to the left');
      expect(block).toContain('Threats detected: zombie nearby');
      expect(block).toContain('Nearby entities: zombie, cow');
      expect(block).toContain('Notable blocks: oak_log, stone');
      expect(block).toContain('Vision confidence: 85%');
    });

    it('should include observations only when present', () => {
      const visionState = new VisionState();
      visionState.setAnalysis(createFreshAnalysis({
        observations: ['iron ore ahead'],
        threats: [],
        entities: [],
        blocks: []
      }));
      const pilot = new Pilot(mockBot, { visionState });

      const block = pilot._buildVisionBlock();

      expect(block).toContain('Observations: iron ore ahead');
      expect(block).not.toContain('Threats detected');
      expect(block).not.toContain('Nearby entities');
      expect(block).not.toContain('Notable blocks');
    });

    it('should include threats only when present', () => {
      const visionState = new VisionState();
      visionState.setAnalysis(createFreshAnalysis({
        observations: [],
        threats: ['skeleton archer close'],
        entities: [],
        blocks: []
      }));
      const pilot = new Pilot(mockBot, { visionState });

      const block = pilot._buildVisionBlock();

      expect(block).not.toContain('Observations:');
      expect(block).toContain('Threats detected: skeleton archer close');
    });

    it('should handle entities with name property instead of type', () => {
      const visionState = new VisionState();
      visionState.setAnalysis(createFreshAnalysis({
        observations: [],
        threats: [],
        entities: [{ name: 'Player1', distance: 8 }],
        blocks: []
      }));
      const pilot = new Pilot(mockBot, { visionState });

      const block = pilot._buildVisionBlock();

      expect(block).toContain('Nearby entities: Player1');
    });

    it('should handle entities with neither type nor name (fallback to unknown)', () => {
      const visionState = new VisionState();
      visionState.setAnalysis(createFreshAnalysis({
        observations: [],
        threats: [],
        entities: [{ distance: 5 }],
        blocks: []
      }));
      const pilot = new Pilot(mockBot, { visionState });

      const block = pilot._buildVisionBlock();

      expect(block).toContain('Nearby entities: unknown');
    });

    it('should handle blocks with name property instead of type', () => {
      const visionState = new VisionState();
      visionState.setAnalysis(createFreshAnalysis({
        observations: [],
        threats: [],
        entities: [],
        blocks: [{ name: 'diamond_ore', distance: 5 }]
      }));
      const pilot = new Pilot(mockBot, { visionState });

      const block = pilot._buildVisionBlock();

      expect(block).toContain('Notable blocks: diamond_ore');
    });

    it('should format confidence as percentage', () => {
      const visionState = new VisionState();
      visionState.setAnalysis(createFreshAnalysis({ confidence: 0.92 }));
      const pilot = new Pilot(mockBot, { visionState });

      const block = pilot._buildVisionBlock();

      expect(block).toContain('Vision confidence: 92%');
    });

    it('should format low confidence correctly', () => {
      const visionState = new VisionState();
      visionState.setAnalysis(createFreshAnalysis({ confidence: 0.05 }));
      const pilot = new Pilot(mockBot, { visionState });

      const block = pilot._buildVisionBlock();

      expect(block).toContain('Vision confidence: 5%');
    });
  });

  describe('_buildVisionBlock - vision missing (graceful degradation)', () => {
    it('should return empty string when visionState is null', () => {
      const pilot = new Pilot(mockBot); // no visionState option

      const block = pilot._buildVisionBlock();

      expect(block).toBe('');
    });

    it('should return empty string when visionState has no analysis (null)', () => {
      const visionState = new VisionState(); // empty, no setAnalysis called
      const pilot = new Pilot(mockBot, { visionState });

      const block = pilot._buildVisionBlock();

      expect(block).toBe('');
    });

    it('should return empty string when visionState analysis is cleared', () => {
      const visionState = new VisionState();
      visionState.setAnalysis(createFreshAnalysis());
      visionState.clear();
      const pilot = new Pilot(mockBot, { visionState });

      const block = pilot._buildVisionBlock();

      expect(block).toBe('');
    });

    it('should return empty string when analysis has all empty arrays and no confidence', () => {
      const visionState = new VisionState();
      visionState.setAnalysis({
        timestamp: Date.now() - 1000,
        mode: 'idle',
        observations: [],
        threats: [],
        entities: [],
        blocks: []
        // no confidence field
      });
      const pilot = new Pilot(mockBot, { visionState });

      const block = pilot._buildVisionBlock();

      expect(block).toBe('');
    });

    it('should not throw when visionState is null and VISION flag enabled', () => {
      featureFlags.isEnabled.mockReturnValue(true);
      const pilot = new Pilot(mockBot);

      expect(() => pilot._buildVisionBlock()).not.toThrow();
      expect(pilot._buildVisionBlock()).toBe('');
    });
  });

  describe('_buildVisionBlock - vision disabled via feature flag', () => {
    it('should return empty string when VISION feature flag is disabled', () => {
      featureFlags.isEnabled.mockReturnValue(false);
      const visionState = new VisionState();
      visionState.setAnalysis(createFreshAnalysis());
      const pilot = new Pilot(mockBot, { visionState });

      const block = pilot._buildVisionBlock();

      expect(block).toBe('');
    });

    it('should NOT access visionState when VISION flag is disabled', () => {
      featureFlags.isEnabled.mockReturnValue(false);
      // Create a visionState that would throw if accessed
      const trapVisionState = {
        getLatestAnalysis: jest.fn(() => { throw new Error('Should not be called'); })
      };
      const pilot = new Pilot(mockBot, { visionState: trapVisionState });

      // Should short-circuit before calling getLatestAnalysis
      expect(() => pilot._buildVisionBlock()).not.toThrow();
      expect(trapVisionState.getLatestAnalysis).not.toHaveBeenCalled();
    });

    it('should check feature flag with "VISION" key', () => {
      const visionState = new VisionState();
      visionState.setAnalysis(createFreshAnalysis());
      const pilot = new Pilot(mockBot, { visionState });

      pilot._buildVisionBlock();

      expect(featureFlags.isEnabled).toHaveBeenCalledWith('VISION');
    });
  });

  describe('_buildVisionBlock - stale vision analysis', () => {
    it('should return empty string when analysis is older than 30 seconds', () => {
      const visionState = new VisionState();
      const staleAnalysis = createFreshAnalysis({
        timestamp: Date.now() - 31000 // 31 seconds ago
      });
      visionState.setAnalysis(staleAnalysis);
      const pilot = new Pilot(mockBot, { visionState });

      const block = pilot._buildVisionBlock();

      expect(block).toBe('');
    });

    it('should return vision context when analysis is exactly 29 seconds old', () => {
      const visionState = new VisionState();
      const almostStale = createFreshAnalysis({
        timestamp: Date.now() - 29000 // 29 seconds ago
      });
      visionState.setAnalysis(almostStale);
      const pilot = new Pilot(mockBot, { visionState });

      const block = pilot._buildVisionBlock();

      expect(block).toContain('Vision Context:');
    });

  it('should return empty string when analysis is exactly 30 seconds old (boundary: >=30000 is stale)', () => {
    const visionState = new VisionState();
    const borderline = createFreshAnalysis({
      timestamp: Date.now() - 30000
    });
    visionState.setAnalysis(borderline);
    const pilot = new Pilot(mockBot, { visionState });

    const block = pilot._buildVisionBlock();

    expect(block).toBe('');
  });
  });

  describe('_buildVisionBlock - is synchronous (non-blocking)', () => {
    it('should return a string synchronously (not a Promise)', () => {
      const visionState = new VisionState();
      visionState.setAnalysis(createFreshAnalysis());
      const pilot = new Pilot(mockBot, { visionState });

      const result = pilot._buildVisionBlock();

      // Should be a string, not a Promise
      expect(typeof result).toBe('string');
      expect(result).not.toBeInstanceOf(Promise);
    });

    it('should complete quickly (no async/await)', () => {
      const visionState = new VisionState();
      visionState.setAnalysis(createFreshAnalysis());
      const pilot = new Pilot(mockBot, { visionState });

      const start = Date.now();
      const result = pilot._buildVisionBlock();
      const elapsed = Date.now() - start;

      expect(typeof result).toBe('string');
      expect(elapsed).toBeLessThan(10); // Should be <1ms, allow 10ms for test overhead
    });
  });

  describe('_buildVisionBlock - pilot loop timing unchanged', () => {
    it('should not modify currentInterval or currentMode', () => {
      const visionState = new VisionState();
      visionState.setAnalysis(createFreshAnalysis());
      const pilot = new Pilot(mockBot, { visionState });
      pilot.currentInterval = 200;
      pilot.currentMode = 'danger';

      pilot._buildVisionBlock();

      expect(pilot.currentInterval).toBe(200);
      expect(pilot.currentMode).toBe('danger');
    });

    it('should not modify pilot state when vision is disabled', () => {
      featureFlags.isEnabled.mockReturnValue(false);
      const pilot = new Pilot(mockBot);
      pilot.currentInterval = 500;
      pilot.currentMode = 'active';

      pilot._buildVisionBlock();

      expect(pilot.currentInterval).toBe(500);
      expect(pilot.currentMode).toBe('active');
    });
  });

  describe('_buildVisionBlock - logging', () => {
    it('should log at debug level when using vision context', () => {
      const visionState = new VisionState();
      visionState.setAnalysis(createFreshAnalysis({ confidence: 0.88 }));
      const pilot = new Pilot(mockBot, { visionState });
      const logger = require('../../../src/utils/logger');

      pilot._buildVisionBlock();

      expect(logger.debug).toHaveBeenCalledWith(
        'Pilot: Using vision context',
        expect.objectContaining({ confidence: 0.88 })
      );
    });

    it('should log at debug level when vision analysis is stale', () => {
      const visionState = new VisionState();
      visionState.setAnalysis(createFreshAnalysis({
        timestamp: Date.now() - 31000
      }));
      const pilot = new Pilot(mockBot, { visionState });
      const logger = require('../../../src/utils/logger');

      pilot._buildVisionBlock();

      expect(logger.debug).toHaveBeenCalledWith(
        'Pilot: Vision analysis stale, skipping',
        expect.objectContaining({ ageMs: expect.any(Number) })
      );
    });
  });

  describe('buildThreatPrompt - vision integration', () => {
    it('should include vision block in threat prompt when available', async () => {
      const visionState = new VisionState();
      visionState.setAnalysis(createFreshAnalysis());
      const pilot = new Pilot(mockBot, { visionState });

      const threat = {
        type: 'hostile_mob',
        severity: 'high',
        entities: [{ type: 'zombie', distance: 5 }]
      };
      const state = {
        self: {
          position: { x: 100, y: 64, z: 200 },
          health: 18,
          is_on_ground: true
        }
      };

      const prompt = await pilot.buildThreatPrompt(threat, state);

      expect(prompt).toContain('Vision Context:');
      expect(prompt).toContain('Observations: oak tree ahead, cave entrance to the left');
    });

    it('should work without vision block when vision is disabled', async () => {
      featureFlags.isEnabled.mockReturnValue(false);
      const pilot = new Pilot(mockBot);

      const threat = {
        type: 'lava',
        severity: 'critical',
        blocks: [{ type: 'lava', distance: 3 }]
      };
      const state = {
        self: {
          position: { x: 0, y: 64, z: 0 },
          health: 20,
          is_on_ground: true
        }
      };

      const prompt = await pilot.buildThreatPrompt(threat, state);

      expect(prompt).not.toContain('Vision Context:');
      expect(prompt).toContain('THREAT:'); // Prompt still builds correctly
    });
  });
});
