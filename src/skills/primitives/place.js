const { Vec3 } = require('vec3');

module.exports = {
  name: 'place',
  parameters: {
    blockType: 'string',
    position: 'object'
  },

  async execute(params, context) {
    const { bot } = context;
    const { blockType, position } = params;

    if (!bot) {
      return { success: false, error: 'Bot not available in context' };
    }

    if (!blockType) {
      return { success: false, error: 'blockType is required' };
    }

    if (!position || typeof position.x !== 'number' || typeof position.y !== 'number' || typeof position.z !== 'number') {
      return { success: false, error: 'position must be an object with x, y, z properties' };
    }

    try {
      const blockItem = bot.inventory.items().find(item => item.name === blockType);
      
      if (!blockItem) {
        return {
          success: false,
          error: `No "${blockType}" in inventory`
        };
      }

      await bot.equip(blockItem, 'hand');

      const targetPos = new Vec3(position.x, position.y, position.z);
      const referenceBlock = bot.blockAt(targetPos);
      
      if (!referenceBlock) {
        return {
          success: false,
          error: `Cannot find block at position ${position.x}, ${position.y}, ${position.z}`
        };
      }

      const face = new Vec3(0, 1, 0);
      await bot.placeBlock(referenceBlock, face);

      return {
        success: true,
        outcome: {
          placed: true,
          blockType,
          position: {
            x: position.x,
            y: position.y + 1,
            z: position.z
          }
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  expectedOutcome(params) {
    return {
      placed: true,
      blockType: params.blockType,
      position: params.position
    };
  }
};
