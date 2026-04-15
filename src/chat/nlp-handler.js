/**
 * @fileoverview NLP handler for detecting when bot is addressed in chat
 * Uses simple pattern matching (no ML) per decisions.md
 */

'use strict';

/**
 * Detection patterns with their confidence scores
 * Higher confidence = more certain the bot is being addressed
 */
const DIRECT_MENTION_PATTERNS = [
  // Exact name match at start (highest confidence)
  { pattern: /^(\w+)\s*[,:\uff0c\uff1a]\s*/i, confidence: 1.0 },  // "bot, come here" or "bot:"
  { pattern: /^(\w+)\s+/i, confidence: 0.95 },  // "bot come here"
  
  // @-mention (high confidence)
  { pattern: /@(\w+)/i, confidence: 1.0 },  // "@bot come here"
  
  // Hey/calling patterns
  { pattern: /^(hey|hi|hello|yo|hey\s+there)\s+(\w+)/i, confidence: 0.95 },  // "hey bot"
  { pattern: /^(can\s+you|could\s+you|would\s+you|will\s+you)\s+/i, confidence: 0.6 },  // "can you help" (needs context)
  
  // Command prefix patterns
  { pattern: /^!(\w+)/i, confidence: 1.0 },  // "!bot collect wood"
  { pattern: /^!(\w+)\s+/i, confidence: 1.0 },  // "!bot collect"
];

const PRONOUN_PATTERNS = [
  // Second person pronouns (require context - bot spoke last)
  { pattern: /\b(you|your|yours|yourself)\b/i, confidence: 0.5, needsContext: true },
  
  // Question patterns with second person
  { pattern: /what\s+(are\s+you|do\s+you|can\s+you|will\s+you|is\s+your)/i, confidence: 0.6, needsContext: true },
  { pattern: /where\s+(are\s+you|do\s+you|can\s+you)/i, confidence: 0.6, needsContext: true },
  { pattern: /how\s+(are\s+you|do\s+you|can\s+you|is\s+your)/i, confidence: 0.6, needsContext: true },
  { pattern: /why\s+(are\s+you|do\s+you|can\s+you|did\s+you)/i, confidence: 0.6, needsContext: true },
  { pattern: /who\s+(are\s+you|is\s+that)/i, confidence: 0.7, needsContext: true },
];

const AMBIGUOUS_PATTERNS = [
  // Very short messages are uncertain
  { pattern: /^.{1,3}$/, confidence: 0.3 },
  
  // All caps might be yelling to everyone
  { pattern: /^[A-Z\s\W]+$/, confidence: 0.2 },
];

/**
 * Context for bot interaction
 * @typedef {Object} BotContext
 * @property {boolean} botSpokeLast - Whether bot was the last speaker
 * @property {number} messagesSinceBotSpoke - Messages since bot last spoke (0 = bot spoke last)
 * @property {string} lastBotMessage - The last message the bot sent
 * @property {string[]} recentSpeakers - Recent speakers in order
 */

/**
 * Checks if a message is addressing the bot
 * @param {string} message - The chat message to analyze
 * @param {string} botName - The bot's name (case-insensitive matching)
 * @param {BotContext} [context] - Optional context about recent conversation
 * @returns {{addressed: boolean, confidence: number, reason: string}}
 */
function isAddressed(message, botName, context = null) {
  if (!message || typeof message !== 'string') {
    return { addressed: false, confidence: 0.0, reason: 'Empty or invalid message' };
  }

  if (!botName || typeof botName !== 'string') {
    return { addressed: false, confidence: 0.0, reason: 'Invalid bot name' };
  }

  const normalizedBotName = botName.toLowerCase();
  const normalizedMessage = message.trim();

  // Check for direct mention patterns
  const directResult = checkDirectMention(normalizedMessage, normalizedBotName);
  if (directResult.confidence >= 0.9) {
    return directResult;
  }

  // Check for command prefix
  const commandResult = checkCommandPrefix(normalizedMessage, normalizedBotName);
  if (commandResult.confidence >= 0.9) {
    return commandResult;
  }

  // Check pronoun patterns with context
  const pronounResult = checkPronounPatterns(normalizedMessage, context);
  if (pronounResult.addressed) {
    return pronounResult;
  }

  // Merge confidence from direct mention (if partial) and pronoun checks
  const finalConfidence = Math.max(directResult.confidence, pronounResult.confidence);
  
  return {
    addressed: finalConfidence >= 0.7,
    confidence: finalConfidence,
    reason: finalConfidence >= 0.7 ? 'Likely addressed to bot' : 'Not clearly addressed to bot'
  };
}

/**
 * Check for direct mention of bot name
 */
function checkDirectMention(message, botName) {
  // Check exact name at start
  const startPattern = new RegExp(`^${escapeRegex(botName)}\\s*[,:\uff0c\uff1a]?\\s*`, 'i');
  if (startPattern.test(message)) {
    return { addressed: true, confidence: 1.0, reason: 'Bot name at start of message' };
  }

  // Check @-mention
  const atPattern = new RegExp(`@${escapeRegex(botName)}\\b`, 'i');
  if (atPattern.test(message)) {
    return { addressed: true, confidence: 1.0, reason: 'Direct @-mention' };
  }

  // Check name anywhere in message (lower confidence)
  const anywherePattern = new RegExp(`\\b${escapeRegex(botName)}\\b`, 'i');
  if (anywherePattern.test(message)) {
    return { addressed: true, confidence: 0.85, reason: 'Bot name mentioned in message' };
  }

  // Check hey/hi + name pattern
  const greetingPattern = new RegExp(`^(hey|hi|hello|yo|hey\\s+there)\\s+${escapeRegex(botName)}\\b`, 'i');
  if (greetingPattern.test(message)) {
    return { addressed: true, confidence: 0.95, reason: 'Greeting with bot name' };
  }

  // Check "can you/could you" without name but followed by actionable content
  const youPattern = /^(can|could|would|will)\s+you\s+/i;
  if (youPattern.test(message)) {
    // This is ambiguous - could be addressing anyone
    return { addressed: false, confidence: 0.4, reason: 'Ambiguous "you" reference' };
  }

  return { addressed: false, confidence: 0.0, reason: 'No direct mention found' };
}

/**
 * Check for command prefix (!bot or similar)
 */
function checkCommandPrefix(message, botName) {
  const commandPattern = new RegExp(`^!${escapeRegex(botName)}\\b`, 'i');
  if (commandPattern.test(message)) {
    return { addressed: true, confidence: 1.0, reason: 'Command prefix' };
  }

  // Generic ! prefix without bot name (if message starts with !)
  if (/^!\w+/.test(message)) {
    // Could be a general command, check if bot name follows
    const botCommandPattern = new RegExp(`^!\\w+\\s+${escapeRegex(botName)}`, 'i');
    if (botCommandPattern.test(message)) {
      return { addressed: true, confidence: 0.9, reason: 'Command with bot reference' };
    }
  }

  return { addressed: false, confidence: 0.0, reason: 'No command prefix' };
}

/**
 * Check pronoun patterns with context awareness
 */
function checkPronounPatterns(message, context) {
  if (!context) {
    return { addressed: false, confidence: 0.0, reason: 'No context provided' };
  }

  // Check if bot spoke recently (within last 5 messages)
  const botSpokeRecently = context.botSpokeLast === true || 
    (typeof context.messagesSinceBotSpoke === 'number' && context.messagesSinceBotSpoke <= 5);

  if (!botSpokeRecently) {
    return { addressed: false, confidence: 0.0, reason: 'Bot has not spoken recently' };
  }

  // Check for second-person pronouns
  const pronounPattern = /\b(you|your|yours|yourself)\b/i;
  if (pronounPattern.test(message)) {
    // Calculate confidence based on how recently bot spoke
    let confidence = 0.7;
    if (context.botSpokeLast === true) {
      confidence = 0.85;
    } else if (context.messagesSinceBotSpoke === 1) {
      confidence = 0.8;
    } else if (context.messagesSinceBotSpoke === 2) {
      confidence = 0.75;
    } else if (context.messagesSinceBotSpoke <= 5) {
      confidence = 0.65;
    }

    // Boost confidence for questions
    if (/\?$/.test(message.trim())) {
      confidence = Math.min(confidence + 0.1, 0.95);
    }

    return { 
      addressed: confidence >= 0.7, 
      confidence, 
      reason: `Second-person pronoun with bot context (spoke ${context.botSpokeLast ? 'last' : context.messagesSinceBotSpoke + ' messages ago'})` 
    };
  }

  // Check for question patterns
  const questionPattern = /^(what|where|how|why|who|when)\s+(are|do|can|will|is|did)\s+you/i;
  if (questionPattern.test(message)) {
    const confidence = context.botSpokeLast ? 0.85 : 0.7;
    return { 
      addressed: true, 
      confidence, 
      reason: 'Question with second-person reference' 
    };
  }

  return { addressed: false, confidence: 0.0, reason: 'No pronoun pattern matched' };
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Batch process messages for testing
 * @param {Array<{message: string, expected: boolean}>} testCases
 * @param {string} botName
 * @param {BotContext} [context]
 * @returns {{correct: number, total: number, accuracy: number, failures: Array}}
 */
function runTestSet(testCases, botName, context = null) {
  let correct = 0;
  const failures = [];

  for (const testCase of testCases) {
    const result = isAddressed(testCase.message, botName, context);
    const isCorrect = result.addressed === testCase.expected;
    
    if (isCorrect) {
      correct++;
    } else {
      failures.push({
        message: testCase.message,
        expected: testCase.expected,
        actual: result.addressed,
        confidence: result.confidence,
        reason: result.reason
      });
    }
  }

  const total = testCases.length;
  const accuracy = total > 0 ? correct / total : 0;

  return { correct, total, accuracy, failures };
}

module.exports = {
  isAddressed,
  runTestSet,
  checkDirectMention,
  checkCommandPrefix,
  checkPronounPatterns
};
