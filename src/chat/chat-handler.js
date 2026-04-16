/**
 * @fileoverview In-game chat processing with NLP detection and conversation memory
 * 
 * Features:
 * - Natural language detection via nlp-handler.js
 * - Conversation memory via conversation-store.js
 * - Personality-influenced responses via personality-engine.js
 * - Context tracking (last 5 messages for pronoun resolution)
 * - Command system as fallback (!bot commands)
 * - Text and voice chat support
 */

'use strict';

const path = require('path');
const StateManager = require('../utils/state-manager');
const logger = require('../utils/logger');
const { isAddressed } = require('./nlp-handler');
const ConversationStore = require('../memory/conversation-store');
const { getInstance: getPersonalityEngine } = require('../../personality/personality-engine');
const emotionDetector = require('../emotion/emotion-detector');
const SocialAwareness = require('../social/social-awareness');

// Context window size for pronoun resolution (scope limit)
const CONTEXT_WINDOW_SIZE = 5;

// Command definitions (preserved as fallback)
const COMMANDS = {
  collect: { description: 'Collect resources (e.g., !bot collect wood)', usage: '!bot collect <resource>' },
  build: { description: 'Build a structure', usage: '!bot build <structure>' },
  goto: { description: 'Navigate to a location', usage: '!bot goto <x> <y> <z>' },
  status: { description: 'Show bot status', usage: '!bot status' },
  stop: { description: 'Stop current action and halt', usage: '!bot stop' },
  help: { description: 'Show available commands', usage: '!bot help' }
};

/**
 * Parse a command string into action and arguments
 * @param {string} command - The command string to parse
 * @returns {{action: string, args: string[]}} - Parsed command
 */
function parseCommand(command) {
  const parts = command.trim().split(/\s+/);
  return { action: parts[0]?.toLowerCase(), args: parts.slice(1) };
}

/**
 * Get formatted bot status string
 * @param {object} bot - Mineflayer bot instance
 * @returns {Promise<string>} - Status string
 */
async function getBotStatus(bot) {
  const pos = bot.entity.position;
  return [
    `Health: ${bot.health?.toFixed(1) || 0}/20`,
    `Position: ${Math.round(pos.x)} ${Math.round(pos.y)} ${Math.round(pos.z)}`,
    `Game Mode: ${bot.game.gameMode || 'unknown'}`
  ].join(' | ');
}

/**
 * Execute a command and return response
 * @param {string} username - Player who sent command
 * @param {string} action - Command action
 * @param {string[]} args - Command arguments
 * @param {object} bot - Mineflayer bot instance
 * @param {StateManager} stateManager - State manager instance
 * @returns {Promise<string>} - Response message
 */
async function executeCommand(username, action, args, bot, stateManager) {
  const timestamp = Date.now();

  switch (action) {
    case 'collect': {
      const resource = args.join(' ') || 'oak logs';
      await stateManager.write('commands', { action: 'collect', target: resource, amount: 64, requestedBy: username, timestamp });
      return `Okay ${username}, collecting ${resource} (64 items)`;
    }

    case 'build': {
      const structure = args.join(' ') || 'house';
      await stateManager.write('commands', { action: 'build', structure, requestedBy: username, timestamp });
      return `Okay ${username}, building ${structure}`;
    }

    case 'goto': {
      const destination = args.join(' ') || '0 64 0';
      const parts = destination.split(/\s+/);
      await stateManager.write('commands', {
        action: 'goto',
        position: { x: parseInt(parts[0]) || 0, y: parseInt(parts[1]) || 64, z: parseInt(parts[2]) || 0 },
        requestedBy: username,
        timestamp
      });
      return `Okay ${username}, navigating to ${destination}`;
    }

    case 'status':
      return `[Status] ${await getBotStatus(bot)}`;

    case 'stop':
      await stateManager.write('commands', { action: 'stop', requestedBy: username, timestamp });
      bot.emit('stop_requested');
      return `Okay ${username}, stopping all actions`;

    case 'help':
      return ['[Commands]', Object.entries(COMMANDS).map(([, info]) => ` ${info.usage} - ${info.description}`).join('\n'), 'Example: !bot collect wood'].join('\n');

    default:
      return `Unknown command: "${action}". Type !bot help for available commands.`;
  }
}

/**
 * Generate a personality-influenced response to a natural language message
 * @param {string} username - Player who sent message
 * @param {string} message - Original message
 * @param {object} bot - Mineflayer bot instance
 * @param {object} personalityEngine - Personality engine instance
* @param {object} conversationStore - Conversation store instance
 * @param {object} context - Conversation context
 * @param {object|null} detectedEmotion - Detected emotion {emotion, confidence} or null
 * @returns {Promise<string>} - Generated response
 */
async function generateNaturalResponse(username, message, bot, personalityEngine, conversationStore, context, detectedEmotion = null) {
  const traits = personalityEngine.getTraits();
  const relationship = await conversationStore.getRelationship(username);

  // Get current activity for context
  const pos = bot.entity.position;
  const activity = getActivityDescription(bot);

  // Analyze message intent (simple pattern matching)
  const intent = analyzeIntent(message);

  // Generate response based on intent and personality
  let response;

  switch (intent.type) {
    case 'question_activity':
      response = generateActivityResponse(username, activity, traits, relationship, detectedEmotion);
      break;

    case 'question_status':
      response = await generateStatusResponse(username, bot, traits, relationship, detectedEmotion);
      break;

    case 'greeting':
      response = generateGreetingResponse(username, traits, relationship, detectedEmotion);
      break;

    case 'question_identity':
      response = generateIdentityResponse(username, traits, detectedEmotion);
      break;

    case 'gratitude':
      response = generateGratitudeResponse(username, traits, relationship, detectedEmotion);
      break;

    case 'farewell':
      response = generateFarewellResponse(username, traits, relationship, detectedEmotion);
      break;

    case 'request_help':
      response = generateHelpOfferResponse(username, message, traits, relationship, detectedEmotion);
      break;

    case 'chat_general':
    default:
      response = generateChatResponse(username, message, traits, relationship, context, detectedEmotion);
      break;
  }

  return response;
}

/**
 * Analyze message intent
 * @param {string} message - Message to analyze
 * @returns {{type: string, confidence: number}} - Detected intent
 */
function analyzeIntent(message) {
  const lower = message.toLowerCase().trim();
  
  // Questions about activity
  if (/what('?s| are) (you )?(doing|up to)/i.test(lower) || /how'?s it going/i.test(lower)) {
    return { type: 'question_activity', confidence: 0.9 };
  }
  
  // Questions about status
  if (/how (are you|do you feel|is your health)/i.test(lower) || /are you (okay|alright|hurt|alive)/i.test(lower)) {
    return { type: 'question_status', confidence: 0.9 };
  }
  
  // Greetings
  if (/^(hey|hi|hello|yo|greetings|howdy)/i.test(lower)) {
    return { type: 'greeting', confidence: 0.95 };
  }
  
  // Identity questions
  if (/who (are you|is this)/i.test(lower) || /what('?s| is) your name/i.test(lower)) {
    return { type: 'question_identity', confidence: 0.9 };
  }
  
  // Gratitude
  if (/\b(thanks?|thank you|thx|ty)\b/i.test(lower)) {
    return { type: 'gratitude', confidence: 0.85 };
  }
  
  // Farewells
  if (/\b(bye|goodbye|see you|later|cya|farewell)\b/i.test(lower)) {
    return { type: 'farewell', confidence: 0.9 };
  }
  
  // Help requests
  if (/\b(can|could|would) you (help|assist|do|make|build|get|find)/i.test(lower) || /\bi need\b/i.test(lower)) {
    return { type: 'request_help', confidence: 0.85 };
  }
  
  return { type: 'chat_general', confidence: 0.5 };
}

/**
 * Get description of current bot activity
 */
function getActivityDescription(bot) {
  const pos = bot.entity.position;
  
  // Check what the bot might be doing
  if (bot.targetDigBlock) {
    return `mining ${bot.targetDigBlock.name}`;
  }
  
  // Check for nearby entities (hostile mobs)
  const nearbyHostiles = Object.values(bot.entities).filter(e => 
    e.type === 'mob' && e.mobType && ['zombie', 'skeleton', 'creeper', 'spider', 'enderman'].includes(e.mobType.toLowerCase())
  );
  if (nearbyHostiles.length > 0) {
    return `avoiding ${nearbyHostiles.length} hostile mob${nearbyHostiles.length > 1 ? 's' : ''}`;
  }
  
  return `wandering near (${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)})`;
}

/**
 * Generate response about current activity
 */
function generateActivityResponse(username, activity, traits, relationship, detectedEmotion = null) {
  const familiarity = relationship?.familiarity || 0;
  const warmth = traits.warmth || 0.5;

  // Adjust tone based on detected emotion
  const emotionTone = getEmotionTone(detectedEmotion);

  const responses = warmth > 0.6 ? [
    `Hey ${username}! I'm currently ${activity}. What about you?`,
    `${activity} at the moment! Need any help with anything?`,
    `Just ${activity}. Anything I can do for you?`
  ] : [
    `Currently ${activity}.`,
    `${activity}.`,
    `I'm ${activity}.`
  ];

  const idx = Math.floor(Math.random() * responses.length);
  const baseResponse = responses[idx];
  return emotionTone ? `${emotionTone} ${baseResponse}` : baseResponse;
}

function getEmotionTone(detectedEmotion) {
  if (!detectedEmotion) return null;

  const { emotion } = detectedEmotion;

  switch (emotion) {
    case 'joy':
    case 'happy':
      return null;
    case 'sadness':
      return 'I sense you might be feeling down.';
    case 'anger':
    case 'frustration':
      return 'I can tell something is bothering you.';
    case 'fear':
      return 'Are you okay?';
    default:
      return null;
  }
}

/**
 * Generate status response
 */
async function generateStatusResponse(username, bot, traits, relationship, detectedEmotion = null) {
  const health = bot.health || 20;
  const pos = bot.entity.position;
  const warmth = traits.warmth || 0.5;

  const emotionTone = getEmotionTone(detectedEmotion);

  let healthStatus;
  if (health >= 18) {
    healthStatus = warmth > 0.6 ? 'I\'m doing great!' : 'Health is full.';
  } else if (health >= 10) {
    healthStatus = warmth > 0.6 ? 'I\'m okay, just a bit hurt.' : 'Health is moderate.';
  } else {
    healthStatus = warmth > 0.6 ? 'I\'m pretty hurt, be careful!' : 'Health is low.';
  }

  const baseResponse = `${healthStatus} (${health.toFixed(1)}/20) at position (${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)})`;
  return emotionTone ? `${emotionTone} ${baseResponse}` : baseResponse;
}

/**
 * Generate greeting response
 */
function generateGreetingResponse(username, traits, relationship, detectedEmotion = null) {
  const warmth = traits.warmth || 0.5;
  const familiarity = relationship?.familiarity || 0;
  const emotionTone = getEmotionTone(detectedEmotion);

  let response;
  if (warmth > 0.7 && familiarity > 0.3) {
    response = `Hey ${username}! Good to see you again!`;
  } else if (warmth > 0.6) {
    response = `Hi ${username}! How can I help you today?`;
  } else {
    response = `Hello ${username}.`;
  }

  return emotionTone ? `${emotionTone} ${response}` : response;
}

/**
 * Generate identity response
 */
function generateIdentityResponse(username, traits, detectedEmotion = null) {
  const warmth = traits.warmth || 0.5;
  const directness = traits.directness || 0.5;
  const emotionTone = getEmotionTone(detectedEmotion);

  let response;
  if (directness > 0.6) {
    response = warmth > 0.5
      ? `I'm your Minecraft companion bot! I'm here to help with tasks and explore with you.`
      : `I'm a companion bot.`;
  } else {
    response = `I'm an AI companion, here to help you in Minecraft!`;
  }

  return emotionTone ? `${emotionTone} ${response}` : response;
}

/**
 * Generate gratitude response
 */
function generateGratitudeResponse(username, traits, relationship, detectedEmotion = null) {
  const warmth = traits.warmth || 0.5;
  const emotionTone = getEmotionTone(detectedEmotion);

  let response;
  if (warmth > 0.7) {
    response = `You're welcome, ${username}! Happy to help anytime!`;
  } else if (warmth > 0.5) {
    response = `You're welcome!`;
  } else {
    response = `No problem.`;
  }

  return emotionTone ? `${emotionTone} ${response}` : response;
}

/**
 * Generate farewell response
 */
function generateFarewellResponse(username, traits, relationship, detectedEmotion = null) {
  const warmth = traits.warmth || 0.5;
  const loyalty = traits.loyalty || 0.5;
  const emotionTone = getEmotionTone(detectedEmotion);

  let response;
  if (warmth > 0.6 && loyalty > 0.7) {
    response = `Goodbye ${username}! Stay safe out there!`;
  } else if (warmth > 0.5) {
    response = `See you later, ${username}!`;
  } else {
    response = `Bye.`;
  }

  return emotionTone ? `${emotionTone} ${response}` : response;
}

/**
 * Generate help offer response
 */
function generateHelpOfferResponse(username, message, traits, relationship, detectedEmotion = null) {
  const warmth = traits.warmth || 0.5;
  const directness = traits.directness || 0.5;
  const emotionTone = getEmotionTone(detectedEmotion);

  const helpMatch = message.match(/(?:help|assist|do|make|build|get|find)\s+(.+)/i);
  const task = helpMatch ? helpMatch[1] : 'that';

  let response;
  if (directness > 0.6) {
    response = warmth > 0.5
      ? `I can help with "${task}". Use !bot commands or tell me more details!`
      : `Use !bot <command> for specific tasks.`;
  } else {
    response = `I'd be happy to help! Try using commands like !bot collect wood or !bot goto, or just tell me what you need.`;
  }

  return emotionTone ? `${emotionTone} ${response}` : response;
}

function generateChatResponse(username, message, traits, relationship, context, detectedEmotion = null) {
  const warmth = traits.warmth || 0.5;
  const curiosity = traits.curiosity || 0.5;
  const emotionTone = getEmotionTone(detectedEmotion);

  let response;
  if (curiosity > 0.6 && Math.random() > 0.5) {
    response = `That's interesting, ${username}! Tell me more about what you're working on?`;
  } else if (warmth > 0.6) {
    response = `I hear you, ${username}! Let me know if you need anything.`;
  } else {
    response = `Understood. Use !bot help if you need commands.`;
  }

  return emotionTone ? `${emotionTone} ${response}` : response;
}

/**
 * Create chat handler with NLP integration
 * @param {object} bot - Mineflayer bot instance
 * @param {object} options - Configuration options
 * @param {boolean} options.enableVoice - Enable voice chat support
 * @returns {object} - Chat handler instance
 */
function createChatHandler(bot, options = {}) {
  const stateManager = new StateManager(path.join(process.cwd(), 'state'));
  const conversationStore = new ConversationStore();
  const personalityEngine = getPersonalityEngine();

  // Social Awareness module for player sentiment tracking
  const socialAwareness = new SocialAwareness({
    emotionDetector: emotionDetector
  });

  // Context tracking for pronoun resolution (last 5 messages)
  const messageContext = [];

  // Track if bot spoke last for context
  let lastBotMessage = null;
  let lastBotMessageTime = 0;

  // Voice support flag
  const enableVoice = options.enableVoice || false;
  
  /**
   * Update context window with new message
   * @param {string} username - Player who sent message
   * @param {string} message - The message
   */
  function updateContext(username, message) {
    messageContext.push({
      username,
      message,
      timestamp: Date.now()
    });
    
    // Keep only last 5 messages (scope limit)
    while (messageContext.length > CONTEXT_WINDOW_SIZE) {
      messageContext.shift();
    }
  }
  
  /**
   * Get conversation context for NLP
   * @returns {object} - Context object for isAddressed()
   */
  function getBotContext() {
    const botSpokeLast = lastBotMessageTime > 0 && 
      messageContext.length > 0 && 
      messageContext[messageContext.length - 1]?.isBot === true;
    
    // Count messages since bot spoke
    let messagesSinceBotSpoke = messageContext.length;
    for (let i = messageContext.length - 1; i >= 0; i--) {
      if (messageContext[i].isBot) {
        messagesSinceBotSpoke = messageContext.length - 1 - i;
        break;
      }
    }
    
  return {
    botSpokeLast,
    messagesSinceBotSpoke,
    lastBotMessage,
    recentSpeakers: messageContext.slice(-5).map(m => m.username)
  };
  }

  async function detectAndTrackEmotion(username, message) {
    try {
      const emotion = await emotionDetector.detectEmotion(message);

      if (emotion && emotion.confidence >= 0.7) {
        socialAwareness.trackSentiment(username, emotion);
        logger.debug(`[Chat] Emotion detected for ${username}: ${emotion.emotion} (${emotion.confidence.toFixed(2)})`);
        return emotion;
      }

      return null;
    } catch (error) {
      logger.warn(`[Chat] Emotion detection failed: ${error.message}`);
      return null;
    }
  }

  /**
 * Handle incoming chat message
 * @param {string} username - Player who sent message
 * @param {string} message - The message content
 */
  async function handleChat(username, message) {
    // Ignore own messages
    if (username === bot.username) return;
    
    logger.info(`[Chat] Message from ${username}: ${message}`);
    
    // Update context
    updateContext(username, message);
    
    const botName = bot.username;
    const context = getBotContext();
    
    // Check for command prefix first (fallback system)
    const commandPattern = new RegExp(`^!${botName}\\s+`, 'i');
    const commandMatch = message.match(commandPattern);
    
    if (commandMatch) {
      // Extract command after prefix
      const commandText = message.slice(commandMatch[0].length);
      await handleCommand(username, commandText);
      return;
    }
    
    // Generic !bot prefix
    if (/^!bot\s+/i.test(message)) {
      const commandText = message.slice(6); // Remove '!bot '
      await handleCommand(username, commandText);
      return;
    }
    
    // Use NLP to detect if bot is addressed
    const nlpResult = isAddressed(message, botName, context);
    
  if (nlpResult.addressed) {
    logger.debug(`[Chat] Bot addressed (confidence: ${nlpResult.confidence.toFixed(2)}, reason: ${nlpResult.reason})`);

    // Detect emotion asynchronously (non-blocking, fire and forget for sentiment tracking)
    const emotionPromise = detectAndTrackEmotion(username, message);

    // Generate natural language response (waits for emotion for better response)
    const detectedEmotion = await emotionPromise;

    const response = await generateNaturalResponse(
      username,
      message,
      bot,
      personalityEngine,
      conversationStore,
      context,
      detectedEmotion
    );

    // Send response
    await sendResponse(username, response);

    // Save to conversation memory
    await saveInteraction(username, message, response, 'natural');

    // Update relationship
    await conversationStore.updateRelationship(username, 'neutral');

  } else {
    logger.debug(`[Chat] Message not addressed to bot (confidence: ${nlpResult.confidence.toFixed(2)})`);
  }
}
  
  /**
   * Handle explicit command
   * @param {string} username - Player who sent command
   * @param {string} commandText - Command text
   */
  async function handleCommand(username, commandText) {
    logger.info(`[Chat] Processing command from ${username}: ${commandText}`);
    
    try {
      const { action, args } = parseCommand(commandText);
      
      if (!action) {
        bot.chat('Usage: !bot <command>. Type !bot help for commands.');
        return;
      }
      
      const response = await executeCommand(username, action, args, bot, stateManager);
      await sendResponse(username, response);
      
      // Save command to memory
      await saveInteraction(username, `!bot ${commandText}`, response, 'command');
      
      // Update relationship (commands are helpful interactions)
      await conversationStore.updateRelationship(username, 'helpful');
      
    } catch (err) {
      logger.error(`[Chat] Command failed: ${err.message}`);
      bot.chat(`Error processing command: ${err.message}`);
    }
  }
  
  /**
   * Send response via chat (and voice if enabled)
   * @param {string} username - Player to respond to
   * @param {string} response - Response message
   */
  async function sendResponse(username, response) {
    // Send text chat
    bot.chat(response);
    
    // Track bot's last message for context
    lastBotMessage = response;
    lastBotMessageTime = Date.now();
    
    // Add to context
    messageContext.push({
      username: bot.username,
      message: response,
      timestamp: lastBotMessageTime,
      isBot: true
    });
    
    // Trim context
    while (messageContext.length > CONTEXT_WINDOW_SIZE) {
      messageContext.shift();
    }
    
    // Voice support (if enabled)
    if (enableVoice) {
      bot.emit('voice_response', { username, message: response });
    }
    
    logger.info(`[Chat] Response sent: ${response.split('\n')[0]}`);
  }
  
  /**
   * Save interaction to conversation memory
   * @param {string} username - Player username
   * @param {string} playerMessage - Player's message
   * @param {string} botMessage - Bot's response
   * @param {string} type - Interaction type ('natural' or 'command')
   */
  async function saveInteraction(username, playerMessage, botMessage, type) {
    try {
      await conversationStore.saveConversation(
        username,
        botMessage,
        playerMessage,
        {
          type,
          botPosition: {
            x: Math.round(bot.entity.position.x),
            y: Math.round(bot.entity.position.y),
            z: Math.round(bot.entity.position.z)
          },
          health: bot.health
        }
      );
    } catch (err) {
      logger.error(`[Chat] Failed to save conversation: ${err.message}`);
    }
  }
  
  /**
   * Handle bot_command event (for compatibility)
   * @param {object} data - Event data { username, command }
   */
  async function onBotCommand({ username, command }) {
    await handleCommand(username, command);
  }
  
  // Register event handlers
  bot.on('chat', handleChat);
  bot.on('bot_command', onBotCommand);
  
  logger.info('[Chat] Chat handler initialized with NLP integration');
  
return {
    bot,
    stateManager,
    conversationStore,
    personalityEngine,
    socialAwareness,
    commands: COMMANDS,
    messageContext,

    /**
    * Remove event handlers
    */
    remove() {
      bot.off('chat', handleChat);
      bot.off('bot_command', onBotCommand);
      logger.info('[Chat] Chat handler removed');
    },

    /**
    * Get current context (for testing)
    */
    getContext() {
      return [...messageContext];
    },

    /**
    * Close connections (for cleanup)
    */
    async close() {
      await conversationStore.close();
    }
  };
}

module.exports = {
  createChatHandler,
  COMMANDS,
  CONTEXT_WINDOW_SIZE,
  analyzeIntent,
  parseCommand,
  generateNaturalResponse,
  getEmotionTone
};
