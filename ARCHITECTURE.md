# Minecraft AI Bot - Architecture

## 🎯 Overview

3-layer AI architecture for autonomous Minecraft gameplay:
- **Layer 1 (Pilot)**: Fast reactions (210ms) - movement, combat, hazard avoidance
- **Layer 2 (Strategy)**: Planning (410ms) - task decomposition, pathfinding, inventory management
- **Layer 3 (Commander)**: High-level goals - monitoring, corrections, user interface

## 🏗️ Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│ Layer 3: Commander (Claude Sonnet 4.5)                  │
│ - Monitor bot state every 10-30s                         │
│ - Issue high-level commands ("build house", "find diamonds") │
│ - Strategy corrections when stuck                        │
│ - Progress reporting to user                             │
└────────────────┬────────────────────────────────────────┘
                 │ text commands
┌────────────────▼────────────────────────────────────────┐
│ Layer 2: Strategy (Qwen 2.5 7B, 410ms)                 │
│ - Translate commands into action sequences               │
│ - Pathfinding and navigation                             │
│ - Inventory management                                   │
│ - Crafting recipes                                       │
└────────────────┬────────────────────────────────────────┘
                 │ action sequences
┌────────────────▼────────────────────────────────────────┐
│ Layer 1: Pilot (Llama 3.2 1B, 210ms)                   │
│ - Execute actions (move, dig, place, attack)            │
│ - Avoid hazards (lava, mobs, falls)                     │
│ - React to environment changes                           │
└────────────────┬────────────────────────────────────────┘
                 │ Mineflayer API
┌────────────────▼────────────────────────────────────────┐
│ Minecraft Bot (Node.js + Mineflayer)                    │
│ - Connect to Minecraft server                            │
│ - Observe world (blocks, mobs, inventory)               │
│ - Execute commands (dig, place, attack, craft)          │
└──────────────────────────────────────────────────────────┘
```

## 🧠 Model Selection (via Omniroute)

All models tested on headless server with GPU:

### Layer 1: Pilot (fast reactions)
**Selected:** `nvidia/meta/llama-3.2-1b-instruct` (210ms)
- Fastest response time
- Good enough for simple action selection
- Loop frequency: 200-500ms (2-5 Hz)

**Alternatives tested:**
- `nvidia/google/gemma-2-9b-it` (310ms)
- `nvidia/meta/llama-3.2-3b-instruct` (311ms)

### Layer 2: Strategy (planning)
**Selected:** `nvidia/qwen/qwen2.5-7b-instruct` (410ms)
- Good balance of speed and reasoning
- Handles multi-step planning
- Loop frequency: 2-5s (0.2-0.5 Hz)

**Alternatives tested:**
- `nvidia/mistralai/mistral-7b-instruct-v0.3` (410ms)
- `nvidia/meta/llama-3.3-70b-instruct` (510ms)
- `nvidia/qwen/qwen3.5-122b-a10b` (510ms)

### Layer 3: Commander (monitoring)
**Selected:** `claude-sonnet-4.5` (via Omniroute)
- Best reasoning for complex goals
- Handles user interaction
- Loop frequency: 10-30s (0.03-0.1 Hz)

## 🎤 Voice Pipeline (Optional)

**STT:** Whisper (local) - ~2-3s latency
**TTS:** sherpa-onnx-tts (local, offline) - ~1s latency
**Total voice latency:** ~3-4s (good for strategy, too slow for PvP)

**Note:** Headless server requires remote interface:
- Discord bot as voice bridge
- SSH with audio forwarding (PulseAudio)
- Client on separate machine

## 📦 Components

### 1. Minecraft Bot (`bot.js`)
- Mineflayer connection
- Event handlers
- Action execution

### 2. Vision System (`vision.js`)
- Extract world state from Mineflayer
- Format data for LLM consumption
- Output: JSON state snapshot

### 3. Pilot (`pilot.js`)
- Fast reaction loop (200-500ms)
- Calls Llama 3.2 1B via Omniroute
- Executes single actions

### 4. Strategy (`strategy.js`)
- Planning loop (2-5s)
- Calls Qwen 2.5 7B via Omniroute
- Generates action sequences

### 5. Commander (`commander.js`)
- OpenClaw subagent (mode="session")
- Cron heartbeat (10s)
- Calls Claude Sonnet 4.5
- Reads/writes command files

### 6. Voice Interface (`voice-input.sh`, `voice-output.sh`)
- Whisper STT
- sherpa-onnx-tts TTS
- File-based communication

## 🔄 Data Flow

### State Flow (bottom-up)
```
Mineflayer → vision.js → state.json
                            ↓
                         pilot.js (reads state, executes actions)
                            ↓
                         strategy.js (reads state, plans sequences)
                            ↓
                         commander.js (reads state, issues goals)
```

### Command Flow (top-down)
```
User/Voice → commander.js → commands.json
                               ↓
                            strategy.js (reads commands, plans)
                               ↓
                            pilot.js (reads plan, executes)
                               ↓
                            Mineflayer (performs actions)
```

## 📁 File Structure

```
minecraft-ai-bot/
├── ARCHITECTURE.md          # This file
├── IMPLEMENTATION_PLAN.md   # Step-by-step implementation guide
├── README.md                # Project overview
├── package.json             # Node.js dependencies
├── src/
│   ├── bot.js              # Main bot entry point
│   ├── vision.js           # World state extraction
│   ├── pilot.js            # Layer 1: Fast reactions
│   ├── strategy.js         # Layer 2: Planning
│   ├── commander.js        # Layer 3: High-level goals
│   ├── omniroute.js        # Omniroute API client
│   └── utils.js            # Shared utilities
├── prompts/
│   ├── pilot.txt           # Pilot prompt template
│   ├── strategy.txt        # Strategy prompt template
│   └── commander.txt       # Commander prompt template
├── voice/
│   ├── voice-input.sh      # Whisper STT wrapper
│   └── voice-output.sh     # sherpa-onnx-tts TTS wrapper
├── state/
│   ├── state.json          # Current bot state
│   ├── commands.json       # Commander → Strategy
│   ├── plan.json           # Strategy → Pilot
│   ├── voice-command.txt   # Voice input
│   └── voice-response.txt  # Voice output
└── tests/
    ├── test-mineflayer.js  # Basic Mineflayer test
    ├── test-omniroute.js   # Omniroute API test
    └── test-vision.js      # Vision system test
```

## 🚀 Implementation Phases

### Phase 1: PoC - Basic Bot (30 min)
- Simple bot without LLM
- Connects, walks, collects wood
- Verify Mineflayer works on headless server

### Phase 2: Layer 1 - Pilot with LLM (1-2h)
- Add vision.js
- Add pilot.js with Llama 3.2 1B
- Bot reacts to environment via LLM

### Phase 3: Layer 2 - Strategy (2-3h)
- Add strategy.js with Qwen 2.5 7B
- Multi-step planning
- Pilot executes strategy plan

### Phase 4: Layer 3 - Commander (1-2h)
- Add commander.js as OpenClaw subagent
- Cron heartbeat monitoring
- High-level goal management

### Phase 5: Voice Pipeline (2-3h, optional)
- Install sherpa-onnx-tts
- Add voice scripts
- Test voice command flow

**Total estimated time:** 6-10 hours for full stack

## 🔧 Technical Requirements

### Server
- Headless Linux server with GPU
- Node.js v18+
- Omniroute API access (local: http://127.0.0.1:20128)
- OpenClaw installed

### Minecraft
- Minecraft Java Edition server (local or remote)
- Bot account credentials

### Optional (Voice)
- Whisper (already installed: `/home/linuxbrew/.linuxbrew/bin/whisper`)
- sherpa-onnx-tts (needs installation)
- Audio forwarding setup (if remote control needed)

## 📊 Performance Targets

| Layer | Model | Latency | Frequency | Purpose |
|-------|-------|---------|-----------|---------|
| Pilot | Llama 3.2 1B | 210ms | 2-5 Hz | Fast reactions |
| Strategy | Qwen 2.5 7B | 410ms | 0.2-0.5 Hz | Planning |
| Commander | Claude Sonnet 4.5 | ~1s | 0.03-0.1 Hz | Monitoring |
| Voice (STT) | Whisper | 2-3s | On-demand | Speech input |
| Voice (TTS) | sherpa-onnx | 1s | On-demand | Speech output |

## 🎮 Use Cases

### Autonomous Gameplay
- Survival mode: gather resources, build shelter, avoid mobs
- Creative mode: build structures from descriptions
- Mining: find and collect ores
- Farming: automate crop/animal farming

### Assisted Gameplay
- Voice commands: "build a house", "find diamonds"
- Real-time coaching: "watch out for creeper behind you"
- Inventory management: "organize my chest"

### Testing & Development
- Automated testing of Minecraft mods/plugins
- Pathfinding algorithm testing
- AI behavior research

## 🔐 Security Notes

- Bot credentials stored in `.env` (not committed)
- Omniroute API key in environment variable
- Voice commands sanitized before execution
- Rate limiting on LLM calls to prevent abuse

## 📝 License

MIT (to be added)
