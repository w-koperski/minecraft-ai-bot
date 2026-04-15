# AGENTS.md - Minecraft AI Bot

**Status:** MVP implemented, tests passing (129/129)  
**Last updated:** 2026-04-15

---

## Project State

**Implemented (9400+ lines):**
- 3-layer AI system (Pilot/Strategy/Commander)
- Core utilities (state-manager, rate-limiter, omniroute client, logger)
- Action Awareness (PIANO-inspired verification)
- Enhanced vision system
- Extended features (memory, chat, safety, crafting, building)
- Test suite (unit, integration, e2e) - 70% coverage target

**Not implemented:**
- Voice integration (see `VOICE_OPTIONS.md`)
- Prompts directory (LLM prompts are inline in layer files)

---

## Quick Start

### Setup
```bash
npm install
cp .env.example .env
# Edit .env: set MINECRAFT_HOST, OMNIROUTE_URL, OMNIROUTE_API_KEY
```

### Run bot
```bash
node src/index.js    # Full 3-layer system
node src/bot.js      # Standalone (no layers)
```

### Test commands
```bash
npm test                    # Unit + integration (excludes e2e)
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only
npm run test:e2e            # E2E tests (requires Minecraft server)
npm run test:coverage       # With coverage report
```

### Minecraft server (for e2e tests)
```bash
npm run mc:start     # Start Docker container
npm run mc:stop      # Stop and remove container
npm run mc:restart   # Restart container
```

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

## Code Structure

```
src/
├── index.js              # Main orchestrator (all 3 layers)
├── bot.js                # Standalone bot (no AI layers)
├── layers/
│   ├── pilot.js          # Fast reactions (200-2000ms adaptive)
│   ├── strategy.js       # Multi-step planning
│   ├── commander.js      # High-level monitoring
│   └── action-awareness.js  # PIANO verification wrapper
├── utils/
│   ├── state-manager.js  # File locking with lockfile
│   ├── omniroute.js      # LLM API client
│   ├── rate-limiter.js   # Bottleneck wrapper
│   ├── logger.js         # Winston logger
│   ├── vision-enhanced.js # Game state extraction
│   ├── schemas.js        # JSON validation
│   └── errors.js         # Custom error types
├── actions/
│   ├── crafting.js       # Recipe execution
│   └── building.js       # Structure placement
├── memory/
│   └── memory-store.js   # SQLite persistence
├── chat/
│   └── chat-handler.js   # In-game commands
└── safety/
    └── safety-manager.js # Griefing prevention

tests/
├── unit/                 # Isolated component tests
├── integration/          # Layer communication tests
├── e2e/                  # Full bot lifecycle tests
├── mocks/                # Test doubles
└── helpers/              # Test utilities
```

---

## Key Implementation Details

### State Management
- **File-based** communication between layers (not in-memory)
- Uses `lockfile` library with 5s timeout for thread safety
- State files: `state/state.json`, `state/commands.json`, `state/plan.json`
- Why files? Commander runs as separate process, allows manual inspection/intervention

### Action Awareness (src/layers/action-awareness.js)
- Wraps every bot action with outcome verification
- Compares expected vs actual state changes
- Logs mismatches to prevent hallucination loops
- Critical for preventing "bot thinks it succeeded but didn't" failures

### Adaptive Pilot Loop (src/layers/pilot.js)
- **Danger mode (200ms):** Hostile mobs <16 blocks, lava <8 blocks, health <6
- **Active mode (500ms):** Executing actions from plan
- **Idle mode (2000ms):** No threats, no actions
- Stuck detection: <0.1 block movement for 10s triggers intervention

### Rate Limiting
- Omniroute API: 560 RPM hard limit
- Bot uses 448 RPM (80% buffer) via `bottleneck` library
- Shared limiter across all 3 layers to prevent 429 errors

---

## Testing Strategy

**Unit tests (tests/unit/):**
- All utilities in isolation with mocks
- 129 tests passing, 70% coverage target
- Run: `npm run test:unit`

**Integration tests (tests/integration/):**
- Layer communication via state files
- File locking under concurrent access
- Run: `npm run test:integration`

**E2E tests (tests/e2e/):**
- Requires Minecraft server (Docker: `npm run mc:start`)
- Full bot lifecycle: connect → spawn → survive → disconnect
- Goal completion, error recovery, chat commands
- Run: `npm run test:e2e` (30s timeout per test)
- **Important:** E2E tests run sequentially (`maxWorkers: 1`) to avoid server conflicts

### Test quirks
- E2E tests use `forceExit: true` and `detectOpenHandles: false` (Mineflayer keeps connections)
- E2E has retry logic (`retryTimes: 2`) for network flakiness
- Coverage only runs on unit+integration, not e2e
- Default `npm test` excludes e2e tests (use `npm run test:e2e` explicitly)

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
- `minecraft-data` - Game data
- `vec3` - Vector math

**Dev:**
- `jest` - Testing framework
- `jest-junit` - JUnit XML reporter
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

**Current state:** MVP implementation complete (commit ac6d955)

**Recent commits:**
- `ac6d955` - Complete MVP implementation (all layers, tests passing)
- `f4fe71a` - Add Pilot layer with adaptive loop
- Earlier commits: Planning and documentation

**Branch strategy:**
- Main branch has working MVP
- Create feature branches for new features
- Test before merging
- Tag releases (v0.1-mvp, v0.2-strategy, v1.0-full)

---

## Performance Targets

| Layer | Model | Latency | Frequency | Purpose |
|-------|-------|---------|-----------|---------|
| Pilot | Llama 3.2 1B | 210ms | 2-5 Hz | Fast reactions |
| Strategy | Qwen 2.5 7B | 410ms | 0.2-0.5 Hz | Planning |
| Commander | Claude Sonnet 4.5 | ~1s | 0.03-0.1 Hz | Monitoring |

**Adaptive Pilot loop:**
- Danger: 200ms (5 Hz) - hostile mobs, lava, low health
- Active: 500ms (2 Hz) - executing actions
- Idle: 2000ms (0.5 Hz) - no threats, no actions

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

**Next steps:** 
- Run `npm test` to verify all tests pass
- Start Minecraft server: `npm run mc:start`
- Run bot: `node src/index.js`
- See planning docs for future enhancements
