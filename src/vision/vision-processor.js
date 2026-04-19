/**
 * VisionProcessor - Async screenshot analysis loop
 *
 * Runs an independent background loop that captures and analyzes screenshots
 * from the Minecraft world. Uses adaptive interval timing (like Pilot):
 * - Danger: 2s (hostile mobs, lava, low health detected)
 * - Active: 4s (executing actions, moving)
 * - Idle: 10s (no threats, no actions)
 *
 * Uses vision-rate-limiter to respect 20 RPM API budget.
 * Feature-flag gated: only runs when ENABLE_VISION=true.
 * Non-blocking: runs independently, does not affect Pilot loop timing.
 *
 * @module vision/vision-processor
 */

const logger = require('../utils/logger');
const featureFlags = require('../utils/feature-flags');
const visionRateLimiter = require('./vision-rate-limiter');

// Adaptive loop intervals (milliseconds)
const INTERVALS = {
  danger: 2000,   // Immediate threats - analyze more frequently
  active: 4000,   // Executing actions
  idle: 10000     // No threats, no actions
};

// Default interval if env var not set
const DEFAULT_INTERVAL_MS = 10000;

// Threat detection thresholds (aligned with Pilot)
const THREAT_THRESHOLDS = {
  hostileMobDistance: 16,  // blocks
  lavaDistance: 8,         // blocks
  lowHealth: 6            // hearts (out of 20)
};

class VisionProcessor {
  /**
   * @param {Object} bot - Mineflayer bot instance
   * @param {Object} [options] - Configuration options
   * @param {Object} [options.visionRateLimiter] - Custom rate limiter (for testing)
   * @param {Object} [options.featureFlags] - Custom feature flags (for testing)
   * @param {Object} [options.intervals] - Custom interval overrides
   * @param {number} [options.defaultInterval] - Default interval (ms)
   */
  constructor(bot, options = {}) {
    this.bot = bot;
    this.rateLimiter = options.visionRateLimiter || visionRateLimiter;
    this.featureFlagsInstance = options.featureFlags || featureFlags;

    // Adaptive intervals - can be customized via options or env vars
    this.intervals = {
      danger: parseInt(process.env.VISION_INTERVAL_DANGER_MS, 10) || options.intervals?.danger || INTERVALS.danger,
      active: parseInt(process.env.VISION_INTERVAL_ACTIVE_MS, 10) || options.intervals?.active || INTERVALS.active,
      idle: parseInt(process.env.VISION_INTERVAL_IDLE_MS, 10) || options.intervals?.idle || INTERVALS.idle
    };

    // Validate intervals
    for (const [mode, ms] of Object.entries(this.intervals)) {
      if (ms < 1000) {
        logger.warn('VisionProcessor: Interval too low, clamping to 1000ms', { mode, ms });
        this.intervals[mode] = 1000;
      }
      if (ms > 30000) {
        logger.warn('VisionProcessor: Interval too high, clamping to 30000ms', { mode, ms });
        this.intervals[mode] = 30000;
      }
    }

    // Global override: VISION_INTERVAL_MS sets all intervals to same value
    const globalInterval = parseInt(process.env.VISION_INTERVAL_MS, 10);
    if (globalInterval) {
      this.intervals.danger = globalInterval;
      this.intervals.active = globalInterval;
      this.intervals.idle = globalInterval;
    }

    // Loop state
    this.running = false;
    this.loopTimer = null;
    this.currentInterval = this.intervals.idle;
    this.currentMode = 'idle';

    // Analysis state (VisionState placeholder from Task 24)
    this.latestAnalysis = null;
    this.analysisCount = 0;
    this.lastAnalysisTime = null;
    this.errorCount = 0;
    this.lastError = null;
  }

  /**
   * Start the vision processing loop
   * Only starts if ENABLE_VISION feature flag is true
   */
  async start() {
    if (!this.featureFlagsInstance.isEnabled('VISION')) {
      logger.info('VisionProcessor: Disabled (ENABLE_VISION not set)');
      return;
    }

    if (this.running) {
      logger.warn('VisionProcessor: Already running');
      return;
    }

    this.running = true;
    logger.info('VisionProcessor: Starting async analysis loop', {
      intervals: this.intervals
    });

    this.scheduleNextLoop();
  }

  /**
   * Stop the vision processing loop gracefully
   * Clears all timers and stops processing
   */
  async stop() {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }

    logger.info('VisionProcessor: Stopped', {
      analysisCount: this.analysisCount,
      errorCount: this.errorCount
    });
  }

  /**
   * Schedule next loop iteration using setTimeout
   * This prevents overlapping executions (unlike setInterval)
   */
  scheduleNextLoop() {
    if (!this.running) return;

    this.loopTimer = setTimeout(async () => {
      try {
        await this.loop();
      } catch (error) {
        logger.error('VisionProcessor: Unhandled loop error', {
          error: error.message,
          stack: error.stack
        });
        this.errorCount++;
        this.lastError = error.message;
      }
      this.scheduleNextLoop();
    }, this.currentInterval);
  }

  /**
   * Main loop iteration
   * Determines mode, captures screenshot, and analyzes via vision API
   */
  async loop() {
    // Feature flag might have changed at runtime
    if (!this.featureFlagsInstance.isEnabled('VISION')) {
      logger.info('VisionProcessor: Feature flag disabled at runtime, stopping');
      await this.stop();
      return;
    }

    // Determine current mode from bot state
    const state = this.getBotState();
    this.adjustInterval(state);

    // Capture and analyze screenshot via rate-limited API call
    try {
      const analysis = await this.captureAndAnalyze(state);

      if (analysis) {
        this.latestAnalysis = analysis;
        this.analysisCount++;
        this.lastAnalysisTime = Date.now();

        logger.debug('VisionProcessor: Analysis complete', {
          mode: this.currentMode,
          interval: this.currentInterval,
          analysisCount: this.analysisCount,
          observations: analysis.observations?.length || 0,
          threats: analysis.threats?.length || 0
        });
      }
    } catch (error) {
      this.errorCount++;
      this.lastError = error.message;

      if (error.message?.includes('429') || error.message?.includes('rate limit')) {
        logger.warn('VisionProcessor: Rate limited, will retry next cycle', {
          error: error.message
        });
      } else {
        logger.error('VisionProcessor: Analysis failed', {
          error: error.message,
          errorCount: this.errorCount
        });
      }
    }
  }

  /**
   * Get bot state for mode determination
   * @returns {Object} Current bot state with mode
   */
  getBotState() {
    if (!this.bot || !this.bot.entity) {
      return { mode: 'idle' };
    }

    const health = this.bot.health ?? 20;

    // Detect danger conditions (aligned with Pilot thresholds)
    if (health < THREAT_THRESHOLDS.lowHealth) {
      return { mode: 'danger', reason: 'low_health', health };
    }

    const hostileMobs = this.getHostileMobs();
    if (hostileMobs.length > 0) {
      return { mode: 'danger', reason: 'hostile_mob', count: hostileMobs.length };
    }

    if (this.isNearLava()) {
      return { mode: 'danger', reason: 'near_lava' };
    }

    // Check if actively executing (pathfinding)
    if (this.bot.pathfinder && typeof this.bot.pathfinder.isMoving === 'function') {
      if (this.bot.pathfinder.isMoving()) {
        return { mode: 'active', reason: 'pathfinding' };
      }
    }

    return { mode: 'idle' };
  }

  /**
   * Adjust loop interval based on bot state mode
   * @param {Object} state - Bot state from getBotState()
   */
  adjustInterval(state) {
    // Validate mode - fall back to idle for unknown modes
    const validModes = ['danger', 'active', 'idle'];
    const mode = validModes.includes(state.mode) ? state.mode : 'idle';
    const newInterval = this.intervals[mode];

    if (mode !== this.currentMode) {
      logger.debug('VisionProcessor: Mode change', {
        from: this.currentMode,
        to: mode,
        interval: newInterval
      });

      this.currentMode = mode;
      this.currentInterval = newInterval;
    }
  }

  /**
   * Capture screenshot and send for analysis through rate limiter
   * @param {Object} state - Current bot state
   * @returns {Promise<Object|null>} Analysis result or null on failure
   */
  async captureAndAnalyze(state) {
    try {
      const analysis = await this.rateLimiter.schedule(async () => {
        const screenshot = this.captureScreenshot();
        return this.analyzeScreenshot(screenshot, state);
      });
      return analysis;
    } catch (error) {
      // Re-throw rate limit errors for proper handling in loop()
      throw error;
    }
  }

  /**
   * Capture a screenshot from the bot's perspective
   * Returns a screenshot data object (placeholder for actual capture)
   * @returns {Object} Screenshot data
   */
  captureScreenshot() {
    const timestamp = Date.now();
    const position = this.bot?.entity?.position;

    return {
      timestamp,
      width: 0,
      height: 0,
      data: null,  // Would contain base64 image data with actual renderer
      position: position ? {
        x: Math.floor(position.x),
        y: Math.floor(position.y),
        z: Math.floor(position.z)
      } : null
    };
  }

  /**
   * Analyze a screenshot using vision model
   * Placeholder analysis - will be connected to Omniroute vision endpoint
   * @param {Object} screenshot - Screenshot data from captureScreenshot()
   * @param {Object} state - Current bot state
   * @returns {Object} Analysis result (VisionState-compatible format)
   */
  analyzeScreenshot(screenshot, state) {
    return {
      timestamp: screenshot.timestamp,
      mode: this.currentMode,
      position: screenshot.position,
      observations: [],
      threats: [],
      entities: [],
      blocks: [],
      confidence: 0,
      state: state.mode
    };
  }

  /**
   * Get hostile mobs near the bot
   * @returns {Array} Array of hostile mob entities within threat distance
   */
  getHostileMobs() {
    if (!this.bot?.entities || !this.bot.entity?.position) {
      return [];
    }

    const botPos = this.bot.entity.position;

    return Object.values(this.bot.entities).filter(entity => {
      if (!entity.position) return false;

      // Mineflayer entity type detection
      const isHostile = entity.kind === 'Hostile mobs' ||
        entity.mobType === 'Hostile mobs' ||
        (entity.name && [
          'zombie', 'skeleton', 'creeper', 'spider', 'enderman',
          'witch', 'slime', 'phantom', 'drowned', 'husk', 'stray',
          'cave_spider', 'silverfish', 'blaze', 'ghast', 'magma_cube',
          'wither_skeleton', 'guardian', 'elder_guardian', 'shulker',
          'evoker', 'vindicator', 'pillager', 'ravager', 'hoglin',
          'zoglin', 'warden'
        ].includes(entity.name.toLowerCase()));

      if (!isHostile) return false;

      const distance = entity.position.distanceTo(botPos);
      return distance <= THREAT_THRESHOLDS.hostileMobDistance;
    });
  }

  /**
   * Check if bot is near lava
   * @returns {boolean} True if lava is detected nearby
   */
  isNearLava() {
    if (!this.bot?.entity?.position) return false;

    try {
      const pos = this.bot.entity.position;
      const Vec3 = require('vec3');

      // Check 8-block radius around bot (simplified check)
      for (let dx = -THREAT_THRESHOLDS.lavaDistance; dx <= THREAT_THRESHOLDS.lavaDistance; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dz = -THREAT_THRESHOLDS.lavaDistance; dz <= THREAT_THRESHOLDS.lavaDistance; dz++) {
            const block = this.bot.blockAt(new Vec3(
              Math.floor(pos.x + dx),
              Math.floor(pos.y + dy),
              Math.floor(pos.z + dz)
            ));

            if (block && (block.name === 'lava' || block.name === 'flowing_lava')) {
              return true;
            }
          }
        }
      }
    } catch (_e) {
      // Ignore errors in lava detection (bot may not have block data yet)
    }

    return false;
  }

  /**
   * Get current processor status
   * @returns {Object} Status object
   */
  getStatus() {
    return {
      running: this.running,
      mode: this.currentMode,
      interval: this.currentInterval,
      analysisCount: this.analysisCount,
      errorCount: this.errorCount,
      lastAnalysisTime: this.lastAnalysisTime,
      lastError: this.lastError,
      hasAnalysis: this.latestAnalysis !== null,
      intervals: { ...this.intervals }
    };
  }
}

module.exports = VisionProcessor;