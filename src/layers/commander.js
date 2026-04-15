/**
* Commander Layer - High-Level Monitoring and Goal Setting
*
* Monitors bot state every 10 seconds, issues high-level goals to Strategy layer,
* detects stuck situations, and corrects Strategy when needed.
*
* Uses Claude Sonnet 4.5 via Omniroute for complex reasoning.
* Accesses all memory tiers: Working Memory (state.json), STM (recent actions), Long-Term (persistent).
*
* AUTONOMOUS GOALS: When idle (no goal + safe environment), generates goals based on:
* - Personality traits (curiosity → explore, loyalty → protect player)
* - Conversation memory (player mentioned wanting diamonds → search for diamonds)
* - Autonomy level from config (full/advanced/basic/conservative)
*
* Goal Priority: safety > player requests > autonomous goals
*/

const logger = require('../utils/logger');
const StateManager = require('../utils/state-manager');
const OmnirouteClient = require('../utils/omniroute');
const PersonalityEngine = require('../../personality/personality-engine');
const ConversationStore = require('../memory/conversation-store');
const { getRelationship, formatForPrompt } = require('../utils/relationship-state');
const fs = require('fs');
const path = require('path');

// Loop interval (milliseconds)
const COMMANDER_INTERVAL = parseInt(process.env.COMMANDER_INTERVAL) || 10000;

// Stuck detection threshold
const STUCK_THRESHOLD = {
  noProgressDuration: 30000, // 30 seconds
  sameGoalDuration: 120000,  // 2 minutes
  repeatedFailures: 3
};

// Memory access configuration
const MEMORY_CONFIG = {
  workingMemoryKeys: ['state', 'plan', 'commands', 'action_error'],
  stmHistoryLimit: 20,
  ltmEnabled: false
};

// Autonomy levels and their allowed activities
const AUTONOMY_LEVELS = {
  full: { weight: 1.0, activities: ['explore', 'gather', 'craft', 'build', 'farm', 'assist'] },
  advanced: { weight: 0.7, activities: ['explore', 'gather', 'craft', 'assist'] },
  basic: { weight: 0.4, activities: ['gather', 'assist'] },
  conservative: { weight: 0.2, activities: ['assist'] }
};

// Activity types and their personality trait mappings
const ACTIVITY_TRAITS = {
  explore: { primary: 'curiosity', secondary: 'bravery', description: 'explore nearby areas for new resources' },
  gather: { primary: 'curiosity', secondary: 'warmth', description: 'collect useful resources' },
  craft: { primary: 'directness', secondary: 'warmth', description: 'craft useful items' },
  build: { primary: 'directness', secondary: 'warmth', description: 'build or improve structures' },
  farm: { primary: 'loyalty', secondary: 'warmth', description: 'tend to farms and food production' },
  assist: { primary: 'loyalty', secondary: 'warmth', description: 'assist nearby players' }
};

// Goal priority levels (higher = more important)
const GOAL_PRIORITY = {
  safety: 100,
  player_request: 80,
  autonomous: 50,
  idle: 10
};

// Idle detection thresholds
const IDLE_CONFIG = {
  minIdleTime: 15000,
  safeEnvironmentCheck: true
};

class Commander {
  constructor() {
    this.stateManager = new StateManager();
    this.omniroute = new OmnirouteClient();
    this.personalityEngine = PersonalityEngine.getInstance();
    this.conversationStore = new ConversationStore();

    this.running = false;
    this.loopTimer = null;

    // Monitoring state
    this.lastState = null;
    this.lastGoal = null;
    this.lastGoalTime = null;
    this.lastProgressTime = Date.now();
    this.failureCount = 0;
    this.consecutiveErrors = 0;

    // Decision history
    this.decisionHistory = [];
    this.maxHistorySize = 50;

    // Autonomy state
    this.autonomyLevel = 'full';
    this.lastAutonomousGoalTime = 0;
    this.minTimeBetweenAutonomousGoals = 60000;

    // Load config
    this._loadConfig();
  }

  /**
   * Load autonomy configuration from bot-config.json
   */
  _loadConfig() {
    try {
      const configPath = path.join(process.cwd(), 'config', 'bot-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.autonomy && config.autonomy.enabled !== undefined) {
          this.autonomyEnabled = config.autonomy.enabled;
          this.autonomyLevel = config.autonomy.level || 'full';
        }
      }
    } catch (error) {
      logger.warn('Commander: Failed to load config, using defaults', { error: error.message });
    }
    this.autonomyEnabled = true;
    this.autonomyLevel = 'full';
  }

  /**
   * Start the Commander loop
   */
  async start() {
    if (this.running) {
      logger.warn('Commander: Already running');
      return;
    }

    this.running = true;
    logger.info('Commander: Starting monitoring loop', {
      interval: COMMANDER_INTERVAL,
      stuckThreshold: STUCK_THRESHOLD
    });

    // Initialize
    this.lastProgressTime = Date.now();
    
    // Start main loop
    this.scheduleNextLoop();
  }

  /**
   * Stop the Commander loop
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

    logger.info('Commander: Stopped');
  }

  /**
   * Schedule next loop iteration
   */
  scheduleNextLoop() {
    if (!this.running) {
      return;
    }

    this.loopTimer = setTimeout(async () => {
      try {
        await this.loop();
      } catch (error) {
        logger.error('Commander: Loop error', { error: error.message });
      }
      
      this.scheduleNextLoop();
    }, COMMANDER_INTERVAL);
  }

/**
* Main monitoring loop
*/
async loop() {
  const loopStart = Date.now();

  try {
    // 1. Gather all memory tiers
    const memory = await this.gatherMemory();

    // 2. Analyze current situation
    const analysis = this.analyzeSituation(memory);

    // 3. Detect stuck conditions
    const stuckDetection = this.detectStuck(memory, analysis);

    // 4. Check for idle state and generate autonomous goal if needed
    const idleState = this.detectIdleState(memory, analysis);
    if (idleState.isIdle && this.autonomyEnabled) {
      const autonomousGoal = await this.generateAutonomousGoal(memory, analysis);
      if (autonomousGoal) {
        await this.executeDecision({
          action: 'new_goal',
          goal: autonomousGoal.goal,
          reasoning: autonomousGoal.reasoning,
          source: 'autonomous',
          timestamp: Date.now()
        });
        this.lastAutonomousGoalTime = Date.now();
        this.updateMonitoringState(memory, { action: 'new_goal', goal: autonomousGoal.goal });
        this.recordDecision({ action: 'new_goal', goal: autonomousGoal.goal }, analysis, stuckDetection);
        return;
      }
    }

    // 5. Make decision (call Claude Sonnet 4.5)
    const decision = await this.makeDecision(memory, analysis, stuckDetection);

    // 6. Execute decision (write commands)
    await this.executeDecision(decision);

    // 7. Update monitoring state
    this.updateMonitoringState(memory, decision);

    // 8. Record decision in history
    this.recordDecision(decision, analysis, stuckDetection);

    const loopDuration = Date.now() - loopStart;
    logger.debug('Commander: Loop completed', {
      duration: loopDuration,
      decision: decision.action,
      stuck: stuckDetection.isStuck,
      idle: idleState.isIdle
    });

  } catch (error) {
    logger.error('Commander: Loop execution failed', {
      error: error.message,
      stack: error.stack
    });
    this.consecutiveErrors++;

    // If too many errors, issue emergency stop
    if (this.consecutiveErrors >= 5) {
      logger.error('Commander: Too many consecutive errors, issuing emergency stop');
      await this.issueEmergencyStop();
    }
  }
}

  /**
   * Gather all memory tiers
   */
  async gatherMemory() {
    const memory = {
      working: {},
      stm: [],
      longTerm: null,
      timestamp: Date.now()
    };

    // Working Memory - current state files
    for (const key of MEMORY_CONFIG.workingMemoryKeys) {
      try {
        const data = await this.stateManager.read(key);
        memory.working[key] = data;
      } catch (error) {
        logger.warn(`Commander: Failed to read ${key}`, { error: error.message });
        memory.working[key] = null;
      }
    }

    // Short-Term Memory - recent action history (from Pilot)
    try {
      const actionHistory = await this.stateManager.read('action_history');
      if (actionHistory && Array.isArray(actionHistory)) {
        memory.stm = actionHistory.slice(-MEMORY_CONFIG.stmHistoryLimit);
      }
    } catch (error) {
      logger.warn('Commander: Failed to read action history', { error: error.message });
    }

    // Long-Term Memory - persistent facts (not implemented yet)
    if (MEMORY_CONFIG.ltmEnabled) {
      // TODO: Query memory store for relevant facts
      memory.longTerm = null;
    }

    return memory;
  }

  /**
   * Analyze current situation
   */
  analyzeSituation(memory) {
    const state = memory.working.state;
    const plan = memory.working.plan;
    const commands = memory.working.commands;
    const actionError = memory.working.action_error;

    const analysis = {
      hasState: !!state,
      hasPlan: !!(plan && plan.length > 0),
      hasGoal: !!(commands && commands.goal),
      hasError: !!actionError,
      botAlive: state ? state.health > 0 : false,
      botPosition: state ? state.position : null,
      threatLevel: this.assessThreatLevel(state),
      planProgress: this.assessPlanProgress(plan, memory.stm),
      errorSeverity: actionError ? actionError.severity : 0
    };

    return analysis;
  }

  /**
   * Assess threat level from state
   */
  assessThreatLevel(state) {
    if (!state) return 'unknown';

    const threats = [];
    
    // Low health
    if (state.health < 6) {
      threats.push('low_health');
    }
    
    // Hostile mobs nearby
    if (state.entities && state.entities.some(e => e.type === 'hostile' && e.distance < 16)) {
      threats.push('hostile_mobs');
    }
    
    // Lava nearby
    if (state.blocks && state.blocks.some(b => b.name === 'lava' && b.distance < 8)) {
      threats.push('lava');
    }
    
    // High fall risk
    if (state.position && state.position.y > 100) {
      threats.push('high_altitude');
    }

    if (threats.length === 0) return 'safe';
    if (threats.length === 1) return 'moderate';
    return 'high';
  }

  /**
   * Assess plan progress
   */
  assessPlanProgress(plan, stmHistory) {
    if (!plan || plan.length === 0) {
      return { status: 'no_plan', progress: 0 };
    }

    // Check if actions are being executed
    const recentActions = stmHistory.slice(-5);
    const hasRecentActivity = recentActions.length > 0 && 
      recentActions.some(a => a.timestamp > Date.now() - 10000);

    if (!hasRecentActivity) {
      return { status: 'stalled', progress: 0 };
    }

    // Check success rate
    const successRate = recentActions.filter(a => a.success).length / recentActions.length;
    
    if (successRate < 0.3) {
      return { status: 'failing', progress: successRate };
    }

    return { status: 'active', progress: successRate };
  }

  /**
   * Detect stuck situations
   */
  detectStuck(memory, analysis) {
    const now = Date.now();
    const state = memory.working.state;
    const commands = memory.working.commands;

    const detection = {
      isStuck: false,
      reasons: [],
      severity: 0
    };

    // No progress for 30+ seconds
    const timeSinceProgress = now - this.lastProgressTime;
    if (timeSinceProgress > STUCK_THRESHOLD.noProgressDuration) {
      detection.isStuck = true;
      detection.reasons.push(`no_progress_${Math.floor(timeSinceProgress / 1000)}s`);
      detection.severity = Math.min(detection.severity + 2, 5);
    }

    // Same goal for 2+ minutes with no completion
    if (commands && commands.goal && this.lastGoal === commands.goal) {
      const timeSinceGoal = now - (this.lastGoalTime || now);
      if (timeSinceGoal > STUCK_THRESHOLD.sameGoalDuration) {
        detection.isStuck = true;
        detection.reasons.push(`same_goal_${Math.floor(timeSinceGoal / 1000)}s`);
        detection.severity = Math.min(detection.severity + 1, 5);
      }
    }

    // Repeated failures
    if (this.failureCount >= STUCK_THRESHOLD.repeatedFailures) {
      detection.isStuck = true;
      detection.reasons.push(`repeated_failures_${this.failureCount}`);
      detection.severity = Math.min(detection.severity + 3, 5);
    }

    // Bot not moving (position unchanged)
    if (this.lastState && state && this.lastState.position && state.position) {
      const distance = this.calculateDistance(this.lastState.position, state.position);
      if (distance < 0.5 && timeSinceProgress > 15000) {
        detection.isStuck = true;
        detection.reasons.push('position_unchanged');
        detection.severity = Math.min(detection.severity + 1, 5);
      }
    }

    // Plan progress stalled
    if (analysis.planProgress.status === 'stalled' || analysis.planProgress.status === 'failing') {
      detection.isStuck = true;
      detection.reasons.push(`plan_${analysis.planProgress.status}`);
      detection.severity = Math.min(detection.severity + 2, 5);
    }

return detection;
}

/**
* Detect if bot is idle (no goal + safe environment)
*/
detectIdleState(memory, analysis) {
const state = memory.working.state;
const commands = memory.working.commands;
const plan = memory.working.plan;
const now = Date.now();

const idleState = {
  isIdle: false,
  reasons: [],
  canAct: false
};

const hasGoal = commands && commands.goal;
const hasPlan = plan && plan.length > 0;
const isSafe = analysis.threatLevel === 'safe';
const botAlive = analysis.botAlive;
const timeSinceLastAutonomous = now - this.lastAutonomousGoalTime;
const minIntervalMet = timeSinceLastAutonomous >= this.minTimeBetweenAutonomousGoals;

if (!hasGoal && !hasPlan && isSafe && botAlive && minIntervalMet) {
  idleState.isIdle = true;
  idleState.reasons.push('no_goal');
  idleState.reasons.push('no_plan');
  idleState.reasons.push('safe_environment');
}

if (this.autonomyEnabled && this._getAutonomyConfig().weight > 0) {
  idleState.canAct = true;
}

logger.debug('Commander: Idle state check', {
  isIdle: idleState.isIdle,
  hasGoal,
  hasPlan,
  isSafe,
  minIntervalMet,
  autonomyEnabled: this.autonomyEnabled
});

return idleState;
}

/**
* Generate autonomous goal based on personality and memory
*/
async generateAutonomousGoal(memory, analysis) {
const traits = this.personalityEngine.getTraits();
const state = memory.working.state;

const activityScores = this._scoreActivities(traits, memory, analysis);

if (activityScores.length === 0) {
  logger.debug('Commander: No valid activities for autonomous goal');
  return null;
}

const selectedActivity = activityScores[0];
const goal = this._buildGoalFromActivity(selectedActivity, state);

logger.info('Commander: Generated autonomous goal', {
  activity: selectedActivity.type,
  score: selectedActivity.score.toFixed(2),
  goal: goal.goal,
  personalityTraits: {
    curiosity: traits.curiosity?.toFixed(2),
    loyalty: traits.loyalty?.toFixed(2),
    warmth: traits.warmth?.toFixed(2)
  }
});

return goal;
}

/**
* Score activities based on personality traits and context
*/
_scoreActivities(traits, memory, analysis) {
const autonomyConfig = this._getAutonomyConfig();
const allowedActivities = autonomyConfig.activities;
const autonomyWeight = autonomyConfig.weight;

const scoredActivities = [];

for (const activityType of allowedActivities) {
  const activityConfig = ACTIVITY_TRAITS[activityType];
  if (!activityConfig) continue;

  let score = 0;
  const primaryTrait = traits[activityConfig.primary] || 0.5;
  const secondaryTrait = traits[activityConfig.secondary] || 0.5;

  score = (primaryTrait * 2.0) + (secondaryTrait * 1.0);

  const memoryBoost = this._getMemoryBoost(activityType, memory);
  score += memoryBoost;

  score *= autonomyWeight;

  scoredActivities.push({
    type: activityType,
    score,
    description: activityConfig.description,
    primaryTrait: activityConfig.primary,
    memoryBoost
  });
}

scoredActivities.sort((a, b) => b.score - a.score);

return scoredActivities;
}

/**
* Get boost from conversation memory for specific activity
*/
_getMemoryBoost(activityType, memory) {
let boost = 0;

try {
  const commands = memory.working.commands;
  if (commands && commands.recentPlayerMentions) {
    const mentions = commands.recentPlayerMentions;
    
    if (activityType === 'gather' && mentions.some(m => m.includes('diamond') || m.includes('iron'))) {
      boost += 0.5;
    }
    if (activityType === 'explore' && mentions.some(m => m.includes('find') || m.includes('search'))) {
      boost += 0.5;
    }
    if (activityType === 'assist' && mentions.some(m => m.includes('help') || m.includes('need'))) {
      boost += 0.5;
    }
  }
} catch (error) {
  logger.debug('Commander: Memory boost calculation failed', { error: error.message });
}

return boost;
}

/**
* Build concrete goal from selected activity
*/
_buildGoalFromActivity(activity, state) {
const position = state?.position || { x: 0, y: 64, z: 0 };

const goalTemplates = {
  explore: () => `explore the area within 100 blocks of current position, look for interesting features`,
  gather: () => `gather useful resources like wood, stone, or coal within 50 blocks`,
  craft: () => `craft useful items from available materials`,
  build: () => `improve the area around current position with a small shelter or storage`,
  farm: () => `tend to any nearby farms or start a small wheat farm`,
  assist: () => `check if any nearby players need assistance`
};

const goalGenerator = goalTemplates[activity.type] || (() => activity.description);
const goalText = goalGenerator();

return {
  goal: goalText,
  reasoning: `Autonomous goal generated based on ${activity.primaryTrait} trait (${activity.score.toFixed(2)} score)${activity.memoryBoost > 0 ? ' and recent player mentions' : ''}`,
  activityType: activity.type,
  priority: GOAL_PRIORITY.autonomous,
  source: 'autonomous'
};
}

/**
* Get autonomy configuration for current level
*/
_getAutonomyConfig() {
return AUTONOMY_LEVELS[this.autonomyLevel] || AUTONOMY_LEVELS.full;
}

  /**
   * Make decision using Claude Sonnet 4.5
   */
  async makeDecision(memory, analysis, stuckDetection) {
    const state = memory.working.state;
    const commands = memory.working.commands;
    const actionError = memory.working.action_error;

    // Build context for LLM
    const context = this.buildDecisionContext(memory, analysis, stuckDetection);

    // Build prompt (async for personality/relationship)
    const prompt = await this.buildPrompt(context);

    try {
      const response = await this.omniroute.commander(prompt, {
        temperature: 0.7,
        maxTokens: 1000
      });

      // Parse response
      const decision = this.parseDecision(response, context);
      
      this.consecutiveErrors = 0; // Reset error counter on success
      return decision;

    } catch (error) {
      logger.error('Commander: LLM call failed', { error: error.message });
      
      // Fallback decision
      return this.makeFallbackDecision(context);
    }
  }

  /**
   * Build decision context
   */
  buildDecisionContext(memory, analysis, stuckDetection) {
    const state = memory.working.state;
    const commands = memory.working.commands;
    const plan = memory.working.plan;
    const actionError = memory.working.action_error;

    return {
      // Current state
      botHealth: state ? state.health : 0,
      botPosition: state ? state.position : null,
      botInventory: state ? state.inventory : [],
      nearbyEntities: state ? state.entities.slice(0, 10) : [],
      nearbyBlocks: state ? state.blocks.slice(0, 20) : [],
      
      // Current goal and plan
      currentGoal: commands ? commands.goal : null,
      currentPlan: plan || [],
      planProgress: analysis.planProgress,
      
      // Errors and issues
      recentError: actionError,
      threatLevel: analysis.threatLevel,
      
      // Stuck detection
      isStuck: stuckDetection.isStuck,
      stuckReasons: stuckDetection.reasons,
      stuckSeverity: stuckDetection.severity,
      
      // History
      recentActions: memory.stm.slice(-10),
      recentDecisions: this.decisionHistory.slice(-5),
      
      // Metadata
      timestamp: Date.now(),
      timeSinceLastProgress: Date.now() - this.lastProgressTime
    };
  }

  /**
   * Build prompt for Claude
   */
  async buildPrompt(context) {
    const personalityBlock = await this._buildPersonalityBlock();
    const relationshipBlock = await this._buildRelationshipBlock();

    const messages = [
      {
        role: 'system',
        content: `You are the Commander layer of a Minecraft AI bot. Your role is to:
1. Monitor the bot's state and progress
2. Issue high-level goals to the Strategy layer
3. Detect when the bot is stuck and provide corrections
4. Ensure the bot is making progress toward objectives

You have access to:
- Working Memory: Current bot state (health, position, inventory, nearby entities/blocks)
- Short-Term Memory: Recent actions and their outcomes
- Current goal and plan from Strategy layer

${personalityBlock}

${relationshipBlock}

Respond with a JSON object containing:
{
  "action": "continue" | "new_goal" | "correct_strategy" | "emergency_stop",
  "goal": "high-level goal description" (if action is new_goal),
  "correction": "what went wrong and how to fix it" (if action is correct_strategy),
  "reasoning": "why you made this decision"
}`
      },
      {
        role: 'user',
        content: `Current Situation:

**Bot Status:**
- Health: ${context.botHealth}/20
- Position: ${JSON.stringify(context.botPosition)}
- Inventory: ${context.botInventory.length} items
- Threat Level: ${context.threatLevel}

**Current Goal:** ${context.currentGoal || 'None'}
**Plan Progress:** ${context.planProgress.status} (${Math.round(context.planProgress.progress * 100)}% success rate)

**Stuck Detection:**
- Is Stuck: ${context.isStuck}
- Reasons: ${context.stuckReasons.join(', ') || 'None'}
- Severity: ${context.stuckSeverity}/5

**Recent Error:** ${context.recentError ? JSON.stringify(context.recentError) : 'None'}

**Recent Actions (last 10):**
${context.recentActions.map(a => `- ${a.action?.type || 'unknown'}: ${a.success ? 'SUCCESS' : 'FAILED'}`).join('\n') || 'None'}

**Time Since Last Progress:** ${Math.floor(context.timeSinceLastProgress / 1000)}s

**Nearby Threats:**
${context.nearbyEntities.filter(e => e.type === 'hostile').map(e => `- ${e.name} at ${e.distance.toFixed(1)}m`).join('\n') || 'None'}

What should the bot do next?`
      }
    ];

    return messages;
  }

  async _buildPersonalityBlock() {
    try {
      const traits = this.personalityEngine.getTraits();
      const traitList = Object.entries(traits)
        .map(([name, value]) => `${name} (${value.toFixed(2)})`)
        .join(', ');

      const loyaltyNote = traits.loyalty >= 0.9
        ? 'You are deeply loyal to the player and prioritize their safety and goals above all else.'
        : 'You balance your own objectives with the player\'s needs.';
      const warmthNote = traits.warmth >= 0.7
        ? 'Communicate with warmth and encouragement.'
        : 'Keep communication direct and task-focused.';

      return `Personality: You are ${traitList}. ${loyaltyNote} ${warmthNote}`;
    } catch (err) {
      logger.warn('Commander: Could not load personality traits', { error: err.message });
      return 'Personality: Default monitoring mode.';
    }
  }

  async _buildRelationshipBlock() {
    try {
      const relationship = await getRelationship();
      return formatForPrompt(relationship);
    } catch (err) {
      logger.warn('Commander: Could not load relationship state', { error: err.message });
      return 'Relationship: Unknown player relationship.';
    }
  }

  /**
   * Parse LLM response into decision
   */
  parseDecision(response, context) {
    try {
      // Extract JSON from response
      const content = response.choices[0].message.content;
      
      // Try to find JSON in markdown code block
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr);

      // Validate decision
      const validActions = ['continue', 'new_goal', 'correct_strategy', 'emergency_stop'];
      if (!validActions.includes(parsed.action)) {
        throw new Error(`Invalid action: ${parsed.action}`);
      }

      return {
        action: parsed.action,
        goal: parsed.goal || null,
        correction: parsed.correction || null,
        reasoning: parsed.reasoning || 'No reasoning provided',
        timestamp: Date.now()
      };

    } catch (error) {
      logger.error('Commander: Failed to parse LLM response', {
        error: error.message,
        response: response.choices[0].message.content
      });

      // Fallback
      return this.makeFallbackDecision(context);
    }
  }

  /**
   * Make fallback decision when LLM fails
   */
  makeFallbackDecision(context) {
    // Emergency stop if critical situation
    if (context.botHealth < 4 || context.stuckSeverity >= 4) {
      return {
        action: 'emergency_stop',
        goal: null,
        correction: null,
        reasoning: 'Fallback: Critical situation detected',
        timestamp: Date.now()
      };
    }

    // Correct strategy if stuck
    if (context.isStuck) {
      return {
        action: 'correct_strategy',
        goal: null,
        correction: 'Bot appears stuck. Clear current plan and try a different approach.',
        reasoning: 'Fallback: Stuck detected',
        timestamp: Date.now()
      };
    }

    // Continue if making progress
    return {
      action: 'continue',
      goal: null,
      correction: null,
      reasoning: 'Fallback: No issues detected, continue current plan',
      timestamp: Date.now()
    };
  }

  /**
   * Execute decision
   */
  async executeDecision(decision) {
    try {
      switch (decision.action) {
        case 'continue':
          // No action needed, Strategy continues current plan
          logger.debug('Commander: Continue current plan', {
            reasoning: decision.reasoning
          });
          break;

case 'new_goal':
const goalSource = decision.source || 'commander';
await this.stateManager.write('commands', {
  goal: decision.goal,
  timestamp: Date.now(),
  source: goalSource,
  priority: decision.priority || GOAL_PRIORITY.autonomous,
  activityType: decision.activityType || null
});

logger.info('Commander: Issued new goal', {
  goal: decision.goal,
  reasoning: decision.reasoning,
  source: goalSource
});

this.lastGoal = decision.goal;
this.lastGoalTime = Date.now();
this.failureCount = 0;
break;

        case 'correct_strategy':
          // Write correction to commands.json and clear plan
          await this.stateManager.write('commands', {
            goal: null,
            correction: decision.correction,
            timestamp: Date.now(),
            source: 'commander'
          });
          
          await this.stateManager.write('plan', []);
          
          logger.warn('Commander: Correcting Strategy', {
            correction: decision.correction,
            reasoning: decision.reasoning
          });
          
          this.failureCount++;
          break;

        case 'emergency_stop':
          // Clear all commands and plans
          await this.stateManager.write('commands', {
            goal: null,
            emergency_stop: true,
            timestamp: Date.now(),
            source: 'commander'
          });
          
          await this.stateManager.write('plan', []);
          
          logger.error('Commander: EMERGENCY STOP', {
            reasoning: decision.reasoning
          });
          
          this.failureCount = 0;
          break;
      }

    } catch (error) {
      logger.error('Commander: Failed to execute decision', {
        decision: decision.action,
        error: error.message
      });
    }
  }

  /**
   * Update monitoring state
   */
  updateMonitoringState(memory, decision) {
    const state = memory.working.state;
    const commands = memory.working.commands;

    // Update last state
    this.lastState = state;

    // Update progress time if bot is active
    if (memory.stm.length > 0) {
      const recentAction = memory.stm[memory.stm.length - 1];
      if (recentAction.timestamp > this.lastProgressTime) {
        this.lastProgressTime = recentAction.timestamp;
      }
    }

    // Update goal tracking
    if (commands && commands.goal && commands.goal !== this.lastGoal) {
      this.lastGoal = commands.goal;
      this.lastGoalTime = Date.now();
      this.failureCount = 0;
    }
  }

  /**
   * Record decision in history
   */
  recordDecision(decision, analysis, stuckDetection) {
    this.decisionHistory.push({
      decision,
      analysis,
      stuckDetection,
      timestamp: Date.now()
    });

    // Trim history
    if (this.decisionHistory.length > this.maxHistorySize) {
      this.decisionHistory.shift();
    }
  }

  /**
   * Issue emergency stop
   */
  async issueEmergencyStop() {
    try {
      await this.stateManager.write('commands', {
        goal: null,
        emergency_stop: true,
        reason: 'Too many consecutive Commander errors',
        timestamp: Date.now(),
        source: 'commander'
      });

      await this.stateManager.write('plan', []);

      this.consecutiveErrors = 0;
      this.failureCount = 0;

    } catch (error) {
      logger.error('Commander: Failed to issue emergency stop', {
        error: error.message
      });
    }
  }

  /**
   * Calculate distance between two positions
   */
  calculateDistance(pos1, pos2) {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      running: this.running,
      interval: COMMANDER_INTERVAL,
      lastProgressTime: this.lastProgressTime,
      timeSinceProgress: Date.now() - this.lastProgressTime,
      currentGoal: this.lastGoal,
      failureCount: this.failureCount,
      consecutiveErrors: this.consecutiveErrors,
      decisionHistorySize: this.decisionHistory.length
    };
  }
}

module.exports = Commander;
