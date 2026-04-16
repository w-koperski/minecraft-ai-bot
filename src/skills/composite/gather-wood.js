/**
 * Composite skill: gather_wood
 * Chains primitives to find and collect wood logs
 * Steps: find_tree -> dig_logs (loop) -> collect_items
 */

module.exports = {
  name: 'gather_wood',
  parameters: {
    woodType: 'string', // oak, birch, spruce, jungle, acacia, dark_oak
    quantity: 'number'  // logs to collect
  },

  async execute(params, context) {
    const { bot, registry } = context;
    const { woodType = 'oak', quantity = 10 } = params;
    const steps = [];
    const startTime = Date.now();

    // Validate parameters
    const validWoodTypes = ['oak', 'birch', 'spruce', 'jungle', 'acacia', 'dark_oak'];
    if (!validWoodTypes.includes(woodType)) {
      return {
        success: false,
        error: `Invalid woodType: ${woodType}. Must be one of: ${validWoodTypes.join(', ')}`,
        steps,
        outcome: { collected: 0 }
      };
    }

    if (typeof quantity !== 'number' || quantity <= 0) {
      return {
        success: false,
        error: 'quantity must be a positive number',
        steps,
        outcome: { collected: 0 }
      };
    }

    try {
      // Step 1: Find tree
      const findStart = Date.now();
      const treeBlock = bot.findBlock({
        matching: (block) => block && block.name === `${woodType}_log`,
        maxDistance: 32
      });

      if (!treeBlock) {
        steps.push({
          step: 1,
          action: 'find_tree',
          success: false,
          result: { found: false, reason: `No ${woodType}_log found within 32 blocks` },
          duration: Date.now() - findStart
        });
        return {
          success: false,
          reason: 'no_tree_found',
          steps,
          outcome: { woodType, collected: 0, requested: quantity }
        };
      }

      steps.push({
        step: 1,
        action: 'find_tree',
        success: true,
        result: {
          found: true,
          position: { x: treeBlock.position.x, y: treeBlock.position.y, z: treeBlock.position.z }
        },
        duration: Date.now() - findStart
      });

      // Step 2: Dig logs (use primitive dig skill)
      const digStart = Date.now();
      let collected = 0;
      let consecutiveFailures = 0;
      const maxConsecutiveFailures = 3;

      for (let i = 0; i < quantity; i++) {
        const digResult = await registry.execute('dig', {
          blockType: `${woodType}_log`,
          maxDistance: 4
        }, context);

        if (digResult.success) {
          collected++;
          consecutiveFailures = 0;
        } else {
          consecutiveFailures++;
          if (consecutiveFailures >= maxConsecutiveFailures) {
            break; // Stop if too many consecutive failures
          }
        }
      }

      steps.push({
        step: 2,
        action: 'dig_logs',
        success: collected > 0,
        result: { collected, attempted: quantity },
        duration: Date.now() - digStart
      });

      // Step 3: Collect items (use primitive collect skill)
      const collectStart = Date.now();
      const collectResult = await registry.execute('collect', {
        itemType: `${woodType}_log`,
        maxDistance: 8
      }, context);

      steps.push({
        step: 3,
        action: 'collect_items',
        success: collectResult.success,
        result: collectResult.outcome || collectResult,
        duration: Date.now() - collectStart
      });

      const success = collected >= quantity;

      return {
        success,
        steps,
        outcome: {
          woodType,
          collected,
          requested: quantity,
          partialSuccess: collected > 0 && collected < quantity
        },
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        steps,
        outcome: { woodType, collected: 0, requested: quantity }
      };
    }
  },

  expectedOutcome(params) {
    return {
      collected: params.quantity || 10,
      woodType: params.woodType || 'oak'
    };
  }
};
