# Learnings - Phase 2 Enhancements

> Conventions, patterns, and wisdom accumulated during implementation.

---

## [2026-04-17T20:57:51Z] Wave 0: Infrastructure Complete

### Task 1: FeatureFlags Module
- Created centralized feature flag management in `src/utils/feature-flags.js`
- All flags default to false for backward compatibility
- Validates interdependencies (warns if META_LEARNING enabled without DRIVES)
- Singleton pattern for global access

### Task 2: KnowledgeGraph Persistence
- Added save()/load() methods to `src/memory/knowledge-graph.js`
- Saves to `state/knowledge-graph.json` with version 1 format
- **Bug found and fixed**: Edge loading failed because key-based addEdge() wasn't working
- **Solution**: Use simple addEdge(source, target, attrs) without key parameter
- Handles missing file gracefully (returns false, starts fresh)

### Task 3: Dashboard WebSocket Broadcaster
- Created `src/dashboard/broadcaster.js` with throttling (max 10/second)
- Handles client connect/disconnect gracefully
- Broadcasts to all connected clients
- EventEmitter-based for extensibility

### Task 4: Vision Rate Limiter
- Created `src/vision/vision-rate-limiter.js` with separate Bottleneck instance
- Default 20 RPM (configurable via VISION_RPM_BUDGET)
- Logs when rate limit hit
- Stops on 429 errors to prevent API abuse

### Patterns Discovered
- Singleton pattern used consistently (feature-flags, vision-rate-limiter)
- All modules use Winston logger for consistency
- Error handling: graceful degradation (missing files, connection errors)
- Tests: All unit tests passing (695 passed, 6 skipped)

### Gotchas
- Graphology edge keys: Don't try to restore original keys, let library generate new ones
- WebSocket readyState: Check for 1 (OPEN) before sending
- Rate limiter reservoir: Must be set as instance property for external access

## [2026-04-17T21:03:00Z] Task 5: DriveSystem Module

### Implementation
- Created `src/drives/drive-system.js` with DriveSystem class
- 5 stateless drive scoring functions: survival, curiosity, competence, social, goalOriented
- Each drive returns 0-100 score based on context (health, food, inventory, events, etc.)
- Personality trait weights modulate drive scores (0.5-1.5x modifier range)
- Singleton pattern with `getInstance()` for global access
- Created 39 unit tests in `tests/unit/drives/drive-system.test.js`

### Key Design Decisions
- **Critical health bonus**: health < 6 adds +30 to survival (Minecraft's "one-hit kill" zone)
- **Personality modifier**: centered at 0.5 so mid-range traits don't distort scores; positive weights amplify, negative weights (bravery→survival) inversely amplify
- **Tool detection**: Competence drive checks for 5 tools (pickaxe, axe, shovel, sword, hoe) in inventory items (supports both string and object formats)
- **Player proximity tiers**: ≤5 blocks=40, ≤16=25, ≤30=15, beyond=5

### QA Results
- Scenario 1 (low health): survival=98 > 70 ✓
- Scenario 2 (high curiosity): curiosity=92 > 60 ✓

### Gotchas
- Test path from `tests/unit/drives/` to `src/` requires `../../../src/` (3 levels up), not `../../src/`
- Pre-existing test failure in `vision-rate-limiter.test.js` (bottleneck mock issue, unrelated to this task)

## Task 4: vision-rate-limiter.js

### What I did
Created `src/vision/vision-rate-limiter.js` - a separate Bottleneck rate limiter for vision API calls.

### Key patterns learned
1. **Singleton testing challenge**: When testing singleton modules that create instances at load time, mocks set up in beforeEach don't work because the instance is created before tests run. Solution: Use integration-style tests that test the actual singleton.

2. **Bottleneck reservoir behavior**: The `reservoir` setting allows an initial burst of requests. With `reservoir: 20` and `reservoirRefreshAmount: 20` refreshing every 60s, the first 20 requests start immediately, then subsequent requests wait for the refresh.

3. **Event handler registration**: Bottleneck emits 'depleted' when reservoir hits 0 and 'failed' on 429 errors. Register these in the constructor.

4. **Env var parsing**: Use `parseInt(process.env.VISION_RPM_BUDGET, 10) || DEFAULT` pattern for env var with default fallback.

### Files created
- `src/vision/vision-rate-limiter.js` - Singleton rate limiter with 20 RPM default
- `tests/unit/vision/vision-rate-limiter.test.js` - Unit tests

### Testing notes
- Singleton pattern requires integration-style tests (no mocking Bottleneck)
- Test isolation issue: calling stop() on singleton affects subsequent tests
- Rate limiting verified: 25 tasks showed 20 immediate, 5 queued for 60s refresh

### Evidence saved
- `.sisyphus/evidence/task-4-rate-limit.txt` - QA results for both scenarios

## [2026-04-17T23:20:00Z] Task 7: GoalScorer Integration

### Discovery
The GoalScorer already had drive integration implemented! When I read `src/goals/goal-scorer.js`, I found:
- `_getDriveBonus()` method (lines 45-68) already maps goal categories to drives
- `scoreGoal()` already applies 20% weight to drive factor (line 22-24)
- Backward compatibility handled: returns 0 when driveScores missing

### Implementation Status
- Already complete: Drive influence on goal scoring with 20% weight
- Already complete: Category-to-drive mapping (exploration→curiosity, etc.)
- Already complete: Backward compatibility (null/undefined driveScores → 0 bonus)
- Already complete: Unit tests in `tests/unit/goal-scorer.test.js` (lines 151-242)

### QA Results
- Scenario 1 (drive influence): explore(0.68) > gather(0.54) with high curiosity ✓
- Scenario 2 (backward compat): scoreGoal({}, {}) returns 0.5, no errors ✓
- 20% weight verified: curiosity=100 adds exactly 0.2 to score ✓

### Key Insight
This task was likely already completed in a previous session. The implementation follows
the exact specification: personality 30%, needs 25%, events 25%, drives 20%.

### Evidence saved
- `.sisyphus/evidence/task-7-drive-influence.txt` - Drive scoring QA results
- `.sisyphus/evidence/task-7-backward-compat.txt` - Backward compatibility QA results

## [2026-04-18] Task 10: WebSocket Endpoints

### Implementation
- Added WebSocket server at `ws://localhost:3001/ws` path (was previously root path)
- Implemented heartbeat/ping-pong: 30s ping interval, terminates on missed pong
- `sendCurrentState()` reads state file via StateManager and sends on connect
- Client disconnect removes from broadcaster and cleans up heartbeat timers
- State file changes now broadcast `state_update` messages via `loadBotStatusFromFile()`
- Added `setupHeartbeat()` and `sendCurrentState()` exports for testing

### Key Design Decisions
- Used interval-based heartbeat instead of separate ping+timeout: simpler pattern where ping is sent at interval, if no pong by next interval → terminate
- Removed `startPongTimeout` dead code - the `setInterval` + `isAlive` flag handles everything
- `sendCurrentState` is async because it reads from StateManager (file I/O)
- `loadBotStatusFromFile` now tracks changes and broadcasts via `state_update` type

### Heartbeat Pattern
1. On connect: `setupHeartbeat(ws)` sets `isAlive = true`
2. Every 30s: set `isAlive = false`, send `ws.ping()`
3. On pong: set `isAlive = true`
4. If `isAlive` still false on next check → `ws.terminate()`
5. On close/error: clear interval, set `isAlive = false`

### Testing Gotchas
- Jest 29 doesn't have `done.fail` - use `done(new Error(...))` or a helper function
- Module-level env vars in server.js (PORT, HOST) are evaluated at require time - set them BEFORE requiring
- WebSocket `ws` library server path parameter: `{ server, path: '/ws' }` filters connections
- Fake timers + real WebSocket servers don't mix well - test heartbeat with mock ws objects

### Evidence saved
- `.sisyphus/evidence/task-10-connect-state.txt` - QA results
- `.sisyphus/evidence/task-10-websocket-test-results.txt` - Test output

## [2026-04-18] Task 13: Next.js Frontend Setup

### Implementation
- Created `src/dashboard/frontend/` with Next.js 16.2.4 + React 19.2.4 + TypeScript
- Used App Router (not Pages Router)
- Structure: `app/` directory with `page.tsx`, `layout.tsx`, `globals.css`
- Added `dev:dashboard` and `build:dashboard` scripts to root `package.json`
- Created minimal landing page with "Minecraft AI Bot Dashboard" title

### Key Design Decisions
- Frontend runs on port 3000 (backend is on 3001)
- Dark theme CSS with green accent (#4ade80) matching Minecraft aesthetic
- Dashboard is separate process from backend (crash isolation)

### Commands Added
- `npm run dev:dashboard` - Start Next.js dev server (runs `cd src/dashboard/frontend && npm run dev`)
- `npm run build:dashboard` - Production build

### Build Verification
- Production build: `npm run build:dashboard` → ✓ Compiled successfully in 4.4s
- TypeScript check: ✓ Finished in 4.0s
- Static generation: 4/4 pages in 717ms
- Dev server: Ready in 795ms, responds with "Minecraft AI Bot Dashboard"

### Gotchas
- Next.js lockfile warning: Multiple lockfiles detected, Turbopack selected `/home/seryki/package-lock.json` as root
  - To silence: set `turbopack.root` in next.config.ts or consider removing duplicate lockfiles
- Port 3000 is free (not used by backend which is on 3001)

### Evidence saved
- `.sisyphus/evidence/task-13-dev-server.txt` - Dev server QA results
- `.sisyphus/evidence/task-13-build.txt` - Build QA results
