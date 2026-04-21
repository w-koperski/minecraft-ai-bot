/**
 * OpenAI-Compatible API Client for Minecraft AI Bot
 * Handles communication with any OpenAI-compatible endpoint (OpenAI, Anthropic, local models, etc.)
 * with rate limiting, retry logic, exponential backoff, and metrics tracking.
 */

const axios = require('axios');
const Bottleneck = require('bottleneck');
const logger = require('./logger');

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 5,
  baseDelay: 1000, // 1s
  maxDelay: 60000,  // 60s max for 429 backoff
  backoffMultiplier: 2,
};

// Default client configuration
const DEFAULT_CONFIG = {
  baseURL: process.env.OPENAI_API_URL || process.env.OMNIROUTE_URL || 'http://127.0.0.1:20128/v1',
  apiKey: process.env.OPENAI_API_KEY || process.env.OMNIROUTE_API_KEY || 'local',
  timeout: 30000,
  maxConcurrent: 10,
  // Rate limiting (80% of 560 RPM = 448 req/min)
  reservoir: 448,
  reservoirRefreshAmount: 448,
  reservoirRefreshInterval: 60000,
  minTime: 133,
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
  }

  recordRequest(latency, success, retried = false) {
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
    };
  }
}

/**
 * OpenAI-Compatible API Client
 * Supports OpenAI, Anthropic, local models, and any OpenAI-compatible endpoint
 */
class OpenAIClient {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = new MetricsTracker();

    // Initialize Bottleneck rate limiter
    this.limiter = new Bottleneck({
      reservoir: this.config.reservoir,
      reservoirRefreshAmount: this.config.reservoirRefreshAmount,
      reservoirRefreshInterval: this.config.reservoirRefreshInterval,
      maxConcurrent: this.config.maxConcurrent,
      minTime: this.config.minTime,
    });

    this.stopped = false;
    this.rateLimitBackoffUntil = 0;

    // Create axios instance
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
   * Check if an error is retryable
   * @param {Error} error - Error to check
   * @returns {boolean} True if error is retryable
   */
  _isRetryable(error) {
    const status = error?.response?.status;
    const code = error?.code;

    // Retry on 429 (rate limit) - though we stop limiter first
    if (status === 429) return true;

    // Retry on 5xx server errors
    if (status >= 500 && status < 600) return true;

    // Retry on network/timeout errors
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ECONNRESET') return true;

    // Retry on network errors
    if (error?.message?.includes('network') || error?.message?.includes('ECONN')) return true;

    return false;
  }

  /**
   * Execute request with retry logic and exponential backoff
   * @param {Function} requestFn - Function that returns a promise with the request
   * @returns {Promise<Object>} Response data
   */
  async _executeWithRetry(requestFn) {
    let lastError;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      const startTime = Date.now();

      try {
        // Check if we're in rate limit backoff period
        const now = Date.now();
        if (this.rateLimitBackoffUntil > now) {
          const waitTime = this.rateLimitBackoffUntil - now;
          logger.warn('OpenAI-Client: In rate limit backoff, waiting', {
            waitMs: waitTime,
            attempt: attempt + 1,
          });
          await this._sleep(waitTime);
        }

        const result = await this.limiter.schedule(requestFn);
        const latency = Date.now() - startTime;
        this.metrics.recordRequest(latency, true, attempt > 0);
        
        // Reset backoff on success
        this.rateLimitBackoffUntil = 0;
        
        return result;
      } catch (error) {
        const latency = Date.now() - startTime;
        const isRetryable = this._isRetryable(error);

        // Don't retry non-retryable errors on last attempt
        if (!isRetryable && attempt === RETRY_CONFIG.maxRetries) {
          this.metrics.recordRequest(latency, false, attempt > 0);
          throw error;
        }

        // Don't retry if we've exhausted retries
        if (attempt === RETRY_CONFIG.maxRetries) {
          this.metrics.recordRequest(latency, false, true);
          throw error;
        }

        lastError = error;

        // If rate limited, apply exponential backoff (don't stop limiter)
        if (error?.response?.status === 429) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 60000);
          this.rateLimitBackoffUntil = Date.now() + delay;
          
          logger.warn('OpenAI-Client: Rate limit hit, backing off', {
            delayMs: delay,
            attempt: attempt + 1,
            maxRetries: RETRY_CONFIG.maxRetries,
          });
          
          await this._sleep(delay);
          continue;
        }

        const delay = this._calculateBackoffDelay(attempt);
        logger.warn('OpenAI-Client: Request failed, retrying with backoff', {
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
   * Extract content from OpenAI response
   * @param {Object} response - API response
   * @returns {Object} Extracted content with text and metadata
   */
  _extractResponse(response) {
    if (!response?.choices?.[0]?.message) {
      throw new Error('Invalid response format from API');
    }

    const choice = response.choices[0];
    return {
      content: choice.message.content,
      role: choice.message.role,
      finishReason: choice.finish_reason,
      model: response.model,
      usage: response.usage,
    };
  }

  /**
   * Send a chat completion request
   * @param {string|Array} messages - Message string or array of message objects
   * @param {string} layer - Layer name (pilot, strategy, commander) - used for logging only
   * @param {Object} options - Request options
   * @param {string} options.model - Model ID (default: from layer or 'gpt-3.5-turbo')
   * @param {number} options.temperature - Sampling temperature (default: 0.7)
   * @param {number} options.maxTokens - Max tokens to generate (default: 500)
   * @param {boolean} options.stream - Stream responses (default: false)
   * @returns {Promise<Object>} Chat completion response with content field
   */
  async chat(messages, layer = 'pilot', options = {}) {
    const {
      model = process.env[`${layer.toUpperCase()}_MODEL`] || 'gpt-3.5-turbo',
      temperature = 0.7,
      maxTokens = 500,
      stream = false,
    } = options;

    // Normalize messages format
    const normalizedMessages = this._normalizeMessages(messages);

    const requestBody = {
      model,
      messages: normalizedMessages,
      temperature,
      max_tokens: maxTokens,
      stream,
    };

    logger.debug('OpenAI-Client: Sending chat request', {
      layer,
      model,
      messageCount: normalizedMessages.length,
      temperature,
      maxTokens,
    });

    const makeRequest = async () => {
      const response = await this.client.post('/chat/completions', requestBody);
      return this._extractResponse(response.data);
    };

    return this._executeWithRetry(makeRequest);
  }

  /**
   * Perform health check against models endpoint
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      const response = await this.client.get('/models', {
        timeout: 5000,
      });

      this.healthStatus = {
        ok: true,
        status: 'healthy',
        models: response.data?.data?.map(m => m.id) || [],
        checkedAt: new Date().toISOString(),
      };
      this.healthLastCheck = Date.now();

      logger.debug('OpenAI-Client: Health check passed', {
        modelCount: this.healthStatus.models.length
      });
      return this.healthStatus;
    } catch (error) {
      this.healthStatus = {
        ok: false,
        status: 'unhealthy',
        error: error?.message || 'Health check failed',
        checkedAt: new Date().toISOString(),
      };
      this.healthLastCheck = Date.now();

      logger.warn('OpenAI-Client: Health check failed', { error: error?.message });
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
    logger.info('OpenAI-Client: Metrics reset');
  }

  /**
   * Stop the rate limiter
   */
  async stop() {
    this.stopped = true;
    await this.limiter.stop();
    logger.info('OpenAI-Client: Client stopped');
  }
}

module.exports = OpenAIClient;
module.exports.MetricsTracker = MetricsTracker;
