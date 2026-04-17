/**
 * Unit tests for GoalGraph module
 *
 * Coverage:
 * - addGoal, addDependency methods
 * - getGoal, getAchievableGoals queries
 * - getGoalPath traversal
 * - Prerequisite filtering
 */

const GoalGraph = require('../../src/goals/goal-graph');

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn()
}));

describe('GoalGraph', () => {
  let goalGraph;

  beforeEach(() => {
    goalGraph = new GoalGraph();
  });

  describe('Constructor', () => {
    test('should initialize with default goals', () => {
      // 11 goals defined in _initializeBasicGoals
      expect(goalGraph.graph.order).toBe(11);
    });

    test('should initialize with default dependencies', () => {
      // 6 dependencies defined
      expect(goalGraph.graph.size).toBe(6);
    });

    test('should create directed graph', () => {
      expect(goalGraph.graph.type).toBe('directed');
    });
  });

  describe('addGoal', () => {
    test('should add goal with all attributes', () => {
      goalGraph.addGoal('test_goal', {
        description: 'Test goal description',
        importance: 5,
        category: 'test'
      });

      expect(goalGraph.graph.hasNode('test_goal')).toBe(true);
      const goal = goalGraph.getGoal('test_goal');
      expect(goal.name).toBe('test_goal');
      expect(goal.description).toBe('Test goal description');
      expect(goal.importance).toBe(5);
      expect(goal.category).toBe('test');
    });

    test('should use defaults for missing attributes', () => {
      goalGraph.addGoal('minimal_goal');

      const goal = goalGraph.getGoal('minimal_goal');
      expect(goal.name).toBe('minimal_goal');
      expect(goal.description).toBe('');
      expect(goal.importance).toBe(5);
      expect(goal.category).toBe('general');
    });

    test('should not duplicate existing goals', () => {
      goalGraph.addGoal('survive', { description: 'New description' });

      // Should log warning and not change existing goal
      const goal = goalGraph.getGoal('survive');
      expect(goal.description).toBe('Stay alive - maintain health and avoid death');
    });
  });

  describe('addDependency', () => {
    test('should add dependency between goals', () => {
      goalGraph.addGoal('goal_a');
      goalGraph.addGoal('goal_b');
      goalGraph.addDependency('goal_b', 'goal_a');

      // Edge goes from prerequisite to goal
      expect(goalGraph.graph.hasEdge('goal_a', 'goal_b')).toBe(true);
    });

    test('should throw for missing goal', () => {
      goalGraph.addGoal('goal_a');
      
      expect(() => {
        goalGraph.addDependency('nonexistent', 'goal_a');
      }).toThrow('Goal nonexistent does not exist');
    });

    test('should throw for missing prerequisite', () => {
      goalGraph.addGoal('goal_a');
      
      expect(() => {
        goalGraph.addDependency('goal_a', 'nonexistent');
      }).toThrow('Prerequisite nonexistent does not exist');
    });

    test('should not duplicate dependencies', () => {
      goalGraph.addGoal('goal_a');
      goalGraph.addGoal('goal_b');
      goalGraph.addDependency('goal_b', 'goal_a');
      goalGraph.addDependency('goal_b', 'goal_a'); // Second call should be ignored

      const edges = goalGraph.graph.edges().filter(e => 
        goalGraph.graph.source(e) === 'goal_a' && goalGraph.graph.target(e) === 'goal_b'
      );
      expect(edges.length).toBe(1);
    });
  });

  describe('getGoal', () => {
    test('should return goal attributes', () => {
      const goal = goalGraph.getGoal('survive');
      expect(goal.name).toBe('survive');
      expect(goal.importance).toBe(10);
      expect(goal.category).toBe('survival');
    });

    test('should return null for missing goal', () => {
      const goal = goalGraph.getGoal('nonexistent');
      expect(goal).toBeNull();
    });
  });

  describe('getAchievableGoals', () => {
    test('should return goals with no prerequisites', () => {
      const achievable = goalGraph.getAchievableGoals({ completed: [] });
      
      // Goals with no prerequisites: survive, find_shelter, gather_wood, gather_stone, explore, find_village
      const names = achievable.map(g => g.name);
      expect(names).toContain('survive');
      expect(names).toContain('gather_wood');
      expect(names).toContain('gather_stone');
      expect(names).toContain('explore');
      expect(names).toContain('find_village');
    });

    test('should filter out completed goals', () => {
      const achievable = goalGraph.getAchievableGoals({ 
        completed: ['survive', 'gather_wood'] 
      });
      
      const names = achievable.map(g => g.name);
      expect(names).not.toContain('survive');
      expect(names).not.toContain('gather_wood');
    });

    test('should include goals with met prerequisites', () => {
      // After completing gather_wood and craft_wooden_tools and gather_stone
      const achievable = goalGraph.getAchievableGoals({ 
        completed: ['gather_wood', 'craft_wooden_tools', 'gather_stone'] 
      });
      
      const names = achievable.map(g => g.name);
      expect(names).toContain('craft_stone_tools'); // Prerequisites met
    });

    test('should exclude goals with unmet prerequisites', () => {
      const achievable = goalGraph.getAchievableGoals({ 
        completed: ['gather_wood'] 
      });
      
      const names = achievable.map(g => g.name);
      // craft_wooden_tools IS achievable because gather_wood is completed
      expect(names).toContain('craft_wooden_tools'); // Prerequisite met
      expect(names).not.toContain('craft_stone_tools'); // Missing gather_stone
    });

    test('should handle empty completed array', () => {
      const achievable = goalGraph.getAchievableGoals();
      
      expect(achievable.length).toBeGreaterThan(0);
    });

    test('should return empty array when all goals completed', () => {
      const allGoals = goalGraph.getAllGoals().map(g => g.name);
      const achievable = goalGraph.getAchievableGoals({ completed: allGoals });
      
      expect(achievable).toEqual([]);
    });
  });

  describe('getGoalPath', () => {
    test('should return path to goal with prerequisites', () => {
      // Path to craft_iron_tools: gather_wood -> craft_wooden_tools -> gather_stone -> craft_stone_tools -> gather_iron -> craft_iron_tools
      const path = goalGraph.getGoalPath('craft_iron_tools');
      
      expect(path).toContain('gather_wood');
      expect(path).toContain('craft_wooden_tools');
      expect(path).toContain('gather_stone');
      expect(path).toContain('craft_stone_tools');
      expect(path).toContain('gather_iron');
      expect(path).toContain('craft_iron_tools');
      
      // Verify order: prerequisites before dependent
      const woodIndex = path.indexOf('gather_wood');
      const woodenToolsIndex = path.indexOf('craft_wooden_tools');
      expect(woodIndex).toBeLessThan(woodenToolsIndex);
    });

    test('should return single goal with no prerequisites', () => {
      const path = goalGraph.getGoalPath('survive');
      expect(path).toEqual(['survive']);
    });

    test('should return empty array for missing goal', () => {
      const path = goalGraph.getGoalPath('nonexistent');
      expect(path).toEqual([]);
    });

    test('should handle multiple prerequisites correctly', () => {
      // craft_stone_tools has two prerequisites: gather_stone and craft_wooden_tools
      const path = goalGraph.getGoalPath('craft_stone_tools');
      
      expect(path).toContain('gather_wood');
      expect(path).toContain('craft_wooden_tools');
      expect(path).toContain('gather_stone');
      expect(path).toContain('craft_stone_tools');
      
      // Both prerequisites should come before
      const stoneToolsIndex = path.indexOf('craft_stone_tools');
      expect(path.indexOf('gather_stone')).toBeLessThan(stoneToolsIndex);
      expect(path.indexOf('craft_wooden_tools')).toBeLessThan(stoneToolsIndex);
    });
  });

  describe('getAllGoals', () => {
    test('should return all goals', () => {
      const goals = goalGraph.getAllGoals();
      
      expect(goals.length).toBe(11);
      expect(goals.every(g => g.name && g.description)).toBe(true);
    });

    test('should include goal attributes', () => {
      const goals = goalGraph.getAllGoals();
      const survive = goals.find(g => g.name === 'survive');
      
      expect(survive.importance).toBe(10);
      expect(survive.category).toBe('survival');
    });
  });

  describe('Pre-initialized Goals', () => {
    test('should have correct survival goals', () => {
      const survive = goalGraph.getGoal('survive');
      expect(survive.category).toBe('survival');
      expect(survive.importance).toBe(10);
      
      const shelter = goalGraph.getGoal('find_shelter');
      expect(shelter.category).toBe('survival');
      expect(shelter.importance).toBe(8);
    });

    test('should have correct resource goals', () => {
      const wood = goalGraph.getGoal('gather_wood');
      expect(wood.category).toBe('resources');
      
      const stone = goalGraph.getGoal('gather_stone');
      expect(stone.category).toBe('resources');
      
      const iron = goalGraph.getGoal('gather_iron');
      expect(iron.category).toBe('resources');
    });

    test('should have correct crafting goals', () => {
      const wooden = goalGraph.getGoal('craft_wooden_tools');
      expect(wooden.category).toBe('crafting');
      
      const stoneTools = goalGraph.getGoal('craft_stone_tools');
      expect(stoneTools.category).toBe('crafting');
      
      const ironTools = goalGraph.getGoal('craft_iron_tools');
      expect(ironTools.category).toBe('crafting');
    });

    test('should have correct dependency chain', () => {
      // craft_wooden_tools depends on gather_wood
      expect(goalGraph.graph.hasEdge('gather_wood', 'craft_wooden_tools')).toBe(true);
      
      // craft_stone_tools depends on gather_stone and craft_wooden_tools
      expect(goalGraph.graph.hasEdge('gather_stone', 'craft_stone_tools')).toBe(true);
      expect(goalGraph.graph.hasEdge('craft_wooden_tools', 'craft_stone_tools')).toBe(true);
      
      // gather_iron depends on craft_stone_tools
      expect(goalGraph.graph.hasEdge('craft_stone_tools', 'gather_iron')).toBe(true);
      
      // craft_iron_tools depends on gather_iron
      expect(goalGraph.graph.hasEdge('gather_iron', 'craft_iron_tools')).toBe(true);
      
      // build_house depends on gather_wood
      expect(goalGraph.graph.hasEdge('gather_wood', 'build_house')).toBe(true);
    });
  });

  describe('Complex Dependency Scenarios', () => {
    test('should handle diamond dependency pattern', () => {
      // Create: A -> B -> D, A -> C -> D
      goalGraph.addGoal('a');
      goalGraph.addGoal('b');
      goalGraph.addGoal('c');
      goalGraph.addGoal('d');
      goalGraph.addDependency('b', 'a');
      goalGraph.addDependency('c', 'a');
      goalGraph.addDependency('d', 'b');
      goalGraph.addDependency('d', 'c');
      
      const path = goalGraph.getGoalPath('d');
      expect(path[0]).toBe('a'); // A first
      expect(path[path.length - 1]).toBe('d'); // D last
      expect(path).toContain('b');
      expect(path).toContain('c');
    });

    test('should correctly identify achievable with partial completion', () => {
      // Only gather_wood completed
      const achievable = goalGraph.getAchievableGoals({ 
        completed: ['gather_wood'] 
      });
      
      const names = achievable.map(g => g.name);
      // craft_wooden_tools should now be achievable
      expect(names).toContain('craft_wooden_tools');
      // build_house should now be achievable (depends on gather_wood)
      expect(names).toContain('build_house');
    });
  });
});
