class SkillRegistry {
  constructor() {
    this.skills = new Map();
    this._registerPrimitives();
    this._registerComposites();
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

  _registerComposites() {
    const gatherWood = require('./composite/gather-wood');
    const mineStone = require('./composite/mine-stone');
    const craftTools = require('./composite/craft-tools');
    const buildShelter = require('./composite/build-shelter');
    const huntFood = require('./composite/hunt-food');

    this.register(gatherWood);
    this.register(mineStone);
    this.register(craftTools);
    this.register(buildShelter);
    this.register(huntFood);
  }
}

module.exports = SkillRegistry;
