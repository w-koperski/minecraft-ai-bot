# src/layers/ - 3-Layer AI System

**Purpose:** Core AI architecture implementing Commander → Strategy → Pilot hierarchy

## Files

- `commander.js` (1044 lines) - High-level goal monitoring, autonomous generation, LLM decision-making
- `strategy.js` (661 lines) - Multi-step planning with memory management
- `pilot.js` (595 lines) - Fast reactions with adaptive loop (200ms/500ms/2000ms)
- `action-awareness.js` - PIANO verification system wrapping bot actions

## Architecture

**3-layer hierarchy:**
```
Commander (Reasoning model, ~1s) → commands.json
    ↓
Strategy (Planning model, 410ms) → plan.json
    ↓
Pilot (Fast model, 210ms) → Mineflayer actions
```

**Communication:** File-based via state-manager (state.json, commands.json, plan.json)

## Key Patterns

**Adaptive Pilot Loop:**
- Danger: 200ms (hostile mobs <16 blocks, lava <8 blocks, health <6)
- Active: 500ms (executing actions)
- Idle: 2000ms (no threats, no actions)

**Action Awareness (PIANO):**
- Wraps every bot action with pre/post state verification
- Logs mismatches to state/action_error.json
- Prevents "bot thinks it succeeded but didn't" failures

**LLM Integration:**
- Each layer builds custom prompts with personality/relationship context
- Prompts are inline in buildPrompt() methods (no separate prompts/ directory)
- Rate limiting: Configure based on your provider's limits, shared across all 3 layers

**State Management:**
- Commander writes goals to commands.json
- Strategy reads commands.json, writes plans to plan.json
- Pilot reads plan.json, executes actions
- All use StateManager with lockfile (5s timeout)

## Editing Guidance

**Before modifying:**
- Understand inter-layer communication flow (file-based state)
- Test LLM calls thoroughly (can fail silently)
- Changes affect entire 3-layer system
- Personality/relationship integration is critical for consistent behavior

**Common tasks:**
- Adjust loop intervals → check rate limiter impact
- Modify prompts → test with actual LLM models
- Change state format → update all 3 layers + state-manager schemas
- Add new actions → integrate with action-awareness verification

## Dependencies

- `../utils/state-manager` - File-based state with locking
- `../utils/api-client` - LLM API client with rate limiting
- `../utils/logger` - Winston logging
- `../utils/vision-enhanced` - Game state extraction
- `../../personality/personality-engine` - Trait system
- `mineflayer` - Minecraft bot framework

## Testing

- Unit tests: `tests/unit/commander.test.js`, `tests/unit/action-awareness.test.js`
- Integration tests: Layer communication via state files
- E2E tests: Full bot lifecycle with real Minecraft server
