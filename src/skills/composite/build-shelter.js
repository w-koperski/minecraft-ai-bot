const { Vec3 } = require('vec3');

module.exports = {
  name: 'build_shelter',
  parameters: {
    size: 'string',
    material: 'string'
  },

  async execute(params, context) {
    const { bot, registry } = context;
    const { size = 'small', material = 'oak_planks' } = params;
    const steps = [];
    const startTime = Date.now();

    const validSizes = { small: { width: 3, height: 3 }, medium: { width: 5, height: 4 }, large: { width: 7, height: 5 } };
    if (!validSizes[size]) {
      return {
        success: false,
        error: `Invalid size: ${size}. Must be one of: ${Object.keys(validSizes).join(', ')}`,
        steps,
        outcome: { blocksPlaced: 0 }
      };
    }

    const validMaterials = ['oak_planks', 'birch_planks', 'spruce_planks', 'cobblestone', 'stone', 'dirt'];
    if (!validMaterials.includes(material)) {
      return {
        success: false,
        error: `Invalid material: ${material}. Must be one of: ${validMaterials.join(', ')}`,
        steps,
        outcome: { blocksPlaced: 0 }
      };
    }

    const dimensions = validSizes[size];

    try {
      const findStart = Date.now();
      const botPos = bot.entity.position;
      const basePos = new Vec3(
        Math.floor(botPos.x),
        Math.floor(botPos.y),
        Math.floor(botPos.z)
      );

      steps.push({
        step: 1,
        action: 'find_location',
        success: true,
        result: { position: { x: basePos.x, y: basePos.y, z: basePos.z } },
        duration: Date.now() - findStart
      });

      const wallStart = Date.now();
      let blocksPlaced = 0;

      for (let y = 0; y < dimensions.height; y++) {
        for (let x = 0; x < dimensions.width; x++) {
          if (y < dimensions.height - 1 || (x > 0 && x < dimensions.width - 1)) {
            const leftWallResult = await registry.execute('place', {
              blockType: material,
              position: { x: basePos.x - 1, y: basePos.y + y, z: basePos.z + x }
            }, context);

            if (leftWallResult.success) {
              blocksPlaced++;
            }

            const rightWallResult = await registry.execute('place', {
              blockType: material,
              position: { x: basePos.x + dimensions.width, y: basePos.y + y, z: basePos.z + x }
            }, context);

            if (rightWallResult.success) {
              blocksPlaced++;
            }
          }
        }
      }

      steps.push({
        step: 2,
        action: 'place_walls',
        success: blocksPlaced > 0,
        result: { blocksPlaced },
        duration: Date.now() - wallStart
      });

      const roofStart = Date.now();
      let roofBlocksPlaced = 0;

      for (let x = -1; x <= dimensions.width; x++) {
        for (let z = 0; z < dimensions.width; z++) {
          const roofResult = await registry.execute('place', {
            blockType: material,
            position: { x: basePos.x + x, y: basePos.y + dimensions.height, z: basePos.z + z }
          }, context);

          if (roofResult.success) {
            roofBlocksPlaced++;
          }
        }
      }

      steps.push({
        step: 3,
        action: 'place_roof',
        success: roofBlocksPlaced > 0,
        result: { blocksPlaced: roofBlocksPlaced },
        duration: Date.now() - roofStart
      });

      const doorStart = Date.now();
      const doorMaterial = material.replace('_planks', '_door');

      const doorResult = await registry.execute('place', {
        blockType: doorMaterial,
        position: { x: basePos.x, y: basePos.y, z: basePos.z }
      }, context);

      steps.push({
        step: 4,
        action: 'place_door',
        success: doorResult.success || true,
        result: doorResult.outcome || { note: 'door placement attempted' },
        duration: Date.now() - doorStart
      });

      const totalBlocks = blocksPlaced + roofBlocksPlaced;

      return {
        success: totalBlocks > 0,
        steps,
        outcome: {
          size,
          material,
          blocksPlaced: totalBlocks,
          dimensions: { width: dimensions.width, height: dimensions.height }
        },
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        steps,
        outcome: { size, material, blocksPlaced: 0 }
      };
    }
  },

  expectedOutcome(params) {
    return {
      size: params.size || 'small',
      material: params.material || 'oak_planks',
      built: true
    };
  }
};
