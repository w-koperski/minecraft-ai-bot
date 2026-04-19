/**
 * ReflectionModule - Analyzes bot performance every 30 minutes
 * 
 * Features:
 * - Success rate tracking from ActionAwareness
 * - Failure pattern analysis
 * - Learning generation
 * - Adjustment suggestions
 * - Knowledge graph integration for persistent memory
 */

const logger = require('../utils/logger');

class ReflectionModule {
  constructor(actionAwareness, knowledgeGraph, strategyMemory = null) {
    this.actionAwareness = actionAwareness;
    this.knowledgeGraph = knowledgeGraph;
    this.strategyMemory = strategyMemory;
    this.lastReflection = Date.now();
    this.reflectionHistory = [];
    this.maxHistory = 48; // Keep last 48 reflections (24 hours at 30min intervals)
  }

  /**
   * Perform reflection analysis
   * @returns {Object} Reflection results
   */
  reflect() {
    const now = Date.now();
    const period = { start: this.lastReflection, end: now };
    
    // Get metrics from ActionAwareness
    const successRate = this.actionAwareness.getSuccessRate();
    const recentFailures = this.actionAwareness.getRecentFailures(10);
    const patterns = this._analyzePatterns(recentFailures);
    
    // Generate learnings and adjustments
    const learnings = this._generateLearnings(successRate, patterns);
    const adjustments = this._suggestAdjustments(successRate, patterns);
    
    const reflection = {
      period,
      successRate,
      patterns,
      learnings,
      adjustments,
      timestamp: now
    };
    
    // Log reflection
    logger.info('Reflection complete', reflection);
    
    // Store in reflection history
    this.reflectionHistory.push(reflection);
    if (this.reflectionHistory.length > this.maxHistory) {
      this.reflectionHistory.shift();
    }
    
    // Store in knowledge graph if available
    if (this.knowledgeGraph) {
      this.knowledgeGraph.addSemanticMemory(
        `reflection_${now}`,
        'performance_analysis',
        reflection
      );
    }

  if (this.strategyMemory) {
    this._storeStrategies(successRate, patterns, now, learnings);
  }

    this.lastReflection = now;
    return reflection;
  }

  /**
   * Analyze failure patterns
   * @param {Array} failures - Recent failures from ActionAwareness
   * @returns {Array} Detected patterns
   */
  _analyzePatterns(failures) {
    const patterns = [];
    const actionTypes = {};
    
    failures.forEach(f => {
      if (!f.action || !f.action.type) return;
      const type = f.action.type;
      actionTypes[type] = (actionTypes[type] || 0) + 1;
    });
    
    for (const [type, count] of Object.entries(actionTypes)) {
      if (count >= 3) {
        patterns.push({ type, count, severity: 'high' });
      } else if (count >= 2) {
        patterns.push({ type, count, severity: 'medium' });
      }
    }
    
    return patterns;
  }

  /**
   * Generate learnings from success rate and patterns
   * @param {number} successRate - Current success rate (0-1)
   * @param {Array} patterns - Detected failure patterns
   * @returns {Array} Learning statements
   */
  _generateLearnings(successRate, patterns) {
    const learnings = [];
    
    if (successRate < 0.7) {
      learnings.push('Success rate below target - investigate failure causes');
    }
    
    if (successRate < 0.5) {
      learnings.push('Critical: success rate dangerously low - immediate intervention needed');
    }
    
    patterns.forEach(p => {
      learnings.push(`${p.type} actions failing frequently (${p.count} times) - check conditions`);
    });
    
    return learnings;
  }

  /**
   * Suggest adjustments based on analysis
   * @param {number} successRate - Current success rate (0-1)
   * @param {Array} patterns - Detected failure patterns
   * @returns {Array} Adjustment suggestions
   */
  _suggestAdjustments(successRate, patterns) {
    const adjustments = [];
    
    if (successRate < 0.7) {
      adjustments.push('Increase confidence threshold for actions');
    }
    
    if (successRate < 0.5) {
      adjustments.push('Pause autonomous actions and request human intervention');
    }
    
    patterns.forEach(p => {
      if (p.type === 'move') {
        adjustments.push('Check pathfinding - may need obstacle avoidance');
      } else if (p.type === 'dig') {
        adjustments.push('Verify tool selection before digging');
      } else if (p.type === 'craft') {
        adjustments.push('Verify materials available before crafting');
      }
    });
    
    return adjustments;
  }

  _storeStrategies(successRate, patterns, now, learnings) {
    if (!this.strategyMemory) return;

    if (successRate >= 0.7) {
      this.strategyMemory.storeStrategy(
        `reflection_success_${now}`,
        `Success rate: ${successRate.toFixed(2)}`,
        learnings,
        'Successful reflection period',
        successRate,
        { reflectionId: `reflection_${now}` }
      );
    }

    patterns.forEach(p => {
      this.strategyMemory.storeStrategy(
        `reflection_failure_${p.type}_${now}`,
        `Failure pattern: ${p.type} (count: ${p.count})`,
        [`Avoid ${p.type} in similar contexts`],
        `Failed ${p.count} times`,
        0.0,
        { reflectionId: `reflection_${now}`, severity: p.severity }
      );
    });
  }

  /**
   * Get reflection history
   * @param {number} limit - Max number of reflections to return
   * @returns {Array} Recent reflections
   */
  getHistory(limit = 10) {
    return this.reflectionHistory.slice(-limit);
  }

  /**
   * Get average success rate over recent reflections
   * @param {number} count - Number of reflections to average
   * @returns {number} Average success rate
   */
  getAverageSuccessRate(count = 5) {
    const recent = this.reflectionHistory.slice(-count);
    if (recent.length === 0) return 1.0;
    
    const sum = recent.reduce((acc, r) => acc + r.successRate, 0);
    return sum / recent.length;
  }
}

module.exports = ReflectionModule;
