/**
 * Conversation Store - Persistent conversation tracking with SQLite
 *
 * Features:
 * - Save/retrieve conversations per player
 * - Relationship tracking (trust/familiarity scores)
 * - Conversation summarization (every 10 messages)
 * - 30-day retention with automatic cleanup
 *
 * Tables used (from schema.sql):
 * - conversations: player_id, bot_message, player_message, timestamp, context
 * - relationships: player_id, trust_score, familiarity, interaction_count, last_seen
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../utils/logger');

const RETENTION_DAYS = 30;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
const SUMMARIZATION_THRESHOLD = 10; // Summarize every 10 messages

// Interaction type modifiers for relationship scores
const INTERACTION_MODIFIERS = {
  positive: { trust: 0.02, familiarity: 0.01 },
  negative: { trust: -0.05, familiarity: 0.0 },
  neutral: { trust: 0.0, familiarity: 0.005 },
  helpful: { trust: 0.05, familiarity: 0.02 },
  hostile: { trust: -0.1, familiarity: 0.0 },
  greeting: { trust: 0.01, familiarity: 0.01 }
};

class ConversationStore {
  constructor(dbPath = path.join(process.cwd(), 'state', 'memory.db')) {
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        logger.error('Failed to connect to SQLite database', { error: err.message });
      } else {
        logger.debug('ConversationStore connected', { dbPath });
      }
    });
    this._initTables();
  }

  /**
   * Initialize required tables if they don't exist
   * Note: Tables should already exist from schema.sql, but this ensures compatibility
   */
  _initTables() {
    this.db.serialize(() => {
      // Conversations table
      this.db.run(`CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id TEXT NOT NULL,
        bot_message TEXT,
        player_message TEXT,
        timestamp INTEGER NOT NULL,
        context TEXT,
        is_summary INTEGER DEFAULT 0
      )`);

      // Index for player lookups
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_conversations_player_id ON conversations(player_id)`);

      // Index for timestamp queries
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp)`);

      // Relationships table
      this.db.run(`CREATE TABLE IF NOT EXISTS relationships (
        player_id TEXT PRIMARY KEY,
        trust_score REAL NOT NULL DEFAULT 0.5,
        familiarity REAL NOT NULL DEFAULT 0.0,
        interaction_count INTEGER NOT NULL DEFAULT 0,
        last_seen INTEGER
      )`);

      // Index for trust-based sorting
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_relationships_trust ON relationships(trust_score)`);
    });
  }

  /**
   * Run a function within a transaction
   * @param {Function} fn - Function to run (receives db instance)
   * @returns {Promise<any>} - Result of the function
   */
  async _runTransaction(fn) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION', (beginErr) => {
          if (beginErr) {
            logger.error('Failed to begin transaction', { error: beginErr.message });
            reject(beginErr);
            return;
          }

          fn(this.db)
            .then((result) => {
              this.db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  logger.error('Failed to commit transaction', { error: commitErr.message });
                  this.db.run('ROLLBACK');
                  reject(commitErr);
                } else {
                  resolve(result);
                }
              });
            })
            .catch((error) => {
              this.db.run('ROLLBACK', () => {
                logger.error('Transaction rolled back', { error: error.message });
                reject(error);
              });
            });
        });
      });
    });
  }

  /**
   * Save a conversation exchange
   * @param {string} playerId - Player's Minecraft username
   * @param {string} botMessage - Bot's message (optional)
   * @param {string} playerMessage - Player's message (optional)
   * @param {object} context - Additional context (location, activity, etc.)
   * @returns {Promise<number>} - The inserted row ID
   */
  async saveConversation(playerId, botMessage = null, playerMessage = null, context = {}) {
    const timestamp = Date.now();
    const contextJson = Object.keys(context).length > 0 ? JSON.stringify(context) : null;

    return this._runTransaction(async (db) => {
      // Insert the conversation
      const conversationId = await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO conversations (player_id, bot_message, player_message, timestamp, context)
           VALUES (?, ?, ?, ?, ?)`,
          [playerId, botMessage, playerMessage, timestamp, contextJson],
          function(err) {
            if (err) {
              logger.error('Failed to save conversation', { error: err.message, playerId });
              reject(err);
            } else {
              resolve(this.lastID);
            }
          }
        );
      });

      // Check if we need to summarize (every 10 messages)
      const messageCount = await new Promise((resolve, reject) => {
        db.get(
          `SELECT COUNT(*) as count FROM conversations
           WHERE player_id = ? AND is_summary = 0`,
          [playerId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
          }
        );
      });

      // Summarize if threshold reached
      if (messageCount >= SUMMARIZATION_THRESHOLD) {
        await this._summarizeConversations(playerId, db);
      }

      logger.debug('Conversation saved', { id: conversationId, playerId });
      return conversationId;
    });
  }

  /**
   * Summarize old conversations to save space
   * @param {string} playerId - Player ID
   * @param {object} db - Database instance (for transaction)
   * @returns {Promise<void>}
   */
  async _summarizeConversations(playerId, db) {
    // Get all non-summary conversations for this player
    const conversations = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, bot_message, player_message, timestamp, context
         FROM conversations
         WHERE player_id = ? AND is_summary = 0
         ORDER BY timestamp ASC`,
        [playerId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    if (conversations.length < SUMMARIZATION_THRESHOLD) return;

    // Create a summary message
    const summaryText = this._createSummary(conversations);
    const summaryTimestamp = Date.now();

    // Insert summary
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO conversations (player_id, bot_message, player_message, timestamp, context, is_summary)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [playerId, `[SUMMARY] ${summaryText}`, null, summaryTimestamp, JSON.stringify({ type: 'summary', count: conversations.length })],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Delete old conversations (keep summary)
    const ids = conversations.map(c => c.id);
    const placeholders = ids.map(() => '?').join(',');
    await new Promise((resolve, reject) => {
      db.run(
        `DELETE FROM conversations WHERE id IN (${placeholders})`,
        ids,
        function(err) {
          if (err) reject(err);
          else {
            logger.debug('Conversations summarized', { playerId, deletedCount: this.changes });
            resolve();
          }
        }
      );
    });
  }

  /**
   * Create a text summary from conversation list
   * @param {Array} conversations - List of conversation objects
   * @returns {string} - Summary text
   */
  _createSummary(conversations) {
    const topics = new Set();
    const playerMessages = conversations
      .filter(c => c.player_message)
      .map(c => c.player_message);

    // Extract key topics from player messages (simple approach)
    playerMessages.forEach(msg => {
      const words = msg.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.length > 4 && !['about', 'would', 'could', 'should', 'there', 'their', 'what', 'where', 'when'].includes(word)) {
          topics.add(word);
        }
      });
    });

    const topicList = Array.from(topics).slice(0, 5).join(', ');
    const timeSpan = conversations.length > 0
      ? `${new Date(conversations[0].timestamp).toLocaleDateString()} to ${new Date(conversations[conversations.length - 1].timestamp).toLocaleDateString()}`
      : 'unknown period';

    return `${conversations.length} messages exchanged (${timeSpan}). Topics: ${topicList || 'general chat'}`;
  }

  /**
   * Get recent conversations for a player
   * @param {string} playerId - Player's Minecraft username
   * @param {number} limit - Maximum number of conversations to return
   * @returns {Promise<Array>} - Array of conversation objects
   */
  async getRecentConversations(playerId, limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT id, player_id, bot_message, player_message, timestamp, context, is_summary
         FROM conversations
         WHERE player_id = ?
         ORDER BY timestamp DESC
         LIMIT ?`,
        [playerId, limit],
        (err, rows) => {
          if (err) {
            logger.error('Failed to get conversations', { error: err.message, playerId });
            reject(err);
          } else {
        const conversations = rows.map(row => ({
          id: row.id,
          playerId: row.player_id,
          botMessage: row.bot_message,
          playerMessage: row.player_message,
          timestamp: row.timestamp,
          context: row.context ? JSON.parse(row.context) : null,
          isSummary: row.is_summary === 1
        }));
        resolve(conversations.reverse());
          }
        }
      );
    });
  }

  /**
   * Update relationship with a player
   * @param {string} playerId - Player's Minecraft username
   * @param {string} interactionType - Type of interaction (positive, negative, neutral, helpful, hostile, greeting)
   * @returns {Promise<object>} - Updated relationship state
   */
  async updateRelationship(playerId, interactionType) {
    const modifier = INTERACTION_MODIFIERS[interactionType] || INTERACTION_MODIFIERS.neutral;
    const timestamp = Date.now();

    return this._runTransaction(async (db) => {
      // Check if relationship exists
      const existing = await new Promise((resolve, reject) => {
        db.get(
          `SELECT * FROM relationships WHERE player_id = ?`,
          [playerId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (existing) {
        // Update existing relationship
        const newTrust = Math.max(0, Math.min(1, existing.trust_score + modifier.trust));
        const newFamiliarity = Math.max(0, Math.min(1, existing.familiarity + modifier.familiarity));

        await new Promise((resolve, reject) => {
          db.run(
            `UPDATE relationships
             SET trust_score = ?, familiarity = ?, interaction_count = interaction_count + 1, last_seen = ?
             WHERE player_id = ?`,
            [newTrust, newFamiliarity, timestamp, playerId],
            function(err) {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        logger.debug('Relationship updated', { playerId, interactionType, trust: newTrust, familiarity: newFamiliarity });
        return { playerId, trustScore: newTrust, familiarity: newFamiliarity, interactionCount: existing.interaction_count + 1, lastSeen: timestamp };
      } else {
        // Create new relationship
        const initialTrust = 0.5 + modifier.trust;
        const initialFamiliarity = modifier.familiarity;

        await new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO relationships (player_id, trust_score, familiarity, interaction_count, last_seen)
             VALUES (?, ?, ?, 1, ?)`,
            [playerId, initialTrust, initialFamiliarity, timestamp],
            function(err) {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        logger.debug('Relationship created', { playerId, interactionType });
        return { playerId, trustScore: initialTrust, familiarity: initialFamiliarity, interactionCount: 1, lastSeen: timestamp };
      }
    });
  }

  /**
   * Get relationship state for a player
   * @param {string} playerId - Player's Minecraft username
   * @returns {Promise<object|null>} - Relationship object or null if not found
   */
  async getRelationship(playerId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT player_id, trust_score, familiarity, interaction_count, last_seen
         FROM relationships
         WHERE player_id = ?`,
        [playerId],
        (err, row) => {
          if (err) {
            logger.error('Failed to get relationship', { error: err.message, playerId });
            reject(err);
          } else if (!row) {
            resolve(null);
          } else {
            resolve(row ? {
              playerId: row.player_id,
              trustScore: row.trust_score,
              familiarity: row.familiarity,
              interactionCount: row.interaction_count,
              lastSeen: row.last_seen
            } : null);
          }
        }
      );
    });
  }

  /**
   * Clean up conversations older than retention period
   * @returns {Promise<number>} - Number of deleted conversations
   */
  async cleanupOldConversations() {
    const cutoff = Date.now() - RETENTION_MS;

    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM conversations WHERE timestamp < ?`,
        [cutoff],
        function(err) {
          if (err) {
            logger.error('Failed to cleanup old conversations', { error: err.message });
            reject(err);
          } else {
            if (this.changes > 0) {
              logger.info('Cleaned up old conversations', {
                deleted: this.changes,
                olderThan: new Date(cutoff).toISOString()
              });
            }
            resolve(this.changes);
          }
        }
      );
    });
  }

  /**
   * Get total conversation count for a player
   * @param {string} playerId - Player's Minecraft username
   * @returns {Promise<number>} - Conversation count
   */
  async getConversationCount(playerId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT COUNT(*) as count FROM conversations WHERE player_id = ?`,
        [playerId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });
  }

  /**
   * Close the database connection
   */
  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          logger.error('Failed to close database', { error: err.message });
          reject(err);
        } else {
          logger.debug('ConversationStore database closed');
          resolve();
        }
      });
    });
  }
}

module.exports = ConversationStore;
