# Minecraft AI Bot - Parallel Implementation Guide

## 🎯 Project Overview

**Goal:** Build a 3-layer AI-powered Minecraft bot that can play autonomously, respond to voice commands, and interact via in-game chat.

**Architecture:** Pilot (fast reactions) → Strategy (planning) → Commander (high-level goals)

**Tech Stack:**
- Node.js 18+
- Mineflayer (Minecraft bot framework)
- Omniroute API (LLM inference)
- SQLite (persistent memory)
- Docker (Minecraft server)

**Key Innovations:**
- Action Awareness (PIANO) - prevents hallucination compounding
- Enhanced Vision - maximum information extraction from game
- Memory tiering - different layers have different memory access
- Adaptive loop - pilot speed adjusts based on threats

---

## 📦 Parallel Implementation Tracks

The project is divided into 4 parallel tracks that can be developed simultaneously:

### Track A: Core Infrastructure (Foundation)
**Dependencies:** None  
**Time:** 3-4h  
**Team size:** 1-2 developers

### Track B: Bot Layers (AI Logic)
**Dependencies:** Track A (state management, logging)  
**Time:** 5-6h  
**Team size:** 2-3 developers

### Track C: Extended Features (Enhancements)
**Dependencies:** Track A, Track B (basic bot working)  
**Time:** 6-7h  
**Team size:** 2-3 developers

### Track D: Testing & DevOps (Quality)
**Dependencies:** Track A, Track B (code to test)  
**Time:** 2-3h  
**Team size:** 1-2 developers

---

## 🔧 Track A: Core Infrastructure

### Context
This track builds the foundational utilities that all other components depend on. These are stateless, reusable modules that handle cross-cutting concerns.

### Components

#### A1: State Manager (`src/utils/state-manager.js`)
**Purpose:** Thread-safe file-based state storage with locking

**Requirements:**
- Read/write JSON files atomically
- File locking to prevent race conditions
- Support for concurrent access from multiple layers
- Graceful error handling

**Key APIs:**
```javascript
async read(key: string): Promise<object | null>
async write(key: string, data: object): Promise<void>
```

**Implementation notes:**
- Use `lockfile` library for file locking
- Lock timeout: 5 seconds
- Store files in `state/` directory
- Each key = separate JSON file

**Test cases:**
- Concurrent writes don't corrupt data
- Returns null for non-existent keys
- Handles lock timeout gracefully

---

#### A2: Rate Limiter (`src/utils/rate-limiter.js`)
**Purpose:** Prevent exceeding Omniroute API rate limits (560 RPM)

**Requirements:**
- Limit: 560 requests/minute with 80% buffer (448 req/min)
- Exponential backoff on 429 errors
- Queue requests when limit reached
- Retry failed requests with backoff

**Key APIs:**
```javascript
async schedule(fn: Function): Promise<any>
```

**Implementation notes:**
- Use `bottleneck` library
- Reservoir: 448 requests
- Refresh interval: 60 seconds
- Min time between requests: ~134ms
- Retry on 429 with `Retry-After` header

**Test cases:**
- Respects rate limit (no more than 448 req/min)
- Retries on 429 errors
- Queues requests when limit reached

---

#### A3: Logger (`src/utils/logger.js`)
**Purpose:** Structured logging with multiple transports

**Requirements:**
- Log levels: error, warn, info, debug
- Console output (colorized)
- File output (logs/bot.log, logs/error.log)
- JSON format for parsing
- Timestamp on every log

**Key APIs:**
```javascript
logger.info(message: string, meta?: object)
logger.error(message: string, meta?: object)
logger.warn(message: string, meta?: object)
logger.debug(message: string, meta?: object)
```

**Implementation notes:**
- Use `winston` library
- Console: colorized simple format
- File: JSON format with timestamps
- Rotate logs daily (optional)

**Test cases:**
- Logs to console and file
- Includes metadata in JSON
- Respects log level

---

#### A4: Omniroute Client (`src/utils/omniroute.js`)
**Purpose:** Wrapper for Omniroute API with retry logic and metrics

**Requirements:**
- Call Omniroute API with rate limiting
- Retry on network errors (3 attempts)
- Track metrics (requests, errors, latency)
- Timeout: 10 seconds per request

**Key APIs:**
```javascript
async call(model: string, messages: array, options?: object): Promise<string | null>
getMetrics(): object
```

**Implementation notes:**
- Use axios for HTTP
- Integrate with RateLimiter
- Extract JSON from markdown code blocks
- Return null on error (don't throw)

**Test cases:**
- Successful API call returns content
- Retries on network error
- Respects timeout
- Tracks metrics correctly

---

### Deliverables (Track A)
- [ ] `src/utils/state-manager.js` + tests
- [ ] `src/utils/rate-limiter.js` + tests
- [ ] `src/utils/logger.js` + tests
- [ ] `src/utils/omniroute.js` + tests
- [ ] All tests passing
- [ ] Documentation in code comments

---

## 🤖 Track B: Bot Layers

### Context
This track implements the 3-layer AI architecture. Each layer has different responsibilities and operates at different time scales.

**Layer hierarchy:**
- Commander (slow, 10-30s) → high-level goals
- Strategy (medium, 2-5s) → multi-step planning
- Pilot (fast, 200-500ms) → action execution

**Communication:** Layers communicate via state files (managed by StateManager)

### Components

#### B1: Enhanced Vision (`src/utils/vision-enhanced.js`)
**Purpose:** Extract maximum information from Minecraft game state

**Requirements:**
- Extract bot state (position, health, inventory, equipment)
- Extract environment (nearby blocks, mobs, players, items)
- Extract social state (chat history, player actions, teams)
- Extract perception (sounds, block changes, what bot sees)
- Track chat messages (last 100)
- Track player actions (swing, hurt, death)
- Track block changes (last 50)
- Track sound events (last 20)

**Key APIs:**
```javascript
extractFullState(): object
getChatContext(limit: number): string
getRecentEvents(seconds: number): object
```

**Implementation notes:**
- Listen to all Mineflayer events
- Store chat/events in circular buffers
- Detect threats (hostile mobs, lava, low health)
- Calculate distances for nearby entities
- Format state for LLM consumption (JSON)

**Test cases:**
- Extracts complete state
- Tracks chat messages
- Detects threats correctly
- Limits buffer sizes

---

#### B2: Action Awareness (`src/layers/action-awareness.js`)
**Purpose:** Verify action outcomes to prevent hallucination compounding (PIANO technique)

**Requirements:**
- Execute action and observe outcome
- Compare expected vs actual outcome
- Detect mismatches (hallucinations)
- Track action history (last 50)
- Calculate success rate
- Signal errors to Strategy

**Key APIs:**
```javascript
async executeWithVerification(action: object, expectedOutcome: object): Promise<object>
getSuccessRate(): number
getRecentFailures(limit: number): array
```

**Implementation notes:**
- Capture state before/after action
- Wait 500ms for state to update
- Compare outcomes using heuristics
- Write errors to `state/action_error.json`
- Track history for debugging

**Test cases:**
- Detects successful actions
- Detects failed actions
- Tracks history correctly
- Calculates success rate

---

#### B3: Pilot (`src/layers/pilot.js`)
**Purpose:** Fast reactive layer - executes actions and avoids immediate threats

**Requirements:**
- Adaptive loop: 200ms (danger), 500ms (active), 2s (idle)
- Hardcoded emergency reactions (lava, low HP)
- LLM decisions for normal situations
- Execute actions via Mineflayer
- Use Action Awareness for verification
- Escalate to Strategy on repeated failures

**Key APIs:**
```javascript
start(): void
stop(): void
```

**Implementation notes:**
- Model: `nvidia/meta/llama-3.2-1b-instruct` (210ms)
- Prompt: few-shot examples, JSON-only output
- Emergency reactions bypass LLM
- Adjust interval based on threats
- Write errors to state for Strategy

**Test cases:**
- Adjusts interval based on threats
- Executes emergency reactions
- Calls LLM for normal decisions
- Escalates on repeated failures

---

#### B4: Strategy (`src/layers/strategy.js`)
**Purpose:** Planning layer - decomposes goals into action sequences

**Requirements:**
- Read goal from `state/commands.json`
- Generate 3-5 step plan
- Learn from history (last 10 attempts)
- Detect stuck situations (no progress >30s)
- Handle action errors from Pilot
- Generate alternatives when actions fail

**Key APIs:**
```javascript
start(): void
stop(): void
```

**Implementation notes:**
- Model: `nvidia/qwen/qwen2.5-7b-instruct` (410ms)
- Loop: every 3 seconds
- Prompt: include history, Minecraft knowledge
- Write plan to `state/plan.json`
- Update progress in `state/progress.json`

**Test cases:**
- Generates valid plans
- Learns from history
- Detects stuck situations
- Handles Pilot errors

---

#### B5: Commander (`src/layers/commander.js`)
**Purpose:** High-level layer - monitors bot and issues goals

**Requirements:**
- Read state from `state/current.json`
- Read progress from `state/progress.json`
- Decide: continue, change goal, or intervene
- Handle voice commands (via OpenClaw)
- Reset context on error cascade
- Generate safe goals after errors

**Key APIs:**
```javascript
start(): void
stop(): void
```

**Implementation notes:**
- Model: `claude-sonnet-4.5` (via Omniroute)
- Loop: every 10 seconds
- Prompt: include state, progress, chat context
- Write commands to `state/commands.json`
- Broadcast decisions to all layers

**Test cases:**
- Makes correct decisions
- Handles voice commands
- Resets on error cascade
- Generates safe goals

---

#### B6: Bot Core (`src/bot.js`)
**Purpose:** Main bot entry point - connects to Minecraft and starts layers

**Requirements:**
- Connect to Minecraft server
- Load Mineflayer plugins (pathfinder)
- Initialize Enhanced Vision
- Setup event handlers (death, kick, error)
- Save state periodically (every 5s)
- Graceful shutdown

**Key APIs:**
```javascript
async start(): Promise<void>
async stop(): Promise<void>
```

**Implementation notes:**
- Read config from `.env`
- Timeout: 30s for connection
- Auto-respawn on death
- Log all events

**Test cases:**
- Connects successfully
- Handles death/respawn
- Saves state periodically
- Graceful shutdown

---

### Deliverables (Track B)
- [ ] `src/utils/vision-enhanced.js` + tests
- [ ] `src/layers/action-awareness.js` + tests
- [ ] `src/layers/pilot.js` + tests
- [ ] `src/layers/strategy.js` + tests
- [ ] `src/layers/commander.js` + tests
- [ ] `src/bot.js` + tests
- [ ] `src/index.js` (main entry point)
- [ ] All layers communicate correctly
- [ ] Bot can connect and survive

---

## 🎨 Track C: Extended Features

### Context
This track adds advanced features that enhance bot capabilities but are not critical for basic operation.

### Components

#### C1: Memory System (`src/memory/memory-store.js`)
**Purpose:** Persistent memory across sessions (SQLite)

**Requirements:**
- 4 memory types: semantic, episodic, spatial, skill
- Semantic: facts about world (key-value with confidence)
- Episodic: events that happened (timeline)
- Spatial: locations and POIs (positions with metadata)
- Skill: learned behaviors (success/failure counts)

**Key APIs:**
```javascript
async remember(key, value, confidence): Promise<void>
async recall(key): Promise<object | null>
async recordEvent(type, description, position, outcome): Promise<void>
async savePOI(name, type, position, description): Promise<void>
async findNearestPOI(position, type): Promise<object | null>
```

**Implementation notes:**
- Use `sqlite3` library
- Database: `state/memory.db`
- Create tables on init
- Index on timestamps for fast queries

**Test cases:**
- Stores and retrieves memories
- Finds nearest POI
- Records events correctly
- Handles concurrent access

---

#### C2: Chat Handler (`src/chat/chat-handler.js`)
**Purpose:** Handle in-game chat commands and responses

**Requirements:**
- Listen to chat messages
- Parse commands (`!bot collect wood`)
- Execute commands (write to state)
- Respond in chat
- Handle whispers
- Track mentions

**Key APIs:**
```javascript
async sendUpdate(message: string): Promise<void>
```

**Implementation notes:**
- Command prefix: `!bot`
- Commands: help, collect, goto, status, follow, stop
- Respond with confirmation
- Log all chat activity

**Test cases:**
- Parses commands correctly
- Executes commands
- Responds in chat
- Handles whispers

---

#### C3: Crafting System (`src/actions/crafting.js`)
**Purpose:** Craft items using recipes

**Requirements:**
- Find recipes for items
- Check if materials available
- Craft items (single or batch)
- Handle crafting table requirement

**Key APIs:**
```javascript
async craft(itemName: string, count: number): Promise<boolean>
canCraft(itemName: string): boolean
getRequiredMaterials(itemName: string): array
```

**Implementation notes:**
- Use `minecraft-data` for recipes
- Find crafting table if needed
- Equip materials before crafting

**Test cases:**
- Crafts items successfully
- Checks materials correctly
- Handles missing crafting table

---

#### C4: Building System (`src/actions/building.js`)
**Purpose:** Build structures (walls, houses)

**Requirements:**
- Build walls (length, height, material)
- Build simple houses (width, depth, height)
- Place blocks correctly
- Handle missing materials

**Key APIs:**
```javascript
async buildWall(startPos, length, height, blockType): Promise<boolean>
async buildSimpleHouse(cornerPos, width, depth, height): Promise<boolean>
```

**Implementation notes:**
- Use Vec3 for positions
- Place blocks relative to reference block
- Check inventory before placing

**Test cases:**
- Builds walls correctly
- Builds houses correctly
- Handles missing materials

---

#### C5: Safety Manager (`src/safety/safety-manager.js`)
**Purpose:** Prevent griefing and enforce permissions

**Requirements:**
- Action whitelist (allowed actions)
- Protected areas (no building/breaking)
- PvP toggle (can attack players)
- Grief prevention (don't break crafted blocks)

**Key APIs:**
```javascript
isActionAllowed(action: string): boolean
isPositionSafe(position: object): boolean
canAttackEntity(entity: object): boolean
canBreakBlock(block: object): boolean
```

**Implementation notes:**
- Config in constructor
- Check before every action
- Log violations

**Test cases:**
- Blocks disallowed actions
- Respects protected areas
- Prevents griefing

---

### Deliverables (Track C)
- [ ] `src/memory/memory-store.js` + tests
- [ ] `src/chat/chat-handler.js` + tests
- [ ] `src/actions/crafting.js` + tests
- [ ] `src/actions/building.js` + tests
- [ ] `src/safety/safety-manager.js` + tests
- [ ] Integration with Track B layers
- [ ] All features working

---

## 🧪 Track D: Testing & DevOps

### Context
This track ensures code quality and enables continuous integration.

### Components

#### D1: Unit Tests (`tests/unit/`)
**Purpose:** Test individual components in isolation

**Requirements:**
- Test all Track A utilities
- Test all Track B layers
- Test all Track C features
- Use mocks for external dependencies
- Coverage: 70% minimum

**Test files:**
- `vision.test.js`
- `state-manager.test.js`
- `rate-limiter.test.js`
- `omniroute.test.js`
- `action-awareness.test.js`
- `memory-store.test.js`
- `chat-handler.test.js`

**Implementation notes:**
- Use Jest framework
- Mock Mineflayer bot
- Mock Omniroute API
- Use fixtures for sample data

---

#### D2: Integration Tests (`tests/integration/`)
**Purpose:** Test layer communication and full stack

**Requirements:**
- Test Commander → Strategy → Pilot flow
- Test error escalation (Pilot → Strategy → Commander)
- Test state file communication
- Test memory integration

**Test files:**
- `layers-communication.test.js`
- `full-stack.test.js`

**Implementation notes:**
- Use real StateManager
- Mock Minecraft server
- Test async flows

---

#### D3: E2E Tests (`tests/e2e/`)
**Purpose:** Test bot in real Minecraft server

**Requirements:**
- Test basic survival (5 minutes)
- Test goal completion (collect wood)
- Test error recovery (death, stuck)
- Requires running Minecraft server

**Test files:**
- `basic-survival.test.js`
- `goal-completion.test.js`
- `error-recovery.test.js`

**Implementation notes:**
- Skip if no Minecraft server
- Use Docker Compose for server
- Long timeouts (5-10 minutes)

---

#### D4: CI/CD (`github/workflows/test.yml`)
**Purpose:** Automated testing on every commit

**Requirements:**
- Run on push to master/develop
- Start Minecraft server (Docker)
- Run unit tests
- Run integration tests
- Run E2E tests
- Upload coverage to Codecov

**Implementation notes:**
- Use GitHub Actions
- Use itzg/minecraft-server image
- Wait for server to start (60s timeout)

---

### Deliverables (Track D)
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] All E2E tests passing (with server)
- [ ] CI/CD pipeline working
- [ ] Coverage report generated
- [ ] README with test instructions

---

## 📋 Implementation Order

### Phase 1: Foundation (Parallel)
**Time:** 3-4h  
**Tracks:** A (all), D1 (setup)

Start with:
1. Track A: Build all utilities (can be done in parallel)
2. Track D1: Setup Jest, write utility tests

**Checkpoint:** All utilities working and tested

---

### Phase 2: Core Bot (Sequential with Track A)
**Time:** 5-6h  
**Tracks:** B (all), D1 (layer tests)

After Track A complete:
1. B1: Enhanced Vision
2. B2: Action Awareness
3. B3-B5: Pilot, Strategy, Commander (can be parallel)
4. B6: Bot Core
5. D1: Write layer tests

**Checkpoint:** Bot connects, layers communicate, basic survival works

---

### Phase 3: Extended Features (Parallel with Track B)
**Time:** 6-7h  
**Tracks:** C (all), D1 (feature tests)

After Track B basics working:
1. C1-C5: All features (can be parallel)
2. D1: Write feature tests

**Checkpoint:** All features working and tested

---

### Phase 4: Integration & E2E (Final)
**Time:** 2-3h  
**Tracks:** D2, D3, D4

After all code complete:
1. D2: Integration tests
2. D3: E2E tests
3. D4: CI/CD setup

**Checkpoint:** All tests passing, CI/CD working

---

## 🎯 Success Criteria

Bot is considered complete when:
- ✅ All Track A utilities working
- ✅ All Track B layers working
- ✅ Bot connects to Minecraft
- ✅ Bot survives >5 minutes
- ✅ Bot completes simple goals (collect wood)
- ✅ Bot responds to chat commands
- ✅ Bot responds to voice commands (via Telegram)
- ✅ Action Awareness prevents hallucinations
- ✅ Memory persists across sessions
- ✅ All tests passing (unit, integration, e2e)
- ✅ CI/CD pipeline working
- ✅ Coverage >70%

---

## 📚 Reference Documents

**Core Plans:**
- `IMPLEMENTATION_PLAN_V2.md` - Phases 0-7 (core)
- `IMPLEMENTATION_PLAN_V2.1_EXTENDED.md` - Phases 8-13 (extended)
- `PHASE_14_PIANO.md` - Action Awareness details
- `PHASE_15_ENHANCED_VISION.md` - Vision system details
- `PHASE_16_TESTING.md` - Testing strategy details

**Architecture:**
- `ARCHITECTURE.md` - System design overview
- `VOICE_OPTIONS.md` - Voice integration options

**Project:**
- `README.md` - Project overview
- `.env.example` - Configuration template

---

## 🔗 Dependencies Between Tracks

```
Track A (Foundation)
  ↓
Track B (Bot Layers) ← depends on Track A
  ↓
Track C (Extended) ← depends on Track A, Track B
  ↓
Track D (Testing) ← depends on all tracks
```

**Parallel work possible:**
- Track A components can be built in parallel
- Track B layers can be built in parallel (after Track A)
- Track C features can be built in parallel (after Track B basics)
- Track D tests can be written alongside code

---

## 💡 Tips for Prometheus (OpenCode)

1. **Start with Track A** - foundation must be solid
2. **Use mocks early** - don't wait for real Minecraft server
3. **Test as you go** - write tests alongside code
4. **Follow the types** - TypeScript-style JSDoc comments help
5. **Check existing code** - refer to plan documents for details
6. **Ask for clarification** - if requirements unclear, ask before implementing
7. **Commit often** - small commits are easier to review
8. **Run tests locally** - don't rely only on CI

**Common pitfalls:**
- Don't skip error handling
- Don't forget to close resources (DB, files)
- Don't hardcode values (use .env)
- Don't ignore rate limits
- Don't skip Action Awareness (critical for preventing hallucinations)

---

**Total estimated time:** 17-21 hours
**Recommended team size:** 3-4 developers working in parallel
**Recommended approach:** Implement Track A first, then parallelize B/C/D

Ready to start implementation!
