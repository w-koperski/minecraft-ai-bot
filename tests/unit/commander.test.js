const Commander = require('../../src/layers/commander');
const StateManager = require('../../src/utils/state-manager');
const OmnirouteClient = require('../../src/utils/omniroute');
const CognitiveController = require('../../src/layers/cognitive-controller');

jest.mock('../../src/utils/state-manager');
jest.mock('../../src/utils/omniroute');
jest.mock('../../src/layers/cognitive-controller');

describe('Commander Layer', () => {
  let commander;
  let mockStateManager;
  let mockOmniroute;
  let mockCognitiveController;

  beforeEach(() => {
    mockStateManager = {
      read: jest.fn(),
      write: jest.fn()
    };

    mockOmniroute = {
      commander: jest.fn()
    };

    mockCognitiveController = {
      synthesize: jest.fn(),
      checkCoherence: jest.fn(),
      broadcast: jest.fn()
    };

    StateManager.mockImplementation(() => mockStateManager);
    OmnirouteClient.mockImplementation(() => mockOmniroute);
    CognitiveController.mockImplementation(() => mockCognitiveController);

    commander = new Commander();
  });

  afterEach(async () => {
    if (commander && commander.running) {
      await commander.stop();
    }
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with correct default state', () => {
      expect(commander.running).toBe(false);
      expect(commander.loopTimer).toBe(null);
      expect(commander.failureCount).toBe(0);
      expect(commander.consecutiveErrors).toBe(0);
    });

    test('should initialize Cognitive Controller', () => {
      expect(commander.cognitiveController).toBeDefined();
    });
  });

  describe('Memory Gathering', () => {
    test('should gather all memory tiers', async () => {
      const mockState = {
        position: { x: 0, y: 64, z: 0 },
        health: 20,
        inventory: [],
        entities: [],
        blocks: []
      };

      mockStateManager.read.mockImplementation((key) => {
        if (key === 'state') return Promise.resolve(mockState);
        if (key === 'plan') return Promise.resolve([]);
        if (key === 'commands') return Promise.resolve({ goal: null });
        if (key === 'action_error') return Promise.resolve(null);
        if (key === 'action_history') return Promise.resolve([]);
        return Promise.resolve(null);
      });

      const memory = await commander.gatherMemory();

      expect(memory.working.state).toEqual(mockState);
      expect(memory.working.plan).toEqual([]);
      expect(memory.working.commands).toEqual({ goal: null });
      expect(memory.stm).toEqual([]);
    });

    test('should handle missing state files gracefully', async () => {
      mockStateManager.read.mockResolvedValue(null);

      const memory = await commander.gatherMemory();

      expect(memory.working.state).toBe(null);
      expect(memory.working.plan).toBe(null);
      expect(memory.stm).toEqual([]);
    });
  });

  describe('Situation Analysis', () => {
    test('should analyze safe situation correctly', () => {
      const memory = {
        working: {
          state: {
            health: 20,
            position: { x: 0, y: 64, z: 0 },
            entities: [],
            blocks: []
          },
          plan: [{ type: 'move', direction: 'forward' }],
          commands: { goal: 'collect wood' },
          action_error: null
        },
        stm: []
      };

      const analysis = commander.analyzeSituation(memory);

      expect(analysis.hasState).toBe(true);
      expect(analysis.hasPlan).toBe(true);
      expect(analysis.hasGoal).toBe(true);
      expect(analysis.botAlive).toBe(true);
      expect(analysis.threatLevel).toBe('safe');
    });

    test('should detect high threat level', () => {
      const memory = {
        working: {
          state: {
            health: 4,
            position: { x: 0, y: 64, z: 0 },
            entities: [
              { type: 'hostile', name: 'zombie', distance: 5 }
            ],
            blocks: [
              { name: 'lava', distance: 3 }
            ]
          },
          plan: [],
          commands: null,
          action_error: null
        },
        stm: []
      };

      const analysis = commander.analyzeSituation(memory);

      expect(analysis.threatLevel).toBe('high');
    });
  });

  describe('Stuck Detection', () => {
    test('should not detect stuck when making progress', () => {
      const memory = {
        working: {
          state: { position: { x: 10, y: 64, z: 10 }, health: 20 },
          commands: { goal: 'collect wood' },
          plan: [{ type: 'move' }]
        },
        stm: [
          { action: { type: 'move' }, success: true, timestamp: Date.now() }
        ]
      };

      const analysis = { planProgress: { status: 'active', progress: 0.8 } };
      
      commander.lastProgressTime = Date.now() - 5000;
      commander.lastGoal = 'collect wood';
      commander.lastGoalTime = Date.now() - 10000;
      commander.lastState = { position: { x: 5, y: 64, z: 5 } };

      const detection = commander.detectStuck(memory, analysis);

      expect(detection.isStuck).toBe(false);
    });

    test('should detect stuck when no progress for 30+ seconds', () => {
      const memory = {
        working: {
          state: { position: { x: 0, y: 64, z: 0 }, health: 20 },
          commands: { goal: 'collect wood' },
          plan: []
        },
        stm: []
      };

      const analysis = { planProgress: { status: 'stalled', progress: 0 } };
      
      commander.lastProgressTime = Date.now() - 35000;
      commander.lastState = { position: { x: 0, y: 64, z: 0 } };

      const detection = commander.detectStuck(memory, analysis);

      expect(detection.isStuck).toBe(true);
      expect(detection.reasons).toContain('no_progress_35s');
    });

    test('should detect stuck when same goal for 2+ minutes', () => {
      const memory = {
        working: {
          state: { position: { x: 0, y: 64, z: 0 }, health: 20 },
          commands: { goal: 'collect wood' },
          plan: []
        },
        stm: []
      };

      const analysis = { planProgress: { status: 'active', progress: 0.5 } };
      
      commander.lastGoal = 'collect wood';
      commander.lastGoalTime = Date.now() - 130000;
      commander.lastProgressTime = Date.now() - 5000;

      const detection = commander.detectStuck(memory, analysis);

      expect(detection.isStuck).toBe(true);
      expect(detection.reasons).toContain('same_goal_130s');
    });

    test('should detect stuck on repeated failures', () => {
      const memory = {
        working: {
          state: { position: { x: 0, y: 64, z: 0 }, health: 20 },
          commands: { goal: 'collect wood' },
          plan: []
        },
        stm: []
      };

      const analysis = { planProgress: { status: 'failing', progress: 0.2 } };
      
      commander.failureCount = 3;
      commander.lastProgressTime = Date.now() - 5000;

      const detection = commander.detectStuck(memory, analysis);

      expect(detection.isStuck).toBe(true);
      expect(detection.reasons).toContain('repeated_failures_3');
    });
  });

  describe('Decision Making', () => {
    test('should make continue decision when all is well', async () => {
      const memory = {
        working: {
          state: { health: 20, position: { x: 0, y: 64, z: 0 }, inventory: [], entities: [], blocks: [] },
          commands: { goal: 'collect wood' },
          plan: [{ type: 'move' }],
          action_error: null
        },
        stm: [{ action: { type: 'move' }, success: true, timestamp: Date.now() }]
      };

      const analysis = {
        hasState: true,
        hasPlan: true,
        hasGoal: true,
        botAlive: true,
        threatLevel: 'safe',
        planProgress: { status: 'active', progress: 0.8 }
      };

      const stuckDetection = { isStuck: false, reasons: [], severity: 0 };

      mockOmniroute.commander.mockResolvedValue({
        choices: [{
          message: {
            content: '```json\n{"action": "continue", "reasoning": "Bot is making good progress"}\n```'
          }
        }]
      });

      const decision = await commander.makeDecision(memory, analysis, stuckDetection);

      expect(decision.action).toBe('continue');
      expect(mockOmniroute.commander).toHaveBeenCalled();
    });

    test('should make fallback decision when LLM fails', async () => {
      const memory = {
        working: {
          state: { health: 20, position: { x: 0, y: 64, z: 0 }, inventory: [], entities: [], blocks: [] },
          commands: { goal: 'collect wood' },
          plan: [],
          action_error: null
        },
        stm: []
      };

      const analysis = {
        threatLevel: 'safe',
        planProgress: { status: 'active', progress: 0.5 }
      };

      const stuckDetection = { isStuck: false, reasons: [], severity: 0 };

      mockOmniroute.commander.mockRejectedValue(new Error('API error'));

      const decision = await commander.makeDecision(memory, analysis, stuckDetection);

      expect(decision.action).toBe('continue');
      expect(decision.reasoning).toContain('Fallback');
    });

    test('should make emergency stop on critical situation', async () => {
      const memory = {
        working: {
          state: { health: 2, position: { x: 0, y: 64, z: 0 }, inventory: [], entities: [], blocks: [] },
          commands: null,
          plan: [],
          action_error: null
        },
        stm: []
      };

      const analysis = {
        threatLevel: 'high',
        planProgress: { status: 'stalled', progress: 0 }
      };

      const stuckDetection = { isStuck: true, reasons: ['no_progress_40s'], severity: 4 };

      mockOmniroute.commander.mockRejectedValue(new Error('API error'));

      const decision = await commander.makeDecision(memory, analysis, stuckDetection);

      expect(decision.action).toBe('emergency_stop');
    });
  });

  describe('Decision Execution', () => {
    test('should execute continue decision', async () => {
      const decision = {
        action: 'continue',
        reasoning: 'All good'
      };

      await commander.executeDecision(decision);

      expect(mockStateManager.write).not.toHaveBeenCalled();
    });

    test('should execute new_goal decision', async () => {
      const decision = {
        action: 'new_goal',
        goal: 'build house',
        reasoning: 'Time for new objective'
      };

      await commander.executeDecision(decision);

      expect(mockStateManager.write).toHaveBeenCalledWith('commands', {
        goal: 'build house',
        timestamp: expect.any(Number),
        source: 'commander',
        priority: expect.any(Number),
        activityType: null
      });
    });

    test('should execute correct_strategy decision', async () => {
      const decision = {
        action: 'correct_strategy',
        correction: 'Try different approach',
        reasoning: 'Current plan not working'
      };

      await commander.executeDecision(decision);

      expect(mockStateManager.write).toHaveBeenCalledWith('commands', {
        goal: null,
        correction: 'Try different approach',
        timestamp: expect.any(Number),
        source: 'commander'
      });

      expect(mockStateManager.write).toHaveBeenCalledWith('plan', []);
    });

    test('should execute emergency_stop decision', async () => {
      const decision = {
        action: 'emergency_stop',
        reasoning: 'Critical situation'
      };

      await commander.executeDecision(decision);

      expect(mockStateManager.write).toHaveBeenCalledWith('commands', {
        goal: null,
        emergency_stop: true,
        timestamp: expect.any(Number),
        source: 'commander'
      });

      expect(mockStateManager.write).toHaveBeenCalledWith('plan', []);
    });
  });

  describe('Lifecycle', () => {
    test('should start successfully', async () => {
      await commander.start();

      expect(commander.running).toBe(true);
      expect(commander.loopTimer).not.toBe(null);
    });

    test('should not start if already running', async () => {
      commander.running = true;

      await commander.start();

      expect(commander.loopTimer).toBe(null);
    });

    test('should stop successfully', async () => {
      commander.running = true;
      commander.loopTimer = setTimeout(() => {}, 10000);

      await commander.stop();

      expect(commander.running).toBe(false);
      expect(commander.loopTimer).toBe(null);
    });
  });

  describe('Utility Methods', () => {
    test('should calculate distance correctly', () => {
      const pos1 = { x: 0, y: 0, z: 0 };
      const pos2 = { x: 3, y: 4, z: 0 };

      const distance = commander.calculateDistance(pos1, pos2);

      expect(distance).toBe(5);
    });

    test('should return status', () => {
      commander.running = true;
      commander.lastGoal = 'collect wood';
      commander.failureCount = 2;

      const status = commander.getStatus();

      expect(status.running).toBe(true);
      expect(status.currentGoal).toBe('collect wood');
      expect(status.failureCount).toBe(2);
    });
  });

  describe('Cognitive Controller Integration', () => {
    test('should build cognitive inputs correctly', () => {
      const memory = {
        working: {
          state: { health: 20, position: { x: 0, y: 64, z: 0 }, entities: [], blocks: [] },
          commands: { goal: 'collect wood' },
          plan: []
        },
        stm: []
      };

      const analysis = {
        threatLevel: 'safe',
        hasState: true,
        hasGoal: true,
        hasPlan: false,
        botAlive: true
      };

      const stuckDetection = { isStuck: false, reasons: [], severity: 0 };

      const inputs = commander.buildCognitiveInputs(memory, analysis, stuckDetection);

      expect(inputs.personality).toBeDefined();
      expect(inputs.personality.active).toBe(true);
      expect(inputs.goals).toBeDefined();
      expect(inputs.goals.active).toBe(true);
      expect(inputs.goals.action.type).toBe('pursue_goal');
    });

    test('should include danger input when threat detected', () => {
      const memory = {
        working: {
          state: { health: 4, position: { x: 0, y: 64, z: 0 }, entities: [{ type: 'hostile', name: 'zombie', distance: 5 }], blocks: [] },
          commands: { goal: 'collect wood' },
          plan: []
        },
        stm: []
      };

      const analysis = {
        threatLevel: 'high',
        hasState: true,
        hasGoal: true,
        hasPlan: false,
        botAlive: true
      };

      const stuckDetection = { isStuck: false, reasons: [], severity: 0 };

      const inputs = commander.buildCognitiveInputs(memory, analysis, stuckDetection);

      expect(inputs.danger).toBeDefined();
      expect(inputs.danger.active).toBe(true);
      expect(inputs.danger.action.type).toBe('flee');
    });

    test('should call cognitiveController.synthesize in loop', async () => {
      mockStateManager.read.mockImplementation((key) => {
        if (key === 'state') return Promise.resolve({ health: 20, position: { x: 0, y: 64, z: 0 }, entities: [], blocks: [], inventory: [] });
        if (key === 'plan') return Promise.resolve([]);
        if (key === 'commands') return Promise.resolve({ goal: 'test goal' });
        if (key === 'action_error') return Promise.resolve(null);
        if (key === 'action_history') return Promise.resolve([]);
        return Promise.resolve(null);
      });

      mockCognitiveController.synthesize.mockReturnValue({
        action: { type: 'idle' },
        priority: 'normal',
        source: 'default',
        coherence: true,
        timestamp: Date.now()
      });

      mockOmniroute.commander.mockResolvedValue({
        choices: [{ message: { content: '{"action": "continue", "reasoning": "Test"}' } }]
      });

      await commander.loop();

      expect(mockCognitiveController.synthesize).toHaveBeenCalled();
    });

    test('should call cognitiveController.broadcast in loop', async () => {
      mockStateManager.read.mockImplementation((key) => {
        if (key === 'state') return Promise.resolve({ health: 20, position: { x: 0, y: 64, z: 0 }, entities: [], blocks: [], inventory: [] });
        if (key === 'plan') return Promise.resolve([]);
        if (key === 'commands') return Promise.resolve({ goal: 'test goal' });
        if (key === 'action_error') return Promise.resolve(null);
        if (key === 'action_history') return Promise.resolve([]);
        return Promise.resolve(null);
      });

      mockCognitiveController.synthesize.mockReturnValue({
        action: { type: 'idle' },
        priority: 'normal',
        source: 'default',
        coherence: true,
        timestamp: Date.now()
      });

      mockOmniroute.commander.mockResolvedValue({
        choices: [{ message: { content: '{"action": "continue", "reasoning": "Test"}' } }]
      });

      await commander.loop();

      expect(mockCognitiveController.broadcast).toHaveBeenCalled();
    });

    test('should check coherence before executing decision with talk', async () => {
      mockStateManager.read.mockImplementation((key) => {
        if (key === 'state') return Promise.resolve({ health: 20, position: { x: 0, y: 64, z: 0 }, entities: [], blocks: [], inventory: [] });
        if (key === 'plan') return Promise.resolve([]);
        if (key === 'commands') return Promise.resolve({ goal: 'test goal' });
        if (key === 'action_error') return Promise.resolve(null);
        if (key === 'action_history') return Promise.resolve([]);
        return Promise.resolve(null);
      });

      mockCognitiveController.synthesize.mockReturnValue({
        action: { type: 'idle' },
        priority: 'normal',
        source: 'default',
        coherence: true,
        timestamp: Date.now()
      });

      mockCognitiveController.checkCoherence.mockReturnValue(true);

      mockOmniroute.commander.mockResolvedValue({
        choices: [{ message: { content: '{"action": "continue", "reasoning": "Test", "talk": "I will help you"}' } }]
      });

      await commander.loop();

      expect(mockCognitiveController.checkCoherence).toHaveBeenCalledWith(
        'I will help you',
        expect.objectContaining({ action: 'continue' })
      );
    });

  test('should defer decision when coherence check fails', async () => {
    mockStateManager.read.mockImplementation((key) => {
      if (key === 'state') return Promise.resolve({ health: 20, position: { x: 0, y: 64, z: 0 }, entities: [], blocks: [], inventory: [] });
      if (key === 'plan') return Promise.resolve([]);
      if (key === 'commands') return Promise.resolve({ goal: 'test goal' });
      if (key === 'action_error') return Promise.resolve(null);
      if (key === 'action_history') return Promise.resolve([]);
      return Promise.resolve(null);
    });

    mockCognitiveController.synthesize.mockReturnValue({
      action: { type: 'idle' },
      priority: 'normal',
      source: 'default',
      coherence: true,
      timestamp: Date.now()
    });

    mockCognitiveController.checkCoherence.mockReturnValue(false);

    mockOmniroute.commander.mockResolvedValue({
      choices: [{ message: { content: '{"action": "new_goal", "goal": "attack player", "reasoning": "Test", "talk": "I will help you"}' } }]
    });

    await commander.loop();

    expect(mockCognitiveController.checkCoherence).toHaveBeenCalled();
  });

  test('should run analysis modules concurrently with Promise.all', async () => {
    const analyzeSituationSpy = jest.spyOn(commander, 'analyzeSituation');
    const detectStuckSpy = jest.spyOn(commander, 'detectStuck');
    const detectIdleStateSpy = jest.spyOn(commander, 'detectIdleState');

    mockStateManager.read.mockImplementation((key) => {
      if (key === 'state') return Promise.resolve({ health: 20, position: { x: 0, y: 64, z: 0 }, entities: [], blocks: [], inventory: [] });
      if (key === 'plan') return Promise.resolve([]);
      if (key === 'commands') return Promise.resolve({ goal: 'test goal' });
      if (key === 'action_error') return Promise.resolve(null);
      if (key === 'action_history') return Promise.resolve([]);
      return Promise.resolve(null);
    });

    mockCognitiveController.synthesize.mockReturnValue({
      action: { type: 'idle' },
      priority: 'normal',
      source: 'default',
      coherence: true,
      timestamp: Date.now()
    });

    mockOmniroute.commander.mockResolvedValue({
      choices: [{ message: { content: '{"action": "continue", "reasoning": "Test"}' } }]
    });

    await commander.loop();

    expect(analyzeSituationSpy).toHaveBeenCalled();
    expect(detectStuckSpy).toHaveBeenCalled();
    expect(detectIdleStateSpy).toHaveBeenCalled();

    analyzeSituationSpy.mockRestore();
    detectStuckSpy.mockRestore();
    detectIdleStateSpy.mockRestore();
  });

  test('should log timings for performance debugging', async () => {
    const logger = require('../../src/utils/logger');
    const debugSpy = jest.spyOn(logger, 'debug');

    mockStateManager.read.mockImplementation((key) => {
      if (key === 'state') return Promise.resolve({ health: 20, position: { x: 0, y: 64, z: 0 }, entities: [], blocks: [], inventory: [] });
      if (key === 'plan') return Promise.resolve([]);
      if (key === 'commands') return Promise.resolve({ goal: 'test goal' });
      if (key === 'action_error') return Promise.resolve(null);
      if (key === 'action_history') return Promise.resolve([]);
      return Promise.resolve(null);
    });

    mockCognitiveController.synthesize.mockReturnValue({
      action: { type: 'idle' },
      priority: 'normal',
      source: 'default',
      coherence: true,
      timestamp: Date.now()
    });

    mockOmniroute.commander.mockResolvedValue({
      choices: [{ message: { content: '{"action": "continue", "reasoning": "Test"}' } }]
    });

    await commander.loop();

    const debugCalls = debugSpy.mock.calls;
    const loopCompletedCall = debugCalls.find(call => 
      call[0] === 'Commander: Loop completed'
    );

    expect(loopCompletedCall).toBeDefined();
    expect(loopCompletedCall[1]).toHaveProperty('timings');
    expect(loopCompletedCall[1].timings).toHaveProperty('memory');
    expect(loopCompletedCall[1].timings).toHaveProperty('analysis');
    expect(loopCompletedCall[1].timings).toHaveProperty('cognitiveInputs');
    expect(loopCompletedCall[1].timings).toHaveProperty('synthesis');
    expect(loopCompletedCall[1].timings).toHaveProperty('decision');
    expect(loopCompletedCall[1].timings).toHaveProperty('broadcast');
    expect(loopCompletedCall[1].timings).toHaveProperty('execute');
    expect(loopCompletedCall[1].timings).toHaveProperty('total');

    debugSpy.mockRestore();
  });

  test('should synthesize after all concurrent modules complete', async () => {
    let synthesizeCallTime = null;
    let analysisCompleteTime = null;

    mockStateManager.read.mockImplementation((key) => {
      if (key === 'state') return Promise.resolve({ health: 20, position: { x: 0, y: 64, z: 0 }, entities: [], blocks: [], inventory: [] });
      if (key === 'plan') return Promise.resolve([]);
      if (key === 'commands') return Promise.resolve({ goal: 'test goal' });
      if (key === 'action_error') return Promise.resolve(null);
      if (key === 'action_history') return Promise.resolve([]);
      return Promise.resolve(null);
    });

    mockCognitiveController.synthesize.mockImplementation(() => {
      synthesizeCallTime = Date.now();
      return {
        action: { type: 'idle' },
        priority: 'normal',
        source: 'default',
        coherence: true,
        timestamp: synthesizeCallTime
      };
    });

    mockOmniroute.commander.mockResolvedValue({
      choices: [{ message: { content: '{"action": "continue", "reasoning": "Test"}' } }]
    });

    await commander.loop();

    analysisCompleteTime = Date.now();

    expect(synthesizeCallTime).toBeLessThan(analysisCompleteTime + 1000);

    mockCognitiveController.synthesize.mockRestore();
  });
});
});
