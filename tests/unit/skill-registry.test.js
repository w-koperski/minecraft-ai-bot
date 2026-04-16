const SkillRegistry = require('../../src/skills/skill-registry');

describe('SkillRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  describe('initialization', () => {
    test('registers 5 primitive skills', () => {
      expect(registry.list()).toHaveLength(5);
    });

    test('registers move skill', () => {
      const moveSkill = registry.get('move');
      expect(moveSkill).toBeDefined();
      expect(moveSkill.name).toBe('move');
      expect(moveSkill.parameters).toHaveProperty('direction');
      expect(moveSkill.parameters).toHaveProperty('distance');
    });

    test('registers dig skill', () => {
      const digSkill = registry.get('dig');
      expect(digSkill).toBeDefined();
      expect(digSkill.name).toBe('dig');
      expect(digSkill.parameters).toHaveProperty('blockType');
      expect(digSkill.parameters).toHaveProperty('maxDistance');
    });

    test('registers place skill', () => {
      const placeSkill = registry.get('place');
      expect(placeSkill).toBeDefined();
      expect(placeSkill.name).toBe('place');
      expect(placeSkill.parameters).toHaveProperty('blockType');
      expect(placeSkill.parameters).toHaveProperty('position');
    });

    test('registers craft skill', () => {
      const craftSkill = registry.get('craft');
      expect(craftSkill).toBeDefined();
      expect(craftSkill.name).toBe('craft');
      expect(craftSkill.parameters).toHaveProperty('itemName');
      expect(craftSkill.parameters).toHaveProperty('count');
    });

    test('registers collect skill', () => {
      const collectSkill = registry.get('collect');
      expect(collectSkill).toBeDefined();
      expect(collectSkill.name).toBe('collect');
      expect(collectSkill.parameters).toHaveProperty('itemType');
      expect(collectSkill.parameters).toHaveProperty('maxDistance');
    });
  });

  describe('get', () => {
    test('returns skill by name', () => {
      const skill = registry.get('move');
      expect(skill).toBeDefined();
      expect(skill.name).toBe('move');
    });

    test('returns undefined for unknown skill', () => {
      const skill = registry.get('unknown');
      expect(skill).toBeUndefined();
    });
  });

  describe('list', () => {
    test('returns all registered skills', () => {
      const skills = registry.list();
      expect(skills).toHaveLength(5);
      expect(skills.map(s => s.name)).toEqual(
        expect.arrayContaining(['move', 'dig', 'place', 'craft', 'collect'])
      );
    });
  });

  describe('register', () => {
    test('registers a new skill', () => {
      const customSkill = {
        name: 'custom',
        parameters: { foo: 'string' },
        async execute(params, context) {
          return { success: true, outcome: { executed: true } };
        },
        expectedOutcome(params) {
          return { executed: true };
        }
      };

      registry.register(customSkill);
      expect(registry.list()).toHaveLength(6);
      expect(registry.get('custom')).toBeDefined();
    });

    test('throws error for skill without name', () => {
      const invalidSkill = {
        parameters: { foo: 'string' },
        async execute() {}
      };

      expect(() => registry.register(invalidSkill)).toThrow('Invalid skill: must have name and execute');
    });

    test('throws error for skill without execute', () => {
      const invalidSkill = {
        name: 'invalid',
        parameters: { foo: 'string' }
      };

      expect(() => registry.register(invalidSkill)).toThrow('Invalid skill: must have name and execute');
    });
  });

  describe('execute', () => {
    test('returns error for unknown skill', async () => {
      const result = await registry.execute('unknown', {}, {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Skill not found: unknown');
    });

    test('executes move skill with valid parameters', async () => {
      const mockBot = {
        entity: { position: { clone: () => ({ distanceTo: () => 2 }) } },
        setControlState: jest.fn(),
        clearControlStates: jest.fn()
      };

      const result = await registry.execute('move', { direction: 'forward', distance: 2 }, { bot: mockBot });
      
      expect(result.success).toBe(true);
      expect(result.outcome.moved).toBe(true);
      expect(mockBot.setControlState).toHaveBeenCalledWith('forward', true);
      expect(mockBot.clearControlStates).toHaveBeenCalled();
    });

    test('returns error for move without bot context', async () => {
      const result = await registry.execute('move', { direction: 'forward', distance: 2 }, {});
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Bot not available');
    });

    test('returns error for invalid move direction', async () => {
      const mockBot = { entity: { position: { clone: () => ({ distanceTo: () => 2 }) } } };
      
      const result = await registry.execute('move', { direction: 'invalid', distance: 2 }, { bot: mockBot });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid direction');
    });
  });

  describe('skill structure', () => {
    test('all skills have required properties', () => {
      const skills = registry.list();
      
      skills.forEach(skill => {
        expect(skill).toHaveProperty('name');
        expect(skill).toHaveProperty('parameters');
        expect(skill).toHaveProperty('execute');
        expect(skill).toHaveProperty('expectedOutcome');
        expect(typeof skill.execute).toBe('function');
        expect(typeof skill.expectedOutcome).toBe('function');
      });
    });

    test('all skills have valid parameter schemas', () => {
      const skills = registry.list();
      
      skills.forEach(skill => {
        expect(typeof skill.parameters).toBe('object');
        expect(Object.keys(skill.parameters).length).toBeGreaterThan(0);
      });
    });
  });

  describe('primitive skills', () => {
    test('move skill expectedOutcome returns correct structure', () => {
      const skill = registry.get('move');
      const outcome = skill.expectedOutcome({ direction: 'forward', distance: 5 });
      
      expect(outcome).toEqual({
        moved: true,
        distance: 5,
        direction: 'forward'
      });
    });

    test('dig skill expectedOutcome returns correct structure', () => {
      const skill = registry.get('dig');
      const outcome = skill.expectedOutcome({ blockType: 'stone', maxDistance: 4 });
      
      expect(outcome).toEqual({
        dug: true,
        blockType: 'stone',
        maxDistance: 4
      });
    });

    test('place skill expectedOutcome returns correct structure', () => {
      const skill = registry.get('place');
      const outcome = skill.expectedOutcome({ blockType: 'dirt', position: { x: 10, y: 64, z: 20 } });
      
      expect(outcome).toEqual({
        placed: true,
        blockType: 'dirt',
        position: { x: 10, y: 64, z: 20 }
      });
    });

    test('craft skill expectedOutcome returns correct structure', () => {
      const skill = registry.get('craft');
      const outcome = skill.expectedOutcome({ itemName: 'stick', count: 4 });
      
      expect(outcome).toEqual({
        crafted: true,
        itemName: 'stick',
        count: 4
      });
    });

    test('collect skill expectedOutcome returns correct structure', () => {
      const skill = registry.get('collect');
      const outcome = skill.expectedOutcome({ itemType: 'wheat', maxDistance: 6 });
      
      expect(outcome).toEqual({
        collected: true,
        itemType: 'wheat',
        maxDistance: 6
      });
    });
  });
});
