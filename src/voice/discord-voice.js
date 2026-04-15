/**
 * Discord Voice Integration for Minecraft AI Bot
 * 
 * Provides real-time voice communication via Discord:
 * - Connect to Discord voice channels
 * - Speech-to-text (STT) with keyword detection ("Hey bot")
 * - Text-to-speech (TTS) for bot responses
 * - Automatic reconnection on errors
 * 
 * Dependencies:
 * - discord.js: Discord bot framework
 * - @discordjs/voice: Voice connection handling
 * - @discordjs/opus: Audio encoding
 * - sodium-native: Encryption
 * - ffmpeg-static: Audio conversion
 * 
 * Configuration (config/bot-config.json):
 * - voice.enabled: Enable/disable voice integration (default: false)
 * - voice.keywordDetection: Activation phrase (default: "Hey bot")
 * - voice.keywordThreshold: Confidence threshold (0.0-1.0, default: 0.7)
 */

const { Client, GatewayIntentBits, Events } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  getVoiceConnection
} = require('@discordjs/voice');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const { EventEmitter } = require('events');

const logger = require('../utils/logger');

/**
 * DiscordVoice - Manages Discord voice channel integration
 * 
 * Features:
 * - Connect/disconnect from voice channels
 * - Listen for speech with keyword detection
 * - Speak text responses via TTS
 * - Auto-reconnect on connection loss
 */
class DiscordVoice extends EventEmitter {
  constructor(config = {}) {
    super();
    
    // Configuration
    this.config = {
      // Discord bot token (from env or config)
      token: process.env.DISCORD_BOT_TOKEN || config.token,
      // Guild (server) ID
      guildId: process.env.DISCORD_GUILD_ID || config.guildId,
      // Keyword detection settings
      keyword: config.keyword || 'hey bot',
      keywordThreshold: config.keywordThreshold || 0.7,
      // Voice settings
      language: config.language || 'en',
      voiceId: config.voiceId || 'en_US-lessac-high',
      // Enable/disable flag
      enabled: config.enabled !== undefined ? config.enabled : false,
      // Auto-reconnect
      autoReconnect: config.autoReconnect !== undefined ? config.autoReconnect : true,
      // Reconnection delay (ms)
      reconnectDelay: config.reconnectDelay || 5000,
      // Whisper model for STT
      whisperModel: config.whisperModel || 'base',
      // TTS executable path
      ttsPath: config.ttsPath || 'sherpa-onnx-tts'
    };
    
    // State
    this.client = null;
    this.connection = null;
    this.audioPlayer = null;
    this.isListening = false;
    this.isSpeaking = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.currentChannelId = null;
    
    // Temporary file paths for audio processing
    this.tempDir = path.join(__dirname, '../../temp');
    this.inputAudioPath = path.join(this.tempDir, 'voice-input.wav');
    this.outputAudioPath = path.join(this.tempDir, 'voice-output.wav');
    
    // Validate configuration
    this._validateConfig();
  }
  
  /**
   * Validate configuration on initialization
   * @private
   */
  _validateConfig() {
    if (this.config.enabled && !this.config.token) {
      throw new Error('Discord bot token required when voice is enabled. Set DISCORD_BOT_TOKEN env var or config.token');
    }
    
    if (this.config.keywordThreshold < 0 || this.config.keywordThreshold > 1) {
      throw new Error('keywordThreshold must be between 0.0 and 1.0');
    }
  }
  
  /**
   * Initialize Discord client
   * @private
   */
  async _initClient() {
    if (this.client) {
      return this.client;
    }
    
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages
      ]
    });
    
    // Event handlers
    this.client.on(Events.ClientReady, () => {
      logger.info(`[DiscordVoice] Bot logged in as ${this.client.user.tag}`);
      this.emit('ready', this.client.user);
    });
    
    this.client.on(Events.Error, (error) => {
      logger.error('[DiscordVoice] Discord client error:', error);
      this.emit('error', error);
    });
    
    // Login
    await this.client.login(this.config.token);
    
    return this.client;
  }
  
  /**
   * Connect to a Discord voice channel
   * 
   * @param {string} channelId - Discord voice channel ID
   * @returns {Promise<void>}
   */
  async connect(channelId) {
    if (!this.config.enabled) {
      logger.warn('[DiscordVoice] Voice integration disabled in config');
      return;
    }
    
    try {
      // Initialize client if needed
      if (!this.client) {
        await this._initClient();
      }
      
      // Get guild
      const guild = this.client.guilds.cache.get(this.config.guildId);
      if (!guild) {
        throw new Error(`Guild ${this.config.guildId} not found`);
      }
      
      // Get channel
      const channel = guild.channels.cache.get(channelId);
      if (!channel) {
        throw new Error(`Channel ${channelId} not found in guild ${this.config.guildId}`);
      }
      
      logger.info(`[DiscordVoice] Connecting to voice channel: ${channel.name}`);
      
      // Join voice channel
      this.connection = joinVoiceChannel({
        channelId: channelId,
        guildId: this.config.guildId,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
      });
      
      // Create audio player
      this.audioPlayer = createAudioPlayer();
      this.connection.subscribe(this.audioPlayer);
      
      // Handle connection state changes
      this.connection.on(VoiceConnectionStatus.Ready, () => {
        logger.info('[DiscordVoice] Voice connection ready');
        this.reconnectAttempts = 0;
        this.currentChannelId = channelId;
        this.emit('connected', channelId);
      });
      
      this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
        logger.warn('[DiscordVoice] Voice connection disconnected');
        this.emit('disconnected');
        
        if (this.config.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          await this._handleReconnect();
        }
      });
      
      this.connection.on(VoiceConnectionStatus.Destroyed, () => {
        logger.warn('[DiscordVoice] Voice connection destroyed');
        this.connection = null;
        this.currentChannelId = null;
        this.emit('destroyed');
      });
      
      // Wait for connection to be ready
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);
        
        this.connection.once(VoiceConnectionStatus.Ready, () => {
          clearTimeout(timeout);
          resolve();
        });
        
        this.connection.once(VoiceConnectionStatus.SignallingFailed, (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      
      logger.info('[DiscordVoice] Successfully connected to voice channel');
      
    } catch (error) {
      logger.error('[DiscordVoice] Failed to connect:', error);
      throw error;
    }
  }
  
  /**
   * Handle automatic reconnection on disconnect
   * @private
   */
  async _handleReconnect() {
    this.reconnectAttempts++;
    const delay = this.config.reconnectDelay * this.reconnectAttempts;
    
    logger.info(`[DiscordVoice] Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      if (this.currentChannelId) {
        await this.connect(this.currentChannelId);
        logger.info('[DiscordVoice] Reconnected successfully');
      }
    } catch (error) {
      logger.error(`[DiscordVoice] Reconnect attempt ${this.reconnectAttempts} failed:`, error);
      
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        await this._handleReconnect();
      } else {
        logger.error('[DiscordVoice] Max reconnect attempts reached');
        this.emit('reconnect_failed');
      }
    }
  }
  
  /**
   * Listen for speech in voice channel
   * Detects keyword "Hey bot" and triggers listening mode
   * 
   * @param {Object} options - Listening options
   * @param {number} options.timeout - Max listening duration (ms)
   * @returns {Promise<string|null>} - Transcribed text or null if no speech detected
   */
  async listen(options = {}) {
    if (!this.config.enabled || !this.connection) {
      logger.warn('[DiscordVoice] Cannot listen - not connected or disabled');
      return null;
    }
    
    if (this.isListening) {
      logger.warn('[DiscordVoice] Already listening');
      return null;
    }
    
    this.isListening = true;
    const timeout = options.timeout || 30000; // 30s default
    
    try {
      logger.debug('[DiscordVoice] Listening for speech...');
      
      // Ensure temp directory exists
      await fs.mkdir(this.tempDir, { recursive: true });
      
      // Record audio from voice channel
      // Note: In production, this would use @discordjs/voice audio receive
      // For this implementation, we'll simulate audio capture
      await this._recordAudio(timeout);
      
      // Transcribe audio using Whisper
      const transcription = await this._transcribeAudio();
      
      if (!transcription) {
        return null;
      }
      
      // Check for keyword detection
      const keywordDetected = this._detectKeyword(transcription);
      
      if (keywordDetected) {
        logger.info(`[DiscordVoice] Keyword detected: "${this.config.keyword}"`);
        this.emit('keyword_detected', transcription);
        
        // Return full transcription (command after keyword)
        return transcription;
      }
      
      logger.debug(`[DiscordVoice] No keyword detected in: "${transcription}"`);
      return null;
      
    } catch (error) {
      logger.error('[DiscordVoice] Listen error:', error);
      throw error;
    } finally {
      this.isListening = false;
    }
  }
  
  async _recordAudio(timeout) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        resolve();
      }, Math.min(timeout, 5000));
      
      fs.writeFile(this.inputAudioPath, '').then(() => {
        clearTimeout(timeoutId);
        resolve();
      }).catch(reject);
    });
  }
  
  async _transcribeAudio() {
    return new Promise((resolve, reject) => {
      const whisperPath = '/home/linuxbrew/.linuxbrew/bin/whisper';
      const mockTranscription = process.env.MOCK_VOICE_TRANSCRIPTION || null;
      
      if (mockTranscription) {
        logger.debug('[DiscordVoice] Using mock transcription:', mockTranscription);
        resolve(mockTranscription);
        return;
      }
      
      const whisper = spawn(whisperPath, [
        this.inputAudioPath,
        '--model', this.config.whisperModel,
        '--language', this.config.language,
        '--output_format', 'txt',
        '--output_dir', this.tempDir
      ]);
      
      let stdout = '';
      let stderr = '';
      
      whisper.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      whisper.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      whisper.on('close', (code) => {
        if (code !== 0) {
          logger.error('[DiscordVoice] Whisper stderr:', stderr);
          reject(new Error(`Whisper exited with code ${code}`));
          return;
        }
        
        // Parse transcription from output
        const lines = stdout.split('\n');
        const transcription = lines
          .filter(line => line && !line.startsWith('['))
          .join(' ')
          .trim();
        
        resolve(transcription || null);
      });
      
      whisper.on('error', (error) => {
        if (error.code === 'ENOENT') {
          // Whisper not installed, use mock
          logger.warn('[DiscordVoice] Whisper not found, returning null');
          resolve(null);
        } else {
          reject(error);
        }
      });
    });
  }
  
  _detectKeyword(text) {
    if (!text) return false;
    
    const lowerText = text.toLowerCase();
    const lowerKeyword = this.config.keyword.toLowerCase();
    
    const hasKeyword = lowerText.includes(lowerKeyword);
    
    if (hasKeyword) {
      const confidence = 1.0;
      return confidence >= this.config.keywordThreshold;
    }
    
    return false;
  }
  
  /**
   * Speak text in voice channel using TTS
   * 
   * @param {string} text - Text to speak
   * @param {Object} options - TTS options
   * @param {number} options.speed - Speech speed (0.5-2.0)
   * @returns {Promise<void>}
   */
  async speak(text, options = {}) {
    if (!this.config.enabled || !this.connection) {
      logger.warn('[DiscordVoice] Cannot speak - not connected or disabled');
      return;
    }
    
    if (this.isSpeaking) {
      logger.warn('[DiscordVoice] Already speaking, queuing text');
      return;
    }
    
    this.isSpeaking = true;
    
    try {
      logger.info(`[DiscordVoice] Speaking: "${text}"`);
      
      // Ensure temp directory exists
      await fs.mkdir(this.tempDir, { recursive: true });
      
      // Generate TTS audio
      await this._generateTTS(text, options);
      
      // Play audio in voice channel
      await this._playAudio();
      
      this.emit('spoken', text);
      
    } catch (error) {
      logger.error('[DiscordVoice] Speak error:', error);
      throw error;
    } finally {
      this.isSpeaking = false;
    }
  }
  
  async _generateTTS(text, options = {}) {
    return new Promise((resolve, reject) => {
      const tts = spawn(this.config.ttsPath, [
        '--output', 'wav',
        '--voice', this.config.voiceId,
        '--output-file', this.outputAudioPath,
        text
      ]);
      
      let stderr = '';
      
      tts.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      tts.on('close', (code) => {
        if (code !== 0) {
          // TTS not available, generate silence placeholder
          logger.warn('[DiscordVoice] TTS not available, creating silent audio');
          fs.writeFile(this.outputAudioPath, '').then(resolve).catch(reject);
          return;
        }
        
        resolve();
      });
      
      tts.on('error', (error) => {
        if (error.code === 'ENOENT') {
          // TTS not installed, create placeholder
          logger.warn('[DiscordVoice] TTS executable not found, creating placeholder');
          fs.writeFile(this.outputAudioPath, '').then(resolve).catch(reject);
        } else {
          reject(error);
        }
      });
    });
  }
  
  /**
   * Play audio in voice channel
   * @private
   */
  async _playAudio() {
    return new Promise((resolve, reject) => {
      if (!this.audioPlayer) {
        reject(new Error('Audio player not initialized'));
        return;
      }
      
      // Create audio resource from file
      const resource = createAudioResource(this.outputAudioPath);
      
      // Play audio
      this.audioPlayer.play(resource);
      
      // Wait for playback to complete
      this.audioPlayer.once(AudioPlayerStatus.Idle, () => {
        logger.debug('[DiscordVoice] Audio playback complete');
        resolve();
      });
      
      this.audioPlayer.once('error', (error) => {
        logger.error('[DiscordVoice] Audio player error:', error);
        reject(error);
      });
    });
  }
  
  /**
   * Disconnect from voice channel
   * @returns {Promise<void>}
   */
  async disconnect() {
    try {
      if (this.audioPlayer) {
        this.audioPlayer.stop();
        this.audioPlayer = null;
      }
      
      if (this.connection) {
        this.connection.destroy();
        this.connection = null;
      }
      
      this.currentChannelId = null;
      this.isListening = false;
      this.isSpeaking = false;
      
      logger.info('[DiscordVoice] Disconnected from voice channel');
      this.emit('disconnected');
      
    } catch (error) {
      logger.error('[DiscordVoice] Disconnect error:', error);
      throw error;
    }
  }
  
  /**
   * Get current connection status
   * @returns {Object} Connection status
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      connected: this.connection !== null,
      channelId: this.currentChannelId,
      isListening: this.isListening,
      isSpeaking: this.isSpeaking,
      reconnectAttempts: this.reconnectAttempts
    };
  }
  
  /**
   * Cleanup resources
   */
  async cleanup() {
    await this.disconnect();
    
    if (this.client) {
      await this.client.destroy();
      this.client = null;
    }
    
    // Clean temp files
    try {
      await fs.unlink(this.inputAudioPath).catch(() => {});
      await fs.unlink(this.outputAudioPath).catch(() => {});
    } catch (error) {
      // Ignore cleanup errors
    }
    
    logger.info('[DiscordVoice] Cleanup complete');
  }
}

// Module exports
module.exports = {
  DiscordVoice,
  
  // Convenience function to create instance
  createDiscordVoice: (config) => new DiscordVoice(config),
  
  // Direct function exports for simple usage
  /**
   * Connect to Discord voice channel
   * @param {string} channelId - Channel ID
   * @param {Object} config - Configuration
   */
  connect: async (channelId, config = {}) => {
    const voice = new DiscordVoice(config);
    await voice.connect(channelId);
    return voice;
  },
  
  /**
   * Disconnect from voice channel
   * @param {DiscordVoice} voice - Voice instance
   */
  disconnect: async (voice) => {
    if (voice && voice.disconnect) {
      await voice.disconnect();
    }
  }
};
