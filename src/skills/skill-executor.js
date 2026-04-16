const logger = require('../utils/logger');

/**
 * SkillExecutor - Executes skills with retry logic, exponential backoff, and confidence-based filtering
 * 
 * Features:
 * - Retry failed skills up to 3 times with exponential backoff (1s, 2s, 4s)
 * - Confidence scoring integration (skip retry if confidence < 0.3)
 * - Execution metrics tracking (attempts, successes, failures, durations)
 * - Per-skill metrics aggregation
 */
class SkillExecutor {
  constructor(skillRegistry) {
    this.registry = skillRegistry;
    this.metrics = {
      totalAttempts: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      skillMetrics: new Map() // per-skill metrics
    };
  }

  /**
   * Execute a skill with retry logic
   * 
   * @param {string} skillName - Name of the skill to execute
   * @param {object} params - Parameters to pass to the skill
   * @param {object} context - Execution context (may include confidence score)
   * @param {object} options - Execution options
   * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
   * @param {number} options.baseDelay - Base delay in ms for exponential backoff (default: 1000)
   * @param {boolean} options.useConfidence - Whether to use confidence filtering (default: true)
   * @returns {Promise<{success: boolean, outcome?: any, error?: string, attempts: number, duration: number}>}
   */
  async execute(skillName, params, context = {}, options = {}) {
    const {
      maxRetries = 3,
      baseDelay = 1000, // 1 second
      useConfidence = true
    } = options;

    const startTime = Date.now();
    let lastError = null;
    let attempts = 0;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      attempts++;
      this.metrics.totalAttempts++;

      try {
        logger.debug(`[SkillExecutor] Executing ${skillName}, attempt ${attempt}/${maxRetries}`, {
          skill: skillName,
          attempt,
          maxRetries,
          params
        });

        const result = await this.registry.execute(skillName, params, context);

        if (!result) {
          lastError = 'Skill returned null/undefined result';
          logger.error(`[SkillExecutor] Skill ${skillName} returned no result`, {
            skill: skillName,
            attempt
          });
          continue;
        }

        if (result.success) {
          this.metrics.totalSuccesses++;
          this._updateSkillMetrics(skillName, true, Date.now() - startTime);

          logger.info(`[SkillExecutor] Skill ${skillName} succeeded on attempt ${attempt}`, {
            skill: skillName,
            attempt,
            duration: Date.now() - startTime
          });

          return {
            ...result,
            attempts,
            duration: Date.now() - startTime
          };
        }

        lastError = result.error || 'Skill execution failed';

        if (useConfidence && context.confidence !== undefined) {
          if (context.confidence < 0.3) {
            logger.warn(`[SkillExecutor] Low confidence (${context.confidence.toFixed(2)}), skipping retry`, {
              skill: skillName,
              confidence: context.confidence,
              attempt
            });
            break;
          }
        }

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          logger.debug(`[SkillExecutor] Retry ${attempt} failed, waiting ${delay}ms before retry`, {
            skill: skillName,
            delay,
            error: lastError
          });
          await this._wait(delay);
        }

      } catch (error) {
        lastError = error.message;
        logger.error(`[SkillExecutor] Error executing ${skillName}:`, {
          skill: skillName,
          attempt,
          error: error.message,
          stack: error.stack
        });
      }
    }

    this.metrics.totalFailures++;
    this._updateSkillMetrics(skillName, false, Date.now() - startTime);

    logger.warn(`[SkillExecutor] Skill ${skillName} failed after ${attempts} attempts`, {
      skill: skillName,
      attempts,
      error: lastError,
      duration: Date.now() - startTime
    });

    return {
      success: false,
      error: lastError,
      attempts,
      duration: Date.now() - startTime
    };
  }

  /**
   * Get execution metrics
   * 
   * @returns {object} Metrics including total attempts, successes, failures, success rate, and per-skill metrics
   */
  getMetrics() {
    const skillMetricsObj = {};
    
    this.metrics.skillMetrics.forEach((metric, skillName) => {
      skillMetricsObj[skillName] = {
        ...metric,
        avgDuration: metric.attempts > 0 ? metric.totalDuration / metric.attempts : 0,
        successRate: metric.attempts > 0 ? metric.successes / metric.attempts : 0
      };
    });

    return {
      totalAttempts: this.metrics.totalAttempts,
      totalSuccesses: this.metrics.totalSuccesses,
      totalFailures: this.metrics.totalFailures,
      successRate: this.metrics.totalAttempts > 0 
        ? this.metrics.totalSuccesses / this.metrics.totalAttempts 
        : 0,
      skillMetrics: skillMetricsObj
    };
  }

  /**
   * Reset all metrics
   */
  resetMetrics() {
    this.metrics.totalAttempts = 0;
    this.metrics.totalSuccesses = 0;
    this.metrics.totalFailures = 0;
    this.metrics.skillMetrics.clear();

    logger.info('[SkillExecutor] Metrics reset');
  }

  /**
   * Update per-skill metrics
   * 
   * @param {string} skillName - Name of the skill
   * @param {boolean} success - Whether the execution succeeded
   * @param {number} duration - Duration of execution in ms
   */
  _updateSkillMetrics(skillName, success, duration) {
    if (!this.metrics.skillMetrics.has(skillName)) {
      this.metrics.skillMetrics.set(skillName, {
        attempts: 0,
        successes: 0,
        failures: 0,
        totalDuration: 0
      });
    }

    const skillMetric = this.metrics.skillMetrics.get(skillName);
    skillMetric.attempts++;

    if (success) {
      skillMetric.successes++;
    } else {
      skillMetric.failures++;
    }

    skillMetric.totalDuration += duration;
  }

  /**
   * Wait for specified milliseconds
   * 
   * @param {number} ms - Milliseconds to wait
   * @returns {Promise<void>}
   */
  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = SkillExecutor;
