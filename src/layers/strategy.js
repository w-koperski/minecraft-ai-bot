/**
 * Strategy Layer - Planning and Multi-Step Coordination
 * 
 * Reads high-level goals from Commander (state/commands.json) and decomposes them
 * into 3-5 step action sequences for Pilot execution (state/plan.json).
 * 
 * Loop interval: 3 seconds
 * Model: Qwen 2.5 7B (410ms latency)
 * Memory access: Working Memory + Short-Term Memory (last 5 minutes)
 * 
 * Handles:
 * - Goal decomposition into executable action sequences
 * - Action error recovery (reads state/action_error.json)
 * - Replanning when actions fail
 * - Progress tracking and stuck detection
 * - Learning from recent history
 */

const logger = require('../utils/logger');
const StateManager = require('../utils/state-manager');
const OmnirouteClient = require('../utils/omniroute');

// Loop interval (milliseconds)
const STRATEGY_INTERVAL = parseInt(process.env.STRATEGY_INTERVAL) || 3000;

// Memory configuration
const MEMORY_CONFIG = {
  stmDuration: 5 * 60 * 1000, // 5 minutes
  maxHistoryEntries: 10,
  maxPlanLength: 5,
  minPlanLength: 3
};

// Stuck detection
const STUCK_CONFIG = {
  noProgressDuration: 30000, // 30 seconds
  minMovementDistance: 2,    // blocks
  maxReplanAttempts: 3
};

class Strategy {
  constructor() {
    this.stateManager = new StateManager();
    this.omniroute = new OmnirouteClient();
    
    this.running = false;
    this.loopTimer = null;
    
    // Planning state
    this.currentGoal = null;
    this.currentPlan = null;
    this.planCreatedAt = null;
    this.replanAttempts = 0;
    
    // History tracking (Short-Term Memory)
    this.actionHistory = [];
    this.planHistory = [];
    
    // Progress tracking
    this.lastPosition = null;
    this.lastProgressTime = Date.now();
    this.lastStateHash = null;
  }

  /**
   * Start the Strategy loop
   */
  async start() {
    if (this.running) {
      logger.warn('Strategy: Already running');
      return;
    }

    this.running = true;
    logger.info('Strategy: Starting planning loop', {
      interval: STRATEGY_INTERVAL,
      model: process.env.STRATEGY_MODEL || 'nvidia/qwen/qwen2.5-7b-instruct',
      memoryConfig: MEMORY_CONFIG
    });

    // Initialize
    this.lastProgressTime = Date.now();
    
    // Start main loop
    this.scheduleNextLoop();
  }

  /**
   * Stop the Strategy loop
   */
  async stop() {
    if (!this.running) {
      return;
    }

    this.running = false;
    
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }

    await this.omniroute.stop();
    logger.info('Strategy: Stopped');
  }

  /**
   * Schedule next loop iteration
   */
  scheduleNextLoop() {
    if (!this.running) {
      return;
    }

    this.loopTimer = setTimeout(() => {
      this.loop().catch(error => {
        logger.error('Strategy: Loop error', { error: error.message, stack: error.stack });
      });
    }, STRATEGY_INTERVAL);
  }

  /**
   * Main planning loop
   */
  async loop() {
    try {
      // Read current state (Working Memory)
      const state = await this.stateManager.read('state');
      if (!state) {
        logger.debug('Strategy: No state available, skipping cycle');
        this.scheduleNextLoop();
        return;
      }

      // Read commands from Commander
      const commands = await this.stateManager.read('commands');
      const goal = commands?.goal || null;

      // Check if goal changed
      if (goal !== this.currentGoal) {
        logger.info('Strategy: Goal changed', { 
          oldGoal: this.currentGoal, 
          newGoal: goal 
        });
        this.currentGoal = goal;
        this.replanAttempts = 0;
        this.planCreatedAt = null;
      }

      // No goal = no planning needed
      if (!goal) {
        logger.debug('Strategy: No goal set, skipping planning');
        this.scheduleNextLoop();
        return;
      }

      // Check for action errors from Pilot
      const actionError = await this.stateManager.read('action_error');
      if (actionError && actionError.timestamp > (this.planCreatedAt || 0)) {
        logger.warn('Strategy: Action error detected, replanning', {
          error: actionError.error,
          action: actionError.action
        });
        await this.handleActionError(state, goal, actionError);
        this.scheduleNextLoop();
        return;
      }

      // Check if stuck
      const isStuck = this.detectStuck(state);
      if (isStuck) {
        logger.warn('Strategy: Bot appears stuck, replanning', {
          position: state.position,
          lastProgress: new Date(this.lastProgressTime).toISOString()
        });
        this.replanAttempts++;
        
        if (this.replanAttempts >= STUCK_CONFIG.maxReplanAttempts) {
          logger.error('Strategy: Max replan attempts reached, requesting Commander intervention');
          await this.requestCommanderHelp(state, goal, 'stuck_after_replanning');
          this.scheduleNextLoop();
          return;
        }
      }

      // Check if we need a new plan
      const needsNewPlan = !this.currentPlan || 
                           this.planCreatedAt === null ||
                           isStuck ||
                           this.isPlanComplete(state);

      if (needsNewPlan) {
        await this.createPlan(state, goal);
      }

      // Update progress tracking
      this.updateProgress(state);

    } catch (error) {
      logger.error('Strategy: Loop error', { 
        error: error.message, 
        stack: error.stack 
      });
    }

    this.scheduleNextLoop();
  }

  /**
   * Create a new action plan
   */
  async createPlan(state, goal) {
    logger.info('Strategy: Creating new plan', { goal });

    try {
      // Build context with Short-Term Memory
      const context = this.buildPlanningContext(state, goal);
      
      // Call LLM
      const messages = [
        {
          role: 'system',
          content: this.getSystemPrompt()
        },
        {
          role: 'user',
          content: context
        }
      ];

      const response = await this.omniroute.strategy(messages, {
        temperature: 0.7,
        maxTokens: 500
      });

      if (!response || !response.choices || !response.choices[0]) {
        logger.error('Strategy: Invalid LLM response', { response });
        return;
      }

      const content = response.choices[0].message.content;
      const plan = this.extractPlan(content);

      if (!plan || plan.length === 0) {
        logger.error('Strategy: Failed to extract valid plan', { content });
        return;
      }

      // Validate plan
      if (plan.length < MEMORY_CONFIG.minPlanLength || 
          plan.length > MEMORY_CONFIG.maxPlanLength) {
        logger.warn('Strategy: Plan length out of bounds', { 
          length: plan.length, 
          min: MEMORY_CONFIG.minPlanLength,
          max: MEMORY_CONFIG.maxPlanLength
        });
      }

      // Save plan
      this.currentPlan = plan;
      this.planCreatedAt = Date.now();
      await this.stateManager.write('plan', plan);

      // Record in history
      this.planHistory.push({
        goal,
        plan,
        createdAt: this.planCreatedAt,
        state: {
          position: state.position,
          health: state.health,
          inventory: state.inventory.length
        }
      });

      // Trim history
      if (this.planHistory.length > MEMORY_CONFIG.maxHistoryEntries) {
        this.planHistory.shift();
      }

      logger.info('Strategy: Plan created', { 
        plan: plan.map(a => a.action || a.type),
        steps: plan.length
      });

    } catch (error) {
      logger.error('Strategy: Plan creation failed', { 
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Build planning context with state and memory
   */
  buildPlanningContext(state, goal) {
    const recentHistory = this.getRecentHistory();
    const recentActions = this.getRecentActions();

    let context = `Goal: ${goal}\n\n`;
    
    context += `Current State:\n`;
    context += `- Position: (${state.position.x.toFixed(1)}, ${state.position.y.toFixed(1)}, ${state.position.z.toFixed(1)})\n`;
    context += `- Health: ${state.health}/20\n`;
    context += `- Food: ${state.food}/20\n`;
    context += `- Inventory: ${state.inventory.length} items\n`;
    
    if (state.inventory.length > 0) {
      const topItems = state.inventory.slice(0, 5);
      context += `  Top items: ${topItems.map(i => `${i.name} x${i.count}`).join(', ')}\n`;
    }

    if (state.nearbyBlocks && state.nearbyBlocks.length > 0) {
      context += `- Nearby blocks: ${state.nearbyBlocks.slice(0, 10).map(b => b.name).join(', ')}\n`;
    }

    if (state.entities && state.entities.length > 0) {
      const hostiles = state.entities.filter(e => e.type === 'hostile');
      const passives = state.entities.filter(e => e.type === 'passive');
      if (hostiles.length > 0) {
        context += `- Hostile mobs: ${hostiles.length} (${hostiles.map(e => e.name).join(', ')})\n`;
      }
      if (passives.length > 0) {
        context += `- Passive mobs: ${passives.length}\n`;
      }
    }

    if (recentHistory.length > 0) {
      context += `\nRecent Planning History (last ${recentHistory.length} plans):\n`;
      recentHistory.forEach((entry, idx) => {
        context += `${idx + 1}. Goal: "${entry.goal}" - ${entry.plan.length} steps\n`;
      });
    }

    if (recentActions.length > 0) {
      context += `\nRecent Actions (last ${recentActions.length}):\n`;
      recentActions.forEach((action, idx) => {
        const status = action.success ? '✓' : '✗';
        context += `${idx + 1}. ${status} ${action.action} ${action.error ? `(${action.error})` : ''}\n`;
      });
    }

    context += `\nCreate a plan with ${MEMORY_CONFIG.minPlanLength}-${MEMORY_CONFIG.maxPlanLength} action steps as a JSON array.\n`;
    context += `Each action should have: {"action": "action_name", "params": {...}, "description": "what this does"}\n`;
    context += `Available actions: move_to, collect_block, attack_entity, craft_item, equip_item, place_block, eat_food, wait\n`;

    return context;
  }

  /**
   * Get system prompt for Strategy layer
   */
  getSystemPrompt() {
    return `You are the Strategy layer of a Minecraft AI bot. Your role is to decompose high-level goals into executable action sequences.

You have access to:
- Current game state (position, health, inventory, nearby blocks/entities)
- Recent planning history (what worked, what didn't)
- Recent action outcomes (successes and failures)

Your output must be a JSON array of 3-5 action steps. Each action should be:
1. Specific and executable by the Pilot layer
2. Sequenced logically (dependencies in order)
3. Achievable with current resources
4. Safe (avoid lava, cliffs, hostile mobs when possible)

Action format:
{
  "action": "action_name",
  "params": {
    "target": "block_name or entity_name",
    "position": {"x": 0, "y": 0, "z": 0},
    "count": 1
  },
  "description": "Human-readable description"
}

Available actions:
- move_to: Navigate to position or block type
- collect_block: Mine and collect specific block
- attack_entity: Attack hostile mob
- craft_item: Craft item from inventory
- equip_item: Equip tool or armor
- place_block: Place block at position
- eat_food: Consume food item
- wait: Wait for condition or duration

Think step-by-step, consider prerequisites, and output ONLY the JSON array.`;
  }

  /**
   * Extract plan from LLM response
   */
  extractPlan(content) {
    try {
      // Try to find JSON array in response
      const jsonMatch = content.match(/\[[\s\S]*?\]/);
      if (!jsonMatch) {
        logger.warn('Strategy: No JSON array found in response', { content });
        return null;
      }

      const plan = JSON.parse(jsonMatch[0]);
      
      if (!Array.isArray(plan)) {
        logger.warn('Strategy: Parsed content is not an array', { plan });
        return null;
      }

      // Validate each action
      const validPlan = plan.filter(action => {
        if (!action.action) {
          logger.warn('Strategy: Action missing "action" field', { action });
          return false;
        }
        return true;
      });

      return validPlan;

    } catch (error) {
      logger.error('Strategy: Failed to parse plan', { 
        error: error.message,
        content 
      });
      return null;
    }
  }

  /**
   * Handle action error from Pilot
   */
  async handleActionError(state, goal, actionError) {
    logger.info('Strategy: Handling action error', {
      action: actionError.action,
      error: actionError.error
    });

    // Record in action history
    this.actionHistory.push({
      action: actionError.action,
      success: false,
      error: actionError.error,
      timestamp: actionError.timestamp
    });

    // Trim action history to STM duration
    this.trimActionHistory();

    // Clear the error
    await this.stateManager.delete('action_error');

    // Replan
    this.currentPlan = null;
    this.planCreatedAt = null;
    await this.createPlan(state, goal);
  }

  /**
   * Detect if bot is stuck
   */
  detectStuck(state) {
    if (!this.lastPosition) {
      this.lastPosition = state.position;
      return false;
    }

    const timeSinceProgress = Date.now() - this.lastProgressTime;
    
    // Calculate distance moved
    const distance = Math.sqrt(
      Math.pow(state.position.x - this.lastPosition.x, 2) +
      Math.pow(state.position.y - this.lastPosition.y, 2) +
      Math.pow(state.position.z - this.lastPosition.z, 2)
    );

    // Check if state changed (inventory, health, etc.)
    const currentStateHash = this.hashState(state);
    const stateChanged = currentStateHash !== this.lastStateHash;

    // Stuck if no movement AND no state change for threshold duration
    if (timeSinceProgress > STUCK_CONFIG.noProgressDuration &&
        distance < STUCK_CONFIG.minMovementDistance &&
        !stateChanged) {
      return true;
    }

    return false;
  }

  /**
   * Update progress tracking
   */
  updateProgress(state) {
    const currentStateHash = this.hashState(state);
    
    // Check if progress was made
    if (this.lastPosition) {
      const distance = Math.sqrt(
        Math.pow(state.position.x - this.lastPosition.x, 2) +
        Math.pow(state.position.y - this.lastPosition.y, 2) +
        Math.pow(state.position.z - this.lastPosition.z, 2)
      );

      const stateChanged = currentStateHash !== this.lastStateHash;

      if (distance >= STUCK_CONFIG.minMovementDistance || stateChanged) {
        this.lastProgressTime = Date.now();
        this.replanAttempts = 0; // Reset replan counter on progress
      }
    }

    this.lastPosition = { ...state.position };
    this.lastStateHash = currentStateHash;
  }

  /**
   * Hash state for change detection
   */
  hashState(state) {
    const relevant = {
      health: state.health,
      food: state.food,
      inventoryCount: state.inventory.length,
      inventoryItems: state.inventory.map(i => `${i.name}:${i.count}`).sort().join(',')
    };
    return JSON.stringify(relevant);
  }

  /**
   * Check if current plan is complete
   */
  isPlanComplete(state) {
    if (!this.currentPlan || this.currentPlan.length === 0) {
      return true;
    }

    // Read plan from state to see if Pilot completed it
    // (Pilot removes actions as they complete)
    return false; // Let Pilot manage plan completion
  }

  /**
   * Request help from Commander
   */
  async requestCommanderHelp(state, goal, reason) {
    logger.warn('Strategy: Requesting Commander intervention', { reason, goal });

    const helpRequest = {
      goal,
      stuck: true,
      reason,
      state: {
        position: state.position,
        health: state.health,
        inventory: state.inventory.length
      },
      timestamp: Date.now()
    };

    await this.stateManager.write('commands', helpRequest);
  }

  /**
   * Get recent planning history (within STM duration)
   */
  getRecentHistory() {
    const cutoff = Date.now() - MEMORY_CONFIG.stmDuration;
    return this.planHistory.filter(entry => entry.createdAt > cutoff);
  }

  /**
   * Get recent actions (within STM duration)
   */
  getRecentActions() {
    const cutoff = Date.now() - MEMORY_CONFIG.stmDuration;
    return this.actionHistory.filter(action => action.timestamp > cutoff);
  }

  /**
   * Trim action history to STM duration
   */
  trimActionHistory() {
    const cutoff = Date.now() - MEMORY_CONFIG.stmDuration;
    this.actionHistory = this.actionHistory.filter(action => action.timestamp > cutoff);
  }

  /**
   * Record action outcome (called by Pilot or external)
   */
  recordAction(action, success, error = null) {
    this.actionHistory.push({
      action,
      success,
      error,
      timestamp: Date.now()
    });

    this.trimActionHistory();
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      currentGoal: this.currentGoal,
      planLength: this.currentPlan ? this.currentPlan.length : 0,
      planAge: this.planCreatedAt ? Date.now() - this.planCreatedAt : null,
      replanAttempts: this.replanAttempts,
      historySize: this.planHistory.length,
      actionHistorySize: this.actionHistory.length,
      timeSinceProgress: Date.now() - this.lastProgressTime
    };
  }
}

module.exports = Strategy;
