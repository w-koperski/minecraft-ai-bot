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

    it('should return object with action property (null for skeleton)', () => {
      const inputs = {
        personality: {},
        emotion: {},
        social: {},
        goals: {}
      };
      const result = controller.synthesize(inputs);
      expect(result.action).toBeNull();
    });

    it('should return object with priority property', () => {
      const inputs = {
        personality: {},
        emotion: {},
        social: {},
        goals: {}
      };
      const result = controller.synthesize(inputs);
      expect(result.priority).toBeDefined();
    });

    it('should return object with coherence property', () => {
      const inputs = {
        personality: {},
        emotion: {},
        social: {},
        goals: {}
      };
      const result = controller.synthesize(inputs);
      expect(result.coherence).toBe(true);
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

    it('should acknowledge registered modules', () => {
      controller.registerModule('personality', {});
      controller.registerModule('emotion', {});

      const decision = { action: 'move' };
      const result = controller.broadcast(decision);

      expect(result.personality).toEqual({ acknowledged: true });
      expect(result.emotion).toEqual({ acknowledged: true });
    });
  });

  describe('checkCoherence', () => {
    it('should exist as a function', () => {
      expect(typeof controller.checkCoherence).toBe('function');
    });

    it('should return a boolean', () => {
      const result = controller.checkCoherence('hello', { action: 'wave' });
      expect(typeof result).toBe('boolean');
    });

    it('should return true for skeleton', () => {
      const result = controller.checkCoherence('hello', { action: 'wave' });
      expect(result).toBe(true);
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