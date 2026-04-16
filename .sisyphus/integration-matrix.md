# Integration Test Matrix

**Project:** Project Sid Robustness Implementation
**Task:** 0.2 - Define Integration Test Matrix
**Date:** 2026-04-16
**Status:** Complete

---

## Executive Summary

This document defines all module pairs requiring integration tests for the Project Sid robustness implementation. The matrix identifies **20 critical integration points** across 3 categories:

| Category | Pairs | Description |
|----------|-------|-------------|
| **Critical Path** | 4 | Skill Executor→AA, Reflection→Failure Detect, Goal Scorer→Danger, Commander→Goal Gen |
| **Wave 1** | 6 | Action Awareness extensions, Memory Consolidation, Danger Predictor |
| **Wave 2-3** | 10 | Skill System, Item Tracker, Reflection, Goal System |

**Coverage:** All 20 module pairs have defined test scenarios.

---

## Module Registry

### Existing Systems (with line references)

| Module | File Path | Purpose |
|--------|-----------|---------|
| Pilot | `src/layers/pilot.js` | Fast reactions, adaptive loop (200/500/2000ms) |
| Strategy | `src/layers/strategy.js` | Multi-step planning |
| Commander | `src/layers/commander.js` | High-level goals, monitoring |
| Action Awareness | `src/layers/action-awareness.js` | PIANO verification (lines 13-64) |
| Knowledge Graph | `src/memory/knowledge-graph.js` | Graph storage with consolidation (lines 700+) |
| State Manager | `src/utils/state-manager.js` | File locking, state persistence |

### New Modules (by Task)

| Task | Module | File Path | Status |
|------|--------|-----------|--------|
| T1 | Enhanced Action Awareness | `src/layers/action-awareness.js` | Extends existing |
| T2 | Memory Consolidation Timer | `src/index.js` | Integration |
| T3 | Danger Predictor | `src/safety/danger-predictor.js` | New file |
| T4 | Failure Pattern Detection | `src/layers/action-awareness.js` | Extends T1 |
| T5 | Skill Registry | `src/skills/skill-registry.js` | New file |
| T6 | Composite Skills | `src/skills/composite/*.js` | New files |
| T7 | Skill Executor | `src/skills/skill-executor.js` | New file |
| T8 | Item Tracker | `src/metrics/item-tracker.js` | New file |
| T9 | Reflection Module | `src/learning/reflection-module.js` | New file |
| T10 | Goal Graph | `src/goals/goal-graph.js` | New file |
| T11 | Goal Scorer & Generator | `src/goals/goal-scorer.js`, `src/goals/goal-generator.js` | New files |
| T12 | Commander Integration | `src/layers/commander.js` | Modifies existing |

---

## Critical Path Integration Points

These 4 pairs form the critical path through Wave 1 → Wave 2 → Wave 3.

### 1. Skill Executor → Action Awareness (Confidence Scoring)

**Priority:** CRITICAL
**Wave:** 2 (blocked by T1)
**File:** `src/skills/skill-executor.js` → `src/layers/action-awareness.js`

**Integration Point:**
```javascript
// SkillExecutor calls ActionAwareness for confidence before retry
const confidence = await actionAwareness._calculateConfidence(skill, context);
if (confidence < 0.3) {
  return { success: false, reason: 'low_confidence', confidence };
}
```

**Test Scenario:**
```
Scenario: Skill Executor uses confidence to decide retry strategy
Given: SkillExecutor with ActionAwareness instance
When: Executing skill with confidence < 0.3
Then: Return low_confidence without retry
And: Log confidence score
```

**Expected Behavior:**
- Confidence calculated before each retry attempt
- Low confidence (<0.3) triggers immediate failure
- Medium confidence (0.3-0.7) uses exponential backoff
- High confidence (>0.7) retries immediately

**Failure Modes:**
- Confidence always returns 1.0 (no retry attempts)
- Confidence calculation throws error
- ActionAwareness methods not accessible (_ prefix)

---

### 2. Reflection Module → Failure Pattern Detection

**Priority:** CRITICAL
**Wave:** 3 (blocked by T4)
**File:** `src/learning/reflection-module.js` → `src/layers/action-awareness.js`

**Integration Point:**
```javascript
// ReflectionModule extracts patterns from ActionAwareness
const failures = actionAwareness.getRecentFailures(10);
const patterns = actionAwareness.detectFailurePattern(failures);
```

**Test Scenario:**
```
Scenario: Reflection extracts failure patterns from ActionAwareness
Given: ActionAwareness with 3+ identical failures
When: ReflectionModule.reflect() is called
Then: Identify stuck pattern with actionable suggestion
And: Store pattern in Knowledge Graph
```

**Expected Behavior:**
- Extracts failure history via getRecentFailures()
- Detects patterns (stuck, wrong_tool, unreachable)
- Generates actionable suggestions
- Stores patterns as semantic memories

**Failure Modes:**
- getRecentFailures returns empty array
- detectFailurePattern not called
- Patterns not stored in Knowledge Graph

---

### 3. Goal Scorer → Danger Predictor

**Priority:** CRITICAL
**Wave:** 3 (blocked by T3)
**File:** `src/goals/goal-scorer.js` → `src/safety/danger-predictor.js`

**Integration Point:**
```javascript
// GoalScorer reduces score for dangerous goals
const dangerLevel = dangerPredictor.getDangerLevel(goal.location);
if (dangerLevel > 0.5) {
  score *= (1 - dangerLevel * 0.5); // Reduce by up to 25%
}
```

**Test Scenario:**
```
Scenario: Dangerous goal location reduces goal score
Given: GoalScorer with DangerPredictor
And: Goal at dangerous location (dangerLevel: 0.8)
When: Scoring goal
Then: Score reduced by 40% (1 - 0.8 * 0.5)
And: Safe goals score normally
```

**Expected Behavior:**
- Query DangerPredictor for goal location danger level
- Apply 0-50% penalty based on danger level
- Goals in safe areas unaffected
- null location = no danger penalty

**Failure Modes:**
- DangerPredictor not injected
- getDangerLevel returns undefined
- Score not reduced in dangerous areas

---

### 4. Commander → Goal Generator (Autonomous Mode)

**Priority:** CRITICAL
**Wave:** 3 (blocked by T11)
**File:** `src/layers/commander.js` → `src/goals/goal-generator.js`

**Integration Point:**
```javascript
// Commander calls GoalGenerator when no player goal
if (!playerGoal && this.autonomousMode) {
  const context = this._buildContext();
  const goal = await this.goalGenerator.generateGoal(context);
  if (goal) {
    await this.stateManager.write('commands', { goal: goal.name, source: 'autonomous' });
  }
}
```

**Test Scenario:**
```
Scenario: Commander generates autonomous goal when idle
Given: Commander with autonomous mode enabled
And: No player goal in commands.json
When: Commander loop runs
Then: Generate goal via GoalGenerator
And: Write goal to commands.json with source='autonomous'
```

**Expected Behavior:**
- Check for player goal first (player priority)
- If no player goal and autonomousMode=true, generate
- Rate limit: max 1 goal per minute
- Log autonomous goal generation

**Failure Modes:**
- Player goal overridden by autonomous goal
- Goal generated too frequently (>1/min)
- GoalGenerator throws error
- commands.json not updated

---

## Wave 1 Integration Points

### 5. Enhanced Action Awareness → Pilot Layer

**Priority:** HIGH
**Wave:** 1
**File:** `src/layers/action-awareness.js` → `src/layers/pilot.js`

**Integration Point:**
```javascript
// Pilot calls executeWithVerification with confidence tracking
const result = await actionAwareness.executeWithVerification(action, expected);
if (!result.success) {
  await this._handleActionFailure(action, result);
}
```

**Test Scenario:**
```
Scenario: Pilot uses enhanced ActionAwareness with confidence
Given: Pilot with enhanced ActionAwareness
When: Executing action with low confidence
Then: Log confidence score
And: Action may still succeed if actual outcome matches
```

**Expected Behavior:**
- Enhanced executeWithVerification returns confidence score
- Existing API signature unchanged (backward compatible)
- Pilot continues to use same call pattern

**Failure Modes:**
- API signature changed (breaking change)
- Confidence not returned
- Pilot not handling low-confidence actions

---

### 6. Enhanced Action Awareness → Knowledge Graph

**Priority:** HIGH
**Wave:** 1
**File:** `src/layers/action-awareness.js` → `src/memory/knowledge-graph.js`

**Integration Point:**
```javascript
// ActionAwareness stores failure patterns as semantic memories
if (pattern.detected) {
  await this.knowledgeGraph.addSemanticMemory(
    `failure_pattern_${pattern.type}`,
    { actionType: pattern.action.type, count: pattern.count },
    null,
    Date.now()
  );
}
```

**Test Scenario:**
```
Scenario: ActionAwareness stores failure patterns in Knowledge Graph
Given: ActionAwareness with KnowledgeGraph instance
When: Pattern detected (3+ identical failures)
Then: Store pattern as semantic memory
And: Pattern retrievable by type
```

**Expected Behavior:**
- Store patterns with type, action, count, suggestion
- Use semantic_memory type
- Patterns queryable via Knowledge Graph

**Failure Modes:**
- KnowledgeGraph not injected
- Pattern not stored
- Stored pattern not queryable

---

### 7. Memory Consolidation → Knowledge Graph

**Priority:** HIGH
**Wave:** 1
**File:** `src/index.js` → `src/memory/knowledge-graph.js`

**Integration Point:**
```javascript
// index.js sets up consolidation timer
setInterval(async () => {
  const stats = await knowledgeGraph.consolidate();
  logger.info('Memory consolidated', stats);
}, 10 * 60 * 1000); // Every 10 minutes
```

**Test Scenario:**
```
Scenario: Memory consolidation runs every 10 minutes
Given: Bot running with consolidation timer
When: 10 minutes elapsed
Then: KnowledgeGraph.consolidate() called
And: Stats logged (stmToEpisodic, episodicToLtm, dropped)
```

**Expected Behavior:**
- Timer fires every 10 minutes
- consolidate() completes without blocking
- Stats object has stmToEpisodic, episodicToLtm, dropped
- Memory size stays under 10,000 nodes

**Failure Modes:**
- Timer not started
- Consolidation runs too frequently
- consolidate() throws error
- Stats not logged

---

### 8. Danger Predictor → Knowledge Graph (Spatial Storage)

**Priority:** HIGH
**Wave:** 1
**File:** `src/safety/danger-predictor.js` → `src/memory/knowledge-graph.js`

**Integration Point:**
```javascript
// DangerPredictor stores danger zones as spatial memories
await this.knowledgeGraph.addSpatialMemory(
  `danger_zone_${zone.id}`,
  zone.position,
  'danger_zone',
  Date.now(),
  { severity: zone.severity, cause: zone.cause, radius: zone.radius }
);
```

**Test Scenario:**
```
Scenario: DangerPredictor stores danger zones in Knowledge Graph
Given: DangerPredictor with KnowledgeGraph
When: Bot dies or takes damage
Then: Store danger zone with position, severity, cause
And: Zone retrievable for path planning
```

**Expected Behavior:**
- Store position, biome, timestamp for each zone
- Include severity (0-1) and cause (death, lava, mob)
- Decay zones over time (7-day half-life)
- Query by position radius

**Failure Modes:**
- KnowledgeGraph not injected
- Zones not stored
- Zone queries return wrong results

---

### 9. Danger Predictor → Strategy Layer (Path Planning)

**Priority:** HIGH
**Wave:** 1
**File:** `src/safety/danger-predictor.js` → `src/layers/strategy.js`

**Integration Point:**
```javascript
// Strategy queries DangerPredictor before pathfinding
const route = await this.planner.findPath(start, end);
if (this.dangerPredictor.isDangerous(route.waypoints)) {
  // Find alternative route or warn
}
```

**Test Scenario:**
```
Scenario: Strategy avoids dangerous routes
Given: Strategy with DangerPredictor
And: Primary route passes through danger zone
When: Planning path to goal
Then: Find alternative route avoiding danger
Or: Mark route as risky in plan
```

**Expected Behavior:**
- Query isDangerous() for route waypoints
- Return safe route if available
- Include danger warnings in plan metadata

**Failure Modes:**
- DangerPredictor not injected into Strategy
- isDangerous always returns false
- Strategy ignores danger warnings

---

### 10. Danger Predictor → Pilot Layer (Mark Danger)

**Priority:** HIGH
**Wave:** 1
**File:** `src/safety/danger-predictor.js` → `src/layers/pilot.js`

**Integration Point:**
```javascript
// Pilot marks danger zones on death/damage
bot.on('death', () => {
  this.dangerPredictor.markDangerous(bot.entity.position, 'death');
});
bot.on('healthChanged', () => {
  if (bot.health < 6) {
    this.dangerPredictor.markDangerous(bot.entity.position, 'low_health');
  }
});
```

**Test Scenario:**
```
Scenario: Pilot marks danger zone on bot death
Given: Pilot with DangerPredictor
And: Bot dies
When: Death event fires
Then: Mark current position as dangerous
And: Store cause as 'death_by_mob' or similar
```

**Expected Behavior:**
- Mark position on death
- Mark position on low health (<6)
- Mark position on lava contact
- Store cause for pattern analysis

**Failure Modes:**
- Events not connected
- Wrong position stored
- Cause not recorded

---

## Wave 2 Integration Points

### 11. Skill Executor → Skill Registry

**Priority:** HIGH
**Wave:** 2
**File:** `src/skills/skill-executor.js` → `src/skills/skill-registry.js`

**Integration Point:**
```javascript
// SkillExecutor retrieves skills from Registry
const skill = this.registry.getSkill(skillName);
if (!skill) {
  return { success: false, reason: 'skill_not_found' };
}
const result = await skill.execute(this.bot, params);
```

**Test Scenario:**
```
Scenario: SkillExecutor retrieves and executes skill from Registry
Given: SkillExecutor with SkillRegistry containing primitives
When: Executing 'move' skill
Then: Retrieve 'move' skill from Registry
And: Execute with bot and params
And: Return result with success/failure
```

**Expected Behavior:**
- Registry.getSkill() returns skill or null
- Skill has execute(bot, params) method
- Skill has expectedOutcome(params) method

**Failure Modes:**
- getSkill returns undefined
- Skill.execute() throws
- No graceful error handling

---

### 12. Composite Skills → Skill Registry (Primitives)

**Priority:** HIGH
**Wave:** 2
**File:** `src/skills/composite/*.js` → `src/skills/skill-registry.js`

**Integration Point:**
```javascript
// Composite skill chains primitives from Registry
const moveSkill = this.registry.getSkill('move');
const digSkill = this.registry.getSkill('dig');
await moveSkill.execute(bot, { direction: 'forward' });
await digSkill.execute(bot, { blockType: 'oak_log' });
```

**Test Scenario:**
```
Scenario: Composite skill 'gather_wood' chains primitives
Given: gather_wood composite skill
When: Executing with bot in forest
Then: Chain: find_tree → dig_logs → collect
And: Return aggregate success/failure
```

**Expected Behavior:**
- Composite has 3-5 primitive steps
- Each step uses skill from Registry
- Handles failure: retry or skip
- Returns per-step results

**Failure Modes:**
- Primitives not registered
- Step execution order wrong
- Failure not handled gracefully

---

### 13. Skill Executor → Pilot Layer

**Priority:** HIGH
**Wave:** 2
**File:** `src/skills/skill-executor.js` → `src/layers/pilot.js`

**Integration Point:**
```javascript
// SkillExecutor replaces direct Pilot action execution
// Pilot.modified to call SkillExecutor.executeSkill() instead of _performAction()
this.skillExecutor = new SkillExecutor(bot, this.registry, this.actionAwareness);
```

**Test Scenario:**
```
Scenario: Pilot uses SkillExecutor for all actions
Given: Pilot with SkillExecutor integration
When: Executing action from plan
Then: Delegate to SkillExecutor
And: SkillExecutor handles retries
And: Pilot receives final result
```

**Expected Behavior:**
- Pilot delegates to SkillExecutor
- SkillExecutor handles retry logic
- Pilot gets final success/failure
- Original action execution paths updated

**Failure Modes:**
- Dual execution (Pilot + SkillExecutor)
- SkillExecutor not initialized
- Results not propagated back to Pilot

---

### 14. Item Tracker → Pilot Layer (Collection Events)

**Priority:** HIGH
**Wave:** 2
**File:** `src/metrics/item-tracker.js` → `src/layers/pilot.js`

**Integration Point:**
```javascript
// Pilot hooks ItemTracker to collection events
bot.on('playerCollect', (collector, collected) => {
  if (collector.username === bot.username) {
    this.itemTracker.track(collected.name);
  }
});
```

**Test Scenario:**
```
Scenario: ItemTracker records items collected by bot
Given: ItemTracker with Pilot
When: Bot collects oak_log
Then: Track 'oak_log' in ItemTracker
And: Increment unique item count
```

**Expected Behavior:**
- Hook playerCollect event
- Check collector is bot
- Track item name (not all instances)
- Unique items only (no duplicates)

**Failure Modes:**
- Event not hooked
- All items tracked (including duplicates)
- Wrong player判断 (tracks other players)

---

### 15. Item Tracker → State Manager (Stats Persistence)

**Priority:** MEDIUM
**Wave:** 2
**File:** `src/metrics/item-tracker.js` → `src/utils/state-manager.js`

**Integration Point:**
```javascript
// ItemTracker exposes stats via getStats()
const stats = this.itemTracker.getStats();
await this.stateManager.write('item_stats', stats);
```

**Test Scenario:**
```
Scenario: ItemTracker stats written to state files
Given: ItemTracker with items tracked
When: getStats() called
Then: Return { uniqueItems, itemsPerHour, techTreeLevel, milestones }
And: Stats writeable to state/item_stats.json
```

**Expected Behavior:**
- getStats() returns structured object
- Stats contain uniqueItems, itemsPerHour, techTreeLevel, milestones
- State Manager can persist to JSON

**Failure Modes:**
- Stats not in expected format
- Missing fields
- State Manager write fails

---

## Wave 3 Integration Points

### 16. Reflection Module → Knowledge Graph (Learnings Storage)

**Priority:** HIGH
**Wave:** 3
**File:** `src/learning/reflection-module.js` → `src/memory/knowledge-graph.js`

**Integration Point:**
```javascript
// ReflectionModule stores learnings as semantic memories
await this.knowledgeGraph.addSemanticMemory(
  `reflection_${Date.now()}`,
  {
    type: 'learning',
    period: reflection.period,
    successRate: reflection.successRate,
    learnings: reflection.learnings,
    adjustments: reflection.adjustments
  },
  null,
  Date.now()
);
```

**Test Scenario:**
```
Scenario: ReflectionModule stores learnings in Knowledge Graph
Given: ReflectionModule with 30 min of data
When: reflect() called
Then: Generate learnings
And: Store as semantic memories
And: Log to logs/reflections.log
```

**Expected Behavior:**
- Store with semantic_memory type
- Include period, successRate, learnings, adjustments
- Log to file for human review
- Max 5 adjustments per reflection

**Failure Modes:**
- Learnings not stored
- Knowledge Graph write fails
- File logging fails

---

### 17. Reflection Module → Action Awareness (Metrics)

**Priority:** HIGH
**Wave:** 3
**File:** `src/learning/reflection-module.js` → `src/layers/action-awareness.js`

**Integration Point:**
```javascript
// Reflection reads metrics from ActionAwareness
const successRate = this.actionAwareness.getSuccessRate();
const recentFailures = this.actionAwareness.getRecentFailures(10);
```

**Test Scenario:**
```
Scenario: ReflectionModule analyzes ActionAwareness metrics
Given: ActionAwareness with action history
When: reflect() called
Then: Read successRate from ActionAwareness
And: Read recentFailures for pattern analysis
And: Calculate improvement since last reflection
```

**Expected Behavior:**
- getSuccessRate() returns 0-1
- getRecentFailures() returns array of failures
- Metrics accurate and consistent

**Failure Modes:**
- getSuccessRate returns undefined
- recentFailures returns empty (no data)
- Metrics calculated incorrectly

---

### 18. Goal Scorer → Personality Engine

**Priority:** MEDIUM
**Wave:** 3
**File:** `src/goals/goal-scorer.js` → `personality/personality-engine.js`

**Integration Point:**
```javascript
// GoalScorer considers personality traits
const curiosityWeight = this.personality.getTrait('curiosity');
if (goal.type === 'exploration') {
  score += curiosityWeight * 0.3;
}
```

**Test Scenario:**
```
Scenario: High curiosity personality increases exploration scores
Given: GoalScorer with high curiosity personality (0.9)
When: Scoring exploration goal
Then: Score increased by 0.27 (0.9 * 0.3)
And: Gathering goals less affected
```

**Expected Behavior:**
- Read personality traits (curiosity, loyalty, bravery, etc.)
- Apply weight to relevant goal types
- Traits range 0-1

**Failure Modes:**
- Personality not injected
- Trait returns undefined
- Weight applied incorrectly

---

### 19. Goal Generator → Goal Graph

**Priority:** HIGH
**Wave:** 3
**File:** `src/goals/goal-generator.js` → `src/goals/goal-graph.js`

**Integration Point:**
```javascript
// GoalGenerator uses GoalGraph to find achievable goals
const achievable = this.goalGraph.getAchievableGoals({ completed: this.completedGoals });
const scored = achievable.map(g => ({
  goal: g,
  score: this.scorer.scoreGoal(g, context)
}));
const sorted = scored.sort((a, b) => b.score - a.score);
return sorted[0]?.goal;
```

**Test Scenario:**
```
Scenario: GoalGenerator selects highest-scoring achievable goal
Given: GoalGraph with multiple goals
And: Some goals have unmet prerequisites
When: generateGoal() called
Then: Filter to achievable goals only
And: Score each goal
And: Return highest scoring goal
```

**Expected Behavior:**
- getAchievableGoals filters by prerequisites
- Goals with unmet prerequisites excluded
- Returns highest scoring goal or null

**Failure Modes:**
- getAchievableGoals returns all goals
- Scoring returns NaN or undefined
- Null pointer when no goals achievable

---

### 20. Commander → State Manager (commands.json Flow)

**Priority:** HIGH
**Wave:** 3
**File:** `src/layers/commander.js` → `src/utils/state-manager.js`

**Integration Point:**
```javascript
// Commander writes autonomous goals to commands.json
await this.stateManager.write('commands', {
  goal: generatedGoal.name,
  source: 'autonomous',
  timestamp: Date.now()
});
```

**Test Scenario:**
```
Scenario: Commander writes autonomous goal to commands.json
Given: Commander with autonomous mode enabled
When: Generating autonomous goal
Then: Write to commands.json with source='autonomous'
And: Player goal source='player'
And: commands.json readable by Strategy
```

**Expected Behavior:**
- Write goal name and metadata
- source field distinguishes autonomous vs player
- Strategy can read and process goal
- File locking works correctly

**Failure Modes:**
- File locking timeout
- source field missing
- Strategy can't read goal

---

## Test Templates

### Template A: New Module → Existing System

```javascript
/**
 * Integration Test: [New Module] → [Existing System]
 * 
 * Tests integration between new module and existing system.
 * Uses mocks for external dependencies.
 */
describe('[Module A] → [Module B] Integration', () => {
  let moduleA;
  let moduleB;
  
  beforeEach(() => {
    moduleB = new ModuleB(mockDeps);
    moduleA = new ModuleA({ dependency: moduleB });
  });
  
  it('should [expected behavior]', async () => {
    // Arrange
    const input = { /* test input */ };
    
    // Act
    const result = await moduleA.doSomething(input);
    
    // Assert
    expect(result).toEqual(expectedOutput);
    expect(moduleB).toHaveBeenCalledWith(expectedArgs);
  });
});
```

### Template B: Timer/Interval Integration

```javascript
/**
 * Integration Test: [Timer] → [Module]
 * 
 * Tests timer-based integration (e.g., consolidation, reflection).
 * Uses fake timers for deterministic testing.
 */
describe('[Timer] Integration', () => {
  jest.useFakeTimers();
  
  it('should call [module] every [interval]', () => {
    // Arrange
    const module = new Module();
    const spy = jest.spyOn(module, 'periodicTask');
    
    // Act
    startPeriodicTimer(module, 10 * 60 * 1000);
    jest.advanceTimersByTime(11 * 60 * 1000);
    
    // Assert
    expect(spy).toHaveBeenCalled();
  });
});
```

### Template C: Event-Based Integration

```javascript
/**
 * Integration Test: [EventEmitter] → [Handler]
 * 
 * Tests event-driven integration between modules.
 * Uses event emitter mock or test bot.
 */
describe('[Event] Integration', () => {
  it('should handle [event] and call [handler]', () => {
    // Arrange
    const emitter = new EventEmitter();
    const handler = new Handler();
    
    // Act
    emitter.on('event', (data) => handler.handle(data));
    emitter.emit('event', testData);
    
    // Assert
    expect(handler.handled).toContain(testData);
  });
});
```

---

## Test Execution Order

Integration tests should run in dependency order:

```bash
# Wave 1 first (no dependencies on new modules)
npm run test:integration -- --testPathPattern="wave-1"

# Wave 2 (depends on Wave 1)
npm run test:integration -- --testPathPattern="wave-2"

# Wave 3 (depends on Wave 2)
npm run test:integration -- --testPathPattern="wave-3"

# Critical path first
npm run test:integration -- --testPathPattern="critical"
```

---

## Summary Matrix

| # | Module A | Module B | Type | Wave | Critical |
|---|----------|----------|------|------|----------|
| 1 | Skill Executor | Action Awareness | Confidence | 2 | YES |
| 2 | Reflection Module | Failure Pattern | Analysis | 3 | YES |
| 3 | Goal Scorer | Danger Predictor | Scoring | 3 | YES |
| 4 | Commander | Goal Generator | Autonomy | 3 | YES |
| 5 | Enhanced AA | Pilot | Execution | 1 | No |
| 6 | Enhanced AA | Knowledge Graph | Storage | 1 | No |
| 7 | Memory Consolidator | Knowledge Graph | Timer | 1 | No |
| 8 | Danger Predictor | Knowledge Graph | Storage | 1 | No |
| 9 | Danger Predictor | Strategy | Planning | 1 | No |
| 10 | Danger Predictor | Pilot | Marking | 1 | No |
| 11 | Skill Executor | Skill Registry | Lookup | 2 | No |
| 12 | Composite Skills | Skill Registry | Chaining | 2 | No |
| 13 | Skill Executor | Pilot | Execution | 2 | No |
| 14 | Item Tracker | Pilot | Events | 2 | No |
| 15 | Item Tracker | State Manager | Persistence | 2 | No |
| 16 | Reflection Module | Knowledge Graph | Storage | 3 | No |
| 17 | Reflection Module | Action Awareness | Metrics | 3 | No |
| 18 | Goal Scorer | Personality | Scoring | 3 | No |
| 19 | Goal Generator | Goal Graph | Selection | 3 | No |
| 20 | Commander | State Manager | Persistence | 3 | No |

**Total: 20 module pairs**

---

## Next Steps

1. **Task 0.3**: Define Edge Case Test Matrix (E1-E12)
2. **Task 0.4**: Define Rollback Criteria
3. **Task 1**: Implement Enhanced Action Awareness (unblocks T7)
4. **Task 3**: Implement Danger Predictor (unblocks T11)

---

*Document generated: 2026-04-16*
*Task owner: Sisyphus-Junior*