const logger = require('../utils/logger');
const StateManager = require('../utils/state-manager');

class ActionAwareness {
  constructor(bot, vision) {
    this.bot = bot;
    this.vision = vision;
    this.stateManager = new StateManager();
    this.actionHistory = [];
    this.maxHistory = 50;
    this.confidenceHistory = [];
    this.maxConfidenceHistory = 100;
  }

  async executeWithVerification(action, expectedOutcome) {
    const startState = this.vision.extractState();
    const startTime = Date.now();

    // Calculate confidence before execution
    const context = this._extractActionContext(action, startState);
    const { confidence, fallback } = this._calculateConfidence(action, context);

    // Check confidence threshold
    if (confidence < 0.3) {
      logger.warn('Action confidence too low, aborting', { action, confidence, fallback });
      return { 
        success: false, 
        reason: 'low_confidence', 
        confidence, 
        fallback,
        actual: null 
      };
    }

    // Log low confidence warnings
    if (confidence < 0.5) {
      logger.warn('Low confidence action proceeding with caution', { action, confidence, fallback });
    }

    try {
      await this._performAction(action);

      // Use multi-step verification
      const verification = await this._verifyMultiStep(action, startState);

      const endState = this.vision.extractState();
      const actualOutcome = this._extractOutcome(startState, endState, action);

      const match = this._verifyOutcome(expectedOutcome, actualOutcome);

      // Track confidence vs actual success
      this._recordConfidenceResult(confidence, match);

      this.actionHistory.push({
        action,
        expected: expectedOutcome,
        actual: actualOutcome,
        match,
        confidence,
        timestamp: startTime,
        duration: Date.now() - startTime
      });

      if (this.actionHistory.length > this.maxHistory) {
        this.actionHistory.shift();
      }

      if (!match || !verification.success) {
        logger.warn('Action outcome mismatch', {
          action,
          expected: expectedOutcome,
          actual: actualOutcome,
          confidence,
          verificationChecks: verification.checks
        });

        await this.stateManager.write('action_error', {
          action,
          expected: expectedOutcome,
          actual: actualOutcome,
          confidence,
          verificationChecks: verification.checks,
          timestamp: Date.now(),
          severity: this._calculateSeverity(expectedOutcome, actualOutcome)
        });

        return { 
          success: false, 
          reason: verification.reason || 'outcome_mismatch', 
          actual: actualOutcome,
          confidence,
          verificationChecks: verification.checks
        };
      }

      return { success: true, outcome: actualOutcome, confidence };

    } catch (error) {
      logger.error('Action execution failed', { action, error, confidence });
      
      // Track failed execution
      this._recordConfidenceResult(confidence, false);
      
      return { 
        success: false, 
        reason: 'execution_error', 
        error: error.message,
        confidence 
      };
    }
  }

  /**
   * Extract context for confidence calculation
   */
  _extractActionContext(action, state) {
    const context = {};

    // Extract position and health
    if (state.self) {
      context.health = state.self.health;
      context.position = state.self.position;
    }

    // Extract nearby entities
    if (state.entities) {
      context.hostileMobs = state.entities.hostile ? state.entities.hostile.length : 0;
      context.nearbyLava = state.blocks && state.blocks.hazardous ? 
        state.blocks.hazardous.filter(b => b.type === 'lava').length : 0;
    }

    // Extract inventory
    if (state.self && state.self.inventory) {
      const inventory = state.self.inventory;
      
      // Check for tools
      if (action.type === 'dig') {
        const heldItem = state.self.held_item;
        if (heldItem) {
          context.tool = heldItem.name;
          if (heldItem.max_durability && heldItem.durability) {
            context.toolDurability = heldItem.durability / heldItem.max_durability;
          }
        }
        
        // Check block distance
        if (state.blocks && state.blocks.valuable) {
          const targetBlock = state.blocks.valuable.find(b => b.type === action.blockType);
          if (targetBlock) {
            context.blockDistance = targetBlock.distance;
          }
        }
      }

      // Check for crafting materials
      if (action.type === 'craft') {
        context.hasCraftingTable = inventory.some(i => i.name === 'crafting_table');
        context.needsCraftingTable = this._recipeNeedsCraftingTable(action.recipe);
      }
    }

    // Check for obstacles in move direction
    if (action.type === 'move' && state.blocks) {
      context.obstacles = state.blocks.hazardous || [];
    }

    return context;
  }

  /**
   * Check if recipe needs crafting table
   */
  _recipeNeedsCraftingTable(recipe) {
    const needsTable = ['diamond_pickaxe', 'iron_pickaxe', 'stone_pickaxe', 
                        'diamond_axe', 'iron_axe', 'stone_axe',
                        'diamond_sword', 'iron_sword', 'stone_sword'];
    return needsTable.includes(recipe);
  }

  /**
   * Record confidence vs actual success for correlation tracking
   */
  _recordConfidenceResult(confidence, success) {
    this.confidenceHistory.push({
      confidence,
      success,
      timestamp: Date.now()
    });

    if (this.confidenceHistory.length > this.maxConfidenceHistory) {
      this.confidenceHistory.shift();
    }
  }

  /**
   * Get confidence vs success correlation
   */
  getConfidenceCorrelation() {
    if (this.confidenceHistory.length === 0) {
      return { correlation: null, samples: 0 };
    }

    // Calculate Pearson correlation coefficient
    const n = this.confidenceHistory.length;
    const confidences = this.confidenceHistory.map(c => c.confidence);
    const successes = this.confidenceHistory.map(c => c.success ? 1 : 0);

    const meanConf = confidences.reduce((a, b) => a + b, 0) / n;
    const meanSucc = successes.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denomConf = 0;
    let denomSucc = 0;

    for (let i = 0; i < n; i++) {
      const diffConf = confidences[i] - meanConf;
      const diffSucc = successes[i] - meanSucc;
      numerator += diffConf * diffSucc;
      denomConf += diffConf * diffConf;
      denomSucc += diffSucc * diffSucc;
    }

    const denom = Math.sqrt(denomConf * denomSucc);
    const correlation = denom !== 0 ? numerator / denom : 0;

    return {
      correlation: Math.round(correlation * 1000) / 1000,
      samples: n,
      meanConfidence: Math.round(meanConf * 1000) / 1000,
      successRate: Math.round(meanSucc * 1000) / 1000
    };
  }

  async _performAction(action) {
    switch (action.type) {
      case 'move':
        this.bot.setControlState(action.direction, true);
        await this._wait(action.duration || 500);
        this.bot.clearControlStates();
        break;

      case 'dig':
        const block = this.bot.findBlock({
          matching: (b) => b.name === action.blockType,
          maxDistance: 4
        });
        if (block) {
          await this.bot.dig(block);
        } else {
          throw new Error(`Block ${action.blockType} not found`);
        }
        break;

      case 'place':
        break;

      case 'craft':
        break;

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  _extractOutcome(startState, endState, action) {
    switch (action.type) {
      case 'move':
        return {
          positionChange: {
            x: endState.position.x - startState.position.x,
            z: endState.position.z - startState.position.z
          },
          moved: this._distance(startState.position, endState.position) > 0.5
        };

      case 'dig':
        const inventoryDiff = this._inventoryDiff(startState.inventory, endState.inventory);
        return {
          itemsGained: inventoryDiff.gained,
          blockRemoved: inventoryDiff.gained.length > 0
        };

      case 'craft':
        const craftDiff = this._inventoryDiff(startState.inventory, endState.inventory);
        return {
          itemsCrafted: craftDiff.gained,
          materialsUsed: craftDiff.lost
        };

      default:
        return {};
    }
  }

  _verifyOutcome(expected, actual) {
    if (expected.moved !== undefined && expected.moved !== actual.moved) {
      return false;
    }

    if (expected.blockRemoved !== undefined && expected.blockRemoved !== actual.blockRemoved) {
      return false;
    }

    if (expected.itemsGained && actual.itemsGained) {
      const expectedItems = expected.itemsGained.map(i => i.name).sort();
      const actualItems = actual.itemsGained.map(i => i.name).sort();
      if (JSON.stringify(expectedItems) !== JSON.stringify(actualItems)) {
        return false;
      }
    }

    return true;
  }

  _calculateSeverity(expected, actual) {
    if (expected.blockRemoved && !actual.blockRemoved) return 'high';
    if (expected.moved && !actual.moved) return 'medium';
    return 'low';
  }

  _inventoryDiff(before, after) {
    const beforeMap = new Map(before.map(i => [i.name, i.count]));
    const afterMap = new Map(after.map(i => [i.name, i.count]));

    const gained = [];
    const lost = [];

    afterMap.forEach((count, name) => {
      const beforeCount = beforeMap.get(name) || 0;
      if (count > beforeCount) {
        gained.push({ name, count: count - beforeCount });
      }
    });

    beforeMap.forEach((count, name) => {
      const afterCount = afterMap.get(name) || 0;
      if (count > afterCount) {
        lost.push({ name, count: count - afterCount });
      }
    });

    return { gained, lost };
  }

  _distance(pos1, pos2) {
    return Math.sqrt(
      Math.pow(pos1.x - pos2.x, 2) +
      Math.pow(pos1.z - pos2.z, 2)
    );
  }

  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate confidence score for an action based on context
   * @param {Object} action - Action to evaluate
   * @param {Object} context - Current game state context
   * @returns {Object} { confidence: 0.0-1.0, fallback: {...} }
   */
  _calculateConfidence(action, context) {
    let confidence = 0.5;
    let fallback = { action: 'proceed', reason: 'normal_execution' };

    switch (action.type) {
      case 'move':
        confidence = this._calculateMoveConfidence(action, context);
        break;

      case 'dig':
        confidence = this._calculateDigConfidence(action, context);
        break;

      case 'craft':
        confidence = this._calculateCraftConfidence(action, context);
        break;

      default:
        confidence = 0.5;
    }

    // Determine fallback strategy based on confidence level
    if (confidence < 0.3) {
      fallback = { action: 'abort', reason: 'low_confidence' };
    } else if (confidence < 0.5) {
      fallback = { action: 'retry_different', reason: 'moderate_confidence' };
    } else if (confidence < 0.7) {
      fallback = { action: 'proceed_with_caution', reason: 'acceptable_confidence' };
    }

    return { confidence, fallback };
  }

  /**
   * Calculate confidence for move actions
   */
  _calculateMoveConfidence(action, context) {
    let confidence = 0.8;

    // Check for obstacles in direction
    if (context.obstacles && context.obstacles.length > 0) {
      confidence -= 0.3;
    }

    // Check for nearby lava
    if (context.nearbyLava && context.nearbyLava < 8) {
      confidence -= 0.2;
    }

    // Check for hostile mobs
    if (context.hostileMobs && context.hostileMobs < 5) {
      confidence -= 0.2;
    }

    // Check health
    if (context.health && context.health < 6) {
      confidence -= 0.1;
    }

    return Math.max(0.0, Math.min(1.0, confidence));
  }

  /**
   * Calculate confidence for dig actions
   */
  _calculateDigConfidence(action, context) {
    let confidence = 0.7;

    // Check if correct tool equipped
    if (context.tool) {
      const toolBonus = this._getToolBonus(action.blockType, context.tool);
      confidence += toolBonus;
    } else {
      confidence -= 0.4;
    }

    // Check if block is in range
    if (context.blockDistance && context.blockDistance > 4) {
      confidence -= 0.2;
    }

    // Check tool durability
    if (context.toolDurability && context.toolDurability < 0.1) {
      confidence -= 0.1;
    }

    return Math.max(0.0, Math.min(1.0, confidence));
  }

  /**
   * Calculate confidence for craft actions
   */
  _calculateCraftConfidence(action, context) {
    let confidence = 0.9;

    // Check if materials available
    if (context.missingMaterials && context.missingMaterials.length > 0) {
      confidence -= 0.5;
    }

    // Check if crafting table needed
    if (context.needsCraftingTable && !context.hasCraftingTable) {
      confidence -= 0.2;
    }

    return Math.max(0.0, Math.min(1.0, confidence));
  }

  /**
   * Get tool bonus for block type
   */
  _getToolBonus(blockType, tool) {
    const toolEfficiency = {
      diamond_pickaxe: { diamond_ore: 0.2, gold_ore: 0.2, iron_ore: 0.2, stone: 0.1 },
      iron_pickaxe: { diamond_ore: 0.1, gold_ore: 0.15, iron_ore: 0.15, stone: 0.1 },
      stone_pickaxe: { gold_ore: 0.05, iron_ore: 0.05, stone: 0.1 },
      wooden_pickaxe: { stone: 0.05 },
      diamond_axe: { oak_log: 0.2, birch_log: 0.2 },
      iron_axe: { oak_log: 0.15, birch_log: 0.15 },
      stone_axe: { oak_log: 0.1 },
      wooden_axe: { oak_log: 0.05 }
    };

    if (toolEfficiency[tool] && toolEfficiency[tool][blockType]) {
      return toolEfficiency[tool][blockType];
    }

    return -0.4; // Wrong tool penalty
  }

  /**
   * Verify action outcome at multiple time intervals
   * @param {Object} action - Action being executed
   * @param {Object} startState - Initial state before action
   * @returns {Object} { success: boolean, checks: [...], reason: string }
   */
  async _verifyMultiStep(action, startState) {
    const checks = [];
    let success = true;
    let failureReason = null;

    // Check at 100ms - did action start?
    await this._wait(100);
    const state100ms = this.vision.extractState();
    const started = this._checkActionStarted(action, startState, state100ms);
    checks.push({ time: 100, type: 'started', passed: started });

    if (!started) {
      return {
        success: false,
        checks,
        reason: 'action_not_started'
      };
    }

    // Check at 500ms - is action progressing?
    await this._wait(400); // Wait remaining 400ms
    const state500ms = this.vision.extractState();
    const progressing = this._checkActionProgress(action, startState, state500ms);
    checks.push({ time: 500, type: 'progressing', passed: progressing });

    if (!progressing) {
      return {
        success: false,
        checks,
        reason: 'action_not_progressing'
      };
    }

    // Check at 1000ms - did action complete?
    await this._wait(500); // Wait remaining 500ms
    const state1000ms = this.vision.extractState();
    const completed = this._checkActionCompleted(action, startState, state1000ms);
    checks.push({ time: 1000, type: 'completed', passed: completed });

    if (!completed) {
      success = false;
      failureReason = 'action_not_completed';
    }

    return { success, checks, reason: failureReason };
  }

  /**
   * Check if action started (state changed from initial)
   */
  _checkActionStarted(action, startState, currentState) {
    switch (action.type) {
      case 'move':
        return this._distance(startState.position, currentState.position) > 0.05;

      case 'dig':
        // Check if block is being targeted or position changed
        return startState.position.x !== currentState.position.x ||
               startState.position.z !== currentState.position.z;

      case 'craft':
        // Crafting is near-instant, check inventory
        return startState.inventory.length !== currentState.inventory.length;

      default:
        return true;
    }
  }

  /**
   * Check if action is progressing (intermediate state)
   */
  _checkActionProgress(action, startState, currentState) {
    switch (action.type) {
      case 'move':
        return this._distance(startState.position, currentState.position) > 0.2;

      case 'dig':
        // Should have moved closer or inventory changed
        return startState.inventory.length !== currentState.inventory.length;

      case 'craft':
        // Crafting should be complete by 500ms
        return true;

      default:
        return true;
    }
  }

  /**
   * Check if action completed successfully
   */
  _checkActionCompleted(action, startState, currentState) {
    switch (action.type) {
      case 'move':
        return this._distance(startState.position, currentState.position) > 0.5;

      case 'dig':
        // Check if item was added to inventory
        return currentState.inventory.length > startState.inventory.length;

      case 'craft':
        // Check if crafted item appears in inventory
        return currentState.inventory.length !== startState.inventory.length;

      default:
        return true;
    }
  }

  getSuccessRate() {
    if (this.actionHistory.length === 0) return 1.0;
    const successful = this.actionHistory.filter(a => a.match).length;
    return successful / this.actionHistory.length;
  }

  getRecentFailures(limit = 5) {
    return this.actionHistory
      .filter(a => !a.match)
      .slice(-limit);
  }
}

module.exports = ActionAwareness;
