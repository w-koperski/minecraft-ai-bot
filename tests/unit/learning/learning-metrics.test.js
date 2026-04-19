jest.mock('../../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const LearningMetrics = require('../../../src/learning/learning-metrics');
const logger = require('../../../src/utils/logger');

describe('LearningMetrics', () => {
  let metrics;

  beforeEach(() => {
    metrics = new LearningMetrics();
    jest.clearAllMocks();
  });

  // ============================================
  // Constructor
  // ============================================

  describe('Constructor', () => {
    test('should initialize with default options (trackTimestamps=false)', () => {
      expect(metrics.trackTimestamps).toBe(false);
      expect(metrics.strategyApplications).toBe(0);
      expect(metrics.strategySuccesses).toBe(0);
      expect(metrics.strategyFailures).toBe(0);
      expect(metrics.freshPlans).toBe(0);
      expect(metrics.freshSuccesses).toBe(0);
      expect(metrics.freshFailures).toBe(0);
    });

    test('should set timestamps to null when trackTimestamps=false', () => {
      expect(metrics.timestamps).toBeNull();
    });

    test('should accept trackTimestamps=true option', () => {
      const metricsWithTimestamps = new LearningMetrics({ trackTimestamps: true });
      expect(metricsWithTimestamps.trackTimestamps).toBe(true);
      expect(metricsWithTimestamps.timestamps).toEqual([]);
    });

    test('should log initialization with trackTimestamps setting', () => {
      new LearningMetrics({ trackTimestamps: true });
      expect(logger.debug).toHaveBeenCalledWith('LearningMetrics initialized', {
        trackTimestamps: true
      });
    });
  });

  // ============================================
  // recordStrategyApplication
  // ============================================

  describe('recordStrategyApplication', () => {
    test('should increment strategyApplications counter when applied=true', () => {
      metrics.recordStrategyApplication(true, true);
      expect(metrics.strategyApplications).toBe(1);
    });

    test('should increment strategySuccesses when applied=true and success=true', () => {
      metrics.recordStrategyApplication(true, true);
      expect(metrics.strategySuccesses).toBe(1);
      expect(metrics.strategyFailures).toBe(0);
    });

    test('should increment strategyFailures when applied=true and success=false', () => {
      metrics.recordStrategyApplication(true, false);
      expect(metrics.strategyFailures).toBe(1);
      expect(metrics.strategySuccesses).toBe(0);
    });

    test('should not increment any counter when applied=false', () => {
      metrics.recordStrategyApplication(false, true);
      expect(metrics.strategyApplications).toBe(0);
      expect(metrics.strategySuccesses).toBe(0);
      expect(metrics.strategyFailures).toBe(0);
    });

    test('should log debug message when applied=false', () => {
      metrics.recordStrategyApplication(false, true);
      expect(logger.debug).toHaveBeenCalledWith(
        'LearningMetrics: Strategy not applied (no applicable strategy found)'
      );
    });

    test('should track timestamps when trackTimestamps=true', () => {
      const metricsWithTimestamps = new LearningMetrics({ trackTimestamps: true });
      metricsWithTimestamps.recordStrategyApplication(true, true);

      expect(metricsWithTimestamps.timestamps).toHaveLength(1);
      expect(metricsWithTimestamps.timestamps[0].type).toBe('strategy');
      expect(metricsWithTimestamps.timestamps[0].success).toBe(true);
      expect(metricsWithTimestamps.timestamps[0].timestamp).toBeDefined();
    });

    test('should not track timestamps when trackTimestamps=false', () => {
      metrics.recordStrategyApplication(true, true);
      expect(metrics.timestamps).toBeNull();
    });

    test('should accumulate multiple applications correctly', () => {
      metrics.recordStrategyApplication(true, true);
      metrics.recordStrategyApplication(true, false);
      metrics.recordStrategyApplication(true, true);

      expect(metrics.strategyApplications).toBe(3);
      expect(metrics.strategySuccesses).toBe(2);
      expect(metrics.strategyFailures).toBe(1);
    });
  });

  // ============================================
  // recordFreshPlanning
  // ============================================

  describe('recordFreshPlanning', () => {
    test('should increment freshPlans counter', () => {
      metrics.recordFreshPlanning(true);
      expect(metrics.freshPlans).toBe(1);
    });

    test('should increment freshSuccesses when success=true', () => {
      metrics.recordFreshPlanning(true);
      expect(metrics.freshSuccesses).toBe(1);
      expect(metrics.freshFailures).toBe(0);
    });

    test('should increment freshFailures when success=false', () => {
      metrics.recordFreshPlanning(false);
      expect(metrics.freshFailures).toBe(1);
      expect(metrics.freshSuccesses).toBe(0);
    });

    test('should track timestamps when trackTimestamps=true', () => {
      const metricsWithTimestamps = new LearningMetrics({ trackTimestamps: true });
      metricsWithTimestamps.recordFreshPlanning(true);

      expect(metricsWithTimestamps.timestamps).toHaveLength(1);
      expect(metricsWithTimestamps.timestamps[0].type).toBe('fresh');
      expect(metricsWithTimestamps.timestamps[0].success).toBe(true);
    });

    test('should not track timestamps when trackTimestamps=false', () => {
      metrics.recordFreshPlanning(true);
      expect(metrics.timestamps).toBeNull();
    });

    test('should accumulate multiple fresh plans correctly', () => {
      metrics.recordFreshPlanning(true);
      metrics.recordFreshPlanning(false);
      metrics.recordFreshPlanning(true);

      expect(metrics.freshPlans).toBe(3);
      expect(metrics.freshSuccesses).toBe(2);
      expect(metrics.freshFailures).toBe(1);
    });
  });

  // ============================================
  // getStrategyReuseRate
  // ============================================

  describe('getStrategyReuseRate', () => {
    test('should return 0 when no applications recorded', () => {
      expect(metrics.getStrategyReuseRate()).toBe(0);
    });

    test('should return 0 when only fresh plans exist', () => {
      metrics.recordFreshPlanning(true);
      expect(metrics.getStrategyReuseRate()).toBe(0);
    });

    test('should return 1 when only strategy applications exist', () => {
      metrics.recordStrategyApplication(true, true);
      expect(metrics.getStrategyReuseRate()).toBe(1);
    });

    test('should return 0.5 with equal strategy and fresh counts', () => {
      metrics.recordStrategyApplication(true, true);
      metrics.recordFreshPlanning(true);
      expect(metrics.getStrategyReuseRate()).toBe(0.5);
    });

    test('should return correct rate with 2 strategies and 1 fresh', () => {
      metrics.recordStrategyApplication(true, true);
      metrics.recordStrategyApplication(true, true);
      metrics.recordFreshPlanning(true);
      expect(metrics.getStrategyReuseRate()).toBeCloseTo(0.667, 2);
    });

    test('should return rate between 0 and 1', () => {
      metrics.recordStrategyApplication(true, true);
      metrics.recordFreshPlanning(true);
      metrics.recordFreshPlanning(true);
      const rate = metrics.getStrategyReuseRate();
      expect(rate).toBeGreaterThan(0);
      expect(rate).toBeLessThan(1);
    });
  });

  // ============================================
  // getStrategySuccessRate
  // ============================================

  describe('getStrategySuccessRate', () => {
    test('should return 0 when no strategy applications', () => {
      expect(metrics.getStrategySuccessRate()).toBe(0);
    });

    test('should return 1 when all applications succeed', () => {
      metrics.recordStrategyApplication(true, true);
      metrics.recordStrategyApplication(true, true);
      expect(metrics.getStrategySuccessRate()).toBe(1);
    });

    test('should return 0 when all applications fail', () => {
      metrics.recordStrategyApplication(true, false);
      metrics.recordStrategyApplication(true, false);
      expect(metrics.getStrategySuccessRate()).toBe(0);
    });

    test('should return 0.5 with equal successes and failures', () => {
      metrics.recordStrategyApplication(true, true);
      metrics.recordStrategyApplication(true, false);
      expect(metrics.getStrategySuccessRate()).toBe(0.5);
    });

    test('should handle single success out of three', () => {
      metrics.recordStrategyApplication(true, true);
      metrics.recordStrategyApplication(true, false);
      metrics.recordStrategyApplication(true, false);
      expect(metrics.getStrategySuccessRate()).toBeCloseTo(0.333, 2);
    });

    test('should return rate between 0 and 1', () => {
      metrics.recordStrategyApplication(true, true);
      metrics.recordStrategyApplication(true, false);
      const rate = metrics.getStrategySuccessRate();
      expect(rate).toBeGreaterThan(0);
      expect(rate).toBeLessThan(1);
    });
  });

  // ============================================
  // getFreshPlanningSuccessRate
  // ============================================

  describe('getFreshPlanningSuccessRate', () => {
    test('should return 0 when no fresh plans', () => {
      expect(metrics.getFreshPlanningSuccessRate()).toBe(0);
    });

    test('should return 1 when all fresh plans succeed', () => {
      metrics.recordFreshPlanning(true);
      metrics.recordFreshPlanning(true);
      expect(metrics.getFreshPlanningSuccessRate()).toBe(1);
    });

    test('should return 0 when all fresh plans fail', () => {
      metrics.recordFreshPlanning(false);
      metrics.recordFreshPlanning(false);
      expect(metrics.getFreshPlanningSuccessRate()).toBe(0);
    });

    test('should return 0.5 with equal successes and failures', () => {
      metrics.recordFreshPlanning(true);
      metrics.recordFreshPlanning(false);
      expect(metrics.getFreshPlanningSuccessRate()).toBe(0.5);
    });

    test('should handle two successes out of four', () => {
      metrics.recordFreshPlanning(true);
      metrics.recordFreshPlanning(true);
      metrics.recordFreshPlanning(false);
      metrics.recordFreshPlanning(false);
      expect(metrics.getFreshPlanningSuccessRate()).toBe(0.5);
    });

    test('should return rate between 0 and 1', () => {
      metrics.recordFreshPlanning(true);
      metrics.recordFreshPlanning(false);
      const rate = metrics.getFreshPlanningSuccessRate();
      expect(rate).toBeGreaterThan(0);
      expect(rate).toBeLessThan(1);
    });
  });

  // ============================================
  // getMetrics
  // ============================================

  describe('getMetrics', () => {
    test('should return all zeros when no data recorded', () => {
      const result = metrics.getMetrics();
      expect(result.strategyReuseRate).toBe(0);
      expect(result.strategySuccessRate).toBe(0);
      expect(result.freshPlanningSuccessRate).toBe(0);
      expect(result.totalApplications).toBe(0);
      expect(result.strategySuccesses).toBe(0);
      expect(result.strategyFailures).toBe(0);
      expect(result.totalFreshPlans).toBe(0);
      expect(result.freshSuccesses).toBe(0);
      expect(result.freshFailures).toBe(0);
      expect(result.totalPlanningCycles).toBe(0);
    });

    test('should return correct metrics after recording data', () => {
      metrics.recordStrategyApplication(true, true);
      metrics.recordStrategyApplication(true, false);
      metrics.recordFreshPlanning(true);
      metrics.recordFreshPlanning(false);

      const result = metrics.getMetrics();

      expect(result.totalApplications).toBe(2);
      expect(result.strategySuccesses).toBe(1);
      expect(result.strategyFailures).toBe(1);
      expect(result.totalFreshPlans).toBe(2);
      expect(result.freshSuccesses).toBe(1);
      expect(result.freshFailures).toBe(1);
      expect(result.totalPlanningCycles).toBe(4);
    });

    test('should return calculated rates in getMetrics', () => {
      metrics.recordStrategyApplication(true, true);
      metrics.recordStrategyApplication(true, true);
      metrics.recordFreshPlanning(true);
      metrics.recordFreshPlanning(true);

      const result = metrics.getMetrics();

      expect(result.strategyReuseRate).toBe(0.5);
      expect(result.strategySuccessRate).toBe(1);
      expect(result.freshPlanningSuccessRate).toBe(1);
    });

    test('should return object with all expected keys', () => {
      const result = metrics.getMetrics();
      expect(result).toHaveProperty('strategyReuseRate');
      expect(result).toHaveProperty('strategySuccessRate');
      expect(result).toHaveProperty('freshPlanningSuccessRate');
      expect(result).toHaveProperty('totalApplications');
      expect(result).toHaveProperty('strategySuccesses');
      expect(result).toHaveProperty('strategyFailures');
      expect(result).toHaveProperty('totalFreshPlans');
      expect(result).toHaveProperty('freshSuccesses');
      expect(result).toHaveProperty('freshFailures');
      expect(result).toHaveProperty('totalPlanningCycles');
    });
  });

  // ============================================
  // reset
  // ============================================

  describe('reset', () => {
    test('should reset all counters to zero', () => {
      metrics.recordStrategyApplication(true, true);
      metrics.recordStrategyApplication(true, false);
      metrics.recordFreshPlanning(true);
      metrics.recordFreshPlanning(false);

      metrics.reset();

      expect(metrics.strategyApplications).toBe(0);
      expect(metrics.strategySuccesses).toBe(0);
      expect(metrics.strategyFailures).toBe(0);
      expect(metrics.freshPlans).toBe(0);
      expect(metrics.freshSuccesses).toBe(0);
      expect(metrics.freshFailures).toBe(0);
    });

    test('should log debug message on reset', () => {
      metrics.reset();
      expect(logger.debug).toHaveBeenCalledWith('LearningMetrics: All counters reset');
    });

    test('should clear timestamps array when trackTimestamps=true', () => {
      const metricsWithTimestamps = new LearningMetrics({ trackTimestamps: true });
      metricsWithTimestamps.recordStrategyApplication(true, true);
      metricsWithTimestamps.recordFreshPlanning(true);
      expect(metricsWithTimestamps.timestamps).toHaveLength(2);

      metricsWithTimestamps.reset();

      expect(metricsWithTimestamps.timestamps).toEqual([]);
    });

    test('should preserve trackTimestamps setting after reset', () => {
      const metricsWithTimestamps = new LearningMetrics({ trackTimestamps: true });
      metricsWithTimestamps.reset();
      expect(metricsWithTimestamps.trackTimestamps).toBe(true);
    });
  });

  // ============================================
  // getTimestamps
  // ============================================

  describe('getTimestamps', () => {
    test('should return null when trackTimestamps=false', () => {
      expect(metrics.getTimestamps()).toBeNull();
    });

    test('should return empty array initially when trackTimestamps=true', () => {
      const metricsWithTimestamps = new LearningMetrics({ trackTimestamps: true });
      expect(metricsWithTimestamps.getTimestamps()).toEqual([]);
    });

    test('should return timestamps array when tracking is enabled and data exists', () => {
      const metricsWithTimestamps = new LearningMetrics({ trackTimestamps: true });
      metricsWithTimestamps.recordStrategyApplication(true, true);
      metricsWithTimestamps.recordFreshPlanning(false);

      const timestamps = metricsWithTimestamps.getTimestamps();

      expect(timestamps).toHaveLength(2);
      expect(timestamps[0].type).toBe('strategy');
      expect(timestamps[1].type).toBe('fresh');
    });

    test('should return reference to internal timestamps array', () => {
      const metricsWithTimestamps = new LearningMetrics({ trackTimestamps: true });
      const timestampsRef = metricsWithTimestamps.getTimestamps();

      metricsWithTimestamps.recordStrategyApplication(true, true);

      expect(metricsWithTimestamps.getTimestamps()).toBe(timestampsRef);
      expect(timestampsRef).toHaveLength(1);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('Edge Cases', () => {
    test('should handle very high number of applications without error', () => {
      for (let i = 0; i < 1000; i++) {
        metrics.recordStrategyApplication(true, i % 2 === 0);
      }
      expect(metrics.strategyApplications).toBe(1000);
      expect(metrics.getStrategySuccessRate()).toBeCloseTo(0.5, 1);
    });

    test('should handle rapid alternating applications', () => {
      for (let i = 0; i < 100; i++) {
        if (i % 2 === 0) {
          metrics.recordStrategyApplication(true, true);
        } else {
          metrics.recordFreshPlanning(true);
        }
      }
      expect(metrics.getStrategyReuseRate()).toBeCloseTo(0.5, 1);
    });

    test('should not throw when recordStrategyApplication is called with undefined success', () => {
      expect(() => metrics.recordStrategyApplication(true, undefined)).not.toThrow();
    });

    test('should not throw when recordFreshPlanning is called with undefined success', () => {
      expect(() => metrics.recordFreshPlanning(undefined)).not.toThrow();
    });

    test('should handle reset after multiple operations', () => {
      metrics.recordStrategyApplication(true, true);
      metrics.recordFreshPlanning(false);
      metrics.reset();
      metrics.recordStrategyApplication(true, true);

      expect(metrics.strategyApplications).toBe(1);
      expect(metrics.freshPlans).toBe(0);
    });

    test('should track strategy and fresh planning independently', () => {
      metrics.recordStrategyApplication(true, true);
      metrics.recordStrategyApplication(true, true);
      metrics.recordFreshPlanning(false);
      metrics.recordFreshPlanning(false);

      expect(metrics.getStrategySuccessRate()).toBe(1);
      expect(metrics.getFreshPlanningSuccessRate()).toBe(0);
    });
  });
});