/**
 * Building Actions Module
 * Handles placing blocks and building structures with validation
 */

const logger = require('../utils/logger');
const { ActionError } = require('../utils/errors');
const { Vec3 } = require('vec3');

/**
 * Building Actions Manager
 * Provides block placement and structure building capabilities
 */
class BuildingActions {
  constructor(bot) {
    this.bot = bot;
  }

  /**
   * Check if a position is valid for placing a block
   * @param {Vec3} position - Target position
   * @returns {Object} - { valid: boolean, reason: string }
   */
  isValidBuildPosition(position) {
    try {
      // Check if position is within world bounds
      if (position.y < 0 || position.y > 255) {
        return { valid: false, reason: 'Position out of world bounds' };
      }

      // Check if position is already occupied
      const blockAtPos = this.bot.blockAt(position);
      if (blockAtPos && blockAtPos.type !== 0) {
        return { valid: false, reason: 'Position already occupied' };
      }

      // Check if position is reachable (has adjacent block to stand on or place against)
      const adjacentPositions = [
        position.offset(1, 0, 0),
        position.offset(-1, 0, 0),
        position.offset(0, 1, 0),
        position.offset(0, -1, 0),
        position.offset(0, 0, 1),
        position.offset(0, 0, -1),
      ];

      const hasAdjacentBlock = adjacentPositions.some(pos => {
        const block = this.bot.blockAt(pos);
        return block && block.type !== 0;
      });

      if (!hasAdjacentBlock) {
        return { valid: false, reason: 'No adjacent block to place against' };
      }

      return { valid: true, reason: 'Position valid for building' };
    } catch (error) {
      logger.error('Error validating build position', { position, error: error.message });
      return { valid: false, reason: `Validation error: ${error.message}` };
    }
  }

  /**
   * Navigate to a position near the build location
   * @param {Vec3} targetPos - Target build position
   * @param {number} distance - Distance to stand from target (default: 2)
   * @returns {Promise<Object>} - { success: boolean, reason: string }
   */
  async navigateToBuildPosition(targetPos, distance = 2) {
    try {
      // Find valid standing positions around the target
      const standingPositions = [
        targetPos.offset(1, 0, 0),
        targetPos.offset(-1, 0, 0),
        targetPos.offset(0, 0, 1),
        targetPos.offset(0, 0, -1),
        targetPos.offset(1, 0, 1),
        targetPos.offset(1, 0, -1),
        targetPos.offset(-1, 0, 1),
        targetPos.offset(-1, 0, -1),
      ];

      // Check if pathfinder is available
      if (!this.bot.pathfinder) {
        logger.warn('Pathfinder not available, attempting direct approach');
        return { success: false, reason: 'Pathfinder not available' };
      }

      const { goals } = require('mineflayer-pathfinder');
      
      // Try each standing position
      for (const standingPos of standingPositions) {
        const blockAtStanding = this.bot.blockAt(standingPos.offset(0, -1, 0));
        
        // Check if there's solid ground to stand on
        if (!blockAtStanding || blockAtStanding.type === 0) {
          continue;
        }

        // Check if standing position is clear
        const standingBlock = this.bot.blockAt(standingPos);
        const standingBlockAbove = this.bot.blockAt(standingPos.offset(0, 1, 0));
        
        if (standingBlock && standingBlock.type !== 0) continue;
        if (standingBlockAbove && standingBlockAbove.type !== 0) continue;

        // Navigate to standing position
        try {
          const goal = new goals.GoalNear(standingPos.x, standingPos.y, standingPos.z, 1);
          
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              this.bot.pathfinder.stop();
              reject(new Error('Pathfinding timeout'));
            }, 30000);

            this.bot.pathfinder.goto(goal, (err) => {
              clearTimeout(timeout);
              if (err) reject(err);
              else resolve();
            });
          });

          logger.debug('Navigated to build position', { standingPos });
          return { success: true, reason: 'Successfully navigated' };
        } catch (pathError) {
          logger.debug('Failed to navigate to position', { standingPos, error: pathError.message });
          continue;
        }
      }

      return { success: false, reason: 'No reachable standing position found' };
    } catch (error) {
      logger.error('Navigation error', { targetPos, error: error.message });
      return { success: false, reason: `Navigation error: ${error.message}` };
    }
  }

  /**
   * Place a block at specified position
   * @param {Vec3} position - Target position
   * @param {string} blockType - Block type to place
   * @returns {Promise<Object>} - { success: boolean, reason: string, position: Vec3 }
   */
  async placeBlock(position, blockType) {
    try {
      const pos = position instanceof Vec3 ? position : new Vec3(position.x, position.y, position.z);
      
      // Validate position
      const validation = this.isValidBuildPosition(pos);
      if (!validation.valid) {
        logger.warn('Invalid build position', { position: pos, reason: validation.reason });
        return { success: false, reason: validation.reason, position: pos };
      }

      // Check if we have the block in inventory
      const item = this.bot.inventory.items().find(i => i.name === blockType);
      if (!item) {
        logger.warn('Block not in inventory', { blockType });
        return { success: false, reason: `Block type ${blockType} not in inventory`, position: pos };
      }

      // Navigate to build position if too far
      const distanceToPos = this.bot.entity.position.distanceTo(pos);
      if (distanceToPos > 4) {
        const navResult = await this.navigateToBuildPosition(pos);
        if (!navResult.success) {
          return { success: false, reason: navResult.reason, position: pos };
        }
      }

      // Find reference block to place against
      const referenceVectors = [
        new Vec3(1, 0, 0),
        new Vec3(-1, 0, 0),
        new Vec3(0, 1, 0),
        new Vec3(0, -1, 0),
        new Vec3(0, 0, 1),
        new Vec3(0, 0, -1),
      ];

      let referenceBlock = null;
      let faceVector = null;

      for (const vec of referenceVectors) {
        const checkPos = pos.offset(vec.x, vec.y, vec.z);
        const block = this.bot.blockAt(checkPos);
        if (block && block.type !== 0) {
          referenceBlock = block;
          faceVector = vec.scaled(-1); // Opposite direction
          break;
        }
      }

      if (!referenceBlock) {
        return { success: false, reason: 'No reference block found', position: pos };
      }

      // Equip the block
      await this.bot.equipItem(item, 'hand');

      // Place the block
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Place block timeout'));
        }, 10000);

        this.bot.placeBlock(referenceBlock, faceVector, (err) => {
          clearTimeout(timeout);
          if (err) reject(err);
          else resolve();
        });
      });

      logger.info('Block placed successfully', { blockType, position: pos });
      return { success: true, reason: 'Block placed', position: pos };
    } catch (error) {
      logger.error('Place block failed', { blockType, position, error: error.message });
      return { 
        success: false, 
        reason: `Placement failed: ${error.message}`,
        position 
      };
    }
  }

  /**
   * Build a wall of specified dimensions
   * @param {Vec3} startPos - Starting position (corner)
   * @param {number} width - Wall width
   * @param {number} height - Wall height
   * @param {string} blockType - Block type to use
   * @param {string} direction - 'north', 'south', 'east', 'west'
   * @returns {Promise<Object>} - { success: boolean, reason: string, blocksPlaced: number }
   */
  async buildWall(startPos, width, height, blockType, direction = 'north') {
    const result = {
      success: true,
      reason: 'Wall construction started',
      blocksPlaced: 0,
      failedPositions: [],
    };

    try {
      const pos = startPos instanceof Vec3 ? startPos : new Vec3(startPos.x, startPos.y, startPos.z);
      
      // Direction vectors
      const directions = {
        north: new Vec3(0, 0, -1),
        south: new Vec3(0, 0, 1),
        east: new Vec3(1, 0, 0),
        west: new Vec3(-1, 0, 0),
      };

      const dirVec = directions[direction] || directions.north;

      // Build wall layer by layer
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const blockPos = pos.offset(dirVec.x * x, y, dirVec.z * x);
          
          const placeResult = await this.placeBlock(blockPos, blockType);
          
          if (placeResult.success) {
            result.blocksPlaced++;
          } else {
            result.failedPositions.push({ position: blockPos, reason: placeResult.reason });
            result.success = false;
          }
        }
      }

      if (result.success) {
        result.reason = `Wall built successfully: ${result.blocksPlaced} blocks placed`;
      } else {
        result.reason = `Wall partially built: ${result.blocksPlaced}/${width * height} blocks, ${result.failedPositions.length} failures`;
      }

      logger.info('Wall construction complete', { result });
      return result;
    } catch (error) {
      logger.error('Wall construction failed', { error: error.message });
      return { 
        success: false, 
        reason: `Construction error: ${error.message}`,
        blocksPlaced: result.blocksPlaced,
        failedPositions: result.failedPositions,
      };
    }
  }

  /**
   * Build a floor of specified dimensions
   * @param {Vec3} startPos - Starting position (corner)
   * @param {number} width - Floor width
   * @param {number} length - Floor length
   * @param {string} blockType - Block type to use
   * @returns {Promise<Object>} - { success: boolean, reason: string, blocksPlaced: number }
   */
  async buildFloor(startPos, width, length, blockType) {
    const result = {
      success: true,
      reason: 'Floor construction started',
      blocksPlaced: 0,
      failedPositions: [],
    };

    try {
      const pos = startPos instanceof Vec3 ? startPos : new Vec3(startPos.x, startPos.y, startPos.z);

      // Build floor row by row
      for (let x = 0; x < width; x++) {
        for (let z = 0; z < length; z++) {
          const blockPos = pos.offset(x, 0, z);
          
          const placeResult = await this.placeBlock(blockPos, blockType);
          
          if (placeResult.success) {
            result.blocksPlaced++;
          } else {
            result.failedPositions.push({ position: blockPos, reason: placeResult.reason });
            result.success = false;
          }
        }
      }

      if (result.success) {
        result.reason = `Floor built successfully: ${result.blocksPlaced} blocks placed`;
      } else {
        result.reason = `Floor partially built: ${result.blocksPlaced}/${width * length} blocks, ${result.failedPositions.length} failures`;
      }

      logger.info('Floor construction complete', { result });
      return result;
    } catch (error) {
      logger.error('Floor construction failed', { error: error.message });
      return { 
        success: false, 
        reason: `Construction error: ${error.message}`,
        blocksPlaced: result.blocksPlaced,
        failedPositions: result.failedPositions,
      };
    }
  }

  /**
   * Build a pillar of specified height
   * @param {Vec3} startPos - Starting position (base)
   * @param {number} height - Pillar height
   * @param {string} blockType - Block type to use
   * @returns {Promise<Object>} - { success: boolean, reason: string, blocksPlaced: number }
   */
  async buildPillar(startPos, height, blockType) {
    const result = {
      success: true,
      reason: 'Pillar construction started',
      blocksPlaced: 0,
      failedPositions: [],
    };

    try {
      const pos = startPos instanceof Vec3 ? startPos : new Vec3(startPos.x, startPos.y, startPos.z);

      // Build pillar from bottom to top
      for (let y = 0; y < height; y++) {
        const blockPos = pos.offset(0, y, 0);
        
        const placeResult = await this.placeBlock(blockPos, blockType);
        
        if (placeResult.success) {
          result.blocksPlaced++;
        } else {
          result.failedPositions.push({ position: blockPos, reason: placeResult.reason });
          result.success = false;
          break; // Stop if we can't continue building upward
        }
      }

      if (result.success) {
        result.reason = `Pillar built successfully: ${result.blocksPlaced} blocks placed`;
      } else {
        result.reason = `Pillar partially built: ${result.blocksPlaced}/${height} blocks`;
      }

      logger.info('Pillar construction complete', { result });
      return result;
    } catch (error) {
      logger.error('Pillar construction failed', { error: error.message });
      return { 
        success: false, 
        reason: `Construction error: ${error.message}`,
        blocksPlaced: result.blocksPlaced,
        failedPositions: result.failedPositions,
      };
    }
  }

  /**
   * Build a simple house (4x4x3)
   * @param {Vec3} startPos - Starting position (corner)
   * @param {string} wallBlock - Block type for walls
   * @param {string} floorBlock - Block type for floor (optional)
   * @returns {Promise<Object>} - { success: boolean, reason: string, blocksPlaced: number }
   */
  async buildHouse(startPos, wallBlock, floorBlock = null) {
    const result = {
      success: true,
      reason: 'House construction started',
      blocksPlaced: 0,
      failedPositions: [],
      structures: {},
    };

    try {
      const pos = startPos instanceof Vec3 ? startPos : new Vec3(startPos.x, startPos.y, startPos.z);

      logger.info('Starting house construction', { startPos: pos, wallBlock, floorBlock });

      // Build floor (if specified)
      if (floorBlock) {
        const floorResult = await this.buildFloor(pos, 4, 4, floorBlock);
        result.structures.floor = floorResult;
        result.blocksPlaced += floorResult.blocksPlaced;
        if (!floorResult.success) {
          result.failedPositions.push(...floorResult.failedPositions);
        }
      }

      // Build 4 walls
      const wallConfigs = [
        { direction: 'north', width: 4, height: 3 },
        { direction: 'south', width: 4, height: 3 },
        { direction: 'east', width: 4, height: 3 },
        { direction: 'west', width: 4, height: 3 },
      ];

      for (const config of wallConfigs) {
        let wallStartPos;
        
        // Calculate wall start position based on direction
        switch (config.direction) {
          case 'north':
            wallStartPos = pos.offset(0, 1, 0);
            break;
          case 'south':
            wallStartPos = pos.offset(0, 1, 3);
            break;
          case 'east':
            wallStartPos = pos.offset(3, 1, 0);
            break;
          case 'west':
            wallStartPos = pos.offset(0, 1, 0);
            break;
        }

        const wallResult = await this.buildWall(
          wallStartPos,
          config.width,
          config.height,
          wallBlock,
          config.direction
        );

        result.structures[`wall_${config.direction}`] = wallResult;
        result.blocksPlaced += wallResult.blocksPlaced;
        
        if (!wallResult.success) {
          result.failedPositions.push(...wallResult.failedPositions);
          result.success = false;
        }
      }

      // Summary
      const totalBlocks = floorBlock ? 16 + 48 : 48; // Floor (4x4) + 4 walls (4x3 each)
      
      if (result.success) {
        result.reason = `House built successfully: ${result.blocksPlaced} blocks placed`;
      } else {
        result.reason = `House partially built: ${result.blocksPlaced}/${totalBlocks} blocks, ${result.failedPositions.length} failures`;
      }

      logger.info('House construction complete', { result });
      return result;
    } catch (error) {
      logger.error('House construction failed', { error: error.message });
      return { 
        success: false, 
        reason: `Construction error: ${error.message}`,
        blocksPlaced: result.blocksPlaced,
        failedPositions: result.failedPositions,
      };
    }
  }

  /**
   * Get required blocks for a structure
   * @param {string} structureType - 'wall', 'floor', 'pillar', 'house'
   * @param {Object} dimensions - Structure dimensions
   * @returns {Object} - Block count and types needed
   */
  getStructureRequirements(structureType, dimensions) {
    switch (structureType) {
      case 'wall':
        return { blocks: dimensions.width * dimensions.height, type: 'wall_block' };
      
      case 'floor':
        return { blocks: dimensions.width * dimensions.length, type: 'floor_block' };
      
      case 'pillar':
        return { blocks: dimensions.height, type: 'pillar_block' };
      
      case 'house':
        // 4x4x3 house: floor (optional) + 4 walls
        const floorBlocks = dimensions.includeFloor ? 16 : 0;
        const wallBlocks = 48; // 4 walls, each 4x3
        return { 
          blocks: floorBlocks + wallBlocks,
          floorBlocks,
          wallBlocks,
        };
      
      default:
        return { blocks: 0, type: 'unknown' };
    }
  }

  /**
   * Check if bot has enough blocks to build structure
   * @param {string} blockType - Block type to check
   * @param {number} required - Required count
   * @returns {Object} - { hasEnough: boolean, available: number, required: number }
   */
  checkBlockInventory(blockType, required) {
    const items = this.bot.inventory.items().filter(i => i.name === blockType);
    const available = items.reduce((sum, item) => sum + item.count, 0);
    
    return {
      hasEnough: available >= required,
      available,
      required,
    };
  }
}

module.exports = BuildingActions;
