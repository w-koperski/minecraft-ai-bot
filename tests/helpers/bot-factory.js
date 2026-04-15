const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const collectblock = require('mineflayer-collectblock').plugin;

const MINECRAFT_HOST = process.env.MINECRAFT_HOST || 'localhost';
const MINECRAFT_PORT = parseInt(process.env.MINECRAFT_PORT) || 25565;

let botCounter = 0;

function createTestBot(options = {}) {
  const username = options.username || `TestBot_${++botCounter}_${Date.now()}`;
  
  const bot = mineflayer.createBot({
    host: MINECRAFT_HOST,
    port: MINECRAFT_PORT,
    username: username,
    auth: 'offline',
    checkTimeoutInterval: 60000,
    version: false,
    ...options
  });

  bot.loadPlugin(pathfinder);
  bot.loadPlugin(collectblock);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      bot.quit();
      reject(new Error(`Bot ${username} failed to spawn within 10 seconds`));
    }, 10000);

    bot.on('spawn', () => {
      clearTimeout(timeout);
      
      const { Movements, goals } = require('mineflayer-pathfinder');
      const mcData = require('minecraft-data')(bot.version);
      const defaultMove = new Movements(bot, mcData);
      defaultMove.canDig = true;
      bot.pathfinder.setMovements(defaultMove);
      
      resolve({ bot, Movements, goals, defaultMove });
    });

    bot.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    bot.on('kicked', (reason) => {
      clearTimeout(timeout);
      reject(new Error(`Bot kicked: ${reason}`));
    });
  });
}

async function disconnectBot(bot) {
  return new Promise((resolve) => {
    if (!bot || !bot._client || bot._client.socket.destroyed) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      resolve();
    }, 2000);

    bot.once('end', () => {
      clearTimeout(timeout);
      resolve();
    });

    try {
      bot.quit();
    } catch (err) {
      clearTimeout(timeout);
      resolve();
    }
  });
}

async function withBot(options, testFn) {
  const { bot, ...pathfinderModules } = await createTestBot(options);
  
  try {
    await testFn(bot, pathfinderModules);
  } finally {
    await disconnectBot(bot);
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForCondition(condition, timeout = 5000, interval = 100) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await sleep(interval);
  }
  
  return false;
}

async function giveItems(bot, itemName, count = 1) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Failed to give ${count} ${itemName} within 5 seconds`));
    }, 5000);

    bot.chat(`/give @s minecraft:${itemName} ${count}`);

    const initialCount = bot.inventory.count(bot.registry.itemsByName[itemName]?.id || 0);
    
    const checkInterval = setInterval(() => {
      const currentCount = bot.inventory.count(bot.registry.itemsByName[itemName]?.id || 0);
      if (currentCount >= initialCount + count) {
        clearTimeout(timeout);
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
  });
}

async function setGameMode(bot, mode = 'creative') {
  return new Promise((resolve, reject) => {
    bot.chat(`/gamemode ${mode}`);
    setTimeout(resolve, 500);
  });
}

async function teleport(bot, x, y, z) {
  return new Promise((resolve) => {
    bot.chat(`/tp @s ${x} ${y} ${z}`);
    setTimeout(resolve, 500);
  });
}

async function setTime(bot, time = 'day') {
  return new Promise((resolve) => {
    bot.chat(`/time set ${time}`);
    setTimeout(resolve, 500);
  });
}

async function clearInventory(bot) {
  return new Promise((resolve) => {
    bot.chat('/clear');
    setTimeout(resolve, 500);
  });
}

function getBlockAt(bot, x, y, z) {
  return bot.blockAt({ x, y, z });
}

async function findBlock(bot, blockType, maxDistance = 32) {
  const blockIds = [bot.registry.blocksByName[blockType]?.id].filter(Boolean);
  
  if (blockIds.length === 0) return null;
  
  return bot.findBlock({
    matching: blockIds,
    maxDistance,
    useExtraInfo: true
  });
}

module.exports = {
  createTestBot,
  disconnectBot,
  withBot,
  sleep,
  waitForCondition,
  giveItems,
  setGameMode,
  teleport,
  setTime,
  clearInventory,
  getBlockAt,
  findBlock
};
