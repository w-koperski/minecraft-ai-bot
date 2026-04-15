/**
 * Relationship State - Manages bot-player relationship context
 *
 * Provides relationship data (trust, familiarity) for prompt injection.
 * Uses personality-state table for persistence (via PersonalityEngine).
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const logger = require('./logger');

// Default relationship values
const DEFAULT_RELATIONSHIP = {
  trust: 0.5,      // 0.0-1.0: How much the bot trusts the player
  familiarity: 0.3, // 0.0-1.0: How well the bot knows the player
  interactionCount: 0,
  lastInteraction: null
};

class RelationshipState {
  constructor(dbPath = path.join(process.cwd(), 'state', 'memory.db')) {
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        logger.error('RelationshipState: Database connection failed', { error: err.message });
      } else {
        logger.debug('RelationshipState: Database connected');
        this._initTable();
      }
    });
    this.cache = null;
    this.cacheTime = 0;
    this.CACHE_TTL = 5000; // 5 seconds
  }

  /**
   * Initialize relationship table if not exists
   */
  _initTable() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS relationship_state (
        player_id TEXT PRIMARY KEY,
        trust REAL NOT NULL DEFAULT 0.5,
        familiarity REAL NOT NULL DEFAULT 0.3,
        interaction_count INTEGER NOT NULL DEFAULT 0,
        last_interaction INTEGER,
        last_updated INTEGER NOT NULL
      )
    `);
  }

  /**
   * Get relationship state for a player (with caching)
   * @param {string} playerId - Player identifier (default: 'default')
   * @returns {Promise<object>} - Relationship state { trust, familiarity, interactionCount }
   */
  async getRelationship(playerId = 'default') {
    // Check cache
    const now = Date.now();
    if (this.cache && this.cache.playerId === playerId && (now - this.cacheTime) < this.CACHE_TTL) {
      return this.cache.data;
    }

    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT trust, familiarity, interaction_count, last_interaction
         FROM relationship_state WHERE player_id = ?`,
        [playerId],
        (err, row) => {
          if (err) {
            logger.error('RelationshipState: Failed to get relationship', { error: err.message });
            resolve({ ...DEFAULT_RELATIONSHIP });
          } else if (!row) {
            // Return defaults, don't persist yet
            resolve({ ...DEFAULT_RELATIONSHIP });
          } else {
            const data = {
              trust: row.trust,
              familiarity: row.familiarity,
              interactionCount: row.interaction_count,
              lastInteraction: row.last_interaction
            };
            this.cache = { playerId, data };
            this.cacheTime = now;
            resolve(data);
          }
        }
      );
    });
  }

  /**
   * Update relationship state
   * @param {string} playerId - Player identifier
   * @param {object} updates - Fields to update { trust?, familiarity?, interactionCount? }
   * @returns {Promise<object>} - Updated relationship state
   */
  async updateRelationship(playerId = 'default', updates = {}) {
    const current = await this.getRelationship(playerId);

    // Apply updates with bounds
    const trust = Math.max(0, Math.min(1, updates.trust ?? current.trust));
    const familiarity = Math.max(0, Math.min(1, updates.familiarity ?? current.familiarity));
    const interactionCount = updates.interactionCount ?? (current.interactionCount + 1);

    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO relationship_state
         (player_id, trust, familiarity, interaction_count, last_interaction, last_updated)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [playerId, trust, familiarity, interactionCount, Date.now(), Date.now()],
        (err) => {
          if (err) {
            logger.error('RelationshipState: Failed to update relationship', { error: err.message });
            resolve(current);
          } else {
            const data = { trust, familiarity, interactionCount, lastInteraction: Date.now() };
            this.cache = { playerId, data };
            this.cacheTime = Date.now();
            resolve(data);
          }
        }
      );
    });
  }

  /**
   * Record positive interaction (increases trust and familiarity)
   * @param {string} playerId - Player identifier
   * @returns {Promise<object>} - Updated relationship state
   */
  async recordPositiveInteraction(playerId = 'default') {
    const current = await this.getRelationship(playerId);
    return this.updateRelationship(playerId, {
      trust: Math.min(1.0, current.trust + 0.02),
      familiarity: Math.min(1.0, current.familiarity + 0.01)
    });
  }

  /**
   * Record negative interaction (decreases trust)
   * @param {string} playerId - Player identifier
   * @returns {Promise<object>} - Updated relationship state
   */
  async recordNegativeInteraction(playerId = 'default') {
    const current = await this.getRelationship(playerId);
    return this.updateRelationship(playerId, {
      trust: Math.max(0, current.trust - 0.05)
    });
  }

  /**
   * Format relationship for prompt injection
   * @param {object} relationship - Relationship state
   * @returns {string} - Human-readable relationship description
   */
  formatForPrompt(relationship) {
    const trustLevel = this._getTrustLevel(relationship.trust);
    const familiarityLevel = this._getFamiliarityLevel(relationship.familiarity);

    return `Relationship with player: ${trustLevel} trust (${(relationship.trust * 100).toFixed(0)}%), ${familiarityLevel} familiarity (${(relationship.familiarity * 100).toFixed(0)}%). Interactions: ${relationship.interactionCount}.`;
  }

  /**
   * Get trust level description
   */
  _getTrustLevel(trust) {
    if (trust >= 0.9) return 'very high';
    if (trust >= 0.7) return 'high';
    if (trust >= 0.5) return 'moderate';
    if (trust >= 0.3) return 'low';
    return 'very low';
  }

  /**
   * Get familiarity level description
   */
  _getFamiliarityLevel(familiarity) {
    if (familiarity >= 0.8) return 'very high';
    if (familiarity >= 0.6) return 'high';
    if (familiarity >= 0.4) return 'moderate';
    if (familiarity >= 0.2) return 'low';
    return 'very low';
  }

  /**
   * Close database connection
   */
  async close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          logger.error('RelationshipState: Failed to close database', { error: err.message });
          reject(err);
        } else {
          logger.debug('RelationshipState: Database closed');
          resolve();
        }
      });
    });
  }
}

// Singleton
let instance = null;

function getInstance(dbPath) {
  if (!instance) {
    instance = new RelationshipState(dbPath);
  }
  return instance;
}

module.exports = {
  RelationshipState,
  getInstance,
  getRelationship: (playerId) => getInstance().getRelationship(playerId),
  updateRelationship: (playerId, updates) => getInstance().updateRelationship(playerId, updates),
  recordPositiveInteraction: (playerId) => getInstance().recordPositiveInteraction(playerId),
  recordNegativeInteraction: (playerId) => getInstance().recordNegativeInteraction(playerId),
  formatForPrompt: (relationship) => getInstance().formatForPrompt(relationship),
  DEFAULT_RELATIONSHIP
};
