module.exports = {
  name: 'mine_stone',
  parameters: {
    stoneType: 'string',
    quantity: 'number'
  },

  async execute(params, context) {
    const { bot, registry } = context;
    const { stoneType = 'stone', quantity = 10 } = params;
    const steps = [];
    const startTime = Date.now();

    const validStoneTypes = ['stone', 'cobblestone', 'andesite', 'diorite', 'granite'];
    if (!validStoneTypes.includes(stoneType)) {
      return {
        success: false,
        error: `Invalid stoneType: ${stoneType}. Must be one of: ${validStoneTypes.join(', ')}`,
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
      const findStart = Date.now();
      const stoneBlock = bot.findBlock({
        matching: (block) => block && block.name === stoneType,
        maxDistance: 32
      });

      if (!stoneBlock) {
        steps.push({
          step: 1,
          action: 'find_stone',
          success: false,
          result: { found: false, reason: `No ${stoneType} found within 32 blocks` },
          duration: Date.now() - findStart
        });
        return {
          success: false,
          reason: 'no_stone_found',
          steps,
          outcome: { stoneType, collected: 0, requested: quantity }
        };
      }

      steps.push({
        step: 1,
        action: 'find_stone',
        success: true,
        result: {
          found: true,
          position: { x: stoneBlock.position.x, y: stoneBlock.position.y, z: stoneBlock.position.z }
        },
        duration: Date.now() - findStart
      });

      const digStart = Date.now();
      let collected = 0;
      let consecutiveFailures = 0;
      const maxConsecutiveFailures = 3;

      for (let i = 0; i < quantity; i++) {
        const digResult = await registry.execute('dig', {
          blockType: stoneType,
          maxDistance: 4
        }, context);

        if (digResult.success) {
          collected++;
          consecutiveFailures = 0;
        } else {
          consecutiveFailures++;
          if (consecutiveFailures >= maxConsecutiveFailures) {
            break;
          }
        }
      }

      steps.push({
        step: 2,
        action: 'dig_stone',
        success: collected > 0,
        result: { collected, attempted: quantity },
        duration: Date.now() - digStart
      });

      const collectStart = Date.now();
      const collectResult = await registry.execute('collect', {
        itemType: stoneType === 'stone' ? 'cobblestone' : stoneType,
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
          stoneType,
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
        outcome: { stoneType, collected: 0, requested: quantity }
      };
    }
  },

  expectedOutcome(params) {
    return {
      collected: params.quantity || 10,
      stoneType: params.stoneType || 'stone'
    };
  }
};
