const fs = require('fs');
const path = require('path');

const mockLockfile = {
  lock: jest.fn((filePath, opts, cb) => {
    setTimeout(() => cb(null), 5);
  }),
  unlock: jest.fn((filePath, cb) => setTimeout(() => cb(null), 5)),
  check: jest.fn((filePath, cb) => cb(null, false))
};

jest.mock('lockfile', () => mockLockfile);

// Helper function to create complete mock state for confidence calculation
function createMockState(overrides = {}) {
  const defaults = {
    position: { x: 0, y: 64, z: 0 },
    inventory: [],
    self: {
      health: 20,
      position: { x: 0, y: 64, z: 0 },
      inventory: [],
      held_item: null
    },
    entities: {
      hostile: [],
      passive: [],
      players: [],
      mobs: [],
      other: []
    },
    blocks: {
      hazardous: [],
      valuable: [],
      summary: {}
    }
  };
  
  return { ...defaults, ...overrides };
}

// Helper for move state with position change
function createMoveEndState(startX, endX) {
  return createMockState({
    position: { x: endX, y: 64, z: 0 },
    self: {
      health: 20,
      position: { x: endX, y: 64, z: 0 },
      inventory: [],
      held_item: null
    }
  });
}

// Helper for dig state with tool
function createDigState(hasTool = true, blockDistance = 2) {
  return createMockState({
    self: {
      health: 20,
      position: { x: 0, y: 64, z: 0 },
      inventory: [],
      held_item: hasTool ? {
        name: 'diamond_axe',
        durability: 100,
        max_durability: 100
      } : null
    },
    blocks: {
      hazardous: [],
      valuable: [{ type: 'oak_log', distance: blockDistance }],
      summary: { oak_log: 1 }
    }
  });
}

describe('ActionAwareness', () => {
  let ActionAwareness;
  let mockBot;
  let mockVision;
  let stateDir;

  beforeEach(() => {
    jest.resetModules();
    stateDir = path.join(__dirname, '../../state');

    // Mock bot
    mockBot = {
      setControlState: jest.fn(),
      clearControlStates: jest.fn(),
      dig: jest.fn().mockResolvedValue(true),
      findBlock: jest.fn(),
      entity: {
        position: { x: 0, y: 64, z: 0 }
      }
    };

    // Mock vision
    mockVision = {
      extractState: jest.fn()
    };

    ActionAwareness = require('../../src/layers/action-awareness');
  });

  afterEach(async () => {
    mockLockfile.lock.mockClear();
    mockLockfile.unlock.mockClear();
    if (fs.existsSync(stateDir)) {
      const files = fs.readdirSync(stateDir);
      for (const file of files) {
        if (file === 'action_error.json') {
          try {
            fs.unlinkSync(path.join(stateDir, file));
          } catch (e) {}
        }
      }
    }
  });

  describe('constructor', () => {
    it('should create instance with bot and vision', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      expect(aa.bot).toBe(mockBot);
      expect(aa.vision).toBe(mockVision);
      expect(aa.actionHistory).toEqual([]);
      expect(aa.maxHistory).toBe(50);
    });

    it('should initialize state manager', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      expect(aa.stateManager).toBeDefined();
    });
  });

  describe('executeWithVerification - move action', () => {
    it('should execute move action and verify successful outcome', async () => {
      const startState = createMockState();
      const endState = createMoveEndState(0, 1);

      // Mock multi-step verification calls (5 calls total)
      mockVision.extractState
        .mockReturnValueOnce(startState)  // initial state
        .mockReturnValueOnce(createMoveEndState(0, 0.1))  // 100ms check
        .mockReturnValueOnce(createMoveEndState(0, 0.3))  // 500ms check
        .mockReturnValueOnce(createMoveEndState(0, 0.6))  // 1000ms check
        .mockReturnValueOnce(endState);  // final state

      const aa = new ActionAwareness(mockBot, mockVision);
      const action = { type: 'move', direction: 'forward', duration: 500 };
      const expectedOutcome = { moved: true };

      const result = await aa.executeWithVerification(action, expectedOutcome);

      expect(result.success).toBe(true);
      expect(result.outcome.moved).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(mockBot.setControlState).toHaveBeenCalledWith('forward', true);
      expect(mockBot.clearControlStates).toHaveBeenCalled();
    });

    it('should detect when move action fails (bot stuck)', async () => {
      const startState = createMockState();
      const stuckState = createMockState(); // No position change

      // Mock multi-step verification - action starts, progresses slowly, but doesn't complete
      mockVision.extractState
        .mockReturnValueOnce(startState) // initial state
        .mockReturnValueOnce(createMoveEndState(0, 0.1)) // 100ms check (started)
        .mockReturnValueOnce(createMoveEndState(0, 0.25)) // 500ms check (progressing)
        .mockReturnValueOnce(createMoveEndState(0, 0.3)) // 1000ms check (not completed - only 0.3 movement)
        .mockReturnValueOnce(stuckState); // final state

      const aa = new ActionAwareness(mockBot, mockVision);
      const action = { type: 'move', direction: 'forward', duration: 500 };
      const expectedOutcome = { moved: true };

      const result = await aa.executeWithVerification(action, expectedOutcome);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('action_not_completed');
      expect(result.actual.moved).toBe(false);
    });
  });

  describe('executeWithVerification - dig action', () => {
    it('should execute dig action and verify block removed', async () => {
      const startState = createDigState(true, 2);
      // Create end state with inventory change
      const endState = createDigState(true, 2);
      endState.inventory = [{ name: 'oak_log', count: 1 }];
      endState.self.inventory = [{ name: 'oak_log', count: 1 }];

      // For dig actions, position doesn't change but inventory does
      // 100ms: position check passes (same position is OK for dig)
      // 500ms: inventory hasn't changed yet (progressing check passes for dig)
      // 1000ms: inventory has changed (completed check passes)
      mockVision.extractState
        .mockReturnValueOnce(startState) // initial state
        .mockReturnValueOnce(startState) // 100ms check (position same, dig started)
        .mockReturnValueOnce(startState) // 500ms check (dig in progress)
        .mockReturnValueOnce(endState) // 1000ms check (dig complete, item gained)
        .mockReturnValueOnce(endState); // final state

      mockBot.findBlock.mockReturnValue({ name: 'oak_log', position: { x: 1, y: 64, z: 0 } });

      const aa = new ActionAwareness(mockBot, mockVision);
      const action = { type: 'dig', blockType: 'oak_log' };
      const expectedOutcome = {
        blockRemoved: true,
        itemsGained: [{ name: 'oak_log', count: 1 }]
      };

      const result = await aa.executeWithVerification(action, expectedOutcome);

      expect(result.success).toBe(true);
      expect(result.outcome.blockRemoved).toBe(true);
      expect(result.outcome.itemsGained).toEqual([{ name: 'oak_log', count: 1 }]);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(mockBot.dig).toHaveBeenCalled();
    });

    it('should detect when dig action fails (block not found)', async () => {
      const startState = createDigState(true, 2);

      mockVision.extractState
        .mockReturnValueOnce(startState) // initial state
        .mockReturnValueOnce(startState) // 100ms check
        .mockReturnValueOnce(startState) // 500ms check
        .mockReturnValueOnce(startState) // 1000ms check
        .mockReturnValueOnce(startState); // final state

      mockBot.findBlock.mockReturnValue(null);

      const aa = new ActionAwareness(mockBot, mockVision);
      const action = { type: 'dig', blockType: 'oak_log' };
      const expectedOutcome = {
        blockRemoved: true,
        itemsGained: [{ name: 'oak_log', count: 1 }]
      };

      const result = await aa.executeWithVerification(action, expectedOutcome);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('execution_error');
      expect(result.error).toContain('Block oak_log not found');
    });

    it('should detect when dig succeeds but no items gained', async () => {
      const startState = createDigState(true, 2);
      const endState = createDigState(true, 2); // No inventory change

      // Dig action starts and progresses but no item appears
      mockVision.extractState
        .mockReturnValueOnce(startState) // initial state
        .mockReturnValueOnce(startState) // 100ms check (started)
        .mockReturnValueOnce(startState) // 500ms check (progressing)
        .mockReturnValueOnce(endState) // 1000ms check (no item gained)
        .mockReturnValueOnce(endState); // final state

      mockBot.findBlock.mockReturnValue({ name: 'oak_log', position: { x: 1, y: 64, z: 0 } });

      const aa = new ActionAwareness(mockBot, mockVision);
      const action = { type: 'dig', blockType: 'oak_log' };
      const expectedOutcome = {
        blockRemoved: true,
        itemsGained: [{ name: 'oak_log', count: 1 }]
      };

      const result = await aa.executeWithVerification(action, expectedOutcome);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('action_not_completed');
      expect(result.actual.blockRemoved).toBe(false);
    });
  });

  describe('action history', () => {
    it('should record action in history', async () => {
      const startState = createMockState();
      const endState = createMoveEndState(0, 1);

      mockVision.extractState
        .mockReturnValueOnce(startState)
        .mockReturnValueOnce(createMoveEndState(0, 0.1))
        .mockReturnValueOnce(createMoveEndState(0, 0.3))
        .mockReturnValueOnce(createMoveEndState(0, 0.6))
        .mockReturnValueOnce(endState);

      const aa = new ActionAwareness(mockBot, mockVision);
      const action = { type: 'move', direction: 'forward', duration: 500 };
      const expectedOutcome = { moved: true };

      await aa.executeWithVerification(action, expectedOutcome);

      expect(aa.actionHistory.length).toBe(1);
      expect(aa.actionHistory[0].action).toEqual(action);
      expect(aa.actionHistory[0].match).toBe(true);
      expect(aa.actionHistory[0].confidence).toBeGreaterThanOrEqual(0.7);
      expect(aa.actionHistory[0].timestamp).toBeDefined();
      expect(aa.actionHistory[0].duration).toBeGreaterThan(0);
    });

    it('should limit history to maxHistory entries', async () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      aa.maxHistory = 3;

      // Only run 3 iterations to avoid timeout (each takes ~1s due to multi-step verification)
      for (let i = 0; i < 3; i++) {
        const startState = createMockState();
        const endState = createMoveEndState(0, i + 1);

        mockVision.extractState
          .mockReturnValueOnce(startState)
          .mockReturnValueOnce(createMoveEndState(0, i + 0.1))
          .mockReturnValueOnce(createMoveEndState(0, i + 0.3))
          .mockReturnValueOnce(createMoveEndState(0, i + 0.6))
          .mockReturnValueOnce(endState);

        await aa.executeWithVerification(
          { type: 'move', direction: 'forward', duration: 100 },
          { moved: true }
        );
      }

      expect(aa.actionHistory.length).toBe(3);
    });
  });

  describe('error reporting', () => {
    it('should write action_error.json on outcome mismatch', async () => {
      const startState = createMockState();
      const stuckState = createMockState();

      // Action starts, progresses slowly, but doesn't complete
      mockVision.extractState
        .mockReturnValueOnce(startState)
        .mockReturnValueOnce(createMoveEndState(0, 0.1)) // 100ms (started)
        .mockReturnValueOnce(createMoveEndState(0, 0.25)) // 500ms (progressing)
        .mockReturnValueOnce(createMoveEndState(0, 0.3)) // 1000ms (not completed)
        .mockReturnValueOnce(stuckState); // final

      const aa = new ActionAwareness(mockBot, mockVision);
      const action = { type: 'move', direction: 'forward', duration: 500 };
      const expectedOutcome = { moved: true };

      await aa.executeWithVerification(action, expectedOutcome);

      // Give time for file write
      await new Promise(resolve => setTimeout(resolve, 100));

      const errorFilePath = path.join(stateDir, 'action_error.json');
      expect(fs.existsSync(errorFilePath)).toBe(true);

      const errorData = JSON.parse(fs.readFileSync(errorFilePath, 'utf8'));
      expect(errorData.action).toEqual(action);
      expect(errorData.expected).toEqual(expectedOutcome);
      expect(errorData.severity).toBeDefined();
      expect(errorData.confidence).toBeDefined();
    });

    it('should calculate severity correctly', async () => {
      const startState = createDigState(true, 2);
      const endState = createDigState(true, 2);

      // Dig action completes but no item gained
      mockVision.extractState
        .mockReturnValueOnce(startState)
        .mockReturnValueOnce(startState)
        .mockReturnValueOnce(startState)
        .mockReturnValueOnce(endState)
        .mockReturnValueOnce(endState);

      mockBot.findBlock.mockReturnValue({ name: 'oak_log', position: { x: 1, y: 64, z: 0 } });

      const aa = new ActionAwareness(mockBot, mockVision);
      const action = { type: 'dig', blockType: 'oak_log' };
      const expectedOutcome = { blockRemoved: true };

      await aa.executeWithVerification(action, expectedOutcome);

      await new Promise(resolve => setTimeout(resolve, 100));

      const errorFilePath = path.join(stateDir, 'action_error.json');
      const errorData = JSON.parse(fs.readFileSync(errorFilePath, 'utf8'));
      expect(errorData.severity).toBe('high');
    });
  });

  describe('getSuccessRate', () => {
    it('should return 1.0 for empty history', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      expect(aa.getSuccessRate()).toBe(1.0);
    });

    it('should calculate success rate correctly', async () => {
      const aa = new ActionAwareness(mockBot, mockVision);

      // Add successful action
      aa.actionHistory.push({
        action: { type: 'move' },
        match: true,
        timestamp: Date.now(),
        duration: 100
      });

      // Add failed action
      aa.actionHistory.push({
        action: { type: 'move' },
        match: false,
        timestamp: Date.now(),
        duration: 100
      });

      // Add successful action
      aa.actionHistory.push({
        action: { type: 'move' },
        match: true,
        timestamp: Date.now(),
        duration: 100
      });

      expect(aa.getSuccessRate()).toBeCloseTo(2 / 3, 2);
    });
  });

  describe('getRecentFailures', () => {
    it('should return empty array when no failures', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      aa.actionHistory.push({
        action: { type: 'move' },
        match: true,
        timestamp: Date.now(),
        duration: 100
      });

      expect(aa.getRecentFailures()).toEqual([]);
    });

    it('should return recent failures only', () => {
      const aa = new ActionAwareness(mockBot, mockVision);

      for (let i = 0; i < 10; i++) {
        aa.actionHistory.push({
          action: { type: 'move', id: i },
          match: false,
          timestamp: Date.now(),
          duration: 100
        });
      }

      const failures = aa.getRecentFailures(3);
      expect(failures.length).toBe(3);
      expect(failures[0].action.id).toBe(7);
      expect(failures[1].action.id).toBe(8);
      expect(failures[2].action.id).toBe(9);
    });

    it('should respect limit parameter', () => {
      const aa = new ActionAwareness(mockBot, mockVision);

      for (let i = 0; i < 10; i++) {
        aa.actionHistory.push({
          action: { type: 'move' },
          match: false,
          timestamp: Date.now(),
          duration: 100
        });
      }

      expect(aa.getRecentFailures(5).length).toBe(5);
      expect(aa.getRecentFailures(2).length).toBe(2);
    });
  });

  describe('_inventoryDiff', () => {
    it('should detect items gained', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const before = [];
      const after = [{ name: 'oak_log', count: 3 }];

      const diff = aa._inventoryDiff(before, after);

      expect(diff.gained).toEqual([{ name: 'oak_log', count: 3 }]);
      expect(diff.lost).toEqual([]);
    });

    it('should detect items lost', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const before = [{ name: 'oak_planks', count: 4 }];
      const after = [];

      const diff = aa._inventoryDiff(before, after);

      expect(diff.gained).toEqual([]);
      expect(diff.lost).toEqual([{ name: 'oak_planks', count: 4 }]);
    });

    it('should detect items gained and lost (crafting)', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const before = [{ name: 'oak_log', count: 1 }];
      const after = [{ name: 'oak_planks', count: 4 }];

      const diff = aa._inventoryDiff(before, after);

      expect(diff.gained).toEqual([{ name: 'oak_planks', count: 4 }]);
      expect(diff.lost).toEqual([{ name: 'oak_log', count: 1 }]);
    });

    it('should handle count changes', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const before = [{ name: 'oak_log', count: 5 }];
      const after = [{ name: 'oak_log', count: 8 }];

      const diff = aa._inventoryDiff(before, after);

      expect(diff.gained).toEqual([{ name: 'oak_log', count: 3 }]);
      expect(diff.lost).toEqual([]);
    });
  });

  describe('_distance', () => {
    it('should calculate distance correctly', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const pos1 = { x: 0, y: 64, z: 0 };
      const pos2 = { x: 3, y: 64, z: 4 };

      const distance = aa._distance(pos1, pos2);

      expect(distance).toBe(5);
    });

    it('should return 0 for same position', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const pos1 = { x: 10, y: 64, z: 20 };
      const pos2 = { x: 10, y: 64, z: 20 };

      const distance = aa._distance(pos1, pos2);

      expect(distance).toBe(0);
    });
  });

  describe('_calculateConfidence', () => {
    it('should return high confidence for simple move action', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const action = { type: 'move', direction: 'forward' };
      const context = {
        health: 20,
        obstacles: [],
        nearbyLava: 0,
        hostileMobs: 0
      };

      const result = aa._calculateConfidence(action, context);

      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(result.fallback.action).toBe('proceed');
    });

    it('should return low confidence for move with obstacles', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const action = { type: 'move', direction: 'forward' };
      const context = {
        health: 20,
        obstacles: [{ type: 'wall' }],
        nearbyLava: 3,
        hostileMobs: 3
      };

      const result = aa._calculateConfidence(action, context);

      expect(result.confidence).toBeLessThan(0.5);
      expect(result.fallback.action).toBe('retry_different');
    });

    it('should return abort fallback for very low confidence', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const action = { type: 'move', direction: 'forward' };
      const context = {
        health: 4,
        obstacles: [{ type: 'wall' }],
        nearbyLava: 2,
        hostileMobs: 4
      };

      const result = aa._calculateConfidence(action, context);

      expect(result.confidence).toBeLessThan(0.3);
      expect(result.fallback.action).toBe('abort');
    });

    it('should return high confidence for dig with correct tool', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const action = { type: 'dig', blockType: 'oak_log' };
      const context = {
        tool: 'diamond_axe',
        blockDistance: 2,
        toolDurability: 0.9
      };

      const result = aa._calculateConfidence(action, context);

      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should return low confidence for dig without tool', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const action = { type: 'dig', blockType: 'oak_log' };
      const context = {
        tool: null,
        blockDistance: 2
      };

      const result = aa._calculateConfidence(action, context);

      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should return high confidence for craft with materials', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const action = { type: 'craft', recipe: 'oak_planks' };
      const context = {
        missingMaterials: [],
        needsCraftingTable: false
      };

      const result = aa._calculateConfidence(action, context);

      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should return low confidence for craft without materials', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const action = { type: 'craft', recipe: 'oak_planks' };
      const context = {
        missingMaterials: ['oak_log'],
        needsCraftingTable: false
      };

      const result = aa._calculateConfidence(action, context);

      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('_verifyMultiStep', () => {
    it('should verify action at multiple time intervals', async () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const startState = createMockState();
      const action = { type: 'move', direction: 'forward' };

      // Mock state changes at each interval
      mockVision.extractState
        .mockReturnValueOnce(createMoveEndState(0, 0.1))  // 100ms
        .mockReturnValueOnce(createMoveEndState(0, 0.3))  // 500ms
        .mockReturnValueOnce(createMoveEndState(0, 0.6)); // 1000ms

      const result = await aa._verifyMultiStep(action, startState);

      expect(result.checks).toHaveLength(3);
      expect(result.checks[0].time).toBe(100);
      expect(result.checks[1].time).toBe(500);
      expect(result.checks[2].time).toBe(1000);
    });

    it('should return early failure if action does not start', async () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const startState = createMockState();
      const action = { type: 'move', direction: 'forward' };

      // No position change at 100ms
      mockVision.extractState.mockReturnValueOnce(createMockState());

      const result = await aa._verifyMultiStep(action, startState);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('action_not_started');
      expect(result.checks).toHaveLength(1);
    });

    it('should return failure if action does not progress', async () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const startState = createMockState();
      const action = { type: 'move', direction: 'forward' };

      // Started but not progressing
      mockVision.extractState
        .mockReturnValueOnce(createMoveEndState(0, 0.1))  // 100ms (started)
        .mockReturnValueOnce(createMoveEndState(0, 0.15)); // 500ms (not progressing)

      const result = await aa._verifyMultiStep(action, startState);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('action_not_progressing');
      expect(result.checks).toHaveLength(2);
    });
  });

  describe('confidenceHistory', () => {
    it('should initialize with empty confidenceHistory', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      expect(aa.confidenceHistory).toEqual([]);
      expect(aa.maxConfidenceHistory).toBe(100);
    });

    it('should track confidence vs actual success', async () => {
      const aa = new ActionAwareness(mockBot, mockVision);

      // Execute a successful action
      mockVision.extractState
        .mockReturnValueOnce(createMockState())
        .mockReturnValueOnce(createMoveEndState(0, 0.1))
        .mockReturnValueOnce(createMoveEndState(0, 0.3))
        .mockReturnValueOnce(createMoveEndState(0, 0.6))
        .mockReturnValueOnce(createMoveEndState(0, 1));

      await aa.executeWithVerification(
        { type: 'move', direction: 'forward' },
        { moved: true }
      );

      expect(aa.confidenceHistory.length).toBe(1);
      expect(aa.confidenceHistory[0].confidence).toBeGreaterThanOrEqual(0.7);
      expect(aa.confidenceHistory[0].success).toBe(true);
    });

    it('should limit confidenceHistory to maxConfidenceHistory', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      aa.maxConfidenceHistory = 3;

      // Manually add entries
      for (let i = 0; i < 5; i++) {
        aa._recordConfidenceResult(0.8, true);
      }

      expect(aa.confidenceHistory.length).toBe(3);
    });
  });

  describe('getConfidenceCorrelation', () => {
    it('should return null correlation for empty history', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const result = aa.getConfidenceCorrelation();

      expect(result.correlation).toBeNull();
      expect(result.samples).toBe(0);
    });

    it('should calculate correlation for perfect positive correlation', () => {
      const aa = new ActionAwareness(mockBot, mockVision);

      // High confidence actions all succeed
      for (let i = 0; i < 10; i++) {
        aa.confidenceHistory.push({
          confidence: 0.9,
          success: true,
          timestamp: Date.now()
        });
      }

      const result = aa.getConfidenceCorrelation();

      expect(result.samples).toBe(10);
      expect(result.meanConfidence).toBeCloseTo(0.9, 2);
      expect(result.successRate).toBe(1.0);
    });

    it('should calculate correlation for mixed results', () => {
      const aa = new ActionAwareness(mockBot, mockVision);

      // Mix of high confidence success and low confidence failure
      for (let i = 0; i < 5; i++) {
        aa.confidenceHistory.push({
          confidence: 0.9,
          success: true,
          timestamp: Date.now()
        });
        aa.confidenceHistory.push({
          confidence: 0.3,
          success: false,
          timestamp: Date.now()
        });
      }

      const result = aa.getConfidenceCorrelation();

      expect(result.samples).toBe(10);
      expect(result.correlation).toBeGreaterThan(0.8); // Strong positive correlation
    });
  });

  describe('_extractActionContext', () => {
    it('should extract context from state for move action', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const state = createMockState();
      const action = { type: 'move', direction: 'forward' };

      const context = aa._extractActionContext(action, state);

      expect(context.health).toBe(20);
      expect(context.obstacles).toEqual([]);
    });

    it('should extract context from state for dig action', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const state = createDigState(true, 2);
      const action = { type: 'dig', blockType: 'oak_log' };

      const context = aa._extractActionContext(action, state);

      expect(context.tool).toBe('diamond_axe');
      expect(context.blockDistance).toBe(2);
      expect(context.toolDurability).toBe(1.0);
    });
  });

  describe('_getToolBonus', () => {
    it('should return positive bonus for correct tool', () => {
      const aa = new ActionAwareness(mockBot, mockVision);

      expect(aa._getToolBonus('oak_log', 'diamond_axe')).toBe(0.2);
      expect(aa._getToolBonus('stone', 'diamond_pickaxe')).toBe(0.1);
    });

    it('should return negative penalty for wrong tool', () => {
      const aa = new ActionAwareness(mockBot, mockVision);

      expect(aa._getToolBonus('diamond_ore', 'wooden_pickaxe')).toBe(-0.4);
      expect(aa._getToolBonus('oak_log', 'stone_pickaxe')).toBe(-0.4);
    });
  });

  describe('detectFailurePattern', () => {
    it('should return null when no failures exist', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      aa.actionHistory.push(
        { action: { type: 'move' }, match: true, timestamp: Date.now() },
        { action: { type: 'move' }, match: true, timestamp: Date.now() }
      );

      const pattern = aa.detectFailurePattern();
      expect(pattern).toBeNull();
    });

    it('should return null when fewer than 3 failures', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      aa.actionHistory.push(
        { action: { type: 'move' }, match: false, timestamp: Date.now() },
        { action: { type: 'move' }, match: false, timestamp: Date.now() }
      );

      const pattern = aa.detectFailurePattern();
      expect(pattern).toBeNull();
    });

    it('should detect stuck pattern after 3 consecutive move failures', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const now = Date.now();

      aa.actionHistory.push(
        { action: { type: 'move', direction: 'forward' }, match: false, actual: { moved: false }, timestamp: now - 3000 },
        { action: { type: 'move', direction: 'forward' }, match: false, actual: { moved: false }, timestamp: now - 2000 },
        { action: { type: 'move', direction: 'forward' }, match: false, actual: { moved: false }, timestamp: now - 1000 }
      );

      const pattern = aa.detectFailurePattern();

      expect(pattern).not.toBeNull();
      expect(pattern.type).toBe('stuck');
      expect(pattern.count).toBe(3);
      expect(pattern.suggestion).toContain('pathfind');
    });

    it('should detect wrong_tool pattern after 3 dig failures', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const now = Date.now();

      aa.actionHistory.push(
        { action: { type: 'dig', blockType: 'iron_ore' }, match: false, actual: { blockRemoved: false }, timestamp: now - 3000 },
        { action: { type: 'dig', blockType: 'iron_ore' }, match: false, actual: { blockRemoved: false }, timestamp: now - 2000 },
        { action: { type: 'dig', blockType: 'iron_ore' }, match: false, actual: { blockRemoved: false }, timestamp: now - 1000 }
      );

      const pattern = aa.detectFailurePattern();

      expect(pattern).not.toBeNull();
      expect(pattern.type).toBe('wrong_tool');
      expect(pattern.count).toBe(3);
      expect(pattern.suggestion).toContain('pickaxe');
    });

    it('should detect blocked pattern when position change is minimal', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const now = Date.now();

      aa.actionHistory.push(
        { action: { type: 'move', direction: 'forward' }, match: false, actual: { positionChange: { x: 0.05, z: 0.02 } }, timestamp: now - 3000 },
        { action: { type: 'move', direction: 'forward' }, match: false, actual: { positionChange: { x: 0.03, z: 0.01 } }, timestamp: now - 2000 },
        { action: { type: 'move', direction: 'forward' }, match: false, actual: { positionChange: { x: 0.02, z: 0.01 } }, timestamp: now - 1000 }
      );

      const pattern = aa.detectFailurePattern();

      expect(pattern).not.toBeNull();
      expect(pattern.type).toBe('blocked');
      expect(pattern.suggestion).toContain('obstacle');
    });

    it('should group failures by action type', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const now = Date.now();

      // Mix of different failure types
      aa.actionHistory.push(
        { action: { type: 'move', direction: 'forward' }, match: false, actual: { moved: false }, timestamp: now - 5000 },
        { action: { type: 'dig', blockType: 'stone' }, match: false, actual: { blockRemoved: false }, timestamp: now - 4000 },
        { action: { type: 'move', direction: 'forward' }, match: false, actual: { moved: false }, timestamp: now - 3000 },
        { action: { type: 'dig', blockType: 'stone' }, match: false, actual: { blockRemoved: false }, timestamp: now - 2000 },
        { action: { type: 'move', direction: 'forward' }, match: false, actual: { moved: false }, timestamp: now - 1000 }
      );

      const pattern = aa.detectFailurePattern();

      // Should detect move pattern (3 failures) not dig (2 failures)
      expect(pattern).not.toBeNull();
      expect(pattern.action.type).toBe('move');
      expect(pattern.count).toBe(3);
    });

    it('should include timestamps in pattern', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const now = Date.now();

      aa.actionHistory.push(
        { action: { type: 'move', direction: 'forward' }, match: false, actual: { moved: false }, timestamp: now - 3000 },
        { action: { type: 'move', direction: 'forward' }, match: false, actual: { moved: false }, timestamp: now - 2000 },
        { action: { type: 'move', direction: 'forward' }, match: false, actual: { moved: false }, timestamp: now - 1000 }
      );

      const pattern = aa.detectFailurePattern();

      expect(pattern.firstFailure).toBe(now - 3000);
      expect(pattern.lastFailure).toBe(now - 1000);
      expect(pattern.timestamp).toBeDefined();
    });
  });

  describe('categorizeFailure', () => {
    it('should categorize stuck failure for move with no movement', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const result = aa.categorizeFailure(
        { type: 'move', direction: 'forward' },
        { moved: false }
      );

      expect(result.type).toBe('stuck');
      expect(result.suggestion).toContain('pathfind');
    });

    it('should categorize wrong_tool for dig without block removal', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const result = aa.categorizeFailure(
        { type: 'dig', blockType: 'diamond_ore' },
        { blockRemoved: false }
      );

      expect(result.type).toBe('wrong_tool');
      expect(result.suggestion).toContain('pickaxe');
    });

    it('should categorize blocked for minimal position change', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const result = aa.categorizeFailure(
        { type: 'move', direction: 'forward' },
        { positionChange: { x: 0.05, z: 0.03 } }
      );

      expect(result.type).toBe('blocked');
      expect(result.suggestion).toContain('obstacle');
    });

    it('should return unknown for unrecognized failure', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const result = aa.categorizeFailure(
        { type: 'unknown_action' },
        {}
      );

      expect(result.type).toBe('unknown');
      expect(result.suggestion).toContain('reassess');
    });
  });

  describe('getFailurePattern', () => {
    it('should return pattern for specific action type', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      const now = Date.now();

      aa.actionHistory.push(
        { action: { type: 'move', direction: 'forward' }, match: false, actual: { moved: false }, timestamp: now - 3000 },
        { action: { type: 'dig', blockType: 'stone' }, match: false, actual: { blockRemoved: false }, timestamp: now - 2000 },
        { action: { type: 'move', direction: 'forward' }, match: false, actual: { moved: false }, timestamp: now - 1000 },
        { action: { type: 'move', direction: 'forward' }, match: false, actual: { moved: false }, timestamp: now }
      );

      const pattern = aa.getFailurePattern('move');

      expect(pattern).not.toBeNull();
      expect(pattern.type).toBe('stuck');
      expect(pattern.count).toBe(3);
    });

    it('should return null when fewer than 3 failures for action type', () => {
      const aa = new ActionAwareness(mockBot, mockVision);

      aa.actionHistory.push(
        { action: { type: 'move' }, match: false, actual: { moved: false }, timestamp: Date.now() },
        { action: { type: 'move' }, match: false, actual: { moved: false }, timestamp: Date.now() }
      );

      const pattern = aa.getFailurePattern('move');
      expect(pattern).toBeNull();
    });
  });

  describe('_getActionKey', () => {
    it('should generate key for move action', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      expect(aa._getActionKey({ type: 'move', direction: 'forward' })).toBe('move:forward');
    });

    it('should generate key for dig action', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      expect(aa._getActionKey({ type: 'dig', blockType: 'stone' })).toBe('dig:stone');
    });

    it('should generate key for craft action', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      expect(aa._getActionKey({ type: 'craft', recipe: 'oak_planks' })).toBe('craft:oak_planks');
    });

    it('should handle unknown action', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      expect(aa._getActionKey(null)).toBe('unknown');
    });
  });

  describe('_getRequiredTool', () => {
    it('should return correct tool for diamond ore', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      expect(aa._getRequiredTool('diamond_ore')).toBe('diamond_pickaxe');
    });

    it('should return correct tool for iron ore', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      expect(aa._getRequiredTool('iron_ore')).toBe('stone_pickaxe');
    });

    it('should return axe for wood', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      expect(aa._getRequiredTool('oak_log')).toBe('axe');
    });

    it('should return null for unknown block', () => {
      const aa = new ActionAwareness(mockBot, mockVision);
      expect(aa._getRequiredTool('unknown_block')).toBeNull();
    });
  });

});
