# AGENTS.md - Minecraft AI Bot

**Status:** Companion bot complete, tests passing (all unit/integration)  
**Last updated:** 2026-04-15

---

## Quick Commands

```bash
# Setup
npm install && cp .env.example .env
# Edit .env: MINECRAFT_HOST, MINECRAFT_PORT, LLM_API_URL, LLM_API_KEY

# Run
node src/index.js              # Full 3-layer system + companion features
node src/bot.js                # Standalone (no AI layers)

# Test (order matters for coverage)
npm test                       # Unit + integration (excludes e2e)
npm run test:unit              # Unit only
npm run test:integration       # Integration only
npm run test:coverage          # With coverage report (70% target)
npm run test:e2e               # E2E (needs Minecraft server)
npm run test:all               # All tests sequentially

# Minecraft server (Docker, for e2e tests)
npm run mc:start               # Start container
npm run mc:stop                # Stop and remove
npm run mc:restart             # Restart

# Set goals (file-based commands)
echo '{"goal": "collect 64 oak logs"}' > state/commands.json
echo '[]' > state/plan.json    # Clear plan if stuck
```

---

## Architecture

**3-layer AI system:**
```
Commander (Reasoning model, ~1s) → High-level goals
↓
Strategy (Planning model, ~400ms) → Multi-step planning
↓
Pilot (Fast model, ~200ms) → Fast reactions
    ↓
Mineflayer → Minecraft actions
```

**Rate limits:**
- API Rate Limits: Check your provider's limits
- Bot uses rate limiting via `bottleneck` library (configure based on your provider)
- Shared limiter across all 3 layers

**Adaptive Pilot loop:**
- Danger: 200ms (hostile mobs <16 blocks, lava <8 blocks, health <6)
- Active: 500ms (executing actions)
- Idle: 2000ms (no threats, no actions)

**Action Awareness (PIANO):**
Wraps every bot action with outcome verification. Prevents "bot thinks it succeeded but didn't" failures.

**PIANO Architecture (Companion Modules):**
Four-module system for personality-driven companion behavior:

```
CognitiveController (cognitive-controller.js)
├── Receives inputs from all modules (personality, emotion, social, goals)
├── Synthesizes unified decision via priority rules
└── Broadcasts coherent behavior to all modules

EmotionDetector (emotion-detector.js)
├── Uses transformers.js with MicahB/emotion_text_classifier
├── 13 emotion classes: joy, sadness, anger, fear, etc.
├── P99 latency <50ms, confidence threshold 0.7
└── Lazy-loaded pipeline (initialized on first use)

SocialAwareness (social-awareness.js)
├── BDI model: Beliefs, Desires, Intentions per player
├── Sentiment tracking with trend analysis
├── Intention inference from message + context
└── Integrates with EmotionDetector for emotion context

KnowledgeGraph (knowledge-graph.js)
├── Graph storage with graphology + temporal validity
├── LRU eviction (max 10,000 nodes)
├── Memory types: spatial, temporal, episodic, semantic
├── Auto-consolidation every 10 minutes (when enabled)
└── P99 latency <10ms
```

**Robustness Modules (Project Sid Implementation):**

```
ActionAwareness (layers/action-awareness.js)
├── Confidence scoring (0.0-1.0) for every action
├── Multi-step verification at 100ms/500ms/1000ms
├── Fallback strategies based on confidence thresholds
├── Failure pattern detection with intervention triggers
└── Dependencies: Used by Skill Executor for retry decisions

DangerPredictor (safety/danger-predictor.js)
├── Spatial danger tracking with 20-block radius
├── 7-day half-life decay for danger levels
├── Integration with Strategy and Goal Scorer
├── Mark zones on death/damage events
└── Dependencies: Required by Goal Scorer for danger penalties

SkillRegistry (skills/skill-registry.js)
├── Map-based O(1) skill lookup
├── 5 primitive skills: move, dig, place, craft, collect
├── 5 composite skills: gatherWood, mineStone, craftTools, buildShelter, huntFood
├── Auto-registration on startup
└── Dependencies: Used by Skill Executor

SkillExecutor (skills/skill-executor.js)
├── Retry logic with up to 3 attempts
├── Confidence threshold filtering
├── Step tracking for debugging
├── Fallback to direct action execution
└── Dependencies: Requires Action Awareness for confidence scoring

ItemTracker (metrics/item-tracker.js)
├── Item acquisition logging with timestamps
├── Milestone detection (Stone Age, Iron Age, etc.)
├── Items/hour rate calculation
└── Dependencies: Used by Reflection Module for analysis

ReflectionModule (learning/reflection-module.js)
├── 30-minute cycle timer
├── Performance analysis and success rate calculation
├── Failure pattern analysis from Action Awareness
├── Generates learnings and parameter adjustments
└── Dependencies: Requires Failure Detection and Skill Executor data

GoalGraph (goals/goal-graph.js)
├── Hierarchical goal relationships
├── Graph-based dependency tracking
└── Dependencies: Used by Goal Generator

GoalScorer (goals/goal-scorer.js)
├── Multi-factor scoring: danger, feasibility, importance, personality
├── Danger prediction integration (0-50% penalty)
├── Resource availability check
└── Dependencies: Requires Danger Predictor for danger scoring

GoalGenerator (goals/goal-generator.js)
├── Context-aware goal generation
├── Integration with Commander for autonomous mode
├── Player goal priority enforcement
└── Dependencies: Requires Goal Graph and Goal Scorer

BenchmarkSuite (metrics/benchmark-suite.js)
├── 5 metrics: action success rate, items/hour, memory, reflection latency, goal latency
├── Project Sid comparison data
├── JSON report generation
└── Run: node scripts/run-benchmarks.js
```

**Priority Rules (Cognitive Controller):
1. **Danger (Pilot)** - immediate survival threats (always wins)
2. **Social (Strategy)** - player interactions, emotions
3. **Goals (Commander)** - long-term objectives

---

## Code Structure

```
src/
├── index.js                 # Full 3-layer system + companion features
├── bot.js                   # Standalone (no AI layers)
├── layers/
│   ├── pilot.js             # Fast reactions (adaptive 200-2000ms)
│   ├── strategy.js          # Multi-step planning
│   ├── commander.js         # High-level monitoring
│   ├── cognitive-controller.js  # PIANO decision synthesis
│   └── action-awareness.js  # PIANO verification + confidence scoring
├── emotion/
│   └── emotion-detector.js  # Emotion classification
├── social/
│   └── social-awareness.js # Player BDI model
├── memory/
│   ├── knowledge-graph.js  # Memory with temporal validity
│   ├── conversation-store.js # SQLite conversation storage
│   └── memory-store.js     # Memory persistence
├── skills/
│   ├── skill-registry.js    # O(1) skill lookup
│   ├── skill-executor.js    # Retry logic with confidence filtering
│   ├── primitives/          # 5 primitive skills
│   │   ├── move.js
│   │   ├── dig.js
│   │   ├── place.js
│   │   ├── craft.js
│   │   └── collect.js
│   └── composite/           # 5 composite skills
│       ├── gather-wood.js
│       ├── mine-stone.js
│       ├── craft-tools.js
│       ├── build-shelter.js
│       └── hunt-food.js
├── safety/
│   ├── danger-predictor.js  # Spatial danger tracking
│   └── safety-manager.js    # Safety policy enforcement
├── goals/
│   ├── goal-graph.js        # Hierarchical goal relationships
│   ├── goal-scorer.js       # Multi-factor goal scoring
│   └── goal-generator.js    # Context-aware goal generation
├── learning/
│   └── reflection-module.js # 30-min performance analysis
├── metrics/
│   ├── item-tracker.js      # Item acquisition tracking
│   └── benchmark-suite.js   # 5-metric performance tracking
├── utils/
│   ├── state-manager.js     # File locking (lockfile, 5s timeout)
│ ├── api-client.js # LLM API client
│ ├── rate-limiter.js # Bottleneck wrapper
│   └── logger.js            # Winston logger
├── chat/
│   └── chat-handler.js      # In-game commands
└── personality/
    └── personality-engine.js # Trait system

personality/
└── Soul.md                  # Personality configuration

state/
├── state.json               # Current bot state
├── commands.json            # Commander → Strategy
├── plan.json                # Strategy → Pilot
└── memory.db                # SQLite database

tests/
├── unit/                    # Component tests (mocks)
├── integration/             # Layer communication
├── e2e/                     # Full lifecycle (needs server)
└── helpers/                 # Test utilities

scripts/
└── run-benchmarks.js        # Benchmark runner
```
src/
├── index.js # Full 3-layer system + companion features
├── bot.js # Standalone (no AI layers)
├── layers/
│   ├── pilot.js # Fast reactions (adaptive 200-2000ms)
│   ├── strategy.js # Multi-step planning
│   ├── commander.js # High-level monitoring
│   ├── cognitive-controller.js # PIANO decision synthesis
│   └── action-awareness.js # PIANO verification
├── emotion/
│   └── emotion-detector.js # Emotion classification
├── social/
│   └── social-awareness.js # Player BDI model
├── memory/
│   └── knowledge-graph.js # Memory with temporal validity
├── utils/
│   ├── state-manager.js  # File locking (lockfile, 5s timeout)
│ ├── api-client.js # LLM API client
│ ├── rate-limiter.js # Bottleneck wrapper
│   └── logger.js         # Winston logger
├── memory/
│   └── memory-store.js   # SQLite conversation storage
├── chat/
│   └── chat-handler.js   # In-game commands
└── personality/
    └── personality-engine.js  # Trait system

personality/
└── Soul.md               # Personality configuration

state/
├── state.json            # Current bot state
├── commands.json         # Commander → Strategy
├── plan.json             # Strategy → Pilot
└── memory.db             # SQLite database

tests/
├── unit/                 # Component tests (mocks)
├── integration/          # Layer communication
├── e2e/                  # Full lifecycle (needs server)
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
- **Confidence scoring:** Calculates 0.0-1.0 score based on tool, distance, health, hazards
- **Multi-step verification:** Checks at 100ms, 500ms, 1000ms intervals
- **Fallback strategies:** Abort (<0.3), retry different (0.3-0.5), caution (0.5-0.7), proceed (>0.7)
- **Failure pattern detection:** Analyzes history for stuck patterns, tool failures, path errors
- Logs mismatches to prevent hallucination loops
- Critical for preventing "bot thinks it succeeded but didn't" failures

### Adaptive Pilot Loop (src/layers/pilot.js)
- **Danger mode (200ms):** Hostile mobs <16 blocks, lava <8 blocks, health <6
- **Active mode (500ms):** Executing actions from plan
- **Idle mode (2000ms):** No threats, no actions
- Stuck detection: <0.1 block movement for 10s triggers intervention

### Danger Prediction (src/safety/danger-predictor.js)
- Marks 20-block radius zones on death/damage events
- 7-day half-life decay: level = 1.0 * (0.5 ^ (days/7))
- Returns danger level 0.0-1.0 for any position
- Integrates with Goal Scorer (0-50% penalty) and Strategy layer
- Danger threshold: 0.3 (positions above this are dangerous)

### Knowledge Graph Consolidation (src/memory/knowledge-graph.js)
- Auto-consolidation timer in index.js: every 10 minutes
- STM to Episodic: Compresses recent memories
- Episodic to LTM: Moves important patterns to long-term
- LRU eviction at 10,000 nodes
- P99 latency: 7ms per 1000 nodes (benchmarked)

### Skill System (src/skills/)
- **Registry:** Map-based O(1) lookup, auto-registration on startup
- **Primitives:** move, dig, place, craft, collect
- **Composites:** gatherWood, mineStone, craftTools, buildShelter, huntFood
- **Executor:** Up to 3 retry attempts, confidence threshold filtering
- **Integration:** Skill Executor uses Action Awareness for confidence

### Reflection Module (src/learning/reflection-module.js)
- Timer: Every 30 minutes in index.js
- Analyzes: Action success rate, failure patterns, item progression
- Generates: Learnings and parameter adjustments
- Stores: Results in knowledge graph and logs/reflections.log
- Target latency: <5s (achieved: 6ms)

### Goal Generation (src/goals/)
- **Graph:** Hierarchical goal relationships with dependency tracking
- **Scorer:** Multi-factor scoring (danger, feasibility, importance, personality)
- **Generator:** Context-aware, integrates with Commander for autonomous mode
- **Safety:** Player goals always take priority over autonomous goals
- Target latency: <1s (achieved: 1ms)

### Rate Limiting
- API Rate Limits: Check your provider's limits
- Bot uses rate limiting via `bottleneck` library (configure based on your provider)
- Shared limiter across all 3 layers to prevent 429 errors
- New features add ~1.033 RPM (within budget)

---

## Testing Strategy

**Unit tests (tests/unit/):**
- All utilities in isolation with mocks
- 70% coverage target
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
- `LLM_API_URL` - API endpoint (default: http://127.0.0.1:20128/v1/chat/completions)
- `LLM_API_KEY` - API authentication

**Model selection:**
- `PILOT_MODEL` - Fast model (~200ms, 1-3B parameters recommended)
- `STRATEGY_MODEL` - Planning model (~400ms, 7-14B parameters recommended)
- `COMMANDER_MODEL` - Reasoning model (~1s, large model recommended)

**Loop intervals (milliseconds):**
- `PILOT_INTERVAL=500` (adaptive: 200-2000ms based on threats)
- `STRATEGY_INTERVAL=3000`
- `COMMANDER_INTERVAL=10000`

**Feature Flags (all default to true):**
- `ENABLE_CONFIDENCE_SCORING` - Action confidence scoring
- `ENABLE_AUTO_CONSOLIDATION` - Memory auto-consolidation
- `ENABLE_DANGER_PREDICTION` - Spatial danger tracking
- `ENABLE_FAILURE_DETECTION` - Pattern detection
- `ENABLE_SKILL_SYSTEM` - Skill registry and executor
- `ENABLE_ITEM_TRACKER` - Item progression tracking
- `ENABLE_REFLECTION` - Performance reflection
- `ENABLE_AUTONOMOUS_GOALS` - Autonomous goal generation

**Performance Thresholds:**
- `ACTION_SUCCESS_RATE_MIN=0.80` - Disable features below this
- `CONSOLIDATION_TIME_MAX_MS=100` - Max consolidation time
- `REFLECTION_TIME_MAX_MS=5000` - Max reflection time
- `DANGER_DECAY_HALF_LIFE_DAYS=7` - Danger zone decay
- `DANGER_ZONE_RADIUS_BLOCKS=20` - Danger zone radius

See `.env.example` for full configuration template.

---

## Dependencies

**Core:**
- `mineflayer` - Minecraft bot framework
- `mineflayer-pathfinder` - Navigation
- `mineflayer-collectblock` - Resource gathering
- `axios` - HTTP client (LLM API)
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
- Test API endpoint: `curl $LLM_API_URL/v1/models`
- Check `LLM_API_KEY` in `.env`
- Verify rate limiter isn't blocking (check logs)

### Bot stuck in loop
- Clear plan: `echo '[]' > state/plan.json`
- Reset goal: `echo '{"goal": null}' > state/commands.json`
- Check Action Awareness is verifying outcomes (see logs)

### Rate limit errors (429)
- API Rate Limits: Check your provider's limits
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
- Emotion detector has 30% test coverage (dynamic imports, model loading)
- Validation test file in `.sisyphus/evidence/` causes Jest worker crash

---

## Git Workflow

**Current state:** MVP implementation complete (commit ac6d955)

**Recent commits:**
- `7584799` - Complete companion bot transformation
- `ac6d955` - Complete MVP implementation (all layers, tests passing)
- `f4fe71a` - Add Pilot layer with adaptive loop

**Branch strategy:**
- Main branch has working MVP
- Create feature branches for new features
- Test before merging
- Tag releases (v0.1-mvp, v0.2-strategy, v1.0-full)

---

## Performance Targets

| Layer | Model | Latency | Frequency | Purpose |
|-------|-------|---------|-----------|---------|
| Pilot | Fast model (~200ms) | 210ms | 2-5 Hz | Fast reactions |
| Strategy | Planning model (~400ms) | 410ms | 0.2-0.5 Hz | Planning |
| Commander | Reasoning model (~1s) | ~1s | 0.03-0.1 Hz | Monitoring |

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
**PIANO paper:** Project Sid (Altera.AI) - concurrent modules with cognitive controller

---

**Next steps:** 
- Run `npm test` to verify all tests pass
- Start Minecraft server: `npm run mc:start`
- Run bot: `node src/index.js`
- See planning docs for future enhancements
