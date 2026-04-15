/**
 * Omniroute API Client for Minecraft AI Bot
 * Handles communication with Omniroute LLM gateway with rate limiting,
 * retry logic, exponential backoff, and metrics tracking.
 */

const axios = require('axios');
const RateLimiter = require('./rate-limiter');
const logger = require('./logger');

// Model configurations
const MODELS = {
  pilot: {
    id: 'nvidia/meta/llama-3.2-1b-instruct',
    name: 'Pilot',
    latencyTarget: 210,
  },
  strategy: {
    id: 'nvidia/qwen/qwen2.5-7b-instruct',
    name: 'Strategy',
    latencyTarget: 410,
  },
  commander: {
    id: 'claude-sonnet-4.5',
    name: 'Commander',
    latencyTarget: 1000,
  },
};

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1s
  maxDelay: 8000,
  backoffMultiplier: 2,
};

// Default client configuration
const DEFAULT_CONFIG = {
  baseURL: process.env.OMNIROUTE_URL || 'http://127.0.0.1:20128/v1/chat/completions',
  apiKey: process.env.OMNIROUTE_API_KEY || 'local',
  timeout: 30000,
  maxConcurrent: 10,
};

/**
 * Metrics tracker for API calls
 */
class MetricsTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.retriedRequests = 0;
    this.totalLatency = 0;
    this.lastRequestTime = null;
    this.lastSuccessTime = null;
    this.lastFailureTime = null;
    this.modelMetrics = {
      pilot: { requests: 0, failures: 0, totalLatency: 0 },
      strategy: { requests: 0, failures: 0, totalLatency: 0 },
      commander: { requests: 0, failures: 0, totalLatency: 0 },
    };
  }

  recordRequest(model, latency, success, retried = false) {
    this.totalRequests++;
    this.lastRequestTime = Date.now();

    if (success) {
      this.successfulRequests++;
      this.lastSuccessTime = Date.now();
    } else {
      this.failedRequests++;
      this.lastFailureTime = Date.now();
    }

    if (retried) {
      this.retriedRequests++;
    }

    this.totalLatency += latency;

    const modelKey = this._getModelKey(model);
    if (modelKey && this.modelMetrics[modelKey]) {
      this.modelMetrics[modelKey].requests++;
      this.modelMetrics[modelKey].totalLatency += latency;
      if (!success) {
        this.modelMetrics[modelKey].failures++;
      }
    }
  }

  _getModelKey(model) {
    if (!model) return null;
    const modelStr = model.toLowerCase();
    if (modelStr.includes('llama') || modelStr.includes('pilot')) return 'pilot';
    if (modelStr.includes('qwen') || modelStr.includes('strategy')) return 'strategy';
    if (modelStr.includes('claude') || modelStr.includes('commander')) return 'commander';
    return null;
  }

  getStats() {
    const avgLatency = this.totalRequests > 0 ? this.totalLatency / this.totalRequests : 0;
    return {
      total: this.totalRequests,
      successful: this.successfulRequests,
      failed: this.failedRequests,
      retried: this.retriedRequests,
      avgLatencyMs: Math.round(avgLatency),
      successRate: this.totalRequests > 0
        ? ((this.successfulRequests / this.totalRequests) * 100).toFixed(1) + '%'
        : '0%',
      byModel: {
        pilot: this._formatModelStats(this.modelMetrics.pilot),
        strategy: this._formatModelStats(this.modelMetrics.strategy),
        commander: this._formatModelStats(this.modelMetrics.commander),
      },
    };
  }

  _formatModelStats(stats) {
    const avgLatency = stats.requests > 0 ? stats.totalLatency / stats.requests : 0;
    return {
      requests: stats.requests,
      failures: stats.failures,
      avgLatencyMs: Math.round(avgLatency),
      failureRate: stats.requests > 0
        ? ((stats.failures / stats.requests) * 100).toFixed(1) + '%'
        : '0%',
    };
  }
}

/**
 * Omniroute API Client
 */
class OmnirouteClient {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = new MetricsTracker();
    this.rateLimiter = new RateLimiter({
      reservoir: 448,
      reservoirRefreshAmount: 448,
      reservoirRefreshInterval: 60000,
      maxConcurrent: this.config.maxConcurrent,
      minTime: 133,
    });

    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
    });

    this.healthStatus = null;
    this.healthLastCheck = null;
  }

  /**
   * Get model ID by layer name
   * @param {string} layer - 'pilot', 'strategy', or 'commander'
   * @returns {string} Model ID
   */
  getModelId(layer) {
    const model = MODELS[layer?.toLowerCase()];
    if (!model) {
      throw new Error(`Unknown layer: ${layer}. Valid options: pilot, strategy, commander`);
    }
    return model.id;
  }

  /**
   * Calculate delay for exponential backoff
   * @param {number} attempt - Current attempt number (0-indexed)
   * @returns {number} Delay in milliseconds
   */
  _calculateBackoffDelay(attempt) {
    const delay = RETRY_CONFIG.baseDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
    return Math.min(delay, RETRY_CONFIG.maxDelay);
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute request with retry logic and exponential backoff
   * @param {Function} requestFn - Function that returns a promise with the request
   * @param {string} model - Model name for metrics
   * @returns {Promise<Object>} Response data
   */
  async _executeWithRetry(requestFn, model) {
    let lastError;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      const startTime = Date.now();

      try {
        const result = await this.rateLimiter.schedule(requestFn);
        const latency = Date.now() - startTime;
        this.metrics.recordRequest(model, latency, true, attempt > 0);
        return result;
      } catch (error) {
        const latency = Date.now() - startTime;
        const isRateLimit = error?.response?.status === 429;
        const isRetryable = isRateLimit ||
          error?.code === 'ECONNABORTED' ||
          error?.code === 'ETIMEDOUT' ||
          error?.message?.includes('network');

        // Don't retry non-retryable errors on last attempt
        if (!isRetryable && attempt === RETRY_CONFIG.maxRetries) {
          this.metrics.recordRequest(model, latency, false, attempt > 0);
          throw error;
        }

        // Don't retry if we've exhausted retries
        if (attempt === RETRY_CONFIG.maxRetries) {
          this.metrics.recordRequest(model, latency, false, true);
          throw error;
        }

        lastError = error;

        // If rate limited, stop completely (rate limiter handles this)
        if (isRateLimit) {
          logger.warn('Omniroute: Rate limit hit, limiter stopped', {
            status: error?.response?.status,
            attempt: attempt + 1,
          });
          throw error;
        }

        const delay = this._calculateBackoffDelay(attempt);
        logger.warn('Omniroute: Request failed, retrying with backoff', {
          attempt: attempt + 1,
          maxRetries: RETRY_CONFIG.maxRetries,
          delayMs: delay,
          error: error?.message || error,
        });

        await this._sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Send a chat completion request
   * @param {string|Array} messages - Message string or array of message objects
   * @param {Object} options - Request options
   * @param {string} options.model - Model layer ('pilot', 'strategy', 'commander') or full model ID
   * @param {number} options.temperature - Sampling temperature (default: 0.7)
   * @param {number} options.maxTokens - Max tokens to generate (default: 500)
   * @param {boolean} options.stream - Stream responses (default: false)
   * @returns {Promise<Object>} Chat completion response
   */
  async chat(messages, options = {}) {
    const {
      model = 'pilot',
      temperature = 0.7,
      maxTokens = 500,
      stream = false,
    } = options;

    // Resolve model ID (can be layer name or full ID)
    let modelId = model;
    if (!model.includes('/') && !model.includes('claude')) {
      modelId = this.getModelId(model);
    }

    // Normalize messages format
    const normalizedMessages = this._normalizeMessages(messages);

    const requestBody = {
      model: modelId,
      messages: normalizedMessages,
      temperature,
      max_tokens: maxTokens,
      stream,
    };

    logger.debug('Omniroute: Sending chat request', {
      model,
      modelId,
      messageCount: normalizedMessages.length,
      temperature,
      maxTokens,
    });

    const makeRequest = async () => {
      const response = await this.client.post('/chat/completions', requestBody);
      return response.data;
    };

    return this._executeWithRetry(makeRequest, model);
  }

  /**
   * Normalize messages to array format
   * @param {string|Array|Object} messages - Input messages
   * @returns {Array} Normalized message array
   */
  _normalizeMessages(messages) {
    if (typeof messages === 'string') {
      return [{ role: 'user', content: messages }];
    }

    if (Array.isArray(messages)) {
      return messages.map(msg => {
        if (typeof msg === 'string') {
          return { role: 'user', content: msg };
        }
        return msg;
      });
    }

    // Single object message
    if (typeof messages === 'object' && messages.content) {
      return [messages];
    }

    throw new Error('Invalid messages format. Expected string, array, or message object');
  }

  /**
   * Perform health check against rate limits endpoint
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      const response = await this.client.get('/api/rate-limits', {
        timeout: 5000,
      });

      this.healthStatus = {
        ok: true,
        status: 'healthy',
        data: response.data,
        checkedAt: new Date().toISOString(),
      };
      this.healthLastCheck = Date.now();

      logger.debug('Omniroute: Health check passed', { data: response.data });
      return this.healthStatus;
    } catch (error) {
      this.healthStatus = {
        ok: false,
        status: 'unhealthy',
        error: error?.message || 'Health check failed',
        checkedAt: new Date().toISOString(),
      };
      this.healthLastCheck = Date.now();

      logger.warn('Omniroute: Health check failed', { error: error?.message });
      return this.healthStatus;
    }
  }

  /**
   * Get current health status (cached)
   * @returns {Object} Cached health status
   */
  getHealthStatus() {
    return this.healthStatus;
  }

  /**
   * Get metrics snapshot
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return this.metrics.getStats();
  }

  /**
   * Reset metrics counters
   */
  resetMetrics() {
    this.metrics.reset();
    logger.info('Omniroute: Metrics reset');
  }

  /**
   * Convenience methods for each model layer
   */
  async pilot(messages, options = {}) {
    return this.chat(messages, { ...options, model: 'pilot' });
  }

  async strategy(messages, options = {}) {
    return this.chat(messages, { ...options, model: 'strategy' });
  }

  async commander(messages, options = {}) {
    return this.chat(messages, { ...options, model: 'commander' });
  }

  /**
   * Stop the rate limiter
   */
  async stop() {
    await this.rateLimiter.stop();
    logger.info('Omniroute: Client stopped');
  }
}

module.exports = OmnirouteClient;
module.exports.MODELS = MODELS;
module.exports.MetricsTracker = MetricsTracker;