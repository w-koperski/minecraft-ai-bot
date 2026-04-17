const Graph = require('graphology');
const logger = require('../utils/logger');

class GoalGraph {
  constructor() {
    this.graph = new Graph({ type: 'directed' });
    this._initializeBasicGoals();
  }

  _initializeBasicGoals() {
    // Survival goals
    this.addGoal('survive', {
      description: 'Stay alive - maintain health and avoid death',
      importance: 10,
      category: 'survival'
    });
    this.addGoal('find_shelter', {
      description: 'Find or build shelter for night',
      importance: 8,
      category: 'survival'
    });

    // Resource gathering
    this.addGoal('gather_wood', {
      description: 'Collect oak logs from trees',
      importance: 7,
      category: 'resources'
    });
    this.addGoal('gather_stone', {
      description: 'Mine cobblestone',
      importance: 6,
      category: 'resources'
    });
    this.addGoal('gather_iron', {
      description: 'Mine iron ore',
      importance: 7,
      category: 'resources'
    });

    // Crafting goals
    this.addGoal('craft_wooden_tools', {
      description: 'Craft wooden pickaxe and axe',
      importance: 6,
      category: 'crafting'
    });
    this.addGoal('craft_stone_tools', {
      description: 'Craft stone pickaxe and axe',
      importance: 7,
      category: 'crafting'
    });
    this.addGoal('craft_iron_tools', {
      description: 'Craft iron pickaxe and sword',
      importance: 8,
      category: 'crafting'
    });

    // Exploration
    this.addGoal('explore', {
      description: 'Explore the world and discover new areas',
      importance: 5,
      category: 'exploration'
    });
    this.addGoal('find_village', {
      description: 'Locate a village',
      importance: 6,
      category: 'exploration'
    });

    // Building
    this.addGoal('build_house', {
      description: 'Build a basic house',
      importance: 6,
      category: 'building'
    });

    // Dependencies
    this.addDependency('craft_wooden_tools', 'gather_wood');
    this.addDependency('craft_stone_tools', 'gather_stone');
    this.addDependency('craft_stone_tools', 'craft_wooden_tools');
    this.addDependency('gather_iron', 'craft_stone_tools');
    this.addDependency('craft_iron_tools', 'gather_iron');
    this.addDependency('build_house', 'gather_wood');
  }

  addGoal(name, attributes = {}) {
    if (this.graph.hasNode(name)) {
      logger.warn('Goal already exists', { name });
      return;
    }
    this.graph.addNode(name, {
      name,
      description: attributes.description || '',
      importance: attributes.importance || 5,
      category: attributes.category || 'general',
      ...attributes
    });
  }

  addDependency(goal, prerequisite) {
    if (!this.graph.hasNode(goal)) {
      throw new Error(`Goal ${goal} does not exist`);
    }
    if (!this.graph.hasNode(prerequisite)) {
      throw new Error(`Prerequisite ${prerequisite} does not exist`);
    }
    // Add edge from prerequisite to goal (prerequisite enables goal)
    if (!this.graph.hasEdge(prerequisite, goal)) {
      this.graph.addEdge(prerequisite, goal, { type: 'depends_on' });
    }
  }

  getGoal(name) {
    if (!this.graph.hasNode(name)) {
      return null;
    }
    return this.graph.getNodeAttributes(name);
  }

  getAchievableGoals(context = {}) {
    const completed = context.completed || [];
    const achievable = [];

    for (const node of this.graph.nodes()) {
      // Skip if already completed
      if (completed.includes(node)) continue;

      // Check if all prerequisites are met
      const prerequisites = this.graph.inNeighbors(node);
      const allPrereqsMet = prerequisites.every(prereq => completed.includes(prereq));

      if (allPrereqsMet) {
        achievable.push({
          name: node,
          ...this.graph.getNodeAttributes(node)
        });
      }
    }

    return achievable;
  }

  getGoalPath(goalName) {
    if (!this.graph.hasNode(goalName)) {
      return [];
    }

    const path = [];
    const visited = new Set();

    const traverse = (node) => {
      if (visited.has(node)) return;
      visited.add(node);

      const prerequisites = this.graph.inNeighbors(node);
      for (const prereq of prerequisites) {
        traverse(prereq);
      }
      path.push(node);
    };

    traverse(goalName);
    return path;
  }

  getAllGoals() {
    return this.graph.nodes().map(node => ({
      name: node,
      ...this.graph.getNodeAttributes(node)
    }));
  }
}

module.exports = GoalGraph;
