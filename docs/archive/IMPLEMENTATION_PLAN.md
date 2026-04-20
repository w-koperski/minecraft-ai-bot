# Implementation Plan - Minecraft AI Bot

## 🎯 Goal
Build a 3-layer AI-powered Minecraft bot that can play autonomously or respond to voice commands.

## 📋 Prerequisites

### Already Available
- ✅ Headless Linux server with GPU
- ✅ Node.js installed
- ✅ Omniroute API running (http://127.0.0.1:20128)
- ✅ OpenClaw installed
- ✅ Whisper installed (`/home/linuxbrew/.linuxbrew/bin/whisper`)

### To Install
- [ ] Mineflayer + plugins
- [ ] sherpa-onnx-tts (optional, for voice output)
- [ ] Minecraft server (or connect to existing)

## 🚀 Phase 1: PoC - Basic Bot (30 min)

**Goal:** Verify Mineflayer works on headless server

### Steps

1. **Initialize project**
```bash
cd /home/seryki/.openclaw/workspace/minecraft-ai-bot
npm init -y
```

2. **Install dependencies**
```bash
npm install mineflayer mineflayer-pathfinder mineflayer-collectblock
```

3. **Create basic bot** (`src/bot.js`)
```javascript
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');

const bot = mineflayer.createBot({
  host: 'localhost', // or your server IP
  port: 25565,
  username: 'AIBot',
  // auth: 'microsoft' // if online mode
});

bot.loadPlugin(pathfinder);

bot.once('spawn', () => {
  console.log('Bot spawned!');
  
  // Simple task: find and collect oak logs
  const mcData = require('minecraft-data')(bot.version);
  const movements = new Movements(bot, mcData);
  bot.pathfinder.setMovements(movements);
  
  const oakLog = bot.findBlock({
    matching: mcData.blocksByName.oak_log.id,
    maxDistance: 64
  });
  
  if (oakLog) {
    console.log('Found oak log at', oakLog.position);
    const goal = new goals.GoalNear(oakLog.position.x, oakLog.position.y, oakLog.position.z, 1);
    bot.pathfinder.setGoal(goal);
  }
});

bot.on('goal_reached', () => {
  console.log('Reached goal!');
});

bot.on('error', (err) => console.error('Bot error:', err));
bot.on('kicked', (reason) => console.log('Kicked:', reason));
```

4. **Test locally**
```bash
# Start a local Minecraft server (or use existing)
# Then run:
node src/bot.js
```

5. **Verify**
- [ ] Bot connects successfully
- [ ] Bot spawns in world
- [ ] Bot can find and navigate to blocks
- [ ] No crashes on headless server

**Deliverable:** Working bot that connects and moves

---

## 🧠 Phase 2: Layer 1 - Pilot with LLM (1-2h)

**Goal:** Bot reacts to environment via LLM

### Steps

1. **Create vision system** (`src/vision.js`)
```javascript
function extractState(bot) {
  const nearbyEntities = Object.values(bot.entities)
    .filter(e => e.position.distanceTo(bot.entity.position) < 16)
    .map(e => ({
      type: e.name,
      distance: e.position.distanceTo(bot.entity.position),
      hostile: e.type === 'mob' && e.mobType === 'Hostile'
    }));
  
  const nearbyBlocks = {};
  const blocks = bot.findBlocks({
    matching: (block) => block.name !== 'air',
    maxDistance: 8,
    count: 100
  });
  
  blocks.forEach(pos => {
    const block = bot.blockAt(pos);
    nearbyBlocks[block.name] = (nearbyBlocks[block.name] || 0) + 1;
  });
  
  return {
    position: bot.entity.position,
    health: bot.health,
    food: bot.food,
    inventory: bot.inventory.items().map(item => ({
      name: item.name,
      count: item.count
    })),
    nearbyMobs: nearbyEntities,
    nearbyBlocks: nearbyBlocks
  };
}

module.exports = { extractState };
```

2. **Create Omniroute client** (`src/omniroute.js`)
```javascript
const axios = require('axios');

const OMNIROUTE_URL = 'http://127.0.0.1:20128/v1/chat/completions';
const API_KEY = 'sk-25dccb8ba99cb3cf-6f2993-0a542c8e';

async function callModel(model, messages, maxTokens = 100) {
  try {
    const response = await axios.post(OMNIROUTE_URL, {
      model: model,
      messages: messages,
      max_tokens: maxTokens,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });
    
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Omniroute error:', error.message);
    return null;
  }
}

module.exports = { callModel };
```

3. **Create pilot** (`src/pilot.js`)
```javascript
const { callModel } = require('./omniroute');
const { extractState } = require('./vision');

const PILOT_MODEL = 'nvidia/meta/llama-3.2-1b-instruct';

const PILOT_PROMPT = `You are a Minecraft bot pilot. React to the current situation with ONE action.

Available actions:
- {"action": "move", "direction": "forward|back|left|right"}
- {"action": "jump"}
- {"action": "dig", "block": "block_name"}
- {"action": "attack", "entity": "entity_type"}
- {"action": "stop"}

Respond ONLY with valid JSON. No explanation.`;

async function pilotLoop(bot) {
  const state = extractState(bot);
  
  const messages = [
    { role: 'system', content: PILOT_PROMPT },
    { role: 'user', content: `State: ${JSON.stringify(state, null, 2)}\n\nWhat action?` }
  ];
  
  const response = await callModel(PILOT_MODEL, messages, 50);
  if (!response) return;
  
  try {
    const action = JSON.parse(response);
    await executeAction(bot, action);
  } catch (error) {
    console.error('Failed to parse pilot response:', response);
  }
}

async function executeAction(bot, action) {
  switch (action.action) {
    case 'move':
      bot.setControlState(action.direction, true);
      setTimeout(() => bot.clearControlStates(), 500);
      break;
    case 'jump':
      bot.setControlState('jump', true);
      setTimeout(() => bot.clearControlStates(), 100);
      break;
    case 'dig':
      const block = bot.findBlock({
        matching: (b) => b.name === action.block,
        maxDistance: 4
      });
      if (block) await bot.dig(block);
      break;
    case 'attack':
      const entity = Object.values(bot.entities).find(e => 
        e.name === action.entity && 
        e.position.distanceTo(bot.entity.position) < 4
      );
      if (entity) bot.attack(entity);
      break;
    case 'stop':
      bot.clearControlStates();
      break;
  }
}

function startPilot(bot, intervalMs = 500) {
  setInterval(() => pilotLoop(bot), intervalMs);
}

module.exports = { startPilot };
```

4. **Update main bot** (`src/bot.js`)
```javascript
const mineflayer = require('mineflayer');
const { startPilot } = require('./pilot');

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'AIBot'
});

bot.once('spawn', () => {
  console.log('Bot spawned! Starting pilot...');
  startPilot(bot, 500); // 500ms loop
});

bot.on('error', (err) => console.error('Bot error:', err));
bot.on('kicked', (reason) => console.log('Kicked:', reason));
```

5. **Install axios**
```bash
npm install axios
```

6. **Test**
```bash
node src/bot.js
```

7. **Verify**
- [ ] Bot reacts to nearby mobs
- [ ] Bot avoids hazards
- [ ] Bot executes actions from LLM
- [ ] Latency ~200-500ms per action

**Deliverable:** Bot with reactive AI (Layer 1)

---

## 📊 Phase 3: Layer 2 - Strategy (2-3h)

**Goal:** Bot plans multi-step tasks

### Steps

1. **Create strategy planner** (`src/strategy.js`)
```javascript
const { callModel } = require('./omniroute');
const { extractState } = require('./vision');
const fs = require('fs').promises;

const STRATEGY_MODEL = 'nvidia/qwen/qwen2.5-7b-instruct';

const STRATEGY_PROMPT = `You are a Minecraft strategist. Plan the next 3-5 actions to achieve the goal.

Available high-level actions:
- {"action": "navigate", "target": "block_type", "count": N}
- {"action": "collect", "item": "item_name", "count": N}
- {"action": "craft", "item": "item_name", "count": N}
- {"action": "build", "structure": "description"}
- {"action": "avoid", "threat": "mob_type"}

Respond with JSON array of actions. No explanation.`;

async function strategyLoop(bot) {
  const state = extractState(bot);
  const commands = await loadCommands();
  
  if (!commands.goal) return;
  
  const messages = [
    { role: 'system', content: STRATEGY_PROMPT },
    { role: 'user', content: `Goal: ${commands.goal}\n\nState: ${JSON.stringify(state, null, 2)}\n\nPlan:` }
  ];
  
  const response = await callModel(STRATEGY_MODEL, messages, 200);
  if (!response) return;
  
  try {
    const plan = JSON.parse(response);
    await savePlan(plan);
  } catch (error) {
    console.error('Failed to parse strategy response:', response);
  }
}

async function loadCommands() {
  try {
    const data = await fs.readFile('state/commands.json', 'utf8');
    return JSON.parse(data);
  } catch {
    return { goal: null };
  }
}

async function savePlan(plan) {
  await fs.writeFile('state/plan.json', JSON.stringify(plan, null, 2));
}

function startStrategy(bot, intervalMs = 3000) {
  setInterval(() => strategyLoop(bot), intervalMs);
}

module.exports = { startStrategy };
```

2. **Update pilot to read plan** (`src/pilot.js`)
```javascript
// Add at top:
const fs = require('fs').promises;

// Add function:
async function loadPlan() {
  try {
    const data = await fs.readFile('state/plan.json', 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Modify pilotLoop to check plan first:
async function pilotLoop(bot) {
  const plan = await loadPlan();
  
  if (plan.length > 0) {
    const nextAction = plan[0];
    await executeHighLevelAction(bot, nextAction);
    plan.shift();
    await fs.writeFile('state/plan.json', JSON.stringify(plan, null, 2));
  } else {
    // Fallback to reactive behavior
    const state = extractState(bot);
    // ... existing pilot logic
  }
}

async function executeHighLevelAction(bot, action) {
  // Implement high-level actions (navigate, collect, craft, etc.)
  // This is a simplified version - expand as needed
  console.log('Executing:', action);
}
```

3. **Create state directory**
```bash
mkdir -p state
echo '{"goal": null}' > state/commands.json
echo '[]' > state/plan.json
```

4. **Update main bot** (`src/bot.js`)
```javascript
const { startPilot } = require('./pilot');
const { startStrategy } = require('./strategy');

bot.once('spawn', () => {
  console.log('Bot spawned!');
  startPilot(bot, 500);
  startStrategy(bot, 3000);
});
```

5. **Test**
```bash
# Set a goal:
echo '{"goal": "collect 64 oak logs"}' > state/commands.json

# Run bot:
node src/bot.js
```

6. **Verify**
- [ ] Strategy generates multi-step plans
- [ ] Pilot executes plan steps
- [ ] Bot completes complex tasks
- [ ] Strategy updates every 2-5s

**Deliverable:** Bot with planning AI (Layer 2)

---

## 🎯 Phase 4: Layer 3 - Commander (1-2h)

**Goal:** High-level monitoring and goal management

### Steps

1. **Create commander** (`src/commander.js`)
```javascript
const { callModel } = require('./omniroute');
const fs = require('fs').promises;

const COMMANDER_MODEL = 'claude-sonnet-4.5';

const COMMANDER_PROMPT = `You are a Minecraft commander. Monitor the bot and issue high-level goals.

Based on the bot state, decide:
1. Is the current goal still valid?
2. Should we change goals?
3. Any corrections needed?

Respond with JSON:
{
  "goal": "new goal or null to keep current",
  "notes": "observations"
}`;

async function commanderLoop() {
  const state = await loadState();
  const commands = await loadCommands();
  
  const messages = [
    { role: 'system', content: COMMANDER_PROMPT },
    { role: 'user', content: `State: ${JSON.stringify(state, null, 2)}\n\nCurrent goal: ${commands.goal || 'none'}\n\nDecision:` }
  ];
  
  const response = await callModel(COMMANDER_MODEL, messages, 150);
  if (!response) return;
  
  try {
    const decision = JSON.parse(response);
    if (decision.goal) {
      await saveCommands({ goal: decision.goal });
      console.log('Commander: New goal -', decision.goal);
    }
    if (decision.notes) {
      console.log('Commander notes:', decision.notes);
    }
  } catch (error) {
    console.error('Failed to parse commander response:', response);
  }
}

async function loadState() {
  try {
    const data = await fs.readFile('state/state.json', 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function loadCommands() {
  try {
    const data = await fs.readFile('state/commands.json', 'utf8');
    return JSON.parse(data);
  } catch {
    return { goal: null };
  }
}

async function saveCommands(commands) {
  await fs.writeFile('state/commands.json', JSON.stringify(commands, null, 2));
}

// Run as OpenClaw cron job (see below)
module.exports = { commanderLoop };
```

2. **Add state saving to vision** (`src/vision.js`)
```javascript
const fs = require('fs').promises;

async function saveState(bot) {
  const state = extractState(bot);
  await fs.writeFile('state/state.json', JSON.stringify(state, null, 2));
}

// Call this periodically from main bot
module.exports = { extractState, saveState };
```

3. **Create OpenClaw cron job**

Create skill: `~/.openclaw/workspace/skills/minecraft-commander/SKILL.md`
```markdown
---
name: minecraft-commander
description: High-level commander for Minecraft AI bot
---

# minecraft-commander

Monitors bot state and issues goals every 10s.

## Usage

Run commander loop:
```bash
cd /home/seryki/.openclaw/workspace/minecraft-ai-bot
node -e "require('./src/commander').commanderLoop()"
```

## OpenClaw Integration

Add cron job:
```javascript
{
  "name": "minecraft-commander",
  "schedule": { "kind": "every", "everyMs": 10000 },
  "payload": {
    "kind": "agentTurn",
    "message": "Run minecraft commander loop",
    "model": "claude-sonnet-4.5"
  },
  "sessionTarget": "isolated"
}
```
```

4. **Add cron job via OpenClaw**
```bash
# Use OpenClaw cron tool to add job
# Or manually via openclaw CLI
```

5. **Update main bot to save state** (`src/bot.js`)
```javascript
const { saveState } = require('./vision');

bot.once('spawn', () => {
  console.log('Bot spawned!');
  startPilot(bot, 500);
  startStrategy(bot, 3000);
  
  // Save state every 5s for commander
  setInterval(() => saveState(bot), 5000);
});
```

6. **Test**
```bash
# Run bot:
node src/bot.js

# Commander will monitor and adjust goals automatically
```

7. **Verify**
- [ ] Commander monitors state every 10s
- [ ] Commander issues new goals when needed
- [ ] Commander detects when bot is stuck
- [ ] All 3 layers working together

**Deliverable:** Full 3-layer AI system

---

## 🎤 Phase 5: Voice Pipeline (2-3h, optional)

**Goal:** Voice command interface

### Steps

1. **Install sherpa-onnx-tts**
```bash
# Follow skill instructions:
# ~/.npm-global/lib/node_modules/openclaw/skills/sherpa-onnx-tts/SKILL.md
```

2. **Create voice input script** (`voice/voice-input.sh`)
```bash
#!/bin/bash
# Record 5s of audio and transcribe with Whisper

AUDIO_FILE="/tmp/voice-input.wav"
OUTPUT_FILE="state/voice-command.txt"

# Record audio (requires audio device)
arecord -d 5 -f cd -t wav "$AUDIO_FILE"

# Transcribe with Whisper
whisper "$AUDIO_FILE" --model base --language pl --output_format txt --output_dir /tmp

# Save command
cat /tmp/voice-input.txt > "$OUTPUT_FILE"
echo "Voice command: $(cat $OUTPUT_FILE)"
```

3. **Create voice output script** (`voice/voice-output.sh`)
```bash
#!/bin/bash
# Read response and speak with TTS

INPUT_FILE="state/voice-response.txt"
AUDIO_FILE="/tmp/voice-output.wav"

if [ ! -f "$INPUT_FILE" ]; then
  exit 0
fi

# Generate speech
sherpa-onnx-tts -o "$AUDIO_FILE" "$(cat $INPUT_FILE)"

# Play audio (requires audio device)
aplay "$AUDIO_FILE"

# Clear response
rm "$INPUT_FILE"
```

4. **Update commander to handle voice** (`src/commander.js`)
```javascript
async function checkVoiceCommand() {
  try {
    const command = await fs.readFile('state/voice-command.txt', 'utf8');
    if (command.trim()) {
      console.log('Voice command:', command);
      await saveCommands({ goal: command.trim() });
      await fs.writeFile('state/voice-response.txt', `Executing: ${command}`);
      await fs.writeFile('state/voice-command.txt', ''); // Clear
    }
  } catch {
    // No voice command
  }
}

// Add to commanderLoop:
async function commanderLoop() {
  await checkVoiceCommand();
  // ... existing logic
}
```

5. **Test voice pipeline**
```bash
# Record command:
./voice/voice-input.sh

# Commander will pick it up and respond
# Response will be spoken via TTS
./voice/voice-output.sh
```

6. **Verify**
- [ ] Voice commands transcribed correctly
- [ ] Commander executes voice commands
- [ ] TTS responses generated
- [ ] Full voice loop works

**Note:** Headless server needs audio forwarding or remote client for voice to work.

**Deliverable:** Voice-controlled bot

---

## ✅ Final Checklist

- [ ] Phase 1: Basic bot connects and moves
- [ ] Phase 2: Pilot reacts to environment via LLM
- [ ] Phase 3: Strategy plans multi-step tasks
- [ ] Phase 4: Commander monitors and issues goals
- [ ] Phase 5: Voice commands work (optional)
- [ ] All layers communicate via state files
- [ ] Bot can play autonomously
- [ ] Documentation complete
- [ ] Code pushed to GitHub

## 📝 Next Steps After Implementation

1. **Tune prompts** - Improve LLM responses
2. **Add more actions** - Crafting, building, combat
3. **Optimize performance** - Reduce latency, better pathfinding
4. **Add safety** - Prevent bot from dying, losing items
5. **Expand voice** - More natural conversation
6. **Multi-bot** - Coordinate multiple bots
7. **Web UI** - Monitor bot via browser

## 🐛 Troubleshooting

### Bot won't connect
- Check Minecraft server is running
- Verify host/port in bot.js
- Check firewall rules

### LLM not responding
- Verify Omniroute is running: `curl http://127.0.0.1:20128/v1/models`
- Check API key is correct
- Test model manually: `curl -X POST ...`

### Bot stuck in loop
- Check state files for corruption
- Clear plan: `echo '[]' > state/plan.json`
- Reset goal: `echo '{"goal": null}' > state/commands.json`

### Voice not working
- Headless server needs audio forwarding
- Use Discord bot as voice bridge
- Or run voice client on separate machine

## 📚 Resources

- [Mineflayer docs](https://github.com/PrismarineJS/mineflayer)
- [Omniroute API](http://127.0.0.1:20128/docs)
- [Whisper docs](https://github.com/openai/whisper)
- [sherpa-onnx-tts](https://github.com/k2-fsa/sherpa-onnx)
