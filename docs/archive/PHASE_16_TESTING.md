# Phase 16: Comprehensive Testing Strategy (2h)

## Goal: Ensure bot reliability and catch regressions early

### 1. Test Structure

```
tests/
├── unit/
│   ├── vision.test.js
│   ├── state-manager.test.js
│   ├── rate-limiter.test.js
│   ├── omniroute.test.js
│   ├── memory-store.test.js
│   ├── action-awareness.test.js
│   └── chat-handler.test.js
├── integration/
│   ├── pilot.test.js
│   ├── strategy.test.js
│   ├── commander.test.js
│   ├── layers-communication.test.js
│   └── full-stack.test.js
├── e2e/
│   ├── basic-survival.test.js
│   ├── goal-completion.test.js
│   ├── error-recovery.test.js
│   └── voice-integration.test.js
├── mocks/
│   ├── mock-bot.js
│   ├── mock-omniroute.js
│   └── mock-minecraft-server.js
└── fixtures/
    ├── sample-states.json
    ├── sample-chat.json
    └── sample-plans.json
```

### 2. Unit Tests

#### Vision Tests (`tests/unit/vision.test.js`)
```javascript
const EnhancedVision = require('../../src/utils/vision-enhanced');
const MockBot = require('../mocks/mock-bot');

describe('EnhancedVision', () => {
  let mockBot;
  let vision;

  beforeEach(() => {
    mockBot = new MockBot();
    vision = new EnhancedVision(mockBot);
  });

  describe('extractFullState', () => {
    test('returns complete state object', () => {
      const state = vision.extractFullState();
      
      expect(state).toHaveProperty('position');
      expect(state).toHaveProperty('health');
      expect(state).toHaveProperty('environment');
      expect(state).toHaveProperty('social');
      expect(state).toHaveProperty('perception');
      expect(state.timestamp).toBeGreaterThan(0);
    });

    test('includes inventory details', () => {
      mockBot.inventory.items = () => [
        { name: 'oak_log', count: 32, slot: 0, maxDurability: null }
      ];
      
      const state = vision.extractFullState();
      expect(state.inventory).toHaveLength(1);
      expect(state.inventory[0].name).toBe('oak_log');
      expect(state.inventory[0].count).toBe(32);
    });

    test('detects threats correctly', () => {
      mockBot.health = 5;
      const state = vision.extractFullState();
      
      const lowHealthThreat = state.environment.threats.find(t => t.type === 'low_health');
      expect(lowHealthThreat).toBeDefined();
      expect(lowHealthThreat.severity).toBe('high');
    });
  });

  describe('chat tracking', () => {
    test('records chat messages', () => {
      mockBot.emit('chat', 'Player1', 'Hello bot!');
      
      expect(vision.chatHistory).toHaveLength(1);
      expect(vision.chatHistory[0].username).toBe('Player1');
      expect(vision.chatHistory[0].message).toBe('Hello bot!');
      expect(vision.chatHistory[0].type).toBe('chat');
    });

    test('limits chat history size', () => {
      for (let i = 0; i < 150; i++) {
        mockBot.emit('chat', 'Player1', `Message ${i}`);
      }
      
      expect(vision.chatHistory.length).toBeLessThanOrEqual(100);
    });

    test('getChatContext returns formatted string', () => {
      mockBot.emit('chat', 'Player1', 'Hello');
      mockBot.emit('whisper', 'Player2', 'Secret');
      
      const context = vision.getChatContext(5);
      expect(context).toContain('[chat] Player1: Hello');
      expect(context).toContain('[whisper] Player2: Secret');
    });
  });

  describe('threat detection', () => {
    test('detects lava nearby', () => {
      mockBot.findBlocks = () => [{ x: 0, y: 64, z: 0 }];
      mockBot.blockAt = () => ({ name: 'lava' });
      
      const state = vision.extractFullState();
      const lavaThreat = state.environment.threats.find(t => t.type === 'lava');
      expect(lavaThreat).toBeDefined();
      expect(lavaThreat.severity).toBe('high');
    });

    test('detects hostile mobs', () => {
      mockBot.entities = {
        1: {
          type: 'mob',
          name: 'zombie',
          position: { x: 5, y: 64, z: 5, distanceTo: () => 5 }
        }
      };
      
      const state = vision.extractFullState();
      const mobThreat = state.environment.threats.find(t => t.type === 'hostile_mob');
      expect(mobThreat).toBeDefined();
    });
  });
});
```

#### State Manager Tests (`tests/unit/state-manager.test.js`)
```javascript
const StateManager = require('../../src/utils/state-manager');
const fs = require('fs').promises;
const path = require('path');

describe('StateManager', () => {
  let stateManager;
  const testDir = 'tests/tmp';

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    stateManager = new StateManager(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test('writes and reads state', async () => {
    const testData = { foo: 'bar', count: 42 };
    await stateManager.write('test', testData);
    
    const result = await stateManager.read('test');
    expect(result).toEqual(testData);
  });

  test('returns null for non-existent key', async () => {
    const result = await stateManager.read('nonexistent');
    expect(result).toBeNull();
  });

  test('handles concurrent writes with locking', async () => {
    const writes = [];
    for (let i = 0; i < 10; i++) {
      writes.push(stateManager.write('concurrent', { value: i }));
    }
    
    await Promise.all(writes);
    const result = await stateManager.read('concurrent');
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThan(10);
  });
});
```

#### Action Awareness Tests (`tests/unit/action-awareness.test.js`)
```javascript
const ActionAwareness = require('../../src/layers/action-awareness');
const MockBot = require('../mocks/mock-bot');
const EnhancedVision = require('../../src/utils/vision-enhanced');

describe('ActionAwareness', () => {
  let mockBot;
  let vision;
  let actionAwareness;

  beforeEach(() => {
    mockBot = new MockBot();
    vision = new EnhancedVision(mockBot);
    actionAwareness = new ActionAwareness(mockBot, vision);
  });

  test('detects successful action', async () => {
    const action = { type: 'move', direction: 'forward', duration: 500 };
    const expectedOutcome = { moved: true };
    
    mockBot.entity.position = { x: 0, y: 64, z: 0 };
    
    // Simulate movement
    setTimeout(() => {
      mockBot.entity.position = { x: 0, y: 64, z: 2 };
    }, 100);
    
    const result = await actionAwareness.executeWithVerification(action, expectedOutcome);
    expect(result.success).toBe(true);
  });

  test('detects failed action', async () => {
    const action = { type: 'dig', blockType: 'stone' };
    const expectedOutcome = { blockRemoved: true, itemsGained: [{ name: 'cobblestone' }] };
    
    mockBot.findBlock = () => null; // Block not found
    
    const result = await actionAwareness.executeWithVerification(action, expectedOutcome);
    expect(result.success).toBe(false);
  });

  test('tracks action history', async () => {
    const action = { type: 'move', direction: 'forward' };
    await actionAwareness.executeWithVerification(action, { moved: true });
    
    expect(actionAwareness.actionHistory).toHaveLength(1);
    expect(actionAwareness.actionHistory[0].action).toEqual(action);
  });

  test('calculates success rate', async () => {
    // 3 successful, 2 failed
    for (let i = 0; i < 3; i++) {
      mockBot.entity.position.z += 1;
      await actionAwareness.executeWithVerification(
        { type: 'move', direction: 'forward' },
        { moved: true }
      );
    }
    
    for (let i = 0; i < 2; i++) {
      await actionAwareness.executeWithVerification(
        { type: 'dig', blockType: 'nonexistent' },
        { blockRemoved: true }
      );
    }
    
    const successRate = actionAwareness.getSuccessRate();
    expect(successRate).toBeCloseTo(0.6, 1);
  });
});
```

### 3. Integration Tests

#### Layers Communication Test (`tests/integration/layers-communication.test.js`)
```javascript
const MinecraftBot = require('../../src/bot');
const Pilot = require('../../src/layers/pilot');
const Strategy = require('../../src/layers/strategy');
const Commander = require('../../src/layers/commander');
const StateManager = require('../../src/utils/state-manager');

describe('Layers Communication', () => {
  let stateManager;

  beforeEach(() => {
    stateManager = new StateManager('tests/tmp');
  });

  test('Commander → Strategy → Pilot flow', async () => {
    // Commander sets goal
    await stateManager.write('commands', {
      goal: 'collect 10 oak logs',
      timestamp: Date.now()
    });

    // Strategy reads goal and creates plan
    const commands = await stateManager.read('commands');
    expect(commands.goal).toBe('collect 10 oak logs');

    const plan = [
      { action: 'navigate', target: 'oak_log' },
      { action: 'collect', item: 'oak_log', count: 10 }
    ];
    await stateManager.write('plan', plan);

    // Pilot reads plan
    const pilotPlan = await stateManager.read('plan');
    expect(pilotPlan).toHaveLength(2);
    expect(pilotPlan[0].action).toBe('navigate');
  });

  test('Pilot error → Strategy → Commander escalation', async () => {
    // Pilot reports error
    await stateManager.write('action_error', {
      action: { type: 'dig', blockType: 'stone' },
      expected: { blockRemoved: true },
      actual: { blockRemoved: false },
      severity: 'high',
      timestamp: Date.now()
    });

    // Strategy reads error
    const error = await stateManager.read('action_error');
    expect(error.severity).toBe('high');

    // Strategy escalates to Commander
    await stateManager.write('commands', {
      goal: null,
      stuck: true,
      reason: 'Pilot repeated failures',
      requestNewStrategy: true
    });

    // Commander reads escalation
    const commands = await stateManager.read('commands');
    expect(commands.stuck).toBe(true);
  });
});
```

### 4. End-to-End Tests

#### Basic Survival Test (`tests/e2e/basic-survival.test.js`)
```javascript
const MinecraftBot = require('../../src/bot');
const Pilot = require('../../src/layers/pilot');
const Strategy = require('../../src/layers/strategy');

describe('E2E: Basic Survival', () => {
  let bot;
  let pilot;
  let strategy;

  beforeAll(async () => {
    // Requires running Minecraft server
    if (!process.env.MINECRAFT_HOST) {
      console.log('Skipping E2E tests (no Minecraft server)');
      return;
    }

    bot = new MinecraftBot();
    await bot.start();
    pilot = new Pilot(bot.bot, bot.vision);
    strategy = new Strategy(bot.bot, bot.vision);
  });

  afterAll(async () => {
    if (bot) {
      await bot.stop();
    }
  });

  test('bot survives for 5 minutes', async () => {
    pilot.start();
    strategy.start();

    const startHealth = bot.bot.health;
    
    // Wait 5 minutes
    await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));

    expect(bot.bot.health).toBeGreaterThan(0);
    expect(bot.isRunning).toBe(true);

    pilot.stop();
    strategy.stop();
  }, 6 * 60 * 1000); // 6 min timeout

  test('bot collects wood when commanded', async () => {
    const stateManager = bot.stateManager;
    
    await stateManager.write('commands', {
      goal: 'collect 10 oak logs',
      timestamp: Date.now()
    });

    pilot.start();
    strategy.start();

    // Wait up to 2 minutes
    const startTime = Date.now();
    let collected = false;
    
    while (Date.now() - startTime < 2 * 60 * 1000) {
      const inventory = bot.bot.inventory.items();
      const oakLogs = inventory.find(i => i.name === 'oak_log');
      
      if (oakLogs && oakLogs.count >= 10) {
        collected = true;
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    expect(collected).toBe(true);

    pilot.stop();
    strategy.stop();
  }, 3 * 60 * 1000);
});
```

#### Error Recovery Test (`tests/e2e/error-recovery.test.js`)
```javascript
describe('E2E: Error Recovery', () => {
  test('bot recovers from death', async () => {
    // ... implementation
  });

  test('bot recovers from stuck state', async () => {
    // ... implementation
  });

  test('bot recovers from rate limit', async () => {
    // ... implementation
  });
});
```

### 5. Mock Objects

#### Mock Bot (`tests/mocks/mock-bot.js`)
```javascript
const EventEmitter = require('events');

class MockBot extends EventEmitter {
  constructor() {
    super();
    
    this.entity = {
      position: { x: 0, y: 64, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      onGround: true,
      onFire: false
    };
    
    this.health = 20;
    this.food = 20;
    this.foodSaturation = 5;
    this.oxygenLevel = 20;
    
    this.experience = {
      level: 0,
      points: 0,
      progress: 0
    };
    
    this.game = {
      gameMode: 'survival',
      difficulty: 'normal',
      dimension: 'overworld'
    };
    
    this.time = {
      timeOfDay: 1000,
      day: 1,
      age: 1000
    };
    
    this.isRaining = false;
    this.thunderState = 0;
    
    this.inventory = {
      items: () => [],
      slots: []
    };
    
    this.entities = {};
    this.players = {};
    this.teams = {};
    this.scoreboard = {};
    
    this.controlState = {};
    
    this.username = 'TestBot';
  }

  setControlState(control, state) {
    this.controlState[control] = state;
  }

  clearControlStates() {
    this.controlState = {};
  }

  findBlock(options) {
    return null;
  }

  findBlocks(options) {
    return [];
  }

  blockAt(position) {
    return { name: 'air', position };
  }

  blockAtCursor(distance) {
    return null;
  }

  entityAtCursor(distance) {
    return null;
  }

  async dig(block) {
    // Simulate digging
  }

  async placeBlock(referenceBlock, faceVector) {
    // Simulate placing
  }

  async equip(item, destination) {
    // Simulate equipping
  }

  async craft(recipe, count) {
    // Simulate crafting
  }

  attack(entity) {
    // Simulate attack
  }

  chat(message) {
    this.emit('chat', this.username, message);
  }

  whisper(username, message) {
    this.emit('whisper', this.username, message);
  }

  quit() {
    this.emit('end');
  }
}

module.exports = MockBot;
```

### 6. Test Configuration

#### Jest Config (`jest.config.js`)
```javascript
module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!**/node_modules/**'
  ],
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  testTimeout: 10000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  }
};
```

#### Test Setup (`tests/setup.js`)
```javascript
// Global test setup
require('dotenv').config({ path: '.env.test' });

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock console in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};
```

### 7. CI/CD Integration

#### GitHub Actions (`.github/workflows/test.yml`)
```yaml
name: Tests

on:
  push:
    branches: [ master, develop ]
  pull_request:
    branches: [ master ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      minecraft:
        image: itzg/minecraft-server:java17
        env:
          EULA: "TRUE"
          VERSION: "1.20.4"
          MEMORY: "2G"
          ONLINE_MODE: "FALSE"
        ports:
          - 25565:25565
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm run test:unit
      
      - name: Run integration tests
        run: npm run test:integration
      
      - name: Wait for Minecraft server
        run: |
          timeout 60 bash -c 'until nc -z localhost 25565; do sleep 1; done'
      
      - name: Run E2E tests
        run: npm run test:e2e
        env:
          MINECRAFT_HOST: localhost
          MINECRAFT_PORT: 25565
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

### 8. NPM Scripts (`package.json`)
```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:e2e": "jest tests/e2e",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --maxWorkers=2"
  }
}
```

---

## Summary

Comprehensive testing strategy includes:
- ✅ Unit tests (vision, state, rate limiter, action awareness)
- ✅ Integration tests (layer communication, full stack)
- ✅ E2E tests (survival, goal completion, error recovery)
- ✅ Mock objects (bot, omniroute, minecraft server)
- ✅ CI/CD integration (GitHub Actions)
- ✅ Coverage thresholds (70% minimum)

**Estimated time:** 2 hours
**Priority:** Critical (prevents regressions, ensures reliability)

Ready to integrate into main plan?
