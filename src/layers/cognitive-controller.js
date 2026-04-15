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
   * Priority rules:
   * 1. danger (Pilot) - immediate survival threats
   * 2. social (Strategy) - player interactions, emotions
   * 3. goals (Commander) - long-term objectives
   *
   * @param {object} inputs - Aggregated inputs from all modules
   * @param {object} inputs.personality - Personality system output
   * @param {object} inputs.emotion - Emotional state output
   * @param {object} inputs.social - Social/context output
   * @param {object} inputs.goals - Current goals output
   * @param {object} inputs.danger - Danger signals (hostile mobs, lava, low health)
   * @returns {object} Unified decision for broadcast
   */
  synthesize(inputs) {
    logger.debug('Synthesizing inputs', {
      hasPersonality: !!inputs.personality,
      hasEmotion: !!inputs.emotion,
      hasSocial: !!inputs.social,
      hasGoals: !!inputs.goals,
      hasDanger: !!inputs.danger
    });

    // Determine action based on priority rules
    let selectedAction = null;
    let priority = 'normal';
    let source = null;
    let confidence = 1.0;

    // Priority 1: Danger (survival) - always wins
    if (inputs.danger && inputs.danger.active) {
      selectedAction = inputs.danger.action || { type: 'flee', reason: inputs.danger.reason };
      priority = 'critical';
      source = 'danger';
      confidence = inputs.danger.confidence || 1.0;
      logger.info('Danger prioritized', { action: selectedAction, reason: inputs.danger.reason });
    }
    // Priority 2: Social (player interactions)
    else if (inputs.social && inputs.social.active) {
      selectedAction = inputs.social.action;
      priority = 'high';
      source = 'social';
      confidence = inputs.social.confidence || 0.8;

      // Blend with emotion if available
      if (inputs.emotion) {
        selectedAction = this._blendWithEmotion(selectedAction, inputs.emotion);
        confidence = Math.min(confidence, inputs.emotion.confidence || 0.7);
      }

      logger.debug('Social prioritized', { action: selectedAction });
    }
    // Priority 3: Goals (long-term objectives)
    else if (inputs.goals && inputs.goals.active) {
      selectedAction = inputs.goals.action;
      priority = 'normal';
      source = 'goals';
      confidence = inputs.goals.confidence || 0.6;

      // Blend with personality if available
      if (inputs.personality) {
        selectedAction = this._blendWithPersonality(selectedAction, inputs.personality);
      }

      logger.debug('Goals prioritized', { action: selectedAction });
    }
    // Default: idle state
    else {
      selectedAction = { type: 'idle', reason: 'no_active_inputs' };
      priority = 'low';
      source = 'default';
      confidence = 1.0;
    }

    // Check coherence if talk intent is present
    let coherence = true;
    if (inputs.social && inputs.social.talk) {
      coherence = this.checkCoherence(inputs.social.talk, selectedAction);
    }

    const decision = {
      timestamp: Date.now(),
      inputs: inputs,
      action: selectedAction,
      priority: priority,
      source: source,
      confidence: confidence,
      coherence: coherence,
      deferred: this._getDeferredInputs(inputs, source)
    };

    // Record in history
    this.decisionHistory.push(decision);
    if (this.decisionHistory.length > this.maxHistory) {
      this.decisionHistory.shift();
    }

    logger.debug('Decision synthesized', {
      action: selectedAction,
      priority,
      source,
      confidence,
      coherence
    });

    return decision;
  }

  /**
   * Blend action with emotional context
   * @private
   */
  _blendWithEmotion(action, emotion) {
    if (!action) return action;

    const blendedAction = { ...action };

    // Add emotional context to action
    if (emotion.state) {
      blendedAction.emotionalContext = emotion.state;
    }

    // Modify action based on emotion
    // Example: if emotion is "fear" and action is "chat", add caution
    if (emotion.state === 'fear' && action.type === 'chat') {
      blendedAction.tone = 'cautious';
    } else if (emotion.state === 'joy' && action.type === 'chat') {
      blendedAction.tone = 'friendly';
    }

    return blendedAction;
  }

  /**
   * Blend action with personality traits
   * @private
   */
  _blendWithPersonality(action, personality) {
    if (!action || !personality.traits) return action;

    const blendedAction = { ...action };

    // Add personality modifiers based on traits
    if (personality.traits.bravery !== undefined) {
      blendedAction.braveryLevel = personality.traits.bravery;
    }

    return blendedAction;
  }

  /**
   * Get inputs that were deferred due to priority
   * @private
   */
  _getDeferredInputs(inputs, activeSource) {
    const deferred = [];

    const priorityOrder = ['danger', 'social', 'goals'];

    const activeIndex = priorityOrder.indexOf(activeSource);

    for (let i = activeIndex + 1; i < priorityOrder.length; i++) {
      const sourceName = priorityOrder[i];
      if (inputs[sourceName] && inputs[sourceName].active) {
        deferred.push({
          source: sourceName,
          action: inputs[sourceName].action,
          reason: 'lower_priority'
        });
      }
    }

  return deferred;
  }

  /**
   * Broadcast decision to all registered modules
   *
   * @param {object} decision - The decision to broadcast
   * @returns {object} Broadcast results from each module
   */
  broadcast(decision) {
    logger.debug('Broadcasting decision', {
      action: decision.action,
      priority: decision.priority,
      source: decision.source
    });

    const results = {};

    for (const [name, module] of Object.entries(this.modules)) {
      try {
        if (typeof module.receiveDecision === 'function') {
          const response = module.receiveDecision(decision);
          results[name] = {
            acknowledged: true,
            response: response
          };
        } else {
          results[name] = {
            acknowledged: true,
            response: null
          };
        }
      } catch (error) {
        logger.error('Module broadcast failed', { name, error: error.message });
        results[name] = {
          acknowledged: false,
          error: error.message
        };
      }
    }

    logger.debug('Broadcast complete', {
      moduleCount: Object.keys(results).length,
      successCount: Object.values(results).filter(r => r.acknowledged).length
    });

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
    if (!talk || !action) {
      return true;
    }

    const talkLower = talk.toLowerCase();
    const actionType = action.type ? action.type.toLowerCase() : '';

    const conflictPatterns = [
      { talkPattern: /help|assist|friend|protect|safe/i, actionPattern: /attack|kill|hit|hurt/i, reason: 'offering_help_but_attacking' },
      { talkPattern: /follow|come|here|with you/i, actionPattern: /flee|run|escape|leave/i, reason: 'offering_company_but_fleeing' },
      { talkPattern: /stay|wait|remain|here/i, actionPattern: /move|go|travel|explore|walk/i, reason: 'offering_to_stay_but_moving' },
      { talkPattern: /peace|friendly|calm|relax/i, actionPattern: /attack|fight|combat|aggressive/i, reason: 'offering_peace_but_fighting' },
      { talkPattern: /friendly|friend|ally|together/i, actionPattern: /steal|take|betray/i, reason: 'offering_friendship_but_betraying' },
      { talkPattern: /sorry|apologize|mistake|wrong/i, actionPattern: /attack|continue|persist/i, reason: 'apologizing_but_escalating' },
      { talkPattern: /love|care|like you|fond/i, actionPattern: /attack|hurt|kill/i, reason: 'expressing_affection_but_harming' }
    ];

    for (const pattern of conflictPatterns) {
      const talkMatches = pattern.talkPattern.test(talkLower);
      const actionMatches = pattern.actionPattern.test(actionType);

      if (talkMatches && actionMatches) {
        logger.warn('Coherence conflict detected', {
          talk,
          actionType,
          reason: pattern.reason
        });
        return false;
      }
    }

    return true;
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