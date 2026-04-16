module.exports = {
  name: 'hunt_food',
  parameters: {
    animalType: 'string',
    quantity: 'number'
  },

  async execute(params, context) {
    const { bot, registry } = context;
    const { animalType = 'cow', quantity = 1 } = params;
    const steps = [];
    const startTime = Date.now();

    const validAnimals = ['cow', 'pig', 'chicken', 'sheep', 'rabbit'];
    if (!validAnimals.includes(animalType)) {
      return {
        success: false,
        error: `Invalid animalType: ${animalType}. Must be one of: ${validAnimals.join(', ')}`,
        steps,
        outcome: { foodCollected: 0 }
      };
    }

    if (typeof quantity !== 'number' || quantity <= 0) {
      return {
        success: false,
        error: 'quantity must be a positive number',
        steps,
        outcome: { foodCollected: 0 }
      };
    }

    const foodDropMap = {
      cow: 'beef',
      pig: 'porkchop',
      chicken: 'chicken',
      sheep: 'mutton',
      rabbit: 'rabbit'
    };
    const foodItem = foodDropMap[animalType];

    try {
      const findStart = Date.now();
      const animal = bot.nearestEntity(entity => {
        return entity.name === animalType &&
          entity.position.distanceTo(bot.entity.position) <= 32;
      });

      if (!animal) {
        steps.push({
          step: 1,
          action: 'find_animal',
          success: false,
          result: { found: false, reason: `No ${animalType} found within 32 blocks` },
          duration: Date.now() - findStart
        });
        return {
          success: false,
          reason: 'no_animal_found',
          steps,
          outcome: { animalType, foodCollected: 0, requested: quantity }
        };
      }

      steps.push({
        step: 1,
        action: 'find_animal',
        success: true,
        result: {
          found: true,
          position: { x: animal.position.x, y: animal.position.y, z: animal.position.z }
        },
        duration: Date.now() - findStart
      });

      const approachStart = Date.now();
      const moveResult = await registry.execute('move', {
        direction: 'forward',
        distance: Math.max(1, Math.floor(animal.position.distanceTo(bot.entity.position) - 2))
      }, context);

      steps.push({
        step: 2,
        action: 'approach',
        success: moveResult.success,
        result: moveResult.outcome || moveResult,
        duration: Date.now() - approachStart
      });

      const attackStart = Date.now();
      let kills = 0;

      for (let i = 0; i < quantity; i++) {
        const targetAnimal = bot.nearestEntity(entity => {
          return entity.name === animalType &&
            entity.position.distanceTo(bot.entity.position) <= 4;
        });

        if (!targetAnimal) {
          break;
        }

        bot.attack(targetAnimal);
        kills++;
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      steps.push({
        step: 3,
        action: 'attack',
        success: kills > 0,
        result: { kills, attempted: quantity },
        duration: Date.now() - attackStart
      });

      const collectStart = Date.now();
      await new Promise(resolve => setTimeout(resolve, 1000));

      const collectResult = await registry.execute('collect', {
        itemType: foodItem,
        maxDistance: 8
      }, context);

      steps.push({
        step: 4,
        action: 'collect_drops',
        success: collectResult.success,
        result: collectResult.outcome || collectResult,
        duration: Date.now() - collectStart
      });

      return {
        success: kills >= quantity,
        steps,
        outcome: {
          animalType,
          foodItem,
          kills,
          requested: quantity,
          partialSuccess: kills > 0 && kills < quantity
        },
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        steps,
        outcome: { animalType, foodCollected: 0, requested: quantity }
      };
    }
  },

  expectedOutcome(params) {
    return {
      kills: params.quantity || 1,
      animalType: params.animalType || 'cow'
    };
  }
};
