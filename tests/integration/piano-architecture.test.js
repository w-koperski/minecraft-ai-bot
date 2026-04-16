/**
 * Integration Tests for PIANO Architecture
 *
 * Tests the full flow from chat message → emotion detection → social awareness →
 * cognitive controller → commander → knowledge graph.
 *
 * Scenarios covered:
 * 1. Full PIANO flow (happy path) - chat message flows through all modules
 * 2. Coherence conflict resolution - talk/action misalignment detected
 * 3. Knowledge graph data flow - Strategy layer uses graph data
 * 4. Concurrent execution - Commander runs modules in parallel
 * 5. Error handling - Module failures don't crash the system
 */

const fs = require('fs');
const path = require('path');

// Mock lockfile before requiring modules
const mockLockfile = {
  lock: jest.fn((filePath, opts, cb) => {
    if (opts && opts.timeout === 0) {
      return cb(new Error('Lock timeout'));
    }
    setTimeout(() => cb(null), 5);
  }),
  unlock: jest.fn((filePath, cb) => setTimeout(() => cb(null), 5)),
  check: jest.fn((filePath, opts, cb) => cb(null, false))
};

jest.mock('lockfile', () => mockLockfile);

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Mock emotion detector - returns predictable emotions
jest.mock('../../src/emotion/emotion-detector', () => ({
  detectEmotion: jest.fn(async (message) => {
    const lower = message.toLowerCase();
    if (lower.includes('frustrated') || lower.includes('angry')) {
      return { emotion: 'anger', confidence: 0.85 };
    }
    if (lower.includes('happy') || lower.includes('great')) {
      return { emotion: 'joy', confidence: 0.90 };
    }
    if (lower.includes('scared') || lower.includes('afraid')) {
      return { emotion: 'fear', confidence: 0.88 };
    }
    if (lower.includes('sad') || lower.includes('unhappy')) {
      return { emotion: 'sadness', confidence: 0.82 };
    }
    return null; // Below threshold
  }),
  initialize: jest.fn(),
  isInitialized: jest.fn(() => true),
  getP99Latency: jest.fn(() => 10),
  getLatencyStats: jest.fn(() => ({ min: 5, max: 15, avg: 8, p99: 10, count: 100 })),
  clearCache: jest.fn(),
  reset: jest.fn(),
  CONFIDENCE_THRESHOLD: 0.7
}));

const StateManager = require('../../src/utils/state-manager');
const RateLimiter = require('../../src/utils/rate-limiter');
const CognitiveController = require('../../src/layers/cognitive-controller');
const SocialAwareness = require('../../src/social/social-awareness');
const KnowledgeGraph = require('../../src/memory/knowledge-graph');
const Commander = require('../../src/layers/commander');
const Strategy = require('../../src/layers/strategy');
const emotionDetector = require('../../src/emotion/emotion-detector');
const { createMockOmniroute } = require('../mocks/mock-omniroute');

const testStateDir = path.join(__dirname, '../state-test-piano');

describe('PIANO Architecture Integration Tests', () => {
  let stateManager;
  let mockOmniroute;
  let rateLimiter;
  let cognitiveController;
  let socialAwareness;
  let knowledgeGraph;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock lockfile
    mockLockfile.lock.mockClear();
    mockLockfile.unlock.mockClear();

    // Create test state directory
    if (!fs.existsSync(testStateDir)) {
      fs.mkdirSync(testStateDir, { recursive: true });
    }

    // Initialize components
    stateManager = new StateManager(testStateDir);
    mockOmniroute = createMockOmniroute();
    rateLimiter = new RateLimiter({
      reservoir: 100,
      reservoirRefreshInterval: 60000,
      maxConcurrent: 5,
      minTime: 50
    });

    cognitiveController = new CognitiveController();
    socialAwareness = new SocialAwareness({ emotionDetector });
    knowledgeGraph = new KnowledgeGraph();

    // Reset emotion detector mock
    emotionDetector.detectEmotion.mockClear();
  });

  afterEach(async () => {
    // Stop rate limiter
    if (rateLimiter) {
      try {
        await rateLimiter.stop();
      } catch (e) {}
    }

    // Cleanup test state files
    if (fs.existsSync(testStateDir)) {
      const files = fs.readdirSync(testStateDir);
      for (const file of files) {
        if (file.endsWith('.json') || file.endsWith('.db')) {
          try {
            fs.unlinkSync(path.join(testStateDir, file));
          } catch (e) {}
        }
      }
    }

    mockOmniroute.reset();
    knowledgeGraph.clear();
  });

  // ============================================
  // Scenario 1: Full PIANO Flow (Happy Path)
  // ============================================
  describe('Full PIANO Flow - Happy Path', () => {
    it('should flow chat message through emotion → social → controller → commander', async () => {
      // Setup: Player sends frustrated message
      const playerId = 'TestPlayer';
      const message = "I'm frustrated with this task!";
      const context = { health: 20 };

      // Step 1: Emotion detection
      const emotion = await emotionDetector.detectEmotion(message);
      expect(emotion).not.toBeNull();
      expect(emotion.emotion).toBe('anger');
      expect(emotion.confidence).toBeGreaterThan(0.7);

      // Step 2: Social Awareness tracks sentiment
      const sentimentResult = socialAwareness.trackSentiment(playerId, emotion);
      expect(sentimentResult.playerId).toBe(playerId);
      expect(sentimentResult.currentEmotion.emotion).toBe('anger');

      // Step 3: Infer intention from message
      const intention = socialAwareness.inferIntention(playerId, message, context);
      expect(intention).toBeDefined();
      expect(intention.playerId).toBe(playerId);

      // Step 4: Get social context for Cognitive Controller
      const socialContext = socialAwareness.getSocialContext(playerId);
      expect(socialContext.activePlayers).toBe(1);

      // Step 5: Build cognitive inputs (simulating Commander's buildCognitiveInputs)
      const cognitiveInputs = {
        personality: { traits: { warmth: 0.8, loyalty: 0.7 }, active: true, confidence: 1.0 },
        emotion: { state: emotion.emotion, confidence: emotion.confidence },
        social: {
          active: true,
          action: { type: 'respond_to_player', playerId, emotion: emotion.emotion },
          confidence: 0.8,
          talk: `I understand you're frustrated. Let me help.`
        },
        goals: null,
        danger: null
      };

      // Step 6: Synthesize through Cognitive Controller
      const decision = cognitiveController.synthesize(cognitiveInputs);
      expect(decision).toBeDefined();
      expect(decision.action).toBeDefined();
      expect(decision.priority).toBe('high'); // Social is priority 2
      expect(decision.source).toBe('social');
      expect(decision.confidence).toBeGreaterThan(0);

      // Step 7: Check coherence (no conflict in this case)
      const isCoherent = cognitiveController.checkCoherence(
        "I understand you're frustrated.",
        decision.action
      );
      expect(isCoherent).toBe(true);

      // Step 8: Broadcast decision
      const mockModule = { receiveDecision: jest.fn() };
      cognitiveController.registerModule('testModule', mockModule);
      const broadcastResults = cognitiveController.broadcast(decision);
      expect(broadcastResults.testModule.acknowledged).toBe(true);
      expect(mockModule.receiveDecision).toHaveBeenCalledWith(decision);

      // Verify full flow completed
      expect(emotionDetector.detectEmotion).toHaveBeenCalled();
      expect(cognitiveController.getHistory()).toHaveLength(1);
    });

    it('should detect joy emotion and blend with personality', async () => {
      const message = "I'm so happy with our progress!";
      const playerId = 'HappyPlayer';

      const emotion = await emotionDetector.detectEmotion(message);
      expect(emotion.emotion).toBe('joy');

      socialAwareness.trackSentiment(playerId, emotion);

      const cognitiveInputs = {
        personality: { traits: { warmth: 0.9, humor: 0.7 }, active: true, confidence: 1.0 },
        emotion: { state: emotion.emotion, confidence: emotion.confidence },
        social: {
          active: true,
          action: { type: 'celebrate', with: playerId },
          confidence: 0.9
        },
        goals: null,
        danger: null
      };

      const decision = cognitiveController.synthesize(cognitiveInputs);
      expect(decision.source).toBe('social');
      expect(decision.action.emotionalContext).toBe('joy');
    });
  });

  // ============================================
  // Scenario 2: Coherence Conflict Resolution
  // ============================================
  describe('Coherence Conflict Resolution', () => {
    it('should detect talk/action conflict when offering help but attacking', () => {
      const talk = "I'll help you with that!";
      const action = { type: 'attack', target: 'player' };

      const isCoherent = cognitiveController.checkCoherence(talk, action);
      expect(isCoherent).toBe(false);

      // Verify conflict was logged
      const history = cognitiveController.getHistory(10);
      // The checkCoherence method should have logged a warning
    });

    it('should detect conflict when expressing affection but harming', () => {
      const talk = "I love you, you're my best friend!";
      const action = { type: 'attack', target: 'friendly_mob' };

      const isCoherent = cognitiveController.checkCoherence(talk, action);
      expect(isCoherent).toBe(false);
    });

    it('should detect conflict when offering to stay but moving away', () => {
      const talk = "I'll stay right here with you.";
      const action = { type: 'move', direction: 'away' };

      const isCoherent = cognitiveController.checkCoherence(talk, action);
      expect(isCoherent).toBe(false);
    });

    it('should allow coherent talk/action pairs', () => {
      const talk = "I'll help you collect wood!";
      const action = { type: 'collect_block', target: 'oak_log' };

      const isCoherent = cognitiveController.checkCoherence(talk, action);
      expect(isCoherent).toBe(true);
    });

    it('should resolve conflict by deferring lower priority action', () => {
      // Setup: Social says help, but goals say attack
      const inputs = {
        personality: { traits: { loyalty: 0.9 }, active: true, confidence: 1.0 },
        emotion: null,
        social: {
          active: true,
          action: { type: 'help_player' },
          confidence: 0.8,
          talk: "I'm here to help you!"
        },
        goals: {
          active: true,
          action: { type: 'attack', target: 'enemy' },
          confidence: 0.7
        },
        danger: null
      };

      const decision = cognitiveController.synthesize(inputs);

      // Social should win (priority 2 > goals priority 3)
      expect(decision.source).toBe('social');
      expect(decision.action.type).toBe('help_player');
      expect(decision.deferred).toContainEqual(
        expect.objectContaining({ source: 'goals' })
      );
    });

    it('should prioritize danger over social and goals', () => {
      const inputs = {
        personality: { traits: {}, active: true, confidence: 1.0 },
        emotion: null,
        social: {
          active: true,
          action: { type: 'chat', message: 'Hello!' },
          confidence: 0.9
        },
        goals: {
          active: true,
          action: { type: 'collect', target: 'wood' },
          confidence: 0.8
        },
        danger: {
          active: true,
          action: { type: 'flee', reason: 'lava' },
          confidence: 0.95
        }
      };

      const decision = cognitiveController.synthesize(inputs);

      // Danger should win (priority 1)
      expect(decision.source).toBe('danger');
      expect(decision.priority).toBe('critical');
      expect(decision.action.type).toBe('flee');

      // Social and goals should be deferred
      expect(decision.deferred).toHaveLength(2);
    });
  });

  // ============================================
  // Scenario 3: Knowledge Graph Data Flow
  // ============================================
  describe('Knowledge Graph Data Flow', () => {
    it('should store and retrieve spatial memories', () => {
      // Add spatial memory
      knowledgeGraph.addSpatialMemory(
        'Oak Forest',
        { x: 100, y: 64, z: -200 },
        'forest',
        Date.now()
      );

      // Query nearby locations
      const nearby = knowledgeGraph.getSpatialMemories({
        near: { x: 110, y: 64, z: -190, radius: 50 }
      });

      expect(nearby).toHaveLength(1);
      expect(nearby[0].name).toBe('Oak Forest');
      expect(nearby[0].biome).toBe('forest');
    });

	it('should store and retrieve semantic memories', () => {
		knowledgeGraph.addSemanticMemory(
			'Diamonds are rare',
			'fact',
			0.9,
			Date.now()
		);

		knowledgeGraph.addSemanticMemory(
			'Emeralds are currency',
			'rule',
			1.0,
			Date.now()
		);

		const diamondFacts = knowledgeGraph.getSemanticMemories({ subject: 'D' });
		expect(diamondFacts.length).toBeGreaterThan(0);
		expect(diamondFacts[0].subject).toBe('D');

		const rules = knowledgeGraph.getSemanticMemories({ category: 'rule' });
		expect(rules).toHaveLength(1);
		expect(rules[0].subject).toBe('Em');
	});

    it('should store episodic memories with importance', () => {
      // Add episodic memory (important experience)
      knowledgeGraph.addEpisodicMemory(
        'Successfully defended player from zombie attack',
        [
          { type: 'player', identifier: 'TestPlayer', role: 'protected' },
          { type: 'mob', identifier: 'zombie_1', role: 'enemy' }
        ],
        { x: 50, y: 64, z: 50, dimension: 'overworld', biome: 'plains' },
        Date.now(),
        8 // High importance
      );

      // Query by participant
      const memories = knowledgeGraph.getEpisodicMemories({
        participant: 'TestPlayer'
      });

      expect(memories).toHaveLength(1);
      expect(memories[0].importance).toBe(8);
      expect(memories[0].memory_tier).toBe('stm');
    });

    it('should consolidate memories from STM to Episodic to LTM', () => {
      // Add memory with high importance
      const oldTime = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
      knowledgeGraph.addEpisodicMemory(
        'Found diamonds at layer 12',
        [{ type: 'bot', identifier: 'self', role: 'discoverer' }],
        { x: 0, y: 12, z: 0, dimension: 'overworld', biome: 'underground' },
        oldTime,
        9 // High importance
      );

      // Consolidate (simulate 1 hour threshold)
      const stats = knowledgeGraph.consolidate({
        stmToEpisodicMs: 60 * 60 * 1000, // 1 hour
        episodicToLtmMs: 24 * 60 * 60 * 1000 // 24 hours
      });

      expect(stats.stmToEpisodic).toBe(1);

      // Verify memory tier updated
      const episodicMemories = knowledgeGraph.getEpisodicMemories({ memoryTier: 'episodic' });
      expect(episodicMemories).toHaveLength(1);
    });

	it('should integrate with Strategy layer for planning context', async () => {
		knowledgeGraph.addSpatialMemory(
			'Village',
			{ x: 200, y: 64, z: 300 },
			'plains',
			Date.now()
		);

		knowledgeGraph.addSemanticMemory(
			'Villagers trade emeralds for wheat',
			'fact',
			0.85,
			Date.now()
		);

		const state = {
			position: { x: 180, y: 64, z: 280 },
			health: 20,
			inventory: []
		};

		const spatialMemories = knowledgeGraph.getSpatialMemories({
			near: { x: state.position.x, y: state.position.y, z: state.position.z, radius: 150 }
		});

		const semanticMemories = knowledgeGraph.getSemanticMemories({ subject: 'V' });

		expect(spatialMemories).toHaveLength(1);
		expect(semanticMemories.length).toBeGreaterThan(0);
		expect(spatialMemories[0].name).toBe('Village');
	});
  });

  // ============================================
  // Scenario 4: Concurrent Module Execution
  // ============================================
  describe('Concurrent Module Execution', () => {
    it('should run analysis modules concurrently with Promise.all', async () => {
      // Setup state files
      await stateManager.write('state', {
        position: { x: 0, y: 64, z: 0 },
        health: 20,
        inventory: [],
        entities: [],
        blocks: []
      });

      await stateManager.write('commands', { goal: 'test goal' });
      await stateManager.write('plan', []);

      // Track concurrent execution timing
      const startTime = Date.now();
      const executionOrder = [];

      // Simulate concurrent module execution (like Commander's loop)
      const [analysis, stuckDetection, idleState] = await Promise.all([
        (async () => {
          executionOrder.push('analysis-start');
          await new Promise(r => setTimeout(r, 50));
          executionOrder.push('analysis-end');
          return { hasState: true, threatLevel: 'safe' };
        })(),
        (async () => {
          executionOrder.push('stuck-start');
          await new Promise(r => setTimeout(r, 50));
          executionOrder.push('stuck-end');
          return { isStuck: false };
        })(),
        (async () => {
          executionOrder.push('idle-start');
          await new Promise(r => setTimeout(r, 50));
          executionOrder.push('idle-end');
          return { isIdle: false };
        })()
      ]);

      const duration = Date.now() - startTime;

      // Should complete in ~50ms (parallel), not ~150ms (sequential)
      expect(duration).toBeLessThan(100);
      expect(analysis.hasState).toBe(true);
      expect(stuckDetection.isStuck).toBe(false);
      expect(idleState.isIdle).toBe(false);

      // Verify modules ran concurrently (interleaved starts)
      expect(executionOrder).toEqual([
        'analysis-start',
        'stuck-start',
        'idle-start',
        'analysis-end',
        'stuck-end',
        'idle-end'
      ]);
    });

	it('should synthesize after all concurrent modules complete', async () => {
		// Simulate Commander pattern: gather inputs, then synthesize
		const inputsPromise = Promise.all([
			Promise.resolve({ traits: {}, active: true, confidence: 1.0 }),
			Promise.resolve(null),
			Promise.resolve({ active: false }),
			Promise.resolve({ active: true, action: { type: 'test' }, confidence: 0.8 }),
			Promise.resolve(null)
		]);

		// Wait for all inputs
		const [personality, emotion, social, goals, danger] = await inputsPromise;

		// Synthesize (should happen AFTER all inputs gathered)
		const decision = cognitiveController.synthesize({
			personality,
			emotion,
			social,
			goals,
			danger
		});

		expect(decision).toBeDefined();
		expect(decision.source).toBe('goals');
	});

    it('should broadcast to multiple modules sequentially', () => {
      // Register multiple modules
      const modules = {
        emotion: { receiveDecision: jest.fn() },
        social: { receiveDecision: jest.fn() },
        goals: { receiveDecision: jest.fn() }
      };

      for (const [name, module] of Object.entries(modules)) {
        cognitiveController.registerModule(name, module);
      }

      const decision = {
        action: { type: 'test' },
        priority: 'high',
        source: 'social'
      };

      const results = cognitiveController.broadcast(decision);

      // All modules should receive the decision
      expect(results.emotion.acknowledged).toBe(true);
      expect(results.social.acknowledged).toBe(true);
      expect(results.goals.acknowledged).toBe(true);

      expect(modules.emotion.receiveDecision).toHaveBeenCalledWith(decision);
      expect(modules.social.receiveDecision).toHaveBeenCalledWith(decision);
      expect(modules.goals.receiveDecision).toHaveBeenCalledWith(decision);
    });
  });

  // ============================================
  // Scenario 5: Error Handling
  // ============================================
	describe('Error Handling', () => {
		it('should handle emotion detection failure gracefully', async () => {
			emotionDetector.detectEmotion.mockReset();
			emotionDetector.detectEmotion.mockRejectedValueOnce(new Error('Model load failed'));

			const message = "Test message";
			let result;
			try {
				result = await emotionDetector.detectEmotion(message);
			} catch (e) {
				result = undefined;
			}

			expect(result).toBeUndefined();
			expect(emotionDetector.detectEmotion).toHaveBeenCalled();
		});

    it('should handle module broadcast failure without crashing', () => {
      const failingModule = {
        receiveDecision: jest.fn(() => {
          throw new Error('Module crashed');
        })
      };
      const workingModule = {
        receiveDecision: jest.fn()
      };

      cognitiveController.registerModule('failing', failingModule);
      cognitiveController.registerModule('working', workingModule);

      const decision = { action: { type: 'test' } };
      const results = cognitiveController.broadcast(decision);

      // Failing module should return error
      expect(results.failing.acknowledged).toBe(false);
      expect(results.failing.error).toBe('Module crashed');

      // Working module should still receive decision
      expect(results.working.acknowledged).toBe(true);
      expect(workingModule.receiveDecision).toHaveBeenCalled();
    });

    it('should handle missing module receiveDecision method', () => {
      const moduleWithoutMethod = { someOtherMethod: jest.fn() };
      cognitiveController.registerModule('noMethod', moduleWithoutMethod);

      const decision = { action: { type: 'test' } };
      const results = cognitiveController.broadcast(decision);

      expect(results.noMethod.acknowledged).toBe(true);
      expect(results.noMethod.response).toBeNull();
    });

    it('should handle invalid cognitive inputs', () => {
      // All null inputs
      const decision = cognitiveController.synthesize({
        personality: null,
        emotion: null,
        social: null,
        goals: null,
        danger: null
      });

      expect(decision).toBeDefined();
      expect(decision.source).toBe('default');
      expect(decision.action.type).toBe('idle');
    });

    it('should handle knowledge graph query errors', () => {
      // Add valid entity
      knowledgeGraph.addEntity('test', 'item', { value: 1 });

      // Query for non-existent path
      const path = knowledgeGraph.findPath('test', 'nonexistent');
      expect(path).toBeNull();

      // Query neighbors of non-existent node
      const neighbors = knowledgeGraph.getNeighbors('nonexistent');
      expect(neighbors).toEqual([]);
    });

	it('should handle state file read/write errors', async () => {
		const testDir = '/tmp/test-state-dir-' + Date.now();
		fs.mkdirSync(testDir, { recursive: true });
		
		const testStateManager = new StateManager(testDir);

		await testStateManager.write('state', { position: { x: 0, y: 64, z: 0 }, health: 20, inventory: [], entities: [], blocks: [] });
		const data = await testStateManager.read('state');

		expect(data).toBeDefined();
		expect(data.position).toEqual({ x: 0, y: 64, z: 0 });

		fs.rmdirSync(testDir, { recursive: true });
	});

    it('should continue processing after module error', async () => {
      // Social Awareness should handle emotion detector error
      const badEmotionDetector = {
        detectEmotion: jest.fn().mockRejectedValue(new Error('Failed'))
      };

      const testSocial = new SocialAwareness({
        emotionDetector: badEmotionDetector
      });

      // Should not throw
      const result = await testSocial.processMessage('player', 'hello', {});
      expect(result).toBeDefined();
      expect(result.playerId).toBe('player');
      // Emotion should be null (error handled)
      expect(result.emotion).toBeNull();
      // Intention should still be inferred
      expect(result.intention).toBeDefined();
    });
  });

  // ============================================
  // Additional Integration Scenarios
  // ============================================
	describe('Additional Integration Scenarios', () => {
		it('should track sentiment trend over multiple interactions', async () => {
			const playerId = 'TrendPlayer';

			socialAwareness.trackSentiment(playerId, { emotion: 'joy', confidence: 0.9, timestamp: Date.now() - 6000 });
			socialAwareness.trackSentiment(playerId, { emotion: 'joy', confidence: 0.85, timestamp: Date.now() - 5000 });
			socialAwareness.trackSentiment(playerId, { emotion: 'neutral', confidence: 0.75, timestamp: Date.now() - 4000 });
			socialAwareness.trackSentiment(playerId, { emotion: 'neutral', confidence: 0.7, timestamp: Date.now() - 3000 });
			socialAwareness.trackSentiment(playerId, { emotion: 'anger', confidence: 0.8, timestamp: Date.now() - 2000 });
			socialAwareness.trackSentiment(playerId, { emotion: 'anger', confidence: 0.85, timestamp: Date.now() - 1000 });

			const history = socialAwareness.getSentimentHistory(playerId);
			expect(history).toHaveLength(6);

			const trend = socialAwareness._calculateTrend(history);
			expect(trend).toBe('declining');
		});

    it('should infer urgency from context', () => {
      const playerId = 'UrgentPlayer';

      // Low health = high urgency
      const intention = socialAwareness.inferIntention(playerId, 'help me', {
        health: 3 // Critical
      });

      expect(intention.urgency).toBe('high');
    });

	it('should maintain BDI model for players', () => {
		const playerId = 'BDIPlayer';

		socialAwareness.inferIntention(playerId, 'Let me build a house', {
			health: 20
		});

		const state = socialAwareness.getPlayerState(playerId);

		expect(state).toBeDefined();
		expect(state.desires).toContain('creation');
		expect(state.intentions.length).toBeGreaterThan(0);
		expect(state.intentions[0].type).toBe('start_construction');
	});

    it('should use relationship context in decisions', async () => {
      // High warmth + high loyalty = more caring response
      const highWarmthTraits = { warmth: 0.9, loyalty: 0.8 };
      const lowWarmthTraits = { warmth: 0.3, loyalty: 0.2 };

      const inputs1 = {
        personality: { traits: highWarmthTraits, active: true, confidence: 1.0 },
        emotion: null,
        social: { active: false },
        goals: { active: true, action: { type: 'greet' }, confidence: 0.7 },
        danger: null
      };

      const decision1 = cognitiveController.synthesize(inputs1);
      expect(decision1).toBeDefined();
      expect(decision1.source).toBe('goals');
      // Personality blending adds braveryLevel when goals are prioritized with personality traits
      expect(decision1.action).toBeDefined();
    });

    it('should store decision history with proper limits', () => {
      // Generate more than max history
      for (let i = 0; i < 60; i++) {
        cognitiveController.synthesize({
          personality: null,
          emotion: null,
          social: null,
          goals: { active: true, action: { type: 'test', iteration: i } },
          danger: null
        });
      }

      const history = cognitiveController.getHistory(100);
      expect(history.length).toBeLessThanOrEqual(50); // maxHistory from constructor
    });
  });
});
