/**
 * Unit tests for Social Awareness Module
 *
 * Tests:
 * - Sentiment tracking (history, trend calculation)
 * - Intention inference (keywords, context, urgency)
 * - BDI model (beliefs, desires, intentions)
 * - Player state management
 * - Integration with emotion detector
 */

jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('SocialAwareness', () => {
  let SocialAwareness;
  let socialAwareness;
  let mockEmotionDetector;

  beforeEach(() => {
    jest.resetModules();
    SocialAwareness = require('../../src/social/social-awareness');

    mockEmotionDetector = {
      detectEmotion: jest.fn()
    };

    socialAwareness = new SocialAwareness();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(socialAwareness).toBeDefined();
    });

    it('should initialize empty playerStates map', () => {
      expect(socialAwareness.playerStates.size).toBe(0);
    });

    it('should initialize empty sentimentHistory map', () => {
      expect(socialAwareness.sentimentHistory.size).toBe(0);
    });

    it('should accept options with emotionDetector', () => {
      const sa = new SocialAwareness({ emotionDetector: mockEmotionDetector });
      expect(sa.emotionDetector).toBe(mockEmotionDetector);
    });
  });

  describe('setEmotionDetector', () => {
    it('should set emotion detector', () => {
      socialAwareness.setEmotionDetector(mockEmotionDetector);
      expect(socialAwareness.emotionDetector).toBe(mockEmotionDetector);
    });
  });

  describe('trackSentiment', () => {
    it('should track sentiment for a player', () => {
      const emotion = { emotion: 'happy', confidence: 0.9 };
      const result = socialAwareness.trackSentiment('player1', emotion);

      expect(result).toBeDefined();
      expect(result.playerId).toBe('player1');
      expect(result.currentEmotion).toEqual(emotion);
    });

    it('should store sentiment history', () => {
      const emotion = { emotion: 'happy', confidence: 0.9 };
      socialAwareness.trackSentiment('player1', emotion);

      const history = socialAwareness.getSentimentHistory('player1');
      expect(history.length).toBe(1);
      expect(history[0].emotion).toBe('happy');
    });

    it('should store most recent sentiment first', () => {
      socialAwareness.trackSentiment('player1', { emotion: 'happy', confidence: 0.9 });
      socialAwareness.trackSentiment('player1', { emotion: 'frustrated', confidence: 0.8 });

      const history = socialAwareness.getSentimentHistory('player1');
      expect(history[0].emotion).toBe('frustrated');
      expect(history[1].emotion).toBe('happy');
    });

    it('should limit history to 10 entries', () => {
      for (let i = 0; i < 15; i++) {
        socialAwareness.trackSentiment('player1', {
          emotion: 'neutral',
          confidence: 0.5
        });
      }

      const history = socialAwareness.getSentimentHistory('player1');
      expect(history.length).toBe(10);
    });

    it('should return null for invalid inputs', () => {
      expect(socialAwareness.trackSentiment(null, { emotion: 'happy' })).toBeNull();
      expect(socialAwareness.trackSentiment('player1', null)).toBeNull();
    });

    it('should calculate trend as stable for single entry', () => {
      const result = socialAwareness.trackSentiment('player1', {
        emotion: 'happy',
        confidence: 0.9
      });
      expect(result.trend).toBe('stable');
    });

    it('should calculate improving trend', () => {
      socialAwareness.trackSentiment('player1', { emotion: 'sadness', confidence: 0.8 });
      socialAwareness.trackSentiment('player1', { emotion: 'neutral', confidence: 0.7 });
      socialAwareness.trackSentiment('player1', { emotion: 'happy', confidence: 0.9 });

      const result = socialAwareness.trackSentiment('player1', {
        emotion: 'joy',
        confidence: 0.95
      });
      expect(result.trend).toBe('improving');
    });

    it('should calculate declining trend', () => {
      socialAwareness.trackSentiment('player1', { emotion: 'joy', confidence: 0.95 });
      socialAwareness.trackSentiment('player1', { emotion: 'happy', confidence: 0.9 });
      socialAwareness.trackSentiment('player1', { emotion: 'neutral', confidence: 0.7 });
      socialAwareness.trackSentiment('player1', { emotion: 'sadness', confidence: 0.8 });

      const result = socialAwareness.trackSentiment('player1', {
        emotion: 'anger',
        confidence: 0.85
      });
      expect(result.trend).toBe('declining');
    });

    it('should track sentiment for multiple players independently', () => {
      socialAwareness.trackSentiment('player1', { emotion: 'happy', confidence: 0.9 });
      socialAwareness.trackSentiment('player2', { emotion: 'sadness', confidence: 0.8 });

      const history1 = socialAwareness.getSentimentHistory('player1');
      const history2 = socialAwareness.getSentimentHistory('player2');

      expect(history1[0].emotion).toBe('happy');
      expect(history2[0].emotion).toBe('sadness');
    });
  });

  describe('getSentimentHistory', () => {
    it('should return empty array for unknown player', () => {
      const history = socialAwareness.getSentimentHistory('unknown');
      expect(history).toEqual([]);
    });

    it('should return history for known player', () => {
      socialAwareness.trackSentiment('player1', { emotion: 'happy', confidence: 0.9 });
      socialAwareness.trackSentiment('player1', { emotion: 'sad', confidence: 0.8 });

      const history = socialAwareness.getSentimentHistory('player1');
      expect(history.length).toBe(2);
    });
  });

  describe('inferIntention', () => {
    it('should infer needs_assistance from help keyword', () => {
      const result = socialAwareness.inferIntention('player1', 'help me please', {});

      expect(result.type).toBe('needs_assistance');
      expect(result.playerId).toBe('player1');
    });

    it('should infer wants_trade from trade keyword', () => {
      const result = socialAwareness.inferIntention('player1', 'want to trade', {});

      expect(result.type).toBe('wants_trade');
    });

    it('should infer greeting from hello', () => {
      const result = socialAwareness.inferIntention('player1', 'hello there!', {});

      expect(result.type).toBe('greeting');
    });

    it('should infer unknown for ambiguous message', () => {
      const result = socialAwareness.inferIntention('player1', 'asdfgh', {});

      expect(result.type).toBe('unknown');
    });

    it('should return null for invalid playerId', () => {
      expect(socialAwareness.inferIntention(null, 'hello', {})).toBeNull();
    });

    it('should set high urgency for critical health', () => {
      const result = socialAwareness.inferIntention('player1', 'help!', {
        health: 2
      });

      expect(result.urgency).toBe('high');
    });

    it('should set medium urgency for low health', () => {
      const result = socialAwareness.inferIntention('player1', 'hello', {
        health: 5
      });

      expect(result.urgency).toBe('medium');
    });

    it('should set high urgency for urgent keywords', () => {
      const result = socialAwareness.inferIntention('player1', 'I need help urgently!', {});

      expect(result.urgency).toBe('high');
    });

    it('should set low urgency for normal message', () => {
      const result = socialAwareness.inferIntention('player1', 'hello', {
        health: 20
      });

      expect(result.urgency).toBe('low');
    });

    it('should include confidence in result', () => {
      const result = socialAwareness.inferIntention('player1', 'help me please!', {});

      expect(result.confidence).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should include reasoning in result', () => {
      const result = socialAwareness.inferIntention('player1', 'help!', { health: 5 });

      expect(result.reasoning).toBeDefined();
      expect(result.reasoning.matchedKeywords).toContain('help');
      expect(result.reasoning.healthContext).toBe(5);
    });

    it('should infer wants_company from follow me', () => {
      const result = socialAwareness.inferIntention('player1', 'follow me to the cave', {});

      expect(result.type).toBe('wants_company');
    });

    it('should infer wants_attack from attack keyword', () => {
      const result = socialAwareness.inferIntention('player1', 'attack the zombie!', {});

      expect(result.type).toBe('wants_attack');
    });

    it('should infer wants_info from question words', () => {
      const result = socialAwareness.inferIntention('player1', 'where is the village?', {});

      expect(result.type).toBe('wants_info');
    });
  });

  describe('BDI Model', () => {
    it('should initialize BDI state for new player', () => {
      const stateBefore = socialAwareness.getPlayerState('player1');
      expect(stateBefore).toBeNull();

      socialAwareness.inferIntention('player1', 'hello', {});

      const state = socialAwareness.getPlayerState('player1');
      expect(state).toBeDefined();
      expect(state.beliefs).toBeDefined();
      expect(state.desires).toBeDefined();
      expect(state.intentions).toBeDefined();
    });

    it('should update desires based on intention', () => {
      socialAwareness.inferIntention('player1', 'help me please', {});

      const state = socialAwareness.getPlayerState('player1');
      expect(state.desires).toContain('safety');
    });

    it('should update intentions based on intention type', () => {
      socialAwareness.inferIntention('player1', 'help me!', { health: 5 });

      const state = socialAwareness.getPlayerState('player1');
      expect(state.intentions.length).toBeGreaterThan(0);
      expect(state.intentions[0].type).toBe('seek_help');
    });

    it('should limit desires to 5 entries', () => {
      const intentionTypes = ['help me', 'trade please', 'follow me', 'attack that', 'where is', 'build a house'];

      intentionTypes.forEach(msg => {
        socialAwareness.inferIntention('player1', msg, {});
      });

      const state = socialAwareness.getPlayerState('player1');
      expect(state.desires.length).toBeLessThanOrEqual(5);
    });

    it('should limit intentions to 5 entries', () => {
      for (let i = 0; i < 10; i++) {
        socialAwareness.inferIntention('player1', 'help me', {});
      }

      const state = socialAwareness.getPlayerState('player1');
      expect(state.intentions.length).toBeLessThanOrEqual(5);
    });

    it('should extract location beliefs from message', () => {
      socialAwareness.inferIntention('player1', 'I am at spawn', {});

      const state = socialAwareness.getPlayerState('player1');
      expect(state.beliefs.length).toBeGreaterThan(0);
      expect(state.beliefs[0].type).toBe('location');
    });

    it('should update trust level starting at 0.5', () => {
      socialAwareness.inferIntention('player1', 'hello', {});

      const state = socialAwareness.getPlayerState('player1');
      expect(state.trustLevel).toBe(0.5);
    });

    it('should track last interaction timestamp', () => {
      const before = Date.now();
      socialAwareness.inferIntention('player1', 'hello', {});
      const after = Date.now();

      const state = socialAwareness.getPlayerState('player1');
      expect(state.lastInteraction).toBeGreaterThanOrEqual(before);
      expect(state.lastInteraction).toBeLessThanOrEqual(after);
    });
  });

  describe('getPlayerState', () => {
    it('should return null for unknown player', () => {
      expect(socialAwareness.getPlayerState('unknown')).toBeNull();
    });

    it('should return state for known player', () => {
      socialAwareness.inferIntention('player1', 'hello', {});

      const state = socialAwareness.getPlayerState('player1');
      expect(state).toBeDefined();
    });
  });

  describe('getAllPlayerStates', () => {
    it('should return empty map when no players', () => {
      const states = socialAwareness.getAllPlayerStates();
      expect(states.size).toBe(0);
    });

    it('should return all player states', () => {
      socialAwareness.inferIntention('player1', 'hello', {});
      socialAwareness.inferIntention('player2', 'hi', {});

      const states = socialAwareness.getAllPlayerStates();
      expect(states.size).toBe(2);
    });
  });

  describe('clearPlayerState', () => {
    it('should clear player state', () => {
      socialAwareness.trackSentiment('player1', { emotion: 'happy', confidence: 0.9 });
      socialAwareness.inferIntention('player1', 'hello', {});

      socialAwareness.clearPlayerState('player1');

      expect(socialAwareness.getPlayerState('player1')).toBeNull();
      expect(socialAwareness.getSentimentHistory('player1')).toEqual([]);
    });
  });

  describe('getSocialContext', () => {
    it('should return context with activePlayers count', () => {
      socialAwareness.inferIntention('player1', 'hello', {});

      const context = socialAwareness.getSocialContext();
      expect(context.activePlayers).toBe(1);
    });

    it('should identify urgent players', () => {
      socialAwareness.inferIntention('player1', 'help me!', { health: 2 });

      const context = socialAwareness.getSocialContext();
      expect(context.urgentPlayers.length).toBe(1);
      expect(context.urgentPlayers[0].playerId).toBe('player1');
    });

    it('should include recent interactions', () => {
      socialAwareness.inferIntention('player1', 'hello', {});

      const context = socialAwareness.getSocialContext();
      expect(context.recentInteractions.length).toBe(1);
    });

    it('should include targetPlayer when specified', () => {
      socialAwareness.inferIntention('player1', 'hello', {});

      const context = socialAwareness.getSocialContext('player1');
      expect(context.targetPlayer).toBeDefined();
      expect(context.targetPlayer.playerId).toBe('player1');
    });
  });

  describe('processMessage', () => {
    it('should process message without emotion detector', async () => {
      const result = await socialAwareness.processMessage('player1', 'hello', {});

      expect(result.playerId).toBe('player1');
      expect(result.intention).toBeDefined();
    });

    it('should call emotion detector when available', async () => {
      mockEmotionDetector.detectEmotion.mockResolvedValue({
        emotion: 'joy',
        confidence: 0.85
      });
      socialAwareness.setEmotionDetector(mockEmotionDetector);

      await socialAwareness.processMessage('player1', 'hello!', {});

      expect(mockEmotionDetector.detectEmotion).toHaveBeenCalledWith('hello!');
    });

    it('should track sentiment with detected emotion', async () => {
      mockEmotionDetector.detectEmotion.mockResolvedValue({
        emotion: 'joy',
        confidence: 0.85
      });
      socialAwareness.setEmotionDetector(mockEmotionDetector);

      await socialAwareness.processMessage('player1', 'hello!', {});

      const history = socialAwareness.getSentimentHistory('player1');
      expect(history.length).toBe(1);
      expect(history[0].emotion).toBe('joy');
    });

    it('should not track sentiment for low confidence', async () => {
      mockEmotionDetector.detectEmotion.mockResolvedValue({
        emotion: 'neutral',
        confidence: 0.5
      });
      socialAwareness.setEmotionDetector(mockEmotionDetector);

      await socialAwareness.processMessage('player1', 'test', {});

      const history = socialAwareness.getSentimentHistory('player1');
      expect(history.length).toBe(0);
    });

    it('should handle emotion detector errors gracefully', async () => {
      mockEmotionDetector.detectEmotion.mockRejectedValue(new Error('Detection failed'));
      socialAwareness.setEmotionDetector(mockEmotionDetector);

      const result = await socialAwareness.processMessage('player1', 'hello', {});

      expect(result.intention).toBeDefined();
    });

    it('should return social context in result', async () => {
      const result = await socialAwareness.processMessage('player1', 'hello', {});

      expect(result.socialContext).toBeDefined();
      expect(result.socialContext.activePlayers).toBe(1);
    });
  });

  describe('Urgency inference with emotion', () => {
    it('should set high urgency for negative emotion with high confidence', () => {
      socialAwareness.trackSentiment('player1', {
        emotion: 'fear',
        confidence: 0.85
      });

      const result = socialAwareness.inferIntention('player1', 'hello', {});
      expect(result.urgency).toBe('high');
    });

    it('should not increase urgency for low confidence negative emotion', () => {
      socialAwareness.trackSentiment('player1', {
        emotion: 'fear',
        confidence: 0.5
      });

      const result = socialAwareness.inferIntention('player1', 'hello', { health: 20 });
      expect(result.urgency).toBe('low');
    });

    it('should increase urgency for declining trend', () => {
      socialAwareness.trackSentiment('player1', { emotion: 'joy', confidence: 0.9 });
      socialAwareness.trackSentiment('player1', { emotion: 'happy', confidence: 0.8 });
      socialAwareness.trackSentiment('player1', { emotion: 'neutral', confidence: 0.7 });
      socialAwareness.trackSentiment('player1', { emotion: 'sadness', confidence: 0.8 });

      const state = socialAwareness.getPlayerState('player1');
      state.lastEmotion = null;

      socialAwareness.trackSentiment('player1', { emotion: 'neutral', confidence: 0.5 });

      const state2 = socialAwareness.getPlayerState('player1');
      state2.lastEmotion = null;

      const result = socialAwareness.inferIntention('player1', 'hello', { health: 20 });
      expect(['medium', 'low']).toContain(result.urgency);
    });
  });

  describe('Confidence calculation', () => {
    it('should increase confidence for context alignment', () => {
      const lowHealthResult = socialAwareness.inferIntention('player1', 'help me', { health: 3 });
      const normalHealthResult = socialAwareness.inferIntention('player2', 'help me', { health: 20 });

      expect(lowHealthResult.confidence).toBeGreaterThan(normalHealthResult.confidence);
    });

    it('should increase confidence for emotion alignment', () => {
      socialAwareness.trackSentiment('player1', { emotion: 'fear', confidence: 0.85 });

      const alignedResult = socialAwareness.inferIntention('player1', 'help me', {});
      const unknownResult = socialAwareness.inferIntention('player2', 'help me', {});

      expect(alignedResult.confidence).toBeGreaterThan(unknownResult.confidence);
    });

    it('should have low confidence for unknown intention', () => {
      const result = socialAwareness.inferIntention('player1', 'xyz', {});

      expect(result.type).toBe('unknown');
      expect(result.confidence).toBe(0.3);
    });
  });
});
