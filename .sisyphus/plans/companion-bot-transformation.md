# Minecraft Companion Bot Transformation

## TL;DR

> **Quick Summary**: Transform command-driven Minecraft bot into autonomous companion with evolving personality, natural language chat, Discord voice integration, and configurable model support.
> 
> **Deliverables**:
> - OpenAI-compatible API client with multi-provider support
> - Soul.md personality system with dynamic evolution
> - Natural language chat detection and conversation system
> - Discord voice chat integration (configurable)
> - Autonomous behavior system with personality-driven goals
> - Enhanced memory system for relationships and conversations
> - Configuration system for models, autonomy levels, and personality modes
> 
> **Estimated Effort**: Large (15-20 tasks)
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Config System → API Client → Personality System → Autonomous Goals → Integration

---

## Context

### Original Request
User wants to transform the bot from a command-driven tool into an autonomous companion that:
- Uses OpenAI-compatible API instead of Omniroute
- Has personality defined in Soul.md that evolves based on interactions
- Talks naturally via game chat or Discord voice (not just commands)
- Acts autonomously when idle (explores, builds, mines like a human player)
- Remembers conversations and builds relationships with players

### Interview Summary

**Key Discussions**:
- Voice chat: Real-time Discord integration, configurable, text default
- Personality: Dynamic evolution, default Friendly Helper, changes based on player interactions
- Autonomy: Full freedom by default (explore, build, mine, farm, combat, dungeons), configurable modes
- Models: Fully configurable per layer, keep 3-layer architecture
- Memory: Persistent long-term (SQLite already exists), extend for conversations/relationships

**Research Findings**:
- Current API already uses OpenAI-compatible format (easy migration)
- Commander layer is best injection point for autonomous goal generation
- Chat handler currently only processes commands, needs NLP for natural conversation
- Idle behavior: bot does nothing when no goal (perfect place to inject autonomy)
- Memory system exists but needs extension for conversation tracking

### Metis Review

**Identified Gaps** (addressed):

1. **Personality conflict resolution**: What happens when personality conflicts with safety?
   - **Resolution**: Hard constraints override personality (no griefing, no attacking players)

2. **Autonomous goal priority**: How does bot choose between multiple activities?
   - **Resolution**: Priority hierarchy in config, personality influences within constraints

3. **Memory retention policy**: Long-term memory grows indefinitely
   - **Resolution**: 30-day retention with configurable limit, cleanup task

4. **Voice activation**: Always listening or push-to-talk?
   - **Resolution**: Keyword detection ("Hey bot"), configurable threshold

5. **Model validation**: What if configured model fails?
   - **Resolution**: Startup validation with fallback to default models

6. **Idle vs active transition**: What triggers return to player-directed?
   - **Resolution**: Player chat immediately interrupts autonomous activity

7. **Personality evolution limits**: Prevent extreme drift
   - **Resolution**: Trait bounds in Soul.md, reset command available

**Scope Creep Prevention**:
- Personality: Template-based + simple trait modifiers (NO ML, NO neural models)
- Voice: Single speaker, simple STT/TTS (NO multi-speaker, NO emotion detection)
- Chat: Detect when addressed, respond appropriately (NO multi-turn tracking beyond 5 messages)
- Autonomous: Simple activity selection (NO quest generation, NO multi-day planning)
- Memory: SQLite with summaries (NO knowledge graph, NO entity extraction)

---

## Work Objectives

### Core Objective
Transform the Minecraft bot from a command-driven tool into an autonomous companion with personality that feels like playing with a real person.

### Concrete Deliverables
- `src/utils/openai-client.js` - OpenAI-compatible API client
- `config/bot-config.json` - Centralized configuration system
- `personality/Soul.md` - Personality definition template
- `personality/personality-engine.js` - Personality system implementation
- `src/chat/nlp-handler.js` - Natural language chat detection
- `src/voice/discord-voice.js` - Discord voice integration
- `src/layers/commander.js` - Updated with autonomous goal generation
- `src/memory/conversation-store.js` - Extended memory for conversations
- Updated documentation and configuration examples

### Definition of Done
- [ ] Bot connects using OpenAI-compatible API with configurable models
- [ ] Soul.md personality influences decision-making across all 3 layers
- [ ] Bot detects when addressed in chat and responds naturally
- [ ] Discord voice integration works (configurable, text default)
- [ ] Bot generates autonomous goals when idle based on personality
- [ ] Conversations and relationships persist across sessions
- [ ] All existing tests pass + new tests for companion features
- [ ] Configuration system allows customization of models, autonomy, personality

### Must Have
- OpenAI-compatible API client with multi-provider support
- Personality system with trait-based decision influence
- Natural language chat detection (95%+ accuracy on test set)
- Autonomous goal generation when idle
- Persistent conversation memory
- Configuration validation on startup

### Must NOT Have (Guardrails)
- **NO ML/neural models for personality** - Template-based only
- **NO multi-speaker voice tracking** - Single speaker only
- **NO emotion detection/sentiment analysis** - Simple STT/TTS
- **NO knowledge graph/entity extraction** - SQLite summaries only
- **NO quest generation/multi-day planning** - Simple activity selection
- **NO personality overriding safety** - Hard constraints always apply
- **NO griefing behavior** - Safety constraints remain
- **NO removing command system** - Keep as fallback
- **NO changing 3-layer architecture** - Pilot/Strategy/Commander stays
- **NO excessive abstraction** - Keep code simple and maintainable

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Jest test suite, 129 tests passing)
- **Automated tests**: Tests-after (add tests after implementation)
- **Framework**: Jest (existing)
- **Coverage target**: 70% (maintain current standard)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API calls**: Use Bash (curl) - Send requests, assert status + response fields
- **Chat detection**: Use Bash (node REPL) - Import, test with sample messages, compare output
- **Voice integration**: Use Bash (Discord API) - Test connection, send/receive audio
- **Personality influence**: Use Bash (node REPL) - Test decision-making with different traits
- **Autonomous behavior**: Use interactive_bash (tmux) - Run bot, observe autonomous actions
- **Memory persistence**: Use Bash (sqlite3) - Query database, verify data

---

## Execution Strategy

### Parallel Execution Waves

> Maximize throughput by grouping independent tasks into parallel waves.
> Each wave completes before the next begins.

```
Wave 1 (Foundation - 5 tasks, can start immediately):
├── Task 1: Configuration system [quick]
├── Task 2: OpenAI-compatible API client [unspecified-high]
├── Task 3: Soul.md personality template [writing]
├── Task 4: Memory schema extension [quick]
└── Task 5: Test infrastructure setup [quick]

Wave 2 (Core Systems - 5 tasks, depends on Wave 1):
├── Task 6: Personality engine implementation (depends: 1, 3) [deep]
├── Task 7: Natural language chat detection (depends: 1) [unspecified-high]
├── Task 8: Conversation memory store (depends: 4) [unspecified-high]
├── Task 9: Model configuration loader (depends: 1, 2) [quick]
└── Task 10: Discord voice integration (depends: 1) [unspecified-high]

Wave 3 (Integration - 4 tasks, depends on Wave 2):
├── Task 11: Commander autonomous goals (depends: 6, 8) [deep]
├── Task 12: Personality-influenced prompts (depends: 6, 9) [unspecified-high]
├── Task 13: Chat handler integration (depends: 7, 8) [unspecified-high]
└── Task 14: Voice handler integration (depends: 10, 13) [unspecified-high]

Wave 4 (Polish - 3 tasks, depends on Wave 3):
├── Task 15: Configuration validation (depends: 9) [quick]
├── Task 16: Documentation and examples (depends: all) [writing]
└── Task 17: Migration guide (depends: all) [writing]

Wave FINAL (Verification - 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: T1 → T2 → T9 → T12 → F1-F4 → user okay
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 5 (Waves 1 & 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|------------|--------|------|
| 1 | - | 6, 7, 9, 10 | 1 |
| 2 | - | 9 | 1 |
| 3 | - | 6 | 1 |
| 4 | - | 8 | 1 |
| 5 | - | - | 1 |
| 6 | 1, 3 | 11, 12 | 2 |
| 7 | 1 | 13 | 2 |
| 8 | 4 | 11, 13 | 2 |
| 9 | 1, 2 | 12, 15 | 2 |
| 10 | 1 | 14 | 2 |
| 11 | 6, 8 | - | 3 |
| 12 | 6, 9 | - | 3 |
| 13 | 7, 8 | 14 | 3 |
| 14 | 10, 13 | - | 3 |
| 15 | 9 | - | 4 |
| 16 | all | - | 4 |
| 17 | all | - | 4 |
| F1-F4 | all | - | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 5 tasks - T1 → `quick`, T2 → `unspecified-high`, T3 → `writing`, T4 → `quick`, T5 → `quick`
- **Wave 2**: 5 tasks - T6 → `deep`, T7 → `unspecified-high`, T8 → `unspecified-high`, T9 → `quick`, T10 → `unspecified-high`
- **Wave 3**: 4 tasks - T11 → `deep`, T12 → `unspecified-high`, T13 → `unspecified-high`, T14 → `unspecified-high`
- **Wave 4**: 3 tasks - T15 → `quick`, T16 → `writing`, T17 → `writing`
- **FINAL**: 4 tasks - F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.
> **A task WITHOUT QA Scenarios is INCOMPLETE. No exceptions.**

- [x] 1. Configuration System

  **What to do**:
  - Create `config/bot-config.json` schema with sections: api, models, personality, autonomy, voice, memory
  - Support environment variable overrides (e.g., `BOT_API_URL` overrides `api.url`)
  - Include validation rules (required fields, value ranges)
  - Add example config file `config/bot-config.example.json`
  - Document all configuration options in comments

  **Must NOT do**:
  - No complex nested structures beyond 3 levels deep
  - No dynamic config reloading (restart required for changes)
  - No encrypted config values (use env vars for secrets)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward JSON schema definition, well-defined structure
  - **Skills**: []
    - No specialized skills needed for config file creation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: Tasks 6, 7, 9, 10 (all need config system)
  - **Blocked By**: None (can start immediately)

  **References**:
  - `src/utils/omniroute.js:12-28` - Current model configuration pattern (MODELS object)
  - `.env.example` - Current environment variable pattern
  - `AGENTS.md:40-60` - Documented configuration options

  **Acceptance Criteria**:
  - [ ] Config file created: config/bot-config.json
  - [ ] Example file created: config/bot-config.example.json
  - [ ] Schema includes all sections: api, models, personality, autonomy, voice, memory
  - [ ] Environment variable override pattern documented

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Load valid configuration
    Tool: Bash (node REPL)
    Preconditions: config/bot-config.json exists with valid JSON
    Steps:
      1. node -e "const config = require('./config/bot-config.json'); console.log(JSON.stringify(config, null, 2))"
      2. Verify all sections present: api, models, personality, autonomy, voice, memory
      3. Check no syntax errors, valid JSON structure
    Expected Result: Config loads successfully, all sections present
    Failure Indicators: JSON parse error, missing sections, undefined values
    Evidence: .sisyphus/evidence/task-1-config-load.txt

  Scenario: Environment variable override
    Tool: Bash
    Preconditions: config/bot-config.json has api.url = "http://default"
    Steps:
      1. BOT_API_URL="http://override" node -e "const config = require('./config/bot-config.json'); console.log(process.env.BOT_API_URL || config.api.url)"
      2. Verify output is "http://override"
    Expected Result: Environment variable takes precedence over config file
    Evidence: .sisyphus/evidence/task-1-env-override.txt
  ```

  **Evidence to Capture**:
  - [ ] task-1-config-load.txt - Valid config loading output
  - [ ] task-1-env-override.txt - Environment override verification

  **Commit**: YES
  - Message: `feat(config): add configuration system`
  - Files: `config/bot-config.json`, `config/bot-config.example.json`
  - Pre-commit: `node -e "require('./config/bot-config.json')"`

- [x] 2. OpenAI-Compatible API Client

  **What to do**:
  - Create `src/utils/openai-client.js` replacing omniroute.js
  - Support multiple providers: OpenAI, Anthropic, local models, any OpenAI-compatible endpoint
  - Maintain same interface: `chat(messages, layer)` returns response
  - Implement rate limiting with Bottleneck (configurable per provider)
  - Add retry logic with exponential backoff
  - Support streaming responses (optional)
  - Add request/response logging for debugging

  **Must NOT do**:
  - No provider-specific logic beyond endpoint/auth (keep generic)
  - No caching responses (stateless client)
  - No model selection logic (that's in model-config.js)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Moderate complexity, needs careful error handling and rate limiting
  - **Skills**: []
    - Standard HTTP client work, no specialized domain knowledge

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5)
  - **Blocks**: Task 9 (model configuration loader needs this)
  - **Blocked By**: None (can start immediately)

  **References**:
  - `src/utils/omniroute.js:1-424` - Current API client implementation pattern
  - `src/utils/rate-limiter.js:1-38` - Rate limiting pattern with Bottleneck
  - `src/layers/pilot.js:275` - How API client is called from layers
  - OpenAI API docs: `https://platform.openai.com/docs/api-reference/chat/create` - Request/response format

  **Acceptance Criteria**:
  - [ ] File created: src/utils/openai-client.js
  - [ ] Exports `chat(messages, layer)` function
  - [ ] Rate limiting implemented with Bottleneck
  - [ ] Retry logic with exponential backoff (3 retries, 1s/2s/4s delays)
  - [ ] Error handling for 429, 500, network errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Successful API call
    Tool: Bash (curl mock + node)
    Preconditions: Mock OpenAI endpoint running or use real API with test key
    Steps:
      1. node -e "const client = require('./src/utils/openai-client'); client.chat([{role: 'user', content: 'test'}], 'pilot').then(r => console.log(r.content))"
      2. Verify response contains text content
      3. Check no errors thrown
    Expected Result: Response text printed, no errors
    Failure Indicators: Network error, auth error, timeout, undefined response
    Evidence: .sisyphus/evidence/task-2-api-success.txt

  Scenario: Rate limit handling
    Tool: Bash (node REPL)
    Preconditions: Rate limiter configured to 2 req/min
    Steps:
      1. Fire 3 requests rapidly: for i in 1 2 3; do node -e "const client = require('./src/utils/openai-client'); client.chat([{role: 'user', content: 'test $i'}], 'pilot').then(() => console.log('Request $i done'))"; done
      2. Observe third request waits for rate limit window
      3. All 3 complete successfully
    Expected Result: First 2 immediate, third waits ~30s, all succeed
    Evidence: .sisyphus/evidence/task-2-rate-limit.txt

  Scenario: Retry on 500 error
    Tool: Bash (mock server returning 500)
    Preconditions: Mock endpoint returns 500 twice, then 200
    Steps:
      1. Start mock server: node test-server.js (returns 500, 500, 200)
      2. node -e "const client = require('./src/utils/openai-client'); client.chat([{role: 'user', content: 'test'}], 'pilot').then(r => console.log('Success after retries'))"
      3. Verify 3 attempts made (check logs)
    Expected Result: Client retries twice, succeeds on third attempt
    Evidence: .sisyphus/evidence/task-2-retry.txt
  ```

  **Evidence to Capture**:
  - [ ] task-2-api-success.txt - Successful API response
  - [ ] task-2-rate-limit.txt - Rate limiting behavior
  - [ ] task-2-retry.txt - Retry logic verification

  **Commit**: YES
  - Message: `feat(api): add OpenAI-compatible client`
  - Files: `src/utils/openai-client.js`
  - Pre-commit: `npm test src/utils/openai-client.test.js`

- [x] 3. Soul.md Personality Template

  **What to do**:
  - Create `personality/Soul.md` as the primary personality definition file
  - Include sections: Identity, Personality Dimensions (0.0-1.0 scale), Speaking Style, Values, Goals & Motivations, Anti-Patterns
  - Add personality dimensions: warmth, directness, humor, curiosity, loyalty, bravery (all 0.0-1.0)
  - Document default personality: Friendly Helper (warmth: 0.8, loyalty: 0.95, curiosity: 0.7)
  - Include Minecraft-specific context (how bot behaves in-game)
  - Add evolution rules (how traits change based on interactions)
  - Create `personality/Soul.example.md` with alternative personality examples

  **Must NOT do**:
  - No code in Soul.md (pure markdown documentation)
  - No ML/neural model references (template-based only)
  - No complex psychological frameworks (keep simple 0-1 scales)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation task, requires clear writing and structure
  - **Skills**: []
    - Standard documentation work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5)
  - **Blocks**: Task 6 (personality engine needs this template)
  - **Blocked By**: None (can start immediately)

  **References**:
  - Librarian research: OpenSouls core.md structure (staticMemories pattern)
  - Librarian research: PersonaNexus YAML trait system
  - `AGENTS.md:46-50` - Current bot personality (default Friendly Helper)

  **Acceptance Criteria**:
  - [ ] File created: personality/Soul.md
  - [ ] All sections present: Identity, Personality Dimensions, Speaking Style, Values, Goals, Anti-Patterns
  - [ ] 6+ personality dimensions defined with 0.0-1.0 scale
  - [ ] Default Friendly Helper personality documented
  - [ ] Evolution rules explained

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Soul.md is valid markdown
    Tool: Bash
    Preconditions: personality/Soul.md exists
    Steps:
      1. cat personality/Soul.md | grep "## Identity"
      2. cat personality/Soul.md | grep "## Personality Dimensions"
      3. cat personality/Soul.md | grep "warmth:"
      4. Verify all required sections present
    Expected Result: All sections found, valid markdown structure
    Failure Indicators: Missing sections, malformed markdown
    Evidence: .sisyphus/evidence/task-3-soul-structure.txt

  Scenario: Personality dimensions are numeric
    Tool: Bash (grep + validation)
    Preconditions: Soul.md has personality dimensions
    Steps:
      1. grep -E "warmth: [0-9]\.[0-9]" personality/Soul.md
      2. grep -E "loyalty: [0-9]\.[0-9]" personality/Soul.md
      3. Verify all dimensions have 0.0-1.0 values
    Expected Result: All dimensions have valid numeric values
    Evidence: .sisyphus/evidence/task-3-dimensions.txt
  ```

  **Evidence to Capture**:
  - [ ] task-3-soul-structure.txt - Soul.md structure validation
  - [ ] task-3-dimensions.txt - Personality dimensions validation

  **Commit**: YES
  - Message: `docs(personality): add Soul.md template`
  - Files: `personality/Soul.md`, `personality/Soul.example.md`
  - Pre-commit: `test -f personality/Soul.md`

- [x] 4. Memory Schema Extension

  **What to do**:
  - Extend `src/memory/schema.sql` to support conversations and relationships
  - Add `conversations` table: id, player_id, bot_message, player_message, timestamp, context
  - Add `relationships` table: player_id, trust_score, familiarity, interaction_count, last_seen
  - Add `personality_state` table: trait_name, current_value, base_value, last_updated
  - Add indexes for common queries (player_id, timestamp)
  - Create migration script if schema already exists

  **Must NOT do**:
  - No knowledge graph tables (keep simple relational)
  - No entity extraction tables (out of scope)
  - No vector embeddings (semantic search out of scope)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward SQL schema extension
  - **Skills**: []
    - Standard database schema work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5)
  - **Blocks**: Task 8 (conversation store needs this schema)
  - **Blocked By**: None (can start immediately)

  **References**:
  - `src/memory/memory-store.js` - Current memory implementation
  - Librarian research: Sage memory architecture (STM/LTM/episodic pattern)
  - Librarian research: Oracle AI relationship tracking

  **Acceptance Criteria**:
  - [ ] Schema file updated: src/memory/schema.sql
  - [ ] Tables added: conversations, relationships, personality_state
  - [ ] Indexes created for player_id and timestamp
  - [ ] Migration script created if needed

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Schema creates tables successfully
    Tool: Bash (sqlite3)
    Preconditions: schema.sql exists
    Steps:
      1. rm -f test-memory.db
      2. sqlite3 test-memory.db < src/memory/schema.sql
      3. sqlite3 test-memory.db ".tables"
      4. Verify conversations, relationships, personality_state tables exist
    Expected Result: All tables created, no SQL errors
    Failure Indicators: SQL syntax error, missing tables
    Evidence: .sisyphus/evidence/task-4-schema-create.txt

  Scenario: Insert and query conversation
    Tool: Bash (sqlite3)
    Preconditions: Database created with new schema
    Steps:
      1. sqlite3 test-memory.db "INSERT INTO conversations (player_id, bot_message, player_message, timestamp) VALUES ('player1', 'Hello!', 'Hi bot', '2026-04-15')"
      2. sqlite3 test-memory.db "SELECT * FROM conversations WHERE player_id='player1'"
      3. Verify row returned with correct data
    Expected Result: Conversation stored and retrieved successfully
    Evidence: .sisyphus/evidence/task-4-conversation-insert.txt
  ```

  **Evidence to Capture**:
  - [ ] task-4-schema-create.txt - Schema creation output
  - [ ] task-4-conversation-insert.txt - Data insertion test

  **Commit**: YES
  - Message: `feat(memory): extend schema for conversations`
  - Files: `src/memory/schema.sql`
  - Pre-commit: `sqlite3 test.db < src/memory/schema.sql`

- [x] 5. Test Infrastructure Setup

  **What to do**:
  - Create test files for new components: `tests/unit/openai-client.test.js`, `tests/unit/personality-engine.test.js`, `tests/unit/nlp-handler.test.js`
  - Add test utilities: mock API responses, mock game state, mock personality traits
  - Update `package.json` test scripts to include new test files
  - Create test fixtures: sample conversations, sample personality states
  - Document testing approach in `tests/README.md`

  **Must NOT do**:
  - No e2e tests yet (those come after implementation)
  - No integration tests with real APIs (use mocks)
  - No test coverage requirements beyond existing 70%

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Test scaffolding, straightforward setup
  - **Skills**: []
    - Standard test infrastructure work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4)
  - **Blocks**: None (tests written alongside implementation)
  - **Blocked By**: None (can start immediately)

  **References**:
  - `tests/unit/` - Existing test structure
  - `tests/mocks/` - Current mock patterns
  - `package.json:scripts` - Test command configuration

  **Acceptance Criteria**:
  - [ ] Test files created: tests/unit/openai-client.test.js, tests/unit/personality-engine.test.js, tests/unit/nlp-handler.test.js
  - [ ] Test utilities created: tests/helpers/mock-api.js, tests/helpers/mock-personality.js
  - [ ] Test fixtures created: tests/fixtures/conversations.json, tests/fixtures/personalities.json
  - [ ] README updated: tests/README.md

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Test files are valid Jest tests
    Tool: Bash
    Preconditions: Test files created
    Steps:
      1. npm test tests/unit/openai-client.test.js
      2. Verify test suite runs (even if tests are pending)
      3. Check no syntax errors
    Expected Result: Jest recognizes test files, no errors
    Failure Indicators: Jest parse error, file not found
    Evidence: .sisyphus/evidence/task-5-test-run.txt

  Scenario: Mock utilities work
    Tool: Bash (node REPL)
    Preconditions: Mock helpers created
    Steps:
      1. node -e "const mock = require('./tests/helpers/mock-api'); console.log(mock.mockChatResponse('test'))"
      2. Verify mock returns expected structure
    Expected Result: Mock utilities return valid test data
    Evidence: .sisyphus/evidence/task-5-mock-util.txt
  ```

  **Evidence to Capture**:
  - [ ] task-5-test-run.txt - Test suite execution
  - [ ] task-5-mock-util.txt - Mock utility validation

  **Commit**: YES
  - Message: `test: add infrastructure for companion features`
  - Files: `tests/unit/*.test.js`, `tests/helpers/*.js`, `tests/fixtures/*.json`
  - Pre-commit: `npm test -- --listTests`

- [x] 6. Personality Engine Implementation

  **What to do**:
  - Create `personality/personality-engine.js` that loads Soul.md and manages personality state
  - Parse Soul.md to extract personality dimensions (warmth, loyalty, curiosity, etc.)
  - Implement `getTraits()` to return current personality state
  - Implement `influenceDecision(options, context)` to score options based on personality
  - Implement `evolvePersonality(interaction)` to adjust traits based on player interactions
  - Add trait bounds (min/max values) to prevent extreme drift
  - Support personality reset command
  - Persist personality state to database (personality_state table)

  **Must NOT do**:
  - No ML models for personality (template-based scoring only)
  - No sentiment analysis (simple interaction categorization)
  - No complex psychological models (keep trait math simple)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core system requiring careful design of trait influence and evolution
  - **Skills**: []
    - Complex logic but no specialized domain knowledge

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 9, 10)
  - **Blocks**: Tasks 11, 12 (autonomous goals and prompts need personality)
  - **Blocked By**: Tasks 1, 3 (needs config system and Soul.md template)

  **References**:
  - `personality/Soul.md` - Personality template structure
  - Librarian research: OpenSouls WorkingMemory pattern
  - Librarian research: PersonaNexus trait delta system
  - `src/memory/memory-store.js` - Database persistence pattern

  **Acceptance Criteria**:
  - [ ] File created: personality/personality-engine.js
  - [ ] Exports: getTraits(), influenceDecision(), evolvePersonality(), resetPersonality()
  - [ ] Loads Soul.md and parses personality dimensions
  - [ ] Trait evolution bounded (e.g., warmth can't go below 0.2 or above 1.0)
  - [ ] Personality state persists to database

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Load personality from Soul.md
    Tool: Bash (node REPL)
    Preconditions: Soul.md exists with personality dimensions
    Steps:
      1. node -e "const pe = require('./personality/personality-engine'); pe.loadSoul('./personality/Soul.md').then(traits => console.log(JSON.stringify(traits, null, 2)))"
      2. Verify traits object contains: warmth, loyalty, curiosity, etc.
      3. All values are 0.0-1.0
    Expected Result: Personality traits loaded successfully
    Failure Indicators: Parse error, missing traits, invalid values
    Evidence: .sisyphus/evidence/task-6-load-soul.txt

  Scenario: Personality influences decision
    Tool: Bash (node REPL)
    Preconditions: Personality engine loaded
    Steps:
      1. node -e "const pe = require('./personality/personality-engine'); const options = [{type: 'explore', baseScore: 0.5}, {type: 'protect', baseScore: 0.5}]; const traits = {curiosity: 0.9, loyalty: 0.95}; console.log(pe.influenceDecision(options, traits))"
      2. Verify 'protect' scores higher (loyalty 0.95 boosts it)
      3. Check scoring logic applies trait modifiers
    Expected Result: High loyalty trait boosts protection actions
    Evidence: .sisyphus/evidence/task-6-decision-influence.txt

  Scenario: Personality evolution with bounds
    Tool: Bash (node REPL)
    Preconditions: Personality engine with warmth: 0.8
    Steps:
      1. node -e "const pe = require('./personality/personality-engine'); pe.evolvePersonality({type: 'positive', trait: 'warmth', delta: 0.5}); console.log(pe.getTraits().warmth)"
      2. Verify warmth doesn't exceed 1.0 (bounded)
      3. Try negative delta, verify doesn't go below minimum
    Expected Result: Trait evolution respects bounds (0.2-1.0)
    Evidence: .sisyphus/evidence/task-6-evolution-bounds.txt
  ```

  **Evidence to Capture**:
  - [ ] task-6-load-soul.txt - Soul.md loading
  - [ ] task-6-decision-influence.txt - Decision scoring
  - [ ] task-6-evolution-bounds.txt - Trait evolution bounds

  **Commit**: YES
  - Message: `feat(personality): implement personality engine`
  - Files: `personality/personality-engine.js`, `tests/unit/personality-engine.test.js`
  - Pre-commit: `npm test tests/unit/personality-engine.test.js`

- [x] 7. Natural Language Chat Detection

  **What to do**:
  - Create `src/chat/nlp-handler.js` for detecting when bot is addressed
  - Implement `isAddressed(message, botName)` function (returns true/false)
  - Detection patterns: bot name mentioned, questions directed at bot, commands, replies to bot
  - Support variations: "bot", "Bot", "@bot", "hey bot", "bot,", etc.
  - Context-aware: detect pronouns referring to bot ("you", "your") after bot spoke
  - Return confidence score (0.0-1.0) for ambiguous cases
  - Add test set of 100 messages with expected results (95%+ accuracy target)

  **Must NOT do**:
  - No sentiment analysis (out of scope)
  - No multi-turn conversation tracking beyond 5 messages (scope limit)
  - No entity extraction (keep simple pattern matching)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Moderate complexity, needs careful pattern design and testing
  - **Skills**: []
    - Standard NLP pattern matching work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 8, 9, 10)
  - **Blocks**: Task 13 (chat handler integration needs this)
  - **Blocked By**: Task 1 (needs config for bot name)

  **References**:
  - `src/chat/chat-handler.js:1-50` - Current command parsing pattern
  - Librarian research: Discord bot mention detection patterns
  - Test accuracy target: 95%+ on 100-message test set

  **Acceptance Criteria**:
  - [ ] File created: src/chat/nlp-handler.js
  - [ ] Exports: isAddressed(message, botName, context)
  - [ ] Returns: {addressed: boolean, confidence: number}
  - [ ] Test set: tests/fixtures/chat-detection-test-set.json (100 messages)
  - [ ] Accuracy: 95%+ on test set

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Direct mention detection
    Tool: Bash (node REPL)
    Preconditions: NLP handler implemented
    Steps:
      1. node -e "const nlp = require('./src/chat/nlp-handler'); console.log(nlp.isAddressed('Hey bot, come here', 'bot'))"
      2. Verify returns {addressed: true, confidence: 1.0}
      3. Test variations: "bot,", "@bot", "Bot"
    Expected Result: All direct mentions detected with high confidence
    Failure Indicators: False negative, low confidence on clear mention
    Evidence: .sisyphus/evidence/task-7-direct-mention.txt

  Scenario: Context-aware pronoun detection
    Tool: Bash (node REPL)
    Preconditions: Bot spoke last message
    Steps:
      1. node -e "const nlp = require('./src/chat/nlp-handler'); const context = {lastSpeaker: 'bot'}; console.log(nlp.isAddressed('What are you doing?', 'bot', context))"
      2. Verify returns {addressed: true, confidence: 0.8+}
      3. Test without context, verify lower confidence
    Expected Result: Pronouns detected when bot spoke recently
    Evidence: .sisyphus/evidence/task-7-pronoun-context.txt

  Scenario: Test set accuracy
    Tool: Bash (node script)
    Preconditions: Test set with 100 labeled messages
    Steps:
      1. node tests/scripts/test-chat-detection.js
      2. Script runs all 100 messages through isAddressed()
      3. Calculate accuracy: correct / total
    Expected Result: Accuracy >= 95%
    Failure Indicators: Accuracy < 95%, false positives/negatives
    Evidence: .sisyphus/evidence/task-7-test-set-accuracy.txt
  ```

  **Evidence to Capture**:
  - [ ] task-7-direct-mention.txt - Direct mention detection
  - [ ] task-7-pronoun-context.txt - Context-aware detection
  - [ ] task-7-test-set-accuracy.txt - Full test set results

  **Commit**: YES
  - Message: `feat(chat): add NLP chat detection`
  - Files: `src/chat/nlp-handler.js`, `tests/unit/nlp-handler.test.js`, `tests/fixtures/chat-detection-test-set.json`
  - Pre-commit: `npm test tests/unit/nlp-handler.test.js`

- [x] 8. Conversation Memory Store

  **What to do**:
  - Create `src/memory/conversation-store.js` for persistent conversation tracking
  - Implement `saveConversation(playerId, botMessage, playerMessage, context)`
  - Implement `getRecentConversations(playerId, limit)` - returns last N conversations
  - Implement `updateRelationship(playerId, interactionType)` - adjusts trust/familiarity scores
  - Implement `getRelationship(playerId)` - returns relationship state
  - Add conversation summarization (store summary every 10 messages to save space)
  - Implement 30-day retention policy with cleanup task
  - Use SQLite transactions for consistency

  **Must NOT do**:
  - No knowledge graph (simple relational queries only)
  - No semantic search (no vector embeddings)
  - No entity extraction (store raw messages)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Database operations with business logic, moderate complexity
  - **Skills**: []
    - Standard database work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 9, 10)
  - **Blocks**: Tasks 11, 13 (autonomous goals and chat handler need memory)
  - **Blocked By**: Task 4 (needs extended schema)

  **References**:
  - `src/memory/memory-store.js` - Current memory implementation pattern
  - `src/memory/schema.sql` - Database schema with conversations table
  - Librarian research: Sage episodic memory pattern

  **Acceptance Criteria**:
  - [ ] File created: src/memory/conversation-store.js
  - [ ] Exports: saveConversation(), getRecentConversations(), updateRelationship(), getRelationship()
  - [ ] Conversation summarization every 10 messages
  - [ ] 30-day retention with cleanup
  - [ ] SQLite transactions for consistency

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Save and retrieve conversation
    Tool: Bash (node REPL)
    Preconditions: Database with conversations table
    Steps:
      1. node -e "const cs = require('./src/memory/conversation-store'); cs.saveConversation('player1', 'Hello!', 'Hi bot', {location: 'spawn'})"
      2. node -e "const cs = require('./src/memory/conversation-store'); cs.getRecentConversations('player1', 5).then(c => console.log(JSON.stringify(c, null, 2)))"
      3. Verify conversation returned with correct data
    Expected Result: Conversation saved and retrieved successfully
    Failure Indicators: Database error, missing data, wrong player
    Evidence: .sisyphus/evidence/task-8-conversation-save.txt

  Scenario: Relationship tracking
    Tool: Bash (node REPL)
    Preconditions: Empty relationships table
    Steps:
      1. node -e "const cs = require('./src/memory/conversation-store'); cs.updateRelationship('player1', 'positive'); cs.updateRelationship('player1', 'positive'); cs.updateRelationship('player1', 'positive')"
      2. node -e "const cs = require('./src/memory/conversation-store'); cs.getRelationship('player1').then(r => console.log(JSON.stringify(r, null, 2)))"
      3. Verify trust score increased (3 positive interactions)
    Expected Result: Trust score reflects positive interactions
    Evidence: .sisyphus/evidence/task-8-relationship.txt

  Scenario: 30-day retention cleanup
    Tool: Bash (sqlite3 + node)
    Preconditions: Database with old conversations (31+ days)
    Steps:
      1. sqlite3 state/memory.db "INSERT INTO conversations (player_id, bot_message, player_message, timestamp) VALUES ('old_player', 'test', 'test', date('now', '-31 days'))"
      2. node -e "const cs = require('./src/memory/conversation-store'); cs.cleanupOldConversations()"
      3. sqlite3 state/memory.db "SELECT COUNT(*) FROM conversations WHERE player_id='old_player'"
      4. Verify old conversation deleted
    Expected Result: Conversations older than 30 days removed
    Evidence: .sisyphus/evidence/task-8-cleanup.txt
  ```

  **Evidence to Capture**:
  - [ ] task-8-conversation-save.txt - Save/retrieve test
  - [ ] task-8-relationship.txt - Relationship tracking
  - [ ] task-8-cleanup.txt - Retention policy

  **Commit**: YES
  - Message: `feat(memory): add conversation store`
  - Files: `src/memory/conversation-store.js`, `tests/unit/conversation-store.test.js`
  - Pre-commit: `npm test tests/unit/conversation-store.test.js`

- [x] 9. Model Configuration Loader

  **What to do**:
  - Create `src/utils/model-config.js` that loads model settings from config file
  - Support per-layer model configuration (Pilot, Strategy, Commander)
  - Each layer config: provider, model, temperature, max_tokens, timeout
  - Implement `getModelForLayer(layerName)` returning model config
  - Add validation: check required fields, valid provider names, numeric ranges
  - Support fallback to default models if config invalid
  - Log model selection on startup for debugging

  **Must NOT do**:
  - No dynamic model switching during runtime (restart required)
  - No model capability detection (assume user knows what they're configuring)
  - No automatic model selection (user must configure explicitly)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple config loading and validation logic
  - **Skills**: []
    - Standard configuration work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8, 10)
  - **Blocks**: Tasks 12, 15 (personality prompts and validation need this)
  - **Blocked By**: Tasks 1, 2 (needs config system and API client)

  **References**:
  - `config/bot-config.json` - Configuration file structure
  - `src/utils/openai-client.js` - API client that uses model config
  - `src/layers/pilot.js:275` - How layers currently call API

  **Acceptance Criteria**:
  - [ ] File created: src/utils/model-config.js
  - [ ] Exports: getModelForLayer(layerName), validateConfig()
  - [ ] Validates: provider, model, temperature (0-2), max_tokens (>0), timeout (>0)
  - [ ] Fallback to defaults on invalid config
  - [ ] Logs model selection on startup

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Load valid model config
    Tool: Bash (node REPL)
    Preconditions: config/bot-config.json has valid model settings
    Steps:
      1. node -e "const mc = require('./src/utils/model-config'); console.log(JSON.stringify(mc.getModelForLayer('pilot'), null, 2))"
      2. Verify returns: {provider, model, temperature, max_tokens, timeout}
      3. All fields present and valid
    Expected Result: Model config loaded successfully
    Failure Indicators: Missing fields, undefined values
    Evidence: .sisyphus/evidence/task-9-load-config.txt

  Scenario: Validation catches invalid config
    Tool: Bash (node REPL)
    Preconditions: Config with invalid temperature (3.0, out of range)
    Steps:
      1. node -e "const mc = require('./src/utils/model-config'); try { mc.validateConfig({temperature: 3.0}); } catch(e) { console.log('Validation error:', e.message); }"
      2. Verify validation error thrown
      3. Error message explains issue
    Expected Result: Invalid config rejected with clear error
    Evidence: .sisyphus/evidence/task-9-validation.txt

  Scenario: Fallback to defaults
    Tool: Bash (node REPL)
    Preconditions: Config missing model for Strategy layer
    Steps:
      1. node -e "const mc = require('./src/utils/model-config'); console.log(mc.getModelForLayer('strategy'))"
      2. Verify returns default model (not undefined)
      3. Warning logged about using default
    Expected Result: Fallback model used, warning logged
    Evidence: .sisyphus/evidence/task-9-fallback.txt
  ```

  **Evidence to Capture**:
  - [ ] task-9-load-config.txt - Valid config loading
  - [ ] task-9-validation.txt - Validation error handling
  - [ ] task-9-fallback.txt - Fallback behavior

  **Commit**: YES
  - Message: `feat(config): add model configuration loader`
  - Files: `src/utils/model-config.js`, `tests/unit/model-config.test.js`
  - Pre-commit: `npm test tests/unit/model-config.test.js`

- [x] 10. Discord Voice Integration

  **What to do**:
  - Create `src/voice/discord-voice.js` for Discord voice channel integration
  - Use discord.js with voice support (@discordjs/voice)
  - Implement `connect(channelId)` to join voice channel
  - Implement `listen()` for speech-to-text (keyword detection: "Hey bot")
  - Implement `speak(text)` for text-to-speech responses
  - Add configurable activation: keyword detection threshold
  - Support disconnect/reconnect on errors
  - Make voice integration optional (disabled by default in config)

  **Must NOT do**:
  - No multi-speaker tracking (single speaker only)
  - No emotion detection (simple STT/TTS only)
  - No voice cloning (use standard TTS voice)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: External integration with Discord API, moderate complexity
  - **Skills**: []
    - Standard API integration work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8, 9)
  - **Blocks**: Task 14 (voice handler integration needs this)
  - **Blocked By**: Task 1 (needs config for Discord token)

  **References**:
  - `VOICE_OPTIONS.md` - Voice integration options documented
  - Discord.js docs: `https://discord.js.org/#/docs/voice/main/general/welcome` - Voice API
  - User requirement: Real-time Discord voice, configurable, text default

  **Acceptance Criteria**:
  - [ ] File created: src/voice/discord-voice.js
  - [ ] Exports: connect(channelId), listen(), speak(text), disconnect()
  - [ ] Keyword detection: "Hey bot" triggers listening
  - [ ] STT/TTS integration working
  - [ ] Configurable: can be disabled in config
  - [ ] Error handling: reconnect on disconnect

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Connect to Discord voice channel
    Tool: Bash (node script with Discord bot token)
    Preconditions: Discord bot token in config, test voice channel exists
    Steps:
      1. node -e "const dv = require('./src/voice/discord-voice'); dv.connect('CHANNEL_ID').then(() => console.log('Connected'))"
      2. Verify bot joins voice channel
      3. Check no connection errors
    Expected Result: Bot successfully joins voice channel
    Failure Indicators: Auth error, channel not found, connection timeout
    Evidence: .sisyphus/evidence/task-10-voice-connect.txt

  Scenario: Keyword detection triggers listening
    Tool: Bash (mock audio input)
    Preconditions: Bot connected to voice channel
    Steps:
      1. Send mock audio: "Hey bot, what's up?"
      2. Verify keyword "Hey bot" detected
      3. Check listening state activated
    Expected Result: Keyword detection works, listening triggered
    Evidence: .sisyphus/evidence/task-10-keyword.txt

  Scenario: Text-to-speech response
    Tool: Bash (node script)
    Preconditions: Bot connected to voice channel
    Steps:
      1. node -e "const dv = require('./src/voice/discord-voice'); dv.speak('Hello from bot')"
      2. Verify audio played in voice channel
      3. Check TTS quality acceptable
    Expected Result: Bot speaks text in voice channel
    Evidence: .sisyphus/evidence/task-10-tts.txt
  ```

  **Evidence to Capture**:
  - [ ] task-10-voice-connect.txt - Voice connection
  - [ ] task-10-keyword.txt - Keyword detection
  - [ ] task-10-tts.txt - Text-to-speech

  **Commit**: YES
  - Message: `feat(voice): add Discord voice integration`
  - Files: `src/voice/discord-voice.js`, `tests/unit/discord-voice.test.js`
  - Pre-commit: `npm test tests/unit/discord-voice.test.js`

- [x] 11. Commander Autonomous Goal Generation

  **What to do**:
  - Update `src/layers/commander.js` to generate autonomous goals when idle
  - Add idle detection: no goal in commands.json + no threats + safe environment
  - Implement `generateAutonomousGoal(personality, context, memory)` function
  - Goal selection based on personality traits (curiosity → explore, loyalty → protect player)
  - Use conversation memory to inform goals (player mentioned wanting diamonds → search for diamonds)
  - Respect autonomy level from config (full/advanced/basic/conservative)
  - Add goal priority system (safety > player requests > autonomous goals)
  - Log autonomous goal generation for debugging

  **Must NOT do**:
  - No quest generation (simple single goals only)
  - No multi-day planning (goals complete in one session)
  - No complex goal chains (keep goals atomic)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core behavioral change, requires careful integration with personality and memory
  - **Skills**: []
    - Complex logic but no specialized domain

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (with Tasks 12, 13, 14)
  - **Blocks**: None (final integration task)
  - **Blocked By**: Tasks 6, 8 (needs personality engine and conversation memory)

  **References**:
  - `src/layers/commander.js:1-479` - Current Commander implementation
  - `src/layers/commander.js:360` - Current goal monitoring logic
  - Librarian research: MARIA OS goal decomposition pattern
  - Librarian research: Open-Strix scheduled autonomous jobs

  **Acceptance Criteria**:
  - [ ] Commander detects idle state (no goal + safe)
  - [ ] generateAutonomousGoal() implemented
  - [ ] Personality influences goal selection
  - [ ] Memory informs goal choices
  - [ ] Autonomy level respected (config)
  - [ ] Goal priority: safety > player > autonomous

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Idle detection triggers autonomous goal
    Tool: interactive_bash (tmux)
    Preconditions: Bot running, no goal in commands.json, safe environment
    Steps:
      1. Start bot: node src/index.js
      2. Wait for Commander loop (10-30s)
      3. Check state/commands.json for autonomous goal
      4. Verify goal generated (e.g., "explore nearby area")
    Expected Result: Autonomous goal generated when idle
    Failure Indicators: No goal generated, bot stays idle
    Evidence: .sisyphus/evidence/task-11-idle-goal.txt

  Scenario: Personality influences goal selection
    Tool: Bash (node REPL with mock personality)
    Preconditions: Personality with high curiosity (0.9)
    Steps:
      1. node -e "const cmd = require('./src/layers/commander'); const personality = {curiosity: 0.9, loyalty: 0.5}; console.log(cmd.generateAutonomousGoal(personality, {}, {}))"
      2. Verify goal is exploration-related (curiosity trait)
      3. Change to high loyalty (0.95), verify goal changes to protection/assistance
    Expected Result: High curiosity → explore, high loyalty → protect
    Evidence: .sisyphus/evidence/task-11-personality-goal.txt

  Scenario: Memory informs goal choices
    Tool: Bash (node REPL with mock memory)
    Preconditions: Memory has "player mentioned needing diamonds"
    Steps:
      1. node -e "const cmd = require('./src/layers/commander'); const memory = {recentConversations: [{playerMessage: 'I need diamonds'}]}; console.log(cmd.generateAutonomousGoal({}, {}, memory))"
      2. Verify goal relates to finding diamonds
      3. Check goal references player's request
    Expected Result: Goal informed by player's stated needs
    Evidence: .sisyphus/evidence/task-11-memory-goal.txt
  ```

  **Evidence to Capture**:
  - [ ] task-11-idle-goal.txt - Idle detection and goal generation
  - [ ] task-11-personality-goal.txt - Personality influence
  - [ ] task-11-memory-goal.txt - Memory-informed goals

  **Commit**: YES
  - Message: `feat(commander): add autonomous goal generation`
  - Files: `src/layers/commander.js`, `tests/integration/autonomous-goals.test.js`
  - Pre-commit: `npm test tests/integration/autonomous-goals.test.js`

- [x] 12. Personality-Influenced Prompts

  **What to do**:
  - Update prompts in all 3 layers (Pilot, Strategy, Commander) to include personality context
  - Add personality traits to system prompts (e.g., "You are curious (0.9) and loyal (0.95)")
  - Inject current relationship state into prompts (trust level, familiarity)
  - Add speaking style from Soul.md to response generation
  - Update `buildPrompt()` functions in each layer to include personality blocks
  - Ensure personality influences tone, word choice, and decision priorities
  - Test that different personalities produce different behaviors

  **Must NOT do**:
  - No changing core prompt structure (keep existing format)
  - No removing safety constraints from prompts
  - No excessive prompt length (keep under 2000 tokens)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Prompt engineering across multiple files, needs careful integration
  - **Skills**: []
    - Standard prompt engineering work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 11, 13, 14)
  - **Blocks**: None (final integration task)
  - **Blocked By**: Tasks 6, 9 (needs personality engine and model config)

  **References**:
  - `src/layers/pilot.js:386-429` - Current Pilot prompt structure
  - `src/layers/strategy.js:354-390` - Current Strategy prompt structure
  - `src/layers/commander.js:428-479` - Current Commander prompt structure
  - Librarian research: OpenSouls cognitive steps with personality injection

  **Acceptance Criteria**:
  - [ ] All 3 layers updated: pilot.js, strategy.js, commander.js
  - [ ] Personality traits injected into system prompts
  - [ ] Relationship state included in prompts
  - [ ] Speaking style from Soul.md applied
  - [ ] Different personalities produce different behaviors (tested)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Personality traits in prompt
    Tool: Bash (node REPL)
    Preconditions: Personality engine loaded with traits
    Steps:
      1. node -e "const pilot = require('./src/layers/pilot'); const personality = {curiosity: 0.9, loyalty: 0.95}; console.log(pilot.buildPrompt({}, personality))"
      2. Verify prompt contains "curious (0.9)" and "loyal (0.95)"
      3. Check personality context present in system message
    Expected Result: Personality traits visible in prompt
    Failure Indicators: Traits missing, generic prompt
    Evidence: .sisyphus/evidence/task-12-prompt-personality.txt

  Scenario: Different personalities produce different responses
    Tool: Bash (node script with mock API)
    Preconditions: Two personalities: curious (0.9) vs cautious (0.2)
    Steps:
      1. Run pilot with curious personality, observe action choices
      2. Run pilot with cautious personality, observe action choices
      3. Compare: curious explores more, cautious stays safe
    Expected Result: Personality affects behavior choices
    Evidence: .sisyphus/evidence/task-12-personality-behavior.txt

  Scenario: Relationship state in prompt
    Tool: Bash (node REPL)
    Preconditions: Relationship with trust: 0.8, familiarity: 0.6
    Steps:
      1. node -e "const strategy = require('./src/layers/strategy'); const relationship = {trust: 0.8, familiarity: 0.6}; console.log(strategy.buildPrompt({}, {}, relationship))"
      2. Verify prompt mentions trust level and familiarity
      3. Check relationship context affects tone
    Expected Result: Relationship state visible in prompt
    Evidence: .sisyphus/evidence/task-12-relationship-prompt.txt
  ```

  **Evidence to Capture**:
  - [ ] task-12-prompt-personality.txt - Personality in prompts
  - [ ] task-12-personality-behavior.txt - Behavioral differences
  - [ ] task-12-relationship-prompt.txt - Relationship context

  **Commit**: YES
  - Message: `feat(layers): add personality-influenced prompts`
  - Files: `src/layers/pilot.js`, `src/layers/strategy.js`, `src/layers/commander.js`, `tests/integration/personality-prompts.test.js`
  - Pre-commit: `npm test tests/integration/personality-prompts.test.js`

- [x] 13. Chat Handler Integration

  **What to do**:
  - Update `src/chat/chat-handler.js` to use NLP detection and conversation memory
  - Replace command-only parsing with natural language detection
  - When bot is addressed: detect intent, generate natural response, save to memory
  - Keep command system as fallback (e.g., `!bot collect wood` still works)
  - Integrate conversation memory: save all interactions, update relationship
  - Add context tracking: remember last 5 messages for pronoun resolution
  - Generate personality-influenced responses using personality engine
  - Support both text chat (default) and voice chat (if enabled)

  **Must NOT do**:
  - No removing command system (keep as fallback)
  - No multi-turn tracking beyond 5 messages (scope limit)
  - No proactive chat initiation (bot responds, doesn't start conversations)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration of multiple systems, moderate complexity
  - **Skills**: []
    - Standard integration work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 11, 12, 14)
  - **Blocks**: Task 14 (voice handler needs this)
  - **Blocked By**: Tasks 7, 8 (needs NLP handler and conversation memory)

  **References**:
  - `src/chat/chat-handler.js:1-100` - Current chat handler implementation
  - `src/chat/nlp-handler.js` - Natural language detection
  - `src/memory/conversation-store.js` - Conversation persistence

  **Acceptance Criteria**:
  - [ ] Chat handler updated: src/chat/chat-handler.js
  - [ ] NLP detection integrated (isAddressed check)
  - [ ] Natural language responses generated
  - [ ] Command system still works (fallback)
  - [ ] Conversations saved to memory
  - [ ] Relationship updated on interactions
  - [ ] Context tracking (last 5 messages)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Natural language detection and response
    Tool: interactive_bash (tmux)
    Preconditions: Bot running in Minecraft server
    Steps:
      1. Player types in chat: "Hey bot, what are you doing?"
      2. Verify bot detects being addressed (NLP handler)
      3. Bot generates natural response (not command error)
      4. Response reflects personality (friendly, helpful)
    Expected Result: Bot responds naturally to chat message
    Failure Indicators: No response, command error, generic response
    Evidence: .sisyphus/evidence/task-13-natural-chat.txt

  Scenario: Command fallback still works
    Tool: interactive_bash (tmux)
    Preconditions: Bot running in Minecraft server
    Steps:
      1. Player types: "!bot collect wood"
      2. Verify command parsed correctly
      3. Goal written to commands.json
      4. Bot executes command as before
    Expected Result: Command system still functional
    Evidence: .sisyphus/evidence/task-13-command-fallback.txt

  Scenario: Conversation saved to memory
    Tool: Bash (sqlite3)
    Preconditions: Bot responded to player chat
    Steps:
      1. Player: "Hey bot, find diamonds"
      2. Bot responds: "I'll search for diamonds!"
      3. sqlite3 state/memory.db "SELECT * FROM conversations WHERE player_id='player1' ORDER BY timestamp DESC LIMIT 1"
      4. Verify conversation saved with both messages
    Expected Result: Conversation persisted to database
    Evidence: .sisyphus/evidence/task-13-memory-save.txt
  ```

  **Evidence to Capture**:
  - [ ] task-13-natural-chat.txt - Natural language response
  - [ ] task-13-command-fallback.txt - Command system still works
  - [ ] task-13-memory-save.txt - Memory persistence

  **Commit**: YES
  - Message: `feat(chat): integrate NLP with chat handler`
  - Files: `src/chat/chat-handler.js`, `tests/integration/chat-integration.test.js`
  - Pre-commit: `npm test tests/integration/chat-integration.test.js`

- [x] 14. Voice Handler Integration

  **What to do**:
  - Create `src/voice/voice-handler.js` to bridge Discord voice and chat handler
  - Listen for voice input via Discord voice integration
  - Convert speech to text (STT)
  - Pass text to chat handler for processing
  - Convert chat handler response to speech (TTS)
  - Send audio response to Discord voice channel
  - Add voice-specific configuration: enabled/disabled, keyword threshold, TTS voice
  - Handle voice errors gracefully (fallback to text chat)

  **Must NOT do**:
  - No multi-speaker tracking (single speaker only)
  - No emotion detection in voice (simple STT/TTS)
  - No voice as default (text chat is default)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration layer between voice and chat systems
  - **Skills**: []
    - Standard integration work

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (with Tasks 11, 12, 13)
  - **Blocks**: None (final integration task)
  - **Blocked By**: Tasks 10, 13 (needs Discord voice and chat handler)

  **References**:
  - `src/voice/discord-voice.js` - Discord voice integration
  - `src/chat/chat-handler.js` - Chat processing
  - User requirement: Real-time Discord voice, configurable, text default

  **Acceptance Criteria**:
  - [ ] File created: src/voice/voice-handler.js
  - [ ] Voice input → STT → chat handler → TTS → voice output
  - [ ] Configurable: can be disabled
  - [ ] Error handling: fallback to text on voice errors
  - [ ] Voice-specific config: keyword threshold, TTS voice

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Voice input to text response
    Tool: interactive_bash (tmux with Discord bot)
    Preconditions: Bot connected to Discord voice channel, voice enabled in config
    Steps:
      1. Player speaks: "Hey bot, what's up?"
      2. Verify STT converts to text
      3. Chat handler processes text
      4. TTS converts response to audio
      5. Audio played in voice channel
    Expected Result: Full voice interaction loop works
    Failure Indicators: STT fails, no response, TTS fails
    Evidence: .sisyphus/evidence/task-14-voice-loop.txt

  Scenario: Voice disabled fallback
    Tool: Bash (node script)
    Preconditions: Voice disabled in config
    Steps:
      1. Attempt to initialize voice handler
      2. Verify voice handler skips initialization
      3. Text chat still works normally
    Expected Result: Voice gracefully disabled, text chat unaffected
    Evidence: .sisyphus/evidence/task-14-voice-disabled.txt

  Scenario: Voice error fallback to text
    Tool: interactive_bash (tmux with mock voice error)
    Preconditions: Voice enabled, simulate STT failure
    Steps:
      1. Trigger STT error (disconnect, timeout)
      2. Verify error logged
      3. Bot continues responding via text chat
      4. No crash or hang
    Expected Result: Voice errors don't break bot, text fallback works
    Evidence: .sisyphus/evidence/task-14-voice-error.txt
  ```

  **Evidence to Capture**:
  - [ ] task-14-voice-loop.txt - Full voice interaction
  - [ ] task-14-voice-disabled.txt - Disabled state
  - [ ] task-14-voice-error.txt - Error handling

  **Commit**: YES
  - Message: `feat(voice): integrate voice with chat handler`
  - Files: `src/voice/voice-handler.js`, `tests/integration/voice-integration.test.js`
  - Pre-commit: `npm test tests/integration/voice-integration.test.js`

- [x] 15. Configuration Validation

  **What to do**:
  - Create `src/utils/config-validator.js` for startup configuration validation
  - Validate all config sections: api, models, personality, autonomy, voice, memory
  - Check required fields present (API URL, model names)
  - Validate value ranges (temperature 0-2, trust scores 0-1)
  - Verify file paths exist (Soul.md, database)
  - Test API connectivity on startup
  - Log validation results (warnings for optional fields, errors for required)
  - Exit with clear error message if critical validation fails

  **Must NOT do**:
  - No runtime validation (startup only)
  - No auto-fixing invalid config (fail fast with clear message)
  - No network calls beyond API connectivity test

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward validation logic
  - **Skills**: []
    - Standard validation work

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (with Tasks 16, 17)
  - **Blocks**: None (polish task)
  - **Blocked By**: Task 9 (needs model config loader)

  **References**:
  - `config/bot-config.json` - Configuration structure
  - `src/utils/model-config.js` - Model configuration validation
  - `src/index.js` - Main entry point where validation runs

  **Acceptance Criteria**:
  - [ ] File created: src/utils/config-validator.js
  - [ ] Validates all config sections
  - [ ] Checks required fields and value ranges
  - [ ] Tests API connectivity
  - [ ] Logs validation results
  - [ ] Exits with error on critical failures

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Valid config passes validation
    Tool: Bash
    Preconditions: Valid config/bot-config.json
    Steps:
      1. node -e "const cv = require('./src/utils/config-validator'); cv.validate().then(() => console.log('Validation passed'))"
      2. Verify no errors thrown
      3. Check validation success logged
    Expected Result: Validation passes, no errors
    Failure Indicators: Validation error on valid config
    Evidence: .sisyphus/evidence/task-15-valid-config.txt

  Scenario: Invalid config fails with clear error
    Tool: Bash
    Preconditions: Config with missing API URL
    Steps:
      1. node -e "const cv = require('./src/utils/config-validator'); cv.validate().catch(e => console.log('Error:', e.message))"
      2. Verify error thrown
      3. Error message explains missing API URL
    Expected Result: Clear error message, validation fails
    Evidence: .sisyphus/evidence/task-15-invalid-config.txt

  Scenario: API connectivity test
    Tool: Bash
    Preconditions: Config with API URL
    Steps:
      1. node -e "const cv = require('./src/utils/config-validator'); cv.testApiConnectivity().then(r => console.log('API reachable:', r))"
      2. Verify API connectivity tested
      3. Result logged (success or failure)
    Expected Result: API connectivity verified
    Evidence: .sisyphus/evidence/task-15-api-test.txt
  ```

  **Evidence to Capture**:
  - [ ] task-15-valid-config.txt - Valid config validation
  - [ ] task-15-invalid-config.txt - Invalid config error
  - [ ] task-15-api-test.txt - API connectivity test

  **Commit**: YES
  - Message: `feat(config): add startup validation`
  - Files: `src/utils/config-validator.js`, `tests/unit/config-validator.test.js`
  - Pre-commit: `npm test tests/unit/config-validator.test.js`

- [x] 16. Documentation and Examples

  **What to do**:
  - Create `docs/COMPANION_MODE.md` explaining companion bot features
  - Document Soul.md structure and how to customize personality
  - Create example configurations: `config/examples/curious-explorer.json`, `config/examples/protective-guardian.json`
  - Document voice chat setup (Discord bot token, channel configuration)
  - Add troubleshooting guide for common issues
  - Update main README.md with companion mode section
  - Create `docs/PERSONALITY_GUIDE.md` for personality customization
  - Add API migration guide (Omniroute → OpenAI)

  **Must NOT do**:
  - No auto-generated docs (write manually for clarity)
  - No excessive detail (keep concise and practical)
  - No outdated information (verify all examples work)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation task, requires clear writing
  - **Skills**: []
    - Standard documentation work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 15, 17)
  - **Blocks**: None (polish task)
  - **Blocked By**: All previous tasks (needs complete implementation to document)

  **References**:
  - `README.md` - Current documentation structure
  - `AGENTS.md` - Project state documentation
  - `VOICE_OPTIONS.md` - Voice integration options
  - All implemented features from tasks 1-15

  **Acceptance Criteria**:
  - [ ] Files created: docs/COMPANION_MODE.md, docs/PERSONALITY_GUIDE.md
  - [ ] Example configs: config/examples/curious-explorer.json, config/examples/protective-guardian.json
  - [ ] README.md updated with companion mode section
  - [ ] Voice setup documented
  - [ ] Troubleshooting guide included

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Documentation examples are valid
    Tool: Bash
    Preconditions: Example configs created
    Steps:
      1. node -e "const config = require('./config/examples/curious-explorer.json'); console.log(JSON.stringify(config, null, 2))"
      2. Verify config is valid JSON
      3. Check all required fields present
    Expected Result: Example configs are valid and loadable
    Failure Indicators: JSON parse error, missing fields
    Evidence: .sisyphus/evidence/task-16-example-configs.txt

  Scenario: Documentation links are valid
    Tool: Bash (grep)
    Preconditions: Documentation files created
    Steps:
      1. grep -r "](.*\.md)" docs/
      2. Verify all linked files exist
      3. Check no broken internal links
    Expected Result: All documentation links valid
    Evidence: .sisyphus/evidence/task-16-doc-links.txt

  Scenario: Voice setup instructions work
    Tool: Bash (manual verification)
    Preconditions: docs/COMPANION_MODE.md has voice setup section
    Steps:
      1. Follow voice setup instructions step-by-step
      2. Verify Discord bot token configuration works
      3. Check voice channel connection succeeds
    Expected Result: Voice setup instructions are accurate
    Evidence: .sisyphus/evidence/task-16-voice-setup.txt
  ```

  **Evidence to Capture**:
  - [ ] task-16-example-configs.txt - Example config validation
  - [ ] task-16-doc-links.txt - Documentation link validation
  - [ ] task-16-voice-setup.txt - Voice setup verification

  **Commit**: YES
  - Message: `docs: add configuration and usage examples`
  - Files: `docs/COMPANION_MODE.md`, `docs/PERSONALITY_GUIDE.md`, `config/examples/*.json`, `README.md`
  - Pre-commit: `test -f docs/COMPANION_MODE.md`

- [x] 17. Migration Guide

  **What to do**:
  - Create `MIGRATION.md` for upgrading from command-driven to companion mode
  - Document breaking changes: API client replacement, config structure changes
  - Provide step-by-step migration instructions
  - Include database migration script for new schema
  - Document how to preserve existing behavior (disable companion features)
  - Add rollback instructions if migration fails
  - Include before/after comparison of bot behavior
  - Test migration on clean install and existing installation

  **Must NOT do**:
  - No automatic migration (user must run manually)
  - No data loss (preserve existing memory/state)
  - No forced companion mode (user can opt-in gradually)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation task with technical instructions
  - **Skills**: []
    - Standard documentation work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 15, 16)
  - **Blocks**: None (polish task)
  - **Blocked By**: All previous tasks (needs complete implementation)

  **References**:
  - `src/memory/schema.sql` - Database schema changes
  - `config/bot-config.json` - New configuration structure
  - `.env.example` - Environment variable changes
  - All implemented features from tasks 1-15

  **Acceptance Criteria**:
  - [ ] File created: MIGRATION.md
  - [ ] Step-by-step migration instructions
  - [ ] Database migration script included
  - [ ] Rollback instructions provided
  - [ ] Before/after behavior comparison
  - [ ] Tested on clean and existing installations

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Migration from clean install
    Tool: Bash
    Preconditions: Fresh clone of repository
    Steps:
      1. Follow MIGRATION.md instructions from step 1
      2. Run database migration script
      3. Update configuration files
      4. Start bot and verify companion features work
    Expected Result: Clean install migrates successfully
    Failure Indicators: Migration script fails, config errors, bot won't start
    Evidence: .sisyphus/evidence/task-17-clean-migration.txt

  Scenario: Migration preserves existing data
    Tool: Bash (sqlite3)
    Preconditions: Existing installation with memory data
    Steps:
      1. Backup existing database: cp state/memory.db state/memory.db.backup
      2. Run migration script
      3. sqlite3 state/memory.db "SELECT COUNT(*) FROM [old_table]"
      4. Verify old data still present
    Expected Result: Existing data preserved after migration
    Evidence: .sisyphus/evidence/task-17-data-preservation.txt

  Scenario: Rollback on migration failure
    Tool: Bash
    Preconditions: Migration fails mid-process
    Steps:
      1. Simulate migration failure (corrupt config)
      2. Follow rollback instructions in MIGRATION.md
      3. Verify bot returns to previous working state
      4. Check no data loss
    Expected Result: Rollback restores working state
    Evidence: .sisyphus/evidence/task-17-rollback.txt
  ```

  **Evidence to Capture**:
  - [ ] task-17-clean-migration.txt - Clean install migration
  - [ ] task-17-data-preservation.txt - Data preservation
  - [ ] task-17-rollback.txt - Rollback verification

  **Commit**: YES
  - Message: `docs: add migration guide`
  - Files: `MIGRATION.md`, `scripts/migrate-database.js`
  - Pre-commit: `test -f MIGRATION.md`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npm test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(config): add configuration system` - config/bot-config.json, tests
- **Wave 1**: `feat(api): add OpenAI-compatible client` - src/utils/openai-client.js, tests
- **Wave 1**: `docs(personality): add Soul.md template` - personality/Soul.md
- **Wave 1**: `feat(memory): extend schema for conversations` - src/memory/schema.sql
- **Wave 2**: `feat(personality): implement personality engine` - personality/personality-engine.js, tests
- **Wave 2**: `feat(chat): add NLP chat detection` - src/chat/nlp-handler.js, tests
- **Wave 2**: `feat(memory): add conversation store` - src/memory/conversation-store.js, tests
- **Wave 2**: `feat(config): add model configuration loader` - src/utils/model-config.js, tests
- **Wave 2**: `feat(voice): add Discord voice integration` - src/voice/discord-voice.js, tests
- **Wave 3**: `feat(commander): add autonomous goal generation` - src/layers/commander.js, tests
- **Wave 3**: `feat(layers): add personality-influenced prompts` - src/layers/*.js, tests
- **Wave 3**: `feat(chat): integrate NLP with chat handler` - src/chat/chat-handler.js, tests
- **Wave 3**: `feat(voice): integrate voice with chat handler` - src/voice/voice-handler.js, tests
- **Wave 4**: `feat(config): add startup validation` - src/utils/config-validator.js, tests
- **Wave 4**: `docs: add configuration and usage examples` - docs/
- **Wave 4**: `docs: add migration guide` - MIGRATION.md

---

## Success Criteria

### Verification Commands
```bash
# Test API client
node -e "const client = require('./src/utils/openai-client'); client.chat('test', 'pilot').then(console.log)"
# Expected: Response from configured model

# Test personality system
node -e "const pe = require('./personality/personality-engine'); console.log(pe.getTraits())"
# Expected: Personality traits object

# Test chat detection
node -e "const nlp = require('./src/chat/nlp-handler'); console.log(nlp.isAddressed('Hey bot, come here'))"
# Expected: true

# Test memory
sqlite3 state/memory.db "SELECT COUNT(*) FROM conversations"
# Expected: Number of stored conversations

# Run all tests
npm test
# Expected: All tests pass, 70%+ coverage
```

### Final Checklist
- [ ] All "Must Have" features implemented and tested
- [ ] All "Must NOT Have" patterns absent from codebase
- [ ] All tests pass (npm test)
- [ ] Configuration validation works on startup
- [ ] Bot responds naturally to chat messages
- [ ] Autonomous behavior generates goals when idle
- [ ] Personality influences decision-making
- [ ] Discord voice integration functional (when enabled)
- [ ] Memory persists across sessions
- [ ] Documentation complete and accurate
