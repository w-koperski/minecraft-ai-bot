class GoalScorer {
  constructor(options = {}) {
    this.personality = options.personality || {};
    this.dangerPredictor = options.dangerPredictor;
  }

  scoreGoal(goal, context = {}) {
    let score = goal.importance / 10; // Base score from goal importance (0-1)

    // Personality factor (30%)
    const personalityBonus = this._getPersonalityBonus(goal, this.personality);
    score += personalityBonus * 0.3;

    // Needs factor (25%)
    const needsBonus = this._getNeedsBonus(goal, context);
    score += needsBonus * 0.25;

    // Recent events factor (25%)
    const eventsBonus = this._getEventsBonus(goal, context);
    score += eventsBonus * 0.25;

    // Danger penalty (20%)
    const dangerPenalty = this._getDangerPenalty(goal, context);
    score -= dangerPenalty * 0.2;

    return Math.max(0, Math.min(1, score));
  }

  _getPersonalityBonus(goal, personality) {
    const category = goal.category || 'general';
    if (category === 'exploration' && personality.curiosity > 0.7) return 0.5;
    if (category === 'survival' && personality.bravery < 0.3) return 0.5;
    if (category === 'building' && personality.creativity > 0.7) return 0.5;
    if (category === 'resources' && personality.diligence > 0.7) return 0.3;
    return 0;
  }

  _getNeedsBonus(goal, context) {
    const health = context.health || 20;
    const food = context.food || 20;

    if (health < 6 && goal.category === 'survival') return 1.0;
    if (food < 6 && goal.name === 'find_food') return 1.0;
    if (context.inventory && context.inventory.length < 5 && goal.category === 'resources') return 0.5;
    return 0;
  }

  _getEventsBonus(goal, context) {
    const recentEvents = context.recentEvents || [];
    for (const event of recentEvents) {
      if (event.type === 'death' && goal.category === 'survival') return 0.8;
      if (event.type === 'player_request' && event.goal === goal.name) return 1.0;
    }
    return 0;
  }

  _getDangerPenalty(goal, context) {
    if (!this.dangerPredictor || !goal.location) return 0;
    const dangerLevel = context.dangerLevel || 0;
    if (dangerLevel > 0.5) return dangerLevel;
    return 0;
  }
}

module.exports = GoalScorer;
