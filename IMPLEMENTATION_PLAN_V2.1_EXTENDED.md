# Implementation Plan V2.1 - Extended Features

## 🧠 Phase 8: Memory System (2h)

### 1. Memory Store (`src/memory/memory-store.js`)
```javascript
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../utils/logger');

class MemoryStore {
  constructor(dbPath = 'state/memory.db') {
    this.db = new sqlite3.Database(dbPath);
    this._initTables();
  }

  _initTables() {
    this.db.serialize(() => {
      // Semantic memory: facts about the world
      this.db.run(`CREATE TABLE IF NOT EXISTS semantic_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE,
        value TEXT,
        confidence REAL DEFAULT 1.0,
        created_at INTEGER,
        updated_at INTEGER
      )`);

      // Episodic memory: events that happened
      this.db.run(`CREATE TABLE IF NOT EXISTS episodic_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT,
        description TEXT,
        position TEXT,
        timestamp INTEGER,
        outcome TEXT
      )`);

      // Spatial memory: locations and POIs
      this.db.run(`CREATE TABLE IF NOT EXISTS spatial_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        type TEXT,
        position TEXT,
        description TEXT,
        created_at INTEGER,
        last_visited INTEGER
      )`);

      // Skill memory: learned behaviors
      this.db.run(`CREATE TABLE IF NOT EXISTS skill_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_name TEXT UNIQUE,
        description TEXT,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        last_used INTEGER
      )`);
    });
  }

  // Semantic memory
  async remember(key, value, confidence = 1.0) {
    const now = Date.now();
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO semantic_memory (key, value, confidence, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [key, JSON.stringify(value), confidence, now, now],
        (err) => err ? reject(err) : resolve()
      );
    });
  }

  async recall(key) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT value, confidence FROM semantic_memory WHERE key = ?`,
        [key],
        (err, row) => {
          if (err) reject(err);
          else resolve(row ? { value: JSON.parse(row.value), confidence: row.confidence } : null);
        }
      );
    });
  }

  // Episodic memory
  async recordEvent(eventType, description, position, outcome) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO episodic_memory (event_type, description, position, timestamp, outcome)
         VALUES (?, ?, ?, ?, ?)`,
        [eventType, description, JSON.stringify(position), Date.now(), outcome],
        (err) => err ? reject(err) : resolve()
      );
    });
  }

  async getRecentEvents(limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM episodic_memory ORDER BY timestamp DESC LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(r => ({ ...r, position: JSON.parse(r.position) })));
        }
      );
    });
  }

  // Spatial memory
  async savePOI(name, type, position, description) {
    const now = Date.now();
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO spatial_memory (name, type, position, description, created_at, last_visited)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [name, type, JSON.stringify(position), description, now, now],
        (err) => err ? reject(err) : resolve()
      );
    });
  }

  async findNearestPOI(currentPosition, type = null) {
    return new Promise((resolve, reject) => {
      const query = type
        ? `SELECT * FROM spatial_memory WHERE type = ?`
        : `SELECT * FROM spatial_memory`;
      
      this.db.all(query, type ? [type] : [], (err, rows) => {
        if (err) reject(err);
        else {
          const pois = rows.map(r => ({
            ...r,
            position: JSON.parse(r.position),
            distance: this._distance(currentPosition, JSON.parse(r.position))
          }));
          pois.sort((a, b) => a.distance - b.distance);
          resolve(pois[0] || null);
        }
      });
    });
  }

  _distance(pos1, pos2) {
    return Math.sqrt(
      Math.pow(pos1.x - pos2.x, 2) +
      Math.pow(pos1.z - pos2.z, 2)
    );
  }

  // Skill memory
  async recordSkillUse(skillName, success) {
    const now = Date.now();
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO skill_memory (skill_name, description, success_count, failure_count, last_used)
         VALUES (?, '', ?, ?, ?)
         ON CONFLICT(skill_name) DO UPDATE SET
           success_count = success_count + ?,
           failure_count = failure_count + ?,
           last_used = ?`,
        [skillName, success ? 1 : 0, success ? 0 : 1, now, success ? 1 : 0, success ? 0 : 1, now],
        (err) => err ? reject(err) : resolve()
      );
    });
  }

  async getSkillStats(skillName) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM skill_memory WHERE skill_name = ?`,
        [skillName],
        (err, row) => err ? reject(err) : resolve(row)
      );
    });
  }
}

module.exports = MemoryStore;
```

### 2. Memory Integration in Layers

**Strategy with Memory:**
```javascript
// In strategy.js _plan() method
const memory = new MemoryStore();

// Recall previous attempts
const previousAttempts = await memory.recall(`goal:${goal}`);
if (previousAttempts && previousAttempts.value.failures > 3) {
  logger.warn('Goal failed multiple times, trying different approach');
}

// Remember POIs
const nearestBase = await memory.findNearestPOI(state.position, 'base');
if (nearestBase) {
  logger.info('Base location known', { base: nearestBase });
}

// After plan execution
await memory.remember(`goal:${goal}`, {
  attempts: (previousAttempts?.value.attempts || 0) + 1,
  lastAttempt: Date.now(),
  success: planSucceeded
});
```

---

## 💬 Phase 9: In-Game Chat Integration (1h)

### 1. Chat Handler (`src/chat/chat-handler.js`)
```javascript
const logger = require('../utils/logger');
const StateManager = require('../utils/state-manager');

class ChatHandler {
  constructor(bot) {
    this.bot = bot;
    this.stateManager = new StateManager();
    this.commandPrefix = '!bot';
    this._setupListeners();
  }

  _setupListeners() {
    this.bot.on('chat', async (username, message) => {
      if (username === this.bot.username) return; // Ignore self

      logger.info('Chat message', { username, message });

      // Check if message is a command
      if (message.startsWith(this.commandPrefix)) {
        await this._handleCommand(username, message);
      } else if (message.includes(this.bot.username)) {
        // Bot was mentioned
        await this._handleMention(username, message);
      }
    });

    this.bot.on('whisper', async (username, message) => {
      logger.info('Whisper', { username, message });
      await this._handleWhisper(username, message);
    });
  }

  async _handleCommand(username, message) {
    const command = message.slice(this.commandPrefix.length).trim();
    const parts = command.split(' ');
    const action = parts[0];
    const args = parts.slice(1);

    logger.info('Command received', { username, action, args });

    switch (action) {
      case 'help':
        this.bot.chat(`Commands: !bot collect <item> <count>, !bot goto <x> <y> <z>, !bot status, !bot follow <player>`);
        break;

      case 'collect':
        const item = args[0];
        const count = parseInt(args[1]) || 64;
        await this.stateManager.write('commands', {
          goal: `collect ${count} ${item}`,
          requestedBy: username,
          timestamp: Date.now()
        });
        this.bot.chat(`${username}: Starting to collect ${count} ${item}`);
        break;

      case 'goto':
        const [x, y, z] = args.map(Number);
        if (isNaN(x) || isNaN(y) || isNaN(z)) {
          this.bot.chat(`${username}: Invalid coordinates`);
          return;
        }
        await this.stateManager.write('commands', {
          goal: `navigate to ${x} ${y} ${z}`,
          requestedBy: username,
          timestamp: Date.now()
        });
        this.bot.chat(`${username}: Going to ${x} ${y} ${z}`);
        break;

      case 'status':
        const state = await this.stateManager.read('current');
        const progress = await this.stateManager.read('progress');
        this.bot.chat(`Health: ${state.health}/20, Food: ${state.food}/20, Goal: ${progress?.goal || 'none'}`);
        break;

      case 'follow':
        const playerName = args[0];
        await this.stateManager.write('commands', {
          goal: `follow ${playerName}`,
          requestedBy: username,
          timestamp: Date.now()
        });
        this.bot.chat(`${username}: Following ${playerName}`);
        break;

      case 'stop':
        await this.stateManager.write('commands', { goal: null });
        this.bot.chat(`${username}: Stopped current task`);
        break;

      default:
        this.bot.chat(`${username}: Unknown command. Type !bot help`);
    }
  }

  async _handleMention(username, message) {
    // Simple response for now
    this.bot.chat(`${username}: Yes?`);
  }

  async _handleWhisper(username, message) {
    // Private commands
    this.bot.whisper(username, `You said: ${message}`);
  }

  // Called by Commander to send updates
  async sendUpdate(message) {
    this.bot.chat(message);
  }
}

module.exports = ChatHandler;
```

### 2. Voice → In-Game Chat Flow

**Integration in Commander:**
```javascript
// In commander.js
const ChatHandler = require('../chat/chat-handler');

class Commander {
  constructor(bot) {
    // ... existing code
    this.chatHandler = new ChatHandler(bot);
  }

  async _checkVoiceCommands() {
    // OpenClaw Telegram voice → transcribed text → commands.json
    const commands = await this.stateManager.read('commands');
    
    if (commands && commands.source === 'telegram_voice') {
      // Send confirmation to in-game chat
      await this.chatHandler.sendUpdate(`Voice command received: ${commands.goal}`);
    }
  }

  async _applyDecision(decision, currentCommands) {
    // ... existing code
    
    // Send updates to in-game chat
    if (decision.report) {
      await this.chatHandler.sendUpdate(decision.report);
    }
  }
}
```

---

## 🗺️ Phase 10: Spatial Memory & Navigation (1h)

### 1. World Map (`src/memory/world-map.js`)
```javascript
const MemoryStore = require('./memory-store');
const logger = require('../utils/logger');

class WorldMap {
  constructor(bot) {
    this.bot = bot;
    this.memory = new MemoryStore();
    this.exploredChunks = new Set();
    this._setupTracking();
  }

  _setupTracking() {
    // Track explored chunks
    setInterval(() => {
      const pos = this.bot.entity.position;
      const chunkX = Math.floor(pos.x / 16);
      const chunkZ = Math.floor(pos.z / 16);
      const chunkKey = `${chunkX},${chunkZ}`;
      
      if (!this.exploredChunks.has(chunkKey)) {
        this.exploredChunks.add(chunkKey);
        logger.debug('New chunk explored', { chunkX, chunkZ });
      }
    }, 5000);

    // Auto-save home base on first spawn
    this.bot.once('spawn', async () => {
      const spawnPos = this.bot.entity.position;
      await this.memory.savePOI('spawn', 'base', spawnPos, 'Initial spawn point');
      logger.info('Spawn point saved as base', { position: spawnPos });
    });
  }

  async markPOI(name, type, description) {
    const pos = this.bot.entity.position;
    await this.memory.savePOI(name, type, pos, description);
    logger.info('POI marked', { name, type, position: pos });
  }

  async findNearestPOI(type) {
    const currentPos = this.bot.entity.position;
    return await this.memory.findNearestPOI(currentPos, type);
  }

  async goHome() {
    const home = await this.findNearestPOI('base');
    if (home) {
      return home.position;
    }
    return null;
  }

  getExplorationProgress() {
    return {
      chunksExplored: this.exploredChunks.size,
      estimatedArea: this.exploredChunks.size * 256 // 16x16 blocks per chunk
    };
  }
}

module.exports = WorldMap;
```

---

## 👥 Phase 11: Social Awareness (30 min)

### 1. Player Tracker (`src/social/player-tracker.js`)
```javascript
const logger = require('../utils/logger');

class PlayerTracker {
  constructor(bot) {
    this.bot = bot;
    this.players = new Map();
    this.reputation = new Map();
    this._setupTracking();
  }

  _setupTracking() {
    this.bot.on('playerJoined', (player) => {
      logger.info('Player joined', { username: player.username });
      this.players.set(player.username, {
        username: player.username,
        uuid: player.uuid,
        joinedAt: Date.now(),
        lastSeen: Date.now()
      });
    });

    this.bot.on('playerLeft', (player) => {
      logger.info('Player left', { username: player.username });
      const playerData = this.players.get(player.username);
      if (playerData) {
        playerData.leftAt = Date.now();
      }
    });

    // Track player positions
    setInterval(() => {
      Object.values(this.bot.players).forEach(player => {
        if (player.entity) {
          const existing = this.players.get(player.username);
          if (existing) {
            existing.lastSeen = Date.now();
            existing.position = player.entity.position;
          }
        }
      });
    }, 5000);
  }

  getOnlinePlayers() {
    return Array.from(this.players.values()).filter(p => !p.leftAt);
  }

  getNearbyPlayers(radius = 16) {
    const botPos = this.bot.entity.position;
    return this.getOnlinePlayers().filter(p => {
      if (!p.position) return false;
      const dist = botPos.distanceTo(p.position);
      return dist <= radius;
    });
  }

  setReputation(username, value) {
    // value: 1 = friendly, 0 = neutral, -1 = hostile
    this.reputation.set(username, value);
    logger.info('Reputation set', { username, value });
  }

  getReputation(username) {
    return this.reputation.get(username) || 0;
  }

  isFriendly(username) {
    return this.getReputation(username) > 0;
  }
}

module.exports = PlayerTracker;
```

---

## 🛠️ Phase 12: Advanced Actions (2h)

### 1. Crafting System (`src/actions/crafting.js`)
```javascript
const logger = require('../utils/logger');

class CraftingSystem {
  constructor(bot) {
    this.bot = bot;
    this.mcData = require('minecraft-data')(bot.version);
  }

  async craft(itemName, count = 1) {
    const item = this.mcData.itemsByName[itemName];
    if (!item) {
      logger.error('Unknown item', { itemName });
      return false;
    }

    const recipe = this.bot.recipesFor(item.id)[0];
    if (!recipe) {
      logger.error('No recipe found', { itemName });
      return false;
    }

    try {
      // Find crafting table if needed
      if (recipe.requiresTable) {
        const craftingTable = this.bot.findBlock({
          matching: this.mcData.blocksByName.crafting_table.id,
          maxDistance: 32
        });

        if (!craftingTable) {
          logger.warn('Crafting table required but not found');
          return false;
        }
      }

      await this.bot.craft(recipe, count);
      logger.info('Crafted item', { itemName, count });
      return true;
    } catch (error) {
      logger.error('Crafting failed', { itemName, error });
      return false;
    }
  }

  canCraft(itemName) {
    const item = this.mcData.itemsByName[itemName];
    if (!item) return false;

    const recipe = this.bot.recipesFor(item.id)[0];
    return recipe !== undefined;
  }

  getRequiredMaterials(itemName) {
    const item = this.mcData.itemsByName[itemName];
    if (!item) return null;

    const recipe = this.bot.recipesFor(item.id)[0];
    if (!recipe) return null;

    return recipe.delta.map(d => ({
      item: this.mcData.items[d.id].name,
      count: Math.abs(d.count)
    }));
  }
}

module.exports = CraftingSystem;
```

### 2. Building System (`src/actions/building.js`)
```javascript
const { Vec3 } = require('vec3');
const logger = require('../utils/logger');

class BuildingSystem {
  constructor(bot) {
    this.bot = bot;
    this.mcData = require('minecraft-data')(bot.version);
  }

  async buildWall(startPos, length, height, blockType = 'planks') {
    const block = this.mcData.blocksByName[blockType];
    if (!block) {
      logger.error('Unknown block type', { blockType });
      return false;
    }

    try {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < length; x++) {
          const pos = startPos.offset(x, y, 0);
          await this._placeBlock(pos, blockType);
        }
      }
      logger.info('Wall built', { length, height, blockType });
      return true;
    } catch (error) {
      logger.error('Building failed', { error });
      return false;
    }
  }

  async buildSimpleHouse(cornerPos, width = 5, depth = 5, height = 3) {
    logger.info('Building house', { cornerPos, width, depth, height });

    // Walls
    for (let side = 0; side < 4; side++) {
      // Calculate wall positions
      // ... implementation
    }

    // Roof
    // ... implementation

    // Door
    // ... implementation

    logger.info('House completed');
    return true;
  }

  async _placeBlock(pos, blockType) {
    const referenceBlock = this.bot.blockAt(pos.offset(0, -1, 0));
    if (!referenceBlock) return false;

    const item = this.bot.inventory.items().find(i => i.name === blockType);
    if (!item) {
      logger.warn('Missing block in inventory', { blockType });
      return false;
    }

    await this.bot.equip(item, 'hand');
    await this.bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
    return true;
  }
}

module.exports = BuildingSystem;
```

---

## 🎯 Phase 13: Safety & Permissions (30 min)

### 1. Safety Manager (`src/safety/safety-manager.js`)
```javascript
const logger = require('../utils/logger');

class SafetyManager {
  constructor(bot) {
    this.bot = bot;
    this.config = {
      allowedActions: ['move', 'jump', 'dig', 'place', 'craft'],
      protectedAreas: [],
      maxDigDepth: 64,
      allowPvP: false,
      allowGriefing: false
    };
  }

  isActionAllowed(action) {
    return this.config.allowedActions.includes(action);
  }

  isPositionSafe(position) {
    // Check if position is in protected area
    for (const area of this.config.protectedAreas) {
      if (this._isInArea(position, area)) {
        logger.warn('Position in protected area', { position, area });
        return false;
      }
    }

    // Check depth limit
    if (position.y < this.config.maxDigDepth) {
      logger.warn('Position below max dig depth', { position });
      return false;
    }

    return true;
  }

  canAttackEntity(entity) {
    // Never attack players unless PvP is enabled
    if (entity.type === 'player' && !this.config.allowPvP) {
      logger.warn('PvP disabled, cannot attack player', { entity: entity.username });
      return false;
    }

    return true;
  }

  canBreakBlock(block) {
    // Check if block is player-placed (grief prevention)
    if (!this.config.allowGriefing) {
      // Simple heuristic: don't break crafted blocks
      const craftedBlocks = ['crafting_table', 'chest', 'furnace', 'bed'];
      if (craftedBlocks.includes(block.name)) {
        logger.warn('Grief prevention: cannot break crafted block', { block: block.name });
        return false;
      }
    }

    return true;
  }

  _isInArea(position, area) {
    return position.x >= area.min.x && position.x <= area.max.x &&
           position.y >= area.min.y && position.y <= area.max.y &&
           position.z >= area.min.z && position.z <= area.max.z;
  }

  addProtectedArea(name, min, max) {
    this.config.protectedAreas.push({ name, min, max });
    logger.info('Protected area added', { name, min, max });
  }
}

module.exports = SafetyManager;
```

---

## 📊 Updated Success Criteria

Bot is considered successful when it can:
- ✅ Connect to Minecraft server reliably
- ✅ Survive for >30 minutes without dying
- ✅ Complete simple goals (collect 64 wood)
- ✅ Avoid common hazards (lava, mobs, falls)
- ✅ Respond to voice commands via Telegram
- ✅ **Respond to in-game chat commands**
- ✅ **Remember locations (base, resources)**
- ✅ **Learn from past experiences**
- ✅ Recover from errors (death, stuck, disconnect)
- ✅ Stay within rate limits (560 RPM)
- ✅ **Craft basic items**
- ✅ **Build simple structures**
- ✅ **Interact safely with other players**
- ✅ Provide useful feedback to user

---

## 🎯 Implementation Priority

**Must-have (Phase 8-9):**
1. Memory system (semantic + episodic)
2. In-game chat handler
3. Voice → in-game chat integration

**Should-have (Phase 10-11):**
4. Spatial memory (POIs, world map)
5. Player tracker (social awareness)

**Nice-to-have (Phase 12-13):**
6. Crafting system
7. Building system
8. Safety manager

**Total additional time:** +6-8 hours
**New total:** 12-16 hours for full implementation

Ready to implement with OpenCode?
