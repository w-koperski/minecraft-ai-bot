/**
 * Cognitive Controller - PIANO Architecture Bottleneck
 *
 * Receives inputs from all modules (personality, emotion, social, goals)
 * Synthesizes a unified decision and broadcasts to all modules.
 *
 * This is the central coordination point that ensures coherent behavior
 * when multiple subsystems have conflicting desires.
 */

const logger = require('../utils/logger');

class CognitiveController {
  constructor() {
    this.modules = {};
    this.decisionHistory = [];
    this.maxHistory = 50;
    logger.debug('CognitiveController initialized');
  }

  /**
   * Register a module with the cognitive controller
   * @param {string} name - Module name (e.g., 'personality', 'emotion', 'social', 'goals')
   * @param {object} module - Module instance
   */
  registerModule(name, module) {
    this.modules[name] = module;
    logger.debug('Module registered', { name });
  }

  /**
   * Synthesize all inputs into a single unified decision
   *
   * @param {object} inputs - Aggregated inputs from all modules
   * @param {object} inputs.personality - Personality system output
   * @param {object} inputs.emotion - Emotional state output
   * @param {object} inputs.social - Social/context output
   * @param {object} inputs.goals - Current goals output
   * @returns {object} Unified decision for broadcast
   */
  synthesize(inputs) {
    logger.debug('Synthesizing inputs', {
      hasPersonality: !!inputs.personality,
      hasEmotion: !!inputs.emotion,
      hasSocial: !!inputs.social,
      hasGoals: !!inputs.goals
    });

    // Skeleton implementation - aggregates inputs into single decision
    const decision = {
      timestamp: Date.now(),
      inputs: inputs,
      action: null,  // Placeholder for actual decision logic
      priority: 'normal',
      coherence: true
    };

    // Record in history
    this.decisionHistory.push(decision);
    if (this.decisionHistory.length > this.maxHistory) {
      this.decisionHistory.shift();
    }

    logger.debug('Decision synthesized', { decision });
    return decision;
  }

  /**
   * Broadcast decision to all registered modules
   *
   * @param {object} decision - The decision to broadcast
   * @returns {object} Broadcast results from each module
   */
  broadcast(decision) {
    logger.debug('Broadcasting decision', { decision });

    const results = {};
    for (const [name, module] of Object.entries(this.modules)) {
      logger.debug('Broadcasting to module', { name });
      // Skeleton - each module would acknowledge the decision
      results[name] = { acknowledged: true };
    }

    logger.debug('Broadcast complete', { results });
    return results;
  }

  /**
   * Check coherence between talk and action
   * Detects conflicts that might indicate deception or confusion
   *
   * @param {string} talk - What the bot said/wants to say
   * @param {object} action - What the bot is doing/will do
   * @returns {boolean} True if coherent, false if conflict detected
   */
  checkCoherence(talk, action) {
    logger.debug('Checking coherence', { talk, action });

    // Skeleton implementation - no actual logic yet
    // Will compare talk intent vs action intent
    const coherent = true;

    if (!coherent) {
      logger.warn('Coherence conflict detected', { talk, action });
    }

    return coherent;
  }

  /**
   * Get decision history
   * @param {number} limit - Maximum number of decisions to return
   * @returns {Array} Recent decisions
   */
  getHistory(limit = 10) {
    return this.decisionHistory.slice(-limit);
  }
}

module.exports = CognitiveController;