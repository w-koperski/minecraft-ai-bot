jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('CognitiveController', () => {
  let CognitiveController;
  let controller;

  beforeEach(() => {
    jest.resetModules();
    CognitiveController = require('../../src/layers/cognitive-controller');
    controller = new CognitiveController();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(controller).toBeDefined();
    });

    it('should initialize modules as empty object', () => {
      expect(controller.modules).toEqual({});
    });

    it('should initialize decisionHistory as empty array', () => {
      expect(controller.decisionHistory).toEqual([]);
    });

    it('should set maxHistory to 50', () => {
      expect(controller.maxHistory).toBe(50);
    });
  });

  describe('registerModule', () => {
    it('should register a module', () => {
      const mockModule = { name: 'test' };
      controller.registerModule('personality', mockModule);
      expect(controller.modules.personality).toBe(mockModule);
    });

    it('should allow registering multiple modules', () => {
      const personality = { name: 'personality' };
      const emotion = { name: 'emotion' };
      const social = { name: 'social' };

      controller.registerModule('personality', personality);
      controller.registerModule('emotion', emotion);
      controller.registerModule('social', social);

      expect(Object.keys(controller.modules).length).toBe(3);
    });
  });

  describe('synthesize', () => {
    it('should exist as a function', () => {
      expect(typeof controller.synthesize).toBe('function');
    });

    it('should return an object', () => {
      const inputs = {
        personality: { traits: {} },
        emotion: { state: 'happy' },
        social: { context: 'friendly' },
        goals: { current: 'explore' }
      };
      const result = controller.synthesize(inputs);
      expect(typeof result).toBe('object');
    });

    it('should return object with timestamp', () => {
      const inputs = {
        personality: {},
        emotion: {},
        social: {},
        goals: {}
      };
      const result = controller.synthesize(inputs);
      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe('number');
    });

    it('should return object with inputs property', () => {
      const inputs = {
        personality: {},
        emotion: {},
        social: {},
        goals: {}
      };
      const result = controller.synthesize(inputs);
      expect(result.inputs).toBe(inputs);
    });

    it('should record decision in history', () => {
      const inputs = {
        personality: {},
        emotion: {},
        social: {},
        goals: {}
      };
      controller.synthesize(inputs);
      expect(controller.decisionHistory.length).toBe(1);
    });

    it('should respect maxHistory limit', () => {
      const inputs = {
        personality: {},
        emotion: {},
        social: {},
        goals: {}
      };
      controller.maxHistory = 3;
      for (let i = 0; i < 5; i++) {
        controller.synthesize(inputs);
      }
      expect(controller.decisionHistory.length).toBe(3);
    });

    // Priority Resolution Tests
    describe('priority resolution', () => {
      it('should prioritize danger over social', () => {
        const inputs = {
          danger: {
            active: true,
            action: { type: 'flee', reason: 'hostile_mob' },
            confidence: 1.0
          },
          social: {
            active: true,
            action: { type: 'chat', message: 'Hello!' },
            confidence: 0.8
          },
          goals: null
        };

        const result = controller.synthesize(inputs);

        expect(result.action.type).toBe('flee');
        expect(result.priority).toBe('critical');
        expect(result.source).toBe('danger');
      });

      it('should prioritize danger over goals', () => {
        const inputs = {
          danger: {
            active: true,
            action: { type: 'flee', reason: 'lava' },
            confidence: 1.0
          },
          goals: {
            active: true,
            action: { type: 'collect', item: 'diamond' },
            confidence: 0.6
          },
          social: null
        };

        const result = controller.synthesize(inputs);

        expect(result.action.type).toBe('flee');
        expect(result.priority).toBe('critical');
      });

      it('should prioritize social over goals when no danger', () => {
        const inputs = {
          social: {
            active: true,
            action: { type: 'chat', message: 'Hi!' },
            confidence: 0.8
          },
          goals: {
            active: true,
            action: { type: 'explore', target: 'cave' },
            confidence: 0.6
          }
        };

        const result = controller.synthesize(inputs);

        expect(result.action.type).toBe('chat');
        expect(result.priority).toBe('high');
        expect(result.source).toBe('social');
      });

      it('should use goals when no danger or social', () => {
        const inputs = {
          goals: {
            active: true,
            action: { type: 'collect', item: 'wood' },
            confidence: 0.6
          }
        };

        const result = controller.synthesize(inputs);

        expect(result.action.type).toBe('collect');
        expect(result.priority).toBe('normal');
        expect(result.source).toBe('goals');
      });

      it('should idle when no active inputs', () => {
        const inputs = {};

        const result = controller.synthesize(inputs);

        expect(result.action.type).toBe('idle');
        expect(result.priority).toBe('low');
        expect(result.source).toBe('default');
      });

      it('should include confidence in decision', () => {
        const inputs = {
          danger: {
            active: true,
            action: { type: 'flee' },
            confidence: 0.95
          }
        };

        const result = controller.synthesize(inputs);

        expect(result.confidence).toBe(0.95);
      });

      it('should include deferred inputs in decision', () => {
        const inputs = {
          danger: {
            active: true,
            action: { type: 'flee' }
          },
          social: {
            active: true,
            action: { type: 'chat' }
          },
          goals: {
            active: true,
            action: { type: 'collect' }
          }
        };

        const result = controller.synthesize(inputs);

        expect(result.deferred).toHaveLength(2);
        expect(result.deferred[0].source).toBe('social');
        expect(result.deferred[1].source).toBe('goals');
      });
    });

    // Emotion Blending Tests
    describe('emotion blending', () => {
      it('should blend emotion with social action', () => {
        const inputs = {
          social: {
            active: true,
            action: { type: 'chat', message: 'Hello' },
            confidence: 0.8
          },
          emotion: {
            state: 'joy',
            confidence: 0.9
          }
        };

        const result = controller.synthesize(inputs);

        expect(result.action.emotionalContext).toBe('joy');
        expect(result.action.tone).toBe('friendly');
      });

      it('should apply cautious tone when emotion is fear', () => {
        const inputs = {
          social: {
            active: true,
            action: { type: 'chat', message: 'Hello' }
          },
          emotion: {
            state: 'fear'
          }
        };

        const result = controller.synthesize(inputs);

        expect(result.action.tone).toBe('cautious');
      });

      it('should adjust confidence with emotion', () => {
        const inputs = {
          social: {
            active: true,
            action: { type: 'chat' },
            confidence: 0.8
          },
          emotion: {
            state: 'happy',
            confidence: 0.6
          }
        };

        const result = controller.synthesize(inputs);

        expect(result.confidence).toBe(0.6);
      });
    });

    // Personality Blending Tests
    describe('personality blending', () => {
      it('should blend personality with goals action', () => {
        const inputs = {
          goals: {
            active: true,
            action: { type: 'explore' }
          },
          personality: {
            traits: {
              bravery: 0.8,
              curiosity: 0.9
            }
          }
        };

        const result = controller.synthesize(inputs);

        expect(result.action.braveryLevel).toBe(0.8);
      });

      it('should handle missing personality traits', () => {
        const inputs = {
          goals: {
            active: true,
            action: { type: 'collect' }
          },
          personality: {}
        };

        const result = controller.synthesize(inputs);

        expect(result.action.type).toBe('collect');
      });
    });
  });

  describe('broadcast', () => {
    it('should exist as a function', () => {
      expect(typeof controller.broadcast).toBe('function');
    });

    it('should return an object', () => {
      const decision = { action: 'move', priority: 'normal' };
      const result = controller.broadcast(decision);
      expect(typeof result).toBe('object');
    });

    it('should return empty object when no modules registered', () => {
      const decision = { action: 'move' };
      const result = controller.broadcast(decision);
      expect(result).toEqual({});
    });

    it('should acknowledge module with receiveDecision method', () => {
      const mockModule = {
        receiveDecision: jest.fn().mockReturnValue('processed')
      };
      controller.registerModule('personality', mockModule);

      const decision = { action: 'move' };
      const result = controller.broadcast(decision);

      expect(mockModule.receiveDecision).toHaveBeenCalledWith(decision);
      expect(result.personality.acknowledged).toBe(true);
      expect(result.personality.response).toBe('processed');
    });

    it('should acknowledge module without receiveDecision method', () => {
      const mockModule = { name: 'test' };
      controller.registerModule('emotion', mockModule);

      const decision = { action: 'move' };
      const result = controller.broadcast(decision);

      expect(result.emotion.acknowledged).toBe(true);
      expect(result.emotion.response).toBeNull();
    });

    it('should handle module errors', () => {
      const mockModule = {
        receiveDecision: jest.fn().mockImplementation(() => {
          throw new Error('Module error');
        })
      };
      controller.registerModule('social', mockModule);

      const decision = { action: 'move' };
      const result = controller.broadcast(decision);

      expect(result.social.acknowledged).toBe(false);
      expect(result.social.error).toBe('Module error');
    });

    it('should broadcast to multiple modules', () => {
      const personality = { receiveDecision: jest.fn() };
      const emotion = { receiveDecision: jest.fn() };
      const social = { receiveDecision: jest.fn() };

      controller.registerModule('personality', personality);
      controller.registerModule('emotion', emotion);
      controller.registerModule('social', social);

      const decision = { action: 'move' };
      const result = controller.broadcast(decision);

      expect(Object.keys(result).length).toBe(3);
      expect(personality.receiveDecision).toHaveBeenCalled();
      expect(emotion.receiveDecision).toHaveBeenCalled();
      expect(social.receiveDecision).toHaveBeenCalled();
    });
  });

  describe('checkCoherence', () => {
    it('should exist as a function', () => {
      expect(typeof controller.checkCoherence).toBe('function');
    });

    it('should return a boolean', () => {
      const result = controller.checkCoherence('hello', { type: 'wave' });
      expect(typeof result).toBe('boolean');
    });

    it('should return true when talk is null', () => {
      const result = controller.checkCoherence(null, { type: 'attack' });
      expect(result).toBe(true);
    });

    it('should return true when action is null', () => {
      const result = controller.checkCoherence('Hello', null);
      expect(result).toBe(true);
    });

    // Conflict Detection Tests
    describe('conflict detection', () => {
      it('should detect conflict: offering help but attacking', () => {
        const talk = "I'll help you!";
        const action = { type: 'attack', target: 'player' };

        const result = controller.checkCoherence(talk, action);

        expect(result).toBe(false);
      });

      it('should detect conflict: offering company but fleeing', () => {
        const talk = "I'll follow you";
        const action = { type: 'flee', reason: 'danger' };

        const result = controller.checkCoherence(talk, action);

        expect(result).toBe(false);
      });

      it('should detect conflict: offering to stay but moving', () => {
        const talk = "I'll stay here";
        const action = { type: 'move', destination: 'cave' };

        const result = controller.checkCoherence(talk, action);

        expect(result).toBe(false);
      });

      it('should detect conflict: offering peace but fighting', () => {
        const talk = "Let's be peaceful";
        const action = { type: 'attack' };

        const result = controller.checkCoherence(talk, action);

        expect(result).toBe(false);
      });

      it('should detect conflict: expressing affection but harming', () => {
        const talk = "I love you";
        const action = { type: 'attack' };

        const result = controller.checkCoherence(talk, action);

        expect(result).toBe(false);
      });

      it('should return true for coherent talk and action', () => {
        const talk = "I'll help you collect wood";
        const action = { type: 'collect', item: 'wood' };

        const result = controller.checkCoherence(talk, action);

        expect(result).toBe(true);
      });

      it('should return true for attack action with aggressive talk', () => {
        const talk = "Take this!";
        const action = { type: 'attack', target: 'zombie' };

        const result = controller.checkCoherence(talk, action);

        expect(result).toBe(true);
      });

      it('should be case-insensitive', () => {
        const talk = "I'LL HELP YOU";
        const action = { type: 'ATTACK' };

        const result = controller.checkCoherence(talk, action);

        expect(result).toBe(false);
      });

      it('should handle partial matches', () => {
        const talk = "I want to be your friend and help";
        const action = { type: 'attack' };

        const result = controller.checkCoherence(talk, action);

        expect(result).toBe(false);
      });
    });
  });

  describe('getHistory', () => {
    it('should exist as a function', () => {
      expect(typeof controller.getHistory).toBe('function');
    });

    it('should return an array', () => {
      const result = controller.getHistory();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty array when no history', () => {
      const result = controller.getHistory();
      expect(result).toEqual([]);
    });

    it('should return decisions from history', () => {
      const inputs = {
        personality: {},
        emotion: {},
        social: {},
        goals: {}
      };
      controller.synthesize(inputs);
      controller.synthesize(inputs);

      const history = controller.getHistory();
      expect(history.length).toBe(2);
    });

    it('should respect limit parameter', () => {
      const inputs = {
        personality: {},
        emotion: {},
        social: {},
        goals: {}
      };
      for (let i = 0; i < 5; i++) {
        controller.synthesize(inputs);
      }

      const history = controller.getHistory(3);
      expect(history.length).toBe(3);
    });
  });
});
