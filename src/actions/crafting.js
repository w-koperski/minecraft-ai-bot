/**
 * Crafting System for Minecraft AI Bot
 * 
 * Handles recipe-based crafting with:
 * - Inventory checking for required materials
 * - Crafting table detection and usage
 * - Resource gathering via mineflayer-collectblock
 * - Success/failure reporting with detailed reasons
 * 
 * @module actions/crafting
 */

'use strict';

const logger = require('../utils/logger');
const { ActionError } = require('../utils/errors');

/**
 * Recipe definitions for basic Minecraft items
 * Each recipe specifies:
 * - name: Display name
 * - itemId: Minecraft item ID (e.g., 'oak_planks')
 * - outputCount: Number of items produced
 * - requiresCraftingTable: Whether crafting table is needed
 * - ingredients: Array of { itemId, count } required
 */
const RECIPES = {
  // Basic wood processing (2x2 grid - no crafting table needed)
  wooden_planks: {
    name: 'Wooden Planks',
    itemId: 'oak_planks',
    outputCount: 4,
    requiresCraftingTable: false,
    ingredients: [
      { itemId: 'oak_log', count: 1 }
    ],
    // Alternative wood types
    alternatives: [
      { itemId: 'birch_log', output: 'birch_planks' },
      { itemId: 'spruce_log', output: 'spruce_planks' },
      { itemId: 'jungle_log', output: 'jungle_planks' },
      { itemId: 'acacia_log', output: 'acacia_planks' },
      { itemId: 'dark_oak_log', output: 'dark_oak_planks' }
    ]
  },
  
  sticks: {
    name: 'Sticks',
    itemId: 'stick',
    outputCount: 4,
    requiresCraftingTable: false,
    ingredients: [
      { itemId: 'oak_planks', count: 2 }
    ],
    alternatives: [
      { itemId: 'birch_planks' },
      { itemId: 'spruce_planks' },
      { itemId: 'jungle_planks' },
      { itemId: 'acacia_planks' },
      { itemId: 'dark_oak_planks' }
    ]
  },
  
  // Crafting table (2x2 grid)
  crafting_table: {
    name: 'Crafting Table',
    itemId: 'crafting_table',
    outputCount: 1,
    requiresCraftingTable: false,
    ingredients: [
      { itemId: 'oak_planks', count: 4 }
    ],
    alternatives: [
      { itemId: 'birch_planks' },
      { itemId: 'spruce_planks' },
      { itemId: 'jungle_planks' },
      { itemId: 'acacia_planks' },
      { itemId: 'dark_oak_planks' }
    ]
  },
  
  // Tools (3x3 grid - crafting table required)
  wooden_pickaxe: {
    name: 'Wooden Pickaxe',
    itemId: 'wooden_pickaxe',
    outputCount: 1,
    requiresCraftingTable: true,
    ingredients: [
      { itemId: 'oak_planks', count: 3 },
      { itemId: 'stick', count: 2 }
    ]
  },
  
  stone_pickaxe: {
    name: 'Stone Pickaxe',
    itemId: 'stone_pickaxe',
    outputCount: 1,
    requiresCraftingTable: true,
    ingredients: [
      { itemId: 'cobblestone', count: 3 },
      { itemId: 'stick', count: 2 }
    ]
  },
  
  furnace: {
    name: 'Furnace',
    itemId: 'furnace',
    outputCount: 1,
    requiresCraftingTable: true,
    ingredients: [
      { itemId: 'cobblestone', count: 8 }
    ]
  }
};

/**
 * Crafting system class
 */
class CraftingSystem {
  /**
   * @param {Object} bot - Mineflayer bot instance
   */
  constructor(bot) {
    this.bot = bot;
    this.craftingTableBlock = null;
    this.collectBlock = null;
  }

  /**
   * Initialize the collectblock plugin reference
   * @param {Object} collectBlock - mineflayer-collectblock instance
   */
  setCollectBlock(collectBlock) {
    this.collectBlock = collectBlock;
  }

  /**
   * Check if bot has required items in inventory
   * @param {string} itemId - Minecraft item ID
   * @param {number} count - Required count
   * @returns {Object} { hasEnough: boolean, currentCount: number, missingCount: number }
   */
  hasItem(itemId, count = 1) {
    const items = this.bot.inventory.items().filter(item => item.name === itemId);
    const currentCount = items.reduce((sum, item) => sum + item.count, 0);
    
    return {
      hasEnough: currentCount >= count,
      currentCount,
      missingCount: Math.max(0, count - currentCount)
    };
  }

  /**
   * Check if bot has all ingredients for a recipe
   * @param {string} recipeKey - Recipe key from RECIPES
   * @returns {Object} { canCraft: boolean, missing: Array, hasIngredients: boolean }
   */
  checkIngredients(recipeKey) {
    const recipe = RECIPES[recipeKey];
    if (!recipe) {
      return {
        canCraft: false,
        missing: [],
        hasIngredients: false,
        reason: `Unknown recipe: ${recipeKey}`
      };
    }

    const missing = [];
    let hasIngredients = true;

    for (const ingredient of recipe.ingredients) {
      const check = this.hasItem(ingredient.itemId, ingredient.count);
      if (!check.hasEnough) {
        hasIngredients = false;
        missing.push({
          itemId: ingredient.itemId,
          required: ingredient.count,
          current: check.currentCount,
          missing: check.missingCount
        });
      }
    }

    return {
      canCraft: hasIngredients,
      missing,
      hasIngredients,
      recipe
    };
  }

  /**
   * Find a crafting table near the bot
   * @param {number} maxDistance - Maximum search distance (default: 4)
   * @returns {Object|null} Block object or null if not found
   */
  findCraftingTable(maxDistance = 4) {
    const craftingTable = this.bot.findBlock({
      matching: (block) => block.name === 'crafting_table',
      maxDistance
    });

    return craftingTable;
  }

  /**
   * Find crafting table within interaction range
   * @returns {Object} { found: boolean, block: Block|null, distance: number }
   */
  findNearestCraftingTable() {
    const table = this.findCraftingTable(4);
    if (!table) {
      return { found: false, block: null, distance: Infinity };
    }

    const distance = this.bot.entity.position.distanceTo(table.position);
    return { found: true, block: table, distance };
  }

  /**
   * Gather resources using mineflayer-collectblock
   * @param {string} itemId - Item ID to gather
   * @param {number} count - Number to gather
   * @returns {Promise<Object>} { success: boolean, gathered: number, reason?: string }
   */
  async gatherResource(itemId, count = 1) {
    if (!this.collectBlock) {
      return {
        success: false,
        gathered: 0,
        reason: 'collectblock plugin not initialized'
      };
    }

    try {
      const mcData = require('minecraft-data')(this.bot.version);
      const item = mcData.itemsByName[itemId];
      
      if (!item) {
        return {
          success: false,
          gathered: 0,
          reason: `Unknown item: ${itemId}`
        };
      }

      logger.info(`Gathering ${count}x ${itemId}...`);

      // Find blocks that drop this item
      const blockToBreak = this.findBlockDroppingItem(itemId);
      if (!blockToBreak) {
        return {
          success: false,
          gathered: 0,
          reason: `No blocks found that drop ${itemId}`
        };
      }

      // Use collectblock to gather
      const targets = [];
      let gathered = 0;

      for (let i = 0; i < count; i++) {
        const block = this.bot.findBlock({
          matching: (b) => b.name === blockToBreak,
          maxDistance: 32
        });

        if (block) {
          targets.push(this.collectBlock.collect(block));
        }
      }

      await Promise.all(targets);
      
      // Verify we got the items
      const afterCheck = this.hasItem(itemId, count);
      
      return {
        success: afterCheck.hasEnough,
        gathered: afterCheck.currentCount,
        reason: afterCheck.hasEnough ? 'Successfully gathered' : `Only gathered ${afterCheck.currentCount}/${count}`
      };

    } catch (error) {
      logger.error('Failed to gather resource', { itemId, error: error.message });
      return {
        success: false,
        gathered: 0,
        reason: error.message
      };
    }
  }

  /**
   * Find block type that drops a specific item
   * @param {string} itemId - Item ID
   * @returns {string|null} Block name or null
   */
  findBlockDroppingItem(itemId) {
    const drops = {
      'oak_log': 'oak_log',
      'birch_log': 'birch_log',
      'spruce_log': 'spruce_log',
      'jungle_log': 'jungle_log',
      'acacia_log': 'acacia_log',
      'dark_oak_log': 'dark_oak_log',
      'cobblestone': 'stone',
      'crafting_table': 'crafting_table',
      'oak_planks': null, // Crafted, not mined
      'stick': null,      // Crafted, not mined
    };

    return drops[itemId] || null;
  }

  /**
   * Craft an item using a recipe
   * @param {string} recipeKey - Recipe key from RECIPES
   * @param {number} count - Number to craft (default: 1)
   * @returns {Promise<Object>} { success: boolean, crafted?: number, reason: string }
   */
  async craft(recipeKey, count = 1) {
    logger.info(`Attempting to craft ${count}x ${recipeKey}`);

    // Validate recipe exists
    const recipe = RECIPES[recipeKey];
    if (!recipe) {
      return {
        success: false,
        reason: `Unknown recipe: ${recipeKey}`
      };
    }

    // Check ingredients
    const ingredientCheck = this.checkIngredients(recipeKey);
    if (!ingredientCheck.canCraft) {
      const missingList = ingredientCheck.missing
        .map(m => `${m.missingCount}x ${m.itemId}`)
        .join(', ');
      
      return {
        success: false,
        reason: `Missing ingredients: ${missingList}`,
        missing: ingredientCheck.missing
      };
    }

    // Check crafting table requirement
    if (recipe.requiresCraftingTable) {
      const tableCheck = this.findNearestCraftingTable();
      
      if (!tableCheck.found) {
        return {
          success: false,
          reason: 'Recipe requires crafting table, but none found nearby',
          requiresCraftingTable: true
        };
      }

      this.craftingTableBlock = tableCheck.block;
    }

    try {
      // Get the recipe from Mineflayer
      const mcData = require('minecraft-data')(this.bot.version);
      const itemData = mcData.itemsByName[recipe.itemId];
      
      if (!itemData) {
        return {
          success: false,
          reason: `Unknown item in Minecraft data: ${recipe.itemId}`
        };
      }

      // Find all matching recipes
      const recipes = this.bot.recipesFor(itemData.id, null, null, this.craftingTableBlock);
      
      if (recipes.length === 0) {
        return {
          success: false,
          reason: `No valid recipe found for ${recipe.name}`
        };
      }

      // Use the first valid recipe
      const selectedRecipe = recipes[0];
      
      // Craft the item
      await this.bot.craft(selectedRecipe, count, this.craftingTableBlock);

      // Verify crafting succeeded
      await this._wait(500);
      
      const check = this.hasItem(recipe.itemId, recipe.outputCount * count);
      
      if (check.hasEnough) {
        logger.info(`Successfully crafted ${count}x ${recipe.name}`);
        
        return {
          success: true,
          crafted: count,
          itemId: recipe.itemId,
          outputCount: recipe.outputCount * count,
          reason: `Successfully crafted ${count}x ${recipe.name}`
        };
      } else {
        // Crafting might have partially succeeded
        return {
          success: false,
          reason: `Crafting verification failed. Expected ${recipe.outputCount * count}, have ${check.currentCount}`,
          partialSuccess: check.currentCount > 0
        };
      }

    } catch (error) {
      logger.error('Crafting failed', { 
        recipe: recipeKey, 
        error: error.message,
        stack: error.stack 
      });
      
      return {
        success: false,
        reason: `Crafting error: ${error.message}`,
        error: error.message
      };
    } finally {
      this.craftingTableBlock = null;
    }
  }

  /**
   * Craft an item, gathering missing resources first
   * @param {string} recipeKey - Recipe key from RECIPES
   * @param {number} count - Number to craft (default: 1)
   * @returns {Promise<Object>} { success: boolean, crafted?: number, reason: string }
   */
  async craftWithGathering(recipeKey, count = 1) {
    logger.info(`Crafting ${recipeKey} with auto-gathering`);

    // Check current ingredients
    const check = this.checkIngredients(recipeKey);
    
    if (!check.canCraft) {
      // Try to gather missing ingredients
      for (const missing of check.missing) {
        const gatherResult = await this.gatherResource(missing.itemId, missing.missingCount);
        
        if (!gatherResult.success) {
          return {
            success: false,
            reason: `Failed to gather ${missing.itemId}: ${gatherResult.reason}`
          };
        }
      }

      // Re-check after gathering
      const recheck = this.checkIngredients(recipeKey);
      if (!recheck.canCraft) {
        return {
          success: false,
          reason: 'Still missing ingredients after gathering attempt'
        };
      }
    }

    // Now craft
    return await this.craft(recipeKey, count);
  }

  /**
   * Get list of all available recipes
   * @returns {Array} Array of recipe keys
   */
  getAvailableRecipes() {
    return Object.keys(RECIPES);
  }

  /**
   * Get recipe details
   * @param {string} recipeKey - Recipe key
   * @returns {Object|null} Recipe object or null
   */
  getRecipe(recipeKey) {
    return RECIPES[recipeKey] || null;
  }

  /**
   * Check what can be crafted with current inventory
   * @returns {Array} Array of craftable recipe keys
   */
  getCraftableRecipes() {
    const craftable = [];
    
    for (const key of Object.keys(RECIPES)) {
      const check = this.checkIngredients(key);
      
      if (check.canCraft) {
        // Also check crafting table requirement
        const recipe = RECIPES[key];
        if (recipe.requiresCraftingTable) {
          const tableCheck = this.findNearestCraftingTable();
          if (tableCheck.found) {
            craftable.push(key);
          }
        } else {
          craftable.push(key);
        }
      }
    }
    
    return craftable;
  }

  /**
   * Helper: wait for specified milliseconds
   * @param {number} ms - Milliseconds to wait
   * @returns {Promise<void>}
   */
  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export both class and recipes for flexibility
module.exports = {
  CraftingSystem,
  RECIPES,
  /**
   * Convenience function to create crafting system
   * @param {Object} bot - Mineflayer bot instance
   * @returns {CraftingSystem} New crafting system instance
   */
  create: (bot) => new CraftingSystem(bot)
};
