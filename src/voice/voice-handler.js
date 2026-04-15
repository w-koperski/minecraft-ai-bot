/**
 * Voice Handler - Bridges Discord voice and chat handler
 *
 * Flow: Voice message → STT → chat handler → response → TTS
 * 
 * Features:
 * - Keyword activation ("Hey bot")
 * - Push-to-talk support
 * - Graceful error handling (fallback to text)
 * - Optional (disabled by default)
 *
 * Dependencies:
 * - discord-voice.js (audio I/O)
 * - chat-handler.js (message processing)
 */

'use strict';

const logger = require('../utils/logger');
const { DiscordVoice } = require('./discord-voice');
const { createChatHandler, COMMANDS } = require('../chat/chat-handler');
const path = require('path');

/**
 * VoiceHandler - Manages voice → chat → voice pipeline
 */
class VoiceHandler {
  constructor(config = {}) {
    this.config = {
      // Voice integration enabled?
      enabled: config.enabled !== undefined ? config.enabled : false,
      // Keyword activation phrase
      keyword: config.keyword || 'hey bot',
      // Require keyword for activation
      requireKeyword: config.requireKeyword !== undefined ? config.requireKeyword : true,
      // Push-to-talk mode (if true, only listen when activated)
      pushToTalk: config.pushToTalk || false,
      // Max listening duration (ms)
      listenTimeout: config.listenTimeout || 30000,
      // Discord voice config
      discord: config.discord || {},
      // Fallback to text on error
      fallbackToText: config.fallbackToText !== undefined ? config.fallbackToText : true,
      // Log voice interactions
      logInteractions: config.logInteractions !== undefined ? config.logInteractions : true
    };

    // State
    this.discordVoice = null;
    this.chatHandler = null;
    this.bot = null;
    this.isProcessing = false;
    this.isInitialized = false;
    this.activationMode = 'idle'; // 'idle', 'listening', 'processing'
  }

  /**
   * Initialize voice handler
   * @param {Object} bot - Mineflayer bot instance
   * @param {Object} options - Initialization options
   * @param {string} options.channelId - Discord voice channel ID
   * @returns {Promise<void>}
   */
  async initialize(bot, options = {}) {
    if (!this.config.enabled) {
      logger.info('[VoiceHandler] Voice integration disabled');
      return;
    }

    this.bot = bot;

    try {
      this.discordVoice = new DiscordVoice({
        ...this.config.discord,
        keyword: this.config.keyword,
        enabled: true
      });

      this.chatHandler = createChatHandler(bot);

      if (options.channelId) {
        await this.discordVoice.connect(options.channelId);
      }

      this._setupEventListeners();

      this.isInitialized = true;
      logger.info('[VoiceHandler] Initialized successfully');

    } catch (error) {
      logger.error('[VoiceHandler] Initialization failed:', error);

      if (!this.config.fallbackToText) {
        throw error;
      }

      logger.warn('[VoiceHandler] Falling back to text mode');
    }
  }

  /**
   * Set up event listeners for Discord voice
   * @private
   */
  _setupEventListeners() {
    if (!this.discordVoice) return;

    this.discordVoice.on('keyword_detected', (transcription) => {
      logger.info(`[VoiceHandler] Keyword detected in: "${transcription}"`);
      this._handleKeywordActivation(transcription);
    });

    this.discordVoice.on('connected', (channelId) => {
      logger.info(`[VoiceHandler] Connected to voice channel: ${channelId}`);
    });

    this.discordVoice.on('disconnected', () => {
      logger.warn('[VoiceHandler] Disconnected from voice channel');
    });

    this.discordVoice.on('error', (error) => {
      logger.error('[VoiceHandler] Voice error:', error);
      this._handleVoiceError(error);
    });
  }

  /**
   * Handle voice message (main entry point)
   * @param {Object} options - Voice message options
   * @param {string} options.userId - User who sent the message
   * @param {Buffer} options.audioData - Audio buffer (optional)
   * @returns {Promise<string|null>} - Response or null if no message
   */
  async handleVoiceMessage(options = {}) {
    if (!this.config.enabled || !this.isInitialized) {
      logger.warn('[VoiceHandler] Voice handler not ready or disabled');
      return null;
    }

    if (this.isProcessing) {
      logger.warn('[VoiceHandler] Already processing a message');
      return null;
    }

    this.isProcessing = true;
    this.activationMode = 'processing';

    try {
      logger.debug('[VoiceHandler] Listening for voice input...');
      const transcription = await this.discordVoice.listen({
        timeout: this.config.listenTimeout
      });

      if (!transcription) {
        logger.debug('[VoiceHandler] No speech detected');
        return null;
      }

      if (this.config.logInteractions) {
        this._logInteraction('input', transcription, options.userId);
      }

      if (this.config.requireKeyword && !this._containsKeyword(transcription)) {
        logger.debug(`[VoiceHandler] No keyword in: "${transcription}"`);
        return null;
      }

      const command = this._extractCommand(transcription);
      logger.info(`[VoiceHandler] Processing command: "${command}"`);

      const response = await this._processWithChatHandler(command, options.userId);

      if (this.config.logInteractions) {
        this._logInteraction('output', response, options.userId);
      }

      if (response && this.discordVoice) {
        await this.discordVoice.speak(response);
      }

      return response;

    } catch (error) {
      logger.error('[VoiceHandler] Voice message processing failed:', error);
      return this._handleVoiceError(error);

    } finally {
      this.isProcessing = false;
      this.activationMode = 'idle';
    }
  }

  /**
   * Handle keyword activation event
   * @private
   */
  async _handleKeywordActivation(transcription) {
    if (!this.config.requireKeyword) return;

    this.activationMode = 'listening';
    const command = this._extractCommand(transcription);

    if (command) {
      logger.info(`[VoiceHandler] Processing keyword-activated command: "${command}"`);
      await this.handleVoiceMessage({ userId: 'voice_user' });
    }
  }

  /**
   * Check if transcription contains keyword
   * @private
   */
  _containsKeyword(text) {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    const lowerKeyword = this.config.keyword.toLowerCase();
    return lowerText.includes(lowerKeyword);
  }

  /**
   * Extract command from transcription (remove keyword)
   * @private
   */
  _extractCommand(transcription) {
    if (!transcription) return '';

    const lowerText = transcription.toLowerCase();
    const lowerKeyword = this.config.keyword.toLowerCase();
    const keywordIndex = lowerText.indexOf(lowerKeyword);

    if (keywordIndex === -1) {
      return this.config.requireKeyword ? '' : transcription.trim();
    }

    return transcription.substring(keywordIndex + this.config.keyword.length).trim();
  }

  /**
   * Process command via chat handler
   * @private
   */
  async _processWithChatHandler(command, userId = 'voice_user') {
    if (!this.chatHandler || !this.bot) {
      throw new Error('Chat handler or bot not initialized');
    }

    try {
      const parts = command.trim().split(/\s+/);
      const action = parts[0]?.toLowerCase();
      const args = parts.slice(1);

      if (!action) {
        return 'Please provide a command. Say "help" for available commands.';
      }

      const stateManager = this.chatHandler.stateManager;
      const timestamp = Date.now();

      switch (action) {
        case 'collect': {
          const resource = args.join(' ') || 'oak logs';
          await stateManager.write('commands', {
            action: 'collect',
            target: resource,
            amount: 64,
            requestedBy: userId,
            timestamp,
            source: 'voice'
          });
          return `Okay, collecting ${resource} (64 items)`;
        }

        case 'build': {
          const structure = args.join(' ') || 'house';
          await stateManager.write('commands', {
            action: 'build',
            structure,
            requestedBy: userId,
            timestamp,
            source: 'voice'
          });
          return `Okay, building ${structure}`;
        }

        case 'goto': {
          const destination = args.join(' ') || '0 64 0';
          const posParts = destination.split(/\s+/);
          await stateManager.write('commands', {
            action: 'goto',
            position: {
              x: parseInt(posParts[0]) || 0,
              y: parseInt(posParts[1]) || 64,
              z: parseInt(posParts[2]) || 0
            },
            requestedBy: userId,
            timestamp,
            source: 'voice'
          });
          return `Okay, navigating to ${destination}`;
        }

        case 'status': {
          const pos = this.bot.entity.position;
          return [
            `Health: ${this.bot.health?.toFixed(1) || 0}/20`,
            `Position: ${Math.round(pos.x)} ${Math.round(pos.y)} ${Math.round(pos.z)}`,
            `Game Mode: ${this.bot.game.gameMode || 'unknown'}`
          ].join(' | ');
        }

        case 'stop': {
          await stateManager.write('commands', {
            action: 'stop',
            requestedBy: userId,
            timestamp,
            source: 'voice'
          });
          this.bot.emit('stop_requested');
          return 'Stopping all actions';
        }

        case 'help': {
          return [
            'Available voice commands:',
            '  collect <resource> - Collect resources',
            '  build <structure> - Build a structure',
            '  goto <x y z> - Navigate to location',
            '  status - Show bot status',
            '  stop - Stop current action',
            '  help - Show this help',
            '',
            `Say "${this.config.keyword}" followed by your command.`
          ].join('\n');
        }

        default:
          return `Unknown command: "${action}". Say "help" for available commands.`;
      }

    } catch (error) {
      logger.error('[VoiceHandler] Command processing failed:', error);
      throw error;
    }
  }

  /**
   * Handle voice errors gracefully
   * @private
   */
  _handleVoiceError(error) {
    logger.error('[VoiceHandler] Voice error:', error.message);

    if (!this.config.fallbackToText) {
      return null;
    }

    if (error.message.includes('not connected')) {
      return 'Voice not connected. Please try again or use text chat.';
    }

    if (error.message.includes('timeout')) {
      return 'Voice timeout. Please speak more clearly or try again.';
    }

    if (error.message.includes('transcription')) {
      return 'Could not understand. Please try again.';
    }

    return 'Voice error occurred. Falling back to text chat.';
  }

  /**
   * Log voice interaction for debugging
   * @private
   */
  _logInteraction(type, text, userId) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, type, userId, text, activationMode: this.activationMode };
    logger.info(`[VoiceHandler] Interaction: ${JSON.stringify(logEntry)}`);
  }

  /**
   * Activate push-to-talk mode
   * @returns {Promise<void>}
   */
  async activatePushToTalk() {
    if (!this.config.pushToTalk || !this.discordVoice) {
      return;
    }

    this.activationMode = 'listening';
    logger.debug('[VoiceHandler] Push-to-talk activated');
  }

  /**
   * Deactivate push-to-talk mode
   * @returns {Promise<void>}
   */
  async deactivatePushToTalk() {
    if (!this.config.pushToTalk) {
      return;
    }

    this.activationMode = 'idle';
    logger.debug('[VoiceHandler] Push-to-talk deactivated');
  }

  /**
   * Get current status
   * @returns {Object}
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      initialized: this.isInitialized,
      processing: this.isProcessing,
      activationMode: this.activationMode,
      connected: this.discordVoice?.getStatus()?.connected || false,
      keyword: this.config.keyword,
      requireKeyword: this.config.requireKeyword
    };
  }

  /**
   * Shutdown voice handler
   * @returns {Promise<void>}
   */
  async shutdown() {
    try {
      if (this.discordVoice) {
        await this.discordVoice.cleanup();
      }

      if (this.chatHandler) {
        this.chatHandler.remove();
      }

      this.isInitialized = false;
      this.activationMode = 'idle';

      logger.info('[VoiceHandler] Shutdown complete');

    } catch (error) {
      logger.error('[VoiceHandler] Shutdown error:', error);
    }
  }
}

module.exports = {
  VoiceHandler,
  createVoiceHandler: (config) => new VoiceHandler(config),
  initialize: async (bot, config = {}, channelId = null) => {
    const handler = new VoiceHandler(config);
    await handler.initialize(bot, { channelId });
    return handler;
  }
};
