/**
 * Minecraft AI Bot - Main Orchestrator
 *
 * Initializes and coordinates all 3 AI layers (Pilot, Strategy, Commander).
 * Handles graceful shutdown and manages the bot lifecycle.
 *
 * Startup sequence:
 * 1. Load environment config
 * 2. Initialize StateManager
 * 3. Create bot (via bot.js)
 * 4. Wait for bot spawn
 * 5. Start Pilot layer (fastest loop)
 * 6. Start Strategy layer (planning)
 * 7. Start Commander layer (monitoring)
 *
 * @module index
 */

'use strict';

require('dotenv').config();

const { spawn } = require('child_process');
const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const collectblock = require('mineflayer-collectblock').plugin;

const logger = require('./utils/logger');
const StateManager = require('./utils/state-manager');
const Pilot = require('./layers/pilot');
const Strategy = require('./layers/strategy');
const Commander = require('./layers/commander');
const KnowledgeGraph = require('./memory/knowledge-graph');
const ReflectionModule = require('./learning/reflection-module');
const featureFlags = require('./utils/feature-flags');
const { getInstance: getDriveSystem } = require('./drives/drive-system');

// Track shutdown state
let isShuttingDown = false;
let bot = null;
let pilot = null;
let strategy = null;
let commander = null;
let knowledgeGraph = null;
let consolidationTimer = null;
let reflectionTimer = null;
let driveTimer = null;
let dashboardProcess = null;

/**
 * Spawn dashboard server as child process
 * Does NOT block bot startup - spawns and continues
 */
function spawnDashboard() {
  if (process.env.ENABLE_DASHBOARD !== 'true') {
    return;
  }

  logger.info('Starting dashboard server...');

  dashboardProcess = spawn('node', ['src/dashboard/server.js'], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false
  });

  const dashboardPid = dashboardProcess.pid;

  logger.info('Dashboard process spawned', { pid: dashboardPid });

  dashboardProcess.stdout.on('data', (data) => {
    logger.debug('Dashboard stdout', { data: data.toString().trim() });
  });

  dashboardProcess.stderr.on('data', (data) => {
    logger.error('Dashboard stderr', { error: data.toString().trim() });
  });

  dashboardProcess.on('exit', (code, signal) => {
    logger.error('Dashboard process exited', {
      code,
      signal,
      pid: dashboardPid
    });
    dashboardProcess = null;
  });

  dashboardProcess.on('error', (err) => {
    logger.error('Dashboard process error', {
      error: err.message,
      pid: dashboardPid
    });
    dashboardProcess = null;
  });
}

/**
 * Create and configure bot instance
 */
function createBot() {
    const config = {
        host: process.env.MINECRAFT_HOST || 'localhost',
        port: parseInt(process.env.MINECRAFT_PORT) || 25565,
        username: process.env.MINECRAFT_USERNAME || 'AIBot',
        password: process.env.MINECRAFT_PASSWORD || undefined,
        auth: process.env.MINECRAFT_PASSWORD ? 'microsoft' : 'offline',
        checkTimeoutInterval: 300000, // 5 minutes
        version: false // Auto-detect server version
    };

    logger.info('Connecting to Minecraft server', {
        host: config.host,
        port: config.port,
        username: config.username
    });

    const bot = mineflayer.createBot(config);

    // Load plugins
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(collectblock);

    return bot;
}

/**
 * Initialize Movements after spawn
 * Must be done BEFORE setting any goals
 */
function initMovements(bot) {
    const { Movements, goals } = require('mineflayer-pathfinder');
    const mcData = require('minecraft-data')(bot.version);

    const defaultMove = new Movements(bot, mcData);

    // Configure movement defaults
    defaultMove.canDig = true; // Allow breaking blocks for path
    defaultMove.scafoldingBlocks = []; // No auto-scaffolding

    bot.pathfinder.setMovements(defaultMove);

    logger.info('Pathfinder movements initialized');
    return { Movements, goals, defaultMove };
}

/**
 * Set up bot event handlers
 */
function setupBotEvents(bot) {
    /**
     * Event: Bot spawned in world
     */
    bot.on('spawn', () => {
        logger.info('Bot spawned successfully', {
            position: bot.entity.position,
            gameMode: bot.game.gameMode,
            health: bot.health
        });

        // Initialize Movements BEFORE any goals
        initMovements(bot);

        // Bot is now ready for AI control
        bot.emit('ready');
    });

    /**
     * Event: Bot died
     */
    bot.on('death', () => {
        logger.warn('Bot died! Respawning...');
    });

    /**
     * Event: Bot kicked from server
     */
    bot.on('kicked', (reason, loggedIn) => {
        logger.error('Bot kicked from server', { reason, loggedIn });
    });

    /**
     * Event: Bot error
     */
    bot.on('error', (err) => {
        logger.error('Bot error', { error: err.message, code: err.code });

        if (err.code === 'ECONNREFUSED') {
            logger.error('Cannot connect to server. Is Minecraft running?');
        }
    });

    /**
     * Event: Chat message received
     */
    bot.on('chat', (username, message) => {
        // Ignore own messages
        if (username === bot.username) return;

        logger.debug('Chat message', { username, message });

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
  logger.info('Bot disconnected', { reason: reason || 'Unknown' });
  if (consolidationTimer) {
    clearInterval(consolidationTimer);
    consolidationTimer = null;
  }
  if (reflectionTimer) {
    clearInterval(reflectionTimer);
    reflectionTimer = null;
  }
  if (driveTimer) {
    clearInterval(driveTimer);
    driveTimer = null;
  }
});
}

/**
 * Build context object for DriveSystem from current bot state
 */
function buildDriveContext(botInstance) {
  const health = botInstance?.health ?? 20;
  const food = botInstance?.food ?? 20;
  const inventory = botInstance?.inventory?.items() ?? [];
  const entityKeys = botInstance?.entities ? Object.keys(botInstance.entities) : [];

  let playerProximity = Infinity;
  for (const key of entityKeys) {
    const entity = botInstance.entities[key];
    if (entity.type === 'player' && entity.username !== botInstance?.username) {
      const dist = botInstance.entity.position.distanceTo(entity.position);
      if (dist < playerProximity) {
        playerProximity = dist;
      }
    }
  }

  return {
    health,
    food,
    inventory: inventory.map(item => ({ name: item.name, count: item.count })),
    recentEvents: [],
    playerProximity,
    unexploredBiomes: 0,
    dangerLevel: 0,
    currentGoal: null
  };
}

/**
 * Initialize all layers after bot is ready
 */
async function initializeLayers() {
    logger.info('Initializing AI layers...');

    // Initialize StateManager
    const stateManager = new StateManager();

    // Ensure state directory exists
    const fs = require('fs').promises;
    const path = require('path');
    const stateDir = path.join(process.cwd(), 'state');

    try {
        await fs.mkdir(stateDir, { recursive: true });
        logger.info('State directory ready', { path: stateDir });
    } catch (err) {
        if (err.code !== 'EEXIST') {
            logger.error('Failed to create state directory', { error: err.message });
            throw err;
        }
    }

    // Initialize state files
    await stateManager.write('state', { position: { x: 0, y: 0, z: 0 }, health: 20, inventory: [], entities: [], blocks: [] });
    await stateManager.write('plan', []);
    await stateManager.write('commands', { goal: null });

    logger.info('State files initialized');

    // Create layer instances
    pilot = new Pilot(bot);
    strategy = new Strategy();
    commander = new Commander();

    // Start layers in sequence (fastest to slowest)
    logger.info('Starting Pilot layer...');
    await pilot.start();

    logger.info('Starting Strategy layer...');
    await strategy.start();

    logger.info('Starting Commander layer...');
    await commander.start();

logger.info('All AI layers running', {
  pilot: pilot.getStatus(),
  layers: ['pilot', 'strategy', 'commander']
});

knowledgeGraph = new KnowledgeGraph();

const consolidationInterval = parseInt(process.env.KG_CONSOLIDATION_INTERVAL_MS) || 600000;
if (process.env.ENABLE_AUTO_CONSOLIDATION === 'true') {
  logger.info('Starting memory consolidation timer', { intervalMs: consolidationInterval });

  consolidationTimer = setInterval(async () => {
    setImmediate(async () => {
      try {
        const stats = await knowledgeGraph.consolidate();
        if (stats.stmToEpisodic > 0 || stats.episodicToLtm > 0 || stats.dropped > 0) {
          logger.info('Memory consolidated', stats);
        }
      } catch (error) {
        logger.error('Memory consolidation failed', { error: error.message });
      }
    });
  }, consolidationInterval);
}

// Initialize ReflectionModule for performance analysis
const actionAwareness = pilot.actionAwareness;
if (actionAwareness) {
  const reflectionModule = new ReflectionModule(actionAwareness, knowledgeGraph);
  const reflectionInterval = parseInt(process.env.REFLECTION_INTERVAL_MS) || 30 * 60 * 1000; // 30 minutes
  
  logger.info('Starting reflection timer', { intervalMs: reflectionInterval });
  
  reflectionTimer = setInterval(() => {
    setImmediate(() => {
      try {
        reflectionModule.reflect();
      } catch (error) {
        logger.error('Reflection failed', { error: error.message });
      }
    });
  }, reflectionInterval);
}

// Initialize DriveSystem if feature flag is enabled
if (featureFlags.isEnabled('DRIVES')) {
  const driveSystem = getDriveSystem();
  const driveInterval = parseInt(process.env.DRIVE_INTERVAL_MS) || 5000;

  logger.info('Starting drive computation timer', { intervalMs: driveInterval });

  driveTimer = setInterval(() => {
    setImmediate(async () => {
      try {
        const context = buildDriveContext(bot);
        const scores = driveSystem.computeDriveScores(context);
        await stateManager.setDriveScores(scores);
      } catch (error) {
        logger.error('Drive computation failed', { error: error.message });
      }
    });
  }, driveInterval);
}
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal) {
    if (isShuttingDown) {
        logger.warn('Shutdown already in progress, ignoring signal', { signal });
        return;
    }

    isShuttingDown = true;
    logger.info('Shutting down...', { signal });

    const shutdownTimeout = setTimeout(() => {
        logger.error('Shutdown timeout exceeded, forcing exit');
        process.exit(1);
    }, 10000);

    try {
        // Stop layers in reverse order (slowest to fastest)
        if (commander) {
            logger.info('Stopping Commander layer...');
            await commander.stop();
        }

        if (strategy) {
            logger.info('Stopping Strategy layer...');
            await strategy.stop();
        }

if (pilot) {
    logger.info('Stopping Pilot layer...');
    await pilot.stop();
  }

  if (driveTimer) {
    logger.info('Stopping drive computation timer...');
    clearInterval(driveTimer);
    driveTimer = null;
  }

  // Stop dashboard process if running
  if (dashboardProcess) {
    logger.info('Stopping dashboard process...');
    dashboardProcess.kill();
    dashboardProcess = null;
  }

  // Disconnect bot
  if (bot) {
    logger.info('Disconnecting bot...');
    bot.end();
  }

        clearTimeout(shutdownTimeout);
        logger.info('Shutdown complete');

        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown', { error: error.message, stack: error.stack });
        clearTimeout(shutdownTimeout);
        process.exit(1);
    }
}

/**
 * Main entry point
 */
async function main() {
    logger.info('Minecraft AI Bot starting...', {
        nodeVersion: process.version,
        platform: process.platform,
        env: {
            host: process.env.MINECRAFT_HOST,
            port: process.env.MINECRAFT_PORT,
            pilotInterval: process.env.PILOT_INTERVAL,
            strategyInterval: process.env.STRATEGY_INTERVAL,
            commanderInterval: process.env.COMMANDER_INTERVAL
        }
    });

    try {
        // Create bot
        bot = createBot();

// Set up event handlers
  setupBotEvents(bot);

  // Spawn dashboard server (non-blocking)
  spawnDashboard();

  // Wait for bot to be ready
        bot.on('ready', async () => {
            logger.info('Bot ready for AI control');

            try {
                await initializeLayers();
                logger.info('Bot fully initialized and running');
            } catch (error) {
                logger.error('Failed to initialize layers', { error: error.message, stack: error.stack });
                gracefulShutdown('initialization_error');
            }
        });

        // Handle bot commands from chat
        bot.on('bot_command', async ({ username, command }) => {
            logger.info('Received bot command', { username, command });

            try {
                const stateManager = new StateManager();

                // Parse command
                if (command === 'stop' || command === 'halt') {
                    await stateManager.write('commands', { goal: null, emergency_stop: true });
                    await stateManager.write('plan', []);
                    bot.chat('Stopping all activities.');
                } else if (command.startsWith('goal ')) {
                    const goal = command.slice(5).trim();
                    await stateManager.write('commands', { goal, timestamp: Date.now() });
                    bot.chat(`Setting goal: ${goal}`);
                } else {
                    // Treat as goal
                    await stateManager.write('commands', { goal: command, timestamp: Date.now() });
                    bot.chat(`Setting goal: ${command}`);
                }
            } catch (error) {
                logger.error('Failed to process command', { error: error.message });
                bot.chat('Error processing command.');
            }
        });

        // Set up shutdown handlers
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    } catch (error) {
        logger.error('Failed to start bot', { error: error.message, stack: error.stack });
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main().catch((error) => {
        logger.error('Unhandled error in main', { error: error.message, stack: error.stack });
        process.exit(1);
    });
}

// Export for testing
module.exports = {
  createBot,
  initializeLayers,
  gracefulShutdown,
  spawnDashboard
};
