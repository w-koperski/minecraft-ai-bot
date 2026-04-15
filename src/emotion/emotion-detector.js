/**
 * Emotion Detector Module
 * 
 * Uses transformers.js with MicahB/emotion_text_classifier for emotion detection.
 * Provides detectEmotion(message) with confidence threshold filtering.
 * 
 * Performance: P99 <50ms (validated in Task 2)
 * Model: 13 emotion classes including joy, sadness, anger, fear, etc.
 */

const logger = require('../utils/logger');

// Lazy-loaded pipeline - initialized on first use
let classifier = null;
let initializationPromise = null;

// Simple Map cache for repeated messages
const cache = new Map();
const MAX_CACHE_SIZE = 100;

// Latency tracking for P99 measurement
const latencyHistory = [];
const MAX_LATENCY_HISTORY = 1000;

// Configuration
const CONFIDENCE_THRESHOLD = 0.7;

/**
 * Initialize the emotion classifier pipeline
 * Uses lazy loading to avoid blocking startup
 * @returns {Promise<void>}
 */
async function initialize() {
  if (classifier) return;
  
  if (initializationPromise) {
    return initializationPromise;
  }
  
  initializationPromise = (async () => {
    try {
      const { pipeline } = await import('@xenova/transformers');
      
      // Use MicahB/emotion_text_classifier - validated in Task 2
      // Quantized model for better latency
      classifier = await pipeline(
        'text-classification',
        'MicahB/emotion_text_classifier',
        { quantized: true }
      );
      
      logger.info('Emotion detector initialized', {
        model: 'MicahB/emotion_text_classifier',
        quantized: true
      });
    } catch (error) {
      logger.error('Failed to initialize emotion detector', { error: error.message });
      throw error;
    }
  })();
  
  return initializationPromise;
}

/**
 * Detect emotion from text message
 * 
 * @param {string} message - The text to analyze
 * @returns {Promise<{emotion: string, confidence: number}|null>}
 *   Returns null if confidence below threshold or on error
 */
async function detectEmotion(message) {
  // Validate input
  if (!message || typeof message !== 'string') {
    logger.warn('Invalid message input for emotion detection', { message });
    return null;
  }
  
  const trimmedMessage = message.trim();
  if (trimmedMessage.length === 0) {
    return null;
  }
  
  // Check cache first
  const cacheKey = trimmedMessage.toLowerCase();
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    logger.debug('Emotion cache hit', { message: trimmedMessage, cached });
    return cached;
  }
  
  // Ensure classifier is initialized
  await initialize();
  
  const startTime = Date.now();
  
  try {
    // Run inference
    const results = await classifier(trimmedMessage);
    
    // Track latency
    const latency = Date.now() - startTime;
    trackLatency(latency);
    
    // Get top result
    const topResult = Array.isArray(results) ? results[0] : results;
    
    if (!topResult || !topResult.label) {
      logger.warn('Empty result from emotion classifier', { message: trimmedMessage });
      return null;
    }
    
    const emotion = topResult.label;
    const confidence = topResult.score || 0;
    
    // Log detection result
    logger.debug('Emotion detected', {
      message: trimmedMessage.substring(0, 50),
      emotion,
      confidence: confidence.toFixed(3),
      latency: `${latency}ms`
    });
    
    // Apply confidence threshold
    if (confidence < CONFIDENCE_THRESHOLD) {
      logger.debug('Emotion confidence below threshold, filtering out', {
        emotion,
        confidence: confidence.toFixed(3),
        threshold: CONFIDENCE_THRESHOLD
      });
      
      // Cache as null for low-confidence results
      addToCache(cacheKey, null);
      return null;
    }
    
    const result = { emotion, confidence };
    
    // Cache the result
    addToCache(cacheKey, result);
    
    return result;
    
  } catch (error) {
    const latency = Date.now() - startTime;
    trackLatency(latency);
    
    logger.error('Emotion detection failed', {
      message: trimmedMessage.substring(0, 50),
      error: error.message,
      latency: `${latency}ms`
    });
    
    return null;
  }
}

/**
 * Add entry to cache with LRU eviction
 * @param {string} key - Cache key
 * @param {*} value - Value to cache
 */
function addToCache(key, value) {
  // LRU eviction: remove oldest if at capacity
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  
  cache.set(key, value);
}

/**
 * Track latency for P99 measurement
 * @param {number} latency - Latency in milliseconds
 */
function trackLatency(latency) {
  if (latencyHistory.length >= MAX_LATENCY_HISTORY) {
    latencyHistory.shift();
  }
  latencyHistory.push(latency);
}

/**
 * Get P99 latency from history
 * @returns {number} P99 latency in milliseconds
 */
function getP99Latency() {
  if (latencyHistory.length === 0) return 0;
  
  const sorted = [...latencyHistory].sort((a, b) => a - b);
  const p99Index = Math.ceil(sorted.length * 0.99) - 1;
  return sorted[Math.max(0, p99Index)];
}

/**
 * Get latency statistics
 * @returns {{min: number, max: number, avg: number, p99: number, count: number}}
 */
function getLatencyStats() {
  if (latencyHistory.length === 0) {
    return { min: 0, max: 0, avg: 0, p99: 0, count: 0 };
  }
  
  const sorted = [...latencyHistory].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(sum / sorted.length * 100) / 100,
    p99: getP99Latency(),
    count: sorted.length
  };
}

/**
 * Clear the cache (useful for testing)
 */
function clearCache() {
  cache.clear();
}

/**
 * Reset the module state (useful for testing)
 */
function reset() {
  classifier = null;
  initializationPromise = null;
  cache.clear();
  latencyHistory.length = 0;
}

/**
 * Check if the classifier is initialized
 * @returns {boolean}
 */
function isInitialized() {
  return classifier !== null;
}

module.exports = {
  detectEmotion,
  initialize,
  isInitialized,
  getP99Latency,
  getLatencyStats,
  clearCache,
  reset,
  CONFIDENCE_THRESHOLD
};
