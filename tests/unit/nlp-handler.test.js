/**
 * NLP Handler Tests
 * Tests for natural language processing and intent parsing
 */

// Mock dependencies
jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('NLPHandler', () => {
  let NLPHandler;

  beforeEach(() => {
    jest.resetModules();
    NLPHandler = require('../../src/chat/nlp-handler');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isAddressed()', () => {
    it('should detect direct mention', () => {
      const result = NLPHandler.isAddressed('Bot, come here', 'Bot');
      expect(result.addressed).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should detect @-mention', () => {
      const result = NLPHandler.isAddressed('@bot help me', 'bot');
      expect(result.addressed).toBe(true);
      expect(result.confidence).toBe(1.0);
    });

    it('should detect command prefix', () => {
      const result = NLPHandler.isAddressed('!bot collect wood', 'bot');
      expect(result.addressed).toBe(true);
      expect(result.confidence).toBe(1.0);
    });

    it('should detect greeting pattern', () => {
      const result = NLPHandler.isAddressed('hey bot', 'bot');
      expect(result.addressed).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('should not match without context for pronouns', () => {
      const result = NLPHandler.isAddressed('you are great', 'bot', null);
      expect(result.addressed).toBe(false);
    });

    it('should match pronouns with context', () => {
      const context = {
        botSpokeLast: true,
        messagesSinceBotSpoke: 0
      };
      const result = NLPHandler.isAddressed('you are helpful', 'bot', context);
      expect(result.addressed).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should handle empty message', () => {
      const result = NLPHandler.isAddressed('', 'bot');
      expect(result.addressed).toBe(false);
    });

    it('should handle invalid bot name', () => {
      const result = NLPHandler.isAddressed('hello there', '');
      expect(result.addressed).toBe(false);
    });
  });

  describe('checkDirectMention()', () => {
    it('should find bot name at start', () => {
      const result = NLPHandler.checkDirectMention('bot help me', 'bot');
      expect(result.addressed).toBe(true);
      expect(result.confidence).toBe(1.0);
    });

    it('should find @-mention', () => {
      const result = NLPHandler.checkDirectMention('hello @bot there', 'bot');
      expect(result.addressed).toBe(true);
      expect(result.confidence).toBe(1.0);
    });

    it('should detect name anywhere with lower confidence', () => {
      const result = NLPHandler.checkDirectMention('hello bot there', 'bot');
      expect(result.addressed).toBe(true);
      expect(result.confidence).toBe(0.85);
    });

    it('should return false for no mention', () => {
      const result = NLPHandler.checkDirectMention('hello there', 'bot');
      expect(result.addressed).toBe(false);
    });
  });

  describe('checkCommandPrefix()', () => {
    it('should detect !bot prefix', () => {
      const result = NLPHandler.checkCommandPrefix('!bot help', 'bot');
      expect(result.addressed).toBe(true);
      expect(result.confidence).toBe(1.0);
    });

    it('should return false for other commands', () => {
      const result = NLPHandler.checkCommandPrefix('!help', 'bot');
      expect(result.addressed).toBe(false);
    });
  });

  describe('checkPronounPatterns()', () => {
    it('should match with botSpokeLast context', () => {
      const context = { botSpokeLast: true };
      const result = NLPHandler.checkPronounPatterns('what are you doing', context);
      expect(result.addressed).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should not match without context', () => {
      const result = NLPHandler.checkPronounPatterns('what are you doing', null);
      expect(result.addressed).toBe(false);
    });

    it('should boost confidence for questions', () => {
      const context = { botSpokeLast: true };
      const result = NLPHandler.checkPronounPatterns('how are you?', context);
      expect(result.addressed).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });
  });

  describe('runTestSet()', () => {
    it('should batch process test cases', () => {
      const testCases = [
        { message: 'bot help', expected: true },
        { message: 'hello there', expected: false },
      ];
      const result = NLPHandler.runTestSet(testCases, 'bot');
      expect(result.total).toBe(2);
      expect(result.correct).toBeDefined();
      expect(result.accuracy).toBeDefined();
    });

    it('should return failures array', () => {
      const testCases = [
        { message: 'bot help', expected: false }, // Wrong expectation
      ];
      const result = NLPHandler.runTestSet(testCases, 'bot');
      expect(result.failures).toBeDefined();
      expect(result.failures.length).toBeGreaterThan(0);
    });
  });
});
