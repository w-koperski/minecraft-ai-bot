/**
 * Memory Store - Persistent memory with SQLite
 * 
 * Tables:
 * - events: Timestamped events (timestamp, type, data)
 * - goals: Goal tracking (id, goal, status, created_at, completed_at)
 * - learnings: Lessons learned (id, context, lesson, created_at)
 * 
 * Auto-cleanup: Events older than 7 days are deleted
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../utils/logger');

const EVENTS_RETENTION_DAYS = 7;
const EVENTS_RETENTION_MS = EVENTS_RETENTION_DAYS * 24 * 60 * 60 * 1000;

class MemoryStore {
  constructor(dbPath = path.join(process.cwd(), 'state', 'memory.db')) {
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        logger.error('Failed to connect to SQLite database', { error: err.message });
      } else {
        logger.debug('MemoryStore connected', { dbPath });
      }
    });
    this._initTables();
  }

  _initTables() {
    this.db.serialize(() => {
      // Events table - timestamped events
      this.db.run(`CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL,
        data TEXT
      )`);

      // Index for efficient cleanup queries
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)`);

      // Goals table - goal tracking
      this.db.run(`CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      )`);

      // Index for status queries
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status)`);

      // Learnings table - lessons learned
      this.db.run(`CREATE TABLE IF NOT EXISTS learnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        context TEXT NOT NULL,
        lesson TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`);
    });
  }

  /**
   * Add an event to the events table
   * @param {string} type - Event type (e.g., 'death', 'combat', 'discovery')
   * @param {object} data - Event data
   * @returns {Promise<number>} - The inserted row ID
   */
  async addEvent(type, data = {}) {
    const timestamp = Date.now();
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO events (timestamp, type, data) VALUES (?, ?, ?)`,
        [timestamp, type, JSON.stringify(data)],
        function(err) {
          if (err) {
            logger.error('Failed to add event', { error: err.message, type });
            reject(err);
          } else {
            logger.debug('Event added', { id: this.lastID, type });
            resolve(this.lastID);
          }
        }
      );
    });
  }

  /**
   * Add a new goal
   * @param {string} goal - Goal description
   * @returns {Promise<number>} - The goal ID
   */
  async addGoal(goal) {
    const createdAt = Date.now();
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO goals (goal, status, created_at) VALUES (?, 'pending', ?)`,
        [goal, createdAt],
        function(err) {
          if (err) {
            logger.error('Failed to add goal', { error: err.message, goal });
            reject(err);
          } else {
            logger.info('Goal added', { id: this.lastID, goal });
            resolve(this.lastID);
          }
        }
      );
    });
  }

  /**
   * Mark a goal as completed
   * @param {number} id - Goal ID
   * @returns {Promise<boolean>} - Success status
   */
  async completeGoal(id) {
    const completedAt = Date.now();
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE goals SET status = 'completed', completed_at = ? WHERE id = ?`,
        [completedAt, id],
        function(err) {
          if (err) {
            logger.error('Failed to complete goal', { error: err.message, id });
            reject(err);
          } else if (this.changes === 0) {
            logger.warn('Goal not found for completion', { id });
            resolve(false);
          } else {
            logger.info('Goal completed', { id });
            resolve(true);
          }
        }
      );
    });
  }

  /**
   * Add a learning
   * @param {string} context - Context where the learning occurred
   * @param {string} lesson - The lesson learned
   * @returns {Promise<number>} - The learning ID
   */
  async addLearning(context, lesson) {
    const createdAt = Date.now();
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO learnings (context, lesson, created_at) VALUES (?, ?, ?)`,
        [context, lesson, createdAt],
        function(err) {
          if (err) {
            logger.error('Failed to add learning', { error: err.message, context });
            reject(err);
          } else {
            logger.info('Learning added', { id: this.lastID, context });
            resolve(this.lastID);
          }
        }
      );
    });
  }

  /**
   * Query events with optional filters
   * @param {object} options - Query options
   * @param {string} options.type - Filter by event type
   * @param {number} options.since - Filter events since timestamp
   * @param {number} options.limit - Max number of results
   * @returns {Promise<Array>} - Array of events
   */
  async queryEvents(options = {}) {
    const { type, since, limit = 100 } = options;
    
    let query = `SELECT * FROM events WHERE 1=1`;
    const params = [];

    if (type) {
      query += ` AND type = ?`;
      params.push(type);
    }

    if (since) {
      query += ` AND timestamp >= ?`;
      params.push(since);
    }

    query += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) {
          logger.error('Failed to query events', { error: err.message });
          reject(err);
        } else {
          const events = rows.map(row => ({
            ...row,
            data: row.data ? JSON.parse(row.data) : null
          }));
          resolve(events);
        }
      });
    });
  }

  /**
   * Query goals with optional filters
   * @param {object} options - Query options
   * @param {string} options.status - Filter by status ('pending', 'completed')
   * @param {number} options.limit - Max number of results
   * @returns {Promise<Array>} - Array of goals
   */
  async queryGoals(options = {}) {
    const { status, limit = 100 } = options;
    
    let query = `SELECT * FROM goals WHERE 1=1`;
    const params = [];

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) {
          logger.error('Failed to query goals', { error: err.message });
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Query learnings with optional filters
   * @param {object} options - Query options
   * @param {string} options.context - Filter by context (partial match)
   * @param {number} options.limit - Max number of results
   * @returns {Promise<Array>} - Array of learnings
   */
  async queryLearnings(options = {}) {
    const { context, limit = 100 } = options;
    
    let query = `SELECT * FROM learnings WHERE 1=1`;
    const params = [];

    if (context) {
      query += ` AND context LIKE ?`;
      params.push(`%${context}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) {
          logger.error('Failed to query learnings', { error: err.message });
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Delete events older than retention period
   * @returns {Promise<number>} - Number of deleted events
   */
  async cleanupOldEvents() {
    const cutoff = Date.now() - EVENTS_RETENTION_MS;
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM events WHERE timestamp < ?`,
        [cutoff],
        function(err) {
          if (err) {
            logger.error('Failed to cleanup old events', { error: err.message });
            reject(err);
          } else {
            if (this.changes > 0) {
              logger.info('Cleaned up old events', { 
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
   * Close the database connection
   */
  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          logger.error('Failed to close database', { error: err.message });
          reject(err);
        } else {
          logger.debug('MemoryStore database closed');
          resolve();
        }
      });
    });
  }
}

module.exports = MemoryStore;
