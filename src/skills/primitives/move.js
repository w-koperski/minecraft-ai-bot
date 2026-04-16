module.exports = {
  name: 'move',
  parameters: {
    direction: 'string',
    distance: 'number'
  },

  async execute(params, context) {
    const { bot } = context;
    const { direction, distance } = params;

    if (!bot) {
      return { success: false, error: 'Bot not available in context' };
    }

    const validDirections = ['forward', 'back', 'left', 'right'];
    if (!validDirections.includes(direction)) {
      return { success: false, error: `Invalid direction: ${direction}. Must be one of: ${validDirections.join(', ')}` };
    }

    if (typeof distance !== 'number' || distance <= 0) {
      return { success: false, error: 'Distance must be a positive number' };
    }

    try {
      const startPos = bot.entity.position.clone();
      
      bot.setControlState(direction, true);
      await new Promise(resolve => setTimeout(resolve, distance * 500));
      bot.clearControlStates();

      const endPos = bot.entity.position.clone();
      const actualDistance = startPos.distanceTo(endPos);

      return {
        success: true,
        outcome: {
          moved: true,
          requestedDistance: distance,
          actualDistance: Math.round(actualDistance * 100) / 100,
          direction
        }
      };
    } catch (error) {
      bot.clearControlStates();
      return { success: false, error: error.message };
    }
  },

  expectedOutcome(params) {
    return {
      moved: true,
      distance: params.distance,
      direction: params.direction
    };
  }
};
