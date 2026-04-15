/**
 * Social Awareness Module - Player sentiment tracking and intention inference
 *
 * Features:
 * - Tracks player sentiment history (last 10 interactions per player)
 * - BDI model: Beliefs, Desires, Intentions for each player
 * - Sentiment trend analysis (improving/declining/stable)
 * - Intention inference from context (health, messages, emotion)
 *
 * BDI Model:
 * - Beliefs: What player knows/thinks (derived from messages)
 * - Desires: What player wants (inferred from requests)
 * - Intentions: What player plans to do (inferred from actions)
 *
 * Integration:
 * - Receives emotion from emotion-detector (src/emotion/emotion-detector.js)
 * - Provides social context to Cognitive Controller
 */

const logger = require('../utils/logger');

// Maximum sentiment history entries per player
const MAX_SENTIMENT_HISTORY = 10;

// Urgency thresholds
const LOW_HEALTH_THRESHOLD = 6;
const CRITICAL_HEALTH_THRESHOLD = 3;

// Intention inference keywords
const INTENTION_KEYWORDS = {
  needs_assistance: ['help', 'help me', 'need help', 'stuck', 'trapped', 'save me', 'rescue'],
  wants_trade: ['trade', 'buy', 'sell', 'exchange', 'give me', 'want', 'need'],
  wants_company: ['come', 'follow me', 'join', 'together', 'with me', 'stay'],
  wants_attack: ['attack', 'kill', 'fight', 'hit', 'destroy', 'enemy'],
  wants_info: ['where', 'what', 'how', 'why', 'when', 'who', 'which'],
  wants_build: ['build', 'make', 'create', 'construct', 'place'],
  greeting: ['hi', 'hello', 'hey', 'yo', 'sup', 'greetings'],
  farewell: ['bye', 'goodbye', 'leaving', 'logging off', 'see you', 'cya']
};

class SocialAwareness {
  constructor(options = {}) {
    // Player mental states (BDI model)
    this.playerStates = new Map();

    // Sentiment history per player
    this.sentimentHistory = new Map();

    // Emotion detector (injected or imported)
    // Will be set via setEmotionDetector() or use default import
    this.emotionDetector = options.emotionDetector || null;

    logger.debug('SocialAwareness initialized', {
      maxHistory: MAX_SENTIMENT_HISTORY
    });
  }

  /**
   * Set the emotion detector module
   * @param {Object} detector - Emotion detector module with detectEmotion() method
   */
  setEmotionDetector(detector) {
    this.emotionDetector = detector;
    logger.debug('Emotion detector set', { hasDetector: !!detector });
  }

  /**
   * Track sentiment for a player
   * @param {string} playerId - Player's Minecraft username
   * @param {Object} emotion - Emotion object {emotion: string, confidence: number}
   * @returns {Object} - Updated sentiment state for the player
   */
  trackSentiment(playerId, emotion) {
    if (!playerId || !emotion) {
      logger.warn('Invalid trackSentiment call', { playerId, emotion });
      return null;
    }

    const timestamp = Date.now();
    const sentimentEntry = {
      emotion: emotion.emotion,
      confidence: emotion.confidence,
      timestamp
    };

    // Initialize history if needed
    if (!this.sentimentHistory.has(playerId)) {
      this.sentimentHistory.set(playerId, []);
    }

    const history = this.sentimentHistory.get(playerId);
    history.unshift(sentimentEntry); // Most recent first

    // Enforce max history limit
    if (history.length > MAX_SENTIMENT_HISTORY) {
      history.pop();
    }

    // Calculate trend
    const trend = this._calculateTrend(history);

    // Update player state
    this._updatePlayerEmotion(playerId, emotion);

    logger.debug('Sentiment tracked', {
      playerId,
      emotion: emotion.emotion,
      confidence: emotion.confidence,
      trend
    });

    return {
      playerId,
      currentEmotion: emotion,
      trend,
      historyLength: history.length
    };
  }

  /**
   * Get sentiment history for a player
   * @param {string} playerId - Player's Minecraft username
   * @returns {Array} - Array of sentiment entries (most recent first)
   */
  getSentimentHistory(playerId) {
    return this.sentimentHistory.get(playerId) || [];
  }

  /**
   * Calculate sentiment trend from history
   * @param {Array} history - Sentiment history array
   * @returns {string} - 'improving', 'declining', or 'stable'
   */
  _calculateTrend(history) {
    if (history.length < 2) {
      return 'stable';
    }

    // Map emotions to numeric values for trend calculation
    const emotionScores = {
      joy: 1.0,
      happy: 0.9,
      excitement: 0.8,
      gratitude: 0.85,
      neutral: 0.5,
      surprise: 0.55,
      fear: 0.3,
      sadness: 0.25,
      frustration: 0.2,
      anger: 0.15,
      disgust: 0.1
    };

    // Get last 3 entries for trend
    const recentEntries = history.slice(0, Math.min(3, history.length));

    // Calculate average score of recent entries
    const recentAvg = recentEntries.reduce((sum, entry) => {
      return sum + (emotionScores[entry.emotion] || 0.5);
    }, 0) / recentEntries.length;

    // Compare with previous entries
    if (history.length > 3) {
      const olderEntries = history.slice(3, Math.min(6, history.length));
      const olderAvg = olderEntries.reduce((sum, entry) => {
        return sum + (emotionScores[entry.emotion] || 0.5);
      }, 0) / olderEntries.length;

      const diff = recentAvg - olderAvg;
      if (diff > 0.1) return 'improving';
      if (diff < -0.1) return 'declining';
    }

    return 'stable';
  }

  /**
   * Update player's emotion in their mental state
   * @param {string} playerId - Player ID
   * @param {Object} emotion - Emotion object
   */
  _updatePlayerEmotion(playerId, emotion) {
    if (!this.playerStates.has(playerId)) {
      this._initializePlayerState(playerId);
    }

    const state = this.playerStates.get(playerId);
    state.lastEmotion = emotion;
    state.lastInteraction = Date.now();
  }

  /**
   * Initialize BDI state for a new player
   * @param {string} playerId - Player ID
   */
  _initializePlayerState(playerId) {
    this.playerStates.set(playerId, {
      // BDI Model
      beliefs: [],      // What player knows/thinks
      desires: [],      // What player wants
      intentions: [],   // What player plans to do

      // Metadata
      lastInteraction: Date.now(),
      lastEmotion: null,
      trustLevel: 0.5,  // Neutral starting point

      // Inferred state
      urgency: 'low',
      intentType: null
    });

    logger.debug('Player state initialized', { playerId });
  }

  /**
   * Infer player intention from message and context
   * @param {string} playerId - Player's Minecraft username
   * @param {string} message - Player's message
   * @param {Object} context - Context {health, location, recentEvents, etc.}
   * @returns {Object} - Intention object {type, urgency, confidence, reasoning}
   */
  inferIntention(playerId, message, context = {}) {
    if (!playerId) {
      logger.warn('Invalid inferIntention call', { playerId });
      return null;
    }

    // Initialize player state if needed
    if (!this.playerStates.has(playerId)) {
      this._initializePlayerState(playerId);
    }

    const state = this.playerStates.get(playerId);
    const lowerMessage = message ? message.toLowerCase() : '';

    // Determine urgency from context
    const urgency = this._inferUrgency(context, state, message);

    // Determine intention type from message keywords
    const intentionType = this._inferIntentionType(lowerMessage);

    // Calculate confidence
    const confidence = this._calculateIntentionConfidence(
      intentionType,
      context,
      state,
      message
    );

    // Update player's BDI model
    this._updateBDIModel(playerId, intentionType, message, context);

    const intention = {
      playerId,
      type: intentionType,
      urgency,
      confidence,
      reasoning: {
        matchedKeywords: this._getMatchedKeywords(lowerMessage, intentionType),
        healthContext: context.health,
        emotionContext: state.lastEmotion,
        trendContext: this._calculateTrend(this.sentimentHistory.get(playerId) || [])
      },
      timestamp: Date.now()
    };

    logger.debug('Intention inferred', {
      playerId,
      type: intentionType,
      urgency,
      confidence
    });

    return intention;
  }

  /**
   * Infer urgency level from context
   * @param {Object} context - Player context
   * @param {Object} state - Player's mental state
   * @param {string} message - Player message
   * @returns {string} - 'low', 'medium', or 'high'
   */
  _inferUrgency(context, state, message) {
    const health = context.health;

    // Critical health = high urgency
    if (health !== undefined && health <= CRITICAL_HEALTH_THRESHOLD) {
      return 'high';
    }

    // Low health = medium urgency
    if (health !== undefined && health <= LOW_HEALTH_THRESHOLD) {
      return 'medium';
    }

    // Negative emotion with high confidence = higher urgency
    if (state.lastEmotion) {
      const negativeEmotions = ['fear', 'anger', 'frustration', 'sadness'];
      if (negativeEmotions.includes(state.lastEmotion.emotion) &&
          state.lastEmotion.confidence > 0.7) {
        return 'high';
      }
    }

    // Urgent keywords in message
    const urgentKeywords = ['help', 'urgent', 'now', 'quickly', 'emergency', 'danger'];
    const lowerMessage = message ? message.toLowerCase() : '';
    if (urgentKeywords.some(kw => lowerMessage.includes(kw))) {
      return 'high';
    }

    // Declining sentiment trend = medium urgency
    const trend = this._calculateTrend(this.sentimentHistory.get(state.playerId) || []);
    if (trend === 'declining') {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Infer intention type from message keywords
   * @param {string} lowerMessage - Lowercase message
   * @returns {string} - Intention type
   */
  _inferIntentionType(lowerMessage) {
    for (const [type, keywords] of Object.entries(INTENTION_KEYWORDS)) {
      if (keywords.some(kw => lowerMessage.includes(kw))) {
        return type;
      }
    }
    return 'unknown';
  }

  /**
   * Calculate confidence for inferred intention
   * @param {string} intentionType - Inferred intention type
   * @param {Object} context - Player context
   * @param {Object} state - Player's mental state
   * @param {string} message - Player message
   * @returns {number} - Confidence 0-1
   */
  _calculateIntentionConfidence(intentionType, context, state, message) {
    let confidence = 0.5; // Base confidence

    // Unknown intention = low confidence
    if (intentionType === 'unknown') {
      return 0.3;
    }

    // Multiple keyword matches = higher confidence
    const matchedKeywords = this._getMatchedKeywords(
      message ? message.toLowerCase() : '',
      intentionType
    );
    confidence += Math.min(0.2, matchedKeywords.length * 0.1);

    // Context alignment = higher confidence
    if (intentionType === 'needs_assistance' && context.health &&
        context.health <= LOW_HEALTH_THRESHOLD) {
      confidence += 0.15;
    }

    // Emotion alignment = higher confidence
    if (state.lastEmotion) {
      const emotionIntentionMap = {
        fear: ['needs_assistance', 'wants_company'],
        anger: ['wants_attack'],
        sadness: ['needs_assistance', 'wants_company'],
        joy: ['wants_trade', 'wants_build', 'greeting'],
        frustration: ['needs_assistance']
      };

      const alignedIntentions = emotionIntentionMap[state.lastEmotion.emotion] || [];
      if (alignedIntentions.includes(intentionType)) {
        confidence += 0.15;
      }
    }

    return Math.min(1.0, confidence);
  }

  /**
   * Get matched keywords for an intention type
   * @param {string} lowerMessage - Lowercase message
   * @param {string} intentionType - Intention type
   * @returns {Array} - Array of matched keywords
   */
  _getMatchedKeywords(lowerMessage, intentionType) {
    if (!lowerMessage || !intentionType) return [];

    const keywords = INTENTION_KEYWORDS[intentionType] || [];
    return keywords.filter(kw => lowerMessage.includes(kw));
  }

  /**
   * Update BDI model based on inferred intention
   * @param {string} playerId - Player ID
   * @param {string} intentionType - Inferred intention type
   * @param {string} message - Player message
   * @param {Object} context - Player context
   */
  _updateBDIModel(playerId, intentionType, message, context) {
    const state = this.playerStates.get(playerId);

    // Update beliefs (what player knows)
    // Extract factual statements or questions
    if (message) {
      const beliefs = this._extractBeliefs(message);
      if (beliefs.length > 0) {
        state.beliefs = [...beliefs, ...state.beliefs].slice(0, 10);
      }
    }

    // Update desires (what player wants)
    const desireMap = {
      needs_assistance: 'safety',
      wants_trade: 'items',
      wants_company: 'companionship',
      wants_attack: 'conflict',
      wants_info: 'knowledge',
      wants_build: 'creation',
      greeting: 'social_connection',
      farewell: 'departure'
    };

    const desire = desireMap[intentionType];
    if (desire && !state.desires.includes(desire)) {
      state.desires.unshift(desire);
      if (state.desires.length > 5) {
        state.desires.pop();
      }
    }

    // Update intentions (what player plans to do)
    const intentionMap = {
      needs_assistance: 'seek_help',
      wants_trade: 'initiate_trade',
      wants_company: 'invite_companion',
      wants_attack: 'engage_combat',
      wants_info: 'request_information',
      wants_build: 'start_construction',
      greeting: 'initiate_interaction',
      farewell: 'end_session'
    };

    const mappedIntention = intentionMap[intentionType];
    if (mappedIntention) {
      state.intentions.unshift({
        type: mappedIntention,
        timestamp: Date.now(),
        context: { health: context.health }
      });
      if (state.intentions.length > 5) {
        state.intentions.pop();
      }
    }

    // Update metadata
    state.urgency = this._inferUrgency(context, state, message);
    state.intentType = intentionType;
    state.lastInteraction = Date.now();
  }

  /**
   * Extract beliefs from a message
   * @param {string} message - Player message
   * @returns {Array} - Array of belief strings
   */
  _extractBeliefs(message) {
    const beliefs = [];
    const lowerMessage = message.toLowerCase();

    // Location beliefs
    const locationPatterns = [
      /i (?:am|'m) (?:at|in|near) (?:the )?(\w+)/,
      /(?:this|the) (\w+) (?:is|has|contains)/
    ];

    for (const pattern of locationPatterns) {
      const match = lowerMessage.match(pattern);
      if (match) {
        beliefs.push({ type: 'location', content: match[1] });
      }
    }

    // Knowledge beliefs
    const knowledgePatterns = [
      /i know (?:that )?(\w+)/,
      /i (?:think|believe) (\w+)/
    ];

    for (const pattern of knowledgePatterns) {
      const match = lowerMessage.match(pattern);
      if (match) {
        beliefs.push({ type: 'knowledge', content: match[1] });
      }
    }

    return beliefs;
  }

  /**
   * Get player's mental state (BDI model)
   * @param {string} playerId - Player ID
   * @returns {Object|null} - Player's mental state
   */
  getPlayerState(playerId) {
    return this.playerStates.get(playerId) || null;
  }

  /**
   * Get all player states
   * @returns {Map} - Map of playerId -> state
   */
  getAllPlayerStates() {
    return new Map(this.playerStates);
  }

  /**
   * Clear player state (e.g., on logout)
   * @param {string} playerId - Player ID
   */
  clearPlayerState(playerId) {
    this.playerStates.delete(playerId);
    this.sentimentHistory.delete(playerId);
    logger.debug('Player state cleared', { playerId });
  }

  /**
   * Get social context for Cognitive Controller
   * @param {string} playerId - Player ID (optional, for specific player context)
   * @returns {Object} - Social context object
   */
  getSocialContext(playerId = null) {
    const context = {
      activePlayers: this.playerStates.size,
      urgentPlayers: [],
      recentInteractions: []
    };

    // Find players with high urgency
    for (const [id, state] of this.playerStates) {
      if (state.urgency === 'high') {
        context.urgentPlayers.push({
          playerId: id,
          intentType: state.intentType,
          lastEmotion: state.lastEmotion
        });
      }

      // Get recent interactions (last 5 minutes)
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      if (state.lastInteraction > fiveMinutesAgo) {
        context.recentInteractions.push({
          playerId: id,
          lastInteraction: state.lastInteraction,
          trend: this._calculateTrend(this.sentimentHistory.get(id) || [])
        });
      }
    }

    // If specific player requested, include their full state
    if (playerId && this.playerStates.has(playerId)) {
      context.targetPlayer = {
        playerId,
        state: this.playerStates.get(playerId),
        sentimentHistory: this.sentimentHistory.get(playerId) || []
      };
    }

    return context;
  }

  /**
   * Process a message with emotion detection (if detector available)
   * @param {string} playerId - Player ID
   * @param {string} message - Player message
   * @param {Object} context - Player context
   * @returns {Promise<Object>} - Combined result with sentiment and intention
   */
  async processMessage(playerId, message, context = {}) {
    let emotion = null;

    // Detect emotion if detector available
    if (this.emotionDetector && typeof this.emotionDetector.detectEmotion === 'function') {
      try {
        emotion = await this.emotionDetector.detectEmotion(message);
      } catch (error) {
        logger.warn('Emotion detection failed', {
          playerId,
          error: error.message
        });
      }
    }

    // Track sentiment if emotion detected
    if (emotion && emotion.confidence >= 0.7) {
      this.trackSentiment(playerId, emotion);
    }

    // Infer intention
    const intention = this.inferIntention(playerId, message, {
      ...context,
      emotion
    });

    return {
      playerId,
      emotion,
      intention,
      socialContext: this.getSocialContext(playerId)
    };
  }
}

module.exports = SocialAwareness;
