/**
 * LearningMetrics - Track Strategy Reuse and Success Rates
 *
 * Tracks how often the bot reuses learned strategies vs planning from scratch,
 * and compares success rates between the two approaches.
 *
 * Integration: Strategy layer calls recordStrategyApplication() or recordFreshPlanning()
 * after each planning cycle, then getMetrics() provides analytics.
 */

const logger = require('../utils/logger');

class LearningMetrics {
  /**
   * @param {object} [options={}]
   * @param {boolean} [options.trackTimestamps=false] - Store timestamps for time-series analysis
   */
  constructor(options = {}) {
    this.trackTimestamps = options.trackTimestamps || false;

    // Strategy application tracking
    this.strategyApplications = 0;
    this.strategySuccesses = 0;
    this.strategyFailures = 0;

    // Fresh planning tracking
    this.freshPlans = 0;
    this.freshSuccesses = 0;
    this.freshFailures = 0;

    // Optional timestamp tracking
    this.timestamps = this.trackTimestamps ? [] : null;

    logger.debug('LearningMetrics initialized', {
      trackTimestamps: this.trackTimestamps
    });
  }

  /**
   * Record a strategy application attempt.
   *
   * @param {boolean} applied - Was a strategy actually applied? (false if no applicable strategy found)
   * @param {boolean} success - Did the strategy succeed? (only relevant if applied=true)
   */
  recordStrategyApplication(applied, success) {
    if (!applied) {
      logger.debug('LearningMetrics: Strategy not applied (no applicable strategy found)');
      return;
    }

    this.strategyApplications++;

    if (success) {
      this.strategySuccesses++;
      logger.debug('LearningMetrics: Strategy application succeeded', {
        totalApplications: this.strategyApplications,
        successRate: this.getStrategySuccessRate()
      });
    } else {
      this.strategyFailures++;
      logger.debug('LearningMetrics: Strategy application failed', {
        totalApplications: this.strategyApplications,
        successRate: this.getStrategySuccessRate()
      });
    }

    if (this.trackTimestamps) {
      this.timestamps.push({
        type: 'strategy',
        success,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Record a fresh planning attempt (no strategy reused).
   *
   * @param {boolean} success - Did the fresh plan succeed?
   */
  recordFreshPlanning(success) {
    this.freshPlans++;

    if (success) {
      this.freshSuccesses++;
      logger.debug('LearningMetrics: Fresh planning succeeded', {
        totalFreshPlans: this.freshPlans,
        successRate: this.getFreshPlanningSuccessRate()
      });
    } else {
      this.freshFailures++;
      logger.debug('LearningMetrics: Fresh planning failed', {
        totalFreshPlans: this.freshPlans,
        successRate: this.getFreshPlanningSuccessRate()
      });
    }

    if (this.trackTimestamps) {
      this.timestamps.push({
        type: 'fresh',
        success,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Calculate strategy reuse rate.
   * Returns percentage of planning cycles that used a learned strategy.
   *
   * @returns {number} - Reuse rate 0.0-1.0 (0% to 100%)
   */
  getStrategyReuseRate() {
    const total = this.strategyApplications + this.freshPlans;
    if (total === 0) return 0;
    return this.strategyApplications / total;
  }

  /**
   * Calculate strategy success rate.
   *
   * @returns {number} - Success rate 0.0-1.0 (0% to 100%)
   */
  getStrategySuccessRate() {
    if (this.strategyApplications === 0) return 0;
    return this.strategySuccesses / this.strategyApplications;
  }

  /**
   * Calculate fresh planning success rate.
   *
   * @returns {number} - Success rate 0.0-1.0 (0% to 100%)
   */
  getFreshPlanningSuccessRate() {
    if (this.freshPlans === 0) return 0;
    return this.freshSuccesses / this.freshPlans;
  }

  /**
   * Get all metrics as a single object.
   *
   * @returns {object} - All metrics
   */
  getMetrics() {
    return {
      strategyReuseRate: this.getStrategyReuseRate(),
      strategySuccessRate: this.getStrategySuccessRate(),
      freshPlanningSuccessRate: this.getFreshPlanningSuccessRate(),
      totalApplications: this.strategyApplications,
      strategySuccesses: this.strategySuccesses,
      strategyFailures: this.strategyFailures,
      totalFreshPlans: this.freshPlans,
      freshSuccesses: this.freshSuccesses,
      freshFailures: this.freshFailures,
      totalPlanningCycles: this.strategyApplications + this.freshPlans
    };
  }

  /**
   * Reset all counters to zero.
   */
  reset() {
    this.strategyApplications = 0;
    this.strategySuccesses = 0;
    this.strategyFailures = 0;
    this.freshPlans = 0;
    this.freshSuccesses = 0;
    this.freshFailures = 0;

    if (this.trackTimestamps) {
      this.timestamps = [];
    }

    logger.debug('LearningMetrics: All counters reset');
  }

  /**
   * Get timestamps (if tracking enabled).
   *
   * @returns {Array|null} - Array of timestamp entries or null if not tracking
   */
  getTimestamps() {
    return this.timestamps;
  }
}

module.exports = LearningMetrics;
