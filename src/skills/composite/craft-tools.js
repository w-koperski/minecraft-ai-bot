module.exports = {
  name: 'craft_tools',
  parameters: {
    toolName: 'string',
    quantity: 'number'
  },

  async execute(params, context) {
    const { bot, registry } = context;
    const { toolName, quantity = 1 } = params;
    const steps = [];
    const startTime = Date.now();

    const validTools = [
      'wooden_pickaxe', 'wooden_axe', 'wooden_sword', 'wooden_shovel', 'wooden_hoe',
      'stone_pickaxe', 'stone_axe', 'stone_sword', 'stone_shovel', 'stone_hoe',
      'iron_pickaxe', 'iron_axe', 'iron_sword', 'iron_shovel', 'iron_hoe'
    ];
    if (!toolName || !validTools.includes(toolName)) {
      return {
        success: false,
        error: `Invalid toolName: ${toolName}. Must be one of: ${validTools.join(', ')}`,
        steps,
        outcome: { crafted: 0 }
      };
    }

    if (typeof quantity !== 'number' || quantity <= 0) {
      return {
        success: false,
        error: 'quantity must be a positive number',
        steps,
        outcome: { crafted: 0 }
      };
    }

    try {
      const checkStart = Date.now();
      const existingTools = bot.inventory.items().filter(i => i.name === toolName);
      const existingCount = existingTools.reduce((sum, item) => sum + item.count, 0);

      steps.push({
        step: 1,
        action: 'check_inventory',
        success: true,
        result: { toolName, existing: existingCount },
        duration: Date.now() - checkStart
      });

      const craftStart = Date.now();
      const craftResult = await registry.execute('craft', {
        itemName: toolName,
        count: quantity
      }, context);

      steps.push({
        step: 2,
        action: 'craft_item',
        success: craftResult.success,
        result: craftResult.outcome || craftResult,
        duration: Date.now() - craftStart
      });

      if (!craftResult.success) {
        return {
          success: false,
          reason: craftResult.error || 'crafting_failed',
          steps,
          outcome: { toolName, crafted: 0, requested: quantity }
        };
      }

      const verifyStart = Date.now();
      await new Promise(resolve => setTimeout(resolve, 200));

      const finalTools = bot.inventory.items().filter(i => i.name === toolName);
      const finalCount = finalTools.reduce((sum, item) => sum + item.count, 0);
      const actualCrafted = finalCount - existingCount;

      steps.push({
        step: 3,
        action: 'verify_crafted',
        success: actualCrafted > 0,
        result: { toolName, crafted: actualCrafted, requested: quantity },
        duration: Date.now() - verifyStart
      });

      return {
        success: actualCrafted >= quantity,
        steps,
        outcome: {
          toolName,
          crafted: actualCrafted,
          requested: quantity,
          partialSuccess: actualCrafted > 0 && actualCrafted < quantity
        },
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        steps,
        outcome: { toolName, crafted: 0, requested: quantity }
      };
    }
  },

  expectedOutcome(params) {
    return {
      crafted: params.quantity || 1,
      toolName: params.toolName
    };
  }
};
