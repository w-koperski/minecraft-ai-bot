# Implementation Plan V2 - Minecraft AI Bot (Fixed)

## 🎯 Goal
Build a robust 3-layer AI-powered Minecraft bot with proper error handling, state management, and monitoring.

## 📋 Prerequisites Check

### System Requirements
- Node.js v18+ ✅
- 4GB RAM minimum
- GPU (optional, for faster inference)
- Minecraft Java Edition 1.20.x

### Services
- Omniroute API: http://127.0.0.1:20128 ✅
- Minecraft server: localhost:25565 (to be set up)

### Verification Script
```bash
#!/bin/bash
# verify-setup.sh

echo "Checking prerequisites..."

# Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found"
    exit 1
fi
echo "✅ Node.js $(node --version)"

# Omniroute
if ! curl -s http://127.0.0.1:20128/v1/models > /dev/null; then
    echo "❌ Omniroute not responding"
    exit 1
fi
echo "✅ Omniroute API"

# Minecraft server
if ! nc -z localhost 25565 2>/dev/null; then
    echo "⚠️  Minecraft server not running (will start later)"
else
    echo "✅ Minecraft server"
fi

echo "✅ All prerequisites met!"
```

---

## 🚀 Phase 0: Environment Setup (15 min)

### 1. Create project structure
```bash
cd /home/seryki/.openclaw/workspace/minecraft-ai-bot

mkdir -p src/{layers,utils,prompts} state logs tests docker

# Create .env from template
cp .env.example .env
```

### 2. Configure environment
```bash
# .env
MINECRAFT_HOST=localhost
MINECRAFT_PORT=25565
MINECRAFT_USERNAME=AIBot_$(date +%s)
MINECRAFT_VERSION=1.20.4

OMNIROUTE_URL=http://127.0.0.1:20128/v1/chat/completions
OMNIROUTE_API_KEY=sk-25dccb8ba99cb3cf-6f2993-0a542c8e

# Models
PILOT_MODEL=nvidia/meta/llama-3.2-1b-instruct
STRATEGY_MODEL=nvidia/qwen/qwen2.5-7b-instruct
COMMANDER_MODEL=claude-sonnet-4.5

# Loop intervals (adaptive)
PILOT_INTERVAL_IDLE=2000
PILOT_INTERVAL_ACTIVE=500
PILOT_INTERVAL_DANGER=200
STRATEGY_INTERVAL=3000
COMMANDER_INTERVAL=10000

# Rate limiting
MAX_REQUESTS_PER_MINUTE=560
RATE_LIMIT_BUFFER=0.8  # Use 80% of limit

# Logging
LOG_LEVEL=info
LOG_FILE=logs/bot.log

# State management
STATE_BACKEND=file  # file | redis | sqlite
STATE_DIR=state
```

### 3. Set up Minecraft server (Docker)
```yaml
# docker/docker-compose.yml
version: '3.8'
services:
  minecraft:
    image: itzg/minecraft-server:java17
    ports:
      - "25565:25565"
    environment:
      EULA: "TRUE"
      VERSION: "1.20.4"
      MEMORY: "2G"
      DIFFICULTY: "easy"
      MODE: "survival"
      ONLINE_MODE: "FALSE"  # Allow bot without Microsoft auth
      SPAWN_PROTECTION: "0"
    volumes:
      - ./minecraft-data:/data
    restart: unless-stopped
```

Start server:
```bash
cd docker
docker-compose up -d
# Wait 30s for server to start
docker-compose logs -f minecraft | grep "Done"
```

### 4. Install dependencies
```bash
npm install \
  mineflayer \
  mineflayer-pathfinder \
  mineflayer-collectblock \
  axios \
  bottleneck \
  winston \
  dotenv \
  lockfile \
  express \
  ws

npm install --save-dev \
  jest \
  @types/node
```

---

## 🏗️ Phase 1: Core Infrastructure (1h)

### 1. State Manager (`src/utils/state-manager.js`)
```javascript
const fs = require('fs').promises;
const lockfile = require('lockfile');
const path = require('path');

class StateManager {
  constructor(stateDir = 'state') {
    this.stateDir = stateDir;
    this.locks = new Map();
  }

  async read(key) {
    const filePath = path.join(this.stateDir, `${key}.json`);
    const lockPath = `${filePath}.lock`;
    
    try {
      await this._acquireLock(lockPath);
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    } finally {
      await this._releaseLock(lockPath);
    }
  }

  async write(key, data) {
    const filePath = path.join(this.stateDir, `${key}.json`);
    const lockPath = `${filePath}.lock`;
    
    try {
      await this._acquireLock(lockPath);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    } finally {
      await this._releaseLock(lockPath);
    }
  }

  async _acquireLock(lockPath) {
    return new Promise((resolve, reject) => {
      lockfile.lock(lockPath, { wait: 5000 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async _releaseLock(lockPath) {
    return new Promise((resolve) => {
      lockfile.unlock(lockPath, () => resolve());
    });
  }
}

module.exports = StateManager;
```

### 2. Rate Limiter (`src/utils/rate-limiter.js`)
```javascript
const Bottleneck = require('bottleneck');

class RateLimiter {
  constructor(maxRequestsPerMinute = 560, buffer = 0.8) {
    const effectiveLimit = Math.floor(maxRequestsPerMinute * buffer);
    
    this.limiter = new Bottleneck({
      reservoir: effectiveLimit,
      reservoirRefreshAmount: effectiveLimit,
      reservoirRefreshInterval: 60 * 1000, // 1 minute
      maxConcurrent: 5,
      minTime: Math.floor((60 * 1000) / effectiveLimit)
    });
    
    this.limiter.on('failed', async (error, jobInfo) => {
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'] || 60;
        console.warn(`Rate limited, retrying after ${retryAfter}s`);
        return retryAfter * 1000;
      }
    });
  }

  async schedule(fn) {
    return this.limiter.schedule(fn);
  }
}

module.exports = RateLimiter;
```

### 3. Logger (`src/utils/logger.js`)
```javascript
const winston = require('winston');
const path = require('path');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: path.join('logs', 'error.log'), 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: path.join('logs', 'bot.log') 
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

module.exports = logger;
```

### 4. Omniroute Client with Retry (`src/utils/omniroute.js`)
```javascript
const axios = require('axios');
const RateLimiter = require('./rate-limiter');
const logger = require('./logger');

class OmnirouteClient {
  constructor() {
    this.baseUrl = process.env.OMNIROUTE_URL;
    this.apiKey = process.env.OMNIROUTE_API_KEY;
    this.rateLimiter = new RateLimiter();
    this.metrics = {
      requests: 0,
      errors: 0,
      totalLatency: 0
    };
  }

  async call(model, messages, options = {}) {
    const startTime = Date.now();
    
    try {
      const response = await this.rateLimiter.schedule(async () => {
        return await axios.post(this.baseUrl, {
          model: model,
          messages: messages,
          max_tokens: options.maxTokens || 100,
          temperature: options.temperature || 0.7
        }, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: options.timeout || 10000
        });
      });
      
      const latency = Date.now() - startTime;
      this.metrics.requests++;
      this.metrics.totalLatency += latency;
      
      logger.debug(`Omniroute call: ${model} (${latency}ms)`);
      
      return response.data.choices[0].message.content;
    } catch (error) {
      this.metrics.errors++;
      logger.error(`Omniroute error: ${error.message}`, { model, error });
      return null;
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      avgLatency: this.metrics.requests > 0 
        ? Math.round(this.metrics.totalLatency / this.metrics.requests)
        : 0,
      errorRate: this.metrics.requests > 0
        ? (this.metrics.errors / this.metrics.requests * 100).toFixed(2)
        : 0
    };
  }
}

module.exports = OmnirouteClient;
```

---

## 🤖 Phase 2: Bot Core + Vision (1h)

### 1. Vision System (`src/utils/vision.js`)
```javascript
const logger = require('./logger');

class Vision {
  constructor(bot) {
    this.bot = bot;
  }

  extractState() {
    try {
      const state = {
        timestamp: Date.now(),
        position: this.bot.entity.position,
        health: this.bot.health,
        food: this.bot.food,
        gameMode: this.bot.game.gameMode,
        dimension: this.bot.game.dimension,
        time: this.bot.time.timeOfDay,
        weather: this.bot.isRaining ? 'rain' : 'clear',
        inventory: this._getInventory(),
        nearbyMobs: this._getNearbyMobs(),
        nearbyBlocks: this._getNearbyBlocks(),
        threats: this._detectThreats()
      };
      
      return state;
    } catch (error) {
      logger.error('Vision extraction failed', { error });
      return null;
    }
  }

  _getInventory() {
    return this.bot.inventory.items().map(item => ({
      name: item.name,
      count: item.count,
      slot: item.slot
    }));
  }

  _getNearbyMobs(radius = 16) {
    return Object.values(this.bot.entities)
      .filter(e => e.type === 'mob' && 
                   e.position.distanceTo(this.bot.entity.position) < radius)
      .map(e => ({
        type: e.name,
        distance: e.position.distanceTo(this.bot.entity.position).toFixed(1),
        hostile: this._isHostile(e.name),
        health: e.metadata?.[8] || 'unknown'
      }));
  }

  _getNearbyBlocks(radius = 8) {
    const blocks = {};
    const positions = this.bot.findBlocks({
      matching: (block) => block.name !== 'air',
      maxDistance: radius,
      count: 100
    });
    
    positions.forEach(pos => {
      const block = this.bot.blockAt(pos);
      if (block) {
        blocks[block.name] = (blocks[block.name] || 0) + 1;
      }
    });
    
    return blocks;
  }

  _detectThreats() {
    const threats = [];
    
    // Hostile mobs nearby
    const hostileMobs = this._getNearbyMobs(8).filter(m => m.hostile);
    if (hostileMobs.length > 0) {
      threats.push({ type: 'hostile_mob', count: hostileMobs.length, severity: 'high' });
    }
    
    // Low health
    if (this.bot.health < 10) {
      threats.push({ type: 'low_health', value: this.bot.health, severity: 'high' });
    }
    
    // Low food
    if (this.bot.food < 6) {
      threats.push({ type: 'low_food', value: this.bot.food, severity: 'medium' });
    }
    
    // Lava nearby
    const lavaBlocks = this._getNearbyBlocks(3);
    if (lavaBlocks['lava'] || lavaBlocks['flowing_lava']) {
      threats.push({ type: 'lava', severity: 'high' });
    }
    
    return threats;
  }

  _isHostile(mobName) {
    const hostileMobs = [
      'zombie', 'skeleton', 'creeper', 'spider', 'enderman',
      'witch', 'blaze', 'ghast', 'slime', 'magma_cube',
      'phantom', 'drowned', 'husk', 'stray', 'wither_skeleton'
    ];
    return hostileMobs.includes(mobName);
  }
}

module.exports = Vision;
```

### 2. Bot Core (`src/bot.js`)
```javascript
require('dotenv').config();
const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const logger = require('./utils/logger');
const Vision = require('./utils/vision');
const StateManager = require('./utils/state-manager');

class MinecraftBot {
  constructor() {
    this.bot = null;
    this.vision = null;
    this.stateManager = new StateManager();
    this.isRunning = false;
  }

  async start() {
    logger.info('Starting Minecraft bot...');
    
    this.bot = mineflayer.createBot({
      host: process.env.MINECRAFT_HOST,
      port: parseInt(process.env.MINECRAFT_PORT),
      username: process.env.MINECRAFT_USERNAME,
      version: process.env.MINECRAFT_VERSION
    });

    this.bot.loadPlugin(pathfinder);
    this.vision = new Vision(this.bot);

    this._setupEventHandlers();
    
    return new Promise((resolve, reject) => {
      this.bot.once('spawn', () => {
        logger.info('Bot spawned successfully');
        this.isRunning = true;
        resolve();
      });
      
      this.bot.once('error', (err) => {
        logger.error('Bot connection error', { error: err });
        reject(err);
      });
      
      setTimeout(() => reject(new Error('Connection timeout')), 30000);
    });
  }

  _setupEventHandlers() {
    this.bot.on('error', (err) => {
      logger.error('Bot error', { error: err });
    });

    this.bot.on('kicked', (reason) => {
      logger.warn('Bot kicked', { reason });
      this.isRunning = false;
    });

    this.bot.on('death', () => {
      logger.warn('Bot died, respawning...');
      this.bot.emit('respawn');
    });

    this.bot.on('health', () => {
      if (this.bot.health < 5) {
        logger.warn('Critical health!', { health: this.bot.health });
      }
    });

    // Save state periodically
    setInterval(async () => {
      if (this.isRunning) {
        const state = this.vision.extractState();
        await this.stateManager.write('current', state);
      }
    }, 5000);
  }

  async stop() {
    logger.info('Stopping bot...');
    this.isRunning = false;
    if (this.bot) {
      this.bot.quit();
    }
  }
}

module.exports = MinecraftBot;
```

---

## ⚡ Phase 3: Layer 1 - Adaptive Pilot (2h)

### 1. Pilot with Adaptive Loop (`src/layers/pilot.js`)
```javascript
const OmnirouteClient = require('../utils/omniroute');
const logger = require('../utils/logger');
const fs = require('fs').promises;

class Pilot {
  constructor(bot, vision) {
    this.bot = bot;
    this.vision = vision;
    this.client = new OmnirouteClient();
    this.model = process.env.PILOT_MODEL;
    this.isRunning = false;
    this.currentInterval = parseInt(process.env.PILOT_INTERVAL_IDLE);
    this.loopHandle = null;
    
    this._loadPrompt();
  }

  async _loadPrompt() {
    this.prompt = await fs.readFile('src/prompts/pilot.txt', 'utf8');
  }

  start() {
    logger.info('Starting pilot layer');
    this.isRunning = true;
    this._loop();
  }

  stop() {
    logger.info('Stopping pilot layer');
    this.isRunning = false;
    if (this.loopHandle) {
      clearTimeout(this.loopHandle);
    }
  }

  async _loop() {
    if (!this.isRunning) return;

    try {
      const state = this.vision.extractState();
      if (!state) {
        this._scheduleNext(this.currentInterval);
        return;
      }

      // Adaptive interval based on threats
      this.currentInterval = this._calculateInterval(state.threats);

      // Hardcoded emergency reactions (no LLM)
      if (this._handleEmergency(state)) {
        this._scheduleNext(200); // Check again quickly
        return;
      }

      // LLM decision for normal situations
      const action = await this._decide(state);
      if (action) {
        await this._execute(action);
      }

    } catch (error) {
      logger.error('Pilot loop error', { error });
    }

    this._scheduleNext(this.currentInterval);
  }

  _calculateInterval(threats) {
    if (threats.some(t => t.severity === 'high')) {
      return parseInt(process.env.PILOT_INTERVAL_DANGER);
    }
    if (threats.length > 0) {
      return parseInt(process.env.PILOT_INTERVAL_ACTIVE);
    }
    return parseInt(process.env.PILOT_INTERVAL_IDLE);
  }

  _handleEmergency(state) {
    // Lava nearby - jump back immediately
    if (state.threats.some(t => t.type === 'lava')) {
      logger.warn('Emergency: Lava detected, jumping back');
      this.bot.setControlState('back', true);
      this.bot.setControlState('jump', true);
      setTimeout(() => this.bot.clearControlStates(), 500);
      return true;
    }

    // Critical health - retreat
    if (state.health < 5) {
      logger.warn('Emergency: Critical health, retreating');
      this.bot.setControlState('back', true);
      setTimeout(() => this.bot.clearControlStates(), 1000);
      return true;
    }

    return false;
  }

  async _decide(state) {
    const messages = [
      { role: 'system', content: this.prompt },
      { role: 'user', content: `State: ${JSON.stringify(state, null, 2)}\n\nDecide ONE action (JSON only):` }
    ];

    const response = await this.client.call(this.model, messages, { maxTokens: 50 });
    if (!response) return null;

    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('No JSON in pilot response', { response });
        return null;
      }
      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      logger.error('Failed to parse pilot response', { response, error });
      return null;
    }
  }

  async _execute(action) {
    logger.debug('Executing action', { action });

    switch (action.action) {
      case 'move':
        this.bot.setControlState(action.direction, true);
        setTimeout(() => this.bot.clearControlStates(), 500);
        break;

      case 'jump':
        this.bot.setControlState('jump', true);
        setTimeout(() => this.bot.clearControlStates(), 100);
        break;

      case 'dig':
        const block = this.bot.findBlock({
          matching: (b) => b.name === action.block,
          maxDistance: 4
        });
        if (block) await this.bot.dig(block).catch(e => logger.warn('Dig failed', { error: e }));
        break;

      case 'attack':
        const entity = Object.values(this.bot.entities).find(e =>
          e.name === action.entity &&
          e.position.distanceTo(this.bot.entity.position) < 4
        );
        if (entity) this.bot.attack(entity);
        break;

      case 'stop':
        this.bot.clearControlStates();
        break;

      default:
        logger.warn('Unknown action', { action });
    }
  }

  _scheduleNext(intervalMs) {
    this.loopHandle = setTimeout(() => this._loop(), intervalMs);
  }
}

module.exports = Pilot;
```

### 2. Pilot Prompt (`src/prompts/pilot.txt`)
```
You are a Minecraft bot pilot. React to the current situation with ONE action.

CRITICAL RULES:
1. Respond with ONLY valid JSON, no explanation
2. Choose ONE action per turn
3. Prioritize survival over exploration

Available actions:
- {"action": "move", "direction": "forward|back|left|right"}
- {"action": "jump"}
- {"action": "dig", "block": "block_name"}
- {"action": "attack", "entity": "entity_type"}
- {"action": "stop"}

EXAMPLES:

State: {"threats": [{"type": "hostile_mob", "count": 1}], "nearbyMobs": [{"type": "zombie", "distance": "3.2"}]}
Response: {"action": "attack", "entity": "zombie"}

State: {"threats": [], "nearbyBlocks": {"oak_log": 5}}
Response: {"action": "move", "direction": "forward"}

State: {"threats": [{"type": "low_health"}], "health": 8}
Response: {"action": "move", "direction": "back"}

Now respond to the current state:
```

---

**To be continued in next message (Strategy + Commander layers)...**

Czy mam kontynuować z pozostałymi warstwami (Strategy, Commander) i testami?

## 🎯 Phase 4: Layer 2 - Strategy with History (2h)

### 1. Strategy Planner (`src/layers/strategy.js`)
```javascript
const OmnirouteClient = require('../utils/omniroute');
const StateManager = require('../utils/state-manager');
const logger = require('../utils/logger');
const fs = require('fs').promises;

class Strategy {
  constructor(bot, vision) {
    this.bot = bot;
    this.vision = vision;
    this.client = new OmnirouteClient();
    this.stateManager = new StateManager();
    this.model = process.env.STRATEGY_MODEL;
    this.isRunning = false;
    this.loopHandle = null;
    this.history = [];
    this.maxHistory = 10;
    
    this._loadPrompt();
  }

  async _loadPrompt() {
    this.prompt = await fs.readFile('src/prompts/strategy.txt', 'utf8');
  }

  start() {
    logger.info('Starting strategy layer');
    this.isRunning = true;
    this._loop();
  }

  stop() {
    logger.info('Stopping strategy layer');
    this.isRunning = false;
    if (this.loopHandle) {
      clearTimeout(this.loopHandle);
    }
  }

  async _loop() {
    if (!this.isRunning) return;

    try {
      const state = this.vision.extractState();
      const commands = await this.stateManager.read('commands') || { goal: null };
      
      if (!commands.goal) {
        this._scheduleNext();
        return;
      }

      const progress = await this.stateManager.read('progress') || {};
      
      // Check if stuck (same position for >30s)
      if (this._isStuck(state, progress)) {
        logger.warn('Bot appears stuck, requesting new strategy');
        await this._requestHelp(state, commands.goal);
      }

      const plan = await this._plan(state, commands.goal, progress);
      if (plan) {
        await this.stateManager.write('plan', plan);
        await this._updateProgress(commands.goal, plan);
      }

    } catch (error) {
      logger.error('Strategy loop error', { error });
    }

    this._scheduleNext();
  }

  _isStuck(state, progress) {
    if (!progress.lastPosition || !progress.lastCheckTime) return false;
    
    const timeDiff = Date.now() - progress.lastCheckTime;
    const posDiff = Math.sqrt(
      Math.pow(state.position.x - progress.lastPosition.x, 2) +
      Math.pow(state.position.z - progress.lastPosition.z, 2)
    );
    
    // Stuck if moved <2 blocks in 30s
    return timeDiff > 30000 && posDiff < 2;
  }

  async _plan(state, goal, progress) {
    // Add to history
    this.history.push({
      timestamp: Date.now(),
      goal: goal,
      state: state,
      progress: progress
    });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const messages = [
      { role: 'system', content: this.prompt },
      { 
        role: 'user', 
        content: `Goal: ${goal}

Current State:
${JSON.stringify(state, null, 2)}

Progress:
${JSON.stringify(progress, null, 2)}

Recent History (last ${this.history.length} attempts):
${this.history.map(h => `- ${new Date(h.timestamp).toISOString()}: ${h.progress?.status || 'unknown'}`).join('\n')}

Plan the next 3-5 actions (JSON array only):`
      }
    ];

    const response = await this.client.call(this.model, messages, { maxTokens: 300 });
    if (!response) return null;

    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        logger.warn('No JSON array in strategy response', { response });
        return null;
      }
      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      logger.error('Failed to parse strategy response', { response, error });
      return null;
    }
  }

  async _updateProgress(goal, plan) {
    const progress = {
      goal: goal,
      plan: plan,
      planCreatedAt: Date.now(),
      status: 'in_progress',
      lastPosition: this.bot.entity.position,
      lastCheckTime: Date.now()
    };
    
    await this.stateManager.write('progress', progress);
  }

  async _requestHelp(state, goal) {
    await this.stateManager.write('commands', {
      goal: goal,
      stuck: true,
      stuckReason: 'No progress in 30s',
      requestNewStrategy: true
    });
  }

  _scheduleNext() {
    const interval = parseInt(process.env.STRATEGY_INTERVAL);
    this.loopHandle = setTimeout(() => this._loop(), interval);
  }
}

module.exports = Strategy;
```

### 2. Strategy Prompt (`src/prompts/strategy.txt`)
```
You are a Minecraft strategist. Plan the next 3-5 actions to achieve the goal.

CRITICAL RULES:
1. Respond with ONLY a JSON array, no explanation
2. Learn from history - don't repeat failed attempts
3. Break complex goals into simple steps
4. Consider current inventory and resources

Available high-level actions:
- {"action": "navigate", "target": "block_type", "reason": "why"}
- {"action": "collect", "item": "item_name", "count": N}
- {"action": "craft", "item": "item_name", "count": N}
- {"action": "build", "structure": "description"}
- {"action": "retreat", "reason": "why"}

MINECRAFT KNOWLEDGE:
- Oak logs → planks (4:1 ratio)
- Planks → sticks (2:4 ratio)
- Planks + sticks → crafting table
- Wood tools need: planks + sticks
- Stone tools need: cobblestone + sticks
- Find trees in: plains, forest, taiga biomes
- Find stone: dig down or find caves
- Avoid: lava, deep water, cliffs

EXAMPLES:

Goal: "collect 64 oak logs"
History: []
Plan:
[
  {"action": "navigate", "target": "oak_log", "reason": "find trees"},
  {"action": "collect", "item": "oak_log", "count": 64}
]

Goal: "build wooden house"
History: ["Failed to find wood 2x"]
Plan:
[
  {"action": "navigate", "target": "plains", "reason": "different biome, more trees"},
  {"action": "collect", "item": "oak_log", "count": 64},
  {"action": "craft", "item": "planks", "count": 256},
  {"action": "build", "structure": "4x4 wooden house with door"}
]

Goal: "collect 64 oak logs"
History: ["Stuck at same position for 30s"]
Plan:
[
  {"action": "retreat", "reason": "unstuck - move away from obstacle"},
  {"action": "navigate", "target": "oak_log", "reason": "try different direction"},
  {"action": "collect", "item": "oak_log", "count": 64}
]

Now plan for the current goal:
```

---

## 🎓 Phase 5: Layer 3 - Commander with Feedback (1h)

### 1. Commander (`src/layers/commander.js`)
```javascript
const OmnirouteClient = require('../utils/omniroute');
const StateManager = require('../utils/state-manager');
const logger = require('../utils/logger');
const fs = require('fs').promises;

class Commander {
  constructor() {
    this.client = new OmnirouteClient();
    this.stateManager = new StateManager();
    this.model = process.env.COMMANDER_MODEL;
    this.isRunning = false;
    this.loopHandle = null;
    
    this._loadPrompt();
  }

  async _loadPrompt() {
    this.prompt = await fs.readFile('src/prompts/commander.txt', 'utf8');
  }

  start() {
    logger.info('Starting commander layer');
    this.isRunning = true;
    this._loop();
  }

  stop() {
    logger.info('Stopping commander layer');
    this.isRunning = false;
    if (this.loopHandle) {
      clearTimeout(this.loopHandle);
    }
  }

  async _loop() {
    if (!this.isRunning) return;

    try {
      const state = await this.stateManager.read('current');
      const commands = await this.stateManager.read('commands') || {};
      const progress = await this.stateManager.read('progress') || {};
      
      // Check voice commands (Telegram integration)
      await this._checkVoiceCommands();

      const decision = await this._decide(state, commands, progress);
      if (decision) {
        await this._applyDecision(decision, commands);
      }

    } catch (error) {
      logger.error('Commander loop error', { error });
    }

    this._scheduleNext();
  }

  async _checkVoiceCommands() {
    // This will be handled by OpenClaw Telegram integration
    // Commander just reads from commands.json which OpenClaw writes to
    // No additional code needed here
  }

  async _decide(state, commands, progress) {
    if (!state) return null;

    const messages = [
      { role: 'system', content: this.prompt },
      {
        role: 'user',
        content: `Bot State:
${JSON.stringify(state, null, 2)}

Current Goal: ${commands.goal || 'none'}

Progress:
${JSON.stringify(progress, null, 2)}

Decide: Should we continue, change goal, or intervene? (JSON only):`
      }
    ];

    const response = await this.client.call(this.model, messages, { maxTokens: 200 });
    if (!response) return null;

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('No JSON in commander response', { response });
        return null;
      }
      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      logger.error('Failed to parse commander response', { response, error });
      return null;
    }
  }

  async _applyDecision(decision, currentCommands) {
    logger.info('Commander decision', { decision });

    if (decision.action === 'change_goal') {
      await this.stateManager.write('commands', {
        goal: decision.new_goal,
        reason: decision.reason,
        changedAt: Date.now()
      });
    } else if (decision.action === 'intervene') {
      await this.stateManager.write('commands', {
        goal: currentCommands.goal,
        intervention: decision.intervention,
        reason: decision.reason
      });
    } else if (decision.action === 'continue') {
      // No change needed
      logger.debug('Commander: continue current goal');
    }

    // Report to user (via OpenClaw)
    if (decision.report) {
      logger.info(`Commander report: ${decision.report}`);
      // This will be picked up by OpenClaw and sent to Telegram
    }
  }

  _scheduleNext() {
    const interval = parseInt(process.env.COMMANDER_INTERVAL);
    this.loopHandle = setTimeout(() => this._loop(), interval);
  }
}

module.exports = Commander;
```

### 2. Commander Prompt (`src/prompts/commander.txt`)
```
You are a Minecraft commander. Monitor the bot and make high-level decisions.

CRITICAL RULES:
1. Respond with ONLY valid JSON, no explanation
2. Intervene only when necessary
3. Prioritize bot survival and progress

Decision format:
{
  "action": "continue|change_goal|intervene",
  "reason": "why",
  "new_goal": "if changing goal",
  "intervention": "if intervening",
  "report": "message to user (optional)"
}

DECISION CRITERIA:

CONTINUE when:
- Bot is making progress
- No critical issues
- Goal is achievable

CHANGE_GOAL when:
- Goal completed
- Goal impossible (no resources nearby)
- Bot stuck for >60s despite strategy changes
- Bot died and respawned (reset to safe goal)

INTERVENE when:
- Bot in danger (health <5, lava nearby)
- Bot wasting resources
- Strategy is clearly wrong

EXAMPLES:

State: {"health": 20, "position": {...}}
Goal: "collect 64 oak logs"
Progress: {"status": "in_progress", "collected": 32}
Decision:
{
  "action": "continue",
  "reason": "Making good progress, halfway done"
}

State: {"health": 3, "threats": [{"type": "hostile_mob"}]}
Goal: "collect diamonds"
Progress: {"status": "in_progress"}
Decision:
{
  "action": "intervene",
  "intervention": "retreat_to_safety",
  "reason": "Critical health, must survive",
  "report": "Bot in danger, retreating to safety"
}

State: {"health": 20, "position": {...}}
Goal: "collect 64 oak logs"
Progress: {"status": "completed", "collected": 64}
Decision:
{
  "action": "change_goal",
  "new_goal": "craft wooden tools",
  "reason": "Previous goal completed",
  "report": "Collected 64 oak logs! Ready for next task."
}

State: {"health": 20, "position": {...}}
Goal: "collect oak logs"
Progress: {"stuck": true, "stuckReason": "No progress in 30s"}
Decision:
{
  "action": "change_goal",
  "new_goal": "explore to find trees",
  "reason": "Bot stuck, no trees nearby, need to explore",
  "report": "No trees found nearby, exploring new area"
}

Now decide for the current situation:
```

---

## 🧪 Phase 6: Testing & Integration (1h)

### 1. Main Entry Point (`src/index.js`)
```javascript
require('dotenv').config();
const MinecraftBot = require('./bot');
const Pilot = require('./layers/pilot');
const Strategy = require('./layers/strategy');
const Commander = require('./layers/commander');
const logger = require('./utils/logger');

async function main() {
  logger.info('=== Minecraft AI Bot Starting ===');
  
  // Start bot
  const minecraftBot = new MinecraftBot();
  await minecraftBot.start();
  
  const bot = minecraftBot.bot;
  const vision = minecraftBot.vision;
  
  // Start layers
  const pilot = new Pilot(bot, vision);
  const strategy = new Strategy(bot, vision);
  const commander = new Commander();
  
  pilot.start();
  strategy.start();
  commander.start();
  
  logger.info('=== All layers started ===');
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    pilot.stop();
    strategy.stop();
    commander.stop();
    await minecraftBot.stop();
    process.exit(0);
  });
}

main().catch(error => {
  logger.error('Fatal error', { error });
  process.exit(1);
});
```

### 2. Unit Tests (`tests/vision.test.js`)
```javascript
const Vision = require('../src/utils/vision');

describe('Vision', () => {
  let mockBot;
  let vision;

  beforeEach(() => {
    mockBot = {
      entity: { position: { x: 0, y: 64, z: 0 } },
      health: 20,
      food: 20,
      game: { gameMode: 'survival', dimension: 'overworld' },
      time: { timeOfDay: 1000 },
      isRaining: false,
      inventory: {
        items: () => [
          { name: 'oak_log', count: 32, slot: 0 }
        ]
      },
      entities: {},
      findBlocks: () => []
    };
    
    vision = new Vision(mockBot);
  });

  test('extractState returns valid state', () => {
    const state = vision.extractState();
    
    expect(state).toBeDefined();
    expect(state.position).toEqual({ x: 0, y: 64, z: 0 });
    expect(state.health).toBe(20);
    expect(state.inventory).toHaveLength(1);
  });

  test('detectThreats identifies low health', () => {
    mockBot.health = 5;
    const state = vision.extractState();
    
    const lowHealthThreat = state.threats.find(t => t.type === 'low_health');
    expect(lowHealthThreat).toBeDefined();
    expect(lowHealthThreat.severity).toBe('high');
  });
});
```

### 3. Integration Test (`tests/integration.test.js`)
```javascript
const MinecraftBot = require('../src/bot');
const Pilot = require('../src/layers/pilot');

describe('Integration', () => {
  let bot;
  let pilot;

  beforeAll(async () => {
    // This requires a running Minecraft server
    // Skip if MINECRAFT_HOST is not set
    if (!process.env.MINECRAFT_HOST) {
      console.log('Skipping integration tests (no Minecraft server)');
      return;
    }

    bot = new MinecraftBot();
    await bot.start();
    pilot = new Pilot(bot.bot, bot.vision);
  });

  afterAll(async () => {
    if (bot) {
      await bot.stop();
    }
  });

  test('bot connects and spawns', () => {
    expect(bot.isRunning).toBe(true);
    expect(bot.bot.entity).toBeDefined();
  });

  test('pilot can extract state and decide', async () => {
    pilot.start();
    
    // Wait for one pilot loop
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    pilot.stop();
    
    // Check metrics
    const metrics = pilot.client.getMetrics();
    expect(metrics.requests).toBeGreaterThan(0);
  });
});
```

### 4. Run Tests
```bash
# Unit tests (no Minecraft server needed)
npm test -- tests/vision.test.js

# Integration tests (requires Minecraft server)
MINECRAFT_HOST=localhost npm test -- tests/integration.test.js
```

---

## 🚀 Phase 7: Deployment & Monitoring (30 min)

### 1. Start Script (`start.sh`)
```bash
#!/bin/bash
set -e

echo "=== Minecraft AI Bot Startup ==="

# Check prerequisites
./verify-setup.sh

# Start Minecraft server (Docker)
echo "Starting Minecraft server..."
cd docker
docker-compose up -d
cd ..

# Wait for server to be ready
echo "Waiting for Minecraft server..."
timeout 60 bash -c 'until nc -z localhost 25565; do sleep 1; done'
echo "✅ Minecraft server ready"

# Create state directory
mkdir -p state logs

# Start bot
echo "Starting bot..."
node src/index.js
```

### 2. Monitoring Dashboard (`src/monitor.js`)
```javascript
const express = require('express');
const StateManager = require('./utils/state-manager');
const logger = require('./utils/logger');

const app = express();
const stateManager = new StateManager();

app.get('/status', async (req, res) => {
  try {
    const state = await stateManager.read('current');
    const commands = await stateManager.read('commands');
    const progress = await stateManager.read('progress');
    
    res.json({
      status: 'running',
      bot: state,
      commands: commands,
      progress: progress,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/metrics', async (req, res) => {
  // TODO: Implement metrics endpoint
  res.json({ message: 'Metrics coming soon' });
});

const PORT = process.env.MONITOR_PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Monitor dashboard running on http://localhost:${PORT}`);
});
```

### 3. Systemd Service (Optional)
```ini
# /etc/systemd/system/minecraft-bot.service
[Unit]
Description=Minecraft AI Bot
After=network.target docker.service

[Service]
Type=simple
User=seryki
WorkingDirectory=/home/seryki/.openclaw/workspace/minecraft-ai-bot
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=10
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
```

---

## ✅ Final Checklist

### Phase 0: Environment
- [ ] `.env` configured
- [ ] Minecraft server running (Docker)
- [ ] Dependencies installed
- [ ] State directory created

### Phase 1: Infrastructure
- [ ] StateManager with file locking
- [ ] RateLimiter with retry logic
- [ ] Logger with structured output
- [ ] OmnirouteClient with metrics

### Phase 2: Bot Core
- [ ] Bot connects to Minecraft
- [ ] Vision extracts state correctly
- [ ] Event handlers working
- [ ] State saved periodically

### Phase 3: Pilot
- [ ] Adaptive loop (danger/active/idle)
- [ ] Emergency reactions (no LLM)
- [ ] LLM decisions for normal situations
- [ ] Actions executed correctly

### Phase 4: Strategy
- [ ] Plans multi-step sequences
- [ ] Learns from history
- [ ] Detects stuck situations
- [ ] Updates progress

### Phase 5: Commander
- [ ] Monitors bot state
- [ ] Makes high-level decisions
- [ ] Handles voice commands (via OpenClaw)
- [ ] Reports to user

### Phase 6: Testing
- [ ] Unit tests pass
- [ ] Integration tests pass (with server)
- [ ] All layers communicate correctly

### Phase 7: Deployment
- [ ] Start script works
- [ ] Monitor dashboard accessible
- [ ] Logs are readable
- [ ] Bot runs stably for >10 minutes

---

## 🐛 Known Issues & Solutions

### Issue 1: Bot gets stuck in walls
**Solution:** Add collision detection in pilot, retreat when stuck

### Issue 2: Rate limit exceeded
**Solution:** Increase intervals, reduce pilot frequency when idle

### Issue 3: LLM returns invalid JSON
**Solution:** Regex extraction + fallback to last known good action

### Issue 4: Bot dies repeatedly
**Solution:** Commander detects death loop, changes goal to "build safe shelter"

### Issue 5: Voice commands not working
**Solution:** Check OpenClaw Telegram integration, verify Whisper is configured

---

## 📚 Next Steps After Implementation

1. **Tune prompts** - Improve LLM responses with better examples
2. **Add more actions** - Crafting system, building, combat strategies
3. **Optimize performance** - Cache common decisions, reduce LLM calls
4. **Add safety** - Auto-save inventory, respawn handling, death recovery
5. **Expand voice** - Natural conversation, context awareness
6. **Multi-bot** - Coordinate multiple bots for complex tasks
7. **Web UI** - Real-time monitoring, manual control, replay system

---

## 🎯 Success Criteria

Bot is considered successful when it can:
- ✅ Connect to Minecraft server reliably
- ✅ Survive for >30 minutes without dying
- ✅ Complete simple goals (collect 64 wood)
- ✅ Avoid common hazards (lava, mobs, falls)
- ✅ Respond to voice commands via Telegram
- ✅ Recover from errors (death, stuck, disconnect)
- ✅ Stay within rate limits (560 RPM)
- ✅ Provide useful feedback to user

---

**Implementation time estimate:** 6-8 hours for full stack
**Recommended approach:** Build incrementally, test each phase before moving to next

Ready to start implementation with OpenCode?
