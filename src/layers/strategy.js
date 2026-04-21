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
const featureFlags = require('../utils/feature-flags');
const { getTraits } = require('../../personality/personality-engine');
const { getRelationship, formatForPrompt } = require('../utils/relationship-state');
const KnowledgeGraph = require('../memory/knowledge-graph');
const StrategyMemory = require('../learning/strategy-memory');
const StrategyApplicator = require('../learning/strategy-applicator');
const LearningMetrics = require('../learning/learning-metrics');

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
  minMovementDistance: 2, // blocks
  maxReplanAttempts: 3
};

// Knowledge graph query budget (Task 13)
const GRAPH_QUERY_TIMEOUT_MS = 500;

const EventEmitter = require('events');

class Strategy extends EventEmitter {
  constructor() {
    super();
    this.stateManager = new StateManager();
    this.omniroute = new OmnirouteClient();
    this.knowledgeGraph = new KnowledgeGraph();
    this.strategyMemory = new StrategyMemory(this.knowledgeGraph);
    this.strategyApplicator = new StrategyApplicator(this.strategyMemory);
    this.learningMetrics = new LearningMetrics({ trackTimestamps: true });

    this.running = false;
    this.loopTimer = null;
    this._firstLoopComplete = false;

    this.currentGoal = null;
    this.currentPlan = null;
    this.planCreatedAt = null;
    this.replanAttempts = 0;

    this.actionHistory = [];
    this.planHistory = [];

    this.lastPosition = null;
    this.lastProgressTime = Date.now();
    this.lastStateHash = null;
    this._pendingStrategyOutcome = null;
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
      // Track cycle start time for stale error detection
      this.currentCycleStartTime = Date.now();

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
      
      // Validate error timestamp - ignore stale errors from previous cycles
      if (actionError) {
        const errorAge = this.currentCycleStartTime - actionError.timestamp;
        
        // Check if error is from current cycle (fresh) or previous cycle (stale)
        if (actionError.timestamp < this.currentCycleStartTime) {
          logger.debug('Strategy: Ignoring stale error from previous cycle', {
            errorAge,
            error: actionError.error || actionError.actual,
            action: actionError.action
          });
          // Clear stale error to prevent reprocessing
          await this.stateManager.delete('action_error');
        } else if (actionError.timestamp > (this.planCreatedAt || 0)) {
          // Fresh error from current cycle, process it
          logger.warn('Strategy: Action error detected, replanning', {
            error: actionError.error || actionError.actual,
            action: actionError.action,
            errorAge
          });
          await this.handleActionError(state, goal, actionError);
          this.scheduleNextLoop();
          return;
        }
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

    // Emit first-loop-complete after initial loop finishes
    if (!this._firstLoopComplete) {
      this._firstLoopComplete = true;
      this.emit('first-loop-complete');
    }

    this.scheduleNextLoop();
  }

  /**
   * Create a new action plan
   */
  async createPlan(state, goal) {
    logger.info('Strategy: Creating new plan', { goal });

    try {
      // Build context with Short-Term Memory (async for personality/relationship)
      const context = await this.buildPlanningContext(state, goal);

      let appliedStrategy = null;
      let strategyWasApplied = false;
      if (featureFlags.isEnabled('META_LEARNING')) {
        try {
          const strategyContext = `Goal: ${goal}. Position: (${state.position.x.toFixed(0)}, ${state.position.y.toFixed(0)}, ${state.position.z.toFixed(0)}). Health: ${state.health}/20. Inventory: ${state.inventory.length} items.`;
          appliedStrategy = this.strategyApplicator.applyStrategies(strategyContext);
          if (appliedStrategy) {
            strategyWasApplied = true;
            logger.info('Strategy: Applied learned strategy', {
              strategyId: appliedStrategy.strategy.id,
              confidence: appliedStrategy.confidence.toFixed(3)
            });
          }
        } catch (strategyError) {
          logger.warn('Strategy: Strategy application failed, proceeding with normal planning', {
            error: strategyError.message
          });
        }
      }

      // Call LLM
      let userContent = context;
      if (appliedStrategy && appliedStrategy.strategy && appliedStrategy.strategy.actions) {
        const learnedActions = appliedStrategy.strategy.actions.join(' -> ');
        userContent += `\n\nLearned strategy reference (confidence: ${appliedStrategy.confidence.toFixed(2)}): ${learnedActions}`;
      }

      const messages = [
        {
          role: 'system',
          content: this.getSystemPrompt()
        },
        {
          role: 'user',
          content: userContent
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

      if (strategyWasApplied) {
        this._pendingStrategyOutcome = 'strategy';
      } else {
        this._pendingStrategyOutcome = 'fresh';
      }

      await this._storePlanOutcome(plan, state, true);

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
  async buildPlanningContext(state, goal) {
    const recentHistory = this.getRecentHistory();
    const recentActions = this.getRecentActions();

    const personalityBlock = await this._buildPersonalityBlock();
    const relationshipBlock = await this._buildRelationshipBlock();
    const graphData = await this._queryKnowledgeGraph(state);

    let context = `${personalityBlock}\n\n${relationshipBlock}\n\nGoal: ${goal}\n\n`;

    context += `Current State:\n`;
    context += `- Position: (${state.position.x.toFixed(1)}, ${state.position.y.toFixed(1)}, ${state.position.z.toFixed(1)})\n`;
    context += `- Health: ${state.health}/20\n`;
    context += `- Food: ${state.food}/20\n`;
    context += `- Inventory: ${state.inventory.length} items\n`;

    if (state.inventory.length > 0) {
      const topItems = state.inventory.slice(0, 5);
      context += ` Top items: ${topItems.map(i => `${i.name} x${i.count}`).join(', ')}\n`;
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

    if (graphData?.spatial && graphData.spatial.length > 0) {
      context += `\nKnown Locations (from memory):\n`;
      graphData.spatial.forEach(loc => {
        const coords = loc.coordinates;
        context += `- ${loc.name}: (${coords.x.toFixed(0)}, ${coords.y.toFixed(0)}, ${coords.z.toFixed(0)}) - ${loc.biome}\n`;
      });
    }

    if (graphData?.semantic && graphData.semantic.length > 0) {
      context += `\nRelevant Knowledge (from memory):\n`;
      graphData.semantic.forEach(fact => {
        context += `- ${fact.subject} ${fact.predicate} ${fact.object} (confidence: ${(fact.confidence * 100).toFixed(0)}%)\n`;
      });
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
   * Build personality block for prompts
   */
  async _buildPersonalityBlock() {
    try {
      const traits = getTraits();
      const traitList = Object.entries(traits)
        .map(([name, value]) => `${name} (${value.toFixed(2)})`)
        .join(', ');

      const curiosityNote = traits.curiosity >= 0.7
        ? 'You are highly curious and enjoy exploring new areas.'
        : 'You prefer familiar paths and known strategies.';
      const loyaltyNote = traits.loyalty >= 0.8
        ? 'You are deeply loyal and prioritize helping the player above all else.'
        : 'You balance your own goals with the player\'s needs.';

      return `Personality: You are ${traitList}. ${curiosityNote} ${loyaltyNote}`;
    } catch (err) {
      logger.warn('Strategy: Could not load personality traits', { error: err.message });
      return 'Personality: Default planning mode.';
    }
  }

  /**
   * Build relationship block for prompts
   */
  async _buildRelationshipBlock() {
    try {
      const relationship = await getRelationship();
      return formatForPrompt(relationship);
    } catch (err) {
      logger.warn('Strategy: Could not load relationship state', { error: err.message });
      return 'Relationship: Unknown player relationship.';
    }
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

    if (this.currentPlan) {
      await this._storePlanOutcome(this.currentPlan, state, false);
    }

    this.actionHistory.push({
      action: actionError.action,
      success: false,
      error: actionError.error,
      timestamp: actionError.timestamp
    });

    this.trimActionHistory();

    await this.stateManager.delete('action_error');

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
      timeSinceProgress: Date.now() - this.lastProgressTime,
      strategyApplicator: this.strategyApplicator.getStatus(),
      learningMetrics: this.learningMetrics.getMetrics()
    };
  }

  /**
   * Query knowledge graph with timeout budget
   * @param {object} state - Current game state
   * @returns {Promise<object>} - Graph query results
   */
  async _queryKnowledgeGraph(state) {
    const startTime = Date.now();

    try {
      const results = await Promise.race([
        this._fetchGraphData(state),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Graph query timeout')), GRAPH_QUERY_TIMEOUT_MS)
        )
      ]);

      const elapsed = Date.now() - startTime;
      logger.debug('Strategy: Graph query completed', { elapsedMs: elapsed });

      return results;
    } catch (error) {
      logger.warn('Strategy: Graph query failed or timed out', {
        error: error.message,
        elapsedMs: Date.now() - startTime
      });
      return null;
    }
  }

  /**
   * Fetch data from knowledge graph (internal)
   */
  async _fetchGraphData(state) {
    const [spatialMemories, semanticMemories] = await Promise.all([
      this._querySpatialMemories(state),
      this._querySemanticMemories(this.currentGoal)
    ]);

    return {
      spatial: spatialMemories,
      semantic: semanticMemories
    };
  }

  /**
   * Query spatial memories near current position
   */
  async _querySpatialMemories(state) {
    if (!state?.position) return [];

    const nearby = {
      x: state.position.x,
      y: state.position.y,
      z: state.position.z,
      radius: 100
    };

    const memories = this.knowledgeGraph.getSpatialMemories({ near: nearby });

    if (memories.length > 0) {
      logger.debug('Strategy: Found spatial memories', { count: memories.length });
    }

    return memories.slice(0, 5);
  }

  /**
   * Query semantic memories relevant to goal
   */
  async _querySemanticMemories(goal) {
    if (!goal) return [];

    const keywords = this._extractKeywords(goal);
    const memories = [];

    for (const keyword of keywords.slice(0, 3)) {
      const found = this.knowledgeGraph.getSemanticMemories({ subject: keyword });
      memories.push(...found);
    }

    if (memories.length > 0) {
      logger.debug('Strategy: Found semantic memories', { count: memories.length });
    }

    return memories.slice(0, 5);
  }

  /**
   * Extract keywords from goal string
   */
  _extractKeywords(text) {
    if (!text) return [];

    const stopWords = ['the', 'a', 'an', 'to', 'of', 'and', 'in', 'for', 'is', 'it'];
    const words = text.toLowerCase().split(/\s+/);

    return words
      .filter(w => w.length > 2 && !stopWords.includes(w))
      .slice(0, 5);
  }

  /**
   * Store plan outcome in knowledge graph (Episodic memory)
   */
  async _storePlanOutcome(plan, state, success) {
    if (!plan || plan.length === 0 || !state) return;

    const experience = success
      ? `Successfully completed plan: ${plan.map(a => a.action).join(' -> ')}`
      : `Plan failed or interrupted: ${plan.map(a => a.action).join(' -> ')}`;

    const participants = [{
      type: 'bot',
      identifier: 'self',
      role: 'executor'
    }];

    const location = state.position ? {
      x: state.position.x,
      y: state.position.y,
      z: state.position.z,
      dimension: state.dimension || 'overworld',
      biome: 'unknown'
    } : null;

    const importance = success ? 5 : 7;

    this.knowledgeGraph.addEpisodicMemory(
      experience,
      participants,
      location,
      Date.now(),
      importance
    );

    if (this._pendingStrategyOutcome) {
      if (this._pendingStrategyOutcome === 'strategy') {
        this.learningMetrics.recordStrategyApplication(true, success);
      } else {
        this.learningMetrics.recordFreshPlanning(success);
      }
      this._pendingStrategyOutcome = null;
    }

    logger.debug('Strategy: Stored plan outcome in knowledge graph', { success });
  }
}

module.exports = Strategy;
