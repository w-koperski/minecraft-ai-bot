const GoalGenerator = require('../../src/goals/goal-generator');
const GoalGraph = require('../../src/goals/goal-graph');
const GoalScorer = require('../../src/goals/goal-scorer');

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('GoalGenerator', () => {
  let goalGraph;
  let goalScorer;
  let generator;

  beforeEach(() => {
    goalGraph = new GoalGraph();
    goalScorer = new GoalScorer();
    generator = new GoalGenerator(goalGraph, goalScorer);
  });

  describe('constructor', () => {
    test('should initialize with goalGraph and goalScorer', () => {
      expect(generator.goalGraph).toBe(goalGraph);
      expect(generator.goalScorer).toBe(goalScorer);
      expect(generator.lastGenerated).toBe(0);
      expect(generator.minInterval).toBe(60000);
    });
  });

  describe('generateGoal', () => {
    test('should return null if minInterval has not passed', () => {
      generator.lastGenerated = Date.now();
      const result = generator.generateGoal({});
      expect(result).toBeNull();
    });

    test('should return null if no achievable goals', () => {
      const context = { completed: ['survive', 'find_shelter', 'gather_wood', 'gather_stone', 'gather_iron', 'craft_wooden_tools', 'craft_stone_tools', 'craft_iron_tools', 'explore', 'find_village', 'build_house'] };
      const result = generator.generateGoal(context);
      expect(result).toBeNull();
    });

    test('should return goal with highest score', () => {
      const context = {};
      const result = generator.generateGoal(context);
      
      expect(result).toBeDefined();
      expect(result.name).toBeDefined();
      expect(result.score).toBeDefined();
      expect(result.category).toBeDefined();
      expect(result.urgency).toBeDefined();
    });

    test('should return null if highest score below threshold', () => {
      // Create a mock that returns low scores
      const mockScorer = {
        scoreGoal: jest.fn().mockReturnValue(0.1)
      };
      const mockGenerator = new GoalGenerator(goalGraph, mockScorer);
      
      const context = {};
      const result = mockGenerator.generateGoal(context);
      
      expect(result).toBeNull();
    });

    test('should set urgency to high for score > 0.7', () => {
      // Mock scorer to return high score
      const mockScorer = {
        scoreGoal: jest.fn().mockReturnValue(0.8)
      };
      const mockGenerator = new GoalGenerator(goalGraph, mockScorer);
      
      const context = {};
      const result = mockGenerator.generateGoal(context);
      
      expect(result.urgency).toBe('high');
    });

    test('should set urgency to medium for score between 0.5 and 0.7', () => {
      const mockScorer = {
        scoreGoal: jest.fn().mockReturnValue(0.6)
      };
      const mockGenerator = new GoalGenerator(goalGraph, mockScorer);
      
      const context = {};
      const result = mockGenerator.generateGoal(context);
      
      expect(result.urgency).toBe('medium');
    });

    test('should set urgency to low for score < 0.5', () => {
      const mockScorer = {
        scoreGoal: jest.fn().mockReturnValue(0.4)
      };
      const mockGenerator = new GoalGenerator(goalGraph, mockScorer);
      
      const context = {};
      const result = mockGenerator.generateGoal(context);
      
      expect(result.urgency).toBe('low');
    });

    test('should update lastGenerated timestamp', () => {
      const initialTime = generator.lastGenerated;
      generator.generateGoal({});
      expect(generator.lastGenerated).toBeGreaterThan(initialTime);
    });

    test('should include all required fields in result', () => {
      const context = {};
      const result = generator.generateGoal(context);
      
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('urgency');
    });
  });
});
