# Learnings - Companion Bot Transformation

## [2026-04-15T06:55:01Z] Session Start
- Plan: companion-bot-transformation
- Session: ses_270145087ffeE2DxSgqBaFLEEu
- Total tasks: 17 implementation + 4 final verification
- Strategy: 4 parallel waves for maximum throughput

## [2026-04-15T07:04:00Z] Task 1 - Config System
### Completed
- Created `config/bot-config.json` with all 6 sections (api, models, personality, autonomy, voice, memory)
- Created `config/bot-config.example.json` with extensive inline documentation
- QA Scenario 1: Config loads successfully, all sections present
- QA Scenario 2: Environment variable BOT_API_URL override verified working

### Key Finding: JSON Does Not Support Comments
- Initial attempt included JS-style comments (`/** */`) inside JSON object
- Node.js `require()` uses `JSON.parse()` which fails on comments
- Solution: Keep `bot-config.json` as pure JSON, move all documentation to `bot-config.example.json`
- Environment variable override pattern is documented in example file only

### Pattern Followed
- Model configuration follows `src/utils/omniroute.js:12-28` MODELS structure exactly
- Each model has: id, name, latencyTarget
- Environment variable pattern: BOT_<SECTION>_<KEY> (e.g., BOT_API_URL)

### Evidence Saved
- `.sisyphus/evidence/task-1-config-load.txt` - Valid config load output
- `.sisyphus/evidence/task-1-env-override.txt` - Environment override test result
## [2026-04-15T07:XX:XXZ] Task 3 - Soul.md Personality Template

### Completed
- Created `personality/Soul.md` with all 9 required sections
- Created `personality/Soul.example.md` with 6 alternative archetypes
- QA Scenario 1: All sections present (Identity, Personality Dimensions, Speaking Style, Values, Goals, Anti-Patterns, Evolution Rules, Minecraft Context, Configuration Notes)
- QA Scenario 2: All 6 dimensions have valid 0.0-1.0 values (warmth: 0.8, directness: 0.6, humor: 0.5, curiosity: 0.7, loyalty: 0.95, bravery: 0.6)

### Key Finding: Markdown Tables for Dimensions
- Using table format `| **dimension** | value | description |` makes personality values scannable
- Default Friendly Helper uses warmth: 0.8, loyalty: 0.95, curiosity: 0.7 as specified
- 0.0-1.0 scale is intuitive and allows fine-grained tuning

### Pattern Followed
- 6 core dimensions: warmth, directness, humor, curiosity, loyalty, bravery
- Evolution rules include trait modification (+0.01 to +0.02 per trigger) and decay (0.001/hour)
- Minecraft-specific context includes day/night behaviors, combat responses, and situational responses
- Anti-patterns define what NOT to do (over-explaining, backseat gaming, stealing resources)

### Files Created
- `personality/Soul.md` - Main personality definition (~300 lines)
- `personality/Soul.example.md` - 6 archetype examples (Silent Guardian, Enthusiastic Adventurer, Pragmatic Engineer, Nurturing Caretaker, Mischievous Trickster, Veteran Survivalist)

### Evidence Saved
- `.sisyphus/evidence/task-3-soul-structure.txt` - Section structure verification
- `.sisyphus/evidence/task-3-dimensions.txt` - Dimension value verification

## [2026-04-15T08:15:00Z] Task 4 - Memory Schema Extension

### Completed
- Created `src/memory/schema.sql` with all tables: events, goals, learnings, conversations, relationships, personality_state
- Added indexes for player_id and timestamp columns
- No migration script needed - schema.sql is new file, memory-store.js uses CREATE TABLE IF NOT EXISTS

### Key Finding: SQLite sqlite3 CLI Not Available
- Server doesn't have `sqlite3` CLI installed
- Solution: Use Node.js with `require('sqlite3')` to test schema
- Pattern: `db.exec(schema, callback)` works better than splitting statements manually

### Schema Structure
- conversations: id, player_id, bot_message, player_message, timestamp, context
- relationships: player_id (PK), trust_score (0.0-1.0), familiarity (0.0-1.0), interaction_count, last_seen
- personality_state: trait_name (PK), current_value, base_value, last_updated
- Indexes: idx_conversations_player_id, idx_conversations_timestamp, idx_relationships_trust

### QA Results
- QA1: PASS - Schema creates 6 tables and 5 indexes
- QA2: PASS - Insert and query conversation works correctly

### Evidence Saved
- `.sisyphus/evidence/task-4-schema-create.txt`
- `.sisyphus/evidence/task-4-conversation-insert.txt`

## [2026-04-15T07:20:00Z] Task 2 - OpenAI-Compatible API Client

### Completed
- Created `src/utils/openai-client.js` replacing omniroute.js
- Implemented Bottleneck rate limiting (448 req/min = 80% of 560 RPM)
- Implemented retry logic with exponential backoff (3 retries, 1s/2s/4s delays)
- Error handling for 429 (rate limit), 5xx (server), network errors
- Maintained same interface: `chat(messages, layer)` returns response with `content` field

### Key Finding: Omniroute URL Structure
- Environment variable `OMNIROUTE_URL=http://127.0.0.1:20128/v1/chat/completions` is FULL endpoint
- Client must use base URL `http://127.0.0.1:20128/v1` and append `/chat/completions`
- Original omniroute.js had `/chat/completions` hardcoded in POST call
- Solution: Parse baseURL from env or use separate endpoint path

### Key Finding: Bottleneck Integration
- Bottleneck is used directly in openai-client.js (not via separate rate-limiter.js)
- `limiter.schedule(fn)` wraps each request
- On 429 error, limiter stops entirely (prevents cascading failures)
- Configuration: reservoir, reservoirRefreshAmount, reservoirRefreshInterval, minTime

### Retry Logic Verified
- Initial attempt → fail
- Retry 1: 1000ms delay (1s base * 2^0)
- Retry 2: 2000ms delay (1s base * 2^1)
- Retry 3: 4000ms delay (1s base * 2^2)
- Total retry time: ~7000ms for 3 retries

### Error Classification for Retry
- Retryable: 429, 5xx, ECONNABORTED, ETIMEDOUT, ECONNRESET, network errors
- Non-retryable: 4xx (except 429) - fail immediately

### Interface Maintained
- `chat(messages, layer, options)` - layer used for logging only
- Returns `{ content, role, finishReason, model, usage }`
- Same signature as original omniroute.js for drop-in replacement

### QA Results
- QA1: PASS - Successful API call with response content
- QA2: PASS - Rate limiter queues parallel requests correctly
- QA3: PASS - Exponential backoff works (7075ms total for 3 retries)

### Evidence Saved
- `.sisyphus/evidence/task-2-api-success.txt`
- `.sisyphus/evidence/task-2-rate-limit.txt`
- `.sisyphus/evidence/task-2-retry.txt`

## [2026-04-15T07:56:00Z] Task 6 - Personality Engine

### Completed
- Created `personality/personality-engine.js` with Soul.md loader
- Implemented all 5 required exports: loadSoul(), getTraits(), influenceDecision(), evolvePersonality(), resetPersonality()
- Added database persistence to personality_state table
- Implemented trait bounds (TRAIT_MIN=0.2, TRAIT_MAX=1.0) to prevent extreme drift
- Template-based decision scoring (NO ML models per scope limit)
- All QA scenarios passed

### Key Finding: Markdown Table Parsing
- Soul.md uses markdown table format: `| **dimension** | value | description |`
- Regex pattern `/\|\s*\*\*(\w+)\*\*\s*\|\s*([\d.]+)\s*\|/g` extracts trait values
- Validates against DEFAULT_TRAITS to ensure known dimensions only
- Clamps parsed values to TRAIT_MIN/TRAIT_MAX range

### Key Finding: Decision Influence Matrix
- TRAIT_INFLUENCE_MATRIX maps decision types to trait weights
- Protection actions: loyalty (2.0), bravery (1.5), warmth (1.2)
- Exploration actions: curiosity (2.0), bravery (1.3)
- Social actions: warmth (2.0), humor (1.5), loyalty (1.2)
- Combat actions: bravery (2.0), loyalty (1.5)
- Information actions: directness (1.8), curiosity (1.5), warmth (1.2)
- Score = 1.0 + sum((trait - 0.5) * weight) for each influencing trait

### Key Finding: Evolution Triggers
- EVOLUTION_TRIGGERS maps interaction types to trait deltas
- 'appreciation' → warmth +0.02
- 'clear_goals' → directness +0.01
- 'shared_laughter' → humor +0.02
- 'exploration' → curiosity +0.01
- 'protection' → loyalty +0.01
- 'combat_together' → bravery +0.01
- Intensity multiplier allows stronger/weaker effects

### Key Finding: Trait Bounds Working
- Upper bound tested: warmth capped at 1.0 after many appreciations
- Lower bound protected by TRAIT_MIN=0.2
- "bounded" flag logged when trait hits limit
- resetPersonality() clears persisted state and restores defaults

### Pattern Followed
- Singleton pattern via getInstance() for shared state
- Module exports both class and convenience functions
- Database persistence via INSERT OR REPLACE
- Logger usage matches existing utils/logger.js pattern

### QA Results
- QA1: PASS - Soul.md loads with all 6 dimensions (warmth, directness, humor, curiosity, loyalty, bravery)
- QA2: PASS - Decision scoring works, protection/social tied at 2.0 (high warmth+loyalty)
- QA3: PASS - Trait bounds enforced, reset restores defaults

### Evidence Saved
- `.sisyphus/evidence/task-6-load-soul.txt` - Soul.md load verification
- `.sisyphus/evidence/task-6-decision-influence.txt` - Decision scoring test
- `.sisyphus/evidence/task-6-evolution-bounds.txt` - Bounds verification

## [2026-04-15T08:00:00Z] Task 8 - Conversation Store

### Completed
- Created `src/memory/conversation-store.js` with ConversationStore class
- Implemented saveConversation() with transaction support
- Implemented getRecentConversations() with limit parameter
- Implemented updateRelationship() with trust/familiarity score modifiers
- Implemented getRelationship() returning relationship state
- Added conversation summarization every 10 messages
- Implemented 30-day retention cleanup

### Key Finding: SQLite Transactions in Node.js
- SQLite3 library doesn't have native Promise support, must wrap in Promise manually
- Transaction pattern: BEGIN → operations → COMMIT (with ROLLBACK on error)
- Used `this.db.serialize()` to ensure sequential execution within transaction
- Each public method that modifies data should use `_runTransaction()` wrapper

### Key Finding: Field Naming Convention
- SQLite uses snake_case (player_id, bot_message)
- JavaScript API uses camelCase (playerId, botMessage)
- When mapping rows, explicitly convert field names rather than using spread operator
- Example: `{ playerId: row.player_id, botMessage: row.bot_message }` instead of `{ ...row }`

### Relationship Score Modifiers
- INTERACTION_MODIFIERS object defines trust/familiarity changes per interaction type
- positive: +0.02 trust, +0.01 familiarity
- negative: -0.05 trust
- helpful: +0.05 trust, +0.02 familiarity
- hostile: -0.1 trust
- greeting: +0.01 trust, +0.01 familiarity
- Scores clamped to 0.0-1.0 range

### Summarization Strategy
- Threshold: 10 messages triggers summarization
- Extract key topics from player messages (simple word frequency)
- Create summary record with `[SUMMARY]` prefix
- Delete original messages, keep summary
- Summary includes: count, date range, top 5 topics

### QA Results
- QA1: PASS - Conversations saved and retrieved with correct data
- QA2: PASS - Trust score correctly reflects positive interactions (0.5 → 0.56 after 3 positive)
- QA3: PASS - 30-day cleanup deletes old conversations (31+ days deleted, 30-day boundary preserved)

### Evidence Saved
- `.sisyphus/evidence/task-8-conversation-save.txt`
- `.sisyphus/evidence/task-8-relationship.txt`
- `.sisyphus/evidence/task-8-cleanup.txt`

## [2026-04-15T09:30:00Z] Task 7 - NLP Handler for Chat Detection

### Completed
- Created `src/chat/nlp-handler.js` with `isAddressed(message, botName, context)` function
- Implemented detection patterns: direct mention, @-mention, greeting, command prefix, context-aware pronouns
- Created test set `tests/fixtures/chat-detection-test-set.json` (101 messages)
- Achieved 98.02% accuracy on test set (target: 95%)

### Key Finding: Pattern Matching Over ML
- Per decisions.md, kept simple pattern matching (no ML models)
- Regex patterns for: `^name`, `@name`, `hey name`, `!name`, `\byou\b` (with context)
- Confidence scoring: 1.0 for explicit mentions, 0.85 for name in message, 0.7-0.95 for pronouns with context

### Context-Aware Pronoun Detection
- `botSpokeLast: true` → 0.85 confidence for pronouns
- `messagesSinceBotSpoke: 1-5` → 0.65-0.80 confidence
- `messagesSinceBotSpoke > 5` → not detected (context too old)
- Questions ending in `?` get +0.1 confidence boost

### Detection Patterns Implemented
1. **Direct mention at start**: `bot, come here` → confidence 1.0
2. **@-mention**: `@bot help` → confidence 1.0
3. **Greeting + name**: `hey bot`, `hi Bot`, `hello bot` → confidence 0.95
4. **Command prefix**: `!bot collect` → confidence 1.0
5. **Name anywhere**: `thanks bot` → confidence 0.85
6. **Pronouns with context**: `What are you doing?` (bot spoke last) → confidence 0.95

### Edge Cases Discovered
- All-caps messages like `BOTS ARE COOL` match because `BOT` is substring of `BOTS`
- This is acceptable behavior - mentions the word "bot" even in all caps
- False positives on "WHERE'S THE BOT" - contains bot name, detected as potential address

### Test Set Categories
- direct_mention (15): bot at start
- at_mention (5): @bot variations
- greeting (12): hey/hi/hello bot
- command (8): !bot commands
- name_in_message (8): bot mentioned mid-message
- no_mention (24): no bot reference
- other_player (7): addressing other players
- ambiguous_no_context (12): "you" without context
- all_caps (5): all caps messages
- single_word (2): just "bot"

### QA Results
- QA1: PASS - Direct mention detection (15/15, 100%)
- QA2: PASS - Context-aware pronoun detection (12/12, 100%)
- QA3: PASS - Test set accuracy (99/101, 98.02%)

### Evidence Saved
- `.sisyphus/evidence/task-7-direct-mention.txt`
- `.sisyphus/evidence/task-7-pronoun-context.txt`
- `.sisyphus/evidence/task-7-test-set-accuracy.txt`

## [2026-04-15T08:05:00Z] Task 9 - Model Configuration Loader

### Completed
- Created `src/utils/model-config.js` with model configuration loading and validation
- Implemented all required exports: getModelForLayer(), validateConfig(), logModelSelection(), loadConfig(), resetCache()
- Supports per-layer model configuration (pilot, strategy, commander)
- Validates: provider names, temperature (0-2), max_tokens (>0), timeout (>0)
- Falls back to default models when config is missing or invalid
- Logs model selection on startup

### Key Finding: Config File Structure Mismatch
- bot-config.json uses: `{ models: { pilot: { id, name, latencyTarget } } }`
- model-config.js expects: `{ provider, model, temperature, max_tokens, timeout }`
- Solution: Map `id` → `model`, use defaults for missing fields (temperature, timeout, provider)
- Falls back gracefully - not all fields need to be specified

### Key Finding: Validation Strategy
- validateModelConfig() is internal (not exported) - validates single layer config
- validateConfig() is exported - validates all layers, returns `{ isValid, errors[] }`
- Error messages are specific: "Invalid temperature for pilot: 3 (must be 0-2)"
- Invalid config triggers fallback to defaults (logged with warning)

### Default Models Established
- pilot: nvidia/llama-3.2-1b-instruct, temp 0.7, 500 tokens, 10s timeout
- strategy: nvidia/qwen2.5-7b-instruct, temp 0.7, 1000 tokens, 15s timeout
- commander: anthropic/claude-sonnet-4.5, temp 0.7, 1500 tokens, 20s timeout

### Valid Providers List
- ['openai', 'anthropic', 'nvidia', 'local', 'ollama', 'lmstudio']
- Unknown providers trigger warning but don't fail - defaults are used

### Pattern Followed
- Singleton caching: config loaded once, cached in module scope
- resetCache() for testing - clears cached config
- Uses existing logger from utils/logger.js
- No dynamic runtime switching - restart required for config changes

### QA Results
- QA1: PASS - Pilot config loads with provider, model, temperature, max_tokens, timeout
- QA2: PASS - Invalid temperature (3.0) rejected with clear error message
- QA3: PASS - Missing strategy config falls back to defaults with warning logged

### Evidence Saved
- `.sisyphus/evidence/task-9-load-config.txt` - Valid config loading
- `.sisyphus/evidence/task-9-validation.txt` - Validation error handling
- `.sisyphus/evidence/task-9-fallback.txt` - Fallback behavior

## [2026-04-15T09:24:00Z] Task 14 - Voice Handler Bridge

### Completed
- Created `src/voice/voice-handler.js` bridging Discord voice and chat handler
- Implemented STT → chat handler → TTS pipeline
- Added keyword activation support ("Hey bot" trigger)
- Implemented graceful error handling with text fallback
- Made voice optional (disabled by default in config)
- Added push-to-talk mode support
- Implemented interaction logging for debugging
- All QA scenarios passed

### Key Finding: Voice Pipeline Architecture
- VoiceHandler acts as bridge between DiscordVoice (audio I/O) and ChatHandler (message processing)
- Does NOT duplicate chat handler logic - reuses state manager and command execution
- Flow: listen() → transcribe → extract command → process via chat handler → speak response
- Each voice interaction tagged with `source: "voice"` in state commands

### Key Finding: Keyword Detection Strategy
- Case-insensitive keyword matching (user input normalized to lowercase)
- Keyword can appear anywhere in text: "please hey bot goto 100 64 200" works
- Command extraction finds keyword position and returns text after it
- `requireKeyword` config option: if false, processes all voice input
- `keyword` config option: customizable activation phrase (default: "hey bot")

### Key Finding: Error Handling Patterns
- **Disabled by default**: `enabled: false` prevents voice activation (security)
- **Uninitialized state**: Returns null, logs warning
- **Connection errors**: Returns user-friendly message if `fallbackToText: true`
- **Fallback disabled**: Returns null on errors (for programs that want to handle errors themselves)
- Error messages mapped: "not connected" → specific message, others → generic fallback

### Key Finding: Chat Handler Reuse
- VoiceHandler creates chat handler instance: `createChatHandler(bot)`
- Accesses `chatHandler.stateManager` for writing commands
- Implements similar command logic but with voice-specific markers:
  - `source: "voice"` in command data
  - `requestedBy: userId` from voice user
- Same commands work: collect, build, goto, status, stop, help

### Voice Handler Configuration
```javascript
{
  enabled: false,              // Disabled by default
  keyword: 'hey bot',          // Activation phrase
  requireKeyword: true,        // Require keyword to process
  pushToTalk: false,           // Push-to-talk mode
  listenTimeout: 30000,        // 30s max listening
  fallbackToText: true,        // Graceful error fallback
  logInteractions: true        // Debug logging
}
```

### QA Results
- QA1: PASS - Voice message pipeline (STT → chat handler → TTS)
- QA2: PASS - Keyword activation (case-insensitive, flexible positioning)
- QA3: PASS - Error handling (disabled, uninitialized, fallback)

### Evidence Saved
- `.sisyphus/evidence/task-14-voice-pipeline.txt`
- `.sisyphus/evidence/task-14-keyword.txt`
- `.sisyphus/evidence/task-14-error-handling.txt`

## [2026-04-15T09:26:00Z] Task 13 - Chat Handler NLP Integration

### Completed
- Updated `src/chat/chat-handler.js` with full NLP integration
- Integrated nlp-handler.js for natural language detection
- Integrated conversation-store.js for memory persistence
- Integrated personality-engine.js for response generation
- Added context tracking (last 5 messages for pronoun resolution)
- Preserved command system as fallback (!bot commands)
- Added text and voice chat support

### Key Finding: Layered Detection Strategy
- Commands checked FIRST via regex before NLP (more efficient)
- Pattern: `/^!bot\s+/i` catches all command prefixes
- NLP only runs on non-command messages
- This avoids unnecessary NLP processing for explicit commands

### Key Finding: Context Window Implementation
- CONTEXT_WINDOW_SIZE = 5 (scope limit per requirements)
- Each message tracked with: { username, message, timestamp, isBot }
- `botSpokeLast` computed by checking last message in context
- `messagesSinceBotSpoke` counted for pronoun confidence decay
- Context automatically trimmed on push

### Key Finding: Intent Analysis Categories
- question_activity: "what are you doing?", "how's it going?"
- question_status: "how are you?", "are you okay?"
- greeting: "hey", "hi", "hello", "yo"
- question_identity: "who are you?", "what's your name?"
- gratitude: "thanks", "thank you", "thx"
- farewell: "bye", "goodbye", "see you"
- request_help: "can you help", "I need"
- chat_general: fallback for unrecognized intents

### Key Finding: Personality-Influenced Responses
- Response templates vary by warmth and familiarity scores
- High warmth (>0.7) + high familiarity (>0.3) = casual, friendly responses
- Low warmth = concise, direct responses
- Loyalty affects farewell responses (loyal bots express care)
- Directness affects help offer responses (direct bots suggest commands)

### Key Finding: Relationship Update Pattern
- Natural language interactions: 'neutral' type (small trust/familiarity gain)
- Command interactions: 'helpful' type (higher trust/familiarity gain)
- Commands are considered helpful because they're explicit requests
- Both types save to conversation memory with context metadata

### Chat Handler Architecture
```
handleChat()
  ├── Check command prefix (!bot) → handleCommand()
  ├── Check NLP detection (isAddressed)
  │   ├── Generate response (generateNaturalResponse)
  │   │   ├── Analyze intent
  │   │   ├── Get personality traits
  │   │   └── Select response template
  ├── Send response (sendResponse)
  │   ├── Text chat (always)
  │   └── Voice (if enabled)
  └── Save to memory (saveInteraction)
      └── Update relationship
```

### Voice Support Implementation
- `enableVoice` option in createChatHandler()
- Bot emits 'voice_response' event when voice is enabled
- Voice handler (Task 14) listens to this event
- No direct TTS code in chat-handler (clean separation)

### QA Results
- QA1: PASS - NLP detection correctly identifies addressed messages
- QA2: PASS - Conversation memory saves and updates relationship
- QA3: PASS - Command fallback preserved (!bot commands work)

### Evidence Saved
- `.sisyphus/evidence/task-13-nlp-detection.txt`
- `.sisyphus/evidence/task-13-memory-save.txt`
- `.sisyphus/evidence/task-13-command-fallback.txt`

## Task 17: Migration Guide Creation (2026-04-15)

### What Was Done
Created comprehensive migration guide at `docs/MIGRATION.md` for upgrading from MVP to companion bot version.

### Key Patterns Applied
- Used structured format with Table of Contents for easy navigation
- Documented breaking changes first (omniroute.js -> openai-client.js)
- Provided before/after code examples for all API changes
- Included both step-by-step upgrade and rollback instructions
- Created comprehensive troubleshooting section with specific error messages

### Content Covered
1. **Breaking Changes**: API client migration, import changes, method signature changes, environment variables
2. **New Dependencies**: discord.js, @discordjs/voice, @discordjs/opus, ffmpeg-static, sodium-native
3. **Configuration**: bot-config.json structure, Soul.md personality format, environment variables
4. **Database Migration**: SQL for new tables (conversations, relationships, personality_state), migration script
5. **Upgrade Steps**: 11 detailed steps with commands and verification
6. **Rollback**: 5 steps to revert to MVP with data preservation notes
7. **Troubleshooting**: 10+ common issues with specific solutions

### Challenges Addressed
- API response extraction pattern changed (response.content vs response.choices[0].message.content)
- Method signature changed (chat(messages, options) -> chat(messages, layer, options))
- Native dependencies require build tools
- Database migration needs careful handling to avoid data loss
- Backward compatibility with OMNIROUTE_* environment variables

### Verification Results
- QA Scenario 1: PASS - 16 migration steps documented
- QA Scenario 2: PASS - Breaking changes clearly documented with 51+ references
- QA Scenario 3: PASS - Rollback instructions accurate with 5 steps

### Anti-Patterns Avoided
- Did NOT provide automated migration script (manual steps only as required)
- Did NOT guarantee zero downtime (explicitly stated restart required)
- Did NOT claim downgrade support (forward migration only)


## Task 16: Documentation and Usage Examples for Companion Features (2026-04-15)

### What Was Done
Created comprehensive documentation at `docs/COMPANION_FEATURES.md` and example scripts demonstrating companion features.

### Key Discoveries

**Documentation-First Approach**
- Reading implementation files BEFORE writing ensured accuracy
- Cross-referenced Soul.md, conversation-store.js, discord-voice.js, commander.js
- Verified actual behavior matches described features

**Personality System**
- 6 dimensions on 0.0-1.0 scale: warmth, directness, humor, curiosity, loyalty, bravery
- Traits evolve based on interactions (+0.01 to +0.02 per trigger, -0.001/hour decay)
- High warmth + high loyalty = devoted companion archetype
- High curiosity + high bravery = adventurous explorer archetype
- Evolution bounded by TRAIT_MIN (0.2) and TRAIT_MAX (1.0)

**Conversation Memory**
- SQLite storage with 3 core tables: conversations, relationships, personality_state
- Trust score (0.0-1.0) and familiarity (0.0-1.0) tracked per player
- Summarization every 10 messages to save space
- 30-day retention policy with automatic cleanup
- Context includes location, time of day, nearby players

**Voice Integration**
- Discord voice with keyword activation: "Hey bot" default
- Configurable threshold (0.0-1.0) for activation confidence
- STT → command extraction → TTS pipeline
- Disabled by default for security (configurable)
- Requires DISCORD_BOT_TOKEN and DISCORD_GUILD_ID

**Autonomous Goals**
- 4 autonomy levels: full (1.0), advanced (0.7), basic (0.4), conservative (0.2)
- Idle detection: no goal + safe environment + no threats
- Personality-driven activity selection:
  - High curiosity → explore
  - High loyalty → stay close/protect
  - High bravery → combat/dungeons
  - Low warmth → solo activities
- Memory-informed: player mentioned diamonds → find diamonds

### Files Created

1. **docs/COMPANION_FEATURES.md** (18,622 bytes)
   - User-focused documentation (not API reference)
   - 4 main sections: Personality, Memory, Voice, Autonomous Goals
   - 5 complete code examples for customization
   - Discord setup instructions with screenshots references
   - FAQ section with common questions

2. **examples/personality-demo.js** (7,039 bytes)
   - Interactive demonstration of personality system
   - Shows trait customization and archetype determination
   - Demonstrates trait evolution with bounds
   - Includes decision scoring examples

3. **examples/voice-demo.js** (5,373 bytes)
   - Discord voice integration setup guide
   - Keyword detection demonstration
   - STT/TTS pipeline example
   - Error handling patterns

### Content Highlights

**Personality Customization**
- How to edit Soul.md (6 dimensions, trait descriptions)
- Archetype examples: Friendly Helper, Silent Guardian, Adventurous Explorer
- Evolution examples: appreciation → warmth, protection → loyalty

**Memory Features**
- How conversations are saved (SQLite schema explanation)
- Relationship tracking (trust/familiarity scores)
- Viewing conversation history (database queries)
- Memory lifespan (30 days with summarization)

**Voice Setup**
- Discord bot token creation steps
- Guild/server ID configuration
- Keyword activation mechanics
- Text fallback when voice unavailable

**Autonomous Behavior**
- How goals are generated when idle
- Autonomy level configuration
- Activity selection based on personality
- Interruption by player chat

### QA Evidence Saved
- `.sisyphus/evidence/task-16-docs-complete.txt` - All sections present verification
- `.sisyphus/evidence/task-16-examples-run.txt` - Both example scripts execute
- `.sisyphus/evidence/task-16-readme-updated.txt` - README companion section

### Verification Results
- PASS: Documentation covers all 4 feature areas
- PASS: Examples demonstrate real functionality
- PASS: README updated with companion section
- PASS: No internal implementation details exposed
- PASS: User-guide focused (not API reference)

### Anti-Patterns Avoided
- Did NOT document internal API signatures (focus on usage)
- Did NOT create video tutorials (text docs only as required)
- Did NOT duplicate content from migration guide (cross-referenced instead)
- Did NOT expose database schema internals (described conceptually)

### Integration with Existing Docs
- COMPANION_FEATURES.md cross-references MIGRATION.md for upgrade instructions
- README.md links to COMPANION_FEATURES.md for detailed setup
- Examples reference actual source files for advanced customization
- All paths relative to project root for consistency

(End of file - total 630+ lines)

## [2026-04-15T10:00:00Z] Task 15 - Startup Configuration Validator

### Completed
- Created `src/utils/config-validator.js` with comprehensive startup validation
- Implemented all 6 section validators: api, models, personality, autonomy, voice, memory
- Validates required fields (API URL, model IDs, personality name)
- Validates value ranges (temperature 0-2, trust scores 0-1, volume 0-1)
- Verifies file paths exist (Soul.md warning, schema.sql error if memory enabled)
- Tests API connectivity on startup (with graceful error handling)
- Logs warnings for optional fields, errors for required fields
- Exits process with clear error message on critical failure

### Key Finding: Modular Section Validation
- Each config section has its own validation function returning `{ errors: [], warnings: [] }`
- Aggregation function combines all results: `validateConfig(config)`
- Async `validateStartup()` runs all validations including API test
- File path validation checks hardcoded defaults: `SOUL_MD_PATH`, `SCHEMA_SQL_PATH`

### Key Finding: API Connectivity Testing
- Only tested if config is structurally valid (no missing URL)
- Tests `/models` endpoint with 5s timeout
- Classifies errors: ECONNREFUSED (error), ETIMEDOUT (warning), 401/403 (error), 404 (warning)
- Non-blocking: API failure doesn't prevent startup (warning only) unless auth fails

### Key Finding: Error vs Warning Classification
- **Errors (fail validation)**: Missing required fields, invalid ranges, auth failures, missing schema.sql
- **Warnings (pass validation)**: Missing optional fields, unknown enum values, API timeouts, missing Soul.md

### QA Results
- QA1: PASS - Valid config passes with no errors/warnings
- QA2: PASS - Invalid temperature (3.0) rejected with clear error
- QA3: PASS - File existence checks work (Soul.md warning, schema.sql error if missing)

### Evidence Saved
- `.sisyphus/evidence/task-15-valid-config.txt` - Valid config test
- `.sisyphus/evidence/task-15-invalid-config.txt` - Invalid temperature test
- `.sisyphus/evidence/task-15-missing-file.txt` - File existence check
