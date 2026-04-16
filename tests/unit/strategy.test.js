const Strategy = require('../../src/layers/strategy');
const StateManager = require('../../src/utils/state-manager');
const OmnirouteClient = require('../../src/utils/omniroute');
const KnowledgeGraph = require('../../src/memory/knowledge-graph');

jest.mock('../../src/utils/state-manager');
jest.mock('../../src/utils/omniroute');
jest.mock('../../src/utils/logger');
jest.mock('../../src/utils/relationship-state', () => ({
  getRelationship: jest.fn().mockResolvedValue({ trust: 0.5, familiarity: 0.3 }),
  formatForPrompt: jest.fn().mockReturnValue('Relationship: Trust 0.50, Familiarity 0.30')
}));
jest.mock('../../personality/personality-engine', () => ({
  getTraits: jest.fn().mockReturnValue({
    warmth: 0.5,
    directness: 0.5,
    humor: 0.5,
    curiosity: 0.5,
    loyalty: 0.5,
    bravery: 0.5
  })
}));

describe('Strategy Layer', () => {
  let strategy;
  let mockStateManager;
  let mockOmniroute;

  beforeEach(() => {
    mockStateManager = {
      read: jest.fn(),
      write: jest.fn(),
      delete: jest.fn()
    };

    mockOmniroute = {
      strategy: jest.fn()
    };

    StateManager.mockImplementation(() => mockStateManager);
    OmnirouteClient.mockImplementation(() => mockOmniroute);

    strategy = new Strategy();
  });

  afterEach(async () => {
    if (strategy && strategy.running) {
      await strategy.stop();
    }
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with KnowledgeGraph', () => {
      expect(strategy.knowledgeGraph).toBeDefined();
      expect(strategy.knowledgeGraph).toBeInstanceOf(KnowledgeGraph);
    });

    test('should initialize with correct default state', () => {
      expect(strategy.running).toBe(false);
      expect(strategy.loopTimer).toBe(null);
      expect(strategy.currentGoal).toBe(null);
      expect(strategy.currentPlan).toBe(null);
      expect(strategy.planCreatedAt).toBe(null);
      expect(strategy.replanAttempts).toBe(0);
    });

    test('should initialize history tracking', () => {
      expect(strategy.actionHistory).toEqual([]);
      expect(strategy.planHistory).toEqual([]);
    });

    test('should initialize progress tracking', () => {
      expect(strategy.lastPosition).toBe(null);
      expect(strategy.lastProgressTime).toBeDefined();
      expect(strategy.lastStateHash).toBe(null);
    });
  });

  describe('Knowledge Graph Integration', () => {
    describe('_queryKnowledgeGraph', () => {
      test('should return graph data within timeout', async () => {
        const state = {
          position: { x: 100, y: 64, z: 100 }
        };

        strategy.knowledgeGraph.addSpatialMemory('forest_base', { x: 105, y: 64, z: 98 }, 'forest');

        const result = await strategy._queryKnowledgeGraph(state);

        expect(result).toBeDefined();
        expect(result.spatial).toBeDefined();
        expect(result.semantic).toBeDefined();
      });

      test('should return null on timeout', async () => {
        const originalFetch = strategy._fetchGraphData;
        strategy._fetchGraphData = jest.fn().mockImplementation(() => {
          return new Promise(resolve => setTimeout(resolve, 1000));
        });

        const state = { position: { x: 0, y: 0, z: 0 } };
        const result = await strategy._queryKnowledgeGraph(state);

        expect(result).toBe(null);

        strategy._fetchGraphData = originalFetch;
      });

      test('should return null on error', async () => {
        strategy._fetchGraphData = jest.fn().mockRejectedValue(new Error('Graph error'));

        const state = { position: { x: 0, y: 0, z: 0 } };
        const result = await strategy._queryKnowledgeGraph(state);

        expect(result).toBe(null);
      });
    });

    describe('_querySpatialMemories', () => {
      test('should find nearby spatial memories', async () => {
        strategy.knowledgeGraph.addSpatialMemory('base', { x: 10, y: 64, z: 10 }, 'plains');
        strategy.knowledgeGraph.addSpatialMemory('mine', { x: 15, y: 40, z: 15 }, 'cave');

        const state = { position: { x: 12, y: 64, z: 12 } };
        const memories = await strategy._querySpatialMemories(state);

        expect(memories.length).toBeGreaterThan(0);
      });

      test('should return empty array if no state', async () => {
        const memories = await strategy._querySpatialMemories(null);
        expect(memories).toEqual([]);
      });

      test('should limit results to 5', async () => {
        for (let i = 0; i < 10; i++) {
          strategy.knowledgeGraph.addSpatialMemory(`loc_${i}`, { x: i, y: 64, z: i }, 'plains');
        }

        const state = { position: { x: 5, y: 64, z: 5 } };
        const memories = await strategy._querySpatialMemories(state);

        expect(memories.length).toBeLessThanOrEqual(5);
      });
    });

    describe('_querySemanticMemories', () => {
      test('should find semantic memories by goal keywords', async () => {
        strategy.knowledgeGraph.addSemanticMemory('diamonds are found deep underground', 'fact', 0.9);
        strategy.knowledgeGraph.addSemanticMemory('iron ore spawns in caves', 'fact', 0.8);

        const memories = await strategy._querySemanticMemories('collect diamonds');

        expect(memories.length).toBeGreaterThan(0);
      });

      test('should return empty array if no goal', async () => {
        const memories = await strategy._querySemanticMemories(null);
        expect(memories).toEqual([]);
      });
    });

    describe('_extractKeywords', () => {
      test('should extract meaningful keywords', () => {
        const keywords = strategy._extractKeywords('collect 64 oak logs from the forest');

        expect(keywords).toContain('collect');
        expect(keywords).toContain('oak');
        expect(keywords).toContain('logs');
        expect(keywords).toContain('forest');
      });

      test('should filter stop words', () => {
        const keywords = strategy._extractKeywords('go to the cave and find the diamonds');

        expect(keywords).not.toContain('the');
        expect(keywords).not.toContain('to');
        expect(keywords).not.toContain('and');
      });

      test('should limit to 5 keywords', () => {
        const keywords = strategy._extractKeywords('collect wood stone iron diamonds gold emeralds coal');

        expect(keywords.length).toBeLessThanOrEqual(5);
      });

      test('should return empty array for null input', () => {
        const keywords = strategy._extractKeywords(null);
        expect(keywords).toEqual([]);
      });
    });

    describe('_storePlanOutcome', () => {
      test('should store successful plan in episodic memory', async () => {
        const plan = [
          { action: 'move_to', params: { target: 'forest' } },
          { action: 'collect_block', params: { target: 'oak_log', count: 10 } }
        ];
        const state = {
          position: { x: 100, y: 64, z: 100 }
        };

        await strategy._storePlanOutcome(plan, state, true);

        const memories = strategy.knowledgeGraph.getEpisodicMemories({});
        expect(memories.length).toBeGreaterThan(0);
        expect(memories[0].experience).toContain('Successfully completed plan');
      });

      test('should store failed plan with higher importance', async () => {
        const plan = [
          { action: 'move_to', params: { target: 'lava' } }
        ];
        const state = {
          position: { x: 50, y: 64, z: 50 }
        };

        await strategy._storePlanOutcome(plan, state, false);

        const memories = strategy.knowledgeGraph.getEpisodicMemories({});
        const failedMemory = memories.find(m => m.experience.includes('failed'));
        expect(failedMemory).toBeDefined();
        expect(failedMemory.importance).toBe(7);
      });

      test('should do nothing if plan is empty', async () => {
        await strategy._storePlanOutcome([], { position: { x: 0, y: 0, z: 0 } }, true);
        const memories = strategy.knowledgeGraph.getEpisodicMemories({});
        expect(memories.length).toBe(0);
      });

      test('should do nothing if state is null', async () => {
        await strategy._storePlanOutcome([{ action: 'test' }], null, true);
        const memories = strategy.knowledgeGraph.getEpisodicMemories({});
        expect(memories.length).toBe(0);
      });
    });
  });

  describe('buildPlanningContext', () => {
    test('should include graph data in context', async () => {
      strategy.knowledgeGraph.addSpatialMemory('test_location', { x: 50, y: 64, z: 50 }, 'forest');
      strategy.knowledgeGraph.addSemanticMemory('test fact about mining', 'fact', 0.9);

      const state = {
        position: { x: 50, y: 64, z: 50 },
        health: 20,
        food: 20,
        inventory: [{ name: 'dirt', count: 5 }],
        nearbyBlocks: [{ name: 'grass_block' }],
        entities: []
      };

      strategy.currentGoal = 'test goal';

      const context = await strategy.buildPlanningContext(state, 'test goal');

      expect(context).toContain('test goal');
      expect(context).toContain('Current State');
    });

    test('should handle missing graph data gracefully', async () => {
      const state = {
        position: { x: 0, y: 64, z: 0 },
        health: 20,
        food: 20,
        inventory: [],
        nearbyBlocks: [],
        entities: []
      };

      const context = await strategy.buildPlanningContext(state, 'test goal');

      expect(context).toContain('test goal');
      expect(context).toContain('Current State');
    });
  });

  describe('Plan Management', () => {
    test('should record action outcome', () => {
      strategy.recordAction('move_to', true);
      strategy.recordAction('collect_block', false, 'block not found');

      expect(strategy.actionHistory.length).toBe(2);
      expect(strategy.actionHistory[0].success).toBe(true);
      expect(strategy.actionHistory[1].success).toBe(false);
      expect(strategy.actionHistory[1].error).toBe('block not found');
    });

    test('should trim action history', () => {
      for (let i = 0; i < 15; i++) {
        strategy.recordAction(`action_${i}`, true);
      }

      expect(strategy.actionHistory.length).toBeLessThanOrEqual(15);
    });
  });

  describe('Metrics', () => {
    test('should return correct metrics', () => {
      strategy.currentGoal = 'test goal';
      strategy.currentPlan = [{ action: 'test' }];
      strategy.planCreatedAt = Date.now() - 1000;

      const metrics = strategy.getMetrics();

      expect(metrics.currentGoal).toBe('test goal');
      expect(metrics.planLength).toBe(1);
      expect(metrics.planAge).toBeGreaterThanOrEqual(1000);
      expect(metrics.replanAttempts).toBe(0);
    });

    test('should handle null plan in metrics', () => {
      strategy.currentPlan = null;

      const metrics = strategy.getMetrics();

      expect(metrics.planLength).toBe(0);
      expect(metrics.planAge).toBe(null);
    });
  });

  describe('Knowledge Graph Stats', () => {
    test('should be able to get graph stats', () => {
      strategy.knowledgeGraph.addEntity('test', 'test_type', { foo: 'bar' });

      const stats = strategy.knowledgeGraph.getStats();

      expect(stats.nodeCount).toBeGreaterThan(0);
      expect(stats.entitiesAdded).toBeGreaterThan(0);
    });
  });
});
