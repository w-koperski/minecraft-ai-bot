/**
 * VisionClient - OpenAI-compatible Vision API Client for Minecraft AI Bot
 *
 * Supports custom endpoints via VISION_API_URL env var.
 * Falls back to Omniroute if not specified.
 * Uses OpenAI-compatible format (GPT-4o vision API).
 *
 * @module vision/vision-client
 */

const axios = require('axios');
const logger = require('../utils/logger');

// Default configuration
const DEFAULT_CONFIG = {
  baseURL: process.env.OMNIROUTE_URL || 'http://127.0.0.1:20128/v1/chat/completions',
  apiKey: process.env.OMNIROUTE_API_KEY || 'local',
  timeout: 30000,
};

// Vision model configuration
const VISION_MODEL = 'gpt-4o';

/**
 * Error types for vision API failures
 */
class VisionAPIError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.name = 'VisionAPIError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * VisionClient for analyzing screenshots with OpenAI-compatible vision API
 */
class VisionClient {
  /**
   * @param {Object} [config] - Configuration options
   * @param {string} [config.baseURL] - API base URL (default: VISION_API_URL or Omniroute)
   * @param {string} [config.apiKey] - API key (default: VISION_API_KEY or Omniroute key)
   * @param {number} [config.timeout] - Request timeout in ms (default: 30000)
   */
  constructor(config = {}) {
    // Use VISION_API_URL if set, otherwise fall back to Omniroute
    const visionURL = process.env.VISION_API_URL;

    this.config = {
      baseURL: config.baseURL || visionURL || DEFAULT_CONFIG.baseURL,
      apiKey: config.apiKey || process.env.VISION_API_KEY || DEFAULT_CONFIG.apiKey,
      timeout: config.timeout || DEFAULT_CONFIG.timeout,
    };

    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
    });

    this.isUsingCustomEndpoint = !!visionURL;
  }

  /**
   * Analyze a screenshot using vision model
   * @param {Object} screenshot - Screenshot data with base64 image data
   * @param {string} screenshot.data - Base64 encoded image data (with or without data URL prefix)
   * @param {string} [screenshot.mimeType] - MIME type of image (default: 'image/png')
   * @param {Object} [options] - Analysis options
   * @param {string} [options.prompt] - Custom prompt for vision analysis
   * @returns {Promise<Object>} Analysis result
   */
  async analyze(screenshot, options = {}) {
    const prompt = options.prompt || 'Describe this Minecraft scene in detail. Focus on: blocks, entities, player status, and any potential dangers.';

    // Build image URL (handle both raw base64 and data URL formats)
    let imageUrl = screenshot.data;
    if (!imageUrl.startsWith('data:')) {
      const mimeType = screenshot.mimeType || 'image/png';
      imageUrl = `data:${mimeType};base64,${imageUrl}`;
    }

    const requestBody = {
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ],
      max_tokens: 500,
    };

    logger.debug('VisionClient: Sending analysis request', {
      baseURL: this.config.baseURL,
      hasImage: !!screenshot.data,
      promptLength: prompt.length
    });

    try {
      const response = await this._makeRequest(requestBody);
      return this._parseResponse(response);
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Make HTTP request to vision API
   * @param {Object} requestBody - Request body for POST
   * @returns {Promise<Object>} Response data
   * @private
   */
  async _makeRequest(requestBody) {
    try {
      const response = await this.client.post('/chat/completions', requestBody);
      return response.data;
    } catch (error) {
      // Re-throw if it's already a VisionAPIError
      if (error instanceof VisionAPIError) {
        throw error;
      }
      throw error;
    }
  }

  /**
   * Parse API response into structured result
   * @param {Object} response - API response
   * @returns {Object} Parsed result
   * @private
   */
  _parseResponse(response) {
    // Extract content from OpenAI-compatible response
    const content = response?.choices?.[0]?.message?.content;

    if (!content) {
      logger.warn('VisionClient: Empty response content', { response });
      return {
        description: '',
        observations: [],
        threats: [],
        confidence: 0,
        raw: response
      };
    }

    // Parse structured analysis from content
    // The vision model returns text that we parse for Minecraft-specific info
    const observations = this._extractObservations(content);
    const threats = this._extractThreats(content);

    return {
      description: content,
      observations,
      threats,
      confidence: 0.8, // Placeholder confidence
      raw: response
    };
  }

  /**
   * Extract observations from model response
   * @param {string} content - Model response text
   * @returns {Array} Array of observation objects
   * @private
   */
  _extractObservations(content) {
    const observations = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('##') && !trimmed.startsWith('**')) {
        observations.push({
          text: trimmed,
          type: 'general'
        });
      }
    }

    return observations.slice(0, 10); // Limit to 10 observations
  }

  /**
   * Extract potential threats from model response
   * @param {string} content - Model response text
   * @returns {Array} Array of threat objects
   * @private
   */
  _extractThreats(content) {
    const threats = [];
    const threatKeywords = ['danger', 'lava', 'fire', 'hostile', 'enemy', 'attack', 'threat', 'hazard'];

    const lowerContent = content.toLowerCase();
    for (const keyword of threatKeywords) {
      if (lowerContent.includes(keyword)) {
        threats.push({
          keyword,
          severity: 'medium'
        });
      }
    }

    return threats.slice(0, 5); // Limit to 5 threats
  }

  /**
   * Handle API errors and convert to VisionAPIError
   * @param {Error} error - Axios error
   * @returns {VisionAPIError} Converted error
   * @private
   */
  _handleError(error) {
    const statusCode = error.response?.status;
    const code = error.code;
    const message = error.response?.data?.error?.message || error.message;

    // Handle specific error types
    if (statusCode === 429) {
      logger.warn('VisionClient: Rate limit exceeded', { statusCode });
      return new VisionAPIError(`Rate limit exceeded: ${message}`, statusCode, 'RATE_LIMIT');
    }

    if (statusCode === 500) {
      logger.error('VisionClient: Server error', { statusCode, message });
      return new VisionAPIError(`Server error: ${message}`, statusCode, 'SERVER_ERROR');
    }

    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
      logger.warn('VisionClient: Request timeout', { code });
      return new VisionAPIError(`Request timeout: ${message}`, statusCode, 'TIMEOUT');
    }

    if (statusCode) {
      return new VisionAPIError(`API error: ${message}`, statusCode, 'API_ERROR');
    }

    // Network errors without status code
    logger.error('VisionClient: Network error', { message });
    return new VisionAPIError(`Network error: ${message}`, null, 'NETWORK_ERROR');
  }

  /**
   * Check if using a custom endpoint (vs Omniroute default)
   * @returns {boolean} True if using custom endpoint
   */
  isCustomEndpoint() {
    return this.isUsingCustomEndpoint;
  }

  /**
   * Get the current endpoint URL
   * @returns {string} Base URL of the API
   */
  getEndpoint() {
    return this.config.baseURL;
  }
}

module.exports = VisionClient;
module.exports.VisionAPIError = VisionAPIError;