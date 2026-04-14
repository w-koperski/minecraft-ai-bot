# Minecraft AI Bot

🤖 Autonomous Minecraft bot powered by 3-layer AI architecture

## 🎯 Features

- **Autonomous gameplay** - Bot plays Minecraft without human intervention
- **Voice commands** - Control bot with natural language (optional)
- **3-layer AI** - Fast reactions + strategic planning + high-level goals
- **Headless compatible** - Runs on servers without display
- **Free models** - Uses Omniroute for zero-cost inference

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

## 🎮 Usage Examples

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

Requires audio setup:

```bash
# Record voice command
./voice/voice-input.sh

# Bot will execute and respond via TTS
```

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
│   ├── bot.js              # Main entry point
│   ├── pilot.js            # Layer 1: Fast reactions
│   ├── strategy.js         # Layer 2: Planning
│   ├── commander.js        # Layer 3: Goals
│   ├── vision.js           # World state extraction
│   ├── omniroute.js        # API client
│   └── utils.js            # Utilities
├── prompts/
│   ├── pilot.txt           # Pilot prompt
│   ├── strategy.txt        # Strategy prompt
│   └── commander.txt       # Commander prompt
├── voice/
│   ├── voice-input.sh      # STT (Whisper)
│   └── voice-output.sh     # TTS (sherpa-onnx)
├── state/
│   ├── state.json          # Current bot state
│   ├── commands.json       # Commander → Strategy
│   ├── plan.json           # Strategy → Pilot
│   ├── voice-command.txt   # Voice input
│   └── voice-response.txt  # Voice output
└── tests/
    └── ...
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
