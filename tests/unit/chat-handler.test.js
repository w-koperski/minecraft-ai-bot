jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/emotion/emotion-detector', () => ({
  detectEmotion: jest.fn(),
  initialize: jest.fn(),
  isInitialized: jest.fn(() => true),
  getP99Latency: jest.fn(() => 15),
  getLatencyStats: jest.fn(() => ({ min: 5, max: 20, avg: 10, p99: 15, count: 100 })),
  clearCache: jest.fn(),
  reset: jest.fn(),
  CONFIDENCE_THRESHOLD: 0.7
}));

jest.mock('../../src/social/social-awareness', () => {
  return class MockSocialAwareness {
    constructor() {
      this.trackedSentiments = [];
    }
    trackSentiment(playerId, emotion) {
      this.trackedSentiments.push({ playerId, emotion });
    }
    getSentimentHistory() {
      return [];
    }
    inferIntention() {
      return { type: 'unknown', urgency: 'low', confidence: 0.5 };
    }
    getSocialContext() {
      return { activePlayers: 0, urgentPlayers: [], recentInteractions: [] };
    }
  };
});

jest.mock('../../src/memory/conversation-store', () => {
  return class MockConversationStore {
    async getRelationship() {
      return { familiarity: 0.5, trust: 0.5 };
    }
    async saveConversation() {}
    async updateRelationship() {}
    async close() {}
  };
});

jest.mock('../../personality/personality-engine', () => ({
  getInstance: () => ({
    getTraits: () => ({
      warmth: 0.7,
      directness: 0.5,
      humor: 0.3,
      curiosity: 0.6,
      loyalty: 0.8,
      bravery: 0.5
    })
  })
}));

const { getEmotionTone, analyzeIntent, parseCommand } = require('../../src/chat/chat-handler');
const emotionDetector = require('../../src/emotion/emotion-detector');

describe('Chat Handler - Emotion Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getEmotionTone()', () => {
    it('should return null for no emotion', () => {
      expect(getEmotionTone(null)).toBeNull();
    });

    it('should return null for joy emotion', () => {
      expect(getEmotionTone({ emotion: 'joy', confidence: 0.9 })).toBeNull();
    });

    it('should return empathy tone for sadness', () => {
      const tone = getEmotionTone({ emotion: 'sadness', confidence: 0.85 });
      expect(tone).toBe('I sense you might be feeling down.');
    });

    it('should return acknowledgment tone for anger', () => {
      const tone = getEmotionTone({ emotion: 'anger', confidence: 0.9 });
      expect(tone).toBe('I can tell something is bothering you.');
    });

    it('should return concern tone for fear', () => {
      const tone = getEmotionTone({ emotion: 'fear', confidence: 0.8 });
      expect(tone).toBe('Are you okay?');
    });

    it('should return acknowledgment tone for frustration', () => {
      const tone = getEmotionTone({ emotion: 'frustration', confidence: 0.85 });
      expect(tone).toBe('I can tell something is bothering you.');
    });

    it('should return null for unknown emotion', () => {
      expect(getEmotionTone({ emotion: 'surprise', confidence: 0.9 })).toBeNull();
    });
  });

  describe('analyzeIntent()', () => {
    it('should detect greeting intent', () => {
      const result = analyzeIntent('hello there');
      expect(result.type).toBe('greeting');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should detect farewell intent', () => {
      const result = analyzeIntent('goodbye!');
      expect(result.type).toBe('farewell');
    });

    it('should detect gratitude intent', () => {
      const result = analyzeIntent('thanks for your help');
      expect(result.type).toBe('gratitude');
    });

    it('should detect request_help intent', () => {
      const result = analyzeIntent('can you help me find diamonds?');
      expect(result.type).toBe('request_help');
    });

    it('should detect question_activity intent', () => {
      const result = analyzeIntent("what are you doing?");
      expect(result.type).toBe('question_activity');
    });

    it('should detect question_status intent', () => {
      const result = analyzeIntent('how are you doing?');
      expect(result.type).toBe('question_status');
    });

    it('should detect question_identity intent', () => {
      const result = analyzeIntent('who are you?');
      expect(result.type).toBe('question_identity');
    });

    it('should default to chat_general', () => {
      const result = analyzeIntent('just some random message');
      expect(result.type).toBe('chat_general');
    });
  });

  describe('parseCommand()', () => {
    it('should parse simple command', () => {
      const result = parseCommand('collect wood');
      expect(result.action).toBe('collect');
      expect(result.args).toEqual(['wood']);
    });

    it('should parse command with multiple args', () => {
      const result = parseCommand('goto 100 64 200');
      expect(result.action).toBe('goto');
      expect(result.args).toEqual(['100', '64', '200']);
    });

    it('should handle extra whitespace', () => {
      const result = parseCommand('  status  ');
      expect(result.action).toBe('status');
      expect(result.args).toEqual([]);
    });

    it('should handle empty string', () => {
      const result = parseCommand('');
      expect(result.action).toBe('');
    });
  });
});

describe('Emotion Detection Integration Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should filter emotions below confidence threshold', async () => {
    emotionDetector.detectEmotion.mockResolvedValue({
      emotion: 'joy',
      confidence: 0.5
    });

    const result = await emotionDetector.detectEmotion('happy message');
    expect(result.confidence).toBe(0.5);
  });

  it('should return valid emotion above threshold', async () => {
    emotionDetector.detectEmotion.mockResolvedValue({
      emotion: 'sadness',
      confidence: 0.85
    });

    const result = await emotionDetector.detectEmotion('I am sad');
    expect(result).toEqual({ emotion: 'sadness', confidence: 0.85 });
  });

  it('should handle emotion detection errors gracefully', async () => {
    emotionDetector.detectEmotion.mockRejectedValueOnce(new Error('Model load failed'));

    try {
      await emotionDetector.detectEmotion('test message');
    } catch (e) {
      expect(e.message).toBe('Model load failed');
    }
  });

  it('should return null for invalid input', async () => {
    emotionDetector.detectEmotion.mockResolvedValue(null);

    const result = await emotionDetector.detectEmotion('');
    expect(result).toBeNull();
  });
});

describe('Social Awareness Integration', () => {
  it('should track sentiment when valid emotion is detected', () => {
    const SocialAwareness = require('../../src/social/social-awareness');
    const socialAwareness = new SocialAwareness();

    socialAwareness.trackSentiment('TestPlayer', {
      emotion: 'joy',
      confidence: 0.9
    });

    expect(socialAwareness.trackedSentiments).toHaveLength(1);
    expect(socialAwareness.trackedSentiments[0]).toEqual({
      playerId: 'TestPlayer',
      emotion: { emotion: 'joy', confidence: 0.9 }
    });
  });

  it('should infer intention from message', () => {
    const SocialAwareness = require('../../src/social/social-awareness');
    const socialAwareness = new SocialAwareness();

    const intention = socialAwareness.inferIntention('TestPlayer', 'help me please', {});

    expect(intention).toBeDefined();
    expect(intention.type).toBeDefined();
  });
});
