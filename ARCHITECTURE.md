# Minecraft AI Bot - Architecture

## 🎯 Overview

3-layer AI architecture for autonomous Minecraft gameplay:
- **Layer 1 (Pilot)**: Fast reactions (210ms) - movement, combat, hazard avoidance
- **Layer 2 (Strategy)**: Planning (410ms) - task decomposition, pathfinding, inventory management
- **Layer 3 (Commander)**: High-level goals - monitoring, corrections, user interface

## 🏗️ Architecture Diagram

### Core 3-Layer System

```
┌─────────────────────────────────────────────────────────┐
│ Layer 3: Commander (Reasoning model, ~1s) │
│ - Monitor bot state every 10-30s │
│ - Issue high-level commands ("build house", "find diamonds") │
│ - Strategy corrections when stuck │
│ - Progress reporting to user │
│ - Autonomous goal generation (when enabled) │
└────────────────┬────────────────────────────────────────┘
                 │ text commands
┌────────────────▼────────────────────────────────────────┐
│ Layer 2: Strategy (Planning model, 410ms) │
│ - Translate commands into action sequences             │
│ - Pathfinding and navigation                           │
│ - Inventory management                                   │
│ - Crafting recipes                                       │
│ - Danger prediction integration                        │
└────────────────┬────────────────────────────────────────┘
                 │ action sequences
┌────────────────▼────────────────────────────────────────┐
│ Layer 1: Pilot (Fast model, 210ms) │
│ - Execute actions (move, dig, place, attack)            │
│ - Avoid hazards (lava, mobs, falls)                     │
│ - React to environment changes                         │
│ - Confidence-scored actions                            │
└────────────────┬────────────────────────────────────────┘
                 │ Mineflayer API
┌────────────────▼────────────────────────────────────────┐
│ Minecraft Bot (Node.js + Mineflayer)                    │
│ - Connect to Minecraft server                            │
│ - Observe world (blocks, mobs, inventory)              │
│ - Execute commands (dig, place, attack, craft)         │
└──────────────────────────────────────────────────────────┘
```

### Robustness Modules (Project Sid)

```
┌──────────────────────────────────────────────────────────┐
│                    Shared Services                        │
├──────────────────────────────────────────────────────────┤
│  Knowledge Graph (memory/)    │  State Manager (utils/)  │
│  - Spatial, temporal,         │  - File-based state      │
│    episodic, semantic         │  - Lockfile sync         │
│  - Auto-consolidation         │  - Commands/plan/state   │
│  - LRU eviction (10k nodes)   │                            │
└────────────────┬──────────────────────────────────────────┘
                 │
    ┌────────────┼────────────┬────────────┬────────────┐
    │            │            │            │            │
┌───▼───┐  ┌────▼────┐  ┌────▼────┐ ┌────▼────┐ ┌────▼────┐
│Action │  │  Skill  │  │ Danger │ │Reflection│ │  Goal   │
│Awareness│ │ System │  │Predictor│ │ Module  │ │Generator│
├─────────┤ ├─────────┤  ├─────────┤ ├─────────┤ ├─────────┤
│Confidence│ │Registry│  │Spatial │ │30-min  │ │ Graph   │
│Scoring  │ │Executor│  │tracking│ │analysis│ │ Scorer  │
│Multi-step│ │Retry  │  │7-day   │ │Learnings│ │ Generator│
│verify   │ │(3 max) │  │decay   │ │Adjust │ │         │
└─────────┘ └─────────┘  └─────────┘ └─────────┘ └─────────┘
     │            │            │            │            │
     └────────────┴────────────┴────────────┴────────────┘
                              │
                    ┌─────────▼──────────┐
│ Item Tracker │
│ Milestone detection │
│ Items/hour rate │
└─────────────────────┘
```

## 🧠 Model Selection Guide

The bot architecture requires three types of models with different characteristics. Choose models that meet these requirements for your use case.

| Task Type | Required Characteristics | Example Models | Latency Target |
|-----------|-------------------------|----------------|----------------|
| Pilot (Fast Reactions) | Low latency (<300ms), small size (1-3B params), efficient single-token inference, reactive output format | llama-3.2-1b, phi-3-mini, qwen-2-1.5b | <300ms |
| Strategy (Planning) | Medium latency (<500ms), medium size (7-14B params), multi-step reasoning, structured output generation | qwen-2.5-7b, mistral-7b, llama-3.1-8b | <500ms |
| Commander (Monitoring) | Higher latency acceptable (~1s), large model, strong instruction following, long-context understanding, goal decomposition | claude-sonnet, gpt-4, gemini-pro | ~1000ms |

### Layer Detail

**Pilot (Fast Reactions):** Executes single actions — move, dig, attack, avoid hazards. Runs at 2-5 Hz, so inference must complete within each tick window. Small parameter count (1-3B) enables the sub-300ms response time needed for danger avoidance and real-time gameplay.

**Strategy (Planning):** Plans 3-5 step sequences including pathfinding, crafting, and inventory management. Runs at 0.2-0.5 Hz, allowing more time per inference. Medium-sized models (7-14B) balance reasoning capability with the sub-500ms latency requirement.

**Commander (Monitoring):** Issues high-level goals, monitors progress, and corrects course when the bot is stuck. Runs at 0.03-0.1 Hz, so ~1s latency is acceptable. Larger models with strong instruction following and long-context understanding are well-suited for this task.

**Note:** This architecture works with any models meeting the latency and capability requirements above. Examples shown are illustrative. Choose any models meeting the characteristics for your specific deployment and use case. Model availability, performance, and pricing vary over time — verify current specifications before selecting.

### Model Selection Criteria

Models were selected based on these criteria:

#### Layer 1: Pilot (fast reactions)
- **Latency target:** <300ms (achieved: 210ms)
- Fastest response time within budget
- Sufficient for simple action selection
- Loop frequency: 200-500ms (2-5 Hz)

#### Layer 2: Strategy (planning)
- **Latency target:** <500ms (achieved: 410ms)
- Good balance of speed and reasoning
- Handles multi-step planning
- Loop frequency: 2-5s (0.2-0.5 Hz)

#### Layer 3: Commander (monitoring)
- **Latency target:** ~1s (achieved: ~1s)
- Strong reasoning for complex goals
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
- Calls fast model via OpenAI-compatible API
- Executes single actions

### 4. Strategy (`strategy.js`)
- Planning loop (2-5s)
- Calls planning model via OpenAI-compatible API
- Generates action sequences

### 5. Commander (`commander.js`)
- OpenClaw subagent (mode="session")
- Cron heartbeat (10s)
- Calls reasoning model
- Reads/writes command files

### 6. Voice Interface (`voice-input.sh`, `voice-output.sh`)
- Whisper STT
- sherpa-onnx-tts TTS
- File-based communication

### 7. Action Awareness (`src/layers/action-awareness.js`)
- Confidence scoring for every action (0.0-1.0)
- Multi-step verification at 100ms/500ms/1000ms
- Failure pattern detection and intervention
- Integration with skill executor for retry decisions

### 8. Danger Predictor (`src/safety/danger-predictor.js`)
- Spatial danger tracking with 20-block radius
- Exponential decay (7-day half-life)
- Integration with goal scorer and strategy layer

### 9. Skill System (`src/skills/`)
- Registry with O(1) lookup (5 primitives + 5 composites)
- Executor with retry logic (3 attempts max)
- Confidence threshold filtering

### 10. Reflection Module (`src/learning/reflection-module.js`)
- 30-minute performance analysis cycle
- Pattern analysis from failure detection
- Generates learnings and parameter adjustments

### 11. Goal Generator (`src/goals/`)
- Graph-based goal relationships
- Multi-factor scoring (danger, feasibility, importance)
- Context-aware autonomous goal generation

### 12. Item Tracker (`src/metrics/item-tracker.js`)
- Item acquisition logging with timestamps
- Milestone detection (Stone Age, Iron Age, etc.)
- Items/hour rate calculation

### 13. Benchmark Suite (`src/metrics/benchmark-suite.js`)
- 5-metric performance tracking
- Project Sid comparison data
- JSON report generation

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
├── ARCHITECTURE.md            # This file
├── IMPLEMENTATION_PLAN.md     # Step-by-step implementation guide
├── README.md                  # Project overview
├── AGENTS.md                  # Developer guide
├── package.json               # Node.js dependencies
├── .env.example               # Configuration template
├── src/
│   ├── index.js               # Full 3-layer + companion + robustness
│   ├── bot.js                 # Standalone bot (no AI layers)
│   ├── layers/
│   │   ├── pilot.js           # Layer 1: Fast reactions (adaptive loop)
│   │   ├── strategy.js        # Layer 2: Planning
│   │   ├── commander.js       # Layer 3: High-level goals
│   │   ├── cognitive-controller.js # PIANO decision synthesis
│   │   └── action-awareness.js # Confidence scoring + verification
│   ├── skills/
│   │   ├── skill-registry.js    # O(1) skill lookup
│   │   ├── skill-executor.js    # Retry logic
│   │   ├── primitives/          # 5 primitive skills
│   │   └── composite/           # 5 composite skills
│   ├── safety/
│   │   ├── danger-predictor.js # Spatial danger tracking
│   │   └── safety-manager.js   # Safety policy
│   ├── goals/
│   │   ├── goal-graph.js        # Hierarchical relationships
│   │   ├── goal-scorer.js       # Multi-factor scoring
│   │   └── goal-generator.js    # Context-aware generation
│   ├── learning/
│   │   └── reflection-module.js # 30-min performance analysis
│   ├── metrics/
│   │   ├── item-tracker.js      # Item progression
│   │   └── benchmark-suite.js   # Performance benchmarks
│   ├── memory/
│   │   ├── knowledge-graph.js   # Temporal memory storage
│   │   ├── conversation-store.js # SQLite conversations
│   │   └── memory-store.js      # Persistence layer
│   ├── emotion/
│   │   └── emotion-detector.js  # Emotion classification
│   ├── social/
│   │   └── social-awareness.js  # Player BDI model
│   ├── utils/
│ │ ├── api-client.js # OpenAI-compatible API client
│   │   ├── state-manager.js     # File locking
│   │   ├── rate-limiter.js      # Bottleneck wrapper
│   │   └── logger.js            # Winston logging
│   ├── chat/
│   │   └── chat-handler.js      # In-game commands
│   └── voice/
│       └── discord-voice.js     # Discord integration
├── prompts/
│   ├── pilot.txt                # Pilot prompt template
│   ├── strategy.txt             # Strategy prompt template
│   └── commander.txt            # Commander prompt template
├── personality/
│   └── Soul.md                  # Personality configuration
├── state/
│   ├── state.json               # Current bot state
│   ├── commands.json            # Commander → Strategy
│   ├── plan.json                # Strategy → Pilot
│   └── memory.db                # SQLite database
├── docs/
│   ├── COMPANION_FEATURES.md    # Personality, memory, voice
│   └── ROBUSTNESS.md            # Confidence, skills, reflection
├── scripts/
│   └── run-benchmarks.js        # Benchmark runner
└── tests/
    ├── unit/                    # Unit tests
    ├── integration/             # Layer communication
└── e2e/ # End-to-end
```

## 🚀 Implementation Phases

### Phase 1: PoC - Basic Bot (30 min)
- Simple bot without LLM
- Connects, walks, collects wood
- Verify Mineflayer works on headless server

### Phase 2: Layer 1 - Pilot with LLM (1-2h)
- Add vision.js
- Add pilot.js with fast model (1-3B params)
- Bot reacts to environment via LLM

### Phase 3: Layer 2 - Strategy (2-3h)
- Add strategy.js with planning model (7-14B params)
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
- OpenAI-compatible API access (local or remote)
- OpenClaw installed

### Minecraft
- Minecraft Java Edition server (local or remote)
- Bot account credentials

### Optional (Voice)
- Whisper (already installed: `/home/linuxbrew/.linuxbrew/bin/whisper`)
- sherpa-onnx-tts (needs installation)
- Audio forwarding setup (if remote control needed)

## 📊 Performance Targets

| Layer | Model Type | Latency | Frequency | Purpose |
|-------|-----------|---------|-----------|---------|
| Pilot | Fast model (1-3B params) | 210ms | 2-5 Hz | Fast reactions |
| Strategy | Planning model (7-14B params) | 410ms | 0.2-0.5 Hz | Planning |
| Commander | Reasoning model (large) | ~1s | 0.03-0.1 Hz | Monitoring |
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
- API key in environment variable (LLM_API_KEY)
- Voice commands sanitized before execution
- Rate limiting on LLM calls to prevent abuse

## 📝 License

MIT (to be added)
