/**
 * Nether Pathfinder - Extends mineflayer-pathfinder for nether dimension traversal
 *
 * Uses mineflayer-pathfinder's PUBLIC API (Movements class) to configure
 * nether navigation. Does NOT fork or copy internal pathfinder code.
 *
 * Features:
 * - Lava avoidance: High cost multipliers for lava-adjacent blocks
 * - Portal detection: Recognize nether portal blocks for traversal
 * - Soul sand penalties: Slower movement costs
 * - Magma block penalties: Damage risk costs
 * - Open air penalties: Void edge awareness
 * - Dimension detection: Only applies in minecraft:the_nether
 * - Feature flag gated: ENABLE_ADVANCED_PATHFINDING
 *
 * @module nether-pathfinder
 */

'use strict';

const logger = require('../utils/logger');
const featureFlags = require('../utils/feature-flags');
const { VisionPathfindingBridge } = require('./vision-pathfinding-bridge');

// Cost multipliers: higher = less preferred vs safe nether terrain
const NETHER_COSTS = {
  lavaAdjacent: 10.0,
  soulSand: 2.5,
  magmaBlock: 5.0,
  openAir: 8.0,
  portal: 1.0,
  safeGround: 1.5
};

// Default configuration for nether traversal
const NETHER_DEFAULTS = {
  portalCooldownMs: 15000,
  lavaScanRadius: 3,
  hazardScanRadius: 2,
  voidEdgeDistance: 3,
  lavaDangerLevel: 0.7,
  maxLavaAdjacentBlocks: 5
};

// Block sets as Sets for O(1) lookup
const LAVA_BLOCKS = new Set(['lava', 'flowing_lava']);

const PORTAL_BLOCKS = new Set(['nether_portal']);

const OBSIDIAN_BLOCKS = new Set(['obsidian', 'crying_obsidian']);

const NETHER_HAZARD_BLOCKS = new Set([
  'soul_sand', 'soul_soil', 'magma_block', 'fire',
  'soul_fire', 'campfire', 'soul_campfire'
]);

const NETHER_DIMENSIONS = new Set([
  'minecraft:the_nether', 'the_nether'
]);

const NETHER_BIOMES = new Set([
  'minecraft:nether_wastes', 'nether_wastes',
  'minecraft:soul_sand_valley', 'soul_sand_valley',
  'minecraft:crimson_forest', 'crimson_forest',
  'minecraft:warped_forest', 'warped_forest',
  'minecraft:basalt_deltas', 'basalt_deltas'
]);

// Air block names for open-air cost
const AIR_BLOCKS = new Set(['air', 'cave_air', 'void_air']);

// Biome inference from blocks
const BIOME_INFERENCE = {
  soul_sand: { biome: 'soul_sand_valley', dangerBonus: 0.3 },
  soul_soil: { biome: 'soul_sand_valley', dangerBonus: 0.3 },
  basalt: { biome: 'basalt_deltas', dangerBonus: 0.4 },
  crimson_nylium: { biome: 'crimson_forest', dangerBonus: 0.1 },
  warped_nylium: { biome: 'warped_forest', dangerBonus: 0.1 }
};

const DEFAULT_BIOME = { biome: 'nether_wastes', dangerBonus: 0.2 };

// Hazard weight multipliers for _calculateHazardLevel
const HAZARD_WEIGHTS = {
  soulSand: 0.05,
  magmaBlocks: 0.15,
  fires: 0.10,
  voidEdges: 0.20
};

/**
 * NetherPathfinder - Configures mineflayer-pathfinder for nether navigation
 *
 * Extends the standard Movements configuration to support lava avoidance,
 * portal detection/usage, soul sand slowdown, and magma block damage penalties.
 */
class NetherPathfinder {
  /**
   * @param {object} bot - Mineflayer bot instance
   * @param {object} [options={}] - Configuration options
   * @param {number} [options.portalCooldownMs=15000] - Cooldown ms after portal use
   * @param {number} [options.lavaScanRadius=3] - Radius to scan for lava
   * @param {number} [options.hazardScanRadius=2] - Radius to scan for hazards
   * @param {number} [options.voidEdgeDistance=3] - Distance to check for void edges
   * @param {number} [options.lavaDangerLevel=0.7] - Hazard level threshold for danger mode
   * @param {number} [options.maxLavaAdjacentBlocks=5] - Max lava blocks before path is "avoid"
   * @param {object} [options.costs] - Override nether cost multipliers
   */
  constructor(bot, options = {}) {
    this.bot = bot;
    this.enabled = featureFlags.isEnabled('ADVANCED_PATHFINDING');
    this.visionBridge = options.visionBridge || new VisionPathfindingBridge({
      visionState: options.visionState || null
    });

    this.costs = { ...NETHER_COSTS, ...(options.costs || {}) };

    // Configuration from NETHER_DEFAULTS with overrides
    this.portalCooldownMs = options.portalCooldownMs !== undefined
      ? options.portalCooldownMs : NETHER_DEFAULTS.portalCooldownMs;
    this.lavaScanRadius = options.lavaScanRadius !== undefined
      ? options.lavaScanRadius : NETHER_DEFAULTS.lavaScanRadius;
    this.hazardScanRadius = options.hazardScanRadius !== undefined
      ? options.hazardScanRadius : NETHER_DEFAULTS.hazardScanRadius;
    this.voidEdgeDistance = options.voidEdgeDistance !== undefined
      ? options.voidEdgeDistance : NETHER_DEFAULTS.voidEdgeDistance;
    this.lavaDangerLevel = options.lavaDangerLevel !== undefined
      ? options.lavaDangerLevel : NETHER_DEFAULTS.lavaDangerLevel;
    this.maxLavaAdjacentBlocks = options.maxLavaAdjacentBlocks !== undefined
      ? options.maxLavaAdjacentBlocks : NETHER_DEFAULTS.maxLavaAdjacentBlocks;

    // Portal tracking state
    this._lastPortalUseTime = null;
    this._portalCooldownActive = false;
    this._portalCooldownTimer = null;
    this._nearbyPortal = null;

    // Lava and hazard state tracking
    this._inNether = false;
    this._nearLava = false;
    this._hazardLevel = 0;
    this._lastHazardScan = null;
    this._lastHazardScanTime = 0;
    this._hazardScanIntervalMs = 500;
  }

  /**
   * Create a Movements instance configured for nether navigation
   *
   * Uses mineflayer-pathfinder's public Movements class API.
   * Configures lava costs, soul sand penalties, magma block penalties,
   * and portal traversal settings for safe nether navigation.
   *
   * @param {object} mcData - Minecraft data for the bot's version
   * @returns {object|null} Configured Movements instance, or null if disabled/error
   */
  createNetherMovement(mcData) {
    if (!this.enabled) {
      logger.debug('NetherPathfinder: Advanced pathfinding disabled, skipping nether movement setup');
      return null;
    }

    try {
      const { Movements } = require('mineflayer-pathfinder');
      const movements = new Movements(this.bot, mcData);

      // Configure lava avoidance via public API
      movements.liquidCost = this.costs.lavaAdjacent;
      movements.allowFreeMotion = false;
      movements.infiniteLiquidDropdownDistance = false;
      movements.dontCreateFlow = true;
      movements.canDig = true;
      movements.allowParkour = true;
      movements.allowSprinting = true;

      const visionHint = this.getVisionNetherHint();
      if (visionHint) {
        if (visionHint.increaseLavaAvoidance) {
          movements.liquidCost = Math.max(movements.liquidCost, this.costs.lavaAdjacent + 2);
        }

        if (visionHint.widenVoidBuffer) {
          movements.allowFreeMotion = false;
          movements.infiniteLiquidDropdownDistance = false;
        }
      }

      logger.info('NetherPathfinder: Nether-enabled movements configured', {
        liquidCost: movements.liquidCost,
        allowFreeMotion: movements.allowFreeMotion,
        infiniteLiquidDropdown: movements.infiniteLiquidDropdownDistance
      });

      return movements;
    } catch (err) {
      logger.error('NetherPathfinder: Failed to create Nether movements', {
        error: err.message
      });
      return null;
    }
  }

  /**
   * Apply nether movements to the bot's pathfinder
   *
   * Creates and sets nether-configured movements as the active
   * pathfinder configuration. Falls back gracefully if disabled
   * or bot has no pathfinder.
   *
   * @param {object} mcData - Minecraft data for the bot's version
   * @returns {boolean} True if nether movements were applied
   */
  applyNetherMovements(mcData) {
    if (!this.enabled) {
      logger.debug('NetherPathfinder: Not applying, advanced pathfinding disabled');
      return false;
    }

    if (!this.bot.pathfinder) {
      logger.warn('NetherPathfinder: Bot has no pathfinder plugin loaded');
      return false;
    }

    const movements = this.createNetherMovement(mcData);
    if (!movements) {
      return false;
    }

    this.bot.pathfinder.setMovements(movements);
    logger.info('NetherPathfinder: Nether movements applied to pathfinder');
    return true;
  }

  /**
   * Check if the bot is currently in the nether dimension
   *
   * Detects nether by checking bot.game.dimension property against
   * NETHER_DIMENSIONS set (supports both prefixed and non-prefixed).
   *
   * @returns {boolean} True if bot is in the nether
   */
  isInNether() {
    if (!this.bot.game) {
      return false;
    }
    const dimension = this.bot.game.dimension;
    if (!dimension) {
      return false;
    }
    return NETHER_DIMENSIONS.has(dimension);
  }

  /**
   * Check if lava blocks are near a given position
   *
   * Scans blocks within radius for lava, skipping the center position.
   *
   * @param {object} position - Center position {x, y, z} (may have floored())
   * @param {number} [radius] - Scan radius (default: this.lavaScanRadius)
   * @returns {{ nearLava: boolean, lavaCount: number, closestDistance: number }}
   */
  isNearLava(position, radius) {
    radius = radius !== undefined ? radius : this.lavaScanRadius;

    const pos = position.floored ? position.floored() : position;
    let lavaCount = 0;
    let closestDistance = Infinity;

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          // Skip center position
          if (dx === 0 && dy === 0 && dz === 0) continue;

          const block = this.bot.blockAt({
            x: pos.x + dx,
            y: pos.y + dy,
            z: pos.z + dz
          });

          if (this._isLavaBlock(block)) {
            lavaCount++;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < closestDistance) {
              closestDistance = dist;
            }
          }
        }
      }
    }

    const nearLava = lavaCount > 0;

    // Update internal state
    if (nearLava !== this._nearLava) {
      this._nearLava = nearLava;
      if (nearLava) {
        logger.warn('NetherPathfinder: Lava detected nearby', {
          closestDistance,
          lavaCount,
          lavaScanRadius: this.lavaScanRadius
        });
      }
    }

    return { nearLava, lavaCount, closestDistance };
  }

  /**
   * Detect nether portal blocks near a given position
   *
   * Scans for nether_portal blocks within radius.
   * Updates _nearbyPortal state.
   *
   * @param {object} position - Center position {x, y, z} (may have floored())
   * @param {number} [radius=5] - Detection radius in blocks
   * @returns {{ found: boolean, position: object|null, portalBlocks: number }}
   */
  detectPortal(position, radius = 5) {
    const pos = position.floored ? position.floored() : position;
    let portalBlocks = 0;
    let closestPortal = null;
    let closestDist = Infinity;

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const block = this.bot.blockAt({
            x: pos.x + dx,
            y: pos.y + dy,
            z: pos.z + dz
          });

          if (this._isPortalBlock(block)) {
            portalBlocks++;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < closestDist) {
              closestDist = dist;
              closestPortal = { x: pos.x + dx, y: pos.y + dy, z: pos.z + dz };
            }
          }
        }
      }
    }

    const found = portalBlocks > 0;

    // Update internal portal tracking
    if (found) {
      this._nearbyPortal = closestPortal;
    } else {
      this._nearbyPortal = null;
    }

    return { found, position: closestPortal, portalBlocks };
  }

  /**
   * Record portal use and start cooldown
   *
   * Called when the bot uses a nether portal. Starts a cooldown
   * timer to prevent rapid portal re-entry.
   *
   * @returns {{ used: boolean, cooldownMs: number }}
   */
  usePortal() {
    // Check if on cooldown
    if (this._portalCooldownActive) {
      const cooldown = this.checkPortalCooldown();
      return { used: false, cooldownMs: cooldown.remainingMs };
    }

    this._lastPortalUseTime = Date.now();
    this._portalCooldownActive = true;

    logger.info('NetherPathfinder: Portal use recorded, cooldown active', {
      portalCooldownMs: this.portalCooldownMs
    });

    // Set up cooldown timer
    this._portalCooldownTimer = setTimeout(() => {
      this._portalCooldownActive = false;
      this._lastPortalUseTime = null;
      logger.debug('NetherPathfinder: Portal cooldown expired');
    }, this.portalCooldownMs);

    // Prevent timer from keeping process alive
    if (this._portalCooldownTimer.unref) {
      this._portalCooldownTimer.unref();
    }

    return { used: true, cooldownMs: this.portalCooldownMs };
  }

  /**
   * Check if portal cooldown is currently active
   *
   * @returns {{ onCooldown: boolean, remainingMs: number }}
   */
  checkPortalCooldown() {
    if (!this._portalCooldownActive || !this._lastPortalUseTime) {
      return { onCooldown: false, remainingMs: 0 };
    }

    const elapsed = Date.now() - this._lastPortalUseTime;
    const remainingMs = Math.max(0, this.portalCooldownMs - elapsed);

    if (remainingMs <= 0) {
      this._portalCooldownActive = false;
    }

    return { onCooldown: remainingMs > 0, remainingMs };
  }

  /**
   * Clear portal cooldown state
   *
   * Cancels the cooldown timer and resets cooldown state.
   * Safe to call when not on cooldown.
   */
  clearPortalCooldown() {
    if (this._portalCooldownTimer) {
      clearTimeout(this._portalCooldownTimer);
      this._portalCooldownTimer = null;
    }
    this._portalCooldownActive = false;
    this._lastPortalUseTime = null;
  }

  /**
   * Detect nether hazards near a given position
   *
   * Scans for soul sand, magma blocks, fire, and void edges.
   * Updates internal hazard state.
   *
   * @param {object} position - Center position {x, y, z} (may have floored())
   * @param {number} [radius] - Scan radius (default: this.hazardScanRadius)
   * @returns {{ hazardLevel: number, soulSand: number, magmaBlocks: number, fires: number, voidEdges: number }}
   */
  detectHazards(position, radius) {
    radius = radius !== undefined ? radius : this.hazardScanRadius;

    const pos = position.floored ? position.floored() : position;
    let soulSand = 0;
    let magmaBlocks = 0;
    let fires = 0;
    let voidEdges = 0;

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const blockPos = { x: pos.x + dx, y: pos.y + dy, z: pos.z + dz };
          const block = this.bot.blockAt(blockPos);

          if (!block) continue;

          if (block.name === 'soul_sand' || block.name === 'soul_soil') {
            soulSand++;
          }
          if (block.name === 'magma_block') {
            magmaBlocks++;
          }
          if (block.name === 'fire' || block.name === 'soul_fire' ||
              block.name === 'campfire' || block.name === 'soul_campfire') {
            fires++;
          }

          // Check for void edges: air block with no solid blocks below
          if (AIR_BLOCKS.has(block.name)) {
            let hasSolidBelow = false;
            for (let checkY = blockPos.y - 1; blockPos.y - checkY <= this.voidEdgeDistance; checkY--) {
              const belowBlock = this.bot.blockAt({ x: blockPos.x, y: checkY, z: blockPos.z });
              if (belowBlock && !AIR_BLOCKS.has(belowBlock.name)) {
                hasSolidBelow = true;
                break;
              }
            }
            if (!hasSolidBelow) {
              voidEdges++;
            }
          }
        }
      }
    }

    const hazardLevel = this._calculateHazardLevel({ soulSand, magmaBlocks, fires, voidEdges });

    // Update internal state
    this._hazardLevel = hazardLevel;
    this._lastHazardScan = { soulSand, magmaBlocks, fires, voidEdges };
    this._lastHazardScanTime = Date.now();

    return { hazardLevel, soulSand, magmaBlocks, fires, voidEdges };
  }

  /**
   * Calculate hazard level from hazard counts
   *
   * @param {object} counts - { soulSand, magmaBlocks, fires, voidEdges }
   * @returns {number} Hazard level 0.0-1.0
   * @private
   */
  _calculateHazardLevel(counts) {
    const level =
      (counts.soulSand || 0) * HAZARD_WEIGHTS.soulSand +
      (counts.magmaBlocks || 0) * HAZARD_WEIGHTS.magmaBlocks +
      (counts.fires || 0) * HAZARD_WEIGHTS.fires +
      (counts.voidEdges || 0) * HAZARD_WEIGHTS.voidEdges;

    return Math.min(1.0, level);
  }

  /**
   * Get the cost for a block by its name
   *
   * @param {string|null|undefined} blockName - Block name string
   * @returns {number} Cost multiplier from NETHER_COSTS
   */
  getBlockCost(blockName) {
    if (blockName === null || blockName === undefined) {
      return this.costs.safeGround;
    }

    if (LAVA_BLOCKS.has(blockName)) {
      return this.costs.lavaAdjacent;
    }
    if (blockName === 'soul_sand' || blockName === 'soul_soil') {
      return this.costs.soulSand;
    }
    if (blockName === 'magma_block') {
      return this.costs.magmaBlock;
    }
    if (PORTAL_BLOCKS.has(blockName)) {
      return this.costs.portal;
    }
    if (AIR_BLOCKS.has(blockName)) {
      return this.costs.openAir;
    }

    return this.costs.safeGround;
  }

  /**
   * Analyze a path for nether-specific hazards
   *
   * Scans blocks along the path to detect lava, hazards, and void edges.
   * Provides a recommended path type based on hazard analysis.
   *
   * @param {object} goalPosition - Target position {x, y, z} (may have floored())
   * @param {number} [sampleInterval=2] - Check every N blocks along path
   * @returns {{ isNetherPath: boolean, lavaBlocks: number, hazardBlocks: number, voidEdges: number, overallHazardLevel: number, recommendedPath: string }}
   */
  analyzePathForNether(goalPosition, sampleInterval = 2) {
    const defaultResult = {
      isNetherPath: false,
      lavaBlocks: 0,
      hazardBlocks: 0,
      voidEdges: 0,
      overallHazardLevel: 0,
      recommendedPath: 'unknown'
    };

    if (!this.bot.entity) {
      return defaultResult;
    }

    const start = this.bot.entity.position.floored ? this.bot.entity.position.floored() : this.bot.entity.position;
    const goal = goalPosition.floored ? goalPosition.floored() : goalPosition;
    const dx = goal.x - start.x;
    const dz = goal.z - start.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance < 1) {
      return {
        isNetherPath: false,
        lavaBlocks: 0,
        hazardBlocks: 0,
        voidEdges: 0,
        overallHazardLevel: 0,
        recommendedPath: 'trivial'
      };
    }

    let lavaBlocks = 0;
    let hazardBlocks = 0;
    let voidEdgeCount = 0;
    const isNetherPath = this.isInNether();
    const steps = Math.ceil(distance / sampleInterval);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.floor(start.x + dx * t);
      const z = Math.floor(start.z + dz * t);

      // Check blocks at multiple Y levels
      for (let y = start.y - 2; y <= start.y + 2; y++) {
        const block = this.bot.blockAt({ x, y, z });
        if (!block) continue;

        if (this._isLavaBlock(block)) {
          lavaBlocks++;
        }
        if (this._isHazardBlock(block)) {
          hazardBlocks++;
        }
        // Check for void edges at this position
        if (AIR_BLOCKS.has(block.name)) {
          let hasSolidBelow = false;
          for (let checkY = y - 1; y - checkY <= this.voidEdgeDistance; checkY--) {
            const belowBlock = this.bot.blockAt({ x, y: checkY, z });
            if (belowBlock && !AIR_BLOCKS.has(belowBlock.name)) {
              hasSolidBelow = true;
              break;
            }
          }
          if (!hasSolidBelow) {
            voidEdgeCount++;
          }
        }
      }
    }

    const overallHazardLevel = this._calculateHazardLevel({
      soulSand: hazardBlocks,
      magmaBlocks: lavaBlocks,
      fires: 0,
      voidEdges: voidEdgeCount
    });

    let recommendedPath;
    if (lavaBlocks > this.maxLavaAdjacentBlocks) {
      recommendedPath = 'avoid';
    } else if (lavaBlocks > 0 || hazardBlocks > 0) {
      recommendedPath = 'cautious';
    } else {
      recommendedPath = 'safe';
    }

    if (lavaBlocks > 0) {
      logger.warn('NetherPathfinder: Path contains lava hazards', {
        lavaBlocks,
        hazardBlocks,
        voidEdges: voidEdgeCount,
        recommendedPath
      });
    }

    return {
      isNetherPath,
      lavaBlocks,
      hazardBlocks,
      voidEdges: voidEdgeCount,
      overallHazardLevel,
      recommendedPath
    };
  }

  /**
   * Get biome danger assessment for current position
   *
   * Uses bot.biomeAt if available, otherwise infers biome from
   * surrounding blocks.
   *
   * @returns {{ inNetherBiome: boolean, biome: string|null, dangerBonus: number }}
   */
  getBiomeDanger() {
    const defaultResult = { inNetherBiome: false, biome: null, dangerBonus: 0 };

    if (!this.bot.entity || !this.bot.entity.position) {
      return defaultResult;
    }

    // Use bot.biomeAt if available
    if (typeof this.bot.biomeAt === 'function') {
      const biome = this.bot.biomeAt();
      const biomeStr = biome || '';
      const inNetherBiome = NETHER_BIOMES.has(biomeStr);

      let dangerBonus = 0.2;
      if (biomeStr.includes('soul_sand_valley')) dangerBonus = 0.3;
      else if (biomeStr.includes('basalt_deltas')) dangerBonus = 0.4;
      else if (biomeStr.includes('crimson_forest')) dangerBonus = 0.1;
      else if (biomeStr.includes('warped_forest')) dangerBonus = 0.1;

      return { inNetherBiome, biome: biome, dangerBonus };
    }

    // Infer biome from block below bot
    const pos = this.bot.entity.position.floored
      ? this.bot.entity.position.floored()
      : this.bot.entity.position;

    const blockBelow = this.bot.blockAt({
      x: pos.x,
      y: pos.y - 1,
      z: pos.z
    });

    if (blockBelow && BIOME_INFERENCE[blockBelow.name]) {
      const inferred = BIOME_INFERENCE[blockBelow.name];
      return {
        inNetherBiome: true,
        biome: inferred.biome,
        dangerBonus: inferred.dangerBonus
      };
    }

    // Default: nether_wastes
    return {
      inNetherBiome: true,
      biome: DEFAULT_BIOME.biome,
      dangerBonus: DEFAULT_BIOME.dangerBonus
    };
  }

  /**
   * Get current navigation mode based on nether conditions
   *
   * @returns {'overworld'|'nether_danger'|'nether_cautious'|'nether_safe'}
   */
  getNavigationMode() {
    if (!this.isInNether()) {
      return 'overworld';
    }

    if (this._hazardLevel >= this.lavaDangerLevel) {
      return 'nether_danger';
    }

    if (this._nearLava || this._hazardLevel > 0.3) {
      return 'nether_cautious';
    }

    return 'nether_safe';
  }

  /**
   * Get the effective cost multiplier based on current nether conditions
   *
   * @returns {number} Current cost multiplier
   */
  getCurrentCostMultiplier() {
    const mode = this.getNavigationMode();

    switch (mode) {
      case 'nether_danger':
        return this.costs.lavaAdjacent;
      case 'nether_cautious':
        return this.costs.magmaBlock;
      case 'nether_safe':
        return this.costs.safeGround;
      default:
        return 1.0;
    }
  }

  /**
   * Update nether state by scanning for lava and hazards
   *
   * Throttles hazard scans based on _hazardScanIntervalMs.
   *
   * @returns {{ inNether: boolean, nearLava: boolean, hazardLevel: number }}
   */
  updateNetherState() {
    if (!this.bot.entity) {
      return { inNether: false, nearLava: false, hazardLevel: 0 };
    }

    const inNether = this.isInNether();

    if (!inNether) {
      return { inNether: false, nearLava: false, hazardLevel: 0 };
    }

    // Check lava
    const pos = this.bot.entity.position.floored
      ? this.bot.entity.position.floored()
      : this.bot.entity.position;

    const lavaResult = this.isNearLava(pos);
    this._nearLava = lavaResult.nearLava;

    // Throttle hazard scans
    const now = Date.now();
    if (now - this._lastHazardScanTime >= this._hazardScanIntervalMs) {
      this.detectHazards(pos);
    }

    return {
      inNether: true,
      nearLava: this._nearLava,
      hazardLevel: this._hazardLevel
    };
  }

  /**
   * Get comprehensive status information about the nether pathfinder
   *
   * @returns {object} Status object with all nether pathfinding state
   */
  getStatus() {
    const portalCooldown = this.checkPortalCooldown();

    return {
      enabled: this.enabled,
      vision: this.visionBridge ? this.visionBridge.getNetherHint() : null,
      inNether: this.isInNether(),
      nearLava: this._nearLava,
      portalCooldown: {
        active: portalCooldown.onCooldown,
        remainingMs: portalCooldown.remainingMs
      },
      hazardLevel: this._hazardLevel,
      navigationMode: this.getNavigationMode(),
      costMultiplier: this.getCurrentCostMultiplier(),
      nearbyPortal: this._nearbyPortal,
      costs: this.costs
    };
  }

  // ─── Private helpers ─────────────────────────────────────────

  /**
   * Check if a block is lava (flowing or still)
   * @param {object|null} block - Mineflayer block object
   * @returns {boolean}
   * @private
   */
  _isLavaBlock(block) {
    if (!block) return false;
    return LAVA_BLOCKS.has(block.name);
  }

  /**
   * Check if a block is a nether hazard block
   * @param {object|null} block - Mineflayer block object
   * @returns {boolean}
   * @private
   */
  _isHazardBlock(block) {
    if (!block) return false;
    return NETHER_HAZARD_BLOCKS.has(block.name);
  }

  /**
   * Check if a block is a nether portal
   * @param {object|null} block - Mineflayer block object
   * @returns {boolean}
   * @private
   */
  _isPortalBlock(block) {
    if (!block) return false;
    return PORTAL_BLOCKS.has(block.name);
  }

  /**
   * Check if a block is obsidian
   * @param {object|null} block - Mineflayer block object
   * @returns {boolean}
   * @private
   */
  _isObsidianBlock(block) {
    if (!block) return false;
    return OBSIDIAN_BLOCKS.has(block.name);
  }

  getVisionNetherHint() {
    if (!this.visionBridge || !this.visionBridge.isEnabled()) {
      return null;
    }

    return this.visionBridge.getNetherHint();
  }
}

/**
 * Factory function: Create a NetherPathfinder instance and apply nether movements
 *
 * Convenience function for the most common usage pattern.
 * Checks feature flag, creates instance, and applies movements
 * if pathfinder is available.
 *
 * @param {object} bot - Mineflayer bot instance
 * @param {object} mcData - Minecraft data for bot's version
 * @param {object} [options={}] - NetherPathfinder options
 * @returns {{ pathfinder: NetherPathfinder|null, applied: boolean }}
 */
function createNetherPathfinder(bot, mcData, options = {}) {
  const np = new NetherPathfinder(bot, options);

  if (!np.enabled) {
    logger.info('NetherPathfinder: Advanced pathfinding disabled');
    return { pathfinder: np, applied: false };
  }

  const applied = np.applyNetherMovements(mcData);
  return { pathfinder: np, applied };
}

module.exports = {
  NetherPathfinder,
  createNetherPathfinder,
  NETHER_COSTS,
  NETHER_DEFAULTS,
  NETHER_HAZARD_BLOCKS,
  LAVA_BLOCKS,
  PORTAL_BLOCKS,
  OBSIDIAN_BLOCKS,
  NETHER_DIMENSIONS,
  NETHER_BIOMES
};
