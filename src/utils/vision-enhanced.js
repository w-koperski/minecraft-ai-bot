/**
 * Enhanced Vision System - Extracts full game state from Mineflayer bot
 * 
 * Provides comprehensive environmental awareness for LLM decision-making:
 * - Position, health, food status
 * - Inventory contents
 * - Nearby blocks (16 block radius)
 * - Nearby entities (32 block radius)
 * - Recent chat messages (last 10)
 * - Recent events/occurrences
 */

/**
 * Extracts complete game state from Mineflayer bot instance
 * @param {Object} bot - Mineflayer bot instance
 * @returns {Object} Structured game state for LLM consumption
 */
function extractState(bot) {
  if (!bot) {
    return { error: 'No bot instance provided' };
  }

  const state = {
    timestamp: new Date().toISOString(),
    
    // Bot status
    self: extractSelfState(bot),
    
    // Environmental awareness
    blocks: extractNearbyBlocks(bot),
    entities: extractNearbyEntities(bot),
    
    // Communication
    chat: extractRecentChat(bot),
    
    // Event tracking
    events: extractRecentEvents(bot)
  };

  return state;
}

/**
 * Extract bot's own state (position, health, inventory)
 */
function extractSelfState(bot) {
  const self = {
    position: { x: 0, y: 0, z: 0 },
    health: 20,
    food: 20,
    saturation: 0,
    experience: { level: 0, progress: 0, total: 0 },
    game_mode: 'survival',
    inventory: [],
    held_item: null,
    is_on_ground: true,
    is_in_water: false,
    is_in_lava: false
  };

  // Position
  if (bot.entity && bot.entity.position) {
    self.position = {
      x: Math.floor(bot.entity.position.x),
      y: Math.floor(bot.entity.position.y),
      z: Math.floor(bot.entity.position.z)
    };
  }

  // Health and food
  if (typeof bot.health === 'number') {
    self.health = Math.round(bot.health);
  }
  if (typeof bot.food === 'number') {
    self.food = Math.round(bot.food);
  }
  if (typeof bot.foodSaturation === 'number') {
    self.saturation = Math.round(bot.foodSaturation * 10) / 10;
  }

  // Experience
  if (typeof bot.experience === 'object') {
    self.experience = {
      level: bot.experience.level || 0,
      progress: Math.round((bot.experience.progress || 0) * 100) / 100,
      total: bot.experience.points || 0
    };
  }

  // Game mode
  if (bot.game && bot.game.gameMode) {
    self.game_mode = bot.game.gameMode;
  }

  // Inventory
  if (bot.inventory) {
    self.inventory = extractInventory(bot);
  }

  // Held item
  if (bot.heldItem) {
    self.held_item = formatItem(bot.heldItem);
  }

  // Physical state
  if (bot.entity) {
    self.is_on_ground = bot.entity.onGround !== false;
    self.is_in_water = bot.entity.isInWater === true;
    self.is_in_lava = bot.entity.isInLava === true;
  }

  return self;
}

/**
 * Extract inventory as array of items
 */
function extractInventory(bot) {
  const items = [];
  
  if (!bot.inventory || typeof bot.inventory.items !== 'function') {
    return items;
  }

  try {
    const inventoryItems = bot.inventory.items();
    for (const item of inventoryItems) {
      if (item && item.name) {
        items.push(formatItem(item));
      }
    }
  } catch (err) {
    // Inventory access failed
  }

  return items;
}

/**
 * Format a single item for LLM consumption
 */
function formatItem(item) {
  if (!item) return null;
  
  return {
    name: item.name || 'unknown',
    display_name: item.displayName || item.name || 'Unknown',
    count: item.count || 1,
    slot: item.slot !== undefined ? item.slot : -1,
    durability: item.durability ? item.maxDurability - item.durability : null,
    max_durability: item.maxDurability || null,
    enchantments: item.nbt ? (item.nbt.value ? 'has_nbt' : null) : null
  };
}

/**
 * Extract nearby blocks within 16 block radius
 */
function extractNearbyBlocks(bot) {
  const blocks = [];
  const radius = 16;

  if (!bot.entity || !bot.entity.position) {
    return blocks;
  }

  const pos = bot.entity.position;
  const minX = Math.floor(pos.x) - radius;
  const maxX = Math.floor(pos.x) + radius;
  const minY = Math.floor(pos.y) - radius;
  const maxY = Math.floor(pos.y) + radius;
  const minZ = Math.floor(pos.z) - radius;
  const maxZ = Math.floor(pos.z) + radius;

  // Track block types for summary
  const blockCounts = {};
  const hazardousBlocks = [];
  const valuableBlocks = [];

  // Hazardous block types
  const hazards = new Set(['lava', 'fire', 'cactus', 'sweet_berry_bush', 'wither_rose', 'magma_block']);
  
  // Valuable block types
  const valuables = new Set(['diamond_ore', 'emerald_ore', 'gold_ore', 'iron_ore', 'coal_ore', 
                             'ancient_debris', 'chest', 'spawner', 'portal']);

  try {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          const block = bot.blockAt(new (require('vec3'))(x, y, z));
          if (block && block.name) {
            // Count block types
            blockCounts[block.name] = (blockCounts[block.name] || 0) + 1;

            // Track hazards (within 3 blocks)
            const dist = Math.sqrt(
              Math.pow(x - pos.x, 2) + 
              Math.pow(y - pos.y, 2) + 
              Math.pow(z - pos.z, 2)
            );
            
            if (hazards.has(block.name) && dist <= 3) {
              hazardousBlocks.push({
                type: block.name,
                position: { x, y, z },
                distance: Math.round(dist * 10) / 10
              });
            }

            // Track valuables (within 8 blocks)
            if (valuables.has(block.name) && dist <= 8) {
              valuableBlocks.push({
                type: block.name,
                position: { x, y, z },
                distance: Math.round(dist * 10) / 10
              });
            }
          }
        }
      }
    }
  } catch (err) {
    // Block scanning failed
  }

  return {
    summary: blockCounts,
    hazardous: hazardousBlocks.sort((a, b) => a.distance - b.distance).slice(0, 10),
    valuable: valuableBlocks.sort((a, b) => a.distance - b.distance).slice(0, 10),
    scan_radius: radius
  };
}

/**
 * Extract nearby entities within 32 block radius
 */
function extractNearbyEntities(bot) {
  const entities = {
    players: [],
    mobs: [],
    passive: [],
    hostile: [],
    other: []
  };

  const radius = 32;

  if (!bot.entity || !bot.entity.position) {
    return entities;
  }

  const botPos = bot.entity.position;

  if (!bot.entities) {
    return entities;
  }

  // Entity classification
  const hostileTypes = new Set([
    'zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'witch',
    'drowned', 'husk', 'stray', 'phantom', 'pillager', 'vindicator',
    'ravager', 'wither_skeleton', 'blaze', 'ghast', 'magma_cube',
    'slime', 'shulker', 'endermite', 'silverfish', 'cave_spider'
  ]);

  const passiveTypes = new Set([
    'cow', 'pig', 'sheep', 'chicken', 'rabbit', 'horse', 'donkey',
    'mule', 'llama', 'fox', 'bee', 'turtle', 'dolphin', 'squid',
    'bat', 'cat', 'ocelot', 'parrot', 'wolf', 'villager', 'wandering_trader',
    'iron_golem', 'snow_golem', 'mooshroom', 'panda', 'polar_bear',
    'strider', 'hoglin', 'axolotl', 'goat', 'frog', 'allay', 'sniffer'
  ]);

  try {
    for (const id in bot.entities) {
      const entity = bot.entities[id];
      
      if (!entity || !entity.position || entity === bot.entity) {
        continue;
      }

      const dist = entity.position.distanceTo(botPos);
      if (dist > radius) continue;

      const entityInfo = {
        type: entity.name || entity.type || 'unknown',
        position: {
          x: Math.floor(entity.position.x),
          y: Math.floor(entity.position.y),
          z: Math.floor(entity.position.z)
        },
        distance: Math.round(dist * 10) / 10,
        uuid: entity.uuid || null
      };

      // Classify entity
      if (entity.type === 'player') {
        entityInfo.username = entity.username || 'unknown';
        entities.players.push(entityInfo);
      } else if (hostileTypes.has(entity.name)) {
        entities.hostile.push(entityInfo);
        entities.mobs.push(entityInfo);
      } else if (passiveTypes.has(entity.name)) {
        entities.passive.push(entityInfo);
        entities.mobs.push(entityInfo);
      } else {
        entities.other.push(entityInfo);
      }
    }
  } catch (err) {
    // Entity scanning failed
  }

  // Sort by distance
  entities.players.sort((a, b) => a.distance - b.distance);
  entities.hostile.sort((a, b) => a.distance - b.distance);
  entities.passive.sort((a, b) => a.distance - b.distance);
  entities.other.sort((a, b) => a.distance - b.distance);

  return entities;
}

/**
 * Extract recent chat messages (last 10)
 */
function extractRecentChat(bot) {
  const messages = [];

  // Mineflayer doesn't store chat history by default
  // This would need to be populated by chat event listeners
  // For now, return empty array with structure
  
  if (bot._chatHistory) {
    return bot._chatHistory.slice(-10);
  }

  return {
    messages: [],
    note: 'Chat history requires event listener setup in bot initialization'
  };
}

/**
 * Extract recent events/occurrences
 */
function extractRecentEvents(bot) {
  const events = [];

  // Like chat, events need to be tracked via listeners
  // This structure is ready for event population
  
  if (bot._recentEvents) {
    return bot._recentEvents.slice(-20);
  }

  return {
    events: [],
    note: 'Event tracking requires event listener setup in bot initialization'
  };
}

/**
 * Helper: Set up chat history tracking on bot instance
 * Call this during bot initialization
 */
function setupChatTracking(bot, maxMessages = 50) {
  bot._chatHistory = [];
  
  bot.on('chat', (username, message) => {
    bot._chatHistory.push({
      timestamp: new Date().toISOString(),
      type: 'chat',
      username: username,
      message: message
    });
    
    // Trim old messages
    if (bot._chatHistory.length > maxMessages) {
      bot._chatHistory = bot._chatHistory.slice(-maxMessages);
    }
  });

  bot.on('whisper', (username, message) => {
    bot._chatHistory.push({
      timestamp: new Date().toISOString(),
      type: 'whisper',
      username: username,
      message: message
    });
    
    if (bot._chatHistory.length > maxMessages) {
      bot._chatHistory = bot._chatHistory.slice(-maxMessages);
    }
  });
}

/**
 * Helper: Set up event tracking on bot instance
 * Call this during bot initialization
 */
function setupEventTracking(bot, maxEvents = 100) {
  bot._recentEvents = [];
  
  const trackedEvents = [
    'death', 'spawn', 'health', 'food', 'move',
    'entityHurt', 'entityDead', 'entitySwimStart', 'entitySwimEnd',
    'blockBreak', 'blockPlace', 'diggingCompleted', 'diggingAborted',
    'kicked', 'end', 'error'
  ];

  trackedEvents.forEach(eventName => {
    bot.on(eventName, (...args) => {
      const event = {
        timestamp: new Date().toISOString(),
        type: eventName,
        data: args.length === 1 ? args[0] : args.length > 1 ? args : null
      };

      bot._recentEvents.push(event);

      // Trim old events
      if (bot._recentEvents.length > maxEvents) {
        bot._recentEvents = bot._recentEvents.slice(-maxEvents);
      }
    });
  });
}

module.exports = {
  extractState,
  setupChatTracking,
  setupEventTracking
};
