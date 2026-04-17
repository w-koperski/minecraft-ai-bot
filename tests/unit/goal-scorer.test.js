const GoalScorer = require('../../src/goals/goal-scorer');

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('GoalScorer', () => {
  let scorer;

  beforeEach(() => {
    scorer = new GoalScorer();
  });

  describe('scoreGoal', () => {
    test('should return score based on goal importance', () => {
      const goal = { name: 'test', importance: 5 };
      const score = scorer.scoreGoal(goal);
      expect(score).toBe(0.5); // 5/10
    });

    test('should cap score at 1.0', () => {
      const goal = { name: 'test', importance: 15 };
      const score = scorer.scoreGoal(goal);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    test('should floor score at 0', () => {
      const goal = { name: 'test', importance: 1 };
      const score = scorer.scoreGoal(goal, { dangerLevel: 1.0 });
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('_getPersonalityBonus', () => {
    test('should return bonus for curious personality and exploration goal', () => {
      scorer.personality = { curiosity: 0.8 };
      const goal = { name: 'explore', category: 'exploration' };
      const bonus = scorer._getPersonalityBonus(goal, scorer.personality);
      expect(bonus).toBe(0.5);
    });

    test('should return bonus for cautious personality and survival goal', () => {
      scorer.personality = { bravery: 0.2 };
      const goal = { name: 'survive', category: 'survival' };
      const bonus = scorer._getPersonalityBonus(goal, scorer.personality);
      expect(bonus).toBe(0.5);
    });

    test('should return bonus for creative personality and building goal', () => {
      scorer.personality = { creativity: 0.8 };
      const goal = { name: 'build', category: 'building' };
      const bonus = scorer._getPersonalityBonus(goal, scorer.personality);
      expect(bonus).toBe(0.5);
    });

    test('should return bonus for diligent personality and resources goal', () => {
      scorer.personality = { diligence: 0.8 };
      const goal = { name: 'gather', category: 'resources' };
      const bonus = scorer._getPersonalityBonus(goal, scorer.personality);
      expect(bonus).toBe(0.3);
    });

    test('should return 0 for non-matching personality/goal', () => {
      scorer.personality = { curiosity: 0.5 };
      const goal = { name: 'survive', category: 'survival' };
      const bonus = scorer._getPersonalityBonus(goal, scorer.personality);
      expect(bonus).toBe(0);
    });
  });

  describe('_getNeedsBonus', () => {
    test('should return max bonus for low health and survival goal', () => {
      const goal = { name: 'survive', category: 'survival' };
      const context = { health: 4 };
      const bonus = scorer._getNeedsBonus(goal, context);
      expect(bonus).toBe(1.0);
    });

    test('should return bonus for low food and find_food goal', () => {
      const goal = { name: 'find_food' };
      const context = { food: 4 };
      const bonus = scorer._getNeedsBonus(goal, context);
      expect(bonus).toBe(1.0);
    });

    test('should return bonus for empty inventory and resources goal', () => {
      const goal = { name: 'gather', category: 'resources' };
      const context = { inventory: [] };
      const bonus = scorer._getNeedsBonus(goal, context);
      expect(bonus).toBe(0.5);
    });

    test('should return 0 for healthy context', () => {
      const goal = { name: 'explore', category: 'exploration' };
      const context = { health: 20, food: 20 };
      const bonus = scorer._getNeedsBonus(goal, context);
      expect(bonus).toBe(0);
    });
  });

  describe('_getEventsBonus', () => {
    test('should return bonus for death event and survival goal', () => {
      const goal = { name: 'survive', category: 'survival' };
      const context = { recentEvents: [{ type: 'death' }] };
      const bonus = scorer._getEventsBonus(goal, context);
      expect(bonus).toBe(0.8);
    });

    test('should return max bonus for player_request event matching goal', () => {
      const goal = { name: 'gather_wood' };
      const context = { recentEvents: [{ type: 'player_request', goal: 'gather_wood' }] };
      const bonus = scorer._getEventsBonus(goal, context);
      expect(bonus).toBe(1.0);
    });

    test('should return 0 for non-matching events', () => {
      const goal = { name: 'explore' };
      const context = { recentEvents: [{ type: 'player_request', goal: 'gather_wood' }] };
      const bonus = scorer._getEventsBonus(goal, context);
      expect(bonus).toBe(0);
    });
  });

  describe('_getDangerPenalty', () => {
    test('should return 0 when no dangerPredictor', () => {
      const goal = { name: 'explore', location: { x: 0, y: 0, z: 0 } };
      const context = { dangerLevel: 0.8 };
      const penalty = scorer._getDangerPenalty(goal, context);
      expect(penalty).toBe(0);
    });

    test('should return 0 when goal has no location', () => {
      scorer.dangerPredictor = {};
      const goal = { name: 'explore' };
      const context = { dangerLevel: 0.8 };
      const penalty = scorer._getDangerPenalty(goal, context);
      expect(penalty).toBe(0);
    });

    test('should return penalty for high danger', () => {
      scorer.dangerPredictor = {};
      const goal = { name: 'explore', location: { x: 0, y: 0, z: 0 } };
      const context = { dangerLevel: 0.7 };
      const penalty = scorer._getDangerPenalty(goal, context);
      expect(penalty).toBe(0.7);
    });

    test('should return 0 for low danger', () => {
      scorer.dangerPredictor = {};
      const goal = { name: 'explore', location: { x: 0, y: 0, z: 0 } };
      const context = { dangerLevel: 0.3 };
      const penalty = scorer._getDangerPenalty(goal, context);
      expect(penalty).toBe(0);
    });
  });
});
