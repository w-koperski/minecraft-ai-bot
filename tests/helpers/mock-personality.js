const DEFAULT_TRAITS = {
  bravery: {
    value: 0.7,
    min: 0,
    max: 1,
    description: 'Fearlessness in dangerous situations',
  },
  curiosity: {
    value: 0.6,
    min: 0,
    max: 1,
    description: 'Desire to explore and discover',
  },
  patience: {
    value: 0.5,
    min: 0,
    max: 1,
    description: 'Willingness to wait for long-term goals',
  },
  aggression: {
    value: 0.3,
    min: 0,
    max: 1,
    description: 'Tendency to engage in combat',
  },
  sociability: {
    value: 0.8,
    min: 0,
    max: 1,
    description: 'Tendency to interact with players',
  },
};

const TRAIT_ADJUSTMENTS = {
  danger_nearby: { bravery: 0.1, aggression: 0.05 },
  success: { confidence: 0.1 },
  failure: { patience: 0.05 },
  exploration: { curiosity: 0.05 },
  combat: { aggression: 0.1, bravery: 0.05 },
};

function createMockTrait(name, value = null) {
  const trait = DEFAULT_TRAITS[name] || {
    value: 0.5,
    min: 0,
    max: 1,
    description: `Custom trait: ${name}`,
  };
  return {
    name,
    value: value !== null ? value : trait.value,
    min: trait.min,
    max: trait.max,
    description: trait.description,
  };
}

function createMockTraits(overrides = {}) {
  const traits = {};
  for (const [name, defaultTrait] of Object.entries(DEFAULT_TRAITS)) {
    traits[name] = createMockTrait(name, overrides[name] !== undefined ? overrides[name] : defaultTrait.value);
  }
  return traits;
}

function createMockPersonalityEngine(customTraits = null) {
  const traits = customTraits || createMockTraits();

  return {
    traits,

    getTrait(name) {
      return traits[name] || null;
    },

    setTrait(name, value) {
      if (traits[name]) {
        traits[name].value = Math.max(0, Math.min(1, value));
      }
    },

    adjustTrait(name, delta) {
      if (traits[name]) {
        traits[name].value = Math.max(0, Math.min(1, traits[name].value + delta));
      }
    },

    getResponseStyle() {
      return {
        tone: traits.bravery.value > 0.6 ? 'confident' : 'cautious',
        verbosity: traits.patience.value > 0.5 ? 'detailed' : 'concise',
        aggression: traits.aggression.value > 0.5 ? 'assertive' : 'passive',
      };
    },

    serialize() {
      const serialized = { traits: {} };
      for (const [name, trait] of Object.entries(traits)) {
        serialized.traits[name] = { value: trait.value };
      }
      return serialized;
    },

    trigger(event) {
      const adjustments = TRAIT_ADJUSTMENTS[event] || {};
      for (const [traitName, delta] of Object.entries(adjustments)) {
        if (traits[traitName]) {
          this.adjustTrait(traitName, delta);
        }
      }
      return { event, adjustments };
    },

    decay(rate = 0.01) {
      for (const trait of Object.values(traits)) {
        if (trait.value > 0.5) {
          trait.value = Math.max(0.5, trait.value - rate);
        }
      }
    },
  };
}

function createMockEmotionalState(mood = 'neutral', intensity = 0.5) {
  return {
    mood,
    intensity,
    triggers: [],
    timestamp: Date.now(),
  };
}

function createMockPersonalitySnapshot(engine) {
  return {
    traits: engine.serialize(),
    responseStyle: engine.getResponseStyle(),
    timestamp: Date.now(),
  };
}

function createTraitPersonalityPair(traits) {
  const engine = createMockPersonalityEngine(traits);
  return { engine, traits };
}

module.exports = {
  DEFAULT_TRAITS,
  TRAIT_ADJUSTMENTS,
  createMockTrait,
  createMockTraits,
  createMockPersonalityEngine,
  createMockEmotionalState,
  createMockPersonalitySnapshot,
  createTraitPersonalityPair,
};