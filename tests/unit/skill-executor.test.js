const SkillExecutor = require('../../src/skills/skill-executor');

describe('SkillExecutor', () => {
  let executor;
  let mockRegistry;

  beforeEach(() => {
    mockRegistry = {
      execute: jest.fn()
    };
    executor = new SkillExecutor(mockRegistry);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    test('executes skill successfully on first attempt', async () => {
      mockRegistry.execute.mockResolvedValue({ success: true, outcome: { moved: true } });

      const result = await executor.execute('move', { direction: 'forward' }, {});

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(1);
      expect(result.outcome).toEqual({ moved: true });
      expect(mockRegistry.execute).toHaveBeenCalledTimes(1);
      expect(mockRegistry.execute).toHaveBeenCalledWith('move', { direction: 'forward' }, {});
    });

    test('retries failed skill up to 3 times with exponential backoff', async () => {
      mockRegistry.execute.mockResolvedValue({ success: false, error: 'blocked' });

      const startTime = Date.now();
      const result = await executor.execute('move', { direction: 'forward' }, {});
      const duration = Date.now() - startTime;

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
      expect(result.error).toBe('blocked');
      expect(mockRegistry.execute).toHaveBeenCalledTimes(3);
      
      // Verify exponential backoff delays (1000ms + 2000ms = 3000ms minimum)
      expect(duration).toBeGreaterThanOrEqual(2900); // Allow 100ms tolerance
    });

    test('succeeds on second attempt after initial failure', async () => {
      mockRegistry.execute
        .mockResolvedValueOnce({ success: false, error: 'temporary failure' })
        .mockResolvedValueOnce({ success: true, outcome: { moved: true } });

      const result = await executor.execute('move', { direction: 'forward' }, {});

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      expect(mockRegistry.execute).toHaveBeenCalledTimes(2);
    });

    test('skips retry for low confidence (< 0.3)', async () => {
      mockRegistry.execute.mockResolvedValue({ success: false, error: 'blocked' });

      const result = await executor.execute('move', {}, { confidence: 0.2 });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
      expect(mockRegistry.execute).toHaveBeenCalledTimes(1);
    });

    test('retries when confidence >= 0.3', async () => {
      mockRegistry.execute.mockResolvedValue({ success: false, error: 'blocked' });

      const result = await executor.execute('move', {}, { confidence: 0.5 });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
      expect(mockRegistry.execute).toHaveBeenCalledTimes(3);
    });

    test('does not use confidence filtering when disabled', async () => {
      mockRegistry.execute.mockResolvedValue({ success: false, error: 'blocked' });

      const result = await executor.execute('move', {}, { confidence: 0.1 }, { useConfidence: false });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
      expect(mockRegistry.execute).toHaveBeenCalledTimes(3);
    });

    test('handles missing confidence gracefully', async () => {
      mockRegistry.execute.mockResolvedValue({ success: false, error: 'blocked' });

      const result = await executor.execute('move', {}, {});

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
      expect(mockRegistry.execute).toHaveBeenCalledTimes(3);
    });

    test('respects custom maxRetries option', async () => {
      mockRegistry.execute.mockResolvedValue({ success: false, error: 'blocked' });

      const result = await executor.execute('move', {}, {}, { maxRetries: 5 });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(5);
      expect(mockRegistry.execute).toHaveBeenCalledTimes(5);
    }, 20000);

    test('respects custom baseDelay option', async () => {
      mockRegistry.execute.mockResolvedValue({ success: false, error: 'blocked' });

      const startTime = Date.now();
      await executor.execute('move', {}, {}, { baseDelay: 500 });
      const duration = Date.now() - startTime;

      // With baseDelay 500: 500ms + 1000ms = 1500ms minimum
      expect(duration).toBeGreaterThanOrEqual(1400);
    });

    test('handles exceptions from registry', async () => {
      mockRegistry.execute.mockRejectedValue(new Error('Network error'));

      const result = await executor.execute('move', {}, {});

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
      expect(result.error).toBe('Network error');
      expect(mockRegistry.execute).toHaveBeenCalledTimes(3);
    });

    test('returns duration in result', async () => {
      mockRegistry.execute.mockResolvedValue({ success: true, outcome: { moved: true } });

      const result = await executor.execute('move', {}, {});

      expect(result.duration).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getMetrics', () => {
    test('returns empty metrics initially', () => {
      const metrics = executor.getMetrics();

      expect(metrics.totalAttempts).toBe(0);
      expect(metrics.totalSuccesses).toBe(0);
      expect(metrics.totalFailures).toBe(0);
      expect(metrics.successRate).toBe(0);
      expect(Object.keys(metrics.skillMetrics)).toHaveLength(0);
    });

    test('tracks metrics correctly for successful execution', async () => {
      mockRegistry.execute.mockResolvedValue({ success: true });

      await executor.execute('move', {}, {});

      const metrics = executor.getMetrics();

      expect(metrics.totalAttempts).toBe(1);
      expect(metrics.totalSuccesses).toBe(1);
      expect(metrics.totalFailures).toBe(0);
      expect(metrics.successRate).toBe(1);
    });

    test('tracks metrics correctly for failed execution', async () => {
      mockRegistry.execute.mockResolvedValue({ success: false, error: 'failed' });

      await executor.execute('move', {}, {});

      const metrics = executor.getMetrics();

      expect(metrics.totalAttempts).toBe(3);
      expect(metrics.totalSuccesses).toBe(0);
      expect(metrics.totalFailures).toBe(1);
      expect(metrics.successRate).toBe(0);
    });

    test('tracks per-skill metrics', async () => {
      mockRegistry.execute
        .mockResolvedValueOnce({ success: true });

      await executor.execute('move', {}, {});

      mockRegistry.execute.mockResolvedValue({ success: false, error: 'failed' });

      await executor.execute('dig', {}, {});

      const metrics = executor.getMetrics();

      expect(metrics.skillMetrics['move']).toBeDefined();
      expect(metrics.skillMetrics['move'].attempts).toBe(1);
      expect(metrics.skillMetrics['move'].successes).toBe(1);
      expect(metrics.skillMetrics['move'].successRate).toBe(1);

      expect(metrics.skillMetrics['dig']).toBeDefined();
      expect(metrics.skillMetrics['dig'].attempts).toBe(1);
      expect(metrics.skillMetrics['dig'].failures).toBe(1);
      expect(metrics.skillMetrics['dig'].successRate).toBe(0);
      
      expect(metrics.totalAttempts).toBe(4);
    });

    test('calculates avgDuration correctly', async () => {
      mockRegistry.execute.mockResolvedValue({ success: true });

      await executor.execute('move', {}, {});

      const metrics = executor.getMetrics();

      expect(metrics.skillMetrics['move'].avgDuration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('resetMetrics', () => {
    test('resets all metrics to initial state', async () => {
      mockRegistry.execute.mockResolvedValue({ success: true });
      await executor.execute('move', {}, {});

      executor.resetMetrics();
      const metrics = executor.getMetrics();

      expect(metrics.totalAttempts).toBe(0);
      expect(metrics.totalSuccesses).toBe(0);
      expect(metrics.totalFailures).toBe(0);
      expect(metrics.successRate).toBe(0);
      expect(Object.keys(metrics.skillMetrics)).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    test('handles registry returning no error message', async () => {
      mockRegistry.execute.mockResolvedValue({ success: false });

      const result = await executor.execute('move', {}, {}, { maxRetries: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Skill execution failed');
    });

    test('handles null/undefined result from registry', async () => {
      mockRegistry.execute.mockResolvedValue(null);

      const result = await executor.execute('move', {}, {}, { maxRetries: 1 });

      expect(result.success).toBe(false);
    });

    test('works with complex params and context', async () => {
      mockRegistry.execute.mockResolvedValue({ success: true });

      const params = { direction: 'forward', distance: 10, speed: 'fast' };
      const context = { 
        bot: { position: { x: 0, y: 64, z: 0 } },
        confidence: 0.8,
        previousActions: []
      };

      const result = await executor.execute('move', params, context);

      expect(result.success).toBe(true);
      expect(mockRegistry.execute).toHaveBeenCalledWith('move', params, context);
    });
  });
});
