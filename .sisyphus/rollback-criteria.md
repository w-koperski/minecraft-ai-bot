# Rollback Criteria and Feature Flags

**Project:** Project Sid Robustness Implementation
**Task:** 0.4 - Define Rollback Criteria
**Date:** 2026-04-16
**Status:** Complete

---

## Executive Summary

This document defines rollback criteria for all new features in the Project Sid robustness implementation. Each feature has defined automatic thresholds, manual rollback procedures, monitoring metrics, and rollback impact assessments.

**Rollback Decision Tree:**
```
Feature detects issue → Check automatic threshold → If exceeded, disable feature → Log incident → Notify via state
```

---

## Feature Flags (for .env.example)

```env
# ===========================================
# FEATURE FLAGS - Set to 'true' to enable, 'false' to disable
# ===========================================

# Wave 1: Robustness Foundation
ENABLE_CONFIDENCE_SCORING=true
ENABLE_AUTO_CONSOLIDATION=true
ENABLE_DANGER_PREDICTION=true
ENABLE_FAILURE_DETECTION=true

# Wave 2: Skill System
ENABLE_SKILL_SYSTEM=true
ENABLE_ITEM_TRACKER=true

# Wave 3: Learning & Autonomy
ENABLE_REFLECTION=true
ENABLE_AUTONOMOUS_GOALS=true

# ===========================================
# ROLLBACK CONFIGURATION
# ===========================================

# Memory limits
KG_MAX_NODES=10000
KG_CONSOLIDATION_INTERVAL_MS=600000

# Performance thresholds
ACTION_SUCCESS_RATE_MIN=0.80
CONSOLIDATION_TIME_MAX_MS=100
REFLECTION_TIME_MAX_MS=5000
RPM_WARNING_THRESHOLD=400
RPM_CRITICAL_THRESHOLD=500

# Danger prediction
DANGER_DECAY_HALF_LIFE_DAYS=7
DANGER_ZONE_RADIUS_BLOCKS=20
```

---

## Wave 1: Robustness Foundation

---

### T1: Enhanced Action Awareness (Confidence Scoring)

**Module:** `src/layers/action-awareness.js`
**Added Methods:** `_calculateConfidence()`, `_verifyMultiStep()`, `confidenceHistory`
**Dependencies:** T7 (Skill Executor uses confidence for retry decisions)

#### Automatic Rollback Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Action success rate | <85% | <80% | Disable confidence scoring |
| Confidence calibration error | >0.3 | >0.5 | Disable confidence scoring |
| False positive rate (high confidence fails) | >20% | >30% | Disable confidence scoring |
| _calculateConfidence() latency | >50ms | >100ms | Disable confidence scoring |
| Memory from confidenceHistory | >1000 entries | >5000 entries | Clear history, disable |

**Automatic Rollback Trigger:**
```javascript
// Pseudocode for automatic rollback check (added to executeWithVerification)
if (actionSuccessRate < ACTION_SUCCESS_RATE_MIN) {
  logger.warn('Action success rate below threshold, disabling confidence scoring', {
    current: actionSuccessRate,
    threshold: ACTION_SUCCESS_RATE_MIN
  });
  process.env.ENABLE_CONFIDENCE_SCORING = 'false';
  emitFeatureDisabled('confidence_scoring', 'low_success_rate');
}
```

#### Manual Rollback Procedure

```bash
# Option 1: Environment variable (immediate, no restart required)
export ENABLE_CONFIDENCE_SCORING=false

# Option 2: Chat command (remote, no restart)
!bot feature disable confidence

# Option 3: Edit .env and restart (full clean)
# Set ENABLE_CONFIDENCE_SCORING=false in .env
# Restart bot: pkill -f "node src/index.js" && node src/index.js

# Option 4: State file (programmatic)
echo '{"feature":"confidence_scoring","enabled":false}' > state/feature_flags.json
```

#### Monitoring Metrics

| Metric | Log Location | Alert Threshold |
|--------|--------------|-----------------|
| `action_awareness/confidence/calculated` | `logs/combined.log` | Every 100 actions |
| `action_awareness/confidence/actual_correlation` | `logs/combined.log` | On each verification |
| `action_awareness/confidence/error_rate` | `logs/combined.log` | >0.2 = warning |
| `action_awareness/success_rate` | `logs/combined.log` | <0.85 = warning |
| `action_awareness/confidence_history_size` | `logs/combined.log` | >800 = warning |

**Log Format:**
```
[2026-04-16T10:30:00.000Z] info: Action awareness confidence calculated {
  action: 'move',
  confidence: 0.85,
  expectedOutcome: { moved: true },
  actualOutcome: { moved: true, distance: 1.2 },
  error: 0.15
}
```

#### Rollback Impact

| When Disabled | Behavior |
|---------------|----------|
| **Fallback** | executeWithVerification() works as before (binary success/fail) |
| **Retry decisions** | Skill Executor uses default retry (3 attempts, no confidence filtering) |
| **Multi-step verification** | Disabled (reverts to single verification) |
| **confidenceHistory** | Stops accumulating, existing data preserved |
| **User-visible effect** | Reduced action adaptation, potentially more retries |

---

### T2: Automated Memory Consolidation

**Module:** `src/index.js` (timer), `src/memory/knowledge-graph.js` (consolidate())
**Added:** setInterval calling KG.consolidate() every 10 minutes
**Dependencies:** None (standalone feature)

#### Automatic Rollback Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Knowledge Graph node count | >8000 | >9500 | Trigger immediate consolidation, disable timer if persists |
| consolidate() execution time | >70ms | >100ms | Disable auto-consolidation |
| Consolidation failure count | 3 consecutive | 5 total | Disable auto-consolidation |
| Memory usage (process) | >400MB | >500MB | Disable auto-consolidation |
| Consolidation stats missing | 2 consecutive | 3 total | Disable and investigate |

**Automatic Rollback Trigger:**
```javascript
// Pseudocode (added to consolidation timer callback)
const stats = await kg.consolidate().catch(err => null);
if (!stats) {
  consolidationFailures++;
  if (consolidationFailures >= 5) {
    logger.error('Consolidation failing consistently, disabling auto-consolidation');
    clearInterval(consolidationTimer);
    process.env.ENABLE_AUTO_CONSOLIDATION = 'false';
    emitFeatureDisabled('auto_consolidation', 'consecutive_failures');
  }
  return;
}

if (stats.executionTimeMs > CONSOLIDATION_TIME_MAX_MS) {
  logger.warn('Consolidation too slow, disabling auto-consolidation', {
    executionTime: stats.executionTimeMs,
    threshold: CONSOLIDATION_TIME_MAX_MS
  });
  clearInterval(consolidationTimer);
  process.env.ENABLE_AUTO_CONSOLIDATION = 'false';
}
```

#### Manual Rollback Procedure

```bash
# Option 1: Environment variable
export ENABLE_AUTO_CONSOLIDATION=false
# (Timer clears on next tick, existing data preserved)

# Option 2: Chat command
!bot feature disable consolidation
# OR trigger manual consolidation:
!bot consolidate

# Option 3: Edit .env and restart
# Set ENABLE_AUTO_CONSOLIDATION=false in .env
# Restart bot

# Option 4: Via StateManager API (programmatic)
stateManager.write('feature_flags', { auto_consolidation: false });
```

#### Monitoring Metrics

| Metric | Log Location | Alert Threshold |
|--------|--------------|-----------------|
| `memory/consolidation/triggered` | `logs/combined.log` | Every 10 minutes |
| `memory/consolidation/stats` | `logs/combined.log` | On each consolidation |
| `memory/consolidation/execution_time_ms` | `logs/combined.log` | >50ms = warning |
| `memory/consolidation/failures` | `logs/combined.log` | Any failure |
| `memory/nodes/current` | `logs/combined.log` | >8000 = warning |
| `memory/nodes/max` | `logs/combined.log` | >9500 = critical |

**Log Format:**
```
[2026-04-16T10:30:00.000Z] info: Memory consolidated {
  stmToEpisodic: 45,
  episodicToLtm: 12,
  dropped: 8,
  executionTimeMs: 7,
  nodeCount: 3847
}
```

#### Rollback Impact

| When Disabled | Behavior |
|---------------|----------|
| **Memory growth** | No automatic cleanup, manual consolidate() still available |
| **STM→Episodic** | Stops, STM memories grow unbounded |
| **Episodic→LTM** | Stops, older episodic memories retained |
| **LRU eviction** | Still active (built into KG), but less aggressive without consolidation |
| **User-visible effect** | Memory usage may grow over 4+ hour runs |
| **Chat command** | !bot consolidate still works for manual trigger |

---

### T3: Danger Prediction System

**Module:** `src/safety/danger-predictor.js` (new file)
**Classes:** DangerPredictor with markDangerous(), isDangerous(), getDangerZones()
**Dependencies:** T11 (Goal Scorer uses danger predictions)

#### Automatic Rollback Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Danger zone count | >500 | >1000 | Trigger decay, disable new zones if persists |
| isDangerous() latency | >10ms | >50ms | Disable danger checking |
| False positive rate | >30% | >50% | Disable and recalibrate |
| Memory from danger zones | >50MB | >100MB | Disable and clear old zones |
| KG spatial memory growth | >1000 nodes | >5000 nodes | Disable storage |

**Automatic Rollback Trigger:**
```javascript
// Pseudocode (in DangerPredictor)
if (this.zones.size > 1000) {
  logger.warn('Too many danger zones, disabling danger prediction');
  this.enabled = false;
  process.env.ENABLE_DANGER_PREDICTION = 'false';
  emitFeatureDisabled('danger_prediction', 'zone_overflow');
}

if (this.isDangerousLatencyMs > 50) {
  logger.warn('Danger checking too slow, disabling');
  this.enabled = false;
}
```

#### Manual Rollback Procedure

```bash
# Option 1: Environment variable
export ENABLE_DANGER_PREDICTION=false

# Option 2: Chat command
!bot feature disable danger
# Clear existing danger zones:
!bot danger clear

# Option 3: Edit .env and restart
# Set ENABLE_DANGER_PREDICTION=false in .env
# Restart bot

# Option 4: Via API
dangerPredictor.enabled = false;
dangerPredictor.clearAllZones();
```

#### Monitoring Metrics

| Metric | Log Location | Alert Threshold |
|--------|--------------|-----------------|
| `danger/zones/created` | `logs/combined.log` | On each death/damage |
| `danger/zones/decayed` | `logs/combined.log` | On decay tick |
| `danger/check/is_dangerous` | `logs/combined.log` | Every query |
| `danger/check/latency_ms` | `logs/combined.log` | >10ms = warning |
| `danger/zones/current_count` | `logs/combined.log` | >500 = warning |
| `danger/false_positive_reports` | `logs/combined.log` | Any report |

**Log Format:**
```
[2026-04-16T10:30:00.000Z] info: Danger zone marked {
  position: { x: 100, y: 64, z: 200 },
  cause: 'death_by_creeper',
  severity: 1.0,
  radius: 20,
  validUntil: '2026-04-23T10:30:00.000Z'
}

[2026-04-16T10:30:05.000Z] info: Danger check {
  position: { x: 105, y: 64, z: 205 },
  isDangerous: true,
  nearestZone: { distance: 12, severity: 0.8 },
  latencyMs: 2
}
```

#### Rollback Impact

| When Disabled | Behavior |
|---------------|----------|
| **Danger tracking** | No new zones marked on death/damage |
| **isDangerous()** | Returns false for all positions (safe) |
| **Goal scoring** | No danger penalty applied |
| **Path planning** | No route avoidance based on history |
| **Existing zones** | Preserved in KG (can be cleared manually) |
| **User-visible effect** | Bot may re-enter dangerous areas, more deaths |

---

### T4: Failure Pattern Detection

**Module:** `src/layers/action-awareness.js`
**Added Methods:** `detectFailurePattern()`, `categorizeFailure()`
**Dependencies:** T9 (Reflection Module analyzes failure patterns)

#### Automatic Rollback Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Pattern detection latency | >20ms | >50ms | Disable pattern detection |
| False pattern rate | >25% | >40% | Disable pattern detection |
| Pattern storage growth | >500 patterns | >2000 patterns | Prune old patterns |
| Memory for patterns | >10MB | >50MB | Disable storage |

**Automatic Rollback Trigger:**
```javascript
// Pseudocode (in detectFailurePattern)
const startTime = Date.now();
const pattern = this._detectFailurePattern();
const latency = Date.now() - startTime;

if (latency > 50) {
  logger.warn('Pattern detection too slow, disabling');
  this.patternDetectionEnabled = false;
  emitFeatureDisabled('failure_detection', 'high_latency');
}

if (this.patternStorageSize > 2000) {
  this._pruneOldPatterns();
}
```

#### Manual Rollback Procedure

```bash
# Option 1: Environment variable
export ENABLE_FAILURE_DETECTION=false

# Option 2: Chat command
!bot feature disable patterns

# Option 3: Edit .env and restart

# Option 4: Via API
actionAwareness.patternDetectionEnabled = false;
```

#### Monitoring Metrics

| Metric | Log Location | Alert Threshold |
|--------|--------------|-----------------|
| `action_awareness/pattern/detected` | `logs/combined.log` | On pattern detection |
| `action_awareness/pattern/type` | `logs/combined.log` | Every detection |
| `action_awareness/pattern/latency_ms` | `logs/combined.log` | >20ms = warning |
| `action_awareness/pattern/false_positive_rate` | `logs/combined.log` | >0.25 = warning |
| `action_awareness/pattern/storage_size` | `logs/combined.log` | >500 = warning |

**Log Format:**
```
[2026-04-16T10:30:00.000Z] info: Failure pattern detected {
  type: 'stuck',
  action: { type: 'move', direction: 'forward' },
  count: 3,
  suggestion: 'Try jumping or pathfinding around obstacle',
  confidence: 0.9
}
```

#### Rollback Impact

| When Disabled | Behavior |
|---------------|----------|
| **Pattern detection** | Stops analyzing action history for patterns |
| **categorizeFailure()** | Still works for single categorization |
| **Reflection module** | T9 receives empty patterns array |
| **Intervention triggers** | No automatic intervention on repeated failures |
| **User-visible effect** | Bot may retry same failed action indefinitely |

---

## Wave 2: Skill System

---

### T5-T7: Skill System (Registry, Primitives, Composites, Executor)

**Modules:**
- `src/skills/skill-registry.js` (T5)
- `src/skills/primitives/*.js` (T5)
- `src/skills/composite/*.js` (T6)
- `src/skills/skill-executor.js` (T7)

**Dependencies:** T1 (confidence scoring), T6 (composite skills)

#### Automatic Rollback Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Skill execution success rate | <75% | <60% | Disable skill system |
| SkillExecutor latency (p95) | >500ms | >1000ms | Disable skill system |
| Skill registry corruption | Any detected | - | Disable skill system |
| Missing skill count | >2 | >5 | Disable and recover |
| Retry loop detection | 3+ retries/skill | 5+ retries/skill | Disable skill system |
| Memory for skill state | >20MB | >50MB | Clear and disable |

**Automatic Rollback Trigger:**
```javascript
// Pseudocode (in SkillExecutor)
if (this.executionStats.totalAttempts > 100) {
  const successRate = this.executionStats.successful / this.executionStats.totalAttempts;
  if (successRate < 0.60) {
    logger.error('Skill execution success rate critically low, disabling skill system', {
      successRate,
      totalAttempts: this.executionStats.totalAttempts
    });
    this.enabled = false;
    process.env.ENABLE_SKILL_SYSTEM = 'false';
    emitFeatureDisabled('skill_system', 'low_success_rate');
  }
}

if (this.retryCounts.get(skillName) >= 5) {
  logger.warn('Skill consistently failing after max retries, disabling', { skillName });
  this.registry.disableSkill(skillName);
}
```

#### Manual Rollback Procedure

```bash
# Option 1: Environment variable
export ENABLE_SKILL_SYSTEM=false

# Option 2: Chat command
!bot feature disable skills
# List available skills:
!bot skills list
# Execute primitive directly:
!bot exec move forward

# Option 3: Edit .env and restart

# Option 4: Via API
skillExecutor.enabled = false;
// Fall back to pilot's direct action execution
```

#### Monitoring Metrics

| Metric | Log Location | Alert Threshold |
|--------|--------------|-----------------|
| `skill/execute/start` | `logs/combined.log` | Every skill execution |
| `skill/execute/complete` | `logs/combined.log` | On completion |
| `skill/execute/fail` | `logs/combined.log` | On failure |
| `skill/execute/latency_ms` | `logs/combined.log` | >200ms = warning |
| `skill/execute/retry` | `logs/combined.log` | Any retry |
| `skill/registry/count` | `logs/combined.log` | On registry change |
| `skill/executor/success_rate` | `logs/combined.log` | <0.75 = warning |
| `skill/executor/retry_rate` | `logs/combined.log` | >0.3 = warning |

**Log Format:**
```
[2026-04-16T10:30:00.000Z] info: Skill execution started {
  skill: 'gather_wood',
  params: { type: 'oak', quantity: 10 },
  confidence: 0.85
}

[2026-04-16T10:30:45.000Z] info: Skill execution completed {
  skill: 'gather_wood',
  success: true,
  attempts: 1,
  durationMs: 45000,
  outcome: { itemsCollected: ['oak_log'] }
}

[2026-04-16T10:31:00.000Z] warn: Skill execution failed {
  skill: 'dig',
  params: { block: 'bedrock' },
  attempts: 3,
  finalReason: 'unreachable_block',
  confidence: 0.2
}
```

#### Rollback Impact

| When Disabled | Behavior |
|---------------|----------|
| **Pilot fallback** | Reverts to direct action execution (existing behavior) |
| **Primitive skills** | Still loadable but not auto-executed |
| **Composite skills** | Not available |
| **Retry logic** | Disabled (Pilot has simpler retry) |
| **Confidence integration** | Disabled |
| **User-visible effect** | No skill-based action chaining, simpler behavior |

---

### T8: Item Progression Tracker

**Module:** `src/metrics/item-tracker.js`
**Classes:** ItemTracker with track(), getStats(), getMilestones()
**Dependencies:** None (standalone)

#### Automatic Rollback Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Tracker memory usage | >5MB | >20MB | Clear old data |
| Unique item count | >1000 | >5000 | Prune oldest milestones |
| getStats() latency | >10ms | >50ms | Disable tracker |
| Event handler latency | >5ms | >20ms | Disable tracking |

**Automatic Rollback Trigger:**
```javascript
// Pseudocode (in ItemTracker)
if (this.memoryUsageMB > 20) {
  logger.warn('Item tracker memory usage high, disabling');
  this.enabled = false;
  process.env.ENABLE_ITEM_TRACKER = 'false';
}
```

#### Manual Rollback Procedure

```bash
# Option 1: Environment variable
export ENABLE_ITEM_TRACKER=false

# Option 2: Chat command
!bot feature disable tracker
# View stats before disabling:
!bot stats

# Option 3: Edit .env and restart
```

#### Monitoring Metrics

| Metric | Log Location | Alert Threshold |
|--------|--------------|-----------------|
| `metrics/item/track` | `logs/combined.log` | On each item |
| `metrics/item/milestone` | `logs/combined.log` | On milestone detection |
| `metrics/item/stats` | `logs/combined.log` | On !bot stats command |
| `metrics/item/memory_mb` | `logs/combined.log` | >5MB = warning |

#### Rollback Impact

| When Disabled | Behavior |
|---------------|----------|
| **Item tracking** | Stops recording new items |
| **Milestone detection** | Stops |
| **Stats commands** | Return last known values |
| **Reflection module** | T9 can't analyze item progression |
| **User-visible effect** | No item progression logging, no milestones |

---

## Wave 3: Learning & Autonomy

---

### T9: Reflection Module

**Module:** `src/learning/reflection-module.js`
**Classes:** ReflectionModule with reflect(), analyzePerformance(), generateLearnings()
**Timer:** Every 30 minutes in index.js
**Dependencies:** T4 (failure patterns), T7 (skill execution data)

#### Automatic Rollback Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Reflection execution time | >4s | >5s | Disable reflection |
| Reflection failure count | 2 consecutive | 3 total | Disable reflection |
| Learnings generated per cycle | <1 (if actionable) | 0 for 3 cycles | Investigate |
| KG write failures | 2 consecutive | 3 total | Disable KG storage, continue file logging |
| getSuccessRate() returns | null/undefined | - | Use default (0.5) |

**Automatic Rollback Trigger:**
```javascript
// Pseudocode (in ReflectionModule.reflect())
const startTime = Date.now();
try {
  const result = await this.reflect();
  const duration = Date.now() - startTime;

  if (duration > REFLECTION_TIME_MAX_MS) {
    logger.warn('Reflection too slow, disabling', { durationMs: duration });
    this.enabled = false;
    process.env.ENABLE_REFLECTION = 'false';
    emitFeatureDisabled('reflection', 'slow_execution');
  }

  if (result.learnings.length === 0 && this.emptyCycles > 3) {
    logger.warn('Reflection generating no learnings, disabling');
    this.enabled = false;
  }
} catch (error) {
  this.failureCount++;
  if (this.failureCount >= 3) {
    logger.error('Reflection failing consistently, disabling');
    this.enabled = false;
  }
}
```

#### Manual Rollback Procedure

```bash
# Option 1: Environment variable
export ENABLE_REFLECTION=false

# Option 2: Chat command
!bot feature disable reflection
# Force immediate reflection:
!bot reflect
# View last reflection:
!bot reflection last

# Option 3: Edit .env and restart
```

#### Monitoring Metrics

| Metric | Log Location | Alert Threshold |
|--------|--------------|-----------------|
| `learning/reflection/start` | `logs/reflections.log` | Every 30 min |
| `learning/reflection/complete` | `logs/reflections.log` | On completion |
| `learning/reflection/fail` | `logs/reflections.log` | On failure |
| `learning/reflection/duration_ms` | `logs/reflections.log` | >4000ms = warning |
| `learning/reflection/success_rate` | `logs/reflections.log` | Every cycle |
| `learning/reflection/learnings_count` | `logs/reflections.log` | 0 = warning |
| `learning/reflection/adjustments_count` | `logs/reflections.log` | >5 = warning |

**Log Format (logs/reflections.log):**
```
[2026-04-16T10:00:00.000Z] INFO: Reflection cycle started {
  periodStart: '2026-04-16T09:30:00.000Z',
  periodEnd: '2026-04-16T10:00:00.000Z',
  actionCount: 847
}

[2026-04-16T10:00:02.500Z] INFO: Reflection cycle completed {
  successRate: 0.92,
  patternsDetected: ['stuck', 'wrong_tool'],
  learnings: [
    'Move action succeeds 95% of time',
    'Dig action fails when wrong tool - switch to stone_pickaxe'
  ],
  adjustments: [
    { type: 'parameter', action: 'dig', param: 'tool', value: 'stone_pickaxe' }
  ],
  durationMs: 2500
}
```

#### Rollback Impact

| When Disabled | Behavior |
|---------------|----------|
| **Reflection timer** | Stops firing every 30 min |
| **Performance analysis** | Stops (ActionAwareness continues collecting) |
| **Learnings generation** | Stops |
| **KG storage** | Stops storing new learnings |
| **Reflection logs** | No new entries |
| **User-visible effect** | Bot doesn't learn from mistakes, no improvement over time |

---

### T10-T12: Goal Generation System

**Modules:**
- `src/goals/goal-graph.js` (T10)
- `src/goals/goal-scorer.js` (T11)
- `src/goals/goal-generator.js` (T12)
- `src/layers/commander.js` (integration)

**Dependencies:** T3 (danger predictions for scoring)

#### Automatic Rollback Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Goal generation latency | >2s | >5s | Disable goal gen |
| Goal generation failure | 2 consecutive | 3 total | Disable goal gen |
| Goal scoring latency | >500ms | >1000ms | Disable scoring, use default |
| KG goal node growth | >200 nodes | >1000 nodes | Prune old goals |
| Goal conflicts detected | >50% of goals | >70% | Disable goal gen |
| Circular dependency detected | Any | - | Disable goal gen, report error |

**Automatic Rollback Trigger:**
```javascript
// Pseudocode (in GoalGenerator)
const startTime = Date.now();
try {
  const goals = await this.generateGoals(context);
  const duration = Date.now() - startTime;

  if (duration > 5000) {
    logger.error('Goal generation too slow, disabling', { durationMs: duration });
    this.enabled = false;
    process.env.ENABLE_AUTONOMOUS_GOALS = 'false';
    emitFeatureDisabled('autonomous_goals', 'slow_generation');
  }

  if (this._hasCircularDependencies(goals)) {
    logger.error('Circular goal dependencies detected, disabling');
    this.enabled = false;
  }
} catch (error) {
  this.failureCount++;
  if (this.failureCount >= 3) {
    this.enabled = false;
  }
}
```

#### Manual Rollback Procedure

```bash
# Option 1: Environment variable
export ENABLE_AUTONOMOUS_GOALS=false

# Option 2: Chat command
!bot feature disable goals
# Manually set goal (overrides autonomous):
!bot goal collect 64 oak logs
# View current goals:
!bot goals list

# Option 3: Edit .env and restart
```

#### Monitoring Metrics

| Metric | Log Location | Alert Threshold |
|--------|--------------|-----------------|
| `goals/generate/start` | `logs/combined.log` | Every goal generation |
| `goals/generate/complete` | `logs/combined.log` | On completion |
| `goals/generate/fail` | `logs/combined.log` | On failure |
| `goals/generate/latency_ms` | `logs/combined.log` | >2000ms = warning |
| `goals/score/calculated` | `logs/combined.log` | Every scoring |
| `goals/selected` | `logs/combined.log` | On selection |
| `goals/achieved` | `logs/combined.log` | On achievement |
| `goals/conflict_rate` | `logs/combined.log` | >0.5 = warning |
| `goals/graph/node_count` | `logs/combined.log` | >200 = warning |

**Log Format:**
```
[2026-04-16T10:30:00.000Z] info: Goal generated {
  goal: { name: 'mine_iron', importance: 0.8 },
  score: 0.72,
  scoringFactors: {
    danger: 0.9,
    feasibility: 0.8,
    importance: 0.8,
    personality: 0.7
  },
  generationLatencyMs: 450
}

[2026-04-16T10:30:00.000Z] info: Goal selected {
  goal: 'mine_iron',
  score: 0.72,
  alternativesConsidered: 5
}
```

#### Rollback Impact

| When Disabled | Behavior |
|---------------|----------|
| **Autonomous goals** | Stops generating new goals |
| **Player goals** | Still work (priority over autonomous) |
| **Goal graph** | Still exists, queryable |
| **Commander integration** | Uses default goal if player none |
| **User-visible effect** | Bot waits for player commands instead of acting autonomously |

---

## Generic Rollback Infrastructure

### Feature Disable Notification

When any feature is automatically disabled, emit to state for monitoring:

```javascript
// In emitFeatureDisabled()
stateManager.write('feature_disabled', {
  feature,
  reason,
  timestamp: Date.now(),
  metrics: getCurrentMetrics()
});

// Also log
logger.error('Feature automatically disabled', { feature, reason });
```

### Health Check Endpoint

```javascript
// GET /health endpoint returns:
{
  features: {
    confidence_scoring: { enabled: true, health: 'good' },
    auto_consolidation: { enabled: true, health: 'good' },
    danger_prediction: { enabled: true, health: 'good' },
    failure_detection: { enabled: true, health: 'good' },
    skill_system: { enabled: true, health: 'good' },
    item_tracker: { enabled: true, health: 'good' },
    reflection: { enabled: true, health: 'good' },
    autonomous_goals: { enabled: true, health: 'good' }
  },
  system: {
    memoryUsageMB: 45,
    kgNodeCount: 3847,
    rpmUsage: 342,
    uptimeSeconds: 3600
  }
}
```

### Recovery Procedure

After feature disabled and issue fixed:

```bash
# 1. Verify issue is resolved
grep "Feature disabled" logs/combined.log
# Check the specific metric that caused disable

# 2. Re-enable feature
export ENABLE_FEATURE=true
# OR
!bot feature enable <feature_name>

# 3. Monitor for 5 minutes
watch -n 10 "curl -s /health | jq '.features.<feature_name>'"

# 4. If stable, document in learnings
```

---

## Rollback Priority Matrix

| Feature | Priority | Blocks | Blocked By | Auto-Disable Risk |
|---------|----------|--------|------------|-------------------|
| T1: Confidence Scoring | HIGH | T7 | None | Low |
| T2: Auto Consolidation | HIGH | None | None | Low |
| T3: Danger Prediction | HIGH | T11 | None | Low |
| T4: Failure Detection | HIGH | T9 | None | Low |
| T5-T7: Skill System | CRITICAL | T9 | T1, T6 | Medium |
| T8: Item Tracker | LOW | None | None | Very Low |
| T9: Reflection | MEDIUM | None | T4, T7 | Medium |
| T10-T12: Goal Gen | MEDIUM | None | T3 | Medium |

---

## Summary Checklist

- [x] Feature flags defined in .env.example format
- [x] Automatic rollback thresholds specified for all 10 features
- [x] Manual rollback procedures documented (4 methods each)
- [x] Monitoring metrics defined (log locations, alert thresholds)
- [x] Rollback impact documented (what happens when disabled)
- [x] Generic rollback infrastructure specified

---

*Document generated: 2026-04-16*
*Task owner: Sisyphus-Junior*