const { Block } = require('prismarine-block');

module.exports = {
  name: 'dig',
  parameters: {
    blockType: 'string',
    maxDistance: 'number'
  },

  async execute(params, context) {
    const { bot } = context;
    const { blockType, maxDistance = 4 } = params;

    if (!bot) {
      return { success: false, error: 'Bot not available in context' };
    }

    if (!blockType) {
      return { success: false, error: 'blockType is required' };
    }

    if (typeof maxDistance !== 'number' || maxDistance <= 0) {
      return { success: false, error: 'maxDistance must be a positive number' };
    }

    try {
      const block = bot.findBlock({
        matching: (block) => block && block.name === blockType,
        maxDistance
      });

      if (!block) {
        return {
          success: false,
          error: `Block "${blockType}" not found within ${maxDistance} blocks`
        };
      }

      const distance = bot.entity.position.distanceTo(block.position);
      
      await bot.dig(block);

      return {
        success: true,
        outcome: {
          dug: true,
          blockType: block.name,
          position: {
            x: block.position.x,
            y: block.position.y,
            z: block.position.z
          },
          distance: Math.round(distance * 100) / 100
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  expectedOutcome(params) {
    return {
      dug: true,
      blockType: params.blockType,
      maxDistance: params.maxDistance
    };
  }
};
