/**
 * Personality Engine - Manages bot personality state and evolution
 * 
 * Loads Soul.md and manages personality dimensions (warmth, loyalty, etc.)
 * Provides trait-based decision scoring and bounded evolution
 * 
 * Exports:
 * - loadSoul(path) - Load personality from Soul.md
 * - getTraits() - Return current personality state
 * - influenceDecision(options, context) - Score options based on personality
 * - evolvePersonality(interaction) - Adjust traits based on player interactions
 * - resetPersonality() - Restore defaults from Soul.md
 */

const fs = require('fs').promises;
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const logger = require('../src/utils/logger');

// Trait bounds to prevent extreme drift
const TRAIT_MIN = 0.2;
const TRAIT_MAX = 1.0;

// Evolution rates from Soul.md
const EVOLUTION_TRIGGERS = {
  'appreciation': { trait: 'warmth', delta: 0.02 },
  'clear_goals': { trait: 'directness', delta: 0.01 },
  'shared_laughter': { trait: 'humor', delta: 0.02 },
  'exploration': { trait: 'curiosity', delta: 0.01 },
  'protection': { trait: 'loyalty', delta: 0.01 },
  'combat_together': { trait: 'bravery', delta: 0.01 }
};

// Default traits from Soul.md (Friendly Helper archetype)
const DEFAULT_TRAITS = {
  warmth: 0.8,
  directness: 0.6,
  humor: 0.5,
  curiosity: 0.7,
  loyalty: 0.95,
  bravery: 0.6
};

// Trait influence weights for decision types
const TRAIT_INFLUENCE_MATRIX = {
  // Protection actions (protect player, warn of danger)
  protection: { loyalty: 2.0, bravery: 1.5, warmth: 1.2 },
  // Exploration actions (explore new areas, discover resources)
  exploration: { curiosity: 2.0, bravery: 1.3 },
  // Social actions (chat, share resources)
  social: { warmth: 2.0, humor: 1.5, loyalty: 1.2 },
  // Combat actions (fight mobs, defend)
  combat: { bravery: 2.0, loyalty: 1.5 },
  // Information actions (give advice, share knowledge)
  information: { directness: 1.8, curiosity: 1.5, warmth: 1.2 }
};

class PersonalityEngine {
  constructor(dbPath = path.join(process.cwd(), 'state', 'memory.db')) {
    this.traits = { ...DEFAULT_TRAITS };
    this.baseTraits = { ...DEFAULT_TRAITS };
    this.loaded = false;
    this.soulPath = null;
    
    // Initialize database connection
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        logger.error('PersonalityEngine: Failed to connect to database', { error: err.message });
      } else {
        logger.debug('PersonalityEngine: Database connected', { dbPath });
        this._initTables();
      }
    });
  }

  /**
   * Initialize personality_state table if not exists
   */
  _initTables() {
    this.db.serialize(() => {
      this.db.run(`CREATE TABLE IF NOT EXISTS personality_state (
        trait_name TEXT PRIMARY KEY,
        current_value REAL NOT NULL,
        base_value REAL NOT NULL,
        last_updated INTEGER NOT NULL
      )`);
    });
  }

  /**
   * Load personality from Soul.md file
   * @param {string} soulPath - Path to Soul.md file
   * @returns {Promise<object>} - Loaded personality traits
   */
  async loadSoul(soulPath = path.join(process.cwd(), 'personality', 'Soul.md')) {
    try {
      const content = await fs.readFile(soulPath, 'utf8');
      this.soulPath = soulPath;
      
      // Parse personality dimensions from markdown table
      const traits = this._parsePersonalityTable(content);
      
      if (Object.keys(traits).length === 0) {
        logger.warn('PersonalityEngine: No traits found in Soul.md, using defaults');
        this.traits = { ...DEFAULT_TRAITS };
        this.baseTraits = { ...DEFAULT_TRAITS };
      } else {
        this.traits = { ...traits };
        this.baseTraits = { ...traits };
      }
      
      // Load persisted state from database (overrides Soul.md defaults)
      await this._loadPersistedState();
      
      this.loaded = true;
      logger.info('PersonalityEngine: Soul loaded', { 
        source: soulPath, 
        traits: this.traits 
      });
      
      return { ...this.traits };
    } catch (error) {
      logger.error('PersonalityEngine: Failed to load Soul.md', { 
        error: error.message, 
        path: soulPath 
      });
      // Use defaults on error
      this.traits = { ...DEFAULT_TRAITS };
      this.baseTraits = { ...DEFAULT_TRAITS };
      this.loaded = true;
      return { ...this.traits };
    }
  }

  /**
   * Parse personality dimensions from Soul.md markdown table
   * @param {string} content - Soul.md file content
   * @returns {object} - Parsed traits { warmth: 0.8, loyalty: 0.95, ... }
   */
  _parsePersonalityTable(content) {
    const traits = {};
    
    // Match table rows: | **dimension** | value | description |
    const tableRegex = /\|\s*\*\*(\w+)\*\*\s*\|\s*([\d.]+)\s*\|/g;
    let match;
    
    while ((match = tableRegex.exec(content)) !== null) {
      const traitName = match[1].toLowerCase();
      const traitValue = parseFloat(match[2]);
      
      // Validate trait is one of our known dimensions
      if (DEFAULT_TRAITS.hasOwnProperty(traitName) && !isNaN(traitValue)) {
        // Clamp to valid range
        traits[traitName] = Math.max(TRAIT_MIN, Math.min(TRAIT_MAX, traitValue));
      }
    }
    
    return traits;
  }

  /**
   * Load persisted personality state from database
   * @returns {Promise<void>}
   */
  async _loadPersistedState() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT trait_name, current_value, base_value FROM personality_state`,
        [],
        (err, rows) => {
          if (err) {
            logger.error('PersonalityEngine: Failed to load persisted state', { error: err.message });
            resolve();
            return;
          }
          
          if (rows && rows.length > 0) {
            rows.forEach(row => {
              const traitName = row.trait_name;
              if (this.traits.hasOwnProperty(traitName)) {
                this.traits[traitName] = row.current_value;
                this.baseTraits[traitName] = row.base_value;
              }
            });
            logger.debug('PersonalityEngine: Loaded persisted state', { count: rows.length });
          }
          resolve();
        }
      );
    });
  }

  /**
   * Persist current trait state to database
   * @returns {Promise<void>}
   */
  async _persistState() {
    const timestamp = Date.now();
    const promises = [];
    
    for (const [traitName, currentValue] of Object.entries(this.traits)) {
      const baseValue = this.baseTraits[traitName] || currentValue;
      
      promises.push(new Promise((resolve, reject) => {
        this.db.run(
          `INSERT OR REPLACE INTO personality_state (trait_name, current_value, base_value, last_updated)
           VALUES (?, ?, ?, ?)`,
          [traitName, currentValue, baseValue, timestamp],
          (err) => {
            if (err) {
              logger.error('PersonalityEngine: Failed to persist trait', { 
                error: err.message, 
                trait: traitName 
              });
              reject(err);
            } else {
              resolve();
            }
          }
        );
      }));
    }
    
    await Promise.allSettled(promises);
    logger.debug('PersonalityEngine: State persisted', { traits: Object.keys(this.traits) });
  }

  /**
   * Get current personality traits
   * @returns {object} - Current trait values { warmth: 0.8, loyalty: 0.95, ... }
   */
  getTraits() {
    if (!this.loaded) {
      logger.warn('PersonalityEngine: getTraits called before loadSoul');
    }
    return { ...this.traits };
  }

  /**
   * Score decision options based on personality traits
   * @param {Array} options - Array of decision options with 'type' field
   * @param {object} context - Decision context { playerHealth, danger, resource, etc. }
   * @returns {Array} - Options with added 'personalityScore' field (sorted descending)
   */
  influenceDecision(options, context = {}) {
    if (!Array.isArray(options) || options.length === 0) {
      return [];
    }
    
    // Score each option based on personality traits
    const scoredOptions = options.map(option => {
      const optionType = option.type || 'general';
      const influenceWeights = TRAIT_INFLUENCE_MATRIX[optionType] || {};
      
      // Calculate personality alignment score
      let personalityScore = 1.0;
      
      for (const [trait, weight] of Object.entries(influenceWeights)) {
        if (this.traits[trait] !== undefined) {
          personalityScore += (this.traits[trait] - 0.5) * weight;
        }
      }
      
      // Apply context modifiers
      if (context.danger && this.traits.bravery < 0.5) {
        personalityScore *= 0.8; // Cautious bots avoid danger more
      }
      
      if (context.playerHealth && context.playerHealth < 0.3 && this.traits.loyalty > 0.7) {
        personalityScore *= 1.3; // Loyal bots prioritize player safety
      }
      
      return {
        ...option,
        personalityScore: Math.max(0.1, Math.min(2.0, personalityScore))
      };
    });
    
    // Sort by personality score (descending)
    scoredOptions.sort((a, b) => b.personalityScore - a.personalityScore);
    
    logger.debug('PersonalityEngine: Decision influenced', {
      topOption: scoredOptions[0]?.type || 'none',
      topScore: scoredOptions[0]?.personalityScore || 0,
      optionCount: scoredOptions.length
    });
    
    return scoredOptions;
  }

  /**
   * Evolve personality traits based on player interactions
   * @param {object} interaction - Interaction data { type, intensity, context }
   * @returns {Promise<object>} - Updated traits after evolution
   */
  async evolvePersonality(interaction) {
    if (!interaction || !interaction.type) {
      logger.warn('PersonalityEngine: Invalid interaction provided');
      return { ...this.traits };
    }
    
    const trigger = EVOLUTION_TRIGGERS[interaction.type];
    
    if (!trigger) {
      logger.debug('PersonalityEngine: Unknown interaction type', { type: interaction.type });
      return { ...this.traits };
    }
    
    const { trait, delta } = trigger;
    const intensity = interaction.intensity || 1.0;
    const actualDelta = delta * intensity;
    
    // Apply evolution with bounds checking
    const oldValue = this.traits[trait];
    let newValue = oldValue + actualDelta;
    
    // Enforce bounds (TRAIT_MIN to TRAIT_MAX)
    newValue = Math.max(TRAIT_MIN, Math.min(TRAIT_MAX, newValue));
    
    // Check if value actually changed (bounded)
    const wasBounded = newValue === TRAIT_MIN || newValue === TRAIT_MAX;
    
    this.traits[trait] = newValue;
    
    logger.info('PersonalityEngine: Trait evolved', {
      trait,
      oldValue: oldValue.toFixed(3),
      delta: actualDelta.toFixed(3),
      newValue: newValue.toFixed(3),
      bounded: wasBounded
    });
    
    // Persist to database
    await this._persistState();
    
    return { ...this.traits };
  }

  /**
   * Reset personality to defaults from Soul.md
   * @returns {Promise<object>} - Reset traits
   */
  async resetPersonality() {
    const oldTraits = { ...this.traits };
    
    // Reset to base traits (from Soul.md)
    this.traits = { ...this.baseTraits };
    
    // Clear persisted state
    await this._clearPersistedState();
    
    logger.info('PersonalityEngine: Personality reset', {
      from: oldTraits,
      to: this.traits
    });
    
    return { ...this.traits };
  }

  /**
   * Clear persisted state from database
   * @returns {Promise<void>}
   */
  async _clearPersistedState() {
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM personality_state`,
        [],
        (err) => {
          if (err) {
            logger.error('PersonalityEngine: Failed to clear persisted state', { error: err.message });
            reject(err);
          } else {
            logger.debug('PersonalityEngine: Persisted state cleared');
            resolve();
          }
        }
      );
    });
  }

  /**
   * Close database connection
   * @returns {Promise<void>}
   */
  async close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          logger.error('PersonalityEngine: Failed to close database', { error: err.message });
          reject(err);
        } else {
          logger.debug('PersonalityEngine: Database closed');
          resolve();
        }
      });
    });
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create PersonalityEngine singleton
 * @param {string} dbPath - Optional database path
 * @returns {PersonalityEngine}
 */
function getInstance(dbPath) {
  if (!instance) {
    instance = new PersonalityEngine(dbPath);
  }
  return instance;
}

module.exports = {
  PersonalityEngine,
  getInstance,
  loadSoul: async (soulPath) => {
    const engine = getInstance();
    return engine.loadSoul(soulPath);
  },
  getTraits: () => {
    const engine = getInstance();
    return engine.getTraits();
  },
  influenceDecision: (options, context) => {
    const engine = getInstance();
    return engine.influenceDecision(options, context);
  },
  evolvePersonality: async (interaction) => {
    const engine = getInstance();
    return engine.evolvePersonality(interaction);
  },
  resetPersonality: async () => {
    const engine = getInstance();
    return engine.resetPersonality();
  },
  close: async () => {
    const engine = getInstance();
    return engine.close();
  },
  // Constants exposed for testing
  TRAIT_MIN,
  TRAIT_MAX,
  DEFAULT_TRAITS,
  EVOLUTION_TRIGGERS
};
