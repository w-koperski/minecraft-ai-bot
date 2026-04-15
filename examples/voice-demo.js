/**
 * Voice Demo - Example script for Discord voice integration
 *
 * This script demonstrates how to:
 * - Connect to Discord voice channels
 * - Listen for voice commands with keyword detection
 * - Process commands and respond via TTS
 * - Handle connection events and errors
 *
 * Prerequisites:
 * - Discord bot token (set DISCORD_BOT_TOKEN env var)
 * - Discord guild ID (set DISCORD_GUILD_ID env var)
 * - Voice channel ID
 *
 * Usage:
 *   DISCORD_BOT_TOKEN=xxx DISCORD_GUILD_ID=yyy node examples/voice-demo.js
 */

const { DiscordVoice } = require('../src/voice/discord-voice');

// Configuration
const CONFIG = {
  token: process.env.DISCORD_BOT_TOKEN,
  guildId: process.env.DISCORD_GUILD_ID,
  channelId: process.argv[2],
  keyword: process.env.DISCORD_KEYWORD || 'hey bot',
  keywordThreshold: parseFloat(process.env.DISCORD_KEYWORD_THRESHOLD) || 0.7
};

// Validate configuration
function validateConfig() {
  const errors = [];

  if (!CONFIG.token) {
    errors.push('DISCORD_BOT_TOKEN not set');
  }

  if (!CONFIG.guildId) {
    errors.push('DISCORD_GUILD_ID not set');
  }

  if (!CONFIG.channelId) {
    errors.push('Voice channel ID not provided');
    console.log('Usage: node voice-demo.js <channel-id>');
  }

  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(err => console.error(`  - ${err}`));
    console.error('\nSet environment variables or pass channel ID as argument.');
    process.exit(1);
  }
}

// Process voice commands
async function processCommand(voice, transcription) {
  const command = transcription.toLowerCase().replace(/hey bot/i, '').trim();

  console.log(`  Command: "${command}"`);

  // Command handlers
  const responses = {
    'status': 'I am online and ready to help.',
    'hello': 'Hello! How can I assist you today?',
    'help': 'I can collect resources, build structures, or explore. What would you like me to do?',
    'follow me': 'I will follow you.',
    'stop': 'Stopping current task.',
    'collect wood': 'I will gather wood from nearby trees.',
    'collect stone': 'I will mine for stone nearby.' };

  // Find matching response
  let response = responses['help'];
  for (const [key, value] of Object.entries(responses)) {
    if (command.includes(key)) {
      response = value;
      break;
    }
  }

  // Speak response
  console.log(`  Response: "${response}"`);
  await voice.speak(response);
}

// Main demo function
async function runDemo() {
  console.log('='.repeat(60));
  console.log('Discord Voice Integration Demo');
  console.log('='.repeat(60));
  console.log();

  // Validate configuration
  validateConfig();

  console.log('Configuration:');
  console.log(`  Guild ID: ${CONFIG.guildId}`);
  console.log(`  Channel ID: ${CONFIG.channelId}`);
  console.log(`  Keyword: "${CONFIG.keyword}"`);
  console.log(`  Threshold: ${CONFIG.keywordThreshold}`);
  console.log();

  // Initialize voice integration
  console.log('Initializing Discord voice...');
  const voice = new DiscordVoice({
    token: CONFIG.token,
    guildId: CONFIG.guildId,
    keyword: CONFIG.keyword,
    keywordThreshold: CONFIG.keywordThreshold,
    enabled: true,
    autoReconnect: true,
    reconnectDelay: 5000
  });

  // Set up event handlers
  voice.on('ready', (user) => {
    console.log(`  Connected as ${user.tag}`);
  });

  voice.on('connected', (channelId) => {
    console.log(`  Joined voice channel: ${channelId}`);
    console.log();
    console.log('Ready for voice commands!');
    console.log(`Say "${CONFIG.keyword}" followed by your command.`);
    console.log('Example: "Hey bot, what is your status?"');
    console.log();
    console.log('Press Ctrl+C to exit');
    console.log();
  });

  voice.on('disconnected', () => {
    console.log('  Disconnected from voice channel');
  });

  voice.on('keyword_detected', async (transcription) => {
    console.log(`\n[${new Date().toLocaleTimeString()}] Keyword detected!`);
    console.log(`  Heard: "${transcription}"`);

    try {
      await processCommand(voice, transcription);
    } catch (error) {
      console.error('  Error processing command:', error.message);
    }
  });

  voice.on('spoken', (text) => {
    console.log('  Spoken response complete');
  });

  voice.on('error', (error) => {
    console.error('  Voice error:', error.message);
  });

  voice.on('reconnect_failed', () => {
    console.error('  Failed to reconnect after max attempts');
    process.exit(1);
  });

  try {
    // Connect to voice channel
    console.log('Connecting to voice channel...');
    await voice.connect(CONFIG.channelId);

    // Start listening loop
    console.log('Starting listen loop...');
    while (true) {
      try {
        await voice.listen({ timeout: 30000 });
      } catch (error) {
        console.error('Listen error:', error.message);
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

  } catch (error) {
    console.error('Failed to connect:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\nShutting down...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\nShutting down...');
  process.exit(0);
});

// Run demo
runDemo().catch(error => {
  console.error('Demo failed:', error);
  process.exit(1);
});
