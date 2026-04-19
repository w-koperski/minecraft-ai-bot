/**
 * StrategyApplicator - Retrieve and Apply Similar Strategies
 *
 * Retrieves similar strategies from StrategyMemory and applies them to
 * current bot situations. Enables the bot to learn from past experiences
 * and reuse successful strategies instead of always planning from scratch.
 *
 * Safety: Only applies strategies with success_rate >= minSuccessRate (default 0.7)
 * Graceful degradation: Returns null if no applicable strategies found, never blocks planning
 */

const logger = require('../utils/logger');
const featureFlags = require('../utils/feature-flags');

class StrategyApplicator {
  /**
   * @param {object} strategyMemory - StrategyMemory instance (required)
   * @param {object} [options={}]
   * @param {number} [options.minSuccessRate=0.7] - Minimum success rate to apply a strategy
   * @param {number} [options.defaultThreshold=0.75] - Default similarity threshold for retrieval
   * @param {number} [options.maxResults=5] - Max strategies to retrieve per query
   */
  constructor(strategyMemory, options = {}) {
    if (!strategyMemory) {
      throw new Error('StrategyApplicator requires a StrategyMemory instance');
    }

    this.strategyMemory = strategyMemory;
    this.minSuccessRate = options.minSuccessRate || 0.7;
    this.defaultThreshold = options.defaultThreshold || 0.75;
    this.maxResults = options.maxResults || 5;

    this.appliedCount = 0;
    this.successfulApplications = 0;
    this.failedApplications = 0;

    logger.debug('StrategyApplicator initialized', {
      minSuccessRate: this.minSuccessRate,
      defaultThreshold: this.defaultThreshold,
      maxResults: this.maxResults
    });
  }

  /**
   * Retrieve strategies that are applicable to the current context,
   * filtered by success rate threshold.
   *
   * @param {string} currentContext - Description of current bot situation
   * @param {object} [options={}]
   * @param {number} [options.threshold] - Similarity threshold (overrides default)
   * @param {number} [options.limit] - Max results (overrides default)
   * @returns {Array} - Filtered array of applicable strategies with success_rate >= minSuccessRate
   */
  getApplicableStrategies(currentContext, options = {}) {
    const threshold = options.threshold !== undefined ? options.threshold : this.defaultThreshold;
    const limit = options.limit || this.maxResults;

    if (!currentContext || typeof currentContext !== 'string') {
      logger.warn('StrategyApplicator: getApplicableStrategies requires currentContext string');
      return [];
    }

    try {
      const candidates = this.strategyMemory.retrieveSimilarStrategies(
        currentContext,
        threshold,
        { limit, includeMetadata: true }
      );

      const applicable = candidates.filter(
        result => typeof result.success_rate === 'number' && result.success_rate >= this.minSuccessRate
      );

      logger.debug('StrategyApplicator: Filtered strategies', {
        totalCandidates: candidates.length,
        applicableCount: applicable.length,
        minSuccessRate: this.minSuccessRate
      });

      return applicable;
    } catch (error) {
      logger.warn('StrategyApplicator: Failed to retrieve strategies', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Apply the best matching strategy to the current context.
   * Returns the applied strategy details or null if no applicable strategy found.
   *
   * @param {string} currentContext - Description of current bot situation
   * @param {object} [options={}]
   * @param {number} [options.threshold] - Similarity threshold
   * @param {number} [options.limit] - Max strategies to consider
   * @returns {{ applied: boolean, strategy: object, confidence: number }|null}
   */
  applyStrategies(currentContext, options = {}) {
    if (!currentContext || typeof currentContext !== 'string') {
      logger.debug('StrategyApplicator: applyStrategies requires currentContext string');
      return null;
    }

    if (!featureFlags.isEnabled('META_LEARNING')) {
      logger.debug('StrategyApplicator: META_LEARNING feature disabled, skipping');
      return null;
    }

    const applicable = this.getApplicableStrategies(currentContext, options);

    if (applicable.length === 0) {
      logger.debug('StrategyApplicator: No applicable strategies found', {
        context: currentContext.substring(0, 50)
      });
      return null;
    }

    const best = applicable[0];
    const confidence = best.combinedScore;

    const result = {
      applied: true,
      strategy: {
        id: best.strategy.id,
        context: best.strategy.context,
        actions: best.strategy.actions,
        outcome: best.strategy.outcome,
        timestamp: best.strategy.timestamp
      },
      confidence
    };

    this.appliedCount++;

    logger.info('StrategyApplicator: Applied learned strategy', {
      strategyId: best.strategy.id,
      confidence: confidence.toFixed(3),
      similarity: best.similarity.toFixed(3),
      successRate: best.success_rate.toFixed(3),
      context: currentContext.substring(0, 50)
    });

    return result;
  }

  /**
   * Record the outcome of an applied strategy.
   * Call after the strategy has been executed to track success/failure.
   *
   * @param {string} strategyId - ID of the applied strategy
   * @param {boolean} success - Whether the application was successful
   */
  recordOutcome(strategyId, success) {
    if (success) {
      this.successfulApplications++;
      logger.debug('StrategyApplicator: Application succeeded', { strategyId });
    } else {
      this.failedApplications++;
      logger.debug('StrategyApplicator: Application failed', { strategyId });
    }
  }

  /**
   * Get current applicator status/metrics.
   *
   * @returns {{ appliedCount: number, successfulApplications: number, failedApplications: number }}
   */
  getStatus() {
    return {
      appliedCount: this.appliedCount,
      successfulApplications: this.successfulApplications,
      failedApplications: this.failedApplications
    };
  }

  /**
   * Reset tracking counters.
   */
  resetStatus() {
    this.appliedCount = 0;
    this.successfulApplications = 0;
    this.failedApplications = 0;
  }
}

module.exports = StrategyApplicator;
