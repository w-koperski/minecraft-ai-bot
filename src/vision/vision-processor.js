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
  hostileMobDistance: 16, // blocks
  lavaDistance: 8, // blocks
  lowHealth: 6 // hearts (out of 20)
};

// Cache configuration
const CACHE_CONFIG = {
  maxAgeMs: 5 * 60 * 1000, // 5 minutes
  maxDistanceBlocks: 16 // Invalidation on position change >16 blocks
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

  // Cache for static analysis elements (terrain, biome, time, weather)
  this.cache = {
    static: null,
    position: null,
    biome: null,
    timestamp: null
  };
  this.cacheHits = 0;
  this.cacheMisses = 0;
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
   * Check if cached static analysis is still valid
   * Invalidated by: no cache, age >5min, position change >16 blocks, biome change
   * @param {Object} screenshot - Current screenshot data
   * @returns {boolean} True if cache is valid and can be reused
   */
  isCacheValid(screenshot) {
    if (!this.cache.timestamp) return false;

    const age = Date.now() - this.cache.timestamp;
    if (age > CACHE_CONFIG.maxAgeMs) return false;

    if (!screenshot.position || !this.cache.position) return false;

    const dx = screenshot.position.x - this.cache.position.x;
    const dz = screenshot.position.z - this.cache.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance > CACHE_CONFIG.maxDistanceBlocks) return false;

    if (screenshot.biome && this.cache.biome && screenshot.biome !== this.cache.biome) {
      return false;
    }

    return true;
  }

  /**
   * Extract static elements from analysis for caching
   * Static: terrain, biome, time, weather (filtered observations)
   * Dynamic: mobs, players, threats, health are never cached
   * @param {Object} analysis - Full analysis result
   * @param {Object} screenshot - Screenshot data used for the analysis
   * @returns {Object} Static-only subset of analysis
   */
  _extractStaticElements(analysis, screenshot) {
    const dynamicKeywords = ['mob', 'player', 'entity', 'threat', 'health', 'hunger'];
    return {
      terrain: analysis.terrain || null,
      biome: analysis.biome || screenshot.biome || null,
      timeOfDay: analysis.timeOfDay || null,
      weather: analysis.weather || null,
      observations: (analysis.observations || []).filter(obs =>
        typeof obs === 'string' &&
        !dynamicKeywords.some(kw => obs.toLowerCase().includes(kw))
      )
    };
  }

  /**
   * Update cache with new static analysis data
   * @param {Object} analysis - Full analysis result
   * @param {Object} screenshot - Screenshot data used for the analysis
   */
  updateCache(analysis, screenshot) {
    this.cache.static = this._extractStaticElements(analysis, screenshot);
    this.cache.position = screenshot.position ? { ...screenshot.position } : null;
    this.cache.biome = analysis.biome || screenshot.biome || null;
    this.cache.timestamp = Date.now();
  }

  /**
   * Clear the analysis cache
   */
  clearCache() {
    this.cache.static = null;
    this.cache.position = null;
    this.cache.biome = null;
    this.cache.timestamp = null;
  }

  /**
   * Build structured prompt for vision analysis
   * @param {Object} screenshot - Screenshot data
   * @param {Object} state - Current bot state
   * @returns {string} Formatted prompt for vision API
   */
  buildVisionPrompt(screenshot, state) {
    const position = screenshot.position || { x: 0, y: 0, z: 0 };
    const mode = state.mode || 'idle';

    // Select template based on analysis mode
    if (mode === 'danger') {
      return this.buildThreatAnalysisPrompt(position);
    } else if (mode === 'active') {
      return this.buildNavigationPrompt(position);
    } else {
      return this.buildExplorationPrompt(position);
    }
  }

  /**
   * Threat analysis prompt template (danger mode)
   * Focus: hostile entities, hazards, immediate dangers
   */
  buildThreatAnalysisPrompt(position) {
    return `You are analyzing a Minecraft screenshot for immediate threats and dangers.

Current Position: x=${position.x.toFixed(1)}, y=${position.y.toFixed(1)}, z=${position.z.toFixed(1)}

Analyze the screenshot and identify:

1. THREATS (hostile entities, hazards):
   - Hostile mobs (zombies, skeletons, creepers, spiders, etc.)
   - Environmental hazards (lava, fire, deep falls, water)
   - Distance and direction to each threat

2. SAFE ZONES:
   - Areas without threats
   - Escape routes
   - Shelter or cover

3. IMMEDIATE ACTIONS:
   - Recommended evasive maneuvers
   - Combat readiness assessment

Return JSON format:
{
  "observations": ["string descriptions of what you see"],
  "threats": ["hostile mob at 10 blocks north", "lava pool 5 blocks east"],
  "entities": [{"type": "zombie", "distance": 10, "direction": "north"}],
  "blocks": [{"type": "lava", "distance": 5, "direction": "east"}],
  "confidence": 0.0-1.0
}

Example:
{
  "observations": ["Dark cave environment", "Stone walls", "Torch lighting"],
  "threats": ["Zombie 8 blocks ahead", "Skeleton archer on ledge"],
  "entities": [{"type": "zombie", "distance": 8}, {"type": "skeleton", "distance": 12}],
  "blocks": [{"type": "stone", "distance": 2}],
  "confidence": 0.85
}`;
  }

  /**
   * Navigation prompt template (active mode)
   * Focus: pathfinding, obstacles, terrain features
   */
  buildNavigationPrompt(position) {
    return `You are analyzing a Minecraft screenshot for navigation and pathfinding.

Current Position: x=${position.x.toFixed(1)}, y=${position.y.toFixed(1)}, z=${position.z.toFixed(1)}

Analyze the screenshot and identify:

1. TERRAIN LAYOUT:
   - Ground type (grass, stone, sand, etc.)
   - Elevation changes (hills, cliffs, valleys)
   - Biome type if identifiable

2. OBSTACLES:
   - Blocks blocking path (walls, trees, water)
   - Gaps or holes
   - Height differences requiring jumping

3. NAVIGATION HINTS:
   - Clear paths forward
   - Landmarks for orientation
   - Suggested movement direction

Return JSON format:
{
  "observations": ["string descriptions of terrain"],
  "threats": ["obstacle descriptions if dangerous"],
  "entities": [{"type": "entity_name", "distance": number}],
  "blocks": [{"type": "block_name", "distance": number, "direction": "string"}],
  "confidence": 0.0-1.0
}

Example:
{
  "observations": ["Open plains biome", "Flat terrain ahead", "Oak trees scattered"],
  "threats": [],
  "entities": [{"type": "cow", "distance": 15}],
  "blocks": [{"type": "grass", "distance": 0}, {"type": "oak_log", "distance": 20, "direction": "northeast"}],
  "confidence": 0.90
}`;
  }

  /**
   * Exploration prompt template (idle mode)
   * Focus: resources, structures, points of interest
   */
  buildExplorationPrompt(position) {
    return `You are analyzing a Minecraft screenshot for exploration and resource gathering.

Current Position: x=${position.x.toFixed(1)}, y=${position.y.toFixed(1)}, z=${position.z.toFixed(1)}

Analyze the screenshot and identify:

1. RESOURCES:
   - Visible ores (coal, iron, gold, diamonds)
   - Trees and wood sources
   - Animals for food
   - Water sources

2. STRUCTURES:
   - Villages, temples, dungeons
   - Player-built structures
   - Natural formations (caves, ravines)

3. POINTS OF INTEREST:
   - Unexplored areas
   - Valuable resource locations
   - Strategic positions

Return JSON format:
{
  "observations": ["string descriptions of environment"],
  "threats": ["potential dangers if any"],
  "entities": [{"type": "entity_name", "distance": number}],
  "blocks": [{"type": "block_name", "distance": number, "direction": "string"}],
  "confidence": 0.0-1.0
}

Example:
{
  "observations": ["Forest biome", "Dense oak trees", "Small hill to the west"],
  "threats": [],
  "entities": [{"type": "pig", "distance": 10}, {"type": "chicken", "distance": 8}],
  "blocks": [{"type": "oak_log", "distance": 5, "direction": "north"}, {"type": "stone", "distance": 3}],
  "confidence": 0.88
}`;
  }

  /**
   * Analyze a screenshot using vision model
   * Placeholder analysis - will be connected to Omniroute vision endpoint
   * @param {Object} screenshot - Screenshot data from captureScreenshot()
   * @param {Object} state - Current bot state
   * @returns {Object} Analysis result (VisionState-compatible format)
   */
  analyzeScreenshot(screenshot, state) {
    const prompt = this.buildVisionPrompt(screenshot, state);

    // Check cache validity for static elements
    const cacheValid = this.isCacheValid(screenshot);

    if (cacheValid && this.cache.static) {
      // Cache hit: merge cached static data with fresh dynamic analysis
      this.cacheHits++;
      logger.debug('VisionProcessor: Cache hit, merging static data with dynamic analysis', {
        cacheAge: Date.now() - this.cache.timestamp,
        cacheHits: this.cacheHits,
        cacheMisses: this.cacheMisses
      });

      return {
        timestamp: screenshot.timestamp,
        mode: this.currentMode,
        position: screenshot.position,
        observations: [...(this.cache.static.observations || []), ...(this._getDynamicObservations(state))],
        threats: this._getDynamicThreats(state),
        entities: this._getDynamicEntities(state),
        blocks: [],
        confidence: 0,
        state: state.mode,
        prompt: prompt,
        fromCache: true
      };
    }

    // Cache miss: full analysis required
    this.cacheMisses++;
    logger.debug('VisionProcessor: Cache miss, performing full analysis', {
      reason: !this.cache.timestamp ? 'no_cache' :
        (Date.now() - this.cache.timestamp > CACHE_CONFIG.maxAgeMs) ? 'expired' :
          'position_change',
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses
    });

    // TODO: Send prompt to vision API (Task 23 custom endpoint)
    // In production: const response = await visionClient.analyze(screenshot.data, prompt);

    const analysis = {
      timestamp: screenshot.timestamp,
      mode: this.currentMode,
      position: screenshot.position,
      observations: [],
      threats: [],
      entities: [],
      blocks: [],
      confidence: 0,
      state: state.mode,
      prompt: prompt,
      fromCache: false
    };

    // Update cache with static elements from this analysis
    this.updateCache(analysis, screenshot);

    return analysis;
  }

  /**
   * Get dynamic observations from current bot state (never cached)
   * @param {Object} state - Current bot state
   * @returns {string[]} Dynamic observation strings
   */
  _getDynamicObservations(state) {
    const observations = [];
    if (state.mode === 'danger') {
      observations.push('Danger detected in vicinity');
    }
    if (this.bot?.health !== undefined && this.bot.health < 6) {
      observations.push(`Low health: ${this.bot.health}/20`);
    }
    return observations;
  }

  /**
   * Get dynamic threats from current bot state (never cached)
   * @param {Object} state - Current bot state
   * @returns {string[]} Dynamic threat strings
   */
  _getDynamicThreats(state) {
    if (state.mode !== 'danger') return [];

    const threats = [];
    const hostileMobs = this.getHostileMobs();
    if (hostileMobs.length > 0) {
      threats.push(`${hostileMobs.length} hostile mob(s) nearby`);
    }
    if (this.isNearLava()) {
      threats.push('Lava detected nearby');
    }
    if (this.bot?.health !== undefined && this.bot.health < 6) {
      threats.push(`Critical health: ${this.bot.health}/20`);
    }
    return threats;
  }

  /**
   * Get dynamic entities from current bot state (never cached)
   * @param {Object} state - Current bot state
   * @returns {Object[]} Dynamic entity objects
   */
  _getDynamicEntities(state) {
    if (state.mode !== 'danger') return [];

    const entities = [];
    const hostileMobs = this.getHostileMobs();
    for (const mob of hostileMobs) {
      entities.push({
        type: mob.name || 'unknown',
        distance: Math.floor(mob.position.distanceTo(this.bot.entity.position)),
        direction: 'nearby'
      });
    }
    return entities;
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
      intervals: { ...this.intervals },
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheAge: this.cache.timestamp ? Date.now() - this.cache.timestamp : null
    };
  }
}

module.exports = VisionProcessor;