/**
 * Danger Predictor - Tracks historical threat locations for path planning
 *
 * Features:
 * - Marks danger zones where bot died or took damage
 * - Provides danger level queries for path planning
 * - 7-day half-life decay for danger zones
 * - Integrates with knowledge graph for spatial memory storage
 *
 * @module danger-predictor
 */

'use strict';

const logger = require('../utils/logger');

// Configuration from environment
const ENABLE_DANGER_PREDICTION = process.env.ENABLE_DANGER_PREDICTION !== 'false'; // Default: true
const DANGER_ZONE_RADIUS = parseInt(process.env.DANGER_ZONE_RADIUS_BLOCKS || '20', 10);
const DANGER_DECAY_HALF_LIFE_DAYS = parseInt(process.env.DANGER_DECAY_HALF_LIFE_DAYS || '7', 10);
const DANGER_THRESHOLD = 0.3; // Below this threshold, position is considered safe

/**
 * DangerPredictor class
 * Tracks danger zones and provides queries for path planning
 */
class DangerPredictor {
  /**
   * @param {Object} knowledgeGraph - Knowledge graph instance for spatial memory
   */
  constructor(knowledgeGraph) {
    this.knowledgeGraph = knowledgeGraph;
    this.dangerZones = []; // { position: {x, y, z}, reason: string, timestamp: number, radius: number }
    this.enabled = ENABLE_DANGER_PREDICTION;

    logger.info('[DangerPredictor] Initialized', {
      enabled: this.enabled,
      radius: DANGER_ZONE_RADIUS,
      halfLifeDays: DANGER_DECAY_HALF_LIFE_DAYS,
      threshold: DANGER_THRESHOLD
    });
  }

  /**
   * Mark a position as dangerous
   * @param {Object} position - Position object { x, y, z }
   * @param {string} reason - Reason for danger (e.g., 'creeper_death', 'lava_damage')
   * @param {number} timestamp - When the danger occurred (default: Date.now())
   * @returns {boolean} - Success status
   */
  markDangerous(position, reason, timestamp = Date.now()) {
    if (!this.enabled) {
      logger.debug('[DangerPredictor] Disabled, skipping markDangerous');
      return false;
    }

    if (!position || position.x === undefined || position.y === undefined || position.z === undefined) {
      logger.warn('[DangerPredictor] markDangerous requires valid position', { position, reason });
      return false;
    }

    if (!reason) {
      logger.warn('[DangerPredictor] markDangerous requires reason');
      return false;
    }

    // Create danger zone entry
    const zone = {
      position: {
        x: position.x,
        y: position.y,
        z: position.z
      },
      reason,
      timestamp,
      radius: DANGER_ZONE_RADIUS
    };

    // Add to in-memory tracking
    this.dangerZones.push(zone);

    // Store in knowledge graph as spatial memory
    if (this.knowledgeGraph) {
      const memoryName = `danger_${reason}_${timestamp}`;
      this.knowledgeGraph.addSpatialMemory(
        memoryName,
        zone.position,
        'danger_zone',
        timestamp
      );
      logger.debug('[DangerPredictor] Stored in knowledge graph', { memoryName });
    }

    logger.info('[DangerPredictor] Marked danger zone', {
      position: `(${position.x}, ${position.y}, ${position.z})`,
      reason,
      radius: DANGER_ZONE_RADIUS
    });

    return true;
  }

  /**
   * Check if a position is dangerous
   * @param {Object} position - Position to check { x, y, z }
   * @returns {boolean} - True if position is within danger zone with level > threshold
   */
  isDangerous(position) {
    if (!this.enabled) {
      return false;
    }

    if (!position || position.x === undefined || position.y === undefined || position.z === undefined) {
      return false;
    }

    const currentTime = Date.now();

    for (const zone of this.dangerZones) {
      const distance = this._calculateDistance(position, zone.position);

      // Check if within danger radius
      if (distance <= zone.radius) {
        const dangerLevel = this._calculateDangerLevel(zone, currentTime);

        // If danger level exceeds threshold, position is dangerous
        if (dangerLevel > DANGER_THRESHOLD) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get the danger level at a position (highest from all nearby zones)
   * @param {Object} position - Position to check { x, y, z }
   * @returns {number} - Danger level (0.0 to 1.0, 0.0 if no danger nearby)
   */
  getDangerLevel(position) {
    if (!this.enabled) {
      return 0.0;
    }

    if (!position || position.x === undefined || position.y === undefined || position.z === undefined) {
      return 0.0;
    }

    const currentTime = Date.now();
    let highestLevel = 0.0;

    for (const zone of this.dangerZones) {
      const distance = this._calculateDistance(position, zone.position);

      // Only consider zones within radius
      if (distance <= zone.radius) {
        const dangerLevel = this._calculateDangerLevel(zone, currentTime);
        highestLevel = Math.max(highestLevel, dangerLevel);
      }
    }

    return highestLevel;
  }

  /**
   * Get all danger zones (copy of array)
   * @returns {Array} - Array of danger zone objects
   */
  getDangerZones() {
    // Return a copy to prevent external modification
    return this.dangerZones.map(zone => ({
      position: { ...zone.position },
      reason: zone.reason,
      timestamp: zone.timestamp,
      radius: zone.radius
    }));
  }

  /**
   * Clear all danger zones (useful for testing or reset)
   */
  clear() {
    this.dangerZones = [];
    logger.debug('[DangerPredictor] Cleared all danger zones');
  }

  /**
   * Get statistics about danger zones
   * @returns {Object} - Statistics { count, reasons: {} }
   */
  getStats() {
    const stats = {
      count: this.dangerZones.length,
      reasons: {},
      enabled: this.enabled
    };

    for (const zone of this.dangerZones) {
      stats.reasons[zone.reason] = (stats.reasons[zone.reason] || 0) + 1;
    }

    return stats;
  }

  /**
   * Calculate 3D Euclidean distance between two positions
   * @private
   * @param {Object} pos1 - First position { x, y, z }
   * @param {Object} pos2 - Second position { x, y, z }
   * @returns {number} - Distance in blocks
   */
  _calculateDistance(pos1, pos2) {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Calculate danger level with exponential decay
   * Formula: 1.0 * Math.pow(0.5, daysSince / halfLifeDays)
   * 
   * @private
   * @param {Object} zone - Danger zone object
   * @param {number} currentTime - Current timestamp (ms)
   * @returns {number} - Danger level (0.0 to 1.0)
   */
  _calculateDangerLevel(zone, currentTime) {
    const msSince = currentTime - zone.timestamp;
    const daysSince = msSince / (1000 * 60 * 60 * 24);

    // Exponential decay: level halves every half-life days
    const dangerLevel = 1.0 * Math.pow(0.5, daysSince / DANGER_DECAY_HALF_LIFE_DAYS);

    // Clamp to valid range
    return Math.max(0.0, Math.min(1.0, dangerLevel));
  }
}

module.exports = DangerPredictor;
