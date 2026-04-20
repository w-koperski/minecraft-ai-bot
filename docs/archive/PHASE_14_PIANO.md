# Phase 14: PIANO-Inspired Improvements (2h)

## Based on: Project Sid (Altera.AI, 2024) - arxiv.org/abs/2411.00114

### 1. Action Awareness Module (`src/layers/action-awareness.js`)

```javascript
const logger = require('../utils/logger');
const StateManager = require('../utils/state-manager');

class ActionAwareness {
  constructor(bot, vision) {
    this.bot = bot;
    this.vision = vision;
    this.stateManager = new StateManager();
    this.actionHistory = [];
    this.maxHistory = 50;
  }

  async executeWithVerification(action, expectedOutcome) {
    const startState = this.vision.extractState();
    const startTime = Date.now();

    try {
      // Execute action
      await this._performAction(action);

      // Wait for state to update
      await this._wait(500);

      // Observe actual outcome
      const endState = this.vision.extractState();
      const actualOutcome = this._extractOutcome(startState, endState, action);

      // Verify match
      const match = this._verifyOutcome(expectedOutcome, actualOutcome);

      // Record in history
      this.actionHistory.push({
        action,
        expected: expectedOutcome,
        actual: actualOutcome,
        match,
        timestamp: startTime,
        duration: Date.now() - startTime
      });

      if (this.actionHistory.length > this.maxHistory) {
        this.actionHistory.shift();
      }

      if (!match) {
        logger.warn('Action outcome mismatch', {
          action,
          expected: expectedOutcome,
          actual: actualOutcome
        });

        // Signal to Strategy
        await this.stateManager.write('action_error', {
          action,
          expected: expectedOutcome,
          actual: actualOutcome,
          timestamp: Date.now(),
          severity: this._calculateSeverity(expectedOutcome, actualOutcome)
        });

        return { success: false, reason: 'outcome_mismatch', actual: actualOutcome };
      }

      return { success: true, outcome: actualOutcome };

    } catch (error) {
      logger.error('Action execution failed', { action, error });
      return { success: false, reason: 'execution_error', error: error.message };
    }
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
        // Implementation
        break;

      case 'craft':
        // Implementation
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
    // Simple heuristic matching
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
    // High severity if critical action failed
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
```

### 2. Update Pilot to use Action Awareness

```javascript
// In pilot.js
const ActionAwareness = require('./action-awareness');

class Pilot {
  constructor(bot, vision) {
    // ... existing code
    this.actionAwareness = new ActionAwareness(bot, vision);
  }

  async _execute(action) {
    // Predict expected outcome
    const expectedOutcome = this._predictOutcome(action);

    // Execute with verification
    const result = await this.actionAwareness.executeWithVerification(action, expectedOutcome);

    if (!result.success) {
      logger.warn('Action failed verification', { action, result });
      
      // Check if Strategy needs to intervene
      const recentFailures = this.actionAwareness.getRecentFailures(3);
      if (recentFailures.length >= 3) {
        logger.error('Multiple action failures, requesting Strategy intervention');
        await this.stateManager.write('pilot_stuck', {
          recentFailures,
          timestamp: Date.now()
        });
      }
    }

    return result;
  }

  _predictOutcome(action) {
    switch (action.action) {
      case 'move':
        return {
          moved: true,
          positionChange: { x: 0, z: 0 } // Simplified
        };

      case 'dig':
        return {
          blockRemoved: true,
          itemsGained: [{ name: action.block, count: 1 }]
        };

      case 'craft':
        return {
          itemsCrafted: [{ name: action.item, count: action.count || 1 }]
        };

      default:
        return {};
    }
  }
}
```

### 3. Strategy Error Recovery

```javascript
// In strategy.js
async _loop() {
  // ... existing code

  // Check for pilot errors
  const actionError = await this.stateManager.read('action_error');
  if (actionError && Date.now() - actionError.timestamp < 5000) {
    logger.warn('Pilot reported action error, adjusting strategy', { actionError });
    await this._handleActionError(actionError);
    await this.stateManager.write('action_error', null); // Clear
  }

  // Check if pilot is stuck
  const pilotStuck = await this.stateManager.read('pilot_stuck');
  if (pilotStuck && Date.now() - pilotStuck.timestamp < 10000) {
    logger.error('Pilot stuck, requesting Commander intervention');
    await this.stateManager.write('commands', {
      goal: null,
      stuck: true,
      reason: 'Pilot repeated action failures',
      requestNewStrategy: true
    });
    await this.stateManager.write('pilot_stuck', null); // Clear
  }
}

async _handleActionError(error) {
  const { action, expected, actual, severity } = error;

  if (severity === 'high') {
    // Critical failure - change plan immediately
    logger.warn('Critical action failure, replanning');
    const currentPlan = await this.stateManager.read('plan') || [];
    
    // Remove failed action and retry with different approach
    const newPlan = currentPlan.filter(a => 
      JSON.stringify(a) !== JSON.stringify(action)
    );
    
    // Add alternative action
    newPlan.unshift(this._generateAlternative(action, actual));
    
    await this.stateManager.write('plan', newPlan);
  } else {
    // Low/medium severity - retry with adjustment
    logger.info('Action failed, will retry with adjustment');
  }
}

_generateAlternative(failedAction, actualOutcome) {
  // Generate alternative action based on what actually happened
  if (failedAction.action === 'dig' && !actualOutcome.blockRemoved) {
    // Block not removed - maybe wrong tool or out of reach
    return {
      action: 'move',
      direction: 'forward',
      reason: 'Get closer to block'
    };
  }

  if (failedAction.action === 'move' && !actualOutcome.moved) {
    // Didn't move - maybe blocked
    return {
      action: 'jump',
      reason: 'Try to overcome obstacle'
    };
  }

  // Default: stop and reassess
  return {
    action: 'stop',
    reason: 'Reassess situation'
  };
}
```

### 4. Commander Context Reset

```javascript
// In commander.js
async _decide(state, commands, progress) {
  // Check for cascading errors
  const actionError = await this.stateManager.read('action_error');
  const pilotStuck = await this.stateManager.read('pilot_stuck');

  if (pilotStuck || (actionError && actionError.severity === 'high')) {
    logger.warn('Detected error cascade, resetting context');
    
    // Reset Commander context - don't continue with wrong assumptions
    await this.stateManager.write('commands', {
      goal: null,
      reason: 'Error cascade detected, resetting'
    });
    
    await this.stateManager.write('plan', []);
    await this.stateManager.write('progress', {});
    
    // Wait for user input or auto-generate safe goal
    const safeGoal = await this._generateSafeGoal(state);
    
    return {
      action: 'change_goal',
      new_goal: safeGoal,
      reason: 'Recovered from error cascade',
      report: `Error detected, switching to safe goal: ${safeGoal}`
    };
  }

  // ... existing decision logic
}

async _generateSafeGoal(state) {
  // Generate safe goal based on current state
  if (state.health < 10) {
    return 'find food and heal';
  }
  
  if (state.threats.length > 0) {
    return 'retreat to safe area';
  }
  
  // Default safe goal
  return 'explore nearby area';
}
```

### 5. Memory Tiering (already in Phase 8, enhance)

```javascript
// In memory-store.js - add access control
class MemoryStore {
  constructor(dbPath, accessLevel = 'full') {
    this.db = new sqlite3.Database(dbPath);
    this.accessLevel = accessLevel; // 'working', 'short', 'long', 'full'
    this._initTables();
  }

  async remember(key, value, memoryType = 'short') {
    // Enforce access control
    if (this.accessLevel === 'working' && memoryType !== 'working') {
      throw new Error('Access denied: working memory only');
    }
    
    if (this.accessLevel === 'short' && memoryType === 'long') {
      throw new Error('Access denied: no long-term memory access');
    }

    // ... existing implementation
  }
}

// Usage in layers:
// Pilot: new MemoryStore('state/memory.db', 'working')
// Strategy: new MemoryStore('state/memory.db', 'short')
// Commander: new MemoryStore('state/memory.db', 'full')
```

---

## Summary of PIANO-inspired improvements

1. **Action Awareness** - verify every action's outcome, detect hallucinations early
2. **Error cascade prevention** - Commander resets context when errors compound
3. **Memory tiering** - different layers have different memory access levels
4. **Alternative generation** - Strategy generates alternatives when actions fail
5. **Coherence through bottleneck** - Commander broadcasts decisions to all layers

**Estimated time:** 2 hours
**Priority:** High (prevents hallucination compounding, major issue in LLM agents)

---

Ready to integrate into main implementation plan?
