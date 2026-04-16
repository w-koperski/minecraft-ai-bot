class SkillRegistry {
  constructor() {
    this.skills = new Map();
    this._registerPrimitives();
  }

  register(skill) {
    if (!skill.name || !skill.execute) {
      throw new Error('Invalid skill: must have name and execute');
    }
    this.skills.set(skill.name, skill);
  }

  get(name) {
    return this.skills.get(name);
  }

  list() {
    return Array.from(this.skills.values());
  }

  async execute(name, params, context) {
    const skill = this.get(name);
    if (!skill) {
      return { success: false, error: `Skill not found: ${name}` };
    }

    try {
      return await skill.execute(params, context);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  _registerPrimitives() {
    const moveSkill = require('./primitives/move');
    const digSkill = require('./primitives/dig');
    const placeSkill = require('./primitives/place');
    const craftSkill = require('./primitives/craft');
    const collectSkill = require('./primitives/collect');

    this.register(moveSkill);
    this.register(digSkill);
    this.register(placeSkill);
    this.register(craftSkill);
    this.register(collectSkill);
  }
}

module.exports = SkillRegistry;
