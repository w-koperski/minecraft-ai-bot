const { DriveSystem, getInstance, DEFAULT_TRAITS, DRIVE_TRAIT_WEIGHTS } = require('../../../src/drives/drive-system');

jest.mock('../../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('DriveSystem', () => {
  let driveSystem;

  beforeEach(() => {
    driveSystem = new DriveSystem({ warmth: 0.8, curiosity: 0.7 });
  });

  describe('constructor', () => {
    test('should accept personality traits', () => {
      const ds = new DriveSystem({ warmth: 0.9, bravery: 0.3 });
      expect(ds.personality.warmth).toBe(0.9);
      expect(ds.personality.bravery).toBe(0.3);
    });

    test('should use default traits for missing values', () => {
      const ds = new DriveSystem({ warmth: 0.5 });
      expect(ds.personality.warmth).toBe(0.5);
      expect(ds.personality.curiosity).toBe(DEFAULT_TRAITS.curiosity);
      expect(ds.personality.loyalty).toBe(DEFAULT_TRAITS.loyalty);
    });

    test('should use all defaults when no personality provided', () => {
      const ds = new DriveSystem();
      expect(ds.personality).toEqual(DEFAULT_TRAITS);
    });
  });

  describe('computeDriveScores', () => {
    test('should return all 5 drive scores', () => {
      const scores = driveSystem.computeDriveScores({});
      expect(scores).toHaveProperty('survival');
      expect(scores).toHaveProperty('curiosity');
      expect(scores).toHaveProperty('competence');
      expect(scores).toHaveProperty('social');
      expect(scores).toHaveProperty('goalOriented');
    });

    test('should return scores between 0 and 100', () => {
      const scores = driveSystem.computeDriveScores({
        health: 5,
        food: 3,
        dangerLevel: 0.9,
        inventory: [],
        unexploredBiomes: 10,
        recentEvents: [{ type: 'death' }],
        playerProximity: 3,
        currentGoal: { importance: 10, progress: 0.5 }
      });
      for (const key of Object.keys(scores)) {
        expect(scores[key]).toBeGreaterThanOrEqual(0);
        expect(scores[key]).toBeLessThanOrEqual(100);
      }
    });

    test('should return integer scores', () => {
      const scores = driveSystem.computeDriveScores({ health: 10 });
      for (const key of Object.keys(scores)) {
        expect(Number.isInteger(scores[key])).toBe(true);
      }
    });

    test('should be stateless - same input gives same output', () => {
      const context = { health: 10, food: 15 };
      const scores1 = driveSystem.computeDriveScores(context);
      const scores2 = driveSystem.computeDriveScores(context);
      expect(scores1).toEqual(scores2);
    });
  });

  describe('survival drive', () => {
    test('should increase survival drive when health is low', () => {
      const lowHealth = driveSystem.computeDriveScores({ health: 5 });
      const highHealth = driveSystem.computeDriveScores({ health: 20 });
      expect(lowHealth.survival).toBeGreaterThan(highHealth.survival);
    });

    test('should increase survival drive when food is low', () => {
      const lowFood = driveSystem.computeDriveScores({ food: 3 });
      const highFood = driveSystem.computeDriveScores({ food: 20 });
      expect(lowFood.survival).toBeGreaterThan(highFood.survival);
    });

    test('should increase survival drive with high danger', () => {
      const highDanger = driveSystem.computeDriveScores({ dangerLevel: 0.9 });
      const lowDanger = driveSystem.computeDriveScores({ dangerLevel: 0 });
      expect(highDanger.survival).toBeGreaterThan(lowDanger.survival);
    });

    test('should produce high survival score (>70) for critical conditions', () => {
      const scores = driveSystem.computeDriveScores({ health: 5, food: 10, dangerLevel: 0.8 });
      expect(scores.survival).toBeGreaterThan(70);
    });

    test('low bravery personality should amplify survival drive', () => {
      const cautious = new DriveSystem({ bravery: 0.2, warmth: 0.5, loyalty: 0.5, curiosity: 0.5, directness: 0.5, humor: 0.5 });
      const brave = new DriveSystem({ bravery: 1.0, warmth: 0.5, loyalty: 0.5, curiosity: 0.5, directness: 0.5, humor: 0.5 });
      const context = { health: 10, food: 10 };
      const cautiousScore = cautious.computeDriveScores(context).survival;
      const braveScore = brave.computeDriveScores(context).survival;
      expect(cautiousScore).toBeGreaterThan(braveScore);
    });
  });

  describe('curiosity drive', () => {
    test('should increase curiosity drive with unexplored biomes', () => {
      const exploring = driveSystem.computeDriveScores({ unexploredBiomes: 5, health: 20 });
      const noExplore = driveSystem.computeDriveScores({ unexploredBiomes: 0, health: 20 });
      expect(exploring.curiosity).toBeGreaterThan(noExplore.curiosity);
    });

    test('should decrease curiosity drive with high danger', () => {
      const safe = driveSystem.computeDriveScores({ dangerLevel: 0, health: 20, unexploredBiomes: 3 });
      const dangerous = driveSystem.computeDriveScores({ dangerLevel: 0.9, health: 20, unexploredBiomes: 3 });
      expect(safe.curiosity).toBeGreaterThan(dangerous.curiosity);
    });

    test('high curiosity trait should amplify curiosity drive', () => {
      const curious = new DriveSystem({ curiosity: 1.0, warmth: 0.5, loyalty: 0.5, bravery: 0.5, directness: 0.5, humor: 0.5 });
      const notCurious = new DriveSystem({ curiosity: 0.2, warmth: 0.5, loyalty: 0.5, bravery: 0.5, directness: 0.5, humor: 0.5 });
      const context = { health: 20, unexploredBiomes: 5 };
      expect(curious.computeDriveScores(context).curiosity).toBeGreaterThan(notCurious.computeDriveScores(context).curiosity);
    });

    test('should produce curiosity > 60 with high curiosity trait and unexplored biomes', () => {
      const ds = new DriveSystem({ curiosity: 0.9 });
      const scores = ds.computeDriveScores({ health: 20, unexploredBiomes: 5 });
      expect(scores.curiosity).toBeGreaterThan(60);
    });
  });

  describe('competence drive', () => {
    test('should increase competence drive with empty inventory', () => {
      const empty = driveSystem.computeDriveScores({ inventory: [], health: 20 });
      const full = driveSystem.computeDriveScores({ inventory: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], health: 20 });
      expect(empty.competence).toBeGreaterThan(full.competence);
    });

    test('should increase competence drive with no tools', () => {
      const noTools = driveSystem.computeDriveScores({
        inventory: [{ name: 'dirt' }, { name: 'cobblestone' }],
        health: 20
      });
      const withTools = driveSystem.computeDriveScores({
        inventory: [{ name: 'diamond_pickaxe' }, { name: 'iron_sword' }],
        health: 20
      });
      expect(noTools.competence).toBeGreaterThan(withTools.competence);
    });

    test('should increase competence drive with recent crafting failures', () => {
      const withFailures = driveSystem.computeDriveScores({
        inventory: [],
        health: 20,
        recentEvents: [{ type: 'craft_failure' }, { type: 'craft_failure' }]
      });
      const noFailures = driveSystem.computeDriveScores({
        inventory: [],
        health: 20,
        recentEvents: []
      });
      expect(withFailures.competence).toBeGreaterThan(noFailures.competence);
    });
  });

  describe('social drive', () => {
    test('should increase social drive when player is nearby', () => {
      const nearby = driveSystem.computeDriveScores({ playerProximity: 3 });
      const far = driveSystem.computeDriveScores({ playerProximity: 50 });
      expect(nearby.social).toBeGreaterThan(far.social);
    });

    test('should increase social drive with recent player messages', () => {
      const withMessages = driveSystem.computeDriveScores({
        recentEvents: [
          { type: 'player_message' },
          { type: 'player_message' },
          { type: 'player_message' }
        ]
      });
      const noMessages = driveSystem.computeDriveScores({ recentEvents: [] });
      expect(withMessages.social).toBeGreaterThan(noMessages.social);
    });

    test('should have low social drive when no player nearby and no messages', () => {
      const scores = driveSystem.computeDriveScores({
        playerProximity: Infinity,
        recentEvents: []
      });
      expect(scores.social).toBeLessThan(30);
    });

    test('high warmth personality should amplify social drive', () => {
      const warm = new DriveSystem({ warmth: 1.0, loyalty: 0.5, humor: 0.5, curiosity: 0.5, bravery: 0.5, directness: 0.5 });
      const cold = new DriveSystem({ warmth: 0.2, loyalty: 0.5, humor: 0.5, curiosity: 0.5, bravery: 0.5, directness: 0.5 });
      const context = { playerProximity: 10 };
      expect(warm.computeDriveScores(context).social).toBeGreaterThan(cold.computeDriveScores(context).social);
    });
  });

  describe('goalOriented drive', () => {
    test('should have low baseline when no goal exists', () => {
      const scores = driveSystem.computeDriveScores({ currentGoal: null });
      expect(scores.goalOriented).toBeLessThan(20);
    });

    test('should increase goal drive with important goal', () => {
      const important = driveSystem.computeDriveScores({ currentGoal: { importance: 10 } });
      const unimportant = driveSystem.computeDriveScores({ currentGoal: { importance: 2 } });
      expect(important.goalOriented).toBeGreaterThan(unimportant.goalOriented);
    });

    test('should increase goal drive for player-requested goals', () => {
      const playerGoal = driveSystem.computeDriveScores({ currentGoal: { importance: 5, playerRequested: true } });
      const autoGoal = driveSystem.computeDriveScores({ currentGoal: { importance: 5, playerRequested: false } });
      expect(playerGoal.goalOriented).toBeGreaterThan(autoGoal.goalOriented);
    });

    test('should increase goal drive for in-progress goals', () => {
      const inProgress = driveSystem.computeDriveScores({ currentGoal: { importance: 5, progress: 0.5 } });
      const notStarted = driveSystem.computeDriveScores({ currentGoal: { importance: 5, progress: 0 } });
      expect(inProgress.goalOriented).toBeGreaterThan(notStarted.goalOriented);
    });

    test('should increase goal drive with goal failures', () => {
      const withFailures = driveSystem.computeDriveScores({
        currentGoal: { name: 'gather_wood', importance: 5 },
        recentEvents: [{ type: 'goal_failure', goal: 'gather_wood' }]
      });
      const noFailures = driveSystem.computeDriveScores({
        currentGoal: { name: 'gather_wood', importance: 5 },
        recentEvents: []
      });
      expect(withFailures.goalOriented).toBeGreaterThan(noFailures.goalOriented);
    });
  });

  describe('updatePersonality', () => {
    test('should merge new traits with existing personality', () => {
      driveSystem.updatePersonality({ curiosity: 0.1, warmth: 0.3 });
      expect(driveSystem.personality.curiosity).toBe(0.1);
      expect(driveSystem.personality.warmth).toBe(0.3);
      expect(driveSystem.personality.loyalty).toBe(DEFAULT_TRAITS.loyalty);
    });
  });

  describe('getInstance', () => {
    test('should return a singleton instance', () => {
      const instance1 = getInstance();
      const instance2 = getInstance();
      expect(instance1).toBe(instance2);
    });

    test('should create instance with provided personality', () => {
      jest.resetModules();

      const freshModule = require('../../../src/drives/drive-system');
      const ds = freshModule.getInstance({ warmth: 0.1 });
      expect(ds.personality.warmth).toBe(0.1);
    });
  });

  describe('DRIVE_TRAIT_WEIGHTS', () => {
    test('should have weights for all 5 drives', () => {
      const drives = ['survival', 'curiosity', 'competence', 'social', 'goalOriented'];
      for (const drive of drives) {
        expect(DRIVE_TRAIT_WEIGHTS).toHaveProperty(drive);
      }
    });

    test('should reference only valid personality traits', () => {
      const validTraits = Object.keys(DEFAULT_TRAITS);
      for (const [drive, weights] of Object.entries(DRIVE_TRAIT_WEIGHTS)) {
        for (const trait of Object.keys(weights)) {
          expect(validTraits).toContain(trait);
        }
      }
    });
  });

  describe('edge cases', () => {
    test('should handle empty context', () => {
      const scores = driveSystem.computeDriveScores({});
      for (const key of Object.keys(scores)) {
        expect(scores[key]).toBeGreaterThanOrEqual(0);
        expect(scores[key]).toBeLessThanOrEqual(100);
      }
    });

    test('should handle undefined context gracefully', () => {
      const scores = driveSystem.computeDriveScores(undefined);
      for (const key of Object.keys(scores)) {
        expect(scores[key]).toBeGreaterThanOrEqual(0);
        expect(scores[key]).toBeLessThanOrEqual(100);
      }
    });

    test('should handle Infinity playerProximity', () => {
      const scores = driveSystem.computeDriveScores({ playerProximity: Infinity });
      expect(scores.social).toBeGreaterThanOrEqual(0);
      expect(scores.social).toBeLessThanOrEqual(100);
    });

    test('should handle null currentGoal', () => {
      const scores = driveSystem.computeDriveScores({ currentGoal: null });
      expect(scores.goalOriented).toBeLessThan(20);
    });

    test('should handle string inventory items', () => {
      const scores = driveSystem.computeDriveScores({
        inventory: ['diamond_pickaxe', 'iron_sword'],
        health: 20
      });
      expect(scores.competence).toBeGreaterThanOrEqual(0);
    });

    test('should handle object inventory items', () => {
      const scores = driveSystem.computeDriveScores({
        inventory: [{ name: 'diamond_pickaxe' }, { name: 'iron_sword' }],
        health: 20
      });
      expect(scores.competence).toBeGreaterThanOrEqual(0);
    });
  });
});