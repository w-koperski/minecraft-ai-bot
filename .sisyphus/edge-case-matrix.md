# Edge Case Test Matrix

**Project:** Project Sid Robustness Implementation
**Task:** 0.3 - Define Edge Case Test Matrix
**Date:** 2026-04-16
**Status:** Complete

---

## Executive Summary

This document defines test scenarios for all 12 edge cases identified by Metis analysis (E1-E12). Edge cases are grouped into 4 categories:

| Category | Edge Cases | Assigned Tasks |
|----------|------------|----------------|
| **Bot Lifecycle** | E1: Death, E2: Disconnection | T1, existing E2E tests |
| **Resource Limits** | E3: Resource Limits, E5: Memory Overflow, E12: RPM Throttling | T2, T5, Rate Limiter |
| **Concurrency** | E4: Race Conditions, E10: Consolidation Failures | T2, StateManager |
| **Logic Failures** | E6: Stuck Detection, E7: Goal Conflicts, E8: Skill Failures, E9: Reflection Errors, E11: Danger False Positives | T1, T3, T7, T9, T11 |

**Coverage:** All 12 edge cases have defined test scenarios.

---

## Edge Case Categories

### Category 1: Bot Lifecycle (E1-E2)
Bot lifecycle edge cases involve fundamental bot state changes that require special handling.

### Category 2: Resource Limits (E3, E5, E12)
Resource limit edge cases involve system constraints that could cause degradation or failure.

### Category 3: Concurrency (E4, E10)
Concurrency edge cases involve timing issues and shared resource access.

### Category 4: Logic Failures (E6-E9, E11)
Logic failure edge cases involve unexpected behavior in decision-making or execution.

---

## Edge Case Details

---

### E1: Death and Respawn

**Priority:** CRITICAL
**Category:** Bot Lifecycle
**Assigned Task:** T1 (Enhanced Action Awareness) + existing E2E tests
**Integration Points:** `error-recovery.test.js` (lines 4-88)

#### Description
Bot dies (killed by mob, lava, void, fall, suffocation) and must respawn to continue operation.

#### Test Scenarios

| ID | Scenario | Test File | Lines |
|----|----------|-----------|-------|
| E1-T1 | Should respawn after death via /kill | error-recovery.test.js | 5-27 |
| E1-T2 | Should maintain health after respawn (full health) | error-recovery.test.js | 29-45 |
| E1-T3 | Should respawn at spawn point | error-recovery.test.js | 47-69 |
| E1-T4 | Should handle multiple deaths in sequence | error-recovery.test.js | 71-87 |
| E1-T5 | Should handle void fall death | error-recovery.test.js | 271-286 |
| E1-T6 | Should handle suffocation damage | error-recovery.test.js | 288-305 |

#### Expected Behavior
1. Death event fires correctly
2. Respawn occurs automatically or on respawn command
3. Health restored to 20/20
4. Position restored to spawn point or bed
5. Current plan cleared (Strategy must replan)
6. Inventory dropped (survival) or retained (creative)
7. Knowledge Graph danger zone recorded at death location

#### Recovery Strategy
```
1. Detect death via bot.on('death')
2. Wait for spawn event
3. Log death cause and location (for Danger Predictor)
4. Mark danger zone at death location
5. Clear current plan (write action_error to signal Strategy)
6. Resume from respawn position
7. Health/food restored automatically by Minecraft
```

#### Test Template
```javascript
describe('Death Recovery', () => {
  test('should respawn after death', async () => {
    const { bot } = await createTestBot({ username: 'EdgeTest_E1_Death' });
    let deathCount = 0;
    let spawnCount = 0;
    
    bot.on('death', () => { deathCount++; });
    bot.on('spawn', () => { spawnCount++; });
    
    bot.chat('/kill');
    
    const respawned = await waitForCondition(
      () => deathCount > 0 && spawnCount >= 2,
      5000
    );
    
    expect(respawned).toBe(true);
    expect(deathCount).toBe(1);
    
    await disconnectBot(bot);
  });
});
```

---

### E2: Disconnection and Reconnection

**Priority:** CRITICAL
**Category:** Bot Lifecycle
**Assigned Task:** T1 (Enhanced Action Awareness)
**Integration Points:** `error-recovery.test.js` (lines 169-233)

#### Description
Bot disconnects from server (network issues, kick, server shutdown) and needs to reconnect or handle clean shutdown.

#### Test Scenarios

| ID | Scenario | Test File | Lines |
|----|----------|-----------|-------|
| E2-T1 | Should handle graceful disconnection | error-recovery.test.js | 170-181 |
| E2-T2 | Should reconnect after disconnection | error-recovery.test.js | 183-195 |
| E2-T3 | Should maintain state across reconnections | error-recovery.test.js | 197-211 |
| E2-T4 | Should handle kick from server | error-recovery.test.js | 213-232 |
| E2-T5 | Should handle world boundary | error-recovery.test.js | 254-268 |

#### Expected Behavior
1. End event fires on disconnect
2. State persisted to disk before disconnect
3. Reconnection attempts follow backoff strategy
4. State restored on reconnection
5. Player notified of disconnect status
6. Resources cleaned up properly

#### Recovery Strategy
```
1. Detect disconnect via bot.on('end')
2. Persist current state to disk (if graceful)
3. Attempt reconnection with exponential backoff (max 3 attempts)
4. Restore state from last known state.json
5. Reload plan from plan.json (may be stale)
6. Notify Strategy layer of disconnect via action_error
7. If kicked, log kick reason for analysis
```

---

### E3: Resource Limits (Memory, CPU)

**Priority:** HIGH
**Category:** Resource Limits
**Assigned Task:** T2 (Memory Consolidation), T5/T6 (Skill System)
**Integration Points:** `validation-report.md` (A5-A7), `knowledge-graph.js`

#### Description
Bot approaches or exceeds resource limits (memory >500MB, Knowledge Graph >10k nodes, event queue overflow).

#### Test Scenarios

| ID | Scenario | Test Conditions |
|----|----------|-----------------|
| E3-T1 | Should handle Knowledge Graph exceeding 10k nodes | KG.consolidate() runs, LRU eviction active |
| E3-T2 | Should handle rapid state file writes | StateManager with lockfile (5s timeout) |
| E3-T3 | Should handle event queue overflow | Multiple concurrent events |
| E3-T4 | Should handle high loop frequency | Danger mode at 200ms (5Hz) |

#### Expected Behavior
1. Memory usage stays under 500MB
2. Knowledge Graph node count under 10,000
3. Consolidation timer fires every 10 minutes
4. LRU eviction drops low-importance memories
5. State writes don't block (>5s timeout)
6. Loop intervals respect rate limits

#### Recovery Strategy
```
1. Monitor memory usage (process.memoryUsage())
2. If KG >8000 nodes, trigger early consolidation
3. If memory >400MB, reduce loop frequency
4. If state write times out, skip write and log error
5. On consolidation failure, log and retry next interval
6. If event queue backs up, drop lowest priority events
```

---

### E4: Race Conditions in State Files

**Priority:** HIGH
**Category:** Concurrency
**Assigned Task:** T2 (Memory Consolidation Timer)
**Integration Points:** `state-manager.js`, `integration-matrix.md` (pair 7)

#### Description
Multiple layers (Commander, Strategy, Pilot) access state files simultaneously, potentially causing race conditions.

#### Test Scenarios

| ID | Scenario | Test Conditions |
|----|----------|-----------------|
| E4-T1 | Commander writes while Strategy reads | File locking active |
| E4-T2 | Pilot reads while Commander writes | lockfile timeout 5s |
| E4-T3 | Rapid read/write cycles | Multiple operations per second |
| E4-T4 | Lock timeout under contention | 3+ concurrent writers |

#### Expected Behavior
1. File locking prevents simultaneous writes
2. Read operations see consistent snapshot
3. Lock timeout returns error (not hangs)
4. Failed writes don't corrupt state file
5. Recovery possible after lock timeout

#### Recovery Strategy
```
1. Use lockfile library with 5s timeout
2. On lock timeout, log error and skip write
3. Last successful write wins (eventual consistency)
4. StateManager.read() returns null on error
5. Each layer handles null state gracefully
6. Consider atomic writes (write to temp, rename)
```

---

### E5: Memory Overflow (>10k Knowledge Graph Nodes)

**Priority:** HIGH
**Category:** Resource Limits
**Assigned Task:** T2 (Memory Consolidation Timer)
**Integration Points:** `knowledge-graph.js` (lines 700+), `validation-report.md` (A2)

#### Description
Knowledge Graph exceeds 10,000 nodes, triggering LRU eviction and potential data loss.

#### Test Scenarios

| ID | Scenario | Test Conditions |
|----|----------|-----------------|
| E5-T1 | Should evict old nodes when exceeding 10k | KG with 10k+ nodes |
| E5-T2 | Should consolidate STM → Episodic after 1 hour | 1 hour old memories |
| E5-T3 | Should consolidate Episodic → LTM after 24 hours | 24 hour old memories |
| E5-T4 | Should drop low-importance memories (< threshold) | Importance < 3 |
| E5-T5 | Should handle consolidate() taking >100ms | 10k nodes worst case |

#### Expected Behavior (per validation-report.md)
- consolidate() completes in <70ms for 10k nodes (7ms per 1000)
- STM → Episodic after 1 hour if importance >= 3
- Episodic → LTM after 24 hours if importance >= 6
- Drop memories with importance < 3
- Node count stays under 10,000

#### Recovery Strategy
```
1. Monitor node count via KG.getStats()
2. If >8000, trigger early consolidation
3. If consolidate() fails, log error and continue
4. Next interval will retry consolidation
5. If node count critical (>9500), aggressive eviction
6. Log all dropped nodes for debugging
```

---

### E6: Stuck Detection and Recovery

**Priority:** HIGH
**Category:** Logic Failures
**Assigned Task:** T1 (Enhanced Action Awareness)
**Integration Points:** `pilot.js` (lines 534-578), `error-recovery.test.js` (lines 90-167)

#### Description
Bot becomes stuck (can't move, pathfinding fails, entity trapped) and needs to detect and recover.

#### Test Scenarios

| ID | Scenario | Test File | Lines |
|----|----------|-----------|-------|
| E6-T1 | Should detect being stuck (no movement) | error-recovery.test.js | 91-107 |
| E6-T2 | Should recover from stuck position | error-recovery.test.js | 109-146 |
| E6-T3 | Should teleport out of stuck situation | error-recovery.test.js | 148-166 |
| E6-T4 | Stuck detection: <0.1 block for 10s | pilot.js | 534-578 |

#### Expected Behavior (per pilot.js lines 534-578)
- Stuck detected if distance <0.1 blocks AND time >10 seconds
- Check runs every 5 seconds
- On stuck detection, write `pilot_stuck` to state
- Strategy layer receives stuck signal and replans
- Recovery attempts: re-pathfind, jump, or teleport

#### Recovery Strategy
```
1. Stuck detection runs every 5s (pilot.js startStuckDetection)
2. If stuck detected:
   a. Write pilot_stuck state with position and duration
   b. Log warning with position
   c. Reset lastMoveTime to avoid repeated signals
3. Strategy reads pilot_stuck, generates new plan
4. Recovery options:
   a. Clear path and retry pathfinding
   b. Jump to escape block
   c. Teleport to safe location (last known good)
5. If stuck persists after 3 recovery attempts, signal Commander
```

---

### E7: Goal Conflicts

**Priority:** MEDIUM
**Category:** Logic Failures
**Assigned Task:** T11 (Goal Scorer), T12 (Commander Integration)
**Integration Points:** `integration-matrix.md` (pairs 3, 18, 19)

#### Description
Multiple goals conflict (player goal vs autonomous goal, resource vs safety, short-term vs long-term).

#### Test Scenarios

| ID | Scenario | Test Conditions |
|----|----------|-----------------|
| E7-T1 | Player goal overrides autonomous goal | commands.json source='player' vs 'autonomous' |
| E7-T2 | Dangerous goal location reduces score | GoalScorer + DangerPredictor |
| E7-T3 | Goal with unmet prerequisites filtered | GoalGraph.getAchievableGoals() |
| E7-T4 | High curiosity increases exploration score | Personality scoring |

#### Expected Behavior (per integration-matrix.md)
1. Player goals always take priority over autonomous goals
2. Commander checks for player goal first (pair 4)
3. Dangerous locations reduce goal score by 0-50%
4. Goals with unmet prerequisites excluded
5. Personality traits modify scoring (+0.3 max for curiosity)

#### Recovery Strategy
```
1. Commander reads commands.json each loop
2. If player goal exists, use it (priority)
3. If no player goal and autonomousMode=true, generate
4. GoalScorer applies danger penalty before scoring
5. GoalGraph filters by prerequisites
6. Highest scoring achievable goal selected
7. Log goal source for debugging
```

---

### E8: Skill Execution Failures

**Priority:** HIGH
**Category:** Logic Failures
**Assigned Task:** T7 (Skill Executor)
**Integration Points:** `integration-matrix.md` (pairs 1, 11, 12, 13)

#### Description
Skill fails during execution (wrong tool, unreachable block, insufficient resources, skill not found).

#### Test Scenarios

| ID | Scenario | Integration Point |
|----|----------|-------------------|
| E8-T1 | Skill not found in registry | pair 11: getSkill returns null |
| E8-T2 | Low confidence prevents retry | pair 1: confidence < 0.3 |
| E8-T3 | Primitive skill chain fails | pair 12: composite skills |
| E8-T4 | SkillExecutor not initialized | pair 13: Pilot integration |

#### Expected Behavior (per integration-matrix.md)
1. getSkill returns null if skill not found
2. Confidence <0.3 triggers immediate failure (no retry)
3. Confidence 0.3-0.7 uses exponential backoff
4. Confidence >0.7 retries immediately
5. Composite skills fail gracefully on primitive failure

#### Recovery Strategy
```
1. SkillExecutor retrieves skill from Registry
2. If not found, return { success: false, reason: 'skill_not_found' }
3. Before retry, check confidence via ActionAwareness
4. If low confidence, fail immediately
5. On failure, log to action_error.json
6. Strategy reads action_error and replans
7. Consider alternative skill or skip step
```

---

### E9: Reflection Module Errors

**Priority:** MEDIUM
**Category:** Logic Failures
**Assigned Task:** T9 (Reflection Module)
**Integration Points:** `integration-matrix.md` (pairs 2, 16, 17)

#### Description
Reflection module fails to analyze metrics, generate learnings, or store patterns.

#### Test Scenarios

| ID | Scenario | Integration Point |
|----|----------|-------------------|
| E9-T1 | getRecentFailures returns empty | pair 17: ActionAwareness metrics |
| E9-T2 | detectFailurePattern not called | pair 2: Reflection → Failure Detect |
| E9-T3 | Learnings not stored in KG | pair 16: Reflection → Knowledge Graph |
| E9-T4 | getSuccessRate returns undefined | pair 17: ActionAwareness metrics |

#### Expected Behavior (per integration-matrix.md)
1. getSuccessRate() returns 0-1
2. getRecentFailures() returns array of failures
3. detectFailurePattern identifies stuck, wrong_tool, unreachable
4. Pattern stored as semantic memory in Knowledge Graph
5. Learnings logged to file for human review

#### Recovery Strategy
```
1. ReflectionModule.reflect() called every 30 minutes
2. Read metrics from ActionAwareness (getSuccessRate, getRecentFailures)
3. If metrics unavailable, use default values (0.5 success, empty failures)
4. Generate learnings even with partial data
5. Store learnings as semantic memories (type: 'learning')
6. On KG write failure, log to file only
7. Max 5 adjustments per reflection period
```

---

### E10: Memory Consolidation Failures

**Priority:** MEDIUM
**Category:** Concurrency
**Assigned Task:** T2 (Memory Consolidation Timer)
**Integration Points:** `integration-matrix.md` (pair 7), `validation-report.md` (A2)

#### Description
Memory consolidation timer fails (consolidate() throws, timer doesn't fire, stats not logged).

#### Test Scenarios

| ID | Scenario | Test Conditions |
|----|----------|-----------------|
| E10-T1 | consolidate() throws error | Exception during consolidation |
| E10-T2 | Timer doesn't fire | setInterval not called |
| E10-T3 | Stats not logged | Missing logger.info |
| E10-T4 | Consolidation runs too frequently | < 10 minute interval |

#### Expected Behavior (per validation-report.md)
- Timer fires every 10 minutes
- consolidate() completes in <70ms for 10k nodes
- Stats object has stmToEpisodic, episodicToLtm, dropped
- Stats logged for monitoring
- Consolidation is async (doesn't block loop)

#### Recovery Strategy
```
1. index.js sets up consolidation timer (pair 7)
2. On timer fire, call KG.consolidate() with try/catch
3. If consolidate() throws, log error and continue
4. Log stats on success: logger.info('Memory consolidated', stats)
5. If timer misfires, check actual interval
6. Next timer will catch up (no double-fire)
7. If stats missing, log with empty object
```

---

### E11: Danger Predictor False Positives

**Priority:** MEDIUM
**Category:** Logic Failures
**Assigned Task:** T3 (Danger Predictor)
**Integration Points:** `integration-matrix.md` (pairs 3, 8, 9, 10), `validation-report.md` (A3)

#### Description
Danger Predictor incorrectly marks safe areas as dangerous, causing unnecessary route changes or goal avoidance.

#### Test Scenarios

| ID | Scenario | Integration Point |
|----|----------|-------------------|
| E11-T1 | Safe area marked as dangerous | pair 8: DangerPredictor → KG |
| E11-T2 | Route avoiding safe areas | pair 9: Strategy → DangerPredictor |
| E11-T3 | Goal score penalty for safe location | pair 3: GoalScorer → DangerPredictor |
| E11-T4 | Danger zone not decaying over time | 7-day half-life |

#### Expected Behavior (per validation-report.md A3)
1. Danger detection runs every loop (adaptive 200-2000ms)
2. Danger zones have 7-day half-life (decay over time)
3. Zone severity scored 0-1
4. Goal Scorer applies 0-50% penalty based on severity
5. Strategy queries isDangerous() before pathfinding
6. False positives reduce efficiency but don't cause failures

#### Recovery Strategy
```
1. Danger zones decay over time (valid_until)
2. On spawn in safe area, old danger zones ignored
3. If goal score penalty too high, log warning
4. Manual override: clear danger zones via command
5. False positive rate monitored via log analysis
6. If >20% false positives, review danger detection logic
```

---

### E12: RPM Throttling

**Priority:** HIGH
**Category:** Resource Limits
**Assigned Task:** Rate Limiter (existing), T9 (Reflection Module)
**Integration Points:** `validation-report.md` (A5), `rate-limiter.js`, `omniroute.js`

#### Description
Bot approaches or exceeds Omniroute API rate limit (560 RPM hard limit, 448 RPM configured).

#### Test Scenarios

| ID | Scenario | Test Conditions |
|----|----------|-----------------|
| E12-T1 | Stay under 448 RPM (80% buffer) | Rate limiter active |
| E12-T2 | New features add ~1.033 RPM | A5 validation (goal gen 1/min + reflection 1/30min) |
| E12-T3 | Handle 429 rate limit error | Bottleneck throws |
| E12-T4 | Danger mode increases frequency | 5Hz at 200ms interval |

#### Expected Behavior (per validation-report.md A5)
- Current rate limit: 448 RPM (80% of 560 hard limit)
- Total new RPM: ~1.033 (goal generation 1/min + reflection 1/30min)
- Danger mode: 200ms interval = 300 RPM (just pilot)
- With buffer, should stay under limit

#### Recovery Strategy
```
1. Rate limiter configured with reservoir: 448, refresh: 448/min
2. On 429 error, log and retry after refresh period
3. Monitor RPM usage via logs
4. If approaching limit (>400 RPM), reduce loop frequency
5. Reflection and goal generation have own intervals
6. Make intervals configurable via env vars
7. Alert if sustained >500 RPM
```

---

## Test Templates by Category

### Template A: Resource Exhaustion Tests

```javascript
describe('Resource Exhaustion', () => {
  describe('Memory Limits', () => {
    test('should handle Knowledge Graph exceeding 10k nodes', async () => {
      // Add nodes until > 10k
      // Verify consolidation triggers
      // Verify LRU eviction works
    });
  });
  
  describe('RPM Limits', () => {
    test('should stay under rate limit', async () => {
      // Monitor RPM usage
      // Verify stays under 448 RPM
    });
  });
});
```

### Template B: Network Failure Tests

```javascript
describe('Network Failures', () => {
  test('should handle disconnection gracefully', async () => {
    // Simulate disconnect
    // Verify end event fired
    // Verify cleanup
  });
  
  test('should reconnect with backoff', async () => {
    // Simulate disconnect
    // Verify reconnection attempts
    // Verify exponential backoff
  });
});
```

### Template C: Logic Failure Tests

```javascript
describe('Logic Failures', () => {
  test('should detect stuck state', async () => {
    // Immobilize bot
    // Verify stuck detection fires
    // Verify pilot_stuck written to state
  });
  
  test('should handle skill failure', async () => {
    // Execute failing skill
    // Verify action_error written
    // Verify recovery strategy triggered
  });
});
```

### Template D: Timer/Async Failure Tests

```javascript
describe('Timer/Async Failures', () => {
  test('should handle consolidation timer', async () => {
    // Advance timer 10 minutes
    // Verify consolidate() called
    // Verify stats logged
  });
  
  test('should handle consolidation failure', async () => {
    // Mock consolidate() to throw
    // Verify error logged
    // Verify next timer still fires
  });
});
```

---

## Edge Case Assignment Matrix

| Edge Case | Category | Priority | Assigned Task | Test File | Status |
|-----------|----------|----------|---------------|-----------|--------|
| E1: Death | Bot Lifecycle | CRITICAL | T1 + existing | error-recovery.test.js | Covered |
| E2: Disconnection | Bot Lifecycle | CRITICAL | T1 | error-recovery.test.js | Covered |
| E3: Resource Limits | Resource Limits | HIGH | T2, T5 | validation-report.md | Documented |
| E4: Race Conditions | Concurrency | HIGH | T2 | state-manager.js | Documented |
| E5: Memory Overflow | Resource Limits | HIGH | T2 | validation-report.md | Documented |
| E6: Stuck Detection | Logic Failures | HIGH | T1 | pilot.js, error-recovery.test.js | Covered |
| E7: Goal Conflicts | Logic Failures | MEDIUM | T11, T12 | integration-matrix.md | Documented |
| E8: Skill Failures | Logic Failures | HIGH | T7 | integration-matrix.md | Documented |
| E9: Reflection Errors | Logic Failures | MEDIUM | T9 | integration-matrix.md | Documented |
| E10: Consolidation Failures | Concurrency | MEDIUM | T2 | validation-report.md | Documented |
| E11: Danger False Positives | Logic Failures | MEDIUM | T3 | integration-matrix.md | Documented |
| E12: RPM Throttling | Resource Limits | HIGH | Rate Limiter | validation-report.md | Documented |

---

## Summary

| Metric | Count |
|--------|-------|
| Total Edge Cases | 12 |
| Already Covered by E2E | 4 (E1 partial, E2 partial, E6 partial) |
| Documented for Implementation | 12 |
| Critical Priority | 2 |
| High Priority | 6 |
| Medium Priority | 4 |

---

## Next Steps

1. **Task 0.4**: Define Rollback Criteria
2. **Task 1**: Implement Enhanced Action Awareness (unblocks T7, T9)
3. **Task 2**: Implement Memory Consolidation Timer
4. **Task 3**: Implement Danger Predictor

---

*Document generated: 2026-04-16*
*Task owner: Sisyphus-Junior*