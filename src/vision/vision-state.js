/**
 * VisionState - Non-blocking in-memory state for vision analysis
 *
 * Thread-safe read/write for single-threaded Node.js.
 * No file I/O, no locks needed - pure in-memory storage.
 * Used by VisionProcessor to store latest analysis for Pilot to read.
 *
 * @module vision/vision-state
 */

class VisionState {
  constructor() {
    // In-memory storage - no file I/O, no locks needed (Node.js is single-threaded)
    this._analysis = null;
  }

  /**
   * Get the latest vision analysis
   * @returns {Object|null} Latest analysis or null if no analysis yet
   */
  getLatestAnalysis() {
    return this._analysis;
  }

  /**
   * Store a vision analysis
   * @param {Object} data - Analysis data to store
   * @param {number} data.timestamp - Unix timestamp when analysis was captured
   * @param {string} data.mode - Bot mode when captured: 'danger'|'active'|'idle'
   * @param {Object} data.position - Bot position {x, y, z}
   * @param {string[]} data.observations - Array of observations from vision
   * @param {string[]} data.threats - Array of detected threats
   * @param {Object[]} data.entities - Array of detected entities
   * @param {Object[]} data.blocks - Array of notable blocks
   * @param {number} data.confidence - Confidence score 0-1
   * @param {string} data.state - Bot state string when captured
   */
  setAnalysis(data) {
    this._analysis = data;
  }

  /**
   * Clear stored analysis
   */
  clear() {
    this._analysis = null;
  }
}

module.exports = VisionState;