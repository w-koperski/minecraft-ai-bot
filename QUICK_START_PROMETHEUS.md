# 🎯 Quick Start for Prometheus (OpenCode)

## Project: Minecraft AI Bot
**Repo:** https://github.com/w-koperski/minecraft-ai-bot  
**Status:** Planning complete, ready for implementation  
**Estimated time:** 17-21 hours  
**Architecture:** 3-layer AI (Pilot/Strategy/Commander)

---

## 📖 What to read first

1. **Start here:** `IMPLEMENTATION_GUIDE_PARALLEL.md` (this is your main guide)
2. **Architecture:** `ARCHITECTURE.md` (understand the system design)
3. **Detailed plans:** 
   - `IMPLEMENTATION_PLAN_V2.md` (core, phases 0-7)
   - `IMPLEMENTATION_PLAN_V2.1_EXTENDED.md` (extended, phases 8-13)
   - `PHASE_14_PIANO.md` (Action Awareness - critical!)
   - `PHASE_15_ENHANCED_VISION.md` (full game state extraction)
   - `PHASE_16_TESTING.md` (testing strategy)

---

## 🚀 Recommended approach

### Option 1: Full parallel (fastest, 3-4 developers)
```
Developer 1: Track A (Foundation) → 3-4h
Developer 2: Track B (Bot Layers) → 5-6h (after Track A)
Developer 3: Track C (Extended Features) → 6-7h (after Track B basics)
Developer 4: Track D (Testing) → 2-3h (alongside all)
```

### Option 2: Sequential (safest, 1 developer)
```
Phase 1: Track A (Foundation) → 3-4h
Phase 2: Track B (Bot Layers) → 5-6h
Phase 3: Track C (Extended) → 6-7h
Phase 4: Track D (Testing) → 2-3h
```

### Option 3: MVP first (quickest to demo, recommended)
```
Phase 1: Track A (Foundation) → 3-4h
Phase 2: Track B (Bot Core only) → 3-4h
  - B1: Enhanced Vision
  - B2: Action Awareness
  - B3: Pilot
  - B6: Bot Core
Phase 3: Test basic survival → 30min
Phase 4: Add Strategy + Commander → 2-3h
Phase 5: Add extended features → 6-7h
Phase 6: Full testing → 2-3h
```

**I recommend Option 3 (MVP first)** - you can demo basic bot quickly, then iterate.

---

## 🎯 Critical components (must-have)

These are non-negotiable for a working bot:

1. **State Manager** (Track A) - thread-safe state storage
2. **Rate Limiter** (Track A) - prevent API overload (560 RPM limit)
3. **Enhanced Vision** (Track B) - extract game state
4. **Action Awareness** (Track B) - prevent hallucinations (PIANO technique)
5. **Pilot** (Track B) - fast reactions
6. **Bot Core** (Track B) - connect to Minecraft

With just these 6 components, bot can connect and survive.

---

## 📋 Implementation checklist

### Track A: Foundation
- [ ] `src/utils/state-manager.js` - file-based state with locking
- [ ] `src/utils/rate-limiter.js` - 560 RPM limit with retry
- [ ] `src/utils/logger.js` - structured logging (winston)
- [ ] `src/utils/omniroute.js` - API client with metrics
- [ ] Tests for all utilities

### Track B: Bot Layers
- [ ] `src/utils/vision-enhanced.js` - full game state extraction
- [ ] `src/layers/action-awareness.js` - verify action outcomes
- [ ] `src/layers/pilot.js` - adaptive loop (200ms-2s)
- [ ] `src/layers/strategy.js` - multi-step planning
- [ ] `src/layers/commander.js` - high-level goals
- [ ] `src/bot.js` - main bot entry point
- [ ] `src/index.js` - start all layers
- [ ] Tests for all layers

### Track C: Extended Features
- [ ] `src/memory/memory-store.js` - SQLite persistent memory
- [ ] `src/chat/chat-handler.js` - in-game chat commands
- [ ] `src/actions/crafting.js` - craft items
- [ ] `src/actions/building.js` - build structures
- [ ] `src/safety/safety-manager.js` - prevent griefing
- [ ] Tests for all features

### Track D: Testing & DevOps
- [ ] `tests/unit/` - all unit tests
- [ ] `tests/integration/` - layer communication tests
- [ ] `tests/e2e/` - full bot tests (requires Minecraft server)
- [ ] `tests/mocks/` - mock bot, API, server
- [ ] `.github/workflows/test.yml` - CI/CD pipeline
- [ ] Coverage >70%

---

## 🔧 Environment setup

### Prerequisites
```bash
# Node.js 18+
node --version

# Omniroute API running
curl http://127.0.0.1:20128/v1/models

# Docker (for Minecraft server)
docker --version
```

### Project setup
```bash
cd /home/seryki/.openclaw/workspace/minecraft-ai-bot

# Install dependencies
npm install mineflayer mineflayer-pathfinder mineflayer-collectblock \
  axios bottleneck winston dotenv lockfile express ws \
  sqlite3 minecraft-data vec3

# Dev dependencies
npm install --save-dev jest @types/node

# Create directories
mkdir -p src/{utils,layers,memory,chat,actions,safety} \
  tests/{unit,integration,e2e,mocks,fixtures} \
  state logs docker

# Copy .env
cp .env.example .env
# Edit .env with your settings
```

### Start Minecraft server (Docker)
```bash
cd docker
docker-compose up -d
# Wait for server to start (30-60s)
docker-compose logs -f minecraft | grep "Done"
```

---

## 💡 Key implementation notes

### 1. Action Awareness (PIANO) - CRITICAL
This prevents "hallucination compounding" - when bot hallucinates an action succeeded, then makes decisions based on false assumptions.

**How it works:**
1. Before action: predict expected outcome
2. Execute action
3. After action: observe actual outcome
4. Compare expected vs actual
5. If mismatch → signal error to Strategy

**Example:**
```javascript
// Pilot wants to dig stone
const expectedOutcome = { blockRemoved: true, itemsGained: [{ name: 'cobblestone' }] };
const result = await actionAwareness.executeWithVerification(
  { type: 'dig', blockType: 'stone' },
  expectedOutcome
);

if (!result.success) {
  // Action failed - don't assume we have cobblestone!
  logger.warn('Dig failed', { expected, actual: result.actual });
}
```

### 2. Rate Limiting - CRITICAL
Omniroute has 560 RPM limit. Bot uses:
- Pilot: ~120 req/min (every 500ms)
- Strategy: ~20 req/min (every 3s)
- Commander: ~6 req/min (every 10s)
- **Total: ~146 req/min** (well under limit)

Use `bottleneck` library to enforce this.

### 3. Adaptive Pilot Loop
Pilot adjusts speed based on threats:
- **Danger** (hostile mob, lava, low HP): 200ms loop
- **Active** (exploring, working): 500ms loop
- **Idle** (nothing happening): 2s loop

This saves API calls when bot is safe.

### 4. Memory Tiering
Different layers have different memory access:
- **Pilot:** Working Memory only (current state)
- **Strategy:** Working + Short-Term Memory (last few minutes)
- **Commander:** Full access (Working + STM + Long-Term Memory)

This prevents information overload.

### 5. State Communication
Layers communicate via JSON files:
- `state/current.json` - bot state (updated every 5s)
- `state/commands.json` - Commander → Strategy
- `state/plan.json` - Strategy → Pilot
- `state/progress.json` - progress tracking
- `state/action_error.json` - Pilot → Strategy errors

Use StateManager for thread-safe access.

---

## 🐛 Common pitfalls to avoid

1. **Don't skip Action Awareness** - this is critical for preventing hallucinations
2. **Don't ignore rate limits** - you'll get 429 errors
3. **Don't hardcode values** - use .env for configuration
4. **Don't forget error handling** - bot will crash without it
5. **Don't skip tests** - you'll regret it later
6. **Don't use synchronous file I/O** - use async/await
7. **Don't forget to close resources** - DB connections, file handles
8. **Don't assume actions succeed** - always verify with Action Awareness

---

## 🧪 Testing strategy

### Unit tests (fast, no external dependencies)
```bash
npm run test:unit
```
- Mock Mineflayer bot
- Mock Omniroute API
- Test individual components

### Integration tests (medium, uses real StateManager)
```bash
npm run test:integration
```
- Test layer communication
- Test state file flow
- Mock Minecraft server

### E2E tests (slow, requires real Minecraft server)
```bash
# Start Minecraft server first
cd docker && docker-compose up -d

# Run tests
npm run test:e2e
```
- Test basic survival (5 minutes)
- Test goal completion (collect wood)
- Test error recovery (death, stuck)

---

## 📊 Success metrics

Bot is working when:
- ✅ Connects to Minecraft server
- ✅ Survives >5 minutes without dying
- ✅ Completes simple goal (collect 10 oak logs)
- ✅ Responds to chat command (`!bot collect wood`)
- ✅ Avoids hazards (lava, mobs, falls)
- ✅ Recovers from errors (death, stuck)
- ✅ Action Awareness success rate >80%
- ✅ All tests passing
- ✅ Coverage >70%

---

## 🔗 Useful resources

**Mineflayer docs:** https://github.com/PrismarineJS/mineflayer  
**Minecraft data:** https://github.com/PrismarineJS/minecraft-data  
**Omniroute API:** http://127.0.0.1:20128/docs  
**PIANO paper:** https://arxiv.org/abs/2411.00114  

**Models (via Omniroute):**
- Pilot: `nvidia/meta/llama-3.2-1b-instruct` (210ms)
- Strategy: `nvidia/qwen/qwen2.5-7b-instruct` (410ms)
- Commander: `claude-sonnet-4.5` (~1s)

---

## 🎯 Your mission

Build a Minecraft bot that:
1. Connects to Minecraft server
2. Survives autonomously
3. Responds to voice commands (via Telegram)
4. Responds to in-game chat commands
5. Learns from experience (persistent memory)
6. Prevents hallucinations (Action Awareness)
7. Recovers from errors gracefully

**Start with MVP (Option 3)** - get basic bot working first, then add features.

Good luck! 🚀

---

**Questions?** Check the detailed plans in the repo. Everything is documented.

**Stuck?** Look at the implementation notes in each phase document.

**Need help?** Ask the user (Wojciech) - he's available on Telegram.
