# Phase 15: Enhanced Vision & Perception (1h)

## Goal: Maximum information extraction from Minecraft

### 1. Enhanced Vision System (`src/utils/vision-enhanced.js`)

```javascript
const logger = require('./logger');

class EnhancedVision {
  constructor(bot) {
    this.bot = bot;
    this.chatHistory = [];
    this.maxChatHistory = 100;
    this.playerActions = new Map();
    this.blockChanges = [];
    this.soundEvents = [];
    this._setupListeners();
  }

  _setupListeners() {
    // Chat messages
    this.bot.on('chat', (username, message) => {
      this.chatHistory.push({
        username,
        message,
        timestamp: Date.now(),
        type: 'chat'
      });
      if (this.chatHistory.length > this.maxChatHistory) {
        this.chatHistory.shift();
      }
    });

    // Whispers
    this.bot.on('whisper', (username, message) => {
      this.chatHistory.push({
        username,
        message,
        timestamp: Date.now(),
        type: 'whisper'
      });
    });

    // System messages
    this.bot.on('message', (jsonMsg) => {
      const text = jsonMsg.toString();
      if (text && !text.startsWith('<')) { // Not a chat message
        this.chatHistory.push({
          username: 'SYSTEM',
          message: text,
          timestamp: Date.now(),
          type: 'system'
        });
      }
    });

    // Player actions
    this.bot.on('entitySwingArm', (entity) => {
      if (entity.type === 'player') {
        this._recordPlayerAction(entity.username, 'swing_arm');
      }
    });

    this.bot.on('entityHurt', (entity) => {
      if (entity.type === 'player') {
        this._recordPlayerAction(entity.username, 'hurt');
      }
    });

    this.bot.on('entityDead', (entity) => {
      if (entity.type === 'player') {
        this._recordPlayerAction(entity.username, 'died');
      }
    });

    // Block changes
    this.bot.on('blockUpdate', (oldBlock, newBlock) => {
      this.blockChanges.push({
        position: oldBlock.position,
        oldBlock: oldBlock.name,
        newBlock: newBlock.name,
        timestamp: Date.now()
      });
      if (this.blockChanges.length > 50) {
        this.blockChanges.shift();
      }
    });

    // Sounds
    this.bot.on('soundEffectHeard', (soundName, position, volume, pitch) => {
      this.soundEvents.push({
        sound: soundName,
        position,
        volume,
        pitch,
        timestamp: Date.now()
      });
      if (this.soundEvents.length > 20) {
        this.soundEvents.shift();
      }
    });

    // Explosions
    this.bot.on('explosion', (position, radius, affectedBlocks) => {
      logger.warn('Explosion detected', { position, radius, affectedBlocks: affectedBlocks.length });
    });
  }

  _recordPlayerAction(username, action) {
    if (!this.playerActions.has(username)) {
      this.playerActions.set(username, []);
    }
    const actions = this.playerActions.get(username);
    actions.push({ action, timestamp: Date.now() });
    if (actions.length > 20) {
      actions.shift();
    }
  }

  extractFullState() {
    const basicState = this._extractBasicState();
    const environmentState = this._extractEnvironmentState();
    const socialState = this._extractSocialState();
    const perceptionState = this._extractPerceptionState();

    return {
      ...basicState,
      environment: environmentState,
      social: socialState,
      perception: perceptionState,
      timestamp: Date.now()
    };
  }

  _extractBasicState() {
    return {
      // Bot state
      position: this.bot.entity.position,
      velocity: this.bot.entity.velocity,
      yaw: this.bot.entity.yaw,
      pitch: this.bot.entity.pitch,
      onGround: this.bot.entity.onGround,
      health: this.bot.health,
      food: this.bot.food,
      foodSaturation: this.bot.foodSaturation,
      oxygen: this.bot.oxygenLevel,
      experience: {
        level: this.bot.experience.level,
        points: this.bot.experience.points,
        progress: this.bot.experience.progress
      },
      
      // Game state
      gameMode: this.bot.game.gameMode,
      difficulty: this.bot.game.difficulty,
      dimension: this.bot.game.dimension,
      
      // Time & weather
      time: {
        timeOfDay: this.bot.time.timeOfDay,
        day: this.bot.time.day,
        age: this.bot.time.age
      },
      weather: {
        isRaining: this.bot.isRaining,
        thunderState: this.bot.thunderState
      },
      
      // Inventory
      inventory: this._getDetailedInventory(),
      equipment: this._getEquipment()
    };
  }

  _extractEnvironmentState() {
    const pos = this.bot.entity.position;
    
    return {
      // Blocks around bot
      nearbyBlocks: this._getNearbyBlocks(8),
      blockBelow: this.bot.blockAt(pos.offset(0, -1, 0))?.name,
      blockAbove: this.bot.blockAt(pos.offset(0, 1, 0))?.name,
      
      // Light level
      lightLevel: this.bot.blockAt(pos)?.light || 0,
      skyLight: this.bot.blockAt(pos)?.skyLight || 0,
      
      // Biome
      biome: this.bot.blockAt(pos)?.biome?.name,
      
      // Recent block changes
      recentBlockChanges: this.blockChanges.slice(-10),
      
      // Nearby entities
      nearbyMobs: this._getNearbyMobs(16),
      nearbyPlayers: this._getNearbyPlayers(32),
      nearbyItems: this._getNearbyItems(16),
      nearbyVehicles: this._getNearbyVehicles(16),
      
      // Threats
      threats: this._detectThreats()
    };
  }

  _extractSocialState() {
    return {
      // Online players
      onlinePlayers: Object.keys(this.bot.players).filter(p => p !== this.bot.username),
      
      // Recent chat
      recentChat: this.chatHistory.slice(-20),
      
      // Player actions
      recentPlayerActions: Array.from(this.playerActions.entries()).map(([username, actions]) => ({
        username,
        actions: actions.slice(-5)
      })),
      
      // Team/scoreboard info
      teams: this._getTeamInfo(),
      scoreboard: this._getScoreboardInfo()
    };
  }

  _extractPerceptionState() {
    return {
      // Recent sounds
      recentSounds: this.soundEvents.slice(-10),
      
      // What bot can see (raycast)
      lookingAt: this._getLookingAt(),
      
      // Nearby signs/books (readable text)
      nearbyText: this._getNearbyText(),
      
      // Control state
      controlState: this.bot.controlState
    };
  }

  _getDetailedInventory() {
    return this.bot.inventory.items().map(item => ({
      name: item.name,
      displayName: item.displayName,
      count: item.count,
      slot: item.slot,
      stackSize: item.stackSize,
      durability: item.durabilityUsed ? {
        used: item.durabilityUsed,
        max: item.maxDurability,
        percentage: ((item.maxDurability - item.durabilityUsed) / item.maxDurability * 100).toFixed(1)
      } : null,
      enchantments: item.enchants || [],
      nbt: item.nbt ? this._simplifyNBT(item.nbt) : null
    }));
  }

  _getEquipment() {
    const slots = ['head', 'torso', 'legs', 'feet', 'hand', 'off-hand'];
    const equipment = {};
    
    slots.forEach(slot => {
      const item = this.bot.inventory.slots[this.bot.getEquipmentDestSlot(slot)];
      equipment[slot] = item ? {
        name: item.name,
        durability: item.durabilityUsed ? {
          used: item.durabilityUsed,
          max: item.maxDurability,
          percentage: ((item.maxDurability - item.durabilityUsed) / item.maxDurability * 100).toFixed(1)
        } : null
      } : null;
    });
    
    return equipment;
  }

  _getNearbyBlocks(radius) {
    const blocks = {};
    const positions = this.bot.findBlocks({
      matching: (block) => block.name !== 'air',
      maxDistance: radius,
      count: 200
    });
    
    positions.forEach(pos => {
      const block = this.bot.blockAt(pos);
      if (block) {
        if (!blocks[block.name]) {
          blocks[block.name] = { count: 0, positions: [] };
        }
        blocks[block.name].count++;
        if (blocks[block.name].positions.length < 5) {
          blocks[block.name].positions.push({
            x: pos.x,
            y: pos.y,
            z: pos.z,
            distance: pos.distanceTo(this.bot.entity.position).toFixed(1)
          });
        }
      }
    });
    
    return blocks;
  }

  _getNearbyMobs(radius) {
    return Object.values(this.bot.entities)
      .filter(e => e.type === 'mob' && 
                   e.position.distanceTo(this.bot.entity.position) < radius)
      .map(e => ({
        type: e.name,
        displayName: e.displayName,
        position: e.position,
        distance: e.position.distanceTo(this.bot.entity.position).toFixed(1),
        health: e.metadata?.[8] || 'unknown',
        hostile: this._isHostile(e.name),
        velocity: e.velocity
      }));
  }

  _getNearbyPlayers(radius) {
    return Object.values(this.bot.entities)
      .filter(e => e.type === 'player' && 
                   e.username !== this.bot.username &&
                   e.position.distanceTo(this.bot.entity.position) < radius)
      .map(e => ({
        username: e.username,
        displayName: e.displayName,
        position: e.position,
        distance: e.position.distanceTo(this.bot.entity.position).toFixed(1),
        health: e.metadata?.[8] || 'unknown',
        gamemode: this.bot.players[e.username]?.gamemode,
        ping: this.bot.players[e.username]?.ping,
        heldItem: e.heldItem?.name
      }));
  }

  _getNearbyItems(radius) {
    return Object.values(this.bot.entities)
      .filter(e => e.type === 'object' && 
                   e.objectType === 'Item' &&
                   e.position.distanceTo(this.bot.entity.position) < radius)
      .map(e => ({
        item: e.metadata?.[7]?.itemId,
        count: e.metadata?.[7]?.itemCount || 1,
        position: e.position,
        distance: e.position.distanceTo(this.bot.entity.position).toFixed(1)
      }));
  }

  _getNearbyVehicles(radius) {
    return Object.values(this.bot.entities)
      .filter(e => (e.type === 'object' || e.type === 'vehicle') &&
                   e.position.distanceTo(this.bot.entity.position) < radius)
      .map(e => ({
        type: e.name,
        position: e.position,
        distance: e.position.distanceTo(this.bot.entity.position).toFixed(1),
        passengers: e.passengers || []
      }));
  }

  _detectThreats() {
    const threats = [];
    
    // Hostile mobs
    const hostileMobs = this._getNearbyMobs(8).filter(m => m.hostile);
    if (hostileMobs.length > 0) {
      threats.push({ 
        type: 'hostile_mob', 
        count: hostileMobs.length, 
        severity: 'high',
        details: hostileMobs.map(m => `${m.type} at ${m.distance}m`)
      });
    }
    
    // Low health
    if (this.bot.health < 10) {
      threats.push({ type: 'low_health', value: this.bot.health, severity: 'high' });
    }
    
    // Low food
    if (this.bot.food < 6) {
      threats.push({ type: 'low_food', value: this.bot.food, severity: 'medium' });
    }
    
    // Low oxygen (underwater)
    if (this.bot.oxygenLevel < 10) {
      threats.push({ type: 'drowning', value: this.bot.oxygenLevel, severity: 'high' });
    }
    
    // Lava nearby
    const lavaBlocks = this._getNearbyBlocks(3);
    if (lavaBlocks['lava'] || lavaBlocks['flowing_lava']) {
      threats.push({ type: 'lava', count: (lavaBlocks['lava']?.count || 0) + (lavaBlocks['flowing_lava']?.count || 0), severity: 'high' });
    }
    
    // Fire
    if (this.bot.entity.onFire) {
      threats.push({ type: 'on_fire', severity: 'high' });
    }
    
    // Fall damage risk
    const blockBelow = this.bot.blockAt(this.bot.entity.position.offset(0, -1, 0));
    if (!blockBelow || blockBelow.name === 'air') {
      threats.push({ type: 'fall_risk', severity: 'medium' });
    }
    
    // Recent explosion
    const recentExplosion = this.soundEvents.find(s => 
      s.sound.includes('explosion') && 
      Date.now() - s.timestamp < 2000
    );
    if (recentExplosion) {
      threats.push({ type: 'explosion', severity: 'high' });
    }
    
    return threats;
  }

  _getLookingAt() {
    const block = this.bot.blockAtCursor(5);
    if (block) {
      return {
        type: 'block',
        name: block.name,
        position: block.position,
        distance: block.position.distanceTo(this.bot.entity.position).toFixed(1)
      };
    }
    
    const entity = this.bot.entityAtCursor(5);
    if (entity) {
      return {
        type: entity.type,
        name: entity.name || entity.username,
        distance: entity.position.distanceTo(this.bot.entity.position).toFixed(1)
      };
    }
    
    return null;
  }

  _getNearbyText() {
    const texts = [];
    const signs = this.bot.findBlocks({
      matching: (block) => block.name.includes('sign'),
      maxDistance: 8,
      count: 10
    });
    
    signs.forEach(pos => {
      const block = this.bot.blockAt(pos);
      if (block && block.signText) {
        texts.push({
          type: 'sign',
          position: pos,
          text: block.signText
        });
      }
    });
    
    return texts;
  }

  _getTeamInfo() {
    const teams = {};
    Object.entries(this.bot.teams || {}).forEach(([name, team]) => {
      teams[name] = {
        displayName: team.displayName,
        prefix: team.prefix,
        suffix: team.suffix,
        friendlyFire: team.friendlyFire,
        members: team.members
      };
    });
    return teams;
  }

  _getScoreboardInfo() {
    const scoreboard = {};
    Object.entries(this.bot.scoreboard || {}).forEach(([name, objective]) => {
      scoreboard[name] = {
        displayName: objective.displayName,
        type: objective.type,
        scores: objective.itemsMap
      };
    });
    return scoreboard;
  }

  _simplifyNBT(nbt) {
    // Simplify NBT data for LLM consumption
    if (typeof nbt !== 'object') return nbt;
    
    const simplified = {};
    Object.entries(nbt).forEach(([key, value]) => {
      if (key === 'display' && value.Name) {
        simplified.customName = value.Name;
      } else if (key === 'Enchantments') {
        simplified.enchantments = value.map(e => ({
          id: e.id,
          level: e.lvl
        }));
      }
    });
    return simplified;
  }

  _isHostile(mobName) {
    const hostileMobs = [
      'zombie', 'skeleton', 'creeper', 'spider', 'enderman',
      'witch', 'blaze', 'ghast', 'slime', 'magma_cube',
      'phantom', 'drowned', 'husk', 'stray', 'wither_skeleton',
      'zombified_piglin', 'piglin', 'hoglin', 'zoglin',
      'vindicator', 'evoker', 'pillager', 'ravager', 'vex'
    ];
    return hostileMobs.includes(mobName);
  }

  // Get chat context for LLM
  getChatContext(limit = 10) {
    return this.chatHistory.slice(-limit).map(c => 
      `[${c.type}] ${c.username}: ${c.message}`
    ).join('\n');
  }

  // Get recent events summary
  getRecentEvents(seconds = 30) {
    const cutoff = Date.now() - (seconds * 1000);
    
    return {
      chat: this.chatHistory.filter(c => c.timestamp > cutoff),
      blockChanges: this.blockChanges.filter(b => b.timestamp > cutoff),
      sounds: this.soundEvents.filter(s => s.timestamp > cutoff),
      playerActions: Array.from(this.playerActions.entries()).map(([username, actions]) => ({
        username,
        actions: actions.filter(a => a.timestamp > cutoff)
      })).filter(p => p.actions.length > 0)
    };
  }
}

module.exports = EnhancedVision;
```

### 2. Update Bot to use Enhanced Vision

```javascript
// In bot.js
const EnhancedVision = require('./utils/vision-enhanced');

class MinecraftBot {
  constructor() {
    this.bot = null;
    this.vision = null; // Will be EnhancedVision
    // ...
  }

  async start() {
    // ... existing code
    
    this.vision = new EnhancedVision(this.bot);
    
    // ...
  }
}
```

### 3. Update Pilot/Strategy to use full state

```javascript
// In pilot.js
async pilotLoop(bot) {
  const fullState = this.vision.extractFullState();
  
  // Include chat context in decision
  const chatContext = this.vision.getChatContext(5);
  const recentEvents = this.vision.getRecentEvents(10);
  
  const messages = [
    { role: 'system', content: this.prompt },
    { 
      role: 'user', 
      content: `State: ${JSON.stringify(fullState, null, 2)}

Recent chat:
${chatContext}

Recent events:
${JSON.stringify(recentEvents, null, 2)}

What action?` 
    }
  ];
  
  // ... rest of pilot logic
}
```

### 4. Chat-aware Commander

```javascript
// In commander.js
async _decide(state, commands, progress) {
  const chatContext = this.vision.getChatContext(20);
  const recentEvents = this.vision.getRecentEvents(60);
  
  const messages = [
    { role: 'system', content: this.prompt },
    {
      role: 'user',
      content: `Bot State:
${JSON.stringify(state, null, 2)}

Current Goal: ${commands.goal || 'none'}

Progress:
${JSON.stringify(progress, null, 2)}

Recent Chat (last 20 messages):
${chatContext}

Recent Events (last 60s):
${JSON.stringify(recentEvents, null, 2)}

Decide: Should we continue, change goal, or intervene? Consider chat messages and player actions.`
    }
  ];
  
  // ... rest of commander logic
}
```

---

## Summary

Enhanced Vision now captures:
- ✅ All chat messages (chat, whisper, system)
- ✅ Player actions (swing, hurt, death)
- ✅ Block changes (placed, broken)
- ✅ Sound events (explosions, mob sounds)
- ✅ Detailed inventory (durability, enchantments, NBT)
- ✅ Equipment state
- ✅ Nearby entities (mobs, players, items, vehicles)
- ✅ Environment (biome, light level, weather)
- ✅ Social state (teams, scoreboard, online players)
- ✅ Perception (what bot is looking at, nearby text)
- ✅ Recent events timeline

**Estimated time:** 1 hour
**Priority:** High (essential for context-aware decisions)

Ready to integrate?
