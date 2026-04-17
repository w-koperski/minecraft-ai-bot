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

    test('should be backward compatible without driveScores', () => {
      const goal = { name: 'explore', importance: 5, category: 'exploration' };
      const score = scorer.scoreGoal(goal, {});
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    test('should apply drive bonus when driveScores provided', () => {
      const goal = { name: 'explore', importance: 5, category: 'exploration' };
      const scoreWithDrives = scorer.scoreGoal(goal, { driveScores: { curiosity: 100 } });
      const scoreWithoutDrives = scorer.scoreGoal(goal, {});
      expect(scoreWithDrives).toBeGreaterThan(scoreWithoutDrives);
    });

    test('should apply 20% weight to drive bonus', () => {
      const goal = { name: 'explore', importance: 5, category: 'exploration' };
      const score = scorer.scoreGoal(goal, { driveScores: { curiosity: 100 } });
      const baseScore = 0.5; // importance 5/10
      const expectedMaxScore = baseScore + (1.0 * 0.2); // base + driveBonus * 0.2
      expect(score).toBe(expectedMaxScore);
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

  describe('_getDriveBonus', () => {
    test('should return 0 when no driveScores in context', () => {
      const goal = { name: 'explore', category: 'exploration' };
      const context = {};
      const bonus = scorer._getDriveBonus(goal, context);
      expect(bonus).toBe(0);
    });

    test('should return 0 when driveScores is null', () => {
      const goal = { name: 'explore', category: 'exploration' };
      const context = { driveScores: null };
      const bonus = scorer._getDriveBonus(goal, context);
      expect(bonus).toBe(0);
    });

    test('should map exploration category to curiosity drive', () => {
      const goal = { name: 'explore', category: 'exploration' };
      const context = { driveScores: { curiosity: 80, survival: 30 } };
      const bonus = scorer._getDriveBonus(goal, context);
      expect(bonus).toBe(0.8); // 80/100 = 0.8
    });

    test('should map survival category to survival drive', () => {
      const goal = { name: 'survive', category: 'survival' };
      const context = { driveScores: { curiosity: 20, survival: 90 } };
      const bonus = scorer._getDriveBonus(goal, context);
      expect(bonus).toBe(0.9); // 90/100 = 0.9
    });

    test('should map combat category to survival drive', () => {
      const goal = { name: 'fight_mob', category: 'combat' };
      const context = { driveScores: { survival: 70 } };
      const bonus = scorer._getDriveBonus(goal, context);
      expect(bonus).toBe(0.7);
    });

    test('should map resources category to competence drive', () => {
      const goal = { name: 'gather', category: 'resources' };
      const context = { driveScores: { competence: 60 } };
      const bonus = scorer._getDriveBonus(goal, context);
      expect(bonus).toBe(0.6);
    });

    test('should map gathering category to competence drive', () => {
      const goal = { name: 'collect', category: 'gathering' };
      const context = { driveScores: { competence: 50 } };
      const bonus = scorer._getDriveBonus(goal, context);
      expect(bonus).toBe(0.5);
    });

    test('should map social category to social drive', () => {
      const goal = { name: 'talk', category: 'social' };
      const context = { driveScores: { social: 85 } };
      const bonus = scorer._getDriveBonus(goal, context);
      expect(bonus).toBe(0.85);
    });

    test('should map building category to goalOriented drive', () => {
      const goal = { name: 'build', category: 'building' };
      const context = { driveScores: { goalOriented: 75 } };
      const bonus = scorer._getDriveBonus(goal, context);
      expect(bonus).toBe(0.75);
    });

    test('should map general category to goalOriented drive', () => {
      const goal = { name: 'do_something', category: 'general' };
      const context = { driveScores: { goalOriented: 40 } };
      const bonus = scorer._getDriveBonus(goal, context);
      expect(bonus).toBe(0.4);
    });

    test('should default missing drive to 0', () => {
      const goal = { name: 'explore', category: 'exploration' };
      const context = { driveScores: { survival: 50 } }; // no curiosity
      const bonus = scorer._getDriveBonus(goal, context);
      expect(bonus).toBe(0);
    });

    test('should cap at 1.0 for drive scores over 100', () => {
      const goal = { name: 'explore', category: 'exploration' };
      const context = { driveScores: { curiosity: 150 } };
      const bonus = scorer._getDriveBonus(goal, context);
      expect(bonus).toBe(1.0);
    });

    test('should handle unknown category defaults to goalOriented', () => {
      const goal = { name: 'unknown', category: 'unknown_category' };
      const context = { driveScores: { goalOriented: 55 } };
      const bonus = scorer._getDriveBonus(goal, context);
      expect(bonus).toBe(0.55);
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
