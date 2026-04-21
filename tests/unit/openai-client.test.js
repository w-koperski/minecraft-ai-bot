/**
 * OpenAI Client Tests
 * Tests for the OpenAI-compatible API client used by companion features
 */

// Mock external dependencies
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    post: jest.fn(),
    get: jest.fn(),
  })),
}));

jest.mock('bottleneck', () => {
  return jest.fn().mockImplementation(() => ({
    wrap: jest.fn((fn) => fn),
    stop: jest.fn(),
    schedule: jest.fn((fn) => fn()),
    on: jest.fn(),
    updateSettings: jest.fn(),
  }));
});

jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('OpenAIClient', () => {
  let OpenAIClient;
  let client;

  beforeEach(() => {
    jest.resetModules();
    OpenAIClient = require('../../src/utils/openai-client');
    client = new OpenAIClient();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create client with default config', () => {
      const c = new OpenAIClient();
      expect(c).toBeDefined();
      expect(c.config.baseURL).toBeDefined();
    });

    it('should merge custom config with defaults', () => {
      const c = new OpenAIClient({ timeout: 5000, apiKey: 'test-key' });
      expect(c.config.timeout).toBe(5000);
      expect(c.config.apiKey).toBe('test-key');
    });
  });

  describe('chat()', () => {
    it('should send chat request with string message', async () => {
      // Mock axios post to return a valid response
      client.client.post = jest.fn().mockResolvedValue({
        data: {
          choices: [{
            message: {
              content: 'Hello!',
              role: 'assistant',
            },
            finish_reason: 'stop',
          }],
          model: 'gpt-3.5-turbo',
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
      });

      const result = await client.chat('Hello');

      expect(result).toBeDefined();
      expect(result.content).toBe('Hello!');
      expect(result.role).toBe('assistant');
      expect(client.client.post).toHaveBeenCalled();
    });

    it('should send chat request with layer parameter', async () => {
      client.client.post = jest.fn().mockResolvedValue({
        data: {
          choices: [{
            message: {
              content: 'Response',
              role: 'assistant',
            },
            finish_reason: 'stop',
          }],
          model: 'custom-model',
        },
      });

      const result = await client.chat('Test message', 'strategy', { model: 'custom-model' });

      expect(result).toBeDefined();
      expect(result.content).toBe('Response');
      expect(client.client.post).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({
          model: 'custom-model',
          messages: [{ role: 'user', content: 'Test message' }],
        })
      );
    });

    it('should handle streaming responses', async () => {
      // Test streaming option is passed correctly
      client.client.post = jest.fn().mockResolvedValue({
        data: {
          choices: [{
            message: {
              content: 'Streaming response',
              role: 'assistant',
            },
            finish_reason: 'stop',
          }],
        },
      });

      const result = await client.chat('Test', 'pilot', { stream: true });

      expect(result).toBeDefined();
      expect(client.client.post).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({ stream: true })
      );
    });

    it('should handle array messages', async () => {
      client.client.post = jest.fn().mockResolvedValue({
        data: {
          choices: [{
            message: {
              content: 'Response with context',
              role: 'assistant',
            },
            finish_reason: 'stop',
          }],
        },
      });

      const messages = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' },
      ];
      const result = await client.chat(messages);

      expect(result).toBeDefined();
      expect(client.client.post).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({
          messages: messages,
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle rate limit errors', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.response = { status: 429 };
      rateLimitError.code = 'ERR_BAD_REQUEST';

      client.client.post = jest.fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({
          data: {
            choices: [{
              message: { content: 'Success after retry', role: 'assistant' },
              finish_reason: 'stop',
            }],
          },
        });

      const result = await client.chat('Test message');

      expect(result).toBeDefined();
      expect(result.content).toBe('Success after retry');
    });

    it('should handle API errors gracefully', async () => {
      const originalExecuteWithRetry = client._executeWithRetry.bind(client);
      client._executeWithRetry = jest.fn(async (requestFn) => {
        try {
          return await requestFn();
        } catch (error) {
          throw error;
        }
      });

      client.client.post = jest.fn().mockRejectedValue(new Error('API validation failed'));

      await expect(client.chat('test')).rejects.toThrow('API validation failed');
    });
  });

  describe('healthCheck()', () => {
    it('should return healthy status on success', async () => {
      client.client.get = jest.fn().mockResolvedValue({ data: { status: 'ok' } });

      const result = await client.healthCheck();

      expect(result.ok).toBe(true);
    });

    it('should return unhealthy status on failure', async () => {
      client.client.get = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const result = await client.healthCheck();

      expect(result.ok).toBe(false);
    });
  });

  describe('metrics', () => {
    it('should track metrics', () => {
      expect(client.metrics).toBeDefined();
      expect(client.getMetrics()).toBeDefined();
    });

    it('should reset metrics', () => {
      client.resetMetrics();
      const metrics = client.getMetrics();
      expect(metrics.total).toBe(0);
    });
  });
});
