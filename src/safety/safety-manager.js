/**
 * Safety Manager - Prevents griefing and dangerous actions
 *
 * Enforces rules to prevent the bot from:
 * - Breaking player-placed blocks
 * - Attacking players
 * - Placing dangerous blocks (lava, TNT)
 * - Breaking valuable containers (chests, furnaces)
 *
 * @module safety-manager
 */

'use strict';

const logger = require('../utils/logger');

/**
 * Safety configuration from environment
 */
const SAFETY_ENABLED = process.env.SAFETY_ENABLED !== 'false'; // Default: true
const ALLOW_PLAYER_ATTACKS = process.env.ALLOW_PLAYER_ATTACKS === 'true'; // Default: false
const ALLOW_BREAKING_PLAYER_BLOCKS = process.env.ALLOW_BREAKING_PLAYER_BLOCKS === 'true'; // Default: false

/**
 * Dangerous blocks that should never be placed
 * These can cause destruction or harm to players/terrain
 */
const DANGEROUS_BLOCKS = new Set([
  'lava',
  'flowing_lava',
  'tnt',
  'fire',
  'bed', // Can explode in wrong dimensions
  'respawn_anchor', // Can explode in wrong dimensions
  'end_crystal',
  'wither_rose' // Damages players
]);

/**
 * Valuable blocks that should never be broken without explicit command
 * These contain stored items or are crafted items
 */
const PROTECTED_BLOCKS = new Set([
  'chest',
  'trapped_chest',
  'ender_chest',
  'barrel',
  'shulker_box',
  'white_shulker_box',
  'orange_shulker_box',
  'magenta_shulker_box',
  'light_blue_shulker_box',
  'yellow_shulker_box',
  'lime_shulker_box',
  'pink_shulker_box',
  'gray_shulker_box',
  'light_gray_shulker_box',
  'cyan_shulker_box',
  'purple_shulker_box',
  'blue_shulker_box',
  'brown_shulker_box',
  'green_shulker_box',
  'red_shulker_box',
  'black_shulker_box',
  'furnace',
  'blast_furnace',
  'smoker',
  'brewing_stand',
  'beacon',
  'conduit',
  'bell',
  'anvil',
  'chipped_anvil',
  'damaged_anvil',
  'grindstone',
  'stonecutter',
  'loom',
  'smithing_table',
  'fletching_table',
  'cartography_table',
  'lectern',
  'composter',
  'barrel'
]);

/**
 * Actions that require safety checks
 */
const ActionType = {
  DIG: 'dig',
  PLACE: 'place',
  ATTACK: 'attack',
  INTERACT: 'interact',
  CRAFT: 'craft',
  MOVE: 'move'
};

/**
 * Safety violation result
 */
class SafetyViolation {
  constructor(action, reason, details = {}) {
    this.action = action;
    this.reason = reason;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * SafetyManager class
 * Checks actions against safety rules before execution
 */
class SafetyManager {
  constructor(bot = null) {
    this.bot = bot;
    this.enabled = SAFETY_ENABLED;
    this.violations = []; // Log of blocked actions
    this.maxViolations = 1000; // Prevent unbounded memory growth

    logger.info('[Safety] Manager initialized', {
      enabled: this.enabled,
      allowPlayerAttacks: ALLOW_PLAYER_ATTACKS,
      allowBreakingPlayerBlocks: ALLOW_BREAKING_PLAYER_BLOCKS
    });
  }

  /**
   * Set bot instance (for late initialization)
   * @param {Object} bot - Mineflayer bot instance
   */
  setBot(bot) {
    this.bot = bot;
    logger.debug('[Safety] Bot instance set');
  }

  /**
   * Enable safety checks
   */
  enable() {
    this.enabled = true;
    logger.info('[Safety] Safety checks ENABLED');
  }

  /**
   * Disable safety checks (use with caution)
   */
  disable() {
    this.enabled = false;
    logger.warn('[Safety] Safety checks DISABLED');
  }

  /**
   * Check if an action is safe to execute
   * @param {Object} action - Action to check
   * @returns {Object} { safe: boolean, violation?: SafetyViolation }
   */
  checkAction(action) {
    // If safety is disabled, allow everything
    if (!this.enabled) {
      return { safe: true };
    }

    // Null/undefined action is safe (no-op)
    if (!action) {
      return { safe: true };
    }

    const { type, data = {} } = action;

    switch (type) {
      case ActionType.DIG:
        return this.checkDigAction(data);
      case ActionType.PLACE:
        return this.checkPlaceAction(data);
      case ActionType.ATTACK:
        return this.checkAttackAction(data);
      case ActionType.INTERACT:
        return this.checkInteractAction(data);
      default:
        // Unknown action types are allowed (let pilot decide)
        return { safe: true };
    }
  }

  /**
   * Check if breaking a block is safe
   * @param {Object} data - { position: Vec3, block?: Block }
   * @returns {Object} { safe: boolean, violation?: SafetyViolation }
   */
  checkDigAction(data) {
    const { position, block } = data;

    if (!position) {
      logger.warn('[Safety] Dig action missing position');
      return { safe: false, violation: new SafetyViolation('dig', 'Missing position') };
    }

    // Get block info if not provided
    let targetBlock = block;
    if (this.bot && !targetBlock) {
      targetBlock = this.bot.blockAt(position);
    }

    if (targetBlock) {
      const blockName = targetBlock.name;

      // Check if it's a protected block
      if (PROTECTED_BLOCKS.has(blockName)) {
        const violation = new SafetyViolation('dig', 'Protected block', {
          block: blockName,
          position: this.formatPosition(position)
        });
        this.logViolation(violation);
        return { safe: false, violation };
      }

      // Check if block was placed by a player (if we can detect it)
      if (!ALLOW_BREAKING_PLAYER_BLOCKS && this.isPlayerPlaced(targetBlock)) {
        const violation = new SafetyViolation('dig', 'Player-placed block', {
          block: blockName,
          position: this.formatPosition(position)
        });
        this.logViolation(violation);
        return { safe: false, violation };
      }
    }

    return { safe: true };
  }

  /**
   * Check if placing a block is safe
   * @param {Object} data - { position: Vec3, blockName: string }
   * @returns {Object} { safe: boolean, violation?: SafetyViolation }
   */
  checkPlaceAction(data) {
    const { position, blockName } = data;

    if (!position || !blockName) {
      logger.warn('[Safety] Place action missing position or blockName');
      return { safe: false, violation: new SafetyViolation('place', 'Missing position or block name') };
    }

    // Normalize block name
    const normalizedName = blockName.toLowerCase().replace('minecraft:', '');

    // Check if it's a dangerous block
    if (DANGEROUS_BLOCKS.has(normalizedName)) {
      const violation = new SafetyViolation('place', 'Dangerous block', {
        block: normalizedName,
        position: this.formatPosition(position)
      });
      this.logViolation(violation);
      return { safe: false, violation };
    }

    return { safe: true };
  }

  /**
   * Check if attacking an entity is safe
   * @param {Object} data - { entity: Entity, position?: Vec3 }
   * @returns {Object} { safe: boolean, violation?: SafetyViolation }
   */
  checkAttackAction(data) {
    const { entity } = data;

    if (!entity) {
      logger.warn('[Safety] Attack action missing entity');
      return { safe: false, violation: new SafetyViolation('attack', 'Missing entity') };
    }

    // Check if entity is a player
    if (entity.type === 'player') {
      if (!ALLOW_PLAYER_ATTACKS) {
        const violation = new SafetyViolation('attack', 'Player attack', {
          username: entity.username || 'unknown',
          position: entity.position ? this.formatPosition(entity.position) : 'unknown'
        });
        this.logViolation(violation);
        return { safe: false, violation };
      }
    }

    return { safe: true };
  }

  /**
   * Check if interacting with a block is safe
   * @param {Object} data - { position: Vec3, block?: Block }
   * @returns {Object} { safe: boolean, violation?: SafetyViolation }
   */
  checkInteractAction(data) {
    // Interactions are generally safe
    // This is a placeholder for future restrictions
    return { safe: true };
  }

  /**
   * Attempt to detect if a block was placed by a player
   * This is a heuristic - Minecraft doesn't store this information directly
   * @param {Object} block - Block to check
   * @returns {boolean} True if likely player-placed
   */
  isPlayerPlaced(block) {
    if (!block) return false;

    // Heuristics for player-placed blocks:
    // 1. Blocks unnatural for the biome (e.g., cobblestone in plains)
    // 2. Blocks in unnatural formations (straight lines, buildings)
    // 3. Man-made blocks that don't generate naturally

    const manMadeBlocks = new Set([
      'cobblestone',
      'oak_planks',
      'spruce_planks',
      'birch_planks',
      'jungle_planks',
      'acacia_planks',
      'dark_oak_planks',
      'stone_bricks',
      'brick',
      'glass',
      'white_wool',
      'crafting_table',
      'torch',
      'wall_torch',
      'oak_fence',
      'spruce_fence',
      'birch_fence',
      'iron_bars',
      'ladder',
      'bookshelf'
    ]);

    // If it's a clearly man-made block, assume player-placed
    if (manMadeBlocks.has(block.name)) {
      return true;
    }

    // Check for unnatural placement (straight lines, regular patterns)
    if (this.bot && this.hasUnnaturalPattern(block)) {
      return true;
    }

    return false;
  }

  /**
   * Check if block is part of an unnatural (player-made) pattern
   * @param {Object} block - Block to check
   * @returns {boolean} True if unnatural pattern detected
   */
  hasUnnaturalPattern(block) {
    if (!this.bot) return false;

    const pos = block.position;
    let sameBlockCount = 0;
    let checkedBlocks = 0;

    // Check surrounding blocks (3x3x3 cube)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;

          const neighborPos = pos.offset(dx, dy, dz);
          const neighbor = this.bot.blockAt(neighborPos);

          if (neighbor && neighbor.name === block.name) {
            sameBlockCount++;
          }
          checkedBlocks++;
        }
      }
    }

    // If many same blocks clustered together, likely player-made
    // Natural generation is more random
    const ratio = sameBlockCount / checkedBlocks;
    return ratio > 0.3; // >30% same blocks suggests player construction
  }

  /**
   * Log a safety violation
   * @param {SafetyViolation} violation - Violation to log
   */
  logViolation(violation) {
    // Add to violations array (with size limit)
    this.violations.push(violation);
    if (this.violations.length > this.maxViolations) {
      this.violations.shift();
    }

    // Log to file
    logger.warn('[Safety] VIOLATION BLOCKED', {
      action: violation.action,
      reason: violation.reason,
      details: violation.details,
      timestamp: violation.timestamp
    });
  }

  /**
   * Get recent violations
   * @param {number} count - Number of violations to return
   * @returns {Array} Recent violations
   */
  getRecentViolations(count = 10) {
    return this.violations.slice(-count);
  }

  /**
   * Get violation statistics
   * @returns {Object} Violation counts by type
   */
  getStats() {
    const stats = {
      total: this.violations.length,
      byAction: {},
      byReason: {}
    };

    for (const violation of this.violations) {
      stats.byAction[violation.action] = (stats.byAction[violation.action] || 0) + 1;
      stats.byReason[violation.reason] = (stats.byReason[violation.reason] || 0) + 1;
    }

    return stats;
  }

  /**
   * Format position for logging
   * @param {Object} position - Vec3 position
   * @returns {string} Formatted position string
   */
  formatPosition(position) {
    if (!position) return 'unknown';
    return `(${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`;
  }

  /**
   * Wrapper for action execution with safety check
   * @param {Object} action - Action to execute
   * @param {Function} executor - Function to execute if safe
   * @returns {Object} { success: boolean, violation?: SafetyViolation, result?: any }
   */
  async executeSafely(action, executor) {
    const check = this.checkAction(action);

    if (!check.safe) {
      return {
        success: false,
        violation: check.violation
      };
    }

    try {
      const result = await executor();
      return { success: true, result };
    } catch (error) {
      logger.error('[Safety] Action execution failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }
}

// Export both class and singleton instance
module.exports = {
  SafetyManager,
  ActionType,
  SafetyViolation,
  PROTECTED_BLOCKS,
  DANGEROUS_BLOCKS,

  // Default instance (can be used without instantiation)
  createSafetyManager: (bot) => new SafetyManager(bot)
};
