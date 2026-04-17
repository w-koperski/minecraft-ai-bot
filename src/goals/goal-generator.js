const logger = require('../utils/logger');

class GoalGenerator {
  constructor(goalGraph, goalScorer) {
    this.goalGraph = goalGraph;
    this.goalScorer = goalScorer;
    this.lastGenerated = 0;
    this.minInterval = 60000; // 1 minute
  }

  generateGoal(context = {}) {
    const now = Date.now();
    if (now - this.lastGenerated < this.minInterval) {
      return null;
    }

    // Get achievable goals
    const achievable = this.goalGraph.getAchievableGoals(context);
    if (achievable.length === 0) {
      return null;
    }

    // Score each goal
    const scored = achievable.map(goal => ({
      ...goal,
      score: this.goalScorer.scoreGoal(goal, context)
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Select highest scoring goal
    const selected = scored[0];

    if (selected.score < 0.3) {
      logger.debug('No goals above threshold', { highestScore: selected.score });
      return null;
    }

    this.lastGenerated = now;
    logger.info('Goal generated', {
      goal: selected.name,
      score: selected.score,
      category: selected.category
    });

    return {
      name: selected.name,
      description: selected.description,
      score: selected.score,
      category: selected.category,
      urgency: selected.score > 0.7 ? 'high' : selected.score > 0.5 ? 'medium' : 'low'
    };
  }
}

module.exports = GoalGenerator;
