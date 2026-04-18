# Draft: Project Sid Enhancements for Minecraft AI Bot

## Analysis Date: 2026-04-16

---

## Current State Assessment

### What You Already Have (PIANO Foundation)

Your bot already implements several PIANO architecture concepts:

1. **Cognitive Controller** (`src/layers/cognitive-controller.js`)
   - Priority-based decision synthesis (Danger > Social > Goals)
   - Coherence checking between talk and action
   - Broadcasting decisions to modules

2. **Action Awareness** (`src/layers/action-awareness.js`)
   - Pre/post state verification for actions
   - Outcome mismatch detection
   - Error logging to state/action_error.json

3. **Emotion Detector** (`src/emotion/emotion-detector.js`)
   - 13 emotion classes with transformers.js
   - P99 latency <50ms
   - Confidence threshold filtering (0.7)

4. **Social Awareness** (`src/social/social-awareness.js`)
   - BDI model (Beliefs, Desires, Intentions)
   - Sentiment tracking with trend analysis
   - Intention inference from context

5. **Knowledge Graph** (`src/memory/knowledge-graph.js`)
   - Temporal validity filtering
   - LRU eviction (10,000 node limit)
   - Memory types: spatial, temporal, episodic, semantic

### What's Missing from Project Sid Paper

Based on the paper's findings, here are the gaps:

---

## Gap Analysis

### 1. **Multi-Agent Coordination** (Paper Section 4-5)
**Status:** Not implemented
**Paper Finding:** Agents in groups of 50-100 form social relationships, specialize roles, and follow collective rules

**Your Current State:**
- Single bot only
- No agent-to-agent communication
- No role specialization
- No collective rule systems

**Impact:** Medium priority (unless you plan multi-bot scenarios)

---

### 2. **Goal Generation Module** (Paper Section 2.3)
**Status:** Partially implemented
**Paper Finding:** Autonomous goal generation based on experiences and environmental interactions

**Your Current State:**
- Commander generates goals via LLM
- No graph-based goal reasoning
- No experience-driven goal emergence
- Goals are reactive, not proactive

**Impact:** High priority (improves autonomy)

---

### 3. **Skill Execution Module** (Paper Section 2.3)
**Status:** Basic implementation
**Paper Finding:** Hierarchical skill library with composition and reuse

**Your Current State:**
- Actions are primitive (move, dig, craft)
- No skill library or composition
- No skill learning or improvement
- Each action is one-shot, no chaining

**Impact:** High priority (enables complex behaviors)

---

### 4. **Concurrent Module Execution** (Paper Section 2.1)
**Status:** Sequential execution
**Paper Finding:** Different modules run concurrently at different time scales

**Your Current State:**
- 3-layer hierarchy runs sequentially
- Pilot waits for Strategy, Strategy waits for Commander
- No true parallelism between modules
- Adaptive loop timing exists but not concurrent

**Impact:** Medium priority (performance optimization)

---

### 5. **Memory Consolidation** (Paper Section 3.2)
**Status:** Implemented but not automated
**Paper Finding:** STM → Episodic → LTM consolidation based on importance

**Your Current State:**
- Knowledge graph has consolidate() method
- Not called automatically
- No importance scoring for memories
- No forgetting mechanism

**Impact:** Medium priority (prevents memory bloat)

---

### 6. **Specialization System** (Paper Section 5.1)
**Status:** Not implemented
**Paper Finding:** Agents autonomously develop professional identities

**Your Current State:**
- Personality system exists (Soul.md)
- No role/profession concept
- No skill specialization
- No identity evolution beyond personality traits

**Impact:** Low priority (single bot doesn't need specialization)

---

### 7. **Cultural Transmission** (Paper Section 5.3)
**Status:** Not implemented
**Paper Finding:** Memes, beliefs, and practices spread between agents

**Your Current State:**
- No multi-agent system
- No belief propagation
- No cultural memory

**Impact:** Low priority (requires multi-agent)

---

### 8. **Benchmarking System** (Paper Section 3.2)
**Status:** Not implemented
**Paper Finding:** Item progression tracking, unique items acquired over time

**Your Current State:**
- No progression metrics
- No achievement tracking
- No performance benchmarks
- Tests exist but no in-game metrics

**Impact:** Medium priority (helps measure improvement)

---

## Recommended Enhancements (Prioritized)

### Priority 1: High-Impact, Single-Bot Improvements

These directly improve your bot's autonomy and capability without requiring multi-agent systems.

#### 1.1 Hierarchical Skill Library (Paper Section 2.3)
**Effort:** 4-6 hours
**Impact:** Enables complex behaviors through skill composition

**What to build:**
- Skill registry with primitive skills (move, dig, place, craft)
- Composite skills that chain primitives (e.g., "gather_wood" = find_tree + dig_logs + collect)
- Skill learning: track success rates, improve over time
- Skill parameters: skills accept context (location, quantity, tool)

**Files to create:**
- `src/skills/skill-registry.js` - Central skill storage
- `src/skills/primitives/` - Basic actions (move.js, dig.js, craft.js)
- `src/skills/composite/` - Complex behaviors (gather-wood.js, build-shelter.js)
- `src/skills/skill-executor.js` - Executes skills with retry logic

**Integration:**
- Pilot calls skill-executor instead of raw bot actions
- Strategy plans using skill names, not primitive actions
- Commander sets goals that map to high-level skills

**Example:**
```javascript
// Before (primitive actions)
plan = [
  { action: 'move', target: tree },
  { action: 'dig', block: 'oak_log' },
  { action: 'dig', block: 'oak_log' },
  { action: 'collect', item: 'oak_log' }
]

// After (skill-based)
plan = [
  { skill: 'gather_wood', params: { type: 'oak', quantity: 64 } }
]
```

---

#### 1.2 Graph-Based Goal Generation (Paper Section 2.3)
**Effort:** 3-4 hours
**Impact:** Autonomous goal creation based on experience

**What to build:**
- Goal graph: nodes = goals, edges = dependencies
- Goal scoring: importance based on personality, recent events, player needs
- Goal selection: pick highest-scoring achievable goal
- Goal memory: remember completed goals, avoid repetition

**Files to create:**
- `src/goals/goal-graph.js` - Graph structure with dependencies
- `src/goals/goal-scorer.js` - Scores goals by importance
- `src/goals/goal-generator.js` - Creates new goals from context

**Integration:**
- Commander uses goal-generator when no player-set goal exists
- Goals influenced by personality (curious bot explores, loyal bot stays close)
- Goals adapt to recent events (found diamonds → mine more, died → be cautious)

**Example goal graph:**
```
survive (root)
  ├─ find_food (if health < 10)
  ├─ find_shelter (if night approaching)
  └─ gather_resources
      ├─ mine_iron (requires stone_pickaxe)
      ├─ gather_wood (no prereqs)
      └─ find_diamonds (requires iron_pickaxe)
```

---

#### 1.3 Item Progression Benchmarking (Paper Section 3.2)
**Effort:** 2-3 hours
**Impact:** Measurable progress tracking

**What to build:**
- Item tracker: log every unique item acquired with timestamp
- Progression metrics: items/hour, tech tree advancement
- Milestone detection: first iron, first diamond, first nether entry
- Performance dashboard: visualize progress over time

**Files to create:**
- `src/metrics/item-tracker.js` - Tracks unique items acquired
- `src/metrics/progression-analyzer.js` - Calculates metrics
- `src/metrics/dashboard.js` - Simple web UI (optional)

**Integration:**
- Pilot reports item acquisitions to tracker
- Commander uses metrics to adjust goals (stuck on wood → try different biome)
- Tests validate progression benchmarks

**Metrics to track:**
```javascript
{
  uniqueItems: 47,
  itemsPerHour: 12.3,
  techTreeLevel: 'iron_age', // wood → stone → iron → diamond → nether
  milestones: [
    { name: 'first_iron', timestamp: 1234567890 },
    { name: 'first_diamond', timestamp: 1234567900 }
  ],
  sessionDuration: 3600000 // 1 hour
}
```

---

### Priority 2: Performance & Robustness

These make your bot more reliable and efficient.

#### 2.1 Automated Memory Consolidation (Paper Section 3.2)
**Effort:** 2-3 hours
**Impact:** Prevents memory bloat, improves recall

**What to build:**
- Background consolidation task (runs every 10 minutes)
- Importance scoring for episodic memories
- Automatic STM → Episodic → LTM promotion
- Forgetting: drop low-importance memories after threshold

**Files to modify:**
- `src/memory/knowledge-graph.js` - Add auto-consolidation timer
- `src/index.js` - Start consolidation task on bot startup

**Integration:**
- Consolidation runs in background, doesn't block main loop
- Importance scores based on: player involvement, danger level, novelty
- Memories decay over time unless reinforced

**Consolidation rules:**
```javascript
// STM → Episodic (after 1 hour)
if (age > 1h && importance >= 3) promote_to_episodic()
else if (age > 1h && importance < 3) forget()

// Episodic → LTM (after 24 hours)
if (age > 24h && importance >= 6) promote_to_ltm()
else if (age > 24h && importance < 6) forget()
```

---

#### 2.2 Concurrent Module Execution (Paper Section 2.1)
**Effort:** 4-6 hours
**Impact:** Faster response times, true parallelism

**What to build:**
- Module runner: executes modules in parallel threads/workers
- Shared state: thread-safe access to bot state
- Priority scheduling: danger modules run immediately, planning modules can wait
- Synchronization: cognitive controller waits for all inputs before deciding

**Files to create:**
- `src/concurrency/module-runner.js` - Parallel execution engine
- `src/concurrency/shared-state.js` - Thread-safe state access

**Integration:**
- Replace sequential layer execution with parallel module execution
- Cognitive controller becomes synchronization point
- Modules run at different frequencies (danger: 200ms, social: 1s, planning: 5s)

**Architecture change:**
```javascript
// Before (sequential)
await pilot.loop()
await strategy.loop()
await commander.loop()

// After (concurrent)
moduleRunner.start([
  { module: dangerDetector, interval: 200 },
  { module: socialProcessor, interval: 1000 },
  { module: goalPlanner, interval: 5000 }
])
cognitiveController.synthesize(moduleRunner.getOutputs())
```

---

#### 2.3 Enhanced Action Awareness (Paper Section 2.1)
**Effort:** 2-3 hours
**Impact:** Better hallucination detection

**What to build:**
- Confidence scoring for action predictions
- Multi-step verification (check state multiple times)
- Failure pattern detection (same action fails repeatedly)
- Automatic fallback strategies

**Files to modify:**
- `src/layers/action-awareness.js` - Add confidence scoring and patterns

**Enhancements:**
```javascript
// Add confidence to predictions
_predictOutcome(action) {
  return {
    outcome: { moved: true },
    confidence: 0.9, // High confidence for simple actions
    fallback: { action: 'stop' } // What to do if fails
  }
}

// Detect failure patterns
_detectPattern(recentFailures) {
  // Same action failed 3+ times → stuck
  // Different actions failed → environment issue
  // Random failures → low confidence predictions
}
```

---

### Priority 3: Multi-Agent Foundation

These prepare for future multi-bot scenarios but aren't critical now.

#### 3.1 Agent Communication Protocol (Paper Section 4)
**Effort:** 3-4 hours
**Impact:** Enables multi-bot coordination (future)

**What to build:**
- Message bus: agents publish/subscribe to topics
- Message types: request, inform, query, command
- Addressing: send to specific agent or broadcast
- Message history: track conversations between agents

**Files to create:**
- `src/multi-agent/message-bus.js` - Pub/sub system
- `src/multi-agent/agent-registry.js` - Track active agents

**Use cases (future):**
- Bot A: "I found diamonds at (100, 12, 200)"
- Bot B: "Can you bring me wood? I'm building."
- Bot C: "Creeper approaching your location!"

---

#### 3.2 Role Specialization System (Paper Section 5.1)
**Effort:** 4-5 hours
**Impact:** Bots develop unique identities (future)

**What to build:**
- Role definitions: miner, builder, explorer, guard
- Skill affinity: roles prefer certain skills
- Role evolution: roles change based on actions taken
- Role-based goal generation: miners seek ores, builders seek materials

**Files to create:**
- `src/roles/role-system.js` - Role definitions and evolution
- `src/roles/role-goals.js` - Role-specific goal generation

**Example:**
```javascript
// Bot starts as generalist
role = { type: 'generalist', affinities: {} }

// After 100 mining actions
role = { 
  type: 'miner', 
  affinities: { mining: 0.8, combat: 0.2 },
  goals: ['find_ores', 'upgrade_pickaxe', 'explore_caves']
}
```

---

---

## Additional Enhancements from Paper

### 4.1 Reflection Module (Paper mentions but not detailed)
**Effort:** 3-4 hours
**Impact:** Bot learns from mistakes

**What to build:**
- Periodic reflection: every 30 minutes, analyze recent actions
- Success/failure analysis: what worked, what didn't
- Pattern extraction: identify recurring problems
- Strategy adjustment: update approach based on learnings

**Example reflection:**
```javascript
{
  period: '2026-04-16 10:00 - 10:30',
  actions_taken: 47,
  successes: 42,
  failures: 5,
  patterns: [
    'Failed to mine iron 3 times - wrong tool',
    'Successfully gathered 64 wood in 5 minutes',
    'Avoided 2 creepers by retreating early'
  ],
  learnings: [
    'Always check tool before mining',
    'Oak forest is efficient for wood gathering',
    'Early retreat prevents deaths'
  ],
  adjustments: [
    'Add tool check to mining skill',
    'Prefer oak forests for wood goals',
    'Reduce danger threshold from 16 to 20 blocks'
  ]
}
```

---

### 4.2 Social Relationship Tracking (Paper Section 4.2)
**Effort:** 2-3 hours (already partially implemented)
**Impact:** Deeper player relationships

**What to enhance:**
- Relationship graph: track sentiment over time
- Reciprocity detection: does player help back?
- Trust scoring: based on consistent positive interactions
- Relationship-driven goals: help trusted players more

**Files to modify:**
- `src/social/social-awareness.js` - Add relationship graph
- `src/goals/goal-generator.js` - Use relationships in goal scoring

**Example:**
```javascript
relationships = {
  'Player1': {
    sentiment: 0.85, // Very positive
    trust: 0.9,
    reciprocity: 0.7, // Player helps back 70% of time
    interactions: 127,
    lastInteraction: timestamp,
    sharedExperiences: [
      'defeated_ender_dragon',
      'built_base_together',
      'survived_raid'
    ]
  }
}
```

---

### 4.3 Danger Prediction (Not in paper, but useful)
**Effort:** 2-3 hours
**Impact:** Proactive threat avoidance

**What to build:**
- Threat history: track where dangers occurred
- Danger zones: mark areas as risky
- Time-based patterns: night is dangerous, caves are risky
- Predictive warnings: "This area had 3 creepers yesterday"

**Files to create:**
- `src/safety/danger-predictor.js` - Predicts threats based on history
- `src/safety/danger-zones.js` - Spatial danger tracking

**Integration:**
- Pilot checks danger predictor before moving
- Strategy avoids danger zones when planning paths
- Commander factors danger into goal selection

---

## Implementation Roadmap

### Phase 1: Core Autonomy (10-15 hours)
**Goal:** Bot can play independently with minimal player input

1. Hierarchical Skill Library (4-6h)
2. Graph-Based Goal Generation (3-4h)
3. Item Progression Benchmarking (2-3h)

**Outcome:** Bot autonomously sets goals, executes complex skills, tracks progress

---

### Phase 2: Robustness (8-12 hours)
**Goal:** Bot is reliable and learns from mistakes

1. Automated Memory Consolidation (2-3h)
2. Enhanced Action Awareness (2-3h)
3. Reflection Module (3-4h)

**Outcome:** Bot doesn't get stuck, learns from failures, manages memory efficiently

---

### Phase 3: Performance (4-6 hours)
**Goal:** Bot responds faster and handles complexity better

1. Concurrent Module Execution (4-6h)

**Outcome:** Sub-second response times, true parallelism

---

### Phase 4: Multi-Agent (Optional, 7-9 hours)
**Goal:** Foundation for multiple bots working together

1. Agent Communication Protocol (3-4h)
2. Role Specialization System (4-5h)

**Outcome:** Ready for multi-bot scenarios

---

## Quick Wins (Can implement today)

### Quick Win 1: Item Tracker (1 hour)
Add basic item progression tracking to see bot improvement over time.

```javascript
// src/metrics/simple-tracker.js
class ItemTracker {
  constructor() {
    this.items = new Set();
    this.timestamps = new Map();
  }
  
  track(itemName) {
    if (!this.items.has(itemName)) {
      this.items.add(itemName);
      this.timestamps.set(itemName, Date.now());
      console.log(`New item acquired: ${itemName} (${this.items.size} total)`);
    }
  }
  
  getStats() {
    return {
      uniqueItems: this.items.size,
      items: Array.from(this.items),
      firstItem: this.timestamps.get(Array.from(this.items)[0])
    };
  }
}
```

---

### Quick Win 2: Automated Memory Consolidation (1 hour)
Add a simple timer to consolidate memories periodically.

```javascript
// In src/index.js
const consolidationInterval = setInterval(() => {
  const stats = knowledgeGraph.consolidate();
  logger.info('Memory consolidated', stats);
}, 10 * 60 * 1000); // Every 10 minutes
```

---

### Quick Win 3: Danger Zone Tracking (1 hour)
Track where the bot died or took damage.

```javascript
// src/safety/danger-zones.js
class DangerZones {
  constructor() {
    this.zones = [];
  }
  
  markDangerous(position, reason) {
    this.zones.push({
      position: { ...position },
      reason,
      timestamp: Date.now(),
      radius: 20 // blocks
    });
  }
  
  isDangerous(position) {
    return this.zones.some(zone => {
      const dist = Math.sqrt(
        Math.pow(position.x - zone.position.x, 2) +
        Math.pow(position.z - zone.position.z, 2)
      );
      return dist < zone.radius;
    });
  }
}

// In pilot.js
bot.on('death', () => {
  dangerZones.markDangerous(bot.entity.position, 'death');
});
```

---

## Decisions Needed

1. **Multi-agent support?** Do you want multiple bots interacting, or keep it single-bot?
   - **Recommendation:** Skip for now, focus on single-bot autonomy first

2. **Skill complexity?** Should the bot learn complex skill chains?
   - **Recommendation:** Yes, start with 5-10 composite skills (gather_wood, mine_iron, build_shelter)

3. **Autonomy level?** How autonomous should goal generation be?
   - **Recommendation:** Hybrid - player can set goals, but bot generates its own when idle

4. **Performance priority?** Is concurrent execution worth the complexity?
   - **Recommendation:** Implement after Phase 1-2, not critical initially

---

## Recommended Starting Point

**Start with Phase 1, Task 1: Hierarchical Skill Library**

Why?
- Highest impact on bot capability
- Enables all other enhancements
- Makes bot behavior more predictable and maintainable
- Directly addresses paper's findings on skill execution

**Next steps:**
1. Implement skill registry and primitives (2h)
2. Create 3-5 composite skills (2h)
3. Integrate with Pilot layer (1h)
4. Test with existing goals (1h)

**Total:** 6 hours for a major capability upgrade

---

## Testing Strategy

### For Each Enhancement

1. **Unit tests:** Test individual components in isolation
2. **Integration tests:** Test component interactions
3. **E2E tests:** Test full bot behavior in Minecraft
4. **Benchmark tests:** Measure performance improvements

### Specific Metrics

- **Skill Library:** Success rate per skill, execution time
- **Goal Generation:** Goals generated per hour, goal completion rate
- **Item Tracking:** Items/hour, tech tree progression speed
- **Memory Consolidation:** Memory size over time, recall accuracy
- **Concurrent Execution:** Response latency, CPU usage

---

## Summary

**What you have:** Strong PIANO foundation with cognitive controller, action awareness, emotion detection, social awareness, and knowledge graph.

**What's missing:** Hierarchical skills, autonomous goal generation, progression tracking, automated memory management.

**Recommended path:**
1. Phase 1 (Core Autonomy) - 10-15 hours
2. Quick Wins (3 hours) - Can do in parallel
3. Phase 2 (Robustness) - 8-12 hours
4. Phase 3 (Performance) - 4-6 hours
5. Phase 4 (Multi-Agent) - Optional, future work

**Total effort:** 25-36 hours for a fully autonomous, robust bot that matches Project Sid's single-agent capabilities.

**Next immediate action:** Implement Hierarchical Skill Library (6 hours)
