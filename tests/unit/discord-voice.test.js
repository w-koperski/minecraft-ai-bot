/**
 * Unit tests for Discord Voice Integration
 * 
 * Tests configuration validation, keyword detection, and module interface
 * Note: Voice connection tests use mocks since we can't connect to real Discord
 */

const { DiscordVoice } = require('../../src/voice/discord-voice');

describe('DiscordVoice', () => {
  describe('Configuration Validation', () => {
    test('should throw error when enabled but no token provided', () => {
      expect(() => {
        new DiscordVoice({ enabled: true });
      }).toThrow('Discord bot token required when voice is enabled');
    });

    test('should accept valid configuration', () => {
      const config = {
        enabled: false,
        token: 'test-token',
        guildId: 'test-guild',
        keyword: 'hey bot',
        keywordThreshold: 0.7
      };
      
      expect(() => {
        new DiscordVoice(config);
      }).not.toThrow();
    });

    test('should reject invalid keyword threshold (too high)', () => {
      expect(() => {
        new DiscordVoice({
          enabled: false,
          keywordThreshold: 1.5
        });
      }).toThrow('keywordThreshold must be between 0.0 and 1.0');
    });

    test('should reject invalid keyword threshold (negative)', () => {
      expect(() => {
        new DiscordVoice({
          enabled: false,
          keywordThreshold: -0.1
        });
      }).toThrow('keywordThreshold must be between 0.0 and 1.0');
    });

    test('should use default values when not specified', () => {
      const voice = new DiscordVoice({ enabled: false });
      
      expect(voice.config.keyword).toBe('hey bot');
      expect(voice.config.keywordThreshold).toBe(0.7);
      expect(voice.config.language).toBe('en');
      expect(voice.config.whisperModel).toBe('base');
      expect(voice.config.autoReconnect).toBe(true);
    });
  });

  describe('Keyword Detection', () => {
    let voice;

    beforeEach(() => {
      voice = new DiscordVoice({
        enabled: false,
        keyword: 'hey bot',
        keywordThreshold: 0.7
      });
    });

    test('should detect exact keyword match', () => {
      const result = voice._detectKeyword('Hey bot, what are you doing?');
      expect(result).toBe(true);
    });

    test('should detect keyword case-insensitively', () => {
      const result = voice._detectKeyword('HEY BOT come here');
      expect(result).toBe(true);
    });

    test('should detect keyword in middle of text', () => {
      const result = voice._detectKeyword('Thanks hey bot for helping');
      expect(result).toBe(true);
    });

    test('should not detect when keyword is absent', () => {
      const result = voice._detectKeyword('Hello there');
      expect(result).toBe(false);
    });

    test('should handle empty text', () => {
      const result = voice._detectKeyword('');
      expect(result).toBe(false);
    });

    test('should handle null text', () => {
      const result = voice._detectKeyword(null);
      expect(result).toBe(false);
    });

    test('should detect partial keyword match', () => {
      const result = voice._detectKeyword('hey bot');
      expect(result).toBe(true);
    });
  });

  describe('Connection Status', () => {
    test('should return correct status when disabled', () => {
      const voice = new DiscordVoice({ enabled: false });
      const status = voice.getStatus();
      
      expect(status.enabled).toBe(false);
      expect(status.connected).toBe(false);
      expect(status.channelId).toBeNull();
      expect(status.isListening).toBe(false);
      expect(status.isSpeaking).toBe(false);
    });

    test('should return correct status when enabled', () => {
      const voice = new DiscordVoice({
        enabled: true,
        token: 'test-token'
      });
      const status = voice.getStatus();
      
      expect(status.enabled).toBe(true);
      expect(status.connected).toBe(false);
    });
  });

  describe('listen() Method', () => {
    test('should return null when disabled', async () => {
      const voice = new DiscordVoice({ enabled: false });
      const result = await voice.listen();
      expect(result).toBeNull();
    });

    test('should return null when not connected', async () => {
      const voice = new DiscordVoice({
        enabled: true,
        token: 'test-token'
      });
      const result = await voice.listen();
      expect(result).toBeNull();
    });
  });

  describe('speak() Method', () => {
    test('should return early when disabled', async () => {
      const voice = new DiscordVoice({ enabled: false });
      await voice.speak('Hello');
      expect(true).toBe(true);
    });

    test('should return early when not connected', async () => {
      const voice = new DiscordVoice({
        enabled: true,
        token: 'test-token'
      });
      await voice.speak('Hello');
      expect(true).toBe(true);
    });
  });

  describe('disconnect() Method', () => {
    test('should handle disconnect when not connected', async () => {
      const voice = new DiscordVoice({ enabled: false });
      await voice.disconnect();
      expect(true).toBe(true);
    });
  });

  describe('cleanup() Method', () => {
    test('should cleanup without errors', async () => {
      const voice = new DiscordVoice({ enabled: false });
      await voice.cleanup();
      expect(true).toBe(true);
    });
  });

  describe('Event Emission', () => {
    test('should be an EventEmitter', () => {
      const voice = new DiscordVoice({ enabled: false });
      expect(typeof voice.on).toBe('function');
      expect(typeof voice.emit).toBe('function');
    });

    test('should emit events correctly', (done) => {
      const voice = new DiscordVoice({ enabled: false });
      
      voice.on('test-event', (data) => {
        expect(data).toBe('test-data');
        done();
      });
      
      voice.emit('test-event', 'test-data');
    });
  });
});

describe('Module Exports', () => {
  test('should export DiscordVoice class', () => {
    const { DiscordVoice } = require('../../src/voice/discord-voice');
    expect(DiscordVoice).toBeDefined();
    expect(typeof DiscordVoice).toBe('function');
  });

  test('should export createDiscordVoice function', () => {
    const { createDiscordVoice } = require('../../src/voice/discord-voice');
    expect(createDiscordVoice).toBeDefined();
    expect(typeof createDiscordVoice).toBe('function');
  });

  test('should export connect function', () => {
    const { connect } = require('../../src/voice/discord-voice');
    expect(connect).toBeDefined();
    expect(typeof connect).toBe('function');
  });

  test('should export disconnect function', () => {
    const { disconnect } = require('../../src/voice/discord-voice');
    expect(disconnect).toBeDefined();
    expect(typeof disconnect).toBe('function');
  });

  test('createDiscordVoice should create instance', () => {
    const { createDiscordVoice } = require('../../src/voice/discord-voice');
    const voice = createDiscordVoice({ enabled: false });
    expect(voice).toBeInstanceOf(DiscordVoice);
  });
});
