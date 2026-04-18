# src/utils/ - Shared Utilities

**Purpose:** Cross-cutting concerns used by all 3 AI layers

## Critical Utilities

**state-manager.js** - File-based state with lockfile protection
- Used by: ALL layers
- Purpose: Inter-layer communication (state.json, commands.json, plan.json)
- Locking: 5s timeout prevents race conditions
- Schemas: Validates state structure before write

**rate-limiter.js** - Bottleneck wrapper for API limits
- Used by: omniroute client
- Limit: 448 req/min (80% of 560 RPM hard limit)
- Shared: Across Commander, Strategy, Pilot
- Behavior: Stops on 429 errors to prevent API bans

**omniroute.js** - LLM API client with retry logic
- Used by: ALL layers
- Features: Exponential backoff (3 attempts, 1-8s delays), metrics tracking, health checks
- Models: Routes to Claude/Qwen/Llama based on layer
- Rate limiting: Integrated with rate-limiter

**logger.js** - Winston logging system
- Used by: ALL layers + utilities
- Levels: debug/info/warn/error
- Output: Console + file (10MB files, 7 rotations)
- Format: Structured metadata with timestamps

**vision-enhanced.js** - Game state extraction
- Used by: Pilot layer
- Extracts: Position, health, inventory, entities (32 blocks), blocks, chat
- Purpose: Provides context for LLM decision-making

**config-validator.js** - Startup validation
- Used by: Main entry point (src/index.js)
- Validates: API connectivity, file paths, schema compliance
- Exits: Process on validation failure

## Supporting Utilities

- `relationship-state.js` - SQLite relationship tracking (trust, familiarity)
- `model-config.js` - Provider/model validation (OpenAI, Anthropic, Nvidia)
- `openai-client.js` - Alternative to omniroute for OpenAI-compatible endpoints
- `schemas.js` - JSON schema definitions for state files
- `errors.js` - Custom error types

## Usage Patterns

**State communication:**
```javascript
const StateManager = require('./state-manager');
const manager = new StateManager();
await manager.write('state', stateData);  // Locks, validates, writes
const state = await manager.read('state');  // Locks, reads, validates
```

**Rate-limited API calls:**
```javascript
const OmnirouteClient = require('./omniroute');
const client = new OmnirouteClient();
const response = await client.pilot(prompt, { temperature: 0.3 });
// Rate limiter automatically enforces 448 RPM
```

**Logging:**
```javascript
const logger = require('./logger');
logger.info('Message', { metadata: 'value' });
logger.error('Error occurred', { error: err.message });
```

## Editing Guidance

**state-manager:**
- Changes affect inter-layer communication
- Test locking under concurrent access
- Update schemas when state format changes

**rate-limiter:**
- Adjust limits carefully (560 RPM hard limit)
- Changes affect all 3 layers simultaneously
- Monitor for 429 errors after changes

**omniroute:**
- Test retry logic with actual API failures
- Metrics tracking affects performance monitoring
- Health checks run on startup

**logger:**
- Log levels affect debugging capability
- File rotation prevents disk space issues
- Structured metadata enables log analysis

## Dependencies

- `lockfile` - File locking (state-manager)
- `bottleneck` - Rate limiting (rate-limiter)
- `axios` - HTTP client (omniroute, openai-client)
- `winston` - Logging (logger)
- `sqlite3` - Database (relationship-state)

## Testing

- Unit tests: `tests/unit/state-manager.test.js`, `tests/unit/omniroute.test.js`, `tests/unit/rate-limiter.test.js`
- Integration tests: Concurrent state access, rate limit enforcement
