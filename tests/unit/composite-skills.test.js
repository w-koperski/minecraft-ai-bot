const SkillRegistry = require('../../src/skills/skill-registry');

describe('Composite Skills', () => {
  let registry;
  let mockBot;
  let mockContext;

  beforeEach(() => {
    registry = new SkillRegistry();
    mockBot = {
      entity: {
        position: {
          x: 0, y: 64, z: 0,
          clone: () => ({ x: 0, y: 64, z: 0, distanceTo: () => 2 })
        }
      },
      findBlock: jest.fn((options) => {
        if (options.matching({ name: 'oak_log' })) {
          return { position: { x: 10, y: 64, z: 10 }, name: 'oak_log' };
        }
        if (options.matching({ name: 'stone' })) {
          return { position: { x: 5, y: 60, z: 5 }, name: 'stone' };
        }
        return null;
      }),
      nearestEntity: jest.fn(() => ({
        position: { x: 8, y: 64, z: 8 },
        name: 'cow'
      })),
      inventory: {
        items: jest.fn(() => []),
        count: jest.fn(() => 10)
      },
      dig: jest.fn(),
      attack: jest.fn(),
      setControlState: jest.fn(),
      clearControlStates: jest.fn(),
      craft: jest.fn()
    };
    mockContext = { bot: mockBot, registry };
  });

  describe('registration', () => {
    test('registers 5 composite skills', () => {
      const skills = registry.list();
      const compositeNames = skills.map(s => s.name).filter(n => n.includes('_'));
      expect(compositeNames.length).toBeGreaterThanOrEqual(5);
    });

    test('registers gather_wood skill', () => {
      const gatherWood = registry.get('gather_wood');
      expect(gatherWood).toBeDefined();
      expect(gatherWood.name).toBe('gather_wood');
      expect(gatherWood.parameters).toHaveProperty('woodType');
      expect(gatherWood.parameters).toHaveProperty('quantity');
    });

    test('registers mine_stone skill', () => {
      const mineStone = registry.get('mine_stone');
      expect(mineStone).toBeDefined();
      expect(mineStone.name).toBe('mine_stone');
      expect(mineStone.parameters).toHaveProperty('stoneType');
      expect(mineStone.parameters).toHaveProperty('quantity');
    });

    test('registers craft_tools skill', () => {
      const craftTools = registry.get('craft_tools');
      expect(craftTools).toBeDefined();
      expect(craftTools.name).toBe('craft_tools');
      expect(craftTools.parameters).toHaveProperty('toolName');
      expect(craftTools.parameters).toHaveProperty('quantity');
    });

    test('registers build_shelter skill', () => {
      const buildShelter = registry.get('build_shelter');
      expect(buildShelter).toBeDefined();
      expect(buildShelter.name).toBe('build_shelter');
      expect(buildShelter.parameters).toHaveProperty('size');
      expect(buildShelter.parameters).toHaveProperty('material');
    });

    test('registers hunt_food skill', () => {
      const huntFood = registry.get('hunt_food');
      expect(huntFood).toBeDefined();
      expect(huntFood.name).toBe('hunt_food');
      expect(huntFood.parameters).toHaveProperty('animalType');
      expect(huntFood.parameters).toHaveProperty('quantity');
    });
  });

  describe('skill structure', () => {
    const compositeSkillNames = ['gather_wood', 'mine_stone', 'craft_tools', 'build_shelter', 'hunt_food'];

    compositeSkillNames.forEach(skillName => {
      test(`${skillName} has required properties`, () => {
        const skill = registry.get(skillName);
        expect(skill).toHaveProperty('name');
        expect(skill).toHaveProperty('parameters');
        expect(skill).toHaveProperty('execute');
        expect(skill).toHaveProperty('expectedOutcome');
        expect(typeof skill.execute).toBe('function');
        expect(typeof skill.expectedOutcome).toBe('function');
      });
    });
  });

  describe('gather_wood', () => {
    test('returns error for invalid woodType', async () => {
      const result = await registry.execute('gather_wood', { woodType: 'invalid', quantity: 5 }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid woodType');
    });

    test('returns error for invalid quantity', async () => {
      const result = await registry.execute('gather_wood', { woodType: 'oak', quantity: -1 }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('quantity must be a positive number');
    });

    test('expectedOutcome returns correct structure', () => {
      const skill = registry.get('gather_wood');
      const outcome = skill.expectedOutcome({ woodType: 'birch', quantity: 20 });

      expect(outcome).toEqual({
        collected: 20,
        woodType: 'birch'
      });
    });

    test('returns steps array in result', async () => {
      const result = await registry.execute('gather_wood', { woodType: 'oak', quantity: 1 }, mockContext);

      expect(result).toHaveProperty('steps');
      expect(Array.isArray(result.steps)).toBe(true);
    });
  });

  describe('mine_stone', () => {
    test('returns error for invalid stoneType', async () => {
      const result = await registry.execute('mine_stone', { stoneType: 'invalid', quantity: 5 }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid stoneType');
    });

    test('expectedOutcome returns correct structure', () => {
      const skill = registry.get('mine_stone');
      const outcome = skill.expectedOutcome({ stoneType: 'cobblestone', quantity: 15 });

      expect(outcome).toEqual({
        collected: 15,
        stoneType: 'cobblestone'
      });
    });
  });

  describe('craft_tools', () => {
    test('returns error for invalid toolName', async () => {
      const result = await registry.execute('craft_tools', { toolName: 'invalid', quantity: 1 }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid toolName');
    });

    test('accepts valid tool names', async () => {
      const validTools = ['wooden_pickaxe', 'stone_axe', 'iron_sword'];

      validTools.forEach(async (toolName) => {
        const skill = registry.get('craft_tools');
        const outcome = skill.expectedOutcome({ toolName, quantity: 1 });
        expect(outcome.toolName).toBe(toolName);
      });
    });

    test('expectedOutcome returns correct structure', () => {
      const skill = registry.get('craft_tools');
      const outcome = skill.expectedOutcome({ toolName: 'stone_pickaxe', quantity: 2 });

      expect(outcome).toEqual({
        crafted: 2,
        toolName: 'stone_pickaxe'
      });
    });
  });

  describe('build_shelter', () => {
    test('returns error for invalid size', async () => {
      const result = await registry.execute('build_shelter', { size: 'huge', material: 'oak_planks' }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid size');
    });

    test('returns error for invalid material', async () => {
      const result = await registry.execute('build_shelter', { size: 'small', material: 'diamond' }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid material');
    });

    test('expectedOutcome returns correct structure', () => {
      const skill = registry.get('build_shelter');
      const outcome = skill.expectedOutcome({ size: 'medium', material: 'cobblestone' });

      expect(outcome).toEqual({
        size: 'medium',
        material: 'cobblestone',
        built: true
      });
    });
  });

  describe('hunt_food', () => {
    test('returns error for invalid animalType', async () => {
      const result = await registry.execute('hunt_food', { animalType: 'dragon', quantity: 1 }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid animalType');
    });

    test('accepts valid animal types', () => {
      const validAnimals = ['cow', 'pig', 'chicken', 'sheep', 'rabbit'];
      const skill = registry.get('hunt_food');

      validAnimals.forEach((animalType) => {
        const outcome = skill.expectedOutcome({ animalType, quantity: 1 });
        expect(outcome.animalType).toBe(animalType);
      });
    });

    test('expectedOutcome returns correct structure', () => {
      const skill = registry.get('hunt_food');
      const outcome = skill.expectedOutcome({ animalType: 'pig', quantity: 3 });

      expect(outcome).toEqual({
        kills: 3,
        animalType: 'pig'
      });
    });
  });

  describe('total skills count', () => {
    test('registry has 10 skills (5 primitive + 5 composite)', () => {
      const skills = registry.list();
      expect(skills).toHaveLength(10);
    });

    test('all skills have unique names', () => {
      const skills = registry.list();
      const names = skills.map(s => s.name);
      const uniqueNames = [...new Set(names)];
      expect(names.length).toBe(uniqueNames.length);
    });
  });
});
