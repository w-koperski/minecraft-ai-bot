# Learnings - state-manager Implementation

## Key Patterns Discovered

### 1. Jest Mocking for state-manager
- **Problem**: Using `jest.resetModules()` broke `jest.spyOn` mocks because the spied module reference became stale after re-require
- **Solution**: Use `jest.mock` with a module-level mock object that persists across `resetModules()`
- **Pattern**:
  ```javascript
  const mockLockfile = {
    lock: jest.fn(...),
    unlock: jest.fn(...)
  };
  jest.mock('lockfile', () => mockLockfile);
  // Then in tests: mockLockfile.lock.mockClear(), mockImplementationOnce(), etc.
  ```

### 2. TDD Approach Used
- **RED**: Wrote tests first covering: null reads, file I/O, schema validation, concurrent writes, lock timeout
- **GREEN**: Implemented minimal StateManager with lockfile, async/await, schema validation
- **Tests pass first time** once mock setup was correct

### 3. lockfile Library API
- `lockfile.lock(path, opts, cb)` - opts requires `{ timeout: ms, retries: num }`
- `lockfile.unlock(path, cb)`
- Callback pattern: `cb(err)` where err is null on success

### 4. Schema Validation Strategy
- Default schemas for state, plan, commands built into constructor
- `addSchema(key, schema)` allows runtime schema registration
- Only validates if schema exists for key (allows arbitrary keys for testing)

### 5. State File Storage
- Files stored as `{stateDir}/{key}.json`
- Uses `fs.promises` for async I/O throughout
- JSON.stringify with indent for readable state files

## Files Created
- `src/utils/state-manager.js` - StateManager class
- `tests/unit/state-manager.test.js` - 19 test cases

## Test Results
- 27 tests passing (includes rate-limiter tests)
- Exit code 0

## Commander Layer Implementation (2026-04-14)

### What Was Built
- `src/layers/commander.js` (732 lines) - Complete monitoring and goal-setting layer
- `tests/unit/commander.test.js` (21 test cases) - Full unit test coverage

### Key Features
1. **10-second monitoring loop** with adaptive decision-making
2. **Multi-tier memory access**: Working Memory (state files), STM (last 20 actions), LTM (placeholder)
3. **Stuck detection** using 4 heuristics: no progress (30s), same goal (2min), repeated failures (3x), position unchanged
4. **4 decision types**: continue, new_goal, correct_strategy, emergency_stop
5. **Robust fallback logic** when LLM fails (emergency stop on critical situations)
6. **Claude Sonnet 4.5 integration** via Omniroute for complex reasoning

### Architecture Decisions
- **File-based communication**: Writes to `state/commands.json` for Strategy layer
- **Stateful monitoring**: Tracks last state, goal, progress time for stuck detection
- **Decision history**: Maintains last 50 decisions for context
- **Error handling**: Consecutive error counter triggers emergency stop after 5 failures

### Test Coverage
All 21 tests passing:
- Memory gathering with error handling
- Threat level assessment (safe/moderate/high)
- Stuck detection (multiple scenarios)
- Decision making (LLM success + fallback)
- Decision execution (all 4 action types)
- Lifecycle management (start/stop)

### Integration Points
- Reads: `state/state.json`, `state/plan.json`, `state/commands.json`, `state/action_error.json`, `state/action_history.json`
- Writes: `state/commands.json`, `state/plan.json` (clears on correction/emergency)
- Uses: StateManager (thread-safe), OmnirouteClient (Claude API), logger

### Performance Characteristics
- Loop frequency: 0.03-0.1 Hz (every 10-30s)
- LLM latency: ~1s per call
- Minimal CPU usage between loops
- Memory footprint: ~50 decisions + 20 STM actions

### Next Steps
Commander is complete. Remaining work:
1. Strategy layer implementation (reads commands.json, writes plan.json)
2. Integration in main bot.js (instantiate and start Commander)
3. End-to-end testing with all 3 layers running

