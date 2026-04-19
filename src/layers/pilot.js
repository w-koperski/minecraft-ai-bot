/**
 * Pilot Layer - Fast Reaction AI
 * 
 * Handles immediate threats and executes action sequences from Strategy layer.
 * Uses adaptive loop timing based on threat level:
 * - Danger: 200ms (hostile mobs, lava, low health)
 * - Active: 500ms (executing actions)
 * - Idle: 2000ms (no threats, no actions)
 * 
 * Integrates Action Awareness (PIANO) to verify every action outcome.
 */

const logger = require('../utils/logger');
const StateManager = require('../utils/state-manager');
const OmnirouteClient = require('../utils/omniroute');
const { extractState } = require('../utils/vision-enhanced');
const ActionAwareness = require('./action-awareness');
const ItemTracker = require('../metrics/item-tracker');
const { getTraits } = require('../../personality/personality-engine');
const { getRelationship, formatForPrompt } = require('../utils/relationship-state');
const featureFlags = require('../utils/feature-flags');

// Adaptive loop intervals (milliseconds)
const INTERVALS = {
  danger: 200,   // Immediate threats detected
  active: 500,   // Executing actions
  idle: 2000     // No threats, no actions
};

// Threat detection thresholds
const THREAT_THRESHOLDS = {
  hostileMobDistance: 16,  // blocks
  lavaDistance: 8,         // blocks
  lowHealth: 6,            // hearts (out of 20)
  fallDistance: 3          // blocks
};

// Stuck detection
const STUCK_THRESHOLD = {
  distance: 0.1,  // blocks
  duration: 10000 // milliseconds
};

class Pilot {
  constructor(bot, options = {}) {
    this.bot = bot;
    this.stateManager = new StateManager();
    this.omniroute = new OmnirouteClient();
    this.actionAwareness = new ActionAwareness(bot, { extractState });
    this.visionState = options.visionState || null;

    this.running = false;
    this.loopTimer = null;
    this.currentInterval = INTERVALS.active;
    this.currentMode = 'active';

    // Stuck detection
    this.lastPosition = null;
    this.lastMoveTime = Date.now();
    this.stuckCheckTimer = null;

    // Action execution state
    this.currentPlan = [];
    this.currentActionIndex = 0;
    this.executingAction = false;

    // Item progression tracking
    this.itemTracker = new ItemTracker();
  }

  /**
   * Start the Pilot loop
   */
  async start() {
    if (this.running) {
      logger.warn('Pilot: Already running');
      return;
    }

    this.running = true;
    logger.info('Pilot: Starting with adaptive loop', {
      intervals: INTERVALS
    });

    // Initialize position tracking
    if (this.bot.entity && this.bot.entity.position) {
      this.lastPosition = { ...this.bot.entity.position };
    }

    // Start stuck detection
    this.startStuckDetection();

    // Start item tracking
    this.bot.on('playerCollect', (collector, collected) => {
      if (collector.username === this.bot.username) {
        this.itemTracker.track(collected.name);
        logger.debug('Item collected', { item: collected.name, stats: this.itemTracker.getStats() });
      }
    });

    // Start main loop
    this.scheduleNextLoop();
  }

  /**
   * Stop the Pilot loop
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

    if (this.stuckCheckTimer) {
      clearInterval(this.stuckCheckTimer);
      this.stuckCheckTimer = null;
    }

    logger.info('Pilot: Stopped');
  }

  /**
   * Schedule next loop iteration
   */
  scheduleNextLoop() {
    if (!this.running) return;

    this.loopTimer = setTimeout(async () => {
      try {
        await this.loop();
      } catch (error) {
        logger.error('Pilot: Loop error', { error: error.message, stack: error.stack });
      }
      
      this.scheduleNextLoop();
    }, this.currentInterval);
  }

  /**
   * Main Pilot loop
   */
  async loop() {
    // Extract current game state
    const state = extractState(this.bot);
    
    // Write state to file for other layers
    await this.stateManager.write('state', state);

    // Detect threats
    const threats = this.detectThreats(state);
    
    // Adjust loop interval based on threat level
    this.adjustInterval(threats);

    // If threats detected, handle them immediately
    if (threats.length > 0) {
      logger.debug('Pilot: Threats detected', { count: threats.length, threats });
      await this.handleThreats(threats, state);
      return;
    }

    // No threats - execute plan from Strategy
    await this.executePlan(state);
  }

  /**
   * Detect threats in current state
   */
  detectThreats(state) {
    const threats = [];

    // Check hostile mobs
    if (state.entities && state.entities.hostile) {
      const nearbyHostile = state.entities.hostile.filter(
        mob => mob.distance <= THREAT_THRESHOLDS.hostileMobDistance
      );
      
      if (nearbyHostile.length > 0) {
        threats.push({
          type: 'hostile_mob',
          severity: 'high',
          entities: nearbyHostile,
          closestDistance: Math.min(...nearbyHostile.map(m => m.distance))
        });
      }
    }

    // Check lava
    if (state.blocks && state.blocks.hazardous) {
      const lava = state.blocks.hazardous.filter(
        block => block.type === 'lava' && block.distance <= THREAT_THRESHOLDS.lavaDistance
      );
      
      if (lava.length > 0) {
        threats.push({
          type: 'lava',
          severity: 'critical',
          blocks: lava,
          closestDistance: Math.min(...lava.map(b => b.distance))
        });
      }
    }

    // Check low health
    if (state.self && state.self.health < THREAT_THRESHOLDS.lowHealth) {
      threats.push({
        type: 'low_health',
        severity: 'high',
        health: state.self.health
      });
    }

    // Check if in lava
    if (state.self && state.self.is_in_lava) {
      threats.push({
        type: 'in_lava',
        severity: 'critical'
      });
    }

    // Check falling
    if (state.self && !state.self.is_on_ground) {
      const position = state.self.position;
      const blockBelow = this.bot.blockAt(
        new (require('vec3'))(position.x, position.y - THREAT_THRESHOLDS.fallDistance, position.z)
      );
      
      if (!blockBelow || blockBelow.name === 'air') {
        threats.push({
          type: 'falling',
          severity: 'medium'
        });
      }
    }

    return threats;
  }

  /**
   * Adjust loop interval based on threats
   */
  adjustInterval(threats) {
    let newMode = 'idle';
    let newInterval = INTERVALS.idle;

    if (threats.length > 0) {
      // Danger mode - fastest response
      newMode = 'danger';
      newInterval = INTERVALS.danger;
    } else if (this.executingAction || this.currentPlan.length > 0) {
      // Active mode - executing actions
      newMode = 'active';
      newInterval = INTERVALS.active;
    }

    if (newMode !== this.currentMode) {
      logger.debug('Pilot: Mode change', {
        from: this.currentMode,
        to: newMode,
        interval: newInterval
      });
      
      this.currentMode = newMode;
      this.currentInterval = newInterval;
    }
  }

  /**
   * Handle immediate threats
   */
  async handleThreats(threats, state) {
    // Sort by severity
    const criticalThreats = threats.filter(t => t.severity === 'critical');
    const highThreats = threats.filter(t => t.severity === 'high');

    const priorityThreat = criticalThreats[0] || highThreats[0] || threats[0];

    logger.info('Pilot: Handling threat', { threat: priorityThreat });

    // Build prompt for LLM (async for personality/relationship injection)
    const prompt = await this.buildThreatPrompt(priorityThreat, state);

    try {
      // Get reaction from LLM
      const response = await this.omniroute.pilot(prompt, {
        temperature: 0.3,
        maxTokens: 150
      });

      const action = this.parseAction(response);
      
      if (action) {
        // Execute with Action Awareness
        const result = await this.actionAwareness.executeWithVerification(
          action,
          this.predictOutcome(action, state)
        );

        if (!result.success) {
          logger.warn('Pilot: Threat response failed', {
            threat: priorityThreat.type,
            action,
            result
          });
        }
      }
    } catch (error) {
      logger.error('Pilot: Threat handling error', {
        threat: priorityThreat.type,
        error: error.message
      });
    }
  }

  /**
   * Execute plan from Strategy layer
   */
  async executePlan(state) {
    // Load plan if not already loaded
    if (this.currentPlan.length === 0) {
      const plan = await this.stateManager.read('plan');
      
      if (plan && Array.isArray(plan) && plan.length > 0) {
        this.currentPlan = plan;
        this.currentActionIndex = 0;
        logger.info('Pilot: Loaded new plan', { actionCount: plan.length });
      } else {
        // No plan - idle
        return;
      }
    }

    // Execute next action in plan
    if (this.currentActionIndex < this.currentPlan.length && !this.executingAction) {
      this.executingAction = true;
      
      const action = this.currentPlan[this.currentActionIndex];
      logger.debug('Pilot: Executing action', {
        index: this.currentActionIndex,
        total: this.currentPlan.length,
        action
      });

      try {
        const result = await this.actionAwareness.executeWithVerification(
          action,
          this.predictOutcome(action, state)
        );

        if (result.success) {
          this.currentActionIndex++;
          
          // Plan complete
          if (this.currentActionIndex >= this.currentPlan.length) {
            logger.info('Pilot: Plan completed');
            this.currentPlan = [];
            this.currentActionIndex = 0;
          }
        } else {
          // Action failed - signal Strategy
          logger.warn('Pilot: Action failed, signaling Strategy', {
            action,
            result
          });

          await this.stateManager.write('action_error', {
            action,
            expected: this.predictOutcome(action, state),
            actual: result.actual || result.reason,
            timestamp: Date.now(),
            planIndex: this.currentActionIndex
          });

          // Clear plan - Strategy will replan
          this.currentPlan = [];
          this.currentActionIndex = 0;
        }
      } catch (error) {
        logger.error('Pilot: Action execution error', {
          action,
          error: error.message
        });

        // Clear plan on error
        this.currentPlan = [];
        this.currentActionIndex = 0;
      } finally {
        this.executingAction = false;
      }
    }
  }

  /**
   * Build prompt for threat response
   */
  async buildThreatPrompt(threat, state) {
    const position = state.self.position;
    const health = state.self.health;

    let threatDescription = '';

    switch (threat.type) {
      case 'hostile_mob':
        const mob = threat.entities[0];
        threatDescription = `Hostile ${mob.type} at distance ${mob.distance} blocks`;
        break;
      case 'lava':
        const lavaBlock = threat.blocks[0];
        threatDescription = `Lava at distance ${lavaBlock.distance} blocks`;
        break;
      case 'in_lava':
        threatDescription = 'Bot is IN LAVA - CRITICAL';
        break;
      case 'low_health':
        threatDescription = `Low health: ${threat.health}/20`;
        break;
      case 'falling':
        threatDescription = 'Bot is falling';
        break;
    }

    const personalityBlock = await this._buildPersonalityBlock();
    const relationshipBlock = await this._buildRelationshipBlock();
    const visionBlock = this._buildVisionBlock();

    return `You are a Minecraft bot's fast reaction system. Respond to immediate threats.

${personalityBlock}

${relationshipBlock}
${visionBlock}
Current State:
- Position: ${position.x}, ${position.y}, ${position.z}
- Health: ${health}/20
- On ground: ${state.self.is_on_ground}

THREAT: ${threatDescription}

Respond with ONE immediate action in JSON format:
{"type": "move", "direction": "forward|back|left|right", "duration": 500}
OR
{"type": "attack", "target": "entity_uuid"}
OR
{"type": "jump"}

Choose the safest action to avoid the threat.`;
  }

  /**
   * Build vision context block (non-blocking, synchronous read)
   * Returns empty string if vision disabled or no recent analysis
   */
  _buildVisionBlock() {
    if (!featureFlags.isEnabled('VISION') || !this.visionState) {
      return '';
    }

    const analysis = this.visionState.getLatestAnalysis();

    if (!analysis) {
      return '';
    }

  const ageMs = Date.now() - analysis.timestamp;
  if (ageMs >= 30000) {
      logger.debug('Pilot: Vision analysis stale, skipping', { ageMs });
      return '';
    }

    logger.debug('Pilot: Using vision context', { ageMs, confidence: analysis.confidence });

    const parts = [];

    if (analysis.observations && analysis.observations.length > 0) {
      parts.push(`- Observations: ${analysis.observations.join(', ')}`);
    }

    if (analysis.threats && analysis.threats.length > 0) {
      parts.push(`- Threats detected: ${analysis.threats.join(', ')}`);
    }

    if (analysis.entities && analysis.entities.length > 0) {
      const entityNames = analysis.entities.map(e => e.type || e.name || 'unknown').join(', ');
      parts.push(`- Nearby entities: ${entityNames}`);
    }

    if (analysis.blocks && analysis.blocks.length > 0) {
      const blockNames = analysis.blocks.map(b => b.type || b.name || 'unknown').join(', ');
      parts.push(`- Notable blocks: ${blockNames}`);
    }

    if (analysis.confidence !== undefined) {
      parts.push(`- Vision confidence: ${(analysis.confidence * 100).toFixed(0)}%`);
    }

    if (parts.length === 0) {
      return '';
    }

    return `\nVision Context:\n${parts.join('\n')}\n`;
  }

  async _buildPersonalityBlock() {
    try {
      const traits = getTraits();
      const traitList = Object.entries(traits)
        .map(([name, value]) => `${name} (${value.toFixed(2)})`)
        .join(', ');

      const braveryNote = traits.bravery >= 0.7
        ? 'You are brave and willing to stand your ground against threats.'
        : traits.bravery >= 0.4
        ? 'You are moderately cautious when facing danger.'
        : 'You prefer to avoid danger when possible.';

      return `Personality: You are ${traitList}. ${braveryNote}`;
    } catch (err) {
      logger.warn('Pilot: Could not load personality traits', { error: err.message });
      return 'Personality: Default cautious reaction mode.';
    }
  }

  async _buildRelationshipBlock() {
    try {
      const relationship = await getRelationship();
      return formatForPrompt(relationship);
    } catch (err) {
      logger.warn('Pilot: Could not load relationship state', { error: err.message });
      return 'Relationship: Unknown player relationship.';
    }
  }

  /**
   * Parse action from LLM response
   */
  parseAction(response) {
    try {
      const content = response.choices[0].message.content;
      
      // Extract JSON from response
      const jsonMatch = content.match(/\{[^}]+\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      logger.warn('Pilot: Could not parse action from response', { content });
      return null;
    } catch (error) {
      logger.error('Pilot: Action parsing error', { error: error.message });
      return null;
    }
  }

  /**
   * Predict expected outcome for action
   */
  predictOutcome(action, state) {
    switch (action.type) {
      case 'move':
        return {
          moved: true,
          positionChanged: true
        };
      
      case 'dig':
        return {
          blockRemoved: true,
          itemsGained: [{ name: action.blockType || 'unknown' }]
        };
      
      case 'place':
        return {
          blockPlaced: true,
          itemsUsed: [{ name: action.blockType }]
        };
      
      case 'attack':
        return {
          attacked: true,
          targetDamaged: true
        };
      
      case 'jump':
        return {
          jumped: true,
          onGround: false
        };
      
      default:
        return {};
    }
  }

  /**
   * Start stuck detection monitoring
   */
  startStuckDetection() {
    this.stuckCheckTimer = setInterval(() => {
      if (!this.bot.entity || !this.bot.entity.position) {
        return;
      }

      const currentPos = this.bot.entity.position;
      
      if (this.lastPosition) {
        const distance = Math.sqrt(
          Math.pow(currentPos.x - this.lastPosition.x, 2) +
          Math.pow(currentPos.y - this.lastPosition.y, 2) +
          Math.pow(currentPos.z - this.lastPosition.z, 2)
        );

        const timeSinceMove = Date.now() - this.lastMoveTime;

        // Check if stuck
        if (distance < STUCK_THRESHOLD.distance && timeSinceMove > STUCK_THRESHOLD.duration) {
          logger.warn('Pilot: Bot appears stuck', {
            position: currentPos,
            timeSinceMove,
            distance
          });

          // Signal Strategy
          this.stateManager.write('pilot_stuck', {
            position: { x: currentPos.x, y: currentPos.y, z: currentPos.z },
            duration: timeSinceMove,
            timestamp: Date.now()
          }).catch(err => {
            logger.error('Pilot: Failed to write stuck signal', { error: err.message });
          });

          // Reset timer
          this.lastMoveTime = Date.now();
        } else if (distance >= STUCK_THRESHOLD.distance) {
          // Bot moved - update tracking
          this.lastMoveTime = Date.now();
        }
      }

      this.lastPosition = { x: currentPos.x, y: currentPos.y, z: currentPos.z };
    }, 5000); // Check every 5 seconds
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      running: this.running,
      mode: this.currentMode,
      interval: this.currentInterval,
      planLength: this.currentPlan.length,
      currentActionIndex: this.currentActionIndex,
      executingAction: this.executingAction
    };
  }
}

module.exports = Pilot;
