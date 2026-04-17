const logger = require('./logger');

/**
 * FeatureFlags - Centralized feature flag management
 * 
 * Reads all ENABLE_* environment variables and provides validation.
 * All flags default to false for backward compatibility.
 */
class FeatureFlags {
  constructor() {
    // Read all feature flags from environment
    this.flags = {
      DRIVES: this._parseFlag('ENABLE_DRIVES'),
      DASHBOARD: this._parseFlag('ENABLE_DASHBOARD'),
      VISION: this._parseFlag('ENABLE_VISION'),
      ADVANCED_PATHFINDING: this._parseFlag('ENABLE_ADVANCED_PATHFINDING'),
      META_LEARNING: this._parseFlag('ENABLE_META_LEARNING'),
      CONVERSATION_CONTEXT: this._parseFlag('ENABLE_CONVERSATION_CONTEXT'),
      AUTO_CONSOLIDATION: this._parseFlag('ENABLE_AUTO_CONSOLIDATION'),
      CONFIDENCE_SCORING: this._parseFlag('ENABLE_CONFIDENCE_SCORING'),
      DANGER_PREDICTION: this._parseFlag('ENABLE_DANGER_PREDICTION'),
      FAILURE_DETECTION: this._parseFlag('ENABLE_FAILURE_DETECTION'),
      SKILL_SYSTEM: this._parseFlag('ENABLE_SKILL_SYSTEM'),
      ITEM_TRACKER: this._parseFlag('ENABLE_ITEM_TRACKER'),
      REFLECTION: this._parseFlag('ENABLE_REFLECTION'),
      AUTONOMOUS_GOALS: this._parseFlag('ENABLE_AUTONOMOUS_GOALS')
    };

    // Validate interdependencies
    this._validateDependencies();

    logger.debug('FeatureFlags initialized', { flags: this.flags });
  }

  /**
   * Parse boolean flag from environment variable
   * @param {string} envVar - Environment variable name
   * @returns {boolean}
   */
  _parseFlag(envVar) {
    const value = process.env[envVar];
    return value === 'true' || value === '1';
  }

  /**
   * Check if a feature is enabled
   * @param {string} featureName - Feature name (without ENABLE_ prefix)
   * @returns {boolean}
   */
  isEnabled(featureName) {
    const normalizedName = featureName.toUpperCase().replace('ENABLE_', '');
    return this.flags[normalizedName] === true;
  }

  /**
   * Validate feature interdependencies
   * Warns if conflicting flags are set
   */
  _validateDependencies() {
    // META_LEARNING requires DRIVES (for context)
    if (this.flags.META_LEARNING && !this.flags.DRIVES) {
      logger.warn('ENABLE_META_LEARNING=true but ENABLE_DRIVES=false. Meta-learning works best with drives enabled.');
    }

    // VISION requires ADVANCED_PATHFINDING to be useful
    if (this.flags.VISION && !this.flags.ADVANCED_PATHFINDING) {
      logger.warn('ENABLE_VISION=true but ENABLE_ADVANCED_PATHFINDING=false. Vision is most useful with advanced pathfinding.');
    }

    // AUTONOMOUS_GOALS requires DRIVES
    if (this.flags.AUTONOMOUS_GOALS && !this.flags.DRIVES) {
      logger.warn('ENABLE_AUTONOMOUS_GOALS=true but ENABLE_DRIVES=false. Autonomous goals require drives to function.');
    }

    // CONVERSATION_CONTEXT works best with META_LEARNING
    if (this.flags.CONVERSATION_CONTEXT && !this.flags.META_LEARNING) {
      logger.warn('ENABLE_CONVERSATION_CONTEXT=true but ENABLE_META_LEARNING=false. Conversation context works best with meta-learning.');
    }
  }

  /**
   * Get all flags as object
   * @returns {Object}
   */
  getAll() {
    return { ...this.flags };
  }
}

// Export singleton instance
const featureFlags = new FeatureFlags();
module.exports = featureFlags;
