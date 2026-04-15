const OmnirouteClient = require('../../src/utils/omniroute');

jest.mock('axios', () => ({
  create: jest.fn(() => ({
    post: jest.fn(),
    get: jest.fn(),
  })),
}));

jest.mock('../../src/utils/rate-limiter', () => {
  return jest.fn().mockImplementation(() => ({
    schedule: jest.fn((fn) => fn()),
    stop: jest.fn(),
  }));
});

jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const axios = require('axios');

describe('OmnirouteClient', () => {
  let client;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new OmnirouteClient();
  });

  afterEach(async () => {
    if (client) {
      try {
        await client.stop();
      } catch (e) {}
      client = null;
    }
  });

  describe('constructor', () => {
    it('should create client with default config', () => {
      const c = new OmnirouteClient();
      expect(c).toBeDefined();
      expect(c.config.baseURL).toBe('http://127.0.0.1:20128/v1/chat/completions');
    });

    it('should merge custom config with defaults', () => {
      const c = new OmnirouteClient({ timeout: 5000, apiKey: 'test-key' });
      expect(c.config.timeout).toBe(5000);
      expect(c.config.apiKey).toBe('test-key');
      expect(c.config.baseURL).toBe('http://127.0.0.1:20128/v1/chat/completions');
    });

    it('should initialize metrics tracker', () => {
      expect(client.metrics).toBeDefined();
      expect(client.metrics.totalRequests).toBe(0);
    });

    it('should initialize rate limiter', () => {
      expect(client.rateLimiter).toBeDefined();
    });
  });

  describe('getModelId()', () => {
    it('should return model ID for pilot layer', () => {
      expect(client.getModelId('pilot')).toBe('nvidia/meta/llama-3.2-1b-instruct');
    });

    it('should return model ID for strategy layer', () => {
      expect(client.getModelId('strategy')).toBe('nvidia/qwen/qwen2.5-7b-instruct');
    });

    it('should return model ID for commander layer', () => {
      expect(client.getModelId('commander')).toBe('claude-sonnet-4.5');
    });

    it('should be case insensitive', () => {
      expect(client.getModelId('PILOT')).toBe('nvidia/meta/llama-3.2-1b-instruct');
      expect(client.getModelId('Strategy')).toBe('nvidia/qwen/qwen2.5-7b-instruct');
    });

    it('should throw error for unknown layer', () => {
      expect(() => client.getModelId('unknown')).toThrow('Unknown layer: unknown');
    });
  });

  describe('_normalizeMessages()', () => {
    it('should convert string to message array', () => {
      const result = client._normalizeMessages('Hello');
      expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
    });

    it('should pass through array of strings', () => {
      const result = client._normalizeMessages(['Hello', 'World']);
      expect(result).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'user', content: 'World' },
      ]);
    });

    it('should pass through array of message objects', () => {
      const input = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
      ];
      const result = client._normalizeMessages(input);
      expect(result).toEqual(input);
    });

    it('should convert mixed array of strings and objects', () => {
      const result = client._normalizeMessages(['Hello', { role: 'user', content: 'World' }]);
      expect(result).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'user', content: 'World' },
      ]);
    });

    it('should pass through single message object', () => {
      const msg = { role: 'user', content: 'Hello' };
      const result = client._normalizeMessages(msg);
      expect(result).toEqual([msg]);
    });

    it('should throw error for invalid messages format', () => {
      expect(() => client._normalizeMessages(null)).toThrow();
      expect(() => client._normalizeMessages(123)).toThrow();
    });
  });

  describe('_calculateBackoffDelay()', () => {
    it('should calculate exponential backoff with base delay', () => {
      expect(client._calculateBackoffDelay(0)).toBe(1000);
      expect(client._calculateBackoffDelay(1)).toBe(2000);
      expect(client._calculateBackoffDelay(2)).toBe(4000);
    });

    it('should cap delay at maxDelay', () => {
      expect(client._calculateBackoffDelay(10)).toBe(8000);
    });
  });

  describe('chat()', () => {
    it('should send chat request with default options', async () => {
      const mockResponse = { data: { choices: [{ message: { content: 'Test response' } }] } };
      client.client.post = jest.fn().mockResolvedValue(mockResponse);

      const result = await client.chat('Hello');

      expect(client.client.post).toHaveBeenCalledWith('/chat/completions', expect.objectContaining({
        model: 'nvidia/meta/llama-3.2-1b-instruct',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        max_tokens: 500,
        stream: false,
      }));
      expect(result).toEqual(mockResponse.data);
    });

    it('should use custom model ID when provided', async () => {
      client.client.post = jest.fn().mockResolvedValue({ data: {} });
      await client.chat('Hello', { model: 'custom/model-id' });

      expect(client.client.post).toHaveBeenCalledWith('/chat/completions', expect.objectContaining({
        model: 'custom/model-id',
      }));
    });

    it('should resolve layer names to model IDs', async () => {
      client.client.post = jest.fn().mockResolvedValue({ data: {} });
      await client.chat('Hello', { model: 'strategy' });

      expect(client.client.post).toHaveBeenCalledWith('/chat/completions', expect.objectContaining({
        model: 'nvidia/qwen/qwen2.5-7b-instruct',
      }));
    });

    it('should pass custom options', async () => {
      client.client.post = jest.fn().mockResolvedValue({ data: {} });
      await client.chat('Hello', { temperature: 0.9, maxTokens: 1000 });

      expect(client.client.post).toHaveBeenCalledWith('/chat/completions', expect.objectContaining({
        temperature: 0.9,
        max_tokens: 1000,
      }));
    });

    it('should handle string messages', async () => {
      client.client.post = jest.fn().mockResolvedValue({ data: {} });
      await client.chat('test message');

      expect(client.client.post).toHaveBeenCalledWith('/chat/completions', expect.objectContaining({
        messages: [{ role: 'user', content: 'test message' }],
      }));
    });

    it('should handle array messages', async () => {
      client.client.post = jest.fn().mockResolvedValue({ data: {} });
      const messages = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
      ];
      await client.chat(messages);

      expect(client.client.post).toHaveBeenCalledWith('/chat/completions', expect.objectContaining({
        messages: messages,
      }));
    });
  });

  describe('healthCheck()', () => {
    it('should return healthy status on success', async () => {
      client.client.get = jest.fn().mockResolvedValue({ data: { limit: 560, remaining: 448 } });

      const result = await client.healthCheck();

      expect(result.ok).toBe(true);
      expect(result.status).toBe('healthy');
      expect(result.data).toEqual({ limit: 560, remaining: 448 });
    });

    it('should return unhealthy status on failure', async () => {
      client.client.get = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const result = await client.healthCheck();

      expect(result.ok).toBe(false);
      expect(result.status).toBe('unhealthy');
    });

    it('should cache health status', async () => {
      client.client.get = jest.fn().mockResolvedValue({ data: { ok: true } });

      await client.healthCheck();
      const cached = client.getHealthStatus();

      expect(cached.ok).toBe(true);
    });
  });

  describe('getMetrics()', () => {
    it('should return initial metrics', () => {
      const stats = client.getMetrics();

      expect(stats).toEqual(expect.objectContaining({
        total: 0,
        successful: 0,
        failed: 0,
        retried: 0,
        successRate: '0%',
        avgLatencyMs: 0,
      }));
    });
  });

  describe('resetMetrics()', () => {
    it('should reset metrics counters', () => {
      client.resetMetrics();
      const stats = client.getMetrics();

      expect(stats.total).toBe(0);
      expect(stats.successful).toBe(0);
    });
  });

  describe('convenience methods', () => {
    it('pilot() should call chat with pilot model', async () => {
      client.client.post = jest.fn().mockResolvedValue({ data: {} });
      await client.pilot('Hello');
      expect(client.client.post).toHaveBeenCalledWith('/chat/completions', expect.objectContaining({
        model: 'nvidia/meta/llama-3.2-1b-instruct',
      }));
    });

    it('strategy() should call chat with strategy model', async () => {
      client.client.post = jest.fn().mockResolvedValue({ data: {} });
      await client.strategy('Plan something');
      expect(client.client.post).toHaveBeenCalledWith('/chat/completions', expect.objectContaining({
        model: 'nvidia/qwen/qwen2.5-7b-instruct',
      }));
    });

    it('commander() should call chat with commander model', async () => {
      client.client.post = jest.fn().mockResolvedValue({ data: {} });
      await client.commander('Set goal');
      expect(client.client.post).toHaveBeenCalledWith('/chat/completions', expect.objectContaining({
        model: 'claude-sonnet-4.5',
      }));
    });
  });

  describe('stop()', () => {
    it('should stop the rate limiter', async () => {
      await client.stop();
      expect(client.rateLimiter.stop).toHaveBeenCalled();
    });
  });
});

describe('MetricsTracker', () => {
  let tracker;

  beforeEach(() => {
    tracker = new OmnirouteClient.MetricsTracker();
  });

  describe('reset()', () => {
    it('should reset all metrics', () => {
      tracker.recordRequest('pilot', 100, true);
      tracker.reset();

      expect(tracker.totalRequests).toBe(0);
      expect(tracker.successfulRequests).toBe(0);
    });
  });

  describe('recordRequest()', () => {
    it('should record successful request', () => {
      tracker.recordRequest('llama-3.2', 210, true);

      expect(tracker.totalRequests).toBe(1);
      expect(tracker.successfulRequests).toBe(1);
      expect(tracker.failedRequests).toBe(0);
      expect(tracker.totalLatency).toBe(210);
    });

    it('should record failed request', () => {
      tracker.recordRequest('pilot', 150, false);

      expect(tracker.totalRequests).toBe(1);
      expect(tracker.successfulRequests).toBe(0);
      expect(tracker.failedRequests).toBe(1);
    });

    it('should record retried request', () => {
      tracker.recordRequest('qwen', 300, true, true);

      expect(tracker.retriedRequests).toBe(1);
    });

    it('should track model-specific metrics', () => {
      tracker.recordRequest('llama-3.2', 200, true);
      tracker.recordRequest('qwen', 400, false);

      const stats = tracker.getStats();
      expect(stats.byModel.pilot.requests).toBe(1);
      expect(stats.byModel.strategy.failures).toBe(1);
    });
  });

  describe('_getModelKey()', () => {
    it('should identify pilot models', () => {
      expect(tracker._getModelKey('llama-3.2-1b')).toBe('pilot');
      expect(tracker._getModelKey('pilot')).toBe('pilot');
      expect(tracker._getModelKey('nvidia/meta/llama-3.2-1b-instruct')).toBe('pilot');
    });

    it('should identify strategy models', () => {
      expect(tracker._getModelKey('qwen-2.5')).toBe('strategy');
      expect(tracker._getModelKey('strategy')).toBe('strategy');
      expect(tracker._getModelKey('nvidia/qwen/qwen2.5-7b-instruct')).toBe('strategy');
    });

    it('should identify commander models', () => {
      expect(tracker._getModelKey('claude-sonnet')).toBe('commander');
      expect(tracker._getModelKey('commander')).toBe('commander');
      expect(tracker._getModelKey('claude-sonnet-4.5')).toBe('commander');
    });

    it('should return null for unknown models', () => {
      expect(tracker._getModelKey('unknown-model')).toBeNull();
      expect(tracker._getModelKey(null)).toBeNull();
    });
  });

  describe('getStats()', () => {
    it('should return formatted stats', () => {
      tracker.recordRequest('pilot', 200, true);
      tracker.recordRequest('pilot', 200, false);

      const stats = tracker.getStats();

      expect(stats.total).toBe(2);
      expect(stats.successful).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.avgLatencyMs).toBe(200);
      expect(stats.successRate).toBe('50.0%');
    });

    it('should calculate per-model stats', () => {
      tracker.recordRequest('llama-3.2', 200, true);
      tracker.recordRequest('qwen', 400, true);
      tracker.recordRequest('claude', 1000, false);

      const stats = tracker.getStats();

      expect(stats.byModel.pilot.requests).toBe(1);
      expect(stats.byModel.pilot.failureRate).toBe('0.0%');
      expect(stats.byModel.commander.failureRate).toBe('100.0%');
    });
  });

  describe('_formatModelStats()', () => {
    it('should calculate average latency', () => {
      tracker.recordRequest('pilot', 100, true);
      tracker.recordRequest('pilot', 200, true);

      const stats = tracker.getStats();

      expect(stats.byModel.pilot.avgLatencyMs).toBe(150);
    });

    it('should handle zero requests', () => {
      const stats = tracker.getStats();

      expect(stats.byModel.pilot.avgLatencyMs).toBe(0);
      expect(stats.byModel.pilot.failureRate).toBe('0%');
    });
  });
});

describe('MODELS export', () => {
  it('should export model configurations', () => {
    const models = OmnirouteClient.MODELS;

    expect(models.pilot).toEqual(expect.objectContaining({
      id: 'nvidia/meta/llama-3.2-1b-instruct',
      name: 'Pilot',
      latencyTarget: 210,
    }));
    expect(models.strategy).toEqual(expect.objectContaining({
      id: 'nvidia/qwen/qwen2.5-7b-instruct',
      name: 'Strategy',
      latencyTarget: 410,
    }));
    expect(models.commander).toEqual(expect.objectContaining({
      id: 'claude-sonnet-4.5',
      name: 'Commander',
      latencyTarget: 1000,
    }));
  });
});