# AGENTS.md - Minecraft AI Bot

**Status:** Planning complete, no implementation yet  
**Last updated:** 2026-04-14

---

## Project State

This is a **planning-only repository**. No source code exists yet - only comprehensive documentation (7000+ lines across 12 markdown files).

**What exists:**
- Architecture design (3-layer AI: Pilot/Strategy/Commander)
- Detailed implementation plans (16 phases, 17-21h estimated)
- Parallel development guide (4 independent tracks)
- Configuration templates (`.env.example`)

**What doesn't exist:**
- `src/` directory - no code written
- `tests/` directory - no tests
- `package.json` - dependencies not installed
- `state/`, `prompts/`, `voice/` directories - runtime structure not created

---

## Quick Start Commands

### First-time setup
```bash
# Install dependencies (creates package.json if missing)
npm init -y
npm install mineflayer mineflayer-pathfinder mineflayer-collectblock \
  axios bottleneck winston dotenv lockfile sqlite3 minecraft-data vec3

# Create directory structure
mkdir -p src/{utils,layers,memory,chat,actions,safety} \
  tests/{unit,integration,e2e,mocks} \
  state logs prompts voice docker

# Configure environment
cp .env.example .env
# Edit .env: set MINECRAFT_HOST, OMNIROUTE_URL, OMNIROUTE_API_KEY
```

### No test/build commands yet
The project has no `package.json` scripts defined. After implementation:
- Tests will use Jest
- No build step (plain Node.js)
- Run with: `node src/bot.js` or `node src/index.js`

---

## Architecture Overview

**3-layer AI system:**
```
Commander (Claude Sonnet 4.5, ~1s) → High-level goals, monitoring
    ↓
Strategy (Qwen 2.5 7B, 410ms) → Multi-step planning, pathfinding
    ↓
Pilot (Llama 3.2 1B, 210ms) → Fast reactions, hazard avoidance
    ↓
Mineflayer → Minecraft server connection
```

**Critical constraints:**
- Rate limit: 560 RPM (Omniroute API) - use 80% buffer (448 req/min)
- Pilot loop: 200ms-2s adaptive (faster when threats detected)
- Strategy loop: 2-5s
- Commander loop: 10-30s

**Key innovation - Action Awareness (PIANO):**
Every action must be verified before next decision. Prevents hallucination compounding where bot thinks it succeeded but actually failed.

---

## Implementation Approach

### Recommended: MVP-first (Option 3 from QUICK_START_PROMETHEUS.md)

**Phase 1: Foundation (3-4h)**
- State manager with file locking (`lockfile` library)
- Rate limiter (448 req/min with `bottleneck`)
- Logger (`winston` - console + file)
- Omniroute API client with retry logic

**Phase 2: Bot Core (3-4h)**
- Enhanced vision (extract full game state from Mineflayer)
- Action Awareness wrapper (verify every action outcome)
- Pilot layer only (no Strategy/Commander yet)
- Basic bot.js (connect, spawn, survive)

**Phase 3: Test survival (30min)**
- Bot connects and survives 5+ minutes
- Avoids lava, mobs, falls
- Responds to immediate threats

**Phase 4: Add planning layers (2-3h)**
- Strategy layer (multi-step plans)
- Commander layer (high-level goals)
- File-based communication (commands.json, plan.json)

**Phase 5: Extended features (6-7h)**
- Persistent memory (SQLite)
- In-game chat commands (`!bot collect wood`)
- Crafting/building actions
- Safety manager (prevent griefing)

**Phase 6: Testing (2-3h)**
- Unit tests (70% coverage target)
- Integration tests (layer communication)
- E2E tests (requires Minecraft server)

### Alternative: Parallel tracks (for teams)

See `IMPLEMENTATION_GUIDE_PARALLEL.md` for 4 independent development tracks that can run simultaneously with 3-4 developers.

---

## Critical Files to Read

**Start here:**
1. `QUICK_START_PROMETHEUS.md` - Implementation strategy
2. `IMPLEMENTATION_GUIDE_PARALLEL.md` - Detailed component specs
3. `ARCHITECTURE.md` - System design rationale

**Deep dives:**
4. `PHASE_14_PIANO.md` - Action Awareness technique (prevents hallucinations)
5. `PHASE_15_ENHANCED_VISION.md` - Full game state extraction
6. `PHASE_16_TESTING.md` - Testing strategy

**Reference:**
7. `IMPLEMENTATION_PLAN_V2.md` - Core phases 0-7
8. `IMPLEMENTATION_PLAN_V2.1_EXTENDED.md` - Extended phases 8-13

---

## Environment Configuration

**Required:**
- `MINECRAFT_HOST` / `MINECRAFT_PORT` - Server connection
- `OMNIROUTE_URL` - API endpoint (default: http://127.0.0.1:20128/v1/chat/completions)
- `OMNIROUTE_API_KEY` - API authentication

**Model selection:**
- `PILOT_MODEL=nvidia/meta/llama-3.2-1b-instruct` (210ms)
- `STRATEGY_MODEL=nvidia/qwen/qwen2.5-7b-instruct` (410ms)
- `COMMANDER_MODEL=claude-sonnet-4.5` (~1s)

**Loop intervals (milliseconds):**
- `PILOT_INTERVAL=500` (adaptive: 200-2000ms based on threats)
- `STRATEGY_INTERVAL=3000`
- `COMMANDER_INTERVAL=10000`

See `.env.example` for full configuration template.

---

## State Management

**File-based communication between layers:**
- `state/state.json` - Current bot state (vision output)
- `state/commands.json` - Commander → Strategy (high-level goals)
- `state/plan.json` - Strategy → Pilot (action sequences)
- `state/voice-command.txt` - Voice input (optional)
- `state/voice-response.txt` - Voice output (optional)

**Why files, not memory?**
- Commander runs as separate OpenClaw subagent (different process)
- Allows inspection/debugging (cat state.json)
- Enables manual intervention (echo '{"goal": "collect wood"}' > commands.json)

**Thread safety:**
Use `lockfile` library with 5s timeout. All reads/writes must acquire lock first.

---

## Dependencies

**Core:**
- `mineflayer` - Minecraft bot framework
- `mineflayer-pathfinder` - Navigation
- `mineflayer-collectblock` - Resource gathering
- `axios` - HTTP client (Omniroute API)
- `bottleneck` - Rate limiting
- `winston` - Logging
- `lockfile` - File locking
- `dotenv` - Environment variables

**Extended:**
- `sqlite3` - Persistent memory
- `express` + `ws` - Web UI (optional)
- `minecraft-data` - Game data
- `vec3` - Vector math

**Dev:**
- `jest` - Testing framework
- `@types/node` - TypeScript types (optional)

---

## Troubleshooting

### Bot won't connect
- Verify Minecraft server: `telnet $MINECRAFT_HOST $MINECRAFT_PORT`
- Check `.env` has correct host/port
- Ensure server allows offline-mode or bot has valid credentials

### LLM not responding
- Test Omniroute: `curl http://127.0.0.1:20128/v1/models`
- Check `OMNIROUTE_API_KEY` in `.env`
- Verify rate limiter isn't blocking (check logs)

### Bot stuck in loop
- Clear plan: `echo '[]' > state/plan.json`
- Reset goal: `echo '{"goal": null}' > state/commands.json`
- Check Action Awareness is verifying outcomes (see logs)

### Rate limit errors (429)
- Default limit: 448 req/min (80% of 560 RPM)
- Increase loop intervals in `.env` if hitting limit
- Check all 3 layers aren't running too fast

---

## Testing Strategy

**Unit tests (tests/unit/):**
- All utilities (state-manager, rate-limiter, logger, omniroute)
- Vision system (mock Mineflayer bot)
- Action Awareness (mock action outcomes)
- Each layer in isolation (mock dependencies)

**Integration tests (tests/integration/):**
- Layer communication (Pilot ↔ Strategy ↔ Commander)
- State file locking (concurrent access)
- Rate limiter under load

**E2E tests (tests/e2e/):**
- Full bot lifecycle (connect → spawn → survive → disconnect)
- Goal completion (collect wood, build house)
- Error recovery (death, stuck, disconnection)
- Requires running Minecraft server (use Docker)

**Coverage target:** 70% minimum

**Run tests:** `npm test` (after implementation)

---

## Voice Integration (Optional)

**Not implemented yet.** See `VOICE_OPTIONS.md` for 3 approaches:

1. **Telegram bot** (recommended) - easiest, works on headless server
2. **Discord bot** - similar to Telegram
3. **Local audio** - requires audio forwarding on headless server

Voice adds 3-4s latency (STT + processing + TTS), suitable for strategy commands but not combat.

---

## Known Limitations

- No visual perception (relies on Mineflayer's block/entity data)
- No internal drives (must be given goals explicitly)
- Rate limit prevents scaling to 1000s of bots
- Minecraft Java Edition only (Bedrock not supported by Mineflayer)
- Headless server requires Docker for Minecraft server

---

## Git Workflow

**Current state:** Planning branch, no implementation commits yet.

**Commit history shows:**
- 10 commits, all documentation
- Last commit: "Add project summary - planning complete, ready for implementation"
- No code changes, only markdown files

**When implementing:**
- Create feature branches per track (track-a-foundation, track-b-bot-core, etc.)
- Commit frequently with descriptive messages
- Test before merging to main
- Tag releases (v0.1-mvp, v0.2-strategy, v1.0-full)

---

## Performance Targets

| Layer | Model | Latency | Frequency | Purpose |
|-------|-------|---------|-----------|---------|
| Pilot | Llama 3.2 1B | 210ms | 2-5 Hz | Fast reactions |
| Strategy | Qwen 2.5 7B | 410ms | 0.2-0.5 Hz | Planning |
| Commander | Claude Sonnet 4.5 | ~1s | 0.03-0.1 Hz | Monitoring |

**Adaptive Pilot loop:**
- Normal: 500ms (2 Hz)
- Threat detected: 200ms (5 Hz)
- Idle/safe: 2000ms (0.5 Hz)

---

## Success Criteria

Bot is complete when:
- ✅ Connects to Minecraft server
- ✅ Survives >5 minutes in survival mode
- ✅ Completes goals (collect 64 oak logs)
- ✅ Responds to chat commands (`!bot collect wood`)
- ✅ Avoids hazards (lava, mobs, falls)
- ✅ Recovers from errors (death, stuck, disconnection)
- ✅ Action Awareness prevents hallucination loops
- ✅ All tests passing (70% coverage)

---

## External Resources

**Mineflayer docs:** https://github.com/PrismarineJS/mineflayer  
**Omniroute API:** https://omniroute.koperski.tech  
**PIANO paper:** Project Sid (Altera.AI) - concurrent modules with cognitive controller

---

**Next step:** Run setup commands above, then follow `QUICK_START_PROMETHEUS.md` for implementation.
