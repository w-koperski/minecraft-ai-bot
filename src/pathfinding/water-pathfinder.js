/**
 * Water Pathfinder - Extends mineflayer-pathfinder for swimming and water traversal
 *
 * Uses mineflayer-pathfinder's PUBLIC API (Movements class) to configure
 * water navigation. Does NOT fork or copy internal pathfinder code.
 *
 * Features:
 * - Swimming mechanics (horizontal + vertical movement in water)
 * - Water surface vs underwater navigation distinction
 * - Safety timeout integration point (30s max without boat, for Task 32)
 * - Feature flag gated: ENABLE_ADVANCED_PATHFINDING
 *
 * @module water-pathfinder
 */

'use strict';

const logger = require('../utils/logger');
const featureFlags = require('../utils/feature-flags');
const { VisionPathfindingBridge } = require('./vision-pathfinding-bridge');

// Cost multipliers: higher = less preferred vs land
const WATER_COSTS = {
  surfaceSwim: 2.0,
  underwaterHorizontal: 3.0,
  verticalSwim: 3.0,
  divePenalty: 1.5
};

const SAFETY_DEFAULTS = {
  maxWaterTime: 30000,     // 30s max in water without boat (Task 32 enforces)
  breathWarning: 150,      // ~7.5s of breath remaining
  deepWaterThreshold: 5
};

/**
 * WaterPathfinder - Configures mineflayer-pathfinder for water navigation
 *
 * Extends the standard Movements configuration to support swimming,
 * diving, and surface navigation through water bodies.
 */
class WaterPathfinder {
  /**
   * @param {object} bot - Mineflayer bot instance
   * @param {object} [options={}] - Configuration options
   * @param {number} [options.maxWaterTime=30000] - Max ms in water before safety trigger
   * @param {number} [options.liquidCost] - Override liquid traversal cost
   * @param {boolean} [options.allowFreeMotion=true] - Allow free motion in water
   * @param {boolean} [options.infiniteLiquidDropdown=true] - Allow infinite drop into water
   * @param {object} [options.costs] - Override water cost multipliers
   */
  constructor(bot, options = {}) {
    this.bot = bot;
    this.enabled = featureFlags.isEnabled('ADVANCED_PATHFINDING');
    this.visionBridge = options.visionBridge || new VisionPathfindingBridge({
      visionState: options.visionState || null
    });

    this.costs = { ...WATER_COSTS, ...(options.costs || {}) };

    this.maxWaterTime = options.maxWaterTime || SAFETY_DEFAULTS.maxWaterTime;
    this.breathWarning = options.breathWarning || SAFETY_DEFAULTS.breathWarning;
    this.deepWaterThreshold = options.deepWaterThreshold || SAFETY_DEFAULTS.deepWaterThreshold;

    this.liquidCost = options.liquidCost !== undefined
      ? options.liquidCost
      : this.costs.surfaceSwim;
    this.allowFreeMotion = options.allowFreeMotion !== undefined
      ? options.allowFreeMotion
      : true;
    this.infiniteLiquidDropdown = options.infiniteLiquidDropdown !== undefined
      ? options.infiniteLiquidDropdown
      : true;

    this._waterEntryTime = null;
    this._inWater = false;
    this._safetyCallback = null;

    this._lastPosition = null;
    this._verticalSwimActive = false;
  }

  /**
   * Create a Movements instance configured for water navigation
   *
   * Uses mineflayer-pathfinder's public Movements class API.
   * Configures liquid costs, free motion, and liquid dropdown behavior
   * to enable swimming while maintaining land navigation capability.
   *
   * @param {object} mcData - Minecraft data for the bot's version
   * @returns {object|null} Configured Movements instance, or null if disabled
   */
  createWaterMovement(mcData) {
    if (!this.enabled) {
      logger.debug('WaterPathfinder: Advanced pathfinding disabled, skipping water movement setup');
      return null;
    }

    try {
      const { Movements } = require('mineflayer-pathfinder');
      const movements = new Movements(this.bot, mcData);

      // Enable water traversal via public API
      movements.liquidCost = this.liquidCost;
      movements.allowFreeMotion = this.allowFreeMotion;
      movements.infiniteLiquidDropdownDistance = this.infiniteLiquidDropdown;

      const visionHint = this.getVisionWaterHint();
      if (visionHint) {
        if (visionHint.preferShallow || visionHint.avoidDeep) {
          movements.allowFreeMotion = false;
          movements.liquidCost = Math.max(movements.liquidCost, this.costs.underwaterHorizontal);
        }

        if (visionHint.avoidCurrents) {
          movements.liquidCost = Math.max(movements.liquidCost, this.costs.underwaterHorizontal + this.costs.divePenalty);
        }
      }

      // Prevent flooding when breaking blocks near water
      movements.dontCreateFlow = true;

      movements.canDig = true;
      movements.allowParkour = true;
      movements.allowSprinting = true;

      logger.info('WaterPathfinder: Water-enabled movements configured', {
        liquidCost: movements.liquidCost,
        allowFreeMotion: movements.allowFreeMotion,
        infiniteLiquidDropdown: movements.infiniteLiquidDropdownDistance,
        maxWaterTime: this.maxWaterTime
      });

      return movements;
    } catch (err) {
      logger.error('WaterPathfinder: Failed to create water movements', {
        error: err.message
      });
      return null;
    }
  }

  /**
   * Apply water movements to the bot's pathfinder
   *
   * Creates and sets water-configured movements as the active
   * pathfinder configuration. Falls back gracefully if disabled.
   *
   * @param {object} mcData - Minecraft data for the bot's version
   * @returns {boolean} True if water movements were applied
   */
  applyWaterMovements(mcData) {
    if (!this.enabled) {
      logger.debug('WaterPathfinder: Not applying, advanced pathfinding disabled');
      return false;
    }

    if (!this.bot.pathfinder) {
      logger.warn('WaterPathfinder: Bot has no pathfinder plugin loaded');
      return false;
    }

    const movements = this.createWaterMovement(mcData);
    if (!movements) {
      return false;
    }

    this.bot.pathfinder.setMovements(movements);
    logger.info('WaterPathfinder: Water movements applied to pathfinder');
    return true;
  }

  /**
   * Check if the bot is currently in water
   *
   * Detects water by checking the block at the bot's position.
   * Distinguishes between surface swimming and underwater navigation.
   *
   * @returns {{ inWater: boolean, isSurface: boolean, depth: number }}
   */
  getWaterState() {
    if (!this.bot.entity || !this.bot.entity.position) {
      return { inWater: false, isSurface: false, depth: 0 };
    }

    const pos = this.bot.entity.position;
    const blockAt = this.bot.blockAt(pos.floored());
    const blockAbove = this.bot.blockAt(pos.floored().offset(0, 1, 0));

    const inWater = this._isWaterBlock(blockAt);
    const headUnderwater = this._isWaterBlock(blockAbove);

    const isSurface = inWater && !headUnderwater;

    let depth = 0;
    if (inWater) {
      depth = this._calculateWaterDepth(pos);
    }

    return { inWater, isSurface, depth };
  }

  /**
   * Start tracking water traversal for safety timeout
   *
   * Called when the bot enters water. Tracks entry time and
   * invokes the safety callback if maxWaterTime is exceeded.
   *
   * @param {Function} [safetyCallback] - Called when maxWaterTime exceeded
   *   Receives: { entryTime, elapsed, maxWaterTime }
   */
  startWaterTracking(safetyCallback) {
    this._safetyCallback = safetyCallback || null;
    this._waterEntryTime = Date.now();
    this._inWater = true;

    logger.debug('WaterPathfinder: Water tracking started', {
      maxWaterTime: this.maxWaterTime
    });

    // Set up safety timeout
    this._safetyTimer = setTimeout(() => {
      if (this._inWater && this._safetyCallback) {
        const elapsed = Date.now() - this._waterEntryTime;
        logger.warn('WaterPathfinder: Water time limit exceeded', {
          elapsed,
          maxWaterTime: this.maxWaterTime
        });
        this._safetyCallback({
          entryTime: this._waterEntryTime,
          elapsed,
          maxWaterTime: this.maxWaterTime
        });
      }
    }, this.maxWaterTime);

    // Prevent timer from keeping process alive
    if (this._safetyTimer.unref) {
      this._safetyTimer.unref();
    }
  }

  /**
   * Stop tracking water traversal
   *
   * Called when the bot exits water or reaches destination.
   * Clears the safety timeout timer.
   */
  stopWaterTracking() {
    if (this._safetyTimer) {
      clearTimeout(this._safetyTimer);
      this._safetyTimer = null;
    }

    if (this._inWater) {
      const elapsed = this._waterEntryTime
        ? Date.now() - this._waterEntryTime
        : 0;
      logger.debug('WaterPathfinder: Water tracking stopped', { elapsed });
    }

    this._inWater = false;
    this._waterEntryTime = null;
  }

  /**
   * Check if water traversal safety limit has been exceeded
   *
   * @returns {{ exceeded: boolean, elapsed: number, remaining: number }}
   */
  checkWaterSafety() {
    if (!this._inWater || !this._waterEntryTime) {
      return { exceeded: false, elapsed: 0, remaining: this.maxWaterTime };
    }

    const elapsed = Date.now() - this._waterEntryTime;
    const remaining = Math.max(0, this.maxWaterTime - elapsed);

    return {
      exceeded: elapsed >= this.maxWaterTime,
      elapsed,
      remaining
    };
  }

  /**
   * Detect if the path to a goal requires water traversal
   *
   * Scans blocks between current position and goal to check
   * for water bodies that would require swimming.
   *
   * @param {object} goalPosition - Target position {x, y, z}
   * @param {number} [sampleInterval=2] - Check every N blocks along path
   * @returns {{ requiresWater: boolean, waterBlocks: number, estimatedTime: number }}
   */
  analyzePathForWater(goalPosition, sampleInterval = 2) {
    if (!this.bot.entity || !this.bot.entity.position) {
      return { requiresWater: false, waterBlocks: 0, estimatedTime: 0 };
    }

    const start = this.bot.entity.position.floored();
    const goal = goalPosition.floored ? goalPosition.floored() : goalPosition;
    const dx = goal.x - start.x;
    const dz = goal.z - start.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance < 1) {
      return { requiresWater: false, waterBlocks: 0, estimatedTime: 0 };
    }

    let waterBlocks = 0;
    const steps = Math.ceil(distance / sampleInterval);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.floor(start.x + dx * t);
      const z = Math.floor(start.z + dz * t);

      // Check blocks at multiple Y levels (surface scan)
      for (let y = start.y - 2; y <= start.y + 2; y++) {
        const block = this.bot.blockAt({ x, y, z });
        if (this._isWaterBlock(block)) {
          waterBlocks++;
          break; // Count each column once
        }
      }
    }

    // Estimate swim time: ~2 blocks/second swimming speed
    const estimatedTime = waterBlocks > 0
      ? (waterBlocks / 2) * 1000  // ms
      : 0;

    return {
      requiresWater: waterBlocks > 0,
      waterBlocks,
      estimatedTime
    };
  }

  /**
   * Get navigation mode based on current water state
   *
   * Determines whether the bot should swim on the surface,
   * navigate underwater, or walk on land.
   *
   * @returns {'surface_swim'|'underwater'|'land'}
   */
  getNavigationMode() {
    const { inWater, isSurface } = this.getWaterState();

    if (!inWater) {
      return 'land';
    }

    return isSurface ? 'surface_swim' : 'underwater';
  }

  /**
   * Get cost multiplier for current navigation mode
   *
   * @returns {number} Cost multiplier (1.0 for land, higher for water)
   */
  getCurrentCostMultiplier() {
    const mode = this.getNavigationMode();

    switch (mode) {
      case 'surface_swim':
        return this.costs.surfaceSwim;
      case 'underwater':
        return this.costs.underwaterHorizontal + this.costs.divePenalty;
      case 'land':
      default:
        return 1.0;
    }
  }

  /**
   * Check if the bot has sufficient breath for underwater navigation
   *
   * @returns {{ sufficient: boolean, breathRemaining: number }}
   */
  checkBreath() {
    // Default full breath (300 ticks = 15 seconds)
    // Bot without oxygen property assumes full breath
    const breathRemaining = this.bot.oxygenLevel !== undefined
      ? this.bot.oxygenLevel
      : 300;

    return {
      sufficient: breathRemaining > this.breathWarning,
      breathRemaining
    };
  }

  /**
   * Get status information about the water pathfinder
   *
   * @returns {object} Status object
   */
  getStatus() {
    const waterState = this.getWaterState();
    const safety = this.checkWaterSafety();

    return {
      enabled: this.enabled,
      vision: this.visionBridge ? this.visionBridge.getWaterHint() : null,
      inWater: waterState.inWater,
      navigationMode: this.getNavigationMode(),
      waterDepth: waterState.depth,
      isSurface: waterState.isSurface,
      safety: {
        tracking: this._inWater,
        exceeded: safety.exceeded,
        elapsed: safety.elapsed,
        remaining: safety.remaining,
        maxWaterTime: this.maxWaterTime
      },
      costs: this.costs
    };
  }

  // ─── Private helpers ─────────────────────────────────────────

  /**
   * Check if a block is water (flowing or source)
   * @param {object|null} block - Mineflayer block object
   * @returns {boolean}
   * @private
   */
  _isWaterBlock(block) {
    if (!block) return false;
    return block.name === 'water' || block.name === 'flowing_water';
  }

  /**
   * Calculate water depth from a position
   *
   * Counts consecutive water blocks above the given position
   * up to the first non-water block (surface).
   *
   * @param {object} pos - Bot position
   * @returns {number} Number of water blocks above (0 if not in water)
   * @private
   */
  _calculateWaterDepth(pos) {
    let depth = 0;
    const floored = pos.floored();

    for (let y = floored.y; y < floored.y + 64; y++) {
      const block = this.bot.blockAt({ x: floored.x, y, z: floored.z });
      if (this._isWaterBlock(block)) {
        depth++;
      } else {
        break;
      }
    }

    return depth;
  }

  getVisionWaterHint() {
    if (!this.visionBridge || !this.visionBridge.isEnabled()) {
      return null;
    }

    return this.visionBridge.getWaterHint();
  }
}

/**
 * Factory function: Create a WaterPathfinder instance and apply water movements
 *
 * Convenience function for the most common usage pattern.
 * Checks feature flag, creates instance, and applies movements.
 *
 * @param {object} bot - Mineflayer bot instance
 * @param {object} mcData - Minecraft data for bot's version
 * @param {object} [options={}] - WaterPathfinder options
 * @returns {{ pathfinder: WaterPathfinder|null, applied: boolean }}
 */
function createWaterPathfinder(bot, mcData, options = {}) {
  const wp = new WaterPathfinder(bot, options);

  if (!wp.enabled) {
    logger.info('WaterPathfinder: Advanced pathfinding disabled');
    return { pathfinder: wp, applied: false };
  }

  const applied = wp.applyWaterMovements(mcData);
  return { pathfinder: wp, applied };
}

module.exports = {
  WaterPathfinder,
  createWaterPathfinder,
  WATER_COSTS,
  SAFETY_DEFAULTS
};
