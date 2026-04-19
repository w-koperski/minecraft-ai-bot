jest.mock('../../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('../../../src/utils/feature-flags', () => ({
  isEnabled: jest.fn(() => true)
}));

const StrategyApplicator = require('../../../src/learning/strategy-applicator');
const featureFlags = require('../../../src/utils/feature-flags');

function createMockStrategyMemory() {
  return {
    retrieveSimilarStrategies: jest.fn(() => []),
    storeStrategy: jest.fn(),
    getStrategy: jest.fn()
  };
}

function makeResult(id, similarity, successRate, combinedScore, ageMs = 0) {
  return {
    strategy: {
      id,
      context: `context for ${id}`,
      actions: ['dig', 'collect'],
      outcome: 'success',
      timestamp: Date.now() - ageMs
    },
    similarity,
    combinedScore,
    success_rate: successRate,
    age: ageMs
  };
}

describe('StrategyApplicator', () => {
  let applicator;
  let mockSM;

  beforeEach(() => {
    mockSM = createMockStrategyMemory();
    applicator = new StrategyApplicator(mockSM);
    featureFlags.isEnabled.mockReturnValue(true);
    jest.clearAllMocks();
  });

  afterEach(() => {
    featureFlags.isEnabled.mockReturnValue(true);
  });

  // ============================================
  // Constructor
  // ============================================

  describe('Constructor', () => {
    test('should throw if no StrategyMemory provided', () => {
      expect(() => new StrategyApplicator(null)).toThrow('requires a StrategyMemory instance');
    });

    test('should throw if StrategyMemory is undefined', () => {
      expect(() => new StrategyApplicator(undefined)).toThrow('requires a StrategyMemory instance');
    });

    test('should initialize with default options', () => {
      expect(applicator.minSuccessRate).toBe(0.7);
      expect(applicator.defaultThreshold).toBe(0.75);
      expect(applicator.maxResults).toBe(5);
    });

    test('should accept custom options', () => {
      const custom = new StrategyApplicator(mockSM, {
        minSuccessRate: 0.9,
        defaultThreshold: 0.8,
        maxResults: 10
      });
      expect(custom.minSuccessRate).toBe(0.9);
      expect(custom.defaultThreshold).toBe(0.8);
      expect(custom.maxResults).toBe(10);
    });

    test('should initialize tracking counters at zero', () => {
      const status = applicator.getStatus();
      expect(status.appliedCount).toBe(0);
      expect(status.successfulApplications).toBe(0);
      expect(status.failedApplications).toBe(0);
    });
  });

  // ============================================
  // getApplicableStrategies
  // ============================================

  describe('getApplicableStrategies', () => {
    test('should return empty array for empty context', () => {
      const result = applicator.getApplicableStrategies('');
      expect(result).toEqual([]);
    });

    test('should return empty array for non-string context', () => {
      const result = applicator.getApplicableStrategies(null);
      expect(result).toEqual([]);
    });

    test('should return empty array when no strategies found', () => {
      mockSM.retrieveSimilarStrategies.mockReturnValue([]);
      const result = applicator.getApplicableStrategies('collect wood');
      expect(result).toEqual([]);
    });

    test('should filter out strategies below minSuccessRate', () => {
      const lowRate = makeResult('low', 0.8, 0.5, 0.6);
      const highRate = makeResult('high', 0.8, 0.9, 0.8);
      mockSM.retrieveSimilarStrategies.mockReturnValue([highRate, lowRate]);

      const result = applicator.getApplicableStrategies('collect wood');
      expect(result.length).toBe(1);
      expect(result[0].strategy.id).toBe('high');
    });

    test('should keep strategies at exactly minSuccessRate', () => {
      const exact = makeResult('exact', 0.8, 0.7, 0.7);
      mockSM.retrieveSimilarStrategies.mockReturnValue([exact]);

      const result = applicator.getApplicableStrategies('collect wood');
      expect(result.length).toBe(1);
      expect(result[0].strategy.id).toBe('exact');
    });

    test('should filter out strategies with missing success_rate', () => {
      const noRate = { ...makeResult('noRate', 0.8, undefined, 0.5) };
      delete noRate.success_rate;
      mockSM.retrieveSimilarStrategies.mockReturnValue([noRate]);

      const result = applicator.getApplicableStrategies('collect wood');
      expect(result).toEqual([]);
    });

    test('should filter out strategies with non-numeric success_rate', () => {
      const badRate = makeResult('bad', 0.8, 'high', 0.5);
      mockSM.retrieveSimilarStrategies.mockReturnValue([badRate]);

      const result = applicator.getApplicableStrategies('collect wood');
      expect(result).toEqual([]);
    });

    test('should return empty array on retrieval error', () => {
      mockSM.retrieveSimilarStrategies.mockImplementation(() => {
        throw new Error('retrieval failed');
      });

      const result = applicator.getApplicableStrategies('collect wood');
      expect(result).toEqual([]);
    });

    test('should pass threshold and limit options to StrategyMemory', () => {
      mockSM.retrieveSimilarStrategies.mockReturnValue([]);

      applicator.getApplicableStrategies('collect wood', {
        threshold: 0.5,
        limit: 3
      });

      expect(mockSM.retrieveSimilarStrategies).toHaveBeenCalledWith(
        'collect wood',
        0.5,
        { limit: 3, includeMetadata: true }
      );
    });

    test('should use default threshold and limit when not provided', () => {
      mockSM.retrieveSimilarStrategies.mockReturnValue([]);

      applicator.getApplicableStrategies('collect wood');

      expect(mockSM.retrieveSimilarStrategies).toHaveBeenCalledWith(
        'collect wood',
        0.75,
        { limit: 5, includeMetadata: true }
      );
    });
  });

  // ============================================
  // applyStrategies
  // ============================================

describe('applyStrategies', () => {
    test('should return null when META_LEARNING feature disabled', () => {
      featureFlags.isEnabled.mockReturnValue(false);

      const result = applicator.applyStrategies('collect wood');
      expect(result).toBeNull();
    });

    test('should return null when no applicable strategies found', () => {
      mockSM.retrieveSimilarStrategies.mockReturnValue([]);

      const result = applicator.applyStrategies('collect wood');
      expect(result).toBeNull();
    });

    test('should return applied strategy with correct shape', () => {
      const best = makeResult('best_strat', 0.9, 0.95, 0.88);
      mockSM.retrieveSimilarStrategies.mockReturnValue([best]);

      const result = applicator.applyStrategies('collect wood');

      expect(result).toEqual({
        applied: true,
        strategy: {
          id: 'best_strat',
          context: best.strategy.context,
          actions: best.strategy.actions,
          outcome: best.strategy.outcome,
          timestamp: best.strategy.timestamp
        },
        confidence: 0.88
      });
    });

    test('should pick highest-scoring strategy (first after sort)', () => {
      const second = makeResult('second', 0.8, 0.8, 0.75);
      const first = makeResult('first', 0.95, 0.95, 0.92);
      mockSM.retrieveSimilarStrategies.mockReturnValue([first, second]);

      const result = applicator.applyStrategies('collect wood');

      expect(result.strategy.id).toBe('first');
      expect(result.confidence).toBe(0.92);
    });

    test('should increment appliedCount on successful application', () => {
      const best = makeResult('best', 0.9, 0.9, 0.85);
      mockSM.retrieveSimilarStrategies.mockReturnValue([best]);

      applicator.applyStrategies('collect wood');
      applicator.applyStrategies('collect wood');

      expect(applicator.getStatus().appliedCount).toBe(2);
    });

    test('should not increment appliedCount when no strategy found', () => {
      mockSM.retrieveSimilarStrategies.mockReturnValue([]);

      applicator.applyStrategies('collect wood');

      expect(applicator.getStatus().appliedCount).toBe(0);
    });

    test('should skip strategies below minSuccessRate even if similar', () => {
      const lowRate = makeResult('low', 0.95, 0.3, 0.5);
      mockSM.retrieveSimilarStrategies.mockReturnValue([lowRate]);

      const result = applicator.applyStrategies('collect wood');
      expect(result).toBeNull();
    });

    test('should accept custom threshold option', () => {
      mockSM.retrieveSimilarStrategies.mockReturnValue([]);

      applicator.applyStrategies('collect wood', { threshold: 0.5 });

      expect(mockSM.retrieveSimilarStrategies).toHaveBeenCalledWith(
        'collect wood',
        0.5,
        expect.objectContaining({ limit: 5, includeMetadata: true })
      );
    });
  });

  // ============================================
  // recordOutcome
  // ============================================

  describe('recordOutcome', () => {
    test('should track successful application', () => {
      applicator.recordOutcome('strat_1', true);

      expect(applicator.getStatus().successfulApplications).toBe(1);
      expect(applicator.getStatus().failedApplications).toBe(0);
    });

    test('should track failed application', () => {
      applicator.recordOutcome('strat_1', false);

      expect(applicator.getStatus().successfulApplications).toBe(0);
      expect(applicator.getStatus().failedApplications).toBe(1);
    });

    test('should track multiple outcomes', () => {
      applicator.recordOutcome('strat_1', true);
      applicator.recordOutcome('strat_2', true);
      applicator.recordOutcome('strat_3', false);

      const status = applicator.getStatus();
      expect(status.successfulApplications).toBe(2);
      expect(status.failedApplications).toBe(1);
    });
  });

  // ============================================
  // getStatus / resetStatus
  // ============================================

  describe('getStatus and resetStatus', () => {
    test('should return current tracking metrics', () => {
      const best = makeResult('best', 0.9, 0.9, 0.85);
      mockSM.retrieveSimilarStrategies.mockReturnValue([best]);

      applicator.applyStrategies('collect wood');
      applicator.recordOutcome('best', true);

      const status = applicator.getStatus();
      expect(status.appliedCount).toBe(1);
      expect(status.successfulApplications).toBe(1);
      expect(status.failedApplications).toBe(0);
    });

    test('should reset all counters to zero', () => {
      const best = makeResult('best', 0.9, 0.9, 0.85);
      mockSM.retrieveSimilarStrategies.mockReturnValue([best]);

      applicator.applyStrategies('collect wood');
      applicator.recordOutcome('best', true);
      applicator.recordOutcome('best', false);

      applicator.resetStatus();

      const status = applicator.getStatus();
      expect(status.appliedCount).toBe(0);
      expect(status.successfulApplications).toBe(0);
      expect(status.failedApplications).toBe(0);
    });
  });

  // ============================================
  // Feature flag integration
  // ============================================

  describe('Feature flag gating', () => {
    test('applyStrategies should check META_LEARNING flag', () => {
      featureFlags.isEnabled.mockReturnValue(false);

      const best = makeResult('best', 0.9, 0.9, 0.85);
      mockSM.retrieveSimilarStrategies.mockReturnValue([best]);

      const result = applicator.applyStrategies('collect wood');
      expect(result).toBeNull();
      expect(mockSM.retrieveSimilarStrategies).not.toHaveBeenCalled();
    });

    test('getApplicableStrategies should NOT check feature flag', () => {
      featureFlags.isEnabled.mockReturnValue(false);

      const best = makeResult('best', 0.9, 0.9, 0.85);
      mockSM.retrieveSimilarStrategies.mockReturnValue([best]);

      const result = applicator.getApplicableStrategies('collect wood');
      expect(result.length).toBe(1);
    });
});

// ============================================
// Graceful degradation
// ============================================

describe('Graceful degradation', () => {
  test('should not throw when StrategyMemory retrieval throws', () => {
    mockSM.retrieveSimilarStrategies.mockImplementation(() => {
      throw new Error('database corrupted');
    });

      expect(() => applicator.getApplicableStrategies('collect wood')).not.toThrow();
      expect(() => applicator.applyStrategies('collect wood')).not.toThrow();
    });

    test('should return null from applyStrategies when retrieval throws', () => {
      mockSM.retrieveSimilarStrategies.mockImplementation(() => {
        throw new Error('network error');
      });

      const result = applicator.applyStrategies('collect wood');
      expect(result).toBeNull();
    });

    test('should handle empty string context gracefully', () => {
      const result = applicator.applyStrategies('');
      expect(result).toBeNull();
    });

    test('should handle null context gracefully', () => {
      const result = applicator.applyStrategies(null);
      expect(result).toBeNull();
    });
  });

  // ============================================
  // Full workflow
  // ============================================

  describe('Full application workflow', () => {
    test('should retrieve, filter, apply, and track strategy', () => {
      const best = makeResult('wood_strat', 0.92, 0.95, 0.90);
      const belowThreshold = makeResult('risky', 0.85, 0.5, 0.6);
      mockSM.retrieveSimilarStrategies.mockReturnValue([best, belowThreshold]);

      const result = applicator.applyStrategies('collect oak logs in forest');
      expect(result.applied).toBe(true);
      expect(result.strategy.id).toBe('wood_strat');

      applicator.recordOutcome('wood_strat', true);

      const status = applicator.getStatus();
      expect(status.appliedCount).toBe(1);
      expect(status.successfulApplications).toBe(1);
      expect(status.failedApplications).toBe(0);
    });

    test('should handle multiple applications with mixed outcomes', () => {
      const strat1 = makeResult('s1', 0.9, 0.85, 0.87);
      const strat2 = makeResult('s2', 0.88, 0.9, 0.89);

      mockSM.retrieveSimilarStrategies.mockReturnValue([strat1]);
      applicator.applyStrategies('collect wood');
      applicator.recordOutcome('s1', true);

      mockSM.retrieveSimilarStrategies.mockReturnValue([strat2]);
      applicator.applyStrategies('mine stone');
      applicator.recordOutcome('s2', false);

      mockSM.retrieveSimilarStrategies.mockReturnValue([]);
      applicator.applyStrategies('build house');

      const status = applicator.getStatus();
      expect(status.appliedCount).toBe(2);
      expect(status.successfulApplications).toBe(1);
      expect(status.failedApplications).toBe(1);
    });
  });
});
