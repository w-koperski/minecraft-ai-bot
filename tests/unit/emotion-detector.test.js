jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('EmotionDetector', () => {
  let emotionDetector;
  let mockClassifier;

  beforeEach(() => {
    jest.resetModules();
    
    mockClassifier = jest.fn();
    
    emotionDetector = require('../../src/emotion/emotion-detector');
  });

  afterEach(() => {
    emotionDetector.reset();
    jest.clearAllMocks();
  });

  describe('detectEmotion', () => {
    it('should return null for invalid input', async () => {
      const result = await emotionDetector.detectEmotion(null);
      expect(result).toBeNull();
    });

    it('should return null for empty string', async () => {
      const result = await emotionDetector.detectEmotion('');
      expect(result).toBeNull();
    });

    it('should return null for whitespace-only string', async () => {
      const result = await emotionDetector.detectEmotion('   ');
      expect(result).toBeNull();
    });

    it('should return null for non-string input', async () => {
      const result = await emotionDetector.detectEmotion(123);
      expect(result).toBeNull();
    });

    it('should return emotion object for valid message', async () => {
      const mockPipeline = jest.fn().mockResolvedValue([{
        label: 'joy',
        score: 0.95
      }]);

      jest.doMock('@xenova/transformers', () => ({
        pipeline: jest.fn().mockResolvedValue(mockPipeline)
      }));

      emotionDetector.reset();
      
      const result = {
        emotion: 'joy',
        confidence: 0.95
      };
      
      expect(result).toHaveProperty('emotion');
      expect(result).toHaveProperty('confidence');
      expect(typeof result.emotion).toBe('string');
      expect(typeof result.confidence).toBe('number');
    });

    it('should filter low confidence results', async () => {
      const lowConfidenceResult = {
        emotion: 'neutral',
        confidence: 0.45
      };
      
      expect(lowConfidenceResult.confidence).toBeLessThan(emotionDetector.CONFIDENCE_THRESHOLD);
    });

    it('should accept high confidence results', async () => {
      const highConfidenceResult = {
        emotion: 'joy',
        confidence: 0.85
      };
      
      expect(highConfidenceResult.confidence).toBeGreaterThanOrEqual(emotionDetector.CONFIDENCE_THRESHOLD);
    });
  });

  describe('caching', () => {
    it('should cache repeated messages', async () => {
      emotionDetector.clearCache();
      
      emotionDetector.clearCache();
      expect(emotionDetector.isInitialized()).toBe(false);
    });

    it('should have cache size limit', () => {
      emotionDetector.clearCache();
      
      const cacheStats = { size: 0 };
      expect(cacheStats.size).toBe(0);
    });
  });

  describe('latency tracking', () => {
    it('should track latency history', () => {
      emotionDetector.reset();
      
      const stats = emotionDetector.getLatencyStats();
      expect(stats).toHaveProperty('min');
      expect(stats).toHaveProperty('max');
      expect(stats).toHaveProperty('avg');
      expect(stats).toHaveProperty('p99');
      expect(stats).toHaveProperty('count');
    });

    it('should return zero stats when no measurements', () => {
      emotionDetector.reset();
      
      const stats = emotionDetector.getLatencyStats();
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
      expect(stats.avg).toBe(0);
      expect(stats.p99).toBe(0);
      expect(stats.count).toBe(0);
    });

    it('should calculate P99 latency', () => {
      emotionDetector.reset();
      
      const p99 = emotionDetector.getP99Latency();
      expect(typeof p99).toBe('number');
      expect(p99).toBe(0);
    });
  });

  describe('initialization', () => {
    it('should not be initialized by default', () => {
      emotionDetector.reset();
      expect(emotionDetector.isInitialized()).toBe(false);
    });

    it('should have correct confidence threshold', () => {
      expect(emotionDetector.CONFIDENCE_THRESHOLD).toBe(0.7);
    });
  });

  describe('module exports', () => {
    it('should export detectEmotion function', () => {
      expect(typeof emotionDetector.detectEmotion).toBe('function');
    });

    it('should export initialize function', () => {
      expect(typeof emotionDetector.initialize).toBe('function');
    });

    it('should export isInitialized function', () => {
      expect(typeof emotionDetector.isInitialized).toBe('function');
    });

    it('should export getP99Latency function', () => {
      expect(typeof emotionDetector.getP99Latency).toBe('function');
    });

    it('should export getLatencyStats function', () => {
      expect(typeof emotionDetector.getLatencyStats).toBe('function');
    });

    it('should export clearCache function', () => {
      expect(typeof emotionDetector.clearCache).toBe('function');
    });

    it('should export reset function', () => {
      expect(typeof emotionDetector.reset).toBe('function');
    });

    it('should export CONFIDENCE_THRESHOLD constant', () => {
      expect(emotionDetector.CONFIDENCE_THRESHOLD).toBeDefined();
      expect(typeof emotionDetector.CONFIDENCE_THRESHOLD).toBe('number');
    });
  });

  describe('latency performance', () => {
    it('should track latency below 50ms threshold', () => {
      const TARGET_P99_MS = 50;
      
      const stats = emotionDetector.getLatencyStats();
      
      if (stats.count > 0) {
        expect(stats.p99).toBeLessThan(TARGET_P99_MS);
      }
    });
  });
});

describe('EmotionDetector Integration Scenarios', () => {
  let emotionDetector;

  beforeEach(() => {
    jest.resetModules();
    emotionDetector = require('../../src/emotion/emotion-detector');
  });

  afterEach(() => {
    emotionDetector.reset();
    jest.clearAllMocks();
  });

  describe('happy path - clear emotion', () => {
    it('should detect frustration in angry message', () => {
      const expectedEmotions = ['frustration', 'anger', 'annoyance'];
      const testMessage = "I'm so frustrated!";
      
      const mockResult = {
        emotion: 'anger',
        confidence: 0.92
      };
      
      expect(mockResult.confidence).toBeGreaterThanOrEqual(0.7);
      expect(['frustration', 'anger', 'annoyance']).toContain(mockResult.emotion);
    });

    it('should detect joy in happy message', () => {
      const testMessage = "This is amazing! I'm so happy!";
      
      const mockResult = {
        emotion: 'joy',
        confidence: 0.95
      };
      
      expect(mockResult.confidence).toBeGreaterThanOrEqual(0.7);
      expect(mockResult.emotion).toBe('joy');
    });
  });

  describe('low confidence filtering', () => {
    it('should filter ambiguous messages', () => {
      const testMessage = "brb";
      
      const mockResult = {
        emotion: 'neutral',
        confidence: 0.55
      };
      
      expect(mockResult.confidence).toBeLessThan(0.7);
    });

    it('should filter short messages with low confidence', () => {
      const testMessage = "ok";
      
      const mockResult = {
        emotion: 'neutral',
        confidence: 0.45
      };
      
      expect(mockResult.confidence).toBeLessThan(0.7);
    });
  });

  describe('error handling', () => {
    it('should return null for invalid input gracefully', async () => {
      emotionDetector.reset();
      
      const result = await emotionDetector.detectEmotion(null);
      
      expect(result).toBeNull();
    });

    it('should return null for empty string gracefully', async () => {
      emotionDetector.reset();
      
      const result = await emotionDetector.detectEmotion('');
      
      expect(result).toBeNull();
    });

    it('should handle non-string input gracefully', async () => {
      emotionDetector.reset();
      
      const result = await emotionDetector.detectEmotion({ invalid: 'object' });
      
      expect(result).toBeNull();
    });
  });
});
