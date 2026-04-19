const ReflectionModule = require('../../../src/learning/reflection-module');

describe('ReflectionModule', () => {
  let mockActionAwareness;
  let mockKnowledgeGraph;
  let mockStrategyMemory;
  let reflectionModule;

  beforeEach(() => {
    mockActionAwareness = {
      getSuccessRate: jest.fn(() => 0.85),
      getRecentFailures: jest.fn(() => [])
    };

    mockKnowledgeGraph = {
      addSemanticMemory: jest.fn()
    };

    mockStrategyMemory = {
      storeStrategy: jest.fn(() => true)
    };
  });

  describe('constructor', () => {
    it('should initialize with required dependencies', () => {
      reflectionModule = new ReflectionModule(mockActionAwareness, mockKnowledgeGraph);
      
      expect(reflectionModule.actionAwareness).toBe(mockActionAwareness);
      expect(reflectionModule.knowledgeGraph).toBe(mockKnowledgeGraph);
      expect(reflectionModule.strategyMemory).toBeNull();
      expect(reflectionModule.reflectionHistory).toEqual([]);
      expect(reflectionModule.maxHistory).toBe(48);
    });

    it('should accept optional strategyMemory parameter', () => {
      reflectionModule = new ReflectionModule(mockActionAwareness, mockKnowledgeGraph, mockStrategyMemory);
      
      expect(reflectionModule.strategyMemory).toBe(mockStrategyMemory);
    });
  });

  describe('reflect', () => {
    it('should perform reflection and return results', () => {
      reflectionModule = new ReflectionModule(mockActionAwareness, mockKnowledgeGraph);
      
      const result = reflectionModule.reflect();
      
      expect(result).toHaveProperty('period');
      expect(result).toHaveProperty('successRate', 0.85);
      expect(result).toHaveProperty('patterns');
      expect(result).toHaveProperty('learnings');
      expect(result).toHaveProperty('adjustments');
      expect(result).toHaveProperty('timestamp');
    });

    it('should store reflection in knowledge graph', () => {
      reflectionModule = new ReflectionModule(mockActionAwareness, mockKnowledgeGraph);
      
      reflectionModule.reflect();
      
      expect(mockKnowledgeGraph.addSemanticMemory).toHaveBeenCalledWith(
        expect.stringMatching(/^reflection_\d+$/),
        'performance_analysis',
        expect.objectContaining({
          successRate: 0.85,
          patterns: expect.any(Array),
          learnings: expect.any(Array)
        })
      );
    });

    it('should not store strategies when strategyMemory is null', () => {
      reflectionModule = new ReflectionModule(mockActionAwareness, mockKnowledgeGraph, null);
      
      reflectionModule.reflect();
      
      // Should not throw error
      expect(mockStrategyMemory.storeStrategy).not.toHaveBeenCalled();
    });

    it('should store success strategy when successRate >= 0.7', () => {
      mockActionAwareness.getSuccessRate.mockReturnValue(0.85);
      reflectionModule = new ReflectionModule(mockActionAwareness, mockKnowledgeGraph, mockStrategyMemory);
      
      reflectionModule.reflect();
      
      expect(mockStrategyMemory.storeStrategy).toHaveBeenCalledWith(
        expect.stringMatching(/^reflection_success_\d+$/),
        'Success rate: 0.85',
        expect.any(Array),
        'Successful reflection period',
        0.85,
        expect.objectContaining({
          reflectionId: expect.stringMatching(/^reflection_\d+$/),
          period: expect.any(Object)
        })
      );
    });

    it('should not store success strategy when successRate < 0.7', () => {
      mockActionAwareness.getSuccessRate.mockReturnValue(0.65);
      reflectionModule = new ReflectionModule(mockActionAwareness, mockKnowledgeGraph, mockStrategyMemory);
      
      reflectionModule.reflect();
      
      const successCalls = mockStrategyMemory.storeStrategy.mock.calls.filter(
        call => call[0].includes('success')
      );
      expect(successCalls).toHaveLength(0);
    });

    it('should store failure strategies for detected patterns', () => {
      mockActionAwareness.getRecentFailures.mockReturnValue([
        { action: { type: 'dig' } },
        { action: { type: 'dig' } },
        { action: { type: 'dig' } }
      ]);
      reflectionModule = new ReflectionModule(mockActionAwareness, mockKnowledgeGraph, mockStrategyMemory);
      
      reflectionModule.reflect();
      
      expect(mockStrategyMemory.storeStrategy).toHaveBeenCalledWith(
        expect.stringMatching(/^reflection_failure_dig_\d+$/),
        'Failure pattern: dig (count: 3)',
        ['Avoid dig in similar contexts'],
        'Failed 3 times',
        0.0,
        expect.objectContaining({
          reflectionId: expect.stringMatching(/^reflection_\d+$/),
          pattern: { type: 'dig', count: 3, severity: 'high' },
          period: expect.any(Object)
        })
      );
    });

    it('should store multiple failure strategies for multiple patterns', () => {
      mockActionAwareness.getRecentFailures.mockReturnValue([
        { action: { type: 'dig' } },
        { action: { type: 'dig' } },
        { action: { type: 'move' } },
        { action: { type: 'move' } }
      ]);
      reflectionModule = new ReflectionModule(mockActionAwareness, mockKnowledgeGraph, mockStrategyMemory);
      
      reflectionModule.reflect();
      
      const failureCalls = mockStrategyMemory.storeStrategy.mock.calls.filter(
        call => call[0].includes('failure')
      );
      expect(failureCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('should update reflection history', () => {
      reflectionModule = new ReflectionModule(mockActionAwareness, mockKnowledgeGraph);
      
      reflectionModule.reflect();
      
      expect(reflectionModule.reflectionHistory).toHaveLength(1);
      expect(reflectionModule.reflectionHistory[0]).toHaveProperty('successRate', 0.85);
    });

    it('should limit reflection history to maxHistory', () => {
      reflectionModule = new ReflectionModule(mockActionAwareness, mockKnowledgeGraph);
      reflectionModule.maxHistory = 3;
      
      for (let i = 0; i < 5; i++) {
        reflectionModule.reflect();
      }
      
      expect(reflectionModule.reflectionHistory).toHaveLength(3);
    });
  });

  describe('_analyzePatterns', () => {
    beforeEach(() => {
      reflectionModule = new ReflectionModule(mockActionAwareness, mockKnowledgeGraph);
    });

    it('should detect high severity patterns (count >= 3)', () => {
      const failures = [
        { action: { type: 'dig' } },
        { action: { type: 'dig' } },
        { action: { type: 'dig' } }
      ];
      
      const patterns = reflectionModule._analyzePatterns(failures);
      
      expect(patterns).toContainEqual({ type: 'dig', count: 3, severity: 'high' });
    });

    it('should detect medium severity patterns (count >= 2)', () => {
      const failures = [
        { action: { type: 'move' } },
        { action: { type: 'move' } }
      ];
      
      const patterns = reflectionModule._analyzePatterns(failures);
      
      expect(patterns).toContainEqual({ type: 'move', count: 2, severity: 'medium' });
    });

    it('should ignore single failures', () => {
      const failures = [
        { action: { type: 'craft' } }
      ];
      
      const patterns = reflectionModule._analyzePatterns(failures);
      
      expect(patterns).toHaveLength(0);
    });

    it('should handle failures without action type', () => {
      const failures = [
        { action: null },
        { action: { type: 'dig' } },
        { action: { type: 'dig' } }
      ];
      
      const patterns = reflectionModule._analyzePatterns(failures);
      
      expect(patterns).toContainEqual({ type: 'dig', count: 2, severity: 'medium' });
    });
  });

  describe('_generateLearnings', () => {
    beforeEach(() => {
      reflectionModule = new ReflectionModule(mockActionAwareness, mockKnowledgeGraph);
    });

    it('should generate learning for low success rate', () => {
      const learnings = reflectionModule._generateLearnings(0.65, []);
      
      expect(learnings).toContain('Success rate below target - investigate failure causes');
    });

    it('should generate critical learning for very low success rate', () => {
      const learnings = reflectionModule._generateLearnings(0.45, []);
      
      expect(learnings).toContain('Critical: success rate dangerously low - immediate intervention needed');
    });

    it('should generate learnings for patterns', () => {
      const patterns = [{ type: 'dig', count: 3, severity: 'high' }];
      const learnings = reflectionModule._generateLearnings(0.85, patterns);
      
      expect(learnings).toContain('dig actions failing frequently (3 times) - check conditions');
    });
  });

  describe('_suggestAdjustments', () => {
    beforeEach(() => {
      reflectionModule = new ReflectionModule(mockActionAwareness, mockKnowledgeGraph);
    });

    it('should suggest confidence threshold increase for low success rate', () => {
      const adjustments = reflectionModule._suggestAdjustments(0.65, []);
      
      expect(adjustments).toContain('Increase confidence threshold for actions');
    });

    it('should suggest human intervention for very low success rate', () => {
      const adjustments = reflectionModule._suggestAdjustments(0.45, []);
      
      expect(adjustments).toContain('Pause autonomous actions and request human intervention');
    });

    it('should suggest pathfinding check for move failures', () => {
      const patterns = [{ type: 'move', count: 3, severity: 'high' }];
      const adjustments = reflectionModule._suggestAdjustments(0.85, patterns);
      
      expect(adjustments).toContain('Check pathfinding - may need obstacle avoidance');
    });

    it('should suggest tool verification for dig failures', () => {
      const patterns = [{ type: 'dig', count: 3, severity: 'high' }];
      const adjustments = reflectionModule._suggestAdjustments(0.85, patterns);
      
      expect(adjustments).toContain('Verify tool selection before digging');
    });

    it('should suggest material verification for craft failures', () => {
      const patterns = [{ type: 'craft', count: 2, severity: 'medium' }];
      const adjustments = reflectionModule._suggestAdjustments(0.85, patterns);
      
      expect(adjustments).toContain('Verify materials available before crafting');
    });
  });

  describe('getHistory', () => {
    beforeEach(() => {
      reflectionModule = new ReflectionModule(mockActionAwareness, mockKnowledgeGraph);
    });

    it('should return recent reflections with default limit', () => {
      for (let i = 0; i < 15; i++) {
        reflectionModule.reflect();
      }
      
      const history = reflectionModule.getHistory();
      
      expect(history).toHaveLength(10);
    });

    it('should return recent reflections with custom limit', () => {
      for (let i = 0; i < 10; i++) {
        reflectionModule.reflect();
      }
      
      const history = reflectionModule.getHistory(5);
      
      expect(history).toHaveLength(5);
    });
  });

  describe('getAverageSuccessRate', () => {
    beforeEach(() => {
      reflectionModule = new ReflectionModule(mockActionAwareness, mockKnowledgeGraph);
    });

    it('should return 1.0 when no reflections', () => {
      const avg = reflectionModule.getAverageSuccessRate();
      
      expect(avg).toBe(1.0);
    });

    it('should calculate average success rate', () => {
      mockActionAwareness.getSuccessRate
        .mockReturnValueOnce(0.8)
        .mockReturnValueOnce(0.9)
        .mockReturnValueOnce(0.7);
      
      reflectionModule.reflect();
      reflectionModule.reflect();
      reflectionModule.reflect();
      
      const avg = reflectionModule.getAverageSuccessRate(3);
      
      expect(avg).toBeCloseTo(0.8, 1);
    });

    it('should use default count of 5', () => {
      for (let i = 0; i < 10; i++) {
        reflectionModule.reflect();
      }
      
      const avg = reflectionModule.getAverageSuccessRate();
      
      expect(avg).toBeGreaterThan(0);
      expect(avg).toBeLessThanOrEqual(1);
    });
  });
});
