/**
 * @fileoverview In-game chat command processing
 */

'use strict';

const path = require('path');
const StateManager = require('../utils/state-manager');
const logger = require('../utils/logger');

const COMMANDS = {
  collect: { description: 'Collect resources (e.g., !bot collect wood)', usage: '!bot collect <resource>' },
  build: { description: 'Build a structure', usage: '!bot build <structure>' },
  goto: { description: 'Navigate to a location', usage: '!bot goto <x> <y> <z>' },
  status: { description: 'Show bot status', usage: '!bot status' },
  stop: { description: 'Stop current action and halt', usage: '!bot stop' },
  help: { description: 'Show available commands', usage: '!bot help' }
};

function parseCommand(command) {
  const parts = command.trim().split(/\s+/);
  return { action: parts[0]?.toLowerCase(), args: parts.slice(1) };
}

async function getBotStatus(bot) {
  const pos = bot.entity.position;
  return [
    `Health: ${bot.health?.toFixed(1) || 0}/20`,
    `Position: ${Math.round(pos.x)} ${Math.round(pos.y)} ${Math.round(pos.z)}`,
    `Game Mode: ${bot.game.gameMode || 'unknown'}`
  ].join(' | ');
}

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
      return ['[Commands]', Object.entries(COMMANDS).map(([, info]) => `  ${info.usage} - ${info.description}`).join('\n'), 'Example: !bot collect wood'].join('\n');

    default:
      return `Unknown command: "${action}". Type !bot help for available commands.`;
  }
}

function createChatHandler(bot) {
  const stateManager = new StateManager(path.join(process.cwd(), 'state'));

  async function onBotCommand({ username, command }) {
    logger.info(`[Chat] Processing command from ${username}: ${command}`);

    try {
      const { action, args } = parseCommand(command);

      if (!action) {
        bot.chat('Usage: !bot <command>. Type !bot help for commands.');
        return;
      }

      const response = await executeCommand(username, action, args, bot, stateManager);
      bot.chat(response);
      logger.info(`[Chat] Response sent: ${response.split('\n')[0]}`);

    } catch (err) {
      logger.error(`[Chat] Command failed: ${err.message}`);
      bot.chat(`Error processing command: ${err.message}`);
    }
  }

  bot.on('bot_command', onBotCommand);
  logger.info('[Chat] Chat handler initialized');

  return {
    bot,
    stateManager,
    commands: COMMANDS,
    remove() {
      bot.off('bot_command', onBotCommand);
      logger.info('[Chat] Chat handler removed');
    }
  };
}

module.exports = { createChatHandler, COMMANDS };