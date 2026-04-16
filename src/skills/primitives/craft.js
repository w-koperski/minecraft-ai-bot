module.exports = {
  name: 'craft',
  parameters: {
    itemName: 'string',
    count: 'number'
  },

  async execute(params, context) {
    const { bot } = context;
    const { itemName, count = 1 } = params;

    if (!bot) {
      return { success: false, error: 'Bot not available in context' };
    }

    if (!itemName) {
      return { success: false, error: 'itemName is required' };
    }

    if (typeof count !== 'number' || count <= 0) {
      return { success: false, error: 'count must be a positive number' };
    }

    try {
      const item = bot.inventory.items().find(i => i.name === itemName);
      
      if (item && item.stackSize >= count) {
        return {
          success: false,
          error: `Already have ${item.stackSize} ${itemName} in inventory`
        };
      }

      const recipes = bot.recipesFor(itemName, null, true, null);
      
      if (!recipes || recipes.length === 0) {
        return {
          success: false,
          error: `No crafting recipe found for "${itemName}"`
        };
      }

      const recipe = recipes[0];
      
      const canCraft = bot.inventory.count(recipe.id || 0) >= count;
      if (!canCraft) {
        const missing = count - (bot.inventory.count(recipe.id || 0));
        return {
          success: false,
          error: `Insufficient materials to craft ${count} ${itemName}. Missing ${missing} items.`
        };
      }

      const startCount = bot.inventory.items().filter(i => i.name === itemName).length;
      
      await bot.craft(recipe, count);
      
      const endCount = bot.inventory.items().filter(i => i.name === itemName).length;
      const actualCrafted = endCount - startCount;

      return {
        success: true,
        outcome: {
          crafted: true,
          itemName,
          requestedCount: count,
          actualCount: actualCrafted,
          recipeId: recipe.id
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  expectedOutcome(params) {
    return {
      crafted: true,
      itemName: params.itemName,
      count: params.count || 1
    };
  }
};
