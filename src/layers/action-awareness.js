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
      await this._performAction(action);

      await this._wait(500);

      const endState = this.vision.extractState();
      const actualOutcome = this._extractOutcome(startState, endState, action);

      const match = this._verifyOutcome(expectedOutcome, actualOutcome);

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
