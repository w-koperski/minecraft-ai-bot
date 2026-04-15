/**
 * Minecraft AI Bot - Main Entry Point
 * 
 * Connects to Minecraft server using Mineflayer and manages
 * the 3-layer AI system (Pilot/Strategy/Commander).
 * 
 * @module bot
 */

'use strict';

require('dotenv').config();
const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const collectblock = require('mineflayer-collectblock').plugin;

// Configuration from environment
const config = {
  host: process.env.MINECRAFT_HOST || 'localhost',
  port: parseInt(process.env.MINECRAFT_PORT) || 25565,
  username: process.env.MINECRAFT_USERNAME || 'AIBot',
  password: process.env.MINECRAFT_PASSWORD || undefined,
  auth: process.env.MINECRAFT_PASSWORD ? 'microsoft' : 'offline',
  checkTimeoutInterval: 300000, // 5 minutes
  version: false // Auto-detect server version
};

/**
 * Create and configure bot instance
 */
function createBot() {
  logger.info(`[Bot] Connecting to ${config.host}:${config.port} as ${config.username}...`);

  const bot = mineflayer.createBot(config);

  // Load plugins
  bot.loadPlugin(pathfinder);
  bot.loadPlugin(collectblock);

  /**
   * Initialize Movements after spawn
   * Must be done BEFORE setting any goals
   */
  function initMovements() {
    const { Movements, goals } = require('mineflayer-pathfinder');
    const mcData = require('minecraft-data')(bot.version);

    const defaultMove = new Movements(bot, mcData);
    
    // Configure movement defaults
    defaultMove.canDig = true; // Allow breaking blocks for path
    defaultMove.scafoldingBlocks = []; // No auto-scaffolding
    
    bot.pathfinder.setMovements(defaultMove);
    
    logger.info('[Bot] Movements initialized');
    return { Movements, goals, defaultMove };
  }

  /**
   * Event: Bot spawned in world
   */
  bot.on('spawn', () => {
    logger.info('[Bot] Spawned successfully');
    logger.info(`[Bot] Position: ${bot.entity.position}`);
    logger.info(`[Bot] Game mode: ${bot.game.gameMode}`);
    logger.info(`[Bot] Health: ${bot.health}/20`);

    // Initialize Movements BEFORE any goals
    const { Movements, goals, defaultMove } = initMovements();

    // Bot is now ready for AI control
    bot.emit('ready', { Movements, goals, defaultMove });
  });

  /**
   * Event: Bot died
   */
  bot.on('death', () => {
    logger.info('[Bot] Died! Respawning...');
  });

  /**
   * Event: Bot kicked from server
   */
  bot.on('kicked', (reason, loggedIn) => {
    logger.error('[Bot] Kicked from server:', reason);
    logger.error('[Bot] Was logged in:', loggedIn);
  });

  /**
   * Event: Bot error
   */
  bot.on('error', (err) => {
    logger.error('[Bot] Error:', err.message);
    if (err.code === 'ECONNREFUSED') {
      logger.error('[Bot] Cannot connect to server. Is Minecraft running?');
    }
  });

  /**
   * Event: Chat message received
   */
  bot.on('chat', (username, message) => {
    // Ignore own messages
    if (username === bot.username) return;

    logger.info(`[Chat] <${username}> ${message}`);

    // Check for bot commands (prefix: !bot)
    if (message.startsWith('!bot ')) {
      const command = message.slice(5).trim();
      bot.emit('bot_command', { username, command });
    }
  });

  /**
   * Event: End connection
   */
  bot.on('end', (reason) => {
    logger.info('[Bot] Disconnected:', reason || 'Unknown reason');
  });

  return bot;
}

// Create bot instance
const bot = createBot();

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('\n[Bot] Shutting down...');
  bot.quit();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('\n[Bot] Terminated...');
  bot.quit();
  process.exit(0);
});

// Export bot instance for other modules
module.exports = bot;

// If run directly, log ready state
if (require.main === module) {
  bot.on('ready', (pathfinderModules) => {
    logger.info('[Bot] Ready for AI control');
    logger.info('[Bot] Pathfinder Movements configured:', !!pathfinderModules.defaultMove);
  });
}
