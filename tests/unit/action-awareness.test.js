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
      const startState = {
        position: { x: 0, y: 64, z: 0 },
        inventory: []
      };
      const endState = {
        position: { x: 1, y: 64, z: 0 },
        inventory: []
      };

      mockVision.extractState
        .mockReturnValueOnce(startState)
        .mockReturnValueOnce(endState);

      const aa = new ActionAwareness(mockBot, mockVision);
      const action = { type: 'move', direction: 'forward', duration: 500 };
      const expectedOutcome = { moved: true };

      const result = await aa.executeWithVerification(action, expectedOutcome);

      expect(result.success).toBe(true);
      expect(result.outcome.moved).toBe(true);
      expect(mockBot.setControlState).toHaveBeenCalledWith('forward', true);
      expect(mockBot.clearControlStates).toHaveBeenCalled();
    });

    it('should detect when move action fails (bot stuck)', async () => {
      const startState = {
        position: { x: 0, y: 64, z: 0 },
        inventory: []
      };
      const endState = {
        position: { x: 0, y: 64, z: 0 },
        inventory: []
      };

      mockVision.extractState
        .mockReturnValueOnce(startState)
        .mockReturnValueOnce(endState);

      const aa = new ActionAwareness(mockBot, mockVision);
      const action = { type: 'move', direction: 'forward', duration: 500 };
      const expectedOutcome = { moved: true };

      const result = await aa.executeWithVerification(action, expectedOutcome);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('outcome_mismatch');
      expect(result.actual.moved).toBe(false);
    });
  });

  describe('executeWithVerification - dig action', () => {
    it('should execute dig action and verify block removed', async () => {
      const startState = {
        position: { x: 0, y: 64, z: 0 },
        inventory: []
      };
      const endState = {
        position: { x: 0, y: 64, z: 0 },
        inventory: [{ name: 'oak_log', count: 1 }]
      };

      mockVision.extractState
        .mockReturnValueOnce(startState)
        .mockReturnValueOnce(endState);

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
      expect(mockBot.dig).toHaveBeenCalled();
    });

    it('should detect when dig action fails (block not found)', async () => {
      const startState = {
        position: { x: 0, y: 64, z: 0 },
        inventory: []
      };
      const endState = {
        position: { x: 0, y: 64, z: 0 },
        inventory: []
      };

      mockVision.extractState
        .mockReturnValueOnce(startState)
        .mockReturnValueOnce(endState);

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
      const startState = {
        position: { x: 0, y: 64, z: 0 },
        inventory: []
      };
      const endState = {
        position: { x: 0, y: 64, z: 0 },
        inventory: []
      };

      mockVision.extractState
        .mockReturnValueOnce(startState)
        .mockReturnValueOnce(endState);

      mockBot.findBlock.mockReturnValue({ name: 'oak_log', position: { x: 1, y: 64, z: 0 } });

      const aa = new ActionAwareness(mockBot, mockVision);
      const action = { type: 'dig', blockType: 'oak_log' };
      const expectedOutcome = {
        blockRemoved: true,
        itemsGained: [{ name: 'oak_log', count: 1 }]
      };

      const result = await aa.executeWithVerification(action, expectedOutcome);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('outcome_mismatch');
      expect(result.actual.blockRemoved).toBe(false);
    });
  });

  describe('action history', () => {
    it('should record action in history', async () => {
      const startState = {
        position: { x: 0, y: 64, z: 0 },
        inventory: []
      };
      const endState = {
        position: { x: 1, y: 64, z: 0 },
        inventory: []
      };

      mockVision.extractState
        .mockReturnValueOnce(startState)
        .mockReturnValueOnce(endState);

      const aa = new ActionAwareness(mockBot, mockVision);
      const action = { type: 'move', direction: 'forward', duration: 500 };
      const expectedOutcome = { moved: true };

      await aa.executeWithVerification(action, expectedOutcome);

      expect(aa.actionHistory.length).toBe(1);
      expect(aa.actionHistory[0].action).toEqual(action);
      expect(aa.actionHistory[0].match).toBe(true);
      expect(aa.actionHistory[0].timestamp).toBeDefined();
      expect(aa.actionHistory[0].duration).toBeGreaterThan(0);
    });

    it('should limit history to maxHistory entries', async () => {
      const startState = {
        position: { x: 0, y: 64, z: 0 },
        inventory: []
      };

      mockVision.extractState.mockReturnValue(startState);

      const aa = new ActionAwareness(mockBot, mockVision);
      aa.maxHistory = 3;

      for (let i = 0; i < 5; i++) {
        const endState = {
          position: { x: i + 1, y: 64, z: 0 },
          inventory: []
        };
        mockVision.extractState.mockReturnValueOnce(startState).mockReturnValueOnce(endState);

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
      const startState = {
        position: { x: 0, y: 64, z: 0 },
        inventory: []
      };
      const endState = {
        position: { x: 0, y: 64, z: 0 },
        inventory: []
      };

      mockVision.extractState
        .mockReturnValueOnce(startState)
        .mockReturnValueOnce(endState);

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
    });

    it('should calculate severity correctly', async () => {
      const startState = {
        position: { x: 0, y: 64, z: 0 },
        inventory: []
      };
      const endState = {
        position: { x: 0, y: 64, z: 0 },
        inventory: []
      };

      mockVision.extractState
        .mockReturnValueOnce(startState)
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
});
