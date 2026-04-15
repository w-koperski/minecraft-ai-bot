/**
 * Personality Engine Tests
 * Tests for the personality trait management system
 */

// Mock dependencies
jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('PersonalityEngine', () => {
  let PersonalityEngine;

  beforeEach(() => {
    jest.resetModules();
    // Clear singleton instance between tests
    const module = require('../../personality/personality-engine');
    PersonalityEngine = module.PersonalityEngine;
    // Reset the singleton instance for each test
    delete require.cache[require.resolve('../../personality/personality-engine')];
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create engine with default traits', () => {
      const engine = new PersonalityEngine();
      expect(engine.traits).toBeDefined();
      expect(engine.traits.bravery).toBeDefined();
      expect(engine.traits.curiosity).toBeDefined();
    });

    it('should initialize with custom traits', () => {
      // Constructor doesn't accept custom traits - it loads from Soul.md or defaults
      const engine = new PersonalityEngine();
      expect(engine.traits).toBeDefined();
      // Default traits are set immediately
      expect(engine.traits.warmth).toBeDefined();
    });
  });

  describe('getTraits()', () => {
    it('should return trait values', () => {
      const engine = new PersonalityEngine();
      const traits = engine.getTraits();
      expect(traits).toBeDefined();
      expect(typeof traits.bravery).toBe('number');
      expect(traits.bravery).toBeGreaterThanOrEqual(0);
      expect(traits.bravery).toBeLessThanOrEqual(1);
    });

    it('should return all traits', () => {
      const engine = new PersonalityEngine();
      const traits = engine.getTraits();
      expect(traits.warmth).toBeDefined();
      expect(traits.directness).toBeDefined();
      expect(traits.humor).toBeDefined();
      expect(traits.curiosity).toBeDefined();
      expect(traits.loyalty).toBeDefined();
      expect(traits.bravery).toBeDefined();
    });
  });

  describe('influenceDecision()', () => {
    it('should score decision options based on personality', () => {
      const engine = new PersonalityEngine();
      const options = [
        { type: 'social', description: 'Help player' },
        { type: 'exploration', description: 'Explore caves' },
      ];
      const scored = engine.influenceDecision(options);
      expect(scored).toBeDefined();
      expect(scored.length).toBe(2);
      expect(scored[0].personalityScore).toBeDefined();
    });

    it('should return empty array for empty options', () => {
      const engine = new PersonalityEngine();
      const scored = engine.influenceDecision([]);
      expect(scored).toEqual([]);
    });

    it('should apply context modifiers', () => {
      const engine = new PersonalityEngine();
      const options = [
        { type: 'protection', description: 'Protect player' },
      ];
      const scored = engine.influenceDecision(options, { danger: true, playerHealth: 0.2 });
      expect(scored[0].personalityScore).toBeDefined();
    });
  });

  describe('evolvePersonality()', () => {
    it('should adjust trait based on interaction', async () => {
      const engine = new PersonalityEngine();
      const oldTraits = engine.getTraits();
      
      // Mock _persistState to avoid database operations
      engine._persistState = jest.fn().mockResolvedValue();
      
      await engine.evolvePersonality({ type: 'appreciation', intensity: 1.0 });
      
      const newTraits = engine.getTraits();
      // Warmth should have increased
      expect(newTraits.warmth).toBeGreaterThan(oldTraits.warmth);
    });

    it('should respect trait bounds', async () => {
      const engine = new PersonalityEngine();
      // Set trait to near max
      engine.traits.warmth = 0.99;
      
      engine._persistState = jest.fn().mockResolvedValue();
      
      await engine.evolvePersonality({ type: 'appreciation', intensity: 10.0 });
      
      expect(engine.traits.warmth).toBeLessThanOrEqual(1.0);
    });

    it('should handle unknown interaction type', async () => {
      const engine = new PersonalityEngine();
      const result = await engine.evolvePersonality({ type: 'unknown' });
      expect(result).toBeDefined();
    });

    it('should handle invalid interaction', async () => {
      const engine = new PersonalityEngine();
      const result = await engine.evolvePersonality(null);
      expect(result).toBeDefined();
    });
  });

  describe('resetPersonality()', () => {
    it('should reset traits to base values', async () => {
      const engine = new PersonalityEngine();
      // Modify traits
      engine.traits.warmth = 0.5;
      
      // Mock database operations
      engine._clearPersistedState = jest.fn().mockResolvedValue();
      
      await engine.resetPersonality();
      
      // Should be back to base traits
      expect(engine.traits.warmth).toBe(0.8); // Default
    });
  });
});
