module.exports = {
  name: 'collect',
  parameters: {
    itemType: 'string',
    maxDistance: 'number'
  },

  async execute(params, context) {
    const { bot } = context;
    const { itemType, maxDistance = 4 } = params;

    if (!bot) {
      return { success: false, error: 'Bot not available in context' };
    }

    if (!itemType) {
      return { success: false, error: 'itemType is required' };
    }

    if (typeof maxDistance !== 'number' || maxDistance <= 0) {
      return { success: false, error: 'maxDistance must be a positive number' };
    }

    try {
      const item = bot.nearestEntity(entity => {
        return entity.name === itemType && 
               entity.position.distanceTo(bot.entity.position) <= maxDistance;
      });

      if (!item) {
        return {
          success: false,
          error: `Item "${itemType}" not found within ${maxDistance} blocks`
        };
      }

      const startPos = bot.entity.position.clone();
      const distance = startPos.distanceTo(item.position);

      const startCount = bot.inventory.items().filter(i => i.name === itemType).length;

      if (bot.pathfinder) {
        const { goals } = require('mineflayer-pathfinder');
        const goal = new goals.GoalBlock(item.position.x, item.position.y, item.position.z);
        await bot.pathfinder.goto(goal);
      }

      const items = bot.findBlock({
        matching: (block) => block && block.name === itemType,
        maxDistance
      });

      if (items && bot.collectBlock) {
        await bot.collectBlock.collect(items);
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      const endCount = bot.inventory.items().filter(i => i.name === itemType).length;
      const collected = endCount - startCount;

      return {
        success: true,
        outcome: {
          collected: collected > 0,
          itemType,
          count: Math.max(0, collected),
          distance: Math.round(distance * 100) / 100
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  expectedOutcome(params) {
    return {
      collected: true,
      itemType: params.itemType,
      maxDistance: params.maxDistance
    };
  }
};
