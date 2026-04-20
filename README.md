# Minecraft AI Bot

🤖 Autonomous Minecraft bot powered by 3-layer AI architecture

## 🎯 Features

- **Autonomous gameplay** - Bot plays Minecraft without human intervention
- **Voice commands** - Control bot with natural language (optional)
- **3-layer AI** - Fast reactions + strategic planning + high-level goals
- **Headless compatible** - Runs on servers without display
- **Flexible AI** - Works with any OpenAI-compatible API provider

## 🎭 Companion Features

Your bot is more than just an automation tool. It becomes a true companion through these features:

### Personality System
The bot has a customizable "Soul" defined in `personality/Soul.md`. Six personality dimensions (warmth, directness, humor, curiosity, loyalty, bravery) on a 0.0-1.0 scale create unique personalities. The bot evolves based on your interactions. High warmth + high loyalty creates a devoted companion. High curiosity + high bravery creates an adventurous explorer. See [COMPANION_FEATURES.md](docs/COMPANION_FEATURES.md) for customization details.

### Conversation Memory
The bot remembers every conversation through SQLite storage. It tracks trust and familiarity scores per player, summarizes conversations every 10 messages, and retains 30 days of history. Ask the bot about past conversations and watch your relationship develop over time.

### Voice Integration (Discord)
Control your bot hands-free through Discord voice channels. Simply say "Hey bot" followed by your command. The bot uses speech-to-text for commands and text-to-speech for responses. Requires Discord bot token and server setup.

### Autonomous Goals
When idle and safe, the bot generates its own goals based on its personality. A curious bot explores. A loyal bot stays close to assist. The bot considers recent conversations (if you mentioned wanting diamonds, it might go searching).

### PIANO Architecture
The bot uses a four-module system for personality-driven companion behavior:
- **Cognitive Controller** - Synthesizes inputs from all modules into unified decisions using priority rules (Danger > Social > Goals)
- **Emotion Detector** - Real-time emotion classification using transformers.js (13 emotion classes, P99 <50ms)
- **Social Awareness** - Tracks player mental states using BDI model (Beliefs, Desires, Intentions)
- **Knowledge Graph** - In-memory graph storage with temporal validity and LRU eviction (P99 <10ms)

**Learn more:** [COMPANION_FEATURES.md](docs/COMPANION_FEATURES.md) has complete setup instructions and examples.

## 🛡️ Robustness Features

The bot includes enterprise-grade robustness features for long-running autonomous operation:

### Confidence Scoring
Every action gets a confidence score (0.0-1.0) based on tool efficiency, distance, health, and hazards. Multi-step verification catches failures early, and fallback strategies adapt to low-confidence situations.

### Memory Consolidation
Automatic memory management every 10 minutes prevents bloat during long runs. Short-term memories compress into episodic, then long-term storage. LRU eviction keeps node count under 10,000 with P99 latency under 10ms.

### Danger Prediction
Learns from deaths and damage to predict dangerous areas. 20-block danger zones decay over 7 days. Strategy layer uses this to avoid risky paths and penalize dangerous goals.

### Failure Pattern Detection
Analyzes action history to detect stuck patterns, tool failures, and pathfinding errors. Triggers interventions after 3 consecutive failures and logs patterns for learning.

### Skill System
10 reusable skills with retry logic: 5 primitives (move, dig, place, craft, collect) and 5 composites (gather wood, mine stone, craft tools, build shelter, hunt food).

### Reflection Module
Every 30 minutes, the bot analyzes its performance, generates learnings, and adjusts parameters. Example: "Dig action fails with wrong tool, switch to stone_pickaxe."

### Autonomous Goals
When idle, the bot generates its own goals based on personality, danger predictions, and recent conversations. Player goals always take priority.

### Performance Benchmarks
Five metrics tracked against Project Sid targets: action success rate (94%), items/hour (39), memory usage, reflection latency (6ms), and goal generation latency (1ms).

**Learn more:** [ROBUSTNESS.md](docs/ROBUSTNESS.md) has complete feature documentation and troubleshooting.

## 🏗️ Architecture

```
Commander (Reasoning model) → High-level goals
    ↓
Strategy (Planning model) → Multi-step planning
    ↓
Pilot (Fast model) → Fast reactions
    ↓
Mineflayer → Minecraft actions
```

**Performance:**
- Pilot: 210ms latency (2-5 Hz)
- Strategy: 410ms latency (0.2-0.5 Hz)
- Commander: ~1s latency (0.03-0.1 Hz)

## 🚀 Quick Start

### Prerequisites

- Node.js v18+
- OpenAI-compatible API endpoint
- Minecraft Java Edition server

### Installation

```bash
git clone https://github.com/w-koperski/minecraft-ai-bot.git
cd minecraft-ai-bot
npm install
```

### Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Edit `.env`:
```env
MINECRAFT_HOST=localhost
MINECRAFT_PORT=25565
MINECRAFT_USERNAME=AIBot
API_URL=http://127.0.0.1:20128/v1/chat/completions
API_KEY=your-api-key-here
```

### Run

```bash
# Start bot
node src/bot.js

# Set a goal
echo '{"goal": "collect 64 oak logs"}' > state/commands.json
```

## 📖 Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - System design and model selection
- [COMPANION_FEATURES.md](docs/COMPANION_FEATURES.md) - Companion features (personality, memory, voice)
- [ROBUSTNESS.md](docs/ROBUSTNESS.md) - Robustness features (confidence scoring, skills, reflection)
- [AGENTS.md](AGENTS.md) - Developer guide with architecture and modules

## 🎮 Usage Examples

### Companion Mode

Enable personality, memory, and autonomous behavior:

```bash
# Customize personality
vim personality/Soul.md  # Edit trait values

# View conversation history
node examples/personality-demo.js

# Run with full companion features
node src/index.js
```

### Autonomous Mode

Bot plays on its own, making decisions based on environment:

```bash
node src/bot.js
```

### Goal-Directed Mode

Set high-level goals for the bot:

```bash
# Collect resources
echo '{"goal": "collect 64 oak logs"}' > state/commands.json

# Build structures
echo '{"goal": "build a wooden house"}' > state/commands.json

# Explore
echo '{"goal": "find diamonds"}' > state/commands.json
```

### Voice Control (Optional)

Control the bot through Discord voice channels:

```bash
# Set up Discord integration
export DISCORD_BOT_TOKEN=your_token_here
export DISCORD_GUILD_ID=your_server_id

# Run voice demo
node examples/voice-demo.js <voice-channel-id>

# In Discord voice channel, say:
# "Hey bot, collect some wood"
# "Hey bot, what's your status?"
```

See [COMPANION_FEATURES.md](docs/COMPANION_FEATURES.md) for complete Discord setup instructions.

## 🧠 How It Works

### Layer 1: Pilot (Fast Reactions)
- Model: Fast model (1-3B params, 210ms)
- Executes single actions: move, dig, attack
- Avoids hazards: lava, mobs, falls
- Runs at 2-5 Hz

### Layer 2: Strategy (Planning)
- Model: Planning model (7-14B params, 410ms)
- Plans 3-5 step sequences
- Handles pathfinding, crafting, inventory
- Runs at 0.2-0.5 Hz

### Layer 3: Commander (Monitoring)
- Model: Reasoning model (large, ~1s)
- Issues high-level goals
- Monitors progress
- Corrects when stuck
- Runs at 0.03-0.1 Hz

## 📁 Project Structure

```
minecraft-ai-bot/
├── src/
│   ├── bot.js # Main entry point
│   ├── index.js # Full 3-layer system with companion features
│   ├── layers/
│   │   ├── pilot.js # Layer 1: Fast reactions
│   │   ├── strategy.js # Layer 2: Planning
│   │   ├── commander.js # Layer 3: Goals
│   │   ├── cognitive-controller.js # PIANO decision synthesis
│   │   └── action-awareness.js # PIANO verification
│   ├── emotion/
│   │   └── emotion-detector.js # Emotion classification
│   ├── social/
│   │   └── social-awareness.js # Player BDI model
│   ├── memory/
│   │   ├── conversation-store.js # Persistent chat memory
│   │   ├── knowledge-graph.js # Memory with temporal validity
│   │   └── memory-store.js # Memory persistence
│   ├── voice/
│   │   ├── discord-voice.js # Discord voice integration
│   │   └── voice-handler.js # Voice command processing
│   ├── skills/
│   │   ├── skill-registry.js # O(1) skill lookup
│   │   ├── skill-executor.js # Retry logic with confidence filtering
│   │   ├── primitives/ # 5 primitive skills
│   │   │   ├── move.js
│   │   │   ├── dig.js
│   │   │   ├── place.js
│   │   │   ├── craft.js
│   │   │   └── collect.js
│   │   └── composite/ # 5 composite skills
│   │       ├── gather-wood.js
│   │       ├── mine-stone.js
│   │       ├── craft-tools.js
│   │       ├── build-shelter.js
│   │       └── hunt-food.js
│   ├── safety/
│   │   ├── danger-predictor.js # Spatial danger tracking
│   │   └── safety-manager.js # Safety policy enforcement
│   ├── goals/
│   │   ├── goal-graph.js # Hierarchical goal relationships
│   │   ├── goal-scorer.js # Multi-factor goal scoring
│   │   └── goal-generator.js # Context-aware goal generation
│   ├── learning/
│   │   ├── reflection-module.js # 30-min performance analysis
│   │   ├── learning-metrics.js # Performance tracking
│   │   ├── strategy-memory.js # Strategy storage
│   │   └── strategy-applicator.js # Strategy application
│   ├── metrics/
│   │   ├── item-tracker.js # Item acquisition tracking
│   │   └── benchmark-suite.js # 5-metric performance tracking
│   ├── utils/
│   │   ├── state-manager.js # File locking with lockfile
│   │   ├── api-client.js # OpenAI-compatible API client
│   │   ├── rate-limiter.js # Bottleneck wrapper
│   │   └── logger.js # Winston logger
│   ├── chat/
│   │   └── chat-handler.js # In-game commands
│   └── personality/
│       └── personality-engine.js # Trait system
├── personality/
│   └── Soul.md # Personality configuration
├── prompts/
│   ├── pilot.txt # Pilot prompt
│   ├── strategy.txt # Strategy prompt
│   └── commander.txt # Commander prompt
├── examples/
│   ├── personality-demo.js # Personality customization demo
│   └── voice-demo.js # Discord voice setup demo
├── state/
│   ├── state.json # Current bot state
│   ├── commands.json # Commander → Strategy
│   ├── plan.json # Strategy → Pilot
│   └── memory.db # SQLite conversation storage
├── docs/
│   └── COMPANION_FEATURES.md # Companion features documentation
└── tests/
    ├── unit/ # Unit tests
    ├── integration/ # Layer communication tests
    └── e2e/ # End-to-end tests
```

## 🔧 Development

### Run Tests

```bash
npm test
```

### Debug Mode

```bash
DEBUG=* node src/bot.js
```

### Tune Prompts

Edit files in `prompts/` to improve LLM behavior.

## 🐛 Troubleshooting

### Bot won't connect
- Check Minecraft server is running
- Verify `MINECRAFT_HOST` and `MINECRAFT_PORT` in `.env`

### LLM not responding
- Test your API endpoint: `curl http://127.0.0.1:20128/v1/models`
- Check `API_KEY` in `.env`

### Bot stuck in loop
- Clear plan: `echo '[]' > state/plan.json`
- Reset goal: `echo '{"goal": null}' > state/commands.json`

### Voice not working
- Headless servers need audio forwarding
- Use Discord bot as voice bridge
- Or run voice client on separate machine

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repo
2. Create a feature branch
3. Submit a pull request

## 📝 License

MIT

## 🙏 Acknowledgments

- [Mineflayer](https://github.com/PrismarineJS/mineflayer) - Minecraft bot framework
- Compatible with the [OpenAI API standard](https://platform.openai.com/docs/api-reference)
- [OpenClaw](https://openclaw.ai) - AI orchestration

## 📧 Contact

- GitHub: [@w-koperski](https://github.com/w-koperski)
- Issues: [GitHub Issues](https://github.com/w-koperski/minecraft-ai-bot/issues)

---

**Status:** 🚧 In Development

See [AGENTS.md](AGENTS.md) for implementation details and current status.
