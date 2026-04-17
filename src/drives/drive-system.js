/**
 * DriveSystem - Stateless drive scoring based on personality traits and context
 *
 * Computes 5 core drives (0-100) using rule-based scoring functions:
 * - survival: Urgency to maintain health, food, and safety
 * - curiosity: Desire to explore, discover, and learn
 * - competence: Drive to improve skills, gain resources, and master crafting
 * - social: Need for player interaction and cooperation
 * - goalOriented: Focus on achieving current objectives
 *
 * Each drive is weighted by personality traits (0.0-1.0 scale).
 * No persistent state — purely functional scoring from context.
 */

const logger = require('../utils/logger');

// Personality trait mapping to drives
// Each drive is influenced by specific traits with weights
const DRIVE_TRAIT_WEIGHTS = {
  survival: { bravery: -0.3, loyalty: 0.2, warmth: 0.1 },  // Low bravery = more cautious = higher survival
  curiosity: { curiosity: 0.7, bravery: 0.3 },
  competence: { directness: 0.3, curiosity: 0.4 },
  social: { warmth: 0.6, loyalty: 0.4, humor: 0.2 },
  goalOriented: { directness: 0.5, loyalty: 0.3 }
};

// Default personality traits (from PersonalityEngine defaults)
const DEFAULT_TRAITS = {
  warmth: 0.8,
  directness: 0.6,
  humor: 0.5,
  curiosity: 0.7,
  loyalty: 0.95,
  bravery: 0.6
};

class DriveSystem {
  /**
   * @param {object} personality - Personality traits (0.0-1.0 scale)
   *   { warmth, directness, humor, curiosity, loyalty, bravery }
   */
  constructor(personality = {}) {
    this.personality = {
      ...DEFAULT_TRAITS,
      ...personality
    };
    logger.debug('DriveSystem: Initialized', { personality: this.personality });
  }

  /**
   * Compute all 5 drive scores based on current context
   * @param {object} context - Current bot state
   *   health: number (0-20, Minecraft health)
   *   food: number (0-20, Minecraft hunger)
   *   inventory: Array of item objects
   *   recentEvents: Array of { type, ... } event objects
   *   playerProximity: number (blocks to nearest player, Infinity if none)
   *   unexploredBiomes: number (count of unexplored biomes)
   *   dangerLevel: number (0.0-1.0)
   *   currentGoal: object|null (active goal from commander)
   * @returns {{ survival: number, curiosity: number, competence: number, social: number, goalOriented: number }}
   *   Each score 0-100
   */
  computeDriveScores(context = {}) {
    const scores = {
      survival: this._computeSurvival(context),
      curiosity: this._computeCuriosity(context),
      competence: this._computeCompetence(context),
      social: this._computeSocial(context),
      goalOriented: this._computeGoalOriented(context)
    };

    logger.debug('DriveSystem: Computed drive scores', { scores });
    return scores;
  }

  /**
   * Survival drive — urgency to maintain health, food, and safety
   * High when: low health, low food, high danger
   * Personality: low bravery increases survival urgency
   */
  _computeSurvival(context) {
    const health = context.health ?? 20;
    const food = context.food ?? 20;
    const dangerLevel = context.dangerLevel ?? 0;

    // Base urgency from health (0-20 scale, low health = high urgency)
    const healthUrgency = Math.max(0, (20 - health) / 20) * 60;
    const criticalHealthBonus = health < 6 ? 30 : 0;
    const foodUrgency = Math.max(0, (20 - food) / 20) * 30;
    // Danger amplifies survival drive
    const dangerUrgency = dangerLevel * 40;

    const baseScore = healthUrgency + criticalHealthBonus + foodUrgency + dangerUrgency;
    return this._applyPersonalityWeight('survival', baseScore);
  }

  /**
   * Curiosity drive — desire to explore, discover, and learn
   * High when: unexplored biomes, safe conditions, high curiosity trait
   * Personality: curiosity trait directly amplifies this drive
   */
  _computeCuriosity(context) {
    const unexploredBiomes = context.unexploredBiomes ?? 0;
    const dangerLevel = context.dangerLevel ?? 0;
    const health = context.health ?? 20;

    // Base curiosity from unexplored areas (more unexplored = higher drive)
    const explorationBonus = Math.min(unexploredBiomes * 8, 50);
    // Safe conditions encourage exploration
    const safetyBonus = Math.max(0, (1 - dangerLevel)) * 20;
    // Good health enables exploration
    const healthBonus = (health / 20) * 10;

    const baseScore = explorationBonus + safetyBonus + healthBonus;
    return this._applyPersonalityWeight('curiosity', baseScore);
  }

  /**
   * Competence drive — drive to improve skills, gain resources, master crafting
   * High when: low inventory, no tools, potential for crafting
   * Personality: curiosity and directness amplify this drive
   */
  _computeCompetence(context) {
    const inventory = context.inventory ?? [];
    const health = context.health ?? 20;
    const recentEvents = context.recentEvents ?? [];

    // Scarcity drives competence (fewer items = more drive to collect)
    const itemCount = Array.isArray(inventory) ? inventory.length : 0;
    const scarcityBonus = Math.max(0, (10 - itemCount) / 10) * 40;

    // Check for tool deficiency
    const toolNames = ['pickaxe', 'axe', 'shovel', 'sword', 'hoe'];
    const hasTool = (name) => {
      if (!Array.isArray(inventory)) return false;
      return inventory.some(item => {
        const itemName = (typeof item === 'string') ? item : (item?.name || '');
        return itemName.toLowerCase().includes(name);
      });
    };
    const toolsOwned = toolNames.filter(hasTool).length;
    const toolDeficiencyBonus = Math.max(0, (5 - toolsOwned) / 5) * 30;

    // Health enables crafting
    const healthBonus = (health / 20) * 10;

    // Recent crafting failures increase competence drive
    const craftingFailures = recentEvents.filter(e => e.type === 'craft_failure').length;
    const failureBonus = Math.min(craftingFailures * 10, 20);

    const baseScore = scarcityBonus + toolDeficiencyBonus + healthBonus + failureBonus;
    return this._applyPersonalityWeight('competence', baseScore);
  }

  /**
   * Social drive — need for player interaction and cooperation
   * High when: players nearby, recent player messages, high warmth/loyalty
   * Personality: warmth and loyalty strongly amplify this drive
   */
  _computeSocial(context) {
    const playerProximity = context.playerProximity ?? Infinity;
    const recentEvents = context.recentEvents ?? [];

    // Proximity drives social (closer player = higher social drive)
    let proximityBonus = 0;
    if (playerProximity !== Infinity && playerProximity !== null) {
      // Within 5 blocks = high, within 30 = moderate, beyond 30 = low
      if (playerProximity <= 5) proximityBonus = 40;
      else if (playerProximity <= 16) proximityBonus = 25;
      else if (playerProximity <= 30) proximityBonus = 15;
      else proximityBonus = 5;
    }

    // Recent player messages increase social drive
    const playerMessages = recentEvents.filter(e =>
      e.type === 'player_message' || e.type === 'player_chat'
    ).length;
    const messageBonus = Math.min(playerMessages * 10, 30);

    // Low health creates appeal for help
    const health = context.health ?? 20;
    const helpSeekingBonus = Math.max(0, (20 - health) / 20) * 10;

    const baseScore = proximityBonus + messageBonus + helpSeekingBonus;
    return this._applyPersonalityWeight('social', baseScore);
  }

  /**
   * Goal-oriented drive — focus on achieving current objectives
   * High when: active goal exists, goal is urgent
   * Personality: directness and loyalty amplify this drive
   */
  _computeGoalOriented(context) {
    const currentGoal = context.currentGoal ?? null;
    const recentEvents = context.recentEvents ?? [];

    // No goal = low baseline
    if (!currentGoal) {
      const baseline = 10;
      return this._applyPersonalityWeight('goalOriented', baseline);
    }

    // Goal importance (0-10 scale from GoalScorer convention)
    const goalImportance = currentGoal.importance ?? 5;
    const importanceBonus = (goalImportance / 10) * 40;

    // Goal progress (0-1 scale, incomplete goals drive harder)
    const goalProgress = currentGoal.progress ?? 0;
    const progressBonus = (goalProgress > 0 && goalProgress < 1)
      ? 20  // In-progress = strong drive
      : 0;

    // Player-requested goals get bonus
    const playerGoalBonus = currentGoal.playerRequested ? 20 : 0;

    // Recent failures on same goal increase persistence
    const goalFailures = recentEvents.filter(e =>
      e.type === 'goal_failure' && e.goal === (currentGoal.name || currentGoal.type)
    ).length;
    const failureBonus = Math.min(goalFailures * 5, 15);

    const baseScore = importanceBonus + progressBonus + playerGoalBonus + failureBonus + 15;
    return this._applyPersonalityWeight('goalOriented', baseScore);
  }

  /**
   * Apply personality trait weights to a base drive score
   * @param {string} driveName - Name of the drive
   * @param {number} baseScore - Base score before personality
   * @returns {number} Score 0-100 after personality weighting
   */
  _applyPersonalityWeight(driveName, baseScore) {
    const weights = DRIVE_TRAIT_WEIGHTS[driveName] || {};
    let modifier = 1.0;

    for (const [trait, weight] of Object.entries(weights)) {
      const traitValue = this.personality[trait] ?? 0.5;
      // Offset by 0.5 so that mid-range traits don't change the score
      // Positive weight = higher trait = higher score (above 0.5)
      // Negative weight = higher trait = lower score (bravery reduces survival)
      modifier += (traitValue - 0.5) * weight;
    }

    // Clamp modifier to reasonable range (0.5 - 1.5)
    modifier = Math.max(0.5, Math.min(1.5, modifier));

    // Apply modifier and clamp to 0-100
    const finalScore = Math.max(0, Math.min(100, Math.round(baseScore * modifier)));
    return finalScore;
  }

  /**
   * Update personality traits (for when personality evolves)
   * @param {object} traits - New trait values to merge
   */
  updatePersonality(traits) {
    this.personality = {
      ...this.personality,
      ...traits
    };
    logger.debug('DriveSystem: Personality updated', { personality: this.personality });
  }
}

// Singleton instance with default personality
let instance = null;

/**
 * Get or create DriveSystem singleton
 * @param {object} personality - Optional personality traits for initialization
 * @returns {DriveSystem}
 */
function getInstance(personality) {
  if (!instance) {
    instance = new DriveSystem(personality);
  }
  return instance;
}

module.exports = {
  DriveSystem,
  getInstance,
  DEFAULT_TRAITS,
  DRIVE_TRAIT_WEIGHTS
};