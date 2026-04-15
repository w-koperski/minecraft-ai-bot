# Minecraft AI Bot

🤖 Autonomous Minecraft bot powered by 3-layer AI architecture

## 🎯 Features

- **Autonomous gameplay** - Bot plays Minecraft without human intervention
- **Voice commands** - Control bot with natural language (optional)
- **3-layer AI** - Fast reactions + strategic planning + high-level goals
- **Headless compatible** - Runs on servers without display
- **Free models** - Uses Omnirroute for zero-cost inference

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

**Learn more:** [COMPANION_FEATURES.md](docs/COMPANION_FEATURES.md) has complete setup instructions and examples.

## 🏗️ Architecture

```
Commander (Claude Sonnet 4.5) → High-level goals
    ↓
Strategy (Qwen 2.5 7B) → Multi-step planning
    ↓
Pilot (Llama 3.2 1B) → Fast reactions
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
- Omniroute API running locally
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
OMNIROUTE_URL=http://127.0.0.1:20128/v1/chat/completions
OMNIROUTE_API_KEY=your-api-key-here
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
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) - Step-by-step build guide
- [COMPANION_FEATURES.md](docs/COMPANION_FEATURES.md) - Companion features guide (personality, memory, voice)

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
- Model: Llama 3.2 1B (210ms)
- Executes single actions: move, dig, attack
- Avoids hazards: lava, mobs, falls
- Runs at 2-5 Hz

### Layer 2: Strategy (Planning)
- Model: Qwen 2.5 7B (410ms)
- Plans 3-5 step sequences
- Handles pathfinding, crafting, inventory
- Runs at 0.2-0.5 Hz

### Layer 3: Commander (Monitoring)
- Model: Claude Sonnet 4.5 (~1s)
- Issues high-level goals
- Monitors progress
- Corrects when stuck
- Runs at 0.03-0.1 Hz

## 📁 Project Structure

```
minecraft-ai-bot/
├── src/
│   ├── bot.js                 # Main entry point
│   ├── index.js               # Full 3-layer system with companion features
│   ├── layers/
│   │   ├── pilot.js           # Layer 1: Fast reactions
│   │   ├── strategy.js        # Layer 2: Planning
│   │   ├── commander.js       # Layer 3: Goals
│   │   └── action-awareness.js # PIANO verification
│   ├── memory/
│   │   └── conversation-store.js # Persistent chat memory
│   ├── voice/
│   │   └── discord-voice.js   # Discord voice integration
│   ├── utils/
│   │   ├── state-manager.js   # File locking with lockfile
│   │   ├── omniroute.js       # LLM API client
│   │   ├── rate-limiter.js    # Bottleneck wrapper
│   │   └── logger.js          # Winston logger
│   └── actions/
│       ├── crafting.js        # Recipe execution
│       └── building.js        # Structure placement
├── personality/
│   └── Soul.md                # Personality configuration
├── prompts/
│   ├── pilot.txt              # Pilot prompt
│   ├── strategy.txt           # Strategy prompt
│   └── commander.txt          # Commander prompt
├── examples/
│   ├── personality-demo.js    # Personality customization demo
│   └── voice-demo.js          # Discord voice setup demo
├── state/
│   ├── state.json             # Current bot state
│   ├── commands.json          # Commander → Strategy
│   ├── plan.json              # Strategy → Pilot
│   └── memory.db              # SQLite conversation storage
├── docs/
│   └── COMPANION_FEATURES.md  # Companion features documentation
└── tests/
    ├── unit/                  # Unit tests
    ├── integration/           # Layer communication tests
    └── e2e/                   # End-to-end tests
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
- Verify Omniroute: `curl http://127.0.0.1:20128/v1/models`
- Check `OMNIROUTE_API_KEY` in `.env`

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
- [Omniroute](https://omniroute.koperski.tech) - Free LLM inference
- [OpenClaw](https://openclaw.ai) - AI orchestration

## 📧 Contact

- GitHub: [@w-koperski](https://github.com/w-koperski)
- Issues: [GitHub Issues](https://github.com/w-koperski/minecraft-ai-bot/issues)

---

**Status:** 🚧 In Development

See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for build progress.
