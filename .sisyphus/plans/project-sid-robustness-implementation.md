# Project Sid: Robustness-Focused Implementation Plan

**Priority:** Robustness (fewer errors, better learning, reliable operation)  
**Scope:** Single-bot, skip multi-agent features  
**Estimated Total Effort:** 25-30 hours  
**Target:** Production-ready autonomous bot that learns from mistakes and operates reliably

---

## TL;DR

> **Quick Summary:** Implement 20 tasks (4 validation + 16 implementation) to make your bot robust, autonomous, and self-improving
> 
> **Deliverables:**
> - Validation report confirming technical feasibility
> - Integration and edge case test matrices
> - Rollback criteria and feature flags
> - Hierarchical skill system with retry logic
> - Automated memory consolidation
> - Enhanced action awareness with failure pattern detection
> - Reflection module that learns from mistakes
> - Graph-based goal generation
> - Item progression benchmarking
> - Danger prediction system
> 
> **Estimated Effort:** 38-48 hours (5h validation + 33-43h implementation)  
> **Execution Strategy:** Wave 0 validation (sequential), then 4 waves with parallel tasks

---

## Context

### Original Request
User wants to implement enhancements from Project Sid paper (arxiv.org/abs/2411.00114v1) focusing on robustness, skipping multi-agent features, full implementation.

### Metis Consultation Results
Metis identified critical gaps:
- 7 unvalidated technical assumptions (API compatibility, performance, concurrency)
- 12 edge cases not addressed (death, disconnection, resource limits)
- Missing integration tests between new modules
- No rollback criteria for feature failures
- Scope creep risks in skill learning, goal optimization, danger prediction

**Key Metis Recommendations:**
1. Add Wave 0 validation tasks before implementation (5 hours)
2. Define integration test matrix upfront
3. Define edge case test matrix upfront
4. Define rollback criteria for each feature
5. Add explicit guardrails to prevent scope creep

---

## Context

### Original Request
User wants to implement enhancements from Project Sid paper (arxiv.org/abs/2411.00114v1) focusing on robustness.

### Current State
- Strong PIANO foundation exists
- Basic action awareness implemented
- Memory system exists but no auto-consolidation
- Primitive actions only (no skill composition)
- No autonomous goal generation
- No learning from failures

### Project Sid Key Findings
- Agents acquired 320+ unique items in 4 hours
- Action awareness prevents hallucination cascades
- Memory consolidation prevents bloat
- Hierarchical skills enable complex behaviors
- Reflection improves performance over time

---

## Work Objectives

### Core Objective
Build a robust, self-improving bot that operates reliably without human intervention and learns from mistakes.

### Concrete Deliverables
1. Skill library with 10+ composite skills
2. Automated memory consolidation running every 10 minutes
3. Enhanced action awareness with confidence scoring
4. Reflection module analyzing performance every 30 minutes
5. Goal generation system creating autonomous objectives
6. Item progression tracker with benchmarks
7. Danger prediction system avoiding known threats

### Definition of Done
- [ ] Bot runs for 4+ hours without getting stuck
- [ ] Bot acquires 100+ unique items autonomously
- [ ] Action success rate >90%
- [ ] Memory size stays under 10,000 nodes
- [ ] Bot learns from failures (reflection logs show improvements)
- [ ] All tests passing with 70%+ coverage

### Must Have
- Retry logic for failed actions
- Failure pattern detection
- Automated memory management
- Learning from mistakes
- Robust error recovery

### Must NOT Have (Guardrails)

**From Metis Analysis - Scope Guardrails:**

**Skill System:**
- No more than 10 primitive skills (plan has 5, buffer for 5 more)
- No more than 8 composite skills (plan has 5, buffer for 3 more)
- No skill learning/ML models (rule-based retry only)
- No visual skill editors or DSLs
- No skill "inheritance" or "polymorphism" abstractions

**Goal Generation:**
- No more than 1 goal per minute maximum
- No goals requiring multi-agent coordination
- No goal "negotiation" with player
- No goal visualization beyond simple text logs
- No goal "dependencies" deeper than 3 levels

**Reflection Module:**
- No automatic code or configuration modification
- No more than 5 adjustments per reflection cycle
- No "meta-learning" or gradient descent
- No reflection history beyond 30 days
- No reflection "models" requiring training

**Integration:**
- No refactoring of existing Commander/Strategy/Pilot architecture
- No changes to file-based state communication pattern
- No message queues or event buses between layers
- No new LLM prompts in separate files (keep inline as existing)
- No rate limiter modifications without analyzing 448 RPM impact

**Testing:**
- No E2E tests longer than 1 hour each
- No visual regression tests
- No load testing or stress testing
- No mock Minecraft servers for testing
- No performance profiling beyond simple benchmarks

**General AI Slop Prevention:**
- No over-abstraction (keep it simple and maintainable)
- No excessive comments or documentation in code
- No generic variable names (data, result, item, temp)
- No empty catch blocks or console.log in production
- No breaking existing functionality

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - All verification is automated

### Test Decision
- **Infrastructure exists**: YES (Jest, unit/integration/e2e tests)
- **Automated tests**: Tests-after (implement feature, then test)
- **Framework**: Jest + Mineflayer test server

### QA Policy
Every task includes automated QA scenarios with evidence capture.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Validation & Design - REQUIRED BEFORE IMPLEMENTATION):
├── Task 0.1: Validate Technical Assumptions [quick]
├── Task 0.2: Define Integration Test Matrix [quick]
├── Task 0.3: Define Edge Case Test Matrix [quick]
└── Task 0.4: Define Rollback Criteria [quick]

Wave 1 (Robustness Foundation - START AFTER WAVE 0):
├── Task 1: Enhanced Action Awareness [deep]
├── Task 2: Automated Memory Consolidation [quick]
├── Task 3: Danger Prediction System [unspecified-high]
└── Task 4: Failure Pattern Detection [deep]

Wave 2 (After Wave 1 - Core Skills):
├── Task 5: Skill Registry & Primitives [unspecified-high]
├── Task 6: Composite Skills (5 skills) [unspecified-high]
├── Task 7: Skill Executor with Retry [deep]
└── Task 8: Item Progression Tracker [quick]

Wave 3 (After Wave 2 - Learning & Autonomy):
├── Task 9: Reflection Module [deep]
├── Task 10: Goal Graph Structure [unspecified-high]
├── Task 11: Goal Scorer & Generator [deep]
└── Task 12: Integration with Commander [unspecified-high]

Wave 4 (After Wave 3 - Testing & Polish):
├── Task 13: E2E Robustness Tests [unspecified-high]
├── Task 14: Performance Benchmarks [quick]
├── Task 15: Documentation Updates [writing]
└── Task 16: Final Integration & Cleanup [unspecified-high]

Critical Path: T1 → T7 → T9 → T13
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 4 tasks per wave
```

---

## TODOs

### Wave 0: Validation & Design (REQUIRED FIRST)

- [x] 0.1. Validate Technical Assumptions

  **What to do**:
  - Validate A1: Test action-awareness API extensions don't break existing Pilot calls
  - Validate A2: Benchmark current consolidate() execution time
  - Validate A3: Test long-running skill execution with danger detection
  - Validate A4: Review knowledge-graph.js extensibility for new memory types
  - Validate A5: Calculate total RPM including new features (goal gen + reflection)
  - Validate A6: Test 4-hour bot run on current hardware
  - Validate A7: Run 3 test worlds, measure item acquisition variance
  - Document findings in validation report

  **Must NOT do**:
  - Don't implement any features yet (validation only)
  - Don't modify existing code
  - Don't skip any validation

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Validation tests, no implementation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (must complete before Wave 1)
  - **Parallel Group**: Wave 0 (sequential with 0.2, 0.3, 0.4)
  - **Blocks**: All Wave 1 tasks
  - **Blocked By**: None (first task)

  **References**:
  - `src/layers/action-awareness.js:20` - Current API to validate
  - `src/memory/knowledge-graph.js:700` - consolidate() to benchmark
  - `src/layers/pilot.js:22-26` - Adaptive loop intervals

  **Acceptance Criteria**:
  - [ ] Validation report created: .sisyphus/validation-report.md
  - [ ] All 7 assumptions validated with evidence
  - [ ] Blockers identified (if any)
  - [ ] Go/no-go decision documented

  **QA Scenarios**:
  ```
  Scenario: Action-awareness API extension compatibility
    Tool: Bash (node REPL)
    Steps:
      1. node -e "const AA = require('./src/layers/action-awareness'); const aa = new AA(mockBot, mockVision); aa._calculateConfidence = () => 0.8; const result = aa.executeWithVerification({type: 'move'}, {moved: true}); console.log(result);"
      2. Assert existing API still works with new methods added
    Expected Result: No breaking changes
    Evidence: .sisyphus/evidence/task-0.1-api-compatibility.txt
  ```

  **Commit**: YES
  - Message: `chore(validation): validate technical assumptions before implementation`
  - Files: `.sisyphus/validation-report.md`

- [x] 0.2. Define Integration Test Matrix

  **What to do**:
  - Create matrix of all module pairs that need integration tests
  - Define test scenarios for each integration point
  - Identify critical paths (e.g., Skill Executor → Action Awareness)
  - Document expected behavior at each integration boundary
  - Create test templates for each integration type

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 0 (after 0.1)
  - **Blocks**: All Wave 1 tasks
  - **Blocked By**: Task 0.1

  **Acceptance Criteria**:
  - [ ] Integration matrix created: .sisyphus/integration-matrix.md
  - [ ] All 16 module pairs identified
  - [ ] Test scenarios defined for each pair

  **Commit**: YES
  - Message: `chore(testing): define integration test matrix`
  - Files: `.sisyphus/integration-matrix.md`

- [ ] 0.3. Define Edge Case Test Matrix

  **What to do**:
  - Document all 12 edge cases from Metis analysis (E1-E12)
  - Define test scenarios for each edge case
  - Assign edge cases to relevant tasks
  - Create test templates for edge case handling
  - Define expected behavior for each edge case

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 0 (after 0.2)
  - **Blocks**: All Wave 1 tasks
  - **Blocked By**: Task 0.2

  **Acceptance Criteria**:
  - [ ] Edge case matrix created: .sisyphus/edge-case-matrix.md
  - [ ] All 12 edge cases documented with test scenarios
  - [ ] Edge cases assigned to tasks

  **Commit**: YES
  - Message: `chore(testing): define edge case test matrix`
  - Files: `.sisyphus/edge-case-matrix.md`

- [ ] 0.4. Define Rollback Criteria

  **What to do**:
  - Define rollback criteria for each new feature
  - Specify thresholds for disabling features automatically
  - Document manual rollback procedures
  - Create feature flags for each new system
  - Define monitoring metrics for rollback decisions

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 0 (after 0.3)
  - **Blocks**: All Wave 1 tasks
  - **Blocked By**: Task 0.3

  **Acceptance Criteria**:
  - [ ] Rollback criteria document: .sisyphus/rollback-criteria.md
  - [ ] Feature flags defined in .env.example
  - [ ] Monitoring metrics specified

  **Commit**: YES
  - Message: `chore(robustness): define rollback criteria and feature flags`
  - Files: `.sisyphus/rollback-criteria.md`, `.env.example`

---

## TODOs (Wave 1-4)

- [ ] 1. Enhanced Action Awareness with Confidence Scoring

  **What to do**:
  - Add confidence scoring to action predictions (0.0-1.0 scale)
  - Implement multi-step verification (check state at 100ms, 500ms, 1000ms intervals)
  - Add fallback strategies for each action type
  - Track prediction accuracy over time
  - Log confidence vs actual success correlation

  **Must NOT do**:
  - Don't add complex ML models (keep it rule-based)
  - Don't break existing action-awareness API
  - Don't add UI components

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful reasoning about failure modes and confidence calculation
  - **Skills**: []
    - No special skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Task 7 (Skill Executor needs confidence scoring)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/layers/action-awareness.js:20-77` - Existing executeWithVerification pattern
  - `src/layers/action-awareness.js:112-140` - Current outcome extraction logic

  **API/Type References**:
  - `src/layers/action-awareness.js:20` - executeWithVerification signature to extend

  **Test References**:
  - `tests/unit/action-awareness.test.js` - Existing test patterns for verification

  **External References**:
  - Project Sid paper Section 2.1 - Action awareness prevents hallucination cascades

  **WHY Each Reference Matters**:
  - action-awareness.js shows current verification flow - add confidence before execution
  - Tests show how to validate verification logic - extend for confidence scoring
  - Paper explains why confidence matters - prevents cascading failures

  **Acceptance Criteria**:

  **Code Changes**:
  - [ ] File modified: src/layers/action-awareness.js (add confidence scoring)
  - [ ] Method added: _calculateConfidence(action, context)
  - [ ] Method added: _verifyMultiStep(action, expectedOutcome)
  - [ ] Property added: confidenceHistory array for tracking

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: High confidence action succeeds
    Tool: Bash (node REPL)
    Preconditions: Bot in test world, action-awareness loaded
    Steps:
      1. node -e "const AA = require('./src/layers/action-awareness'); const aa = new AA(mockBot, mockVision); const result = aa._calculateConfidence({type: 'move', direction: 'forward'}, {clear: true}); console.log(result);"
      2. Assert result.confidence >= 0.8
      3. Assert result.fallback exists
    Expected Result: Confidence score 0.8-1.0 for simple move action
    Failure Indicators: Confidence < 0.8 or undefined
    Evidence: .sisyphus/evidence/task-1-confidence-calculation.txt

  Scenario: Low confidence action triggers fallback
    Tool: Bash (node REPL)
    Preconditions: Bot facing obstacle, action-awareness loaded
    Steps:
      1. node -e "const AA = require('./src/layers/action-awareness'); const aa = new AA(mockBot, mockVision); const result = aa._calculateConfidence({type: 'dig', block: 'diamond_ore'}, {tool: 'wooden_pickaxe'}); console.log(result);"
      2. Assert result.confidence < 0.5
      3. Assert result.fallback.action === 'stop' or 'get_better_tool'
    Expected Result: Confidence < 0.5, fallback strategy provided
    Failure Indicators: High confidence for impossible action
    Evidence: .sisyphus/evidence/task-1-low-confidence-fallback.txt
  ```

  **Evidence to Capture**:
  - [ ] task-1-confidence-calculation.txt (confidence scores for various actions)
  - [ ] task-1-low-confidence-fallback.txt (fallback strategy output)

  **Commit**: YES
  - Message: `feat(action-awareness): add confidence scoring and multi-step verification`
  - Files: `src/layers/action-awareness.js`, `tests/unit/action-awareness.test.js`
  - Pre-commit: `npm run test:unit -- action-awareness`

- [ ] 2. Automated Memory Consolidation

  **What to do**:
  - Add background timer to call knowledgeGraph.consolidate() every 10 minutes
  - Implement importance scoring for episodic memories (1-10 scale)
  - Add consolidation stats logging (STM→Episodic, Episodic→LTM, dropped)
  - Ensure consolidation doesn't block main bot loop
  - Add manual trigger via chat command (!consolidate)

  **Must NOT do**:
  - Don't run consolidation synchronously (must be async)
  - Don't consolidate more frequently than 10 minutes (performance impact)
  - Don't delete LTM memories (only STM and low-importance Episodic)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple timer addition to existing consolidate() method
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: None
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/memory/knowledge-graph.js:700-748` - Existing consolidate() method
  - `src/index.js:68-90` - Bot initialization where timer should be added

  **API/Type References**:
  - `src/memory/knowledge-graph.js:700` - consolidate(options) signature

  **Test References**:
  - `tests/unit/knowledge-graph.test.js` - Memory consolidation tests

  **WHY Each Reference Matters**:
  - knowledge-graph.js has consolidate() ready to use - just need to call it periodically
  - index.js is where bot starts - add timer here
  - Tests show consolidation works - verify timer calls it correctly

  **Acceptance Criteria**:

  **Code Changes**:
  - [ ] File modified: src/index.js (add consolidation timer)
  - [ ] Timer added: setInterval calling knowledgeGraph.consolidate()
  - [ ] Cleanup added: clearInterval on bot disconnect

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Consolidation runs automatically every 10 minutes
    Tool: Bash (grep logs)
    Preconditions: Bot running for 20+ minutes
    Steps:
      1. node src/index.js &
      2. sleep 660 (11 minutes)
      3. grep "Memory consolidated" logs/combined.log | wc -l
      4. Assert count >= 1
    Expected Result: At least 1 consolidation log entry after 11 minutes
    Failure Indicators: No consolidation logs, or consolidation too frequent
    Evidence: .sisyphus/evidence/task-2-consolidation-timer.log

  Scenario: Consolidation stats show memory management
    Tool: Bash (node REPL)
    Preconditions: Knowledge graph with 50+ episodic memories
    Steps:
      1. node -e "const KG = require('./src/memory/knowledge-graph'); const kg = new KG(); for(let i=0; i<50; i++) kg.addEpisodicMemory('test'+i, [], null, Date.now() - 2*60*60*1000, i%10); const stats = kg.consolidate(); console.log(JSON.stringify(stats));"
      2. Assert stats.stmToEpisodic > 0 or stats.episodicToLtm > 0 or stats.dropped > 0
      3. Assert stats object has all three properties
    Expected Result: Stats show memory tier transitions
    Failure Indicators: All stats are 0, or stats object missing properties
    Evidence: .sisyphus/evidence/task-2-consolidation-stats.json
  ```

  **Evidence to Capture**:
  - [ ] task-2-consolidation-timer.log (log entries showing periodic consolidation)
  - [ ] task-2-consolidation-stats.json (consolidation statistics)

  **Commit**: YES
  - Message: `feat(memory): add automated memory consolidation timer`
  - Files: `src/index.js`
  - Pre-commit: `npm run test:unit -- knowledge-graph`

- [ ] 3. Danger Prediction System

  **What to do**:
  - Create DangerPredictor class that tracks historical threats
  - Mark danger zones where bot died or took damage (position + radius)
  - Track time-based patterns (night = dangerous, caves = risky)
  - Provide isDangerous(position) query for path planning
  - Store danger zones in knowledge graph as spatial memories
  - Add decay: danger zones become less dangerous over time (7 day half-life)

  **Must NOT do**:
  - Don't mark entire biomes as dangerous (too broad)
  - Don't prevent all risk-taking (bot needs to explore)
  - Don't persist danger zones across bot restarts (fresh start each session)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Moderate complexity, spatial reasoning, integration with multiple systems
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Task 11 (Goal scorer uses danger predictions)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/memory/knowledge-graph.js:426-449` - addSpatialMemory pattern for storing locations
  - `src/layers/pilot.js:28-34` - THREAT_THRESHOLDS for danger detection

  **API/Type References**:
  - `src/memory/knowledge-graph.js:426` - addSpatialMemory(name, coordinates, biome, timestamp)

  **Test References**:
  - `tests/unit/knowledge-graph.test.js` - Spatial memory tests

  **External References**:
  - Project Sid paper Section 3.1 - Agents learn to avoid hazards

  **WHY Each Reference Matters**:
  - addSpatialMemory shows how to store location data - use for danger zones
  - THREAT_THRESHOLDS shows current danger detection - extend with predictions
  - Paper shows agents improve survival by learning danger patterns

  **Acceptance Criteria**:

  **Code Changes**:
  - [ ] File created: src/safety/danger-predictor.js
  - [ ] Class created: DangerPredictor with markDangerous(), isDangerous(), getDangerZones()
  - [ ] Integration: Pilot calls markDangerous() on death/damage
  - [ ] Integration: Strategy checks isDangerous() before pathfinding

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Danger zone marked after bot death
    Tool: Bash (node REPL)
    Preconditions: DangerPredictor instance created
    Steps:
      1. node -e "const DP = require('./src/safety/danger-predictor'); const dp = new DP(); dp.markDangerous({x: 100, y: 64, z: 200}, 'death_by_creeper'); console.log(dp.isDangerous({x: 105, y: 64, z: 205}));"
      2. Assert isDangerous returns true for nearby position (within 20 blocks)
      3. node -e "const DP = require('./src/safety/danger-predictor'); const dp = new DP(); dp.markDangerous({x: 100, y: 64, z: 200}, 'death_by_creeper'); console.log(dp.isDangerous({x: 200, y: 64, z: 300}));"
      4. Assert isDangerous returns false for far position (>20 blocks)
    Expected Result: Danger zone detected within radius, not detected outside
    Failure Indicators: isDangerous returns true for all positions or false for all
    Evidence: .sisyphus/evidence/task-3-danger-zone-detection.txt

  Scenario: Danger zones decay over time
    Tool: Bash (node REPL)
    Preconditions: DangerPredictor with old danger zone
    Steps:
      1. node -e "const DP = require('./src/safety/danger-predictor'); const dp = new DP(); const oldTime = Date.now() - 8*24*60*60*1000; dp.markDangerous({x: 100, y: 64, z: 200}, 'old_death', oldTime); console.log(dp.getDangerLevel({x: 100, y: 64, z: 200}));"
      2. Assert danger level < 0.5 (decayed after 8 days, half-life is 7 days)
      3. Compare with fresh danger zone danger level
    Expected Result: Old danger zones have lower danger level
    Failure Indicators: Danger level doesn't decay, or decays too fast
    Evidence: .sisyphus/evidence/task-3-danger-decay.txt
  ```

  **Evidence to Capture**:
  - [ ] task-3-danger-zone-detection.txt (isDangerous query results)
  - [ ] task-3-danger-decay.txt (danger level over time)

  **Commit**: YES
  - Message: `feat(safety): add danger prediction system with spatial tracking`
  - Files: `src/safety/danger-predictor.js`, `src/layers/pilot.js`, `tests/unit/danger-predictor.test.js`
  - Pre-commit: `npm run test:unit -- danger-predictor`

- [ ] 4. Failure Pattern Detection

  **What to do**:
  - Analyze action history to detect patterns (same action fails 3+ times)
  - Categorize failure types: stuck, wrong_tool, unreachable, blocked
  - Trigger intervention when pattern detected (notify Strategy layer)
  - Store failure patterns in knowledge graph as semantic memories
  - Provide getFailurePattern(actionType) query for learning

  **Must NOT do**:
  - Don't trigger intervention on single failures (allow retries)
  - Don't store every failure (only patterns)
  - Don't block actions preemptively (detect, don't prevent)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Pattern recognition requires careful analysis of failure sequences
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 9 (Reflection module uses failure patterns)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/layers/action-awareness.js:39-50` - actionHistory tracking
  - `src/layers/action-awareness.js:211-215` - getRecentFailures pattern

  **API/Type References**:
  - `src/layers/action-awareness.js:16` - actionHistory structure

  **Test References**:
  - `tests/unit/action-awareness.test.js` - Failure tracking tests

  **External References**:
  - Project Sid paper Section 2.1 - Detecting error cascades early

  **WHY Each Reference Matters**:
  - actionHistory already tracks failures - extend with pattern detection
  - getRecentFailures shows how to query failures - add pattern analysis
  - Paper emphasizes early detection prevents cascading failures

  **Acceptance Criteria**:

  **Code Changes**:
  - [ ] File modified: src/layers/action-awareness.js (add pattern detection)
  - [ ] Method added: detectFailurePattern(recentActions)
  - [ ] Method added: categorizeFailure(action, outcome)
  - [ ] Integration: Call detectFailurePattern after each failure

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Stuck pattern detected after 3 identical failures
    Tool: Bash (node REPL)
    Preconditions: ActionAwareness with 3 failed move actions
    Steps:
      1. node -e "const AA = require('./src/layers/action-awareness'); const aa = new AA(mockBot, mockVision); aa.actionHistory = [{action: {type: 'move', direction: 'forward'}, match: false}, {action: {type: 'move', direction: 'forward'}, match: false}, {action: {type: 'move', direction: 'forward'}, match: false}]; const pattern = aa.detectFailurePattern(); console.log(JSON.stringify(pattern));"
      2. Assert pattern.type === 'stuck'
      3. Assert pattern.count === 3
      4. Assert pattern.action.type === 'move'
    Expected Result: Pattern detected with type 'stuck', count 3
    Failure Indicators: No pattern detected, or wrong pattern type
    Evidence: .sisyphus/evidence/task-4-stuck-pattern.json

  Scenario: Wrong tool pattern detected for mining
    Tool: Bash (node REPL)
    Preconditions: ActionAwareness with 2 failed dig actions (wrong tool)
    Steps:
      1. node -e "const AA = require('./src/layers/action-awareness'); const aa = new AA(mockBot, mockVision); aa.actionHistory = [{action: {type: 'dig', block: 'iron_ore'}, match: false, actual: {blockRemoved: false}}, {action: {type: 'dig', block: 'iron_ore'}, match: false, actual: {blockRemoved: false}}]; const pattern = aa.detectFailurePattern(); console.log(JSON.stringify(pattern));"
      2. Assert pattern.type === 'wrong_tool' or 'unreachable'
      3. Assert pattern.suggestion exists (e.g., 'get stone_pickaxe')
    Expected Result: Pattern detected with actionable suggestion
    Failure Indicators: Generic pattern without specific suggestion
    Evidence: .sisyphus/evidence/task-4-wrong-tool-pattern.json
  ```

  **Evidence to Capture**:
  - [ ] task-4-stuck-pattern.json (stuck pattern detection output)
  - [ ] task-4-wrong-tool-pattern.json (wrong tool pattern with suggestion)

  **Commit**: YES
  - Message: `feat(action-awareness): add failure pattern detection and categorization`
  - Files: `src/layers/action-awareness.js`, `tests/unit/action-awareness.test.js`
  - Pre-commit: `npm run test:unit -- action-awareness`

- [ ] 5. Skill Registry & Primitive Skills

  **What to do**:
  - Create SkillRegistry class to store and retrieve skills
  - Implement 5 primitive skills: move, dig, place, craft, collect
  - Each skill has: name, parameters schema, execute() method, expectedOutcome()
  - Skills return success/failure with detailed outcome
  - Register primitives in registry on initialization

  **Must NOT do**:
  - Don't create complex skill DSL (keep it simple JavaScript)
  - Don't add skills that duplicate existing bot methods without value
  - Don't make skills stateful (they should be pure functions)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Moderate complexity, foundational architecture
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8)
  - **Blocks**: Task 6 (Composite skills need primitives)
  - **Blocked By**: None (Wave 1 complete)

  **References**:

  **Pattern References**:
  - `src/layers/pilot.js:200-250` - Current action execution patterns
  - `src/layers/action-awareness.js:79-110` - _performAction shows current action types

  **API/Type References**:
  - `src/layers/action-awareness.js:79` - Action type structure to wrap

  **Test References**:
  - `tests/unit/pilot.test.js` - Action execution tests

  **External References**:
  - Project Sid paper Section 2.3 - Skill execution module

  **WHY Each Reference Matters**:
  - pilot.js shows current action execution - wrap in skill interface
  - action-awareness.js shows action types - convert to skill format
  - Paper describes skill module as key to complex behaviors

  **Acceptance Criteria**:

  **Code Changes**:
  - [ ] File created: src/skills/skill-registry.js
  - [ ] File created: src/skills/primitives/move.js
  - [ ] File created: src/skills/primitives/dig.js
  - [ ] File created: src/skills/primitives/place.js
  - [ ] File created: src/skills/primitives/craft.js
  - [ ] File created: src/skills/primitives/collect.js

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Skill registry stores and retrieves skills
    Tool: Bash (node REPL)
    Preconditions: SkillRegistry created with primitives
    Steps:
      1. node -e "const SR = require('./src/skills/skill-registry'); const registry = new SR(); registry.registerPrimitives(); console.log(registry.getSkill('move'));"
      2. Assert skill object returned with name, execute, expectedOutcome methods
      3. node -e "const SR = require('./src/skills/skill-registry'); const registry = new SR(); registry.registerPrimitives(); console.log(registry.listSkills());"
      4. Assert list contains ['move', 'dig', 'place', 'craft', 'collect']
    Expected Result: Registry stores and retrieves all 5 primitive skills
    Failure Indicators: Missing skills, undefined methods
    Evidence: .sisyphus/evidence/task-5-registry-operations.txt

  Scenario: Move skill executes and returns outcome
    Tool: Bash (node REPL with mock bot)
    Preconditions: Move skill loaded, mock bot available
    Steps:
      1. node -e "const moveSkill = require('./src/skills/primitives/move'); const result = await moveSkill.execute(mockBot, {direction: 'forward', duration: 500}); console.log(JSON.stringify(result));"
      2. Assert result.success === true or false
      3. Assert result.outcome exists with position data
      4. Assert result.duration is a number
    Expected Result: Skill executes and returns structured result
    Failure Indicators: Execution throws error, missing result fields
    Evidence: .sisyphus/evidence/task-5-move-skill-execution.json
  ```

  **Evidence to Capture**:
  - [ ] task-5-registry-operations.txt (registry CRUD operations)
  - [ ] task-5-move-skill-execution.json (skill execution result)

  **Commit**: YES
  - Message: `feat(skills): add skill registry and 5 primitive skills`
  - Files: `src/skills/skill-registry.js`, `src/skills/primitives/*.js`, `tests/unit/skill-registry.test.js`
  - Pre-commit: `npm run test:unit -- skill-registry`

- [ ] 6. Composite Skills (5 skills)

  **What to do**:
  - Create 5 composite skills that chain primitives:
    1. gather_wood: find_tree → dig_logs → collect
    2. mine_stone: find_stone → dig_stone → collect
    3. craft_tools: check_materials → craft_item → equip
    4. build_shelter: find_location → place_blocks → verify
    5. hunt_food: find_animal → attack → collect_drops
  - Each composite skill calls primitives in sequence
  - Handle failures: retry or skip to next step
  - Return aggregate success/failure

  **Must NOT do**:
  - Don't make skills too complex (max 5 steps per skill)
  - Don't hardcode positions (skills should work anywhere)
  - Don't create skills that overlap too much

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Moderate complexity, requires understanding Minecraft mechanics
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 7, 8)
  - **Blocks**: Task 7 (Skill executor needs composite skills to test)
  - **Blocked By**: Task 5 (needs primitive skills)

  **References**:

  **Pattern References**:
  - `src/skills/primitives/move.js` - Primitive skill structure to follow
  - `src/actions/crafting.js` - Existing crafting logic to wrap

  **API/Type References**:
  - `src/skills/skill-registry.js` - Registry API for registration

  **Test References**:
  - `tests/unit/skill-registry.test.js` - Skill testing patterns

  **External References**:
  - Project Sid paper Section 3.2 - Agents acquired items through skill chains

  **WHY Each Reference Matters**:
  - Primitive skills show structure - composite skills follow same pattern
  - crafting.js has existing logic - wrap in skill interface
  - Paper shows complex behaviors emerge from skill composition

  **Acceptance Criteria**:

  **Code Changes**:
  - [ ] File created: src/skills/composite/gather-wood.js
  - [ ] File created: src/skills/composite/mine-stone.js
  - [ ] File created: src/skills/composite/craft-tools.js
  - [ ] File created: src/skills/composite/build-shelter.js
  - [ ] File created: src/skills/composite/hunt-food.js

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: gather_wood skill chains primitives successfully
    Tool: Bash (node REPL with mock bot)
    Preconditions: gather_wood skill loaded, mock bot in forest
    Steps:
      1. node -e "const gatherWood = require('./src/skills/composite/gather-wood'); const result = await gatherWood.execute(mockBot, {type: 'oak', quantity: 10}); console.log(JSON.stringify(result));"
      2. Assert result.success === true
      3. Assert result.steps array has 3 entries (find, dig, collect)
      4. Assert result.outcome.itemsCollected includes 'oak_log'
    Expected Result: Skill executes all steps and returns collected items
    Failure Indicators: Skill fails on first step, missing outcome data
    Evidence: .sisyphus/evidence/task-6-gather-wood-execution.json

  Scenario: craft_tools skill handles missing materials gracefully
    Tool: Bash (node REPL with mock bot)
    Preconditions: craft_tools skill loaded, bot has no materials
    Steps:
      1. node -e "const craftTools = require('./src/skills/composite/craft-tools'); const result = await craftTools.execute(mockBot, {tool: 'wooden_pickaxe'}); console.log(JSON.stringify(result));"
      2. Assert result.success === false
      3. Assert result.reason === 'missing_materials' or similar
      4. Assert result.missingItems array lists required materials
    Expected Result: Skill fails gracefully with clear reason
    Failure Indicators: Skill throws error, unclear failure reason
    Evidence: .sisyphus/evidence/task-6-craft-tools-missing-materials.json
  ```

  **Evidence to Capture**:
  - [ ] task-6-gather-wood-execution.json (successful skill chain)
  - [ ] task-6-craft-tools-missing-materials.json (graceful failure)

  **Commit**: YES
  - Message: `feat(skills): add 5 composite skills for common tasks`
  - Files: `src/skills/composite/*.js`, `tests/unit/composite-skills.test.js`
  - Pre-commit: `npm run test:unit -- composite-skills`

- [ ] 7. Skill Executor with Retry Logic

  **What to do**:
  - Create SkillExecutor class that executes skills with retry
  - Retry failed skills up to 3 times with exponential backoff
  - Use action-awareness confidence scoring to decide retry strategy
  - Log execution attempts and outcomes
  - Integrate with Pilot layer to replace direct action execution

  **Must NOT do**:
  - Don't retry indefinitely (max 3 attempts)
  - Don't retry if confidence score is very low (<0.3)
  - Don't block on retries (use async/await properly)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Critical integration point, requires careful error handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 8)
  - **Blocks**: Task 9 (Reflection module analyzes skill execution)
  - **Blocked By**: Task 1 (needs confidence scoring), Task 6 (needs composite skills)

  **References**:

  **Pattern References**:
  - `src/layers/action-awareness.js:20-77` - executeWithVerification pattern
  - `src/layers/pilot.js:200-250` - Current action execution in Pilot

  **API/Type References**:
  - `src/skills/skill-registry.js` - Skill interface to execute

  **Test References**:
  - `tests/unit/action-awareness.test.js` - Verification testing patterns

  **External References**:
  - Project Sid paper Section 2.1 - Action awareness with retry

  **WHY Each Reference Matters**:
  - action-awareness shows verification pattern - add retry logic
  - pilot.js is where skills will be executed - integration point
  - Paper emphasizes retry prevents cascading failures

  **Acceptance Criteria**:

  **Code Changes**:
  - [ ] File created: src/skills/skill-executor.js
  - [ ] Class created: SkillExecutor with executeSkill(skill, params, options)
  - [ ] Integration: Pilot uses SkillExecutor instead of direct actions
  - [ ] Retry logic: exponential backoff (100ms, 200ms, 400ms)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Skill succeeds on first attempt
    Tool: Bash (node REPL)
    Preconditions: SkillExecutor with high-confidence skill
    Steps:
      1. node -e "const SE = require('./src/skills/skill-executor'); const executor = new SE(mockBot, mockRegistry, mockActionAwareness); const result = await executor.executeSkill('move', {direction: 'forward'}); console.log(JSON.stringify(result));"
      2. Assert result.success === true
      3. Assert result.attempts === 1
      4. Assert result.totalDuration < 1000ms
    Expected Result: Skill executes once successfully
    Failure Indicators: Multiple attempts for simple action
    Evidence: .sisyphus/evidence/task-7-first-attempt-success.json

  Scenario: Skill retries and succeeds on second attempt
    Tool: Bash (node REPL with flaky mock)
    Preconditions: SkillExecutor with skill that fails once then succeeds
    Steps:
      1. node -e "const SE = require('./src/skills/skill-executor'); const executor = new SE(mockBot, mockRegistry, mockActionAwareness); mockSkill.failOnce = true; const result = await executor.executeSkill('dig', {block: 'stone'}); console.log(JSON.stringify(result));"
      2. Assert result.success === true
      3. Assert result.attempts === 2
      4. Assert result.retries array has 1 entry with backoff time
    Expected Result: Skill retries and succeeds
    Failure Indicators: Gives up after first failure
    Evidence: .sisyphus/evidence/task-7-retry-success.json

  Scenario: Skill fails after 3 attempts
    Tool: Bash (node REPL with always-failing mock)
    Preconditions: SkillExecutor with skill that always fails
    Steps:
      1. node -e "const SE = require('./src/skills/skill-executor'); const executor = new SE(mockBot, mockRegistry, mockActionAwareness); mockSkill.alwaysFail = true; const result = await executor.executeSkill('dig', {block: 'bedrock'}); console.log(JSON.stringify(result));"
      2. Assert result.success === false
      3. Assert result.attempts === 3
      4. Assert result.finalReason exists explaining failure
    Expected Result: Skill gives up after 3 attempts
    Failure Indicators: Retries more than 3 times, or gives up too early
    Evidence: .sisyphus/evidence/task-7-max-retries.json
  ```

  **Evidence to Capture**:
  - [ ] task-7-first-attempt-success.json (single attempt success)
  - [ ] task-7-retry-success.json (retry with backoff)
  - [ ] task-7-max-retries.json (failure after max attempts)

  **Commit**: YES
  - Message: `feat(skills): add skill executor with retry logic and exponential backoff`
  - Files: `src/skills/skill-executor.js`, `src/layers/pilot.js`, `tests/unit/skill-executor.test.js`
  - Pre-commit: `npm run test:unit -- skill-executor`

- [ ] 8. Item Progression Tracker

  **What to do**:
  - Create ItemTracker class that logs every unique item acquired
  - Track timestamp of first acquisition for each item
  - Calculate metrics: unique items, items/hour, tech tree level
  - Detect milestones: first_iron, first_diamond, first_nether_entry
  - Integrate with Pilot to track item pickups
  - Expose getStats() for monitoring

  **Must NOT do**:
  - Don't track every item instance (only unique items)
  - Don't create complex UI (simple JSON stats)
  - Don't persist across sessions (fresh tracking each run)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple tracking logic, straightforward implementation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7)
  - **Blocks**: Task 14 (Performance benchmarks use progression data)
  - **Blocked By**: None (Wave 1 complete)

  **References**:

  **Pattern References**:
  - `src/layers/pilot.js:150-180` - Bot event listeners for item collection

  **API/Type References**:
  - Mineflayer bot.on('playerCollect') event

  **Test References**:
  - `tests/unit/pilot.test.js` - Event handling tests

  **External References**:
  - Project Sid paper Section 3.2 - Item progression benchmarking (320 items in 4h)

  **WHY Each Reference Matters**:
  - pilot.js shows where to hook item collection events
  - Mineflayer events provide item data
  - Paper uses item count as key progression metric

  **Acceptance Criteria**:

  **Code Changes**:
  - [ ] File created: src/metrics/item-tracker.js
  - [ ] Class created: ItemTracker with track(), getStats(), getMilestones()
  - [ ] Integration: Pilot calls tracker on playerCollect event
  - [ ] Metrics: uniqueItems, itemsPerHour, techTreeLevel, milestones

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Tracker records unique items only
    Tool: Bash (node REPL)
    Preconditions: ItemTracker instance created
    Steps:
      1. node -e "const IT = require('./src/metrics/item-tracker'); const tracker = new IT(); tracker.track('oak_log'); tracker.track('oak_log'); tracker.track('stone'); console.log(tracker.getStats());"
      2. Assert stats.uniqueItems === 2 (not 3)
      3. Assert stats.items includes ['oak_log', 'stone']
    Expected Result: Duplicate items not counted
    Failure Indicators: uniqueItems count includes duplicates
    Evidence: .sisyphus/evidence/task-8-unique-tracking.json

  Scenario: Milestones detected for key items
    Tool: Bash (node REPL)
    Preconditions: ItemTracker with progression items
    Steps:
      1. node -e "const IT = require('./src/metrics/item-tracker'); const tracker = new IT(); tracker.track('oak_log'); tracker.track('cobblestone'); tracker.track('iron_ingot'); tracker.track('diamond'); console.log(tracker.getMilestones());"
      2. Assert milestones includes 'first_iron' with timestamp
      3. Assert milestones includes 'first_diamond' with timestamp
      4. Assert techTreeLevel === 'diamond_age'
    Expected Result: Milestones detected and tech tree level calculated
    Failure Indicators: Missing milestones, incorrect tech tree level
    Evidence: .sisyphus/evidence/task-8-milestones.json

  Scenario: Items per hour calculated correctly
    Tool: Bash (node REPL)
    Preconditions: ItemTracker with items over 30 minutes
    Steps:
      1. node -e "const IT = require('./src/metrics/item-tracker'); const tracker = new IT(); const startTime = Date.now() - 30*60*1000; for(let i=0; i<15; i++) { tracker.track('item'+i, startTime + i*2*60*1000); } console.log(tracker.getStats());"
      2. Assert stats.itemsPerHour is approximately 30 (15 items in 30 min)
      3. Assert stats.sessionDuration is approximately 1800000ms (30 min)
    Expected Result: Rate calculation accurate
    Failure Indicators: itemsPerHour wildly incorrect
    Evidence: .sisyphus/evidence/task-8-rate-calculation.json
  ```

  **Evidence to Capture**:
  - [ ] task-8-unique-tracking.json (unique item counting)
  - [ ] task-8-milestones.json (milestone detection)
  - [ ] task-8-rate-calculation.json (items per hour)

  **Commit**: YES
  - Message: `feat(metrics): add item progression tracker with milestones`
  - Files: `src/metrics/item-tracker.js`, `src/layers/pilot.js`, `tests/unit/item-tracker.test.js`
  - Pre-commit: `npm run test:unit -- item-tracker`

- [ ] 9. Reflection Module

  **What to do**:
  - Create ReflectionModule that analyzes performance every 30 minutes
  - Analyze action success/failure rates from action-awareness
  - Extract patterns from failure detector
  - Generate learnings: what worked, what didn't, why
  - Suggest adjustments: parameter changes, strategy shifts
  - Store reflections in knowledge graph as semantic memories
  - Log reflections to file for human review

  **Must NOT do**:
  - Don't run reflection more than every 30 minutes (expensive)
  - Don't make automatic changes without logging (human should review)
  - Don't create complex ML models (rule-based analysis)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires analysis, pattern recognition, and reasoning about improvements
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10, 11, 12)
  - **Blocks**: None (final learning layer)
  - **Blocked By**: Task 4 (needs failure patterns), Task 7 (needs skill execution data)

  **References**:

  **Pattern References**:
  - `src/layers/action-awareness.js:206-209` - getSuccessRate() for metrics
  - `src/layers/action-awareness.js:211-215` - getRecentFailures() for analysis

  **API/Type References**:
  - `src/memory/knowledge-graph.js:525-543` - addSemanticMemory for storing learnings

  **Test References**:
  - `tests/unit/action-awareness.test.js` - Success rate testing

  **External References**:
  - Project Sid paper mentions reflection but doesn't detail implementation

  **WHY Each Reference Matters**:
  - action-awareness provides success metrics - foundation for reflection
  - knowledge-graph stores learnings - persistence across sessions
  - Paper emphasizes learning from experience

  **Acceptance Criteria**:

  **Code Changes**:
  - [ ] File created: src/learning/reflection-module.js
  - [ ] Class created: ReflectionModule with reflect(), analyzePerformance(), generateLearnings()
  - [ ] Integration: Timer in index.js calls reflect() every 30 minutes
  - [ ] Output: Reflection logs to logs/reflections.log

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Reflection analyzes success rate and identifies issues
    Tool: Bash (node REPL)
    Preconditions: ReflectionModule with 30 min of action data
    Steps:
      1. node -e "const RM = require('./src/learning/reflection-module'); const reflection = new RM(mockActionAwareness, mockFailureDetector); const result = reflection.reflect(); console.log(JSON.stringify(result, null, 2));"
      2. Assert result.period exists with start/end timestamps
      3. Assert result.successRate is a number between 0 and 1
      4. Assert result.patterns array exists
      5. Assert result.learnings array has at least 1 entry
      6. Assert result.adjustments array has suggestions
    Expected Result: Comprehensive reflection with actionable insights
    Failure Indicators: Empty learnings, no patterns detected
    Evidence: .sisyphus/evidence/task-9-reflection-output.json

  Scenario: Reflection detects improvement over time
    Tool: Bash (grep logs)
    Preconditions: Bot running for 2+ hours with 2+ reflections
    Steps:
      1. node src/index.js & (run for 2 hours)
      2. grep "Reflection complete" logs/reflections.log | tail -2
      3. Compare successRate between first and second reflection
      4. Assert second reflection successRate >= first (or close)
    Expected Result: Success rate stable or improving
    Failure Indicators: Success rate declining significantly
    Evidence: .sisyphus/evidence/task-9-improvement-trend.log
  ```

  **Evidence to Capture**:
  - [ ] task-9-reflection-output.json (single reflection result)
  - [ ] task-9-improvement-trend.log (multiple reflections over time)

  **Commit**: YES
  - Message: `feat(learning): add reflection module for performance analysis`
  - Files: `src/learning/reflection-module.js`, `src/index.js`, `tests/unit/reflection-module.test.js`
  - Pre-commit: `npm run test:unit -- reflection-module`

- [ ] 10. Goal Graph Structure

  **What to do**:
  - Create GoalGraph class using graphology (like knowledge-graph)
  - Define goal nodes with: name, description, prerequisites, importance
  - Define goal edges: depends_on, conflicts_with, enables
  - Implement basic goals: survive, gather_resources, explore, build
  - Add goal dependencies: mine_iron depends_on craft_stone_pickaxe
  - Provide query methods: getAchievableGoals(), getGoalPath()

  **Must NOT do**:
  - Don't create too many goals initially (start with 10-15)
  - Don't make circular dependencies
  - Don't hardcode all Minecraft goals (extensible system)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Graph structure design, moderate complexity
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 11, 12)
  - **Blocks**: Task 11 (Goal scorer needs graph structure)
  - **Blocked By**: None (Wave 2 complete)

  **References**:

  **Pattern References**:
  - `src/memory/knowledge-graph.js:18-31` - Graph initialization with graphology
  - `src/memory/knowledge-graph.js:41-83` - addEntity pattern for nodes

  **API/Type References**:
  - `graphology` library - Graph API

  **Test References**:
  - `tests/unit/knowledge-graph.test.js` - Graph testing patterns

  **External References**:
  - Project Sid paper Section 2.3 - Goal generation module

  **WHY Each Reference Matters**:
  - knowledge-graph shows graphology usage - follow same patterns
  - addEntity shows node structure - goals are similar
  - Paper describes goal generation as key to autonomy

  **Acceptance Criteria**:

  **Code Changes**:
  - [ ] File created: src/goals/goal-graph.js
  - [ ] Class created: GoalGraph with addGoal(), addDependency(), getAchievableGoals()
  - [ ] Initial goals: 10-15 basic Minecraft goals with dependencies

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Goal graph stores goals with dependencies
    Tool: Bash (node REPL)
    Preconditions: GoalGraph with basic goals
    Steps:
      1. node -e "const GG = require('./src/goals/goal-graph'); const graph = new GG(); graph.addGoal('survive', {importance: 10}); graph.addGoal('gather_wood', {importance: 5}); graph.addDependency('craft_tools', 'gather_wood'); console.log(graph.getGoal('craft_tools'));"
      2. Assert goal has dependencies array including 'gather_wood'
      3. Assert goal has importance score
    Expected Result: Goals stored with dependencies
    Failure Indicators: Missing dependencies, undefined goals
    Evidence: .sisyphus/evidence/task-10-goal-storage.json

  Scenario: getAchievableGoals filters by prerequisites
    Tool: Bash (node REPL)
    Preconditions: GoalGraph with dependency chain
    Steps:
      1. node -e "const GG = require('./src/goals/goal-graph'); const graph = new GG(); graph.addGoal('gather_wood', {importance: 5}); graph.addGoal('craft_pickaxe', {importance: 7}); graph.addDependency('craft_pickaxe', 'gather_wood'); const achievable = graph.getAchievableGoals({completed: []}); console.log(achievable);"
      2. Assert achievable includes 'gather_wood' (no prereqs)
      3. Assert achievable does NOT include 'craft_pickaxe' (prereq not met)
      4. node -e "const achievable2 = graph.getAchievableGoals({completed: ['gather_wood']}); console.log(achievable2);"
      5. Assert achievable2 includes 'craft_pickaxe' (prereq met)
    Expected Result: Only achievable goals returned based on completed goals
    Failure Indicators: Returns goals with unmet prerequisites
    Evidence: .sisyphus/evidence/task-10-achievable-filtering.json
  ```

  **Evidence to Capture**:
  - [ ] task-10-goal-storage.json (goal and dependency storage)
  - [ ] task-10-achievable-filtering.json (prerequisite filtering)

  **Commit**: YES
  - Message: `feat(goals): add goal graph structure with dependencies`
  - Files: `src/goals/goal-graph.js`, `tests/unit/goal-graph.test.js`
  - Pre-commit: `npm run test:unit -- goal-graph`

- [ ] 11. Goal Scorer & Generator

  **What to do**:
  - Create GoalScorer that assigns importance scores to goals
  - Scoring factors: personality traits, recent events, player needs, danger level
  - Create GoalGenerator that selects highest-scoring achievable goal
  - Consider context: time of day, health, inventory, location
  - Integrate with danger predictor (avoid dangerous goals)
  - Provide generateGoal() method for Commander

  **Must NOT do**:
  - Don't generate goals that conflict with player-set goals
  - Don't score goals without considering current context
  - Don't generate goals too frequently (max once per minute)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex scoring logic, context-aware decision making
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10, 12)
  - **Blocks**: Task 12 (Commander integration needs generator)
  - **Blocked By**: Task 3 (needs danger predictor), Task 10 (needs goal graph)

  **References**:

  **Pattern References**:
  - `personality/Soul.md:22-31` - Personality dimensions for scoring
  - `src/safety/danger-predictor.js` - Danger context for goal filtering
  - `src/goals/goal-graph.js` - Goal structure to score

  **API/Type References**:
  - `src/goals/goal-graph.js` - getAchievableGoals() to filter candidates

  **Test References**:
  - `tests/unit/goal-graph.test.js` - Goal testing patterns

  **External References**:
  - Project Sid paper Section 2.3 - Goal generation based on experience

  **WHY Each Reference Matters**:
  - Soul.md defines personality - use for goal preferences
  - danger-predictor provides safety context - avoid dangerous goals
  - goal-graph provides candidates - scorer ranks them

  **Acceptance Criteria**:

  **Code Changes**:
  - [ ] File created: src/goals/goal-scorer.js
  - [ ] File created: src/goals/goal-generator.js
  - [ ] Class created: GoalScorer with scoreGoal(goal, context)
  - [ ] Class created: GoalGenerator with generateGoal(context)
  - [ ] Scoring factors: personality (30%), recent events (25%), needs (25%), danger (20%)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: High curiosity bot prefers exploration goals
    Tool: Bash (node REPL)
    Preconditions: GoalScorer with high curiosity personality
    Steps:
      1. node -e "const GS = require('./src/goals/goal-scorer'); const scorer = new GS({personality: {curiosity: 0.9, loyalty: 0.5}}); const exploreScore = scorer.scoreGoal({name: 'explore_cave', type: 'exploration'}, {}); const gatherScore = scorer.scoreGoal({name: 'gather_wood', type: 'gathering'}, {}); console.log({exploreScore, gatherScore});"
      2. Assert exploreScore > gatherScore
      3. Assert exploreScore >= 0.7 (high score for exploration)
    Expected Result: Exploration goals scored higher for curious bot
    Failure Indicators: Gathering scored higher, or scores equal
    Evidence: .sisyphus/evidence/task-11-personality-scoring.json

  Scenario: Low health bot prioritizes survival goals
    Tool: Bash (node REPL)
    Preconditions: GoalGenerator with low health context
    Steps:
      1. node -e "const GG = require('./src/goals/goal-generator'); const generator = new GG(mockGoalGraph, mockScorer); const goal = generator.generateGoal({health: 4, food: 0, threats: []}); console.log(goal);"
      2. Assert goal.name === 'find_food' or 'heal' or 'retreat'
      3. Assert goal.urgency === 'high'
    Expected Result: Survival goal generated for low health
    Failure Indicators: Exploration or building goal generated
    Evidence: .sisyphus/evidence/task-11-survival-priority.json

  Scenario: Dangerous area reduces exploration goal scores
    Tool: Bash (node REPL)
    Preconditions: GoalScorer with danger predictor showing dangerous area
    Steps:
      1. node -e "const GS = require('./src/goals/goal-scorer'); const scorer = new GS({personality: {curiosity: 0.9}}); const dangerContext = {position: {x: 100, y: 64, z: 200}, dangerLevel: 0.8}; const score = scorer.scoreGoal({name: 'explore_cave', location: {x: 100, y: 64, z: 200}}, dangerContext); console.log(score);"
      2. Assert score < 0.5 (reduced due to danger)
      3. Compare with same goal in safe area (should be higher)
    Expected Result: Danger reduces goal scores appropriately
    Failure Indicators: Danger doesn't affect scores
    Evidence: .sisyphus/evidence/task-11-danger-reduction.json
  ```

  **Evidence to Capture**:
  - [ ] task-11-personality-scoring.json (personality influence on scores)
  - [ ] task-11-survival-priority.json (context-driven goal selection)
  - [ ] task-11-danger-reduction.json (danger impact on scores)

  **Commit**: YES
  - Message: `feat(goals): add goal scorer and generator with context awareness`
  - Files: `src/goals/goal-scorer.js`, `src/goals/goal-generator.js`, `tests/unit/goal-scorer.test.js`
  - Pre-commit: `npm run test:unit -- goal-scorer`

- [ ] 12. Integration with Commander Layer

  **What to do**:
  - Modify Commander to use GoalGenerator when no player goal exists
  - Add autonomous mode flag (default: true)
  - Commander checks for player goal first, then generates if none
  - Log autonomous goal generation for transparency
  - Respect player override (player goal always takes priority)
  - Add chat command to toggle autonomous mode (!auto on/off)

  **Must NOT do**:
  - Don't override player-set goals
  - Don't generate goals when player is actively playing
  - Don't spam goal generation (rate limit to 1/minute)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration work, moderate complexity
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10, 11)
  - **Blocks**: Task 13 (E2E tests need full autonomous system)
  - **Blocked By**: Task 11 (needs goal generator)

  **References**:

  **Pattern References**:
  - `src/layers/commander.js:200-300` - Current goal decision logic
  - `src/chat/chat-handler.js:50-100` - Chat command patterns

  **API/Type References**:
  - `src/goals/goal-generator.js` - generateGoal(context) to call
  - `src/utils/state-manager.js` - read/write commands.json

  **Test References**:
  - `tests/integration/commander-strategy.test.js` - Commander integration tests

  **WHY Each Reference Matters**:
  - commander.js is where goals are decided - add autonomous generation
  - chat-handler.js shows command patterns - add !auto command
  - Integration tests validate layer communication

  **Acceptance Criteria**:

  **Code Changes**:
  - [ ] File modified: src/layers/commander.js (add autonomous goal generation)
  - [ ] File modified: src/chat/chat-handler.js (add !auto command)
  - [ ] Property added: autonomousMode boolean flag
  - [ ] Logic: if no player goal and autonomousMode, generate goal

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Commander generates autonomous goal when idle
    Tool: Bash (grep logs)
    Preconditions: Bot running with no player goal, autonomous mode on
    Steps:
      1. echo '{"goal": null}' > state/commands.json
      2. node src/index.js &
      3. sleep 15
      4. grep "Autonomous goal generated" logs/combined.log
      5. cat state/commands.json
    Expected Result: Commander generates goal, writes to commands.json
    Failure Indicators: No goal generated, or commands.json unchanged
    Evidence: .sisyphus/evidence/task-12-autonomous-generation.log

  Scenario: Player goal overrides autonomous generation
    Tool: Bash (check state files)
    Preconditions: Bot running with player goal set
    Steps:
      1. echo '{"goal": "collect 64 oak logs"}' > state/commands.json
      2. node src/index.js &
      3. sleep 15
      4. grep "Autonomous goal" logs/combined.log | wc -l
      5. cat state/commands.json
    Expected Result: No autonomous goal generated, player goal preserved
    Failure Indicators: Autonomous goal overrides player goal
    Evidence: .sisyphus/evidence/task-12-player-override.log

  Scenario: Chat command toggles autonomous mode
    Tool: Bash (send chat command)
    Preconditions: Bot running in test server
    Steps:
      1. node src/index.js &
      2. Send chat message "!auto off" via test client
      3. grep "Autonomous mode: false" logs/combined.log
      4. Send chat message "!auto on"
      5. grep "Autonomous mode: true" logs/combined.log
    Expected Result: Mode toggles correctly, logged
    Failure Indicators: Command doesn't work, mode doesn't change
    Evidence: .sisyphus/evidence/task-12-auto-toggle.log
  ```

  **Evidence to Capture**:
  - [ ] task-12-autonomous-generation.log (autonomous goal creation)
  - [ ] task-12-player-override.log (player goal priority)
  - [ ] task-12-auto-toggle.log (chat command functionality)

  **Commit**: YES
  - Message: `feat(commander): integrate autonomous goal generation with player override`
  - Files: `src/layers/commander.js`, `src/chat/chat-handler.js`, `tests/integration/autonomous-goals.test.js`
  - Pre-commit: `npm run test:integration -- autonomous-goals`

- [ ] 13. E2E Robustness Tests

  **What to do**:
  - Create comprehensive E2E test suite for robustness
  - Test 1: Bot runs for 1 hour without getting stuck
  - Test 2: Bot recovers from 3 consecutive action failures
  - Test 3: Bot generates and completes autonomous goal
  - Test 4: Memory consolidation runs and reduces memory size
  - Test 5: Reflection module generates learnings after 30 min
  - All tests run against real Minecraft server

  **Must NOT do**:
  - Don't make tests too long (max 1 hour per test)
  - Don't test features in isolation (E2E = full system)
  - Don't skip cleanup (stop bot, clear state after each test)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Test writing, moderate complexity
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (E2E tests must run sequentially)
  - **Parallel Group**: Wave 4 (sequential)
  - **Blocks**: Task 16 (Final cleanup needs test results)
  - **Blocked By**: All previous tasks (needs complete system)

  **References**:

  **Pattern References**:
  - `tests/e2e/bot-lifecycle.test.js` - Existing E2E test patterns
  - `jest.e2e.config.js` - E2E test configuration

  **API/Type References**:
  - Mineflayer test server setup

  **Test References**:
  - `tests/e2e/` - All existing E2E tests

  **WHY Each Reference Matters**:
  - bot-lifecycle.test.js shows E2E patterns - follow same structure
  - jest config shows timeouts and setup - extend for longer tests
  - Existing tests show server interaction patterns

  **Acceptance Criteria**:

  **Code Changes**:
  - [ ] File created: tests/e2e/robustness-suite.test.js
  - [ ] Test 1: 1-hour survival test
  - [ ] Test 2: Failure recovery test
  - [ ] Test 3: Autonomous goal completion test
  - [ ] Test 4: Memory consolidation test
  - [ ] Test 5: Reflection generation test

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Bot survives 1 hour without getting stuck
    Tool: Bash (npm test)
    Preconditions: Minecraft server running, bot configured
    Steps:
      1. npm run mc:start
      2. npm run test:e2e -- robustness-suite --testNamePattern="1-hour survival"
      3. Assert test passes (bot alive after 1 hour)
      4. Check logs for stuck detection (should be 0)
    Expected Result: Bot runs for 1 hour, no stuck events
    Failure Indicators: Bot stuck, test timeout, bot death
    Evidence: .sisyphus/evidence/task-13-1hour-survival.log

  Scenario: Bot recovers from consecutive failures
    Tool: Bash (npm test)
    Preconditions: Test server with failure injection
    Steps:
      1. npm run test:e2e -- robustness-suite --testNamePattern="failure recovery"
      2. Inject 3 consecutive dig failures
      3. Assert bot detects pattern
      4. Assert bot requests Strategy intervention
      5. Assert bot recovers and continues
    Expected Result: Bot detects pattern, recovers, continues
    Failure Indicators: Bot gives up, infinite retry loop
    Evidence: .sisyphus/evidence/task-13-failure-recovery.log

  Scenario: Autonomous goal completed end-to-end
    Tool: Bash (npm test)
    Preconditions: Bot with no player goal, autonomous mode on
    Steps:
      1. npm run test:e2e -- robustness-suite --testNamePattern="autonomous goal"
      2. Assert goal generated within 1 minute
      3. Assert goal written to commands.json
      4. Assert Strategy creates plan
      5. Assert Pilot executes plan
      6. Assert goal marked complete
    Expected Result: Full autonomous cycle completes
    Failure Indicators: No goal generated, plan not executed
    Evidence: .sisyphus/evidence/task-13-autonomous-cycle.log
  ```

  **Evidence to Capture**:
  - [ ] task-13-1hour-survival.log (long-running stability)
  - [ ] task-13-failure-recovery.log (error recovery)
  - [ ] task-13-autonomous-cycle.log (full autonomous workflow)

  **Commit**: YES
  - Message: `test(e2e): add comprehensive robustness test suite`
  - Files: `tests/e2e/robustness-suite.test.js`
  - Pre-commit: `npm run test:e2e -- robustness-suite`

- [ ] 14. Performance Benchmarks

  **What to do**:
  - Create benchmark suite measuring key metrics
  - Benchmark 1: Action success rate (target: >90%)
  - Benchmark 2: Item acquisition rate (target: 30+ items/hour)
  - Benchmark 3: Memory size over time (target: <10,000 nodes)
  - Benchmark 4: Reflection latency (target: <5 seconds)
  - Benchmark 5: Goal generation latency (target: <1 second)
  - Compare against Project Sid paper results (320 items in 4 hours)

  **Must NOT do**:
  - Don't create complex visualization (simple JSON output)
  - Don't run benchmarks in CI (too resource intensive)
  - Don't compare against unrealistic targets

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple metric collection and reporting
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 15)
  - **Blocks**: None
  - **Blocked By**: Task 8 (needs item tracker), Task 13 (needs E2E tests)

  **References**:

  **Pattern References**:
  - `src/metrics/item-tracker.js` - Item metrics to benchmark
  - `src/layers/action-awareness.js:206-209` - Success rate metrics

  **API/Type References**:
  - `src/metrics/item-tracker.js` - getStats() for item metrics

  **Test References**:
  - `tests/e2e/robustness-suite.test.js` - E2E tests that generate benchmark data

  **External References**:
  - Project Sid paper Section 3.2 - 320 items in 4 hours benchmark

  **WHY Each Reference Matters**:
  - item-tracker provides progression metrics - key benchmark
  - action-awareness provides success rate - robustness metric
  - Paper provides comparison baseline - validate improvements

  **Acceptance Criteria**:

  **Code Changes**:
  - [ ] File created: src/metrics/benchmark-suite.js
  - [ ] Script created: scripts/run-benchmarks.js
  - [ ] Benchmarks: success rate, item rate, memory size, latencies
  - [ ] Output: JSON report with comparisons to targets

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Benchmark suite collects all metrics
    Tool: Bash (node script)
    Preconditions: Bot ran for 1 hour with all features active
    Steps:
      1. node scripts/run-benchmarks.js
      2. cat benchmarks/report-$(date +%Y%m%d).json
      3. Assert report has actionSuccessRate field
      4. Assert report has itemsPerHour field
      5. Assert report has memoryNodeCount field
      6. Assert report has reflectionLatency field
      7. Assert report has goalGenerationLatency field
    Expected Result: All 5 metrics present in report
    Failure Indicators: Missing metrics, undefined values
    Evidence: .sisyphus/evidence/task-14-benchmark-report.json

  Scenario: Benchmarks compare against targets
    Tool: Bash (node script)
    Preconditions: Benchmark report generated
    Steps:
      1. node scripts/run-benchmarks.js
      2. cat benchmarks/report-$(date +%Y%m%d).json | grep "meetsTarget"
      3. Assert actionSuccessRate.meetsTarget is true or false
      4. Assert itemsPerHour.meetsTarget is true or false
    Expected Result: Each metric has target comparison
    Failure Indicators: No target comparison, all false
    Evidence: .sisyphus/evidence/task-14-target-comparison.json
  ```

  **Evidence to Capture**:
  - [ ] task-14-benchmark-report.json (full benchmark report)
  - [ ] task-14-target-comparison.json (target achievement status)

  **Commit**: YES
  - Message: `feat(metrics): add performance benchmark suite with targets`
  - Files: `src/metrics/benchmark-suite.js`, `scripts/run-benchmarks.js`
  - Pre-commit: `node scripts/run-benchmarks.js`

- [ ] 15. Documentation Updates

  **What to do**:
  - Update README.md with new features (skills, autonomous goals, reflection)
  - Update AGENTS.md with new modules and architecture changes
  - Create ROBUSTNESS.md documenting robustness features
  - Update ARCHITECTURE.md with skill system and goal generation
  - Add inline code comments for complex logic
  - Update .env.example with new configuration options

  **Must NOT do**:
  - Don't write excessive documentation (focus on key features)
  - Don't duplicate information across files
  - Don't create documentation that will quickly become outdated

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation writing task
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 14)
  - **Blocks**: None
  - **Blocked By**: All implementation tasks (needs complete system to document)

  **References**:

  **Pattern References**:
  - `README.md` - Current documentation structure
  - `AGENTS.md` - Current architecture documentation
  - `ARCHITECTURE.md` - Current design documentation

  **WHY Each Reference Matters**:
  - README.md is user-facing - update with new features
  - AGENTS.md is developer-facing - update with new modules
  - ARCHITECTURE.md explains design - update with new systems

  **Acceptance Criteria**:

  **Code Changes**:
  - [ ] File modified: README.md (add robustness features section)
  - [ ] File modified: AGENTS.md (add new modules)
  - [ ] File created: docs/ROBUSTNESS.md (detailed robustness guide)
  - [ ] File modified: ARCHITECTURE.md (add skill system, goal generation)
  - [ ] File modified: .env.example (add new config options)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: README includes all new features
    Tool: Bash (grep)
    Preconditions: README.md updated
    Steps:
      1. grep -i "skill" README.md
      2. grep -i "autonomous goal" README.md
      3. grep -i "reflection" README.md
      4. grep -i "robustness" README.md
    Expected Result: All 4 features mentioned in README
    Failure Indicators: Missing features, outdated information
    Evidence: .sisyphus/evidence/task-15-readme-coverage.txt

  Scenario: ROBUSTNESS.md explains all robustness features
    Tool: Bash (check file structure)
    Preconditions: ROBUSTNESS.md created
    Steps:
      1. cat docs/ROBUSTNESS.md
      2. Assert file has sections: Action Awareness, Failure Detection, Retry Logic, Reflection, Memory Consolidation
      3. Assert each section has examples
      4. Assert file has troubleshooting section
    Expected Result: Complete robustness documentation
    Failure Indicators: Missing sections, no examples
    Evidence: .sisyphus/evidence/task-15-robustness-doc.txt
  ```

  **Evidence to Capture**:
  - [ ] task-15-readme-coverage.txt (README feature coverage)
  - [ ] task-15-robustness-doc.txt (ROBUSTNESS.md structure)

  **Commit**: YES
  - Message: `docs: update documentation for robustness features`
  - Files: `README.md`, `AGENTS.md`, `docs/ROBUSTNESS.md`, `ARCHITECTURE.md`, `.env.example`
  - Pre-commit: `grep -i "robustness" README.md`

- [ ] 16. Final Integration & Cleanup

  **What to do**:
  - Run full test suite (unit + integration + e2e)
  - Fix any integration issues discovered
  - Clean up debug logging (reduce verbosity)
  - Remove unused code and comments
  - Verify all features work together
  - Run 4-hour stability test
  - Create release notes summarizing changes

  **Must NOT do**:
  - Don't remove useful logging (keep error and info logs)
  - Don't refactor working code unnecessarily
  - Don't skip final testing

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration work, testing, cleanup
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (final integration must be sequential)
  - **Parallel Group**: Wave 4 (sequential, after all other tasks)
  - **Blocks**: None (final task)
  - **Blocked By**: All previous tasks

  **References**:

  **Pattern References**:
  - `package.json` - Test scripts to run
  - All implemented files - Integration points to verify

  **Test References**:
  - All test files - Full suite to run

  **WHY Each Reference Matters**:
  - package.json shows test commands - run all
  - All files need integration verification
  - Tests validate complete system

  **Acceptance Criteria**:

  **Code Changes**:
  - [ ] All tests passing (npm test, npm run test:e2e)
  - [ ] Debug logs reduced to reasonable level
  - [ ] Unused code removed
  - [ ] 4-hour stability test passed
  - [ ] Release notes created

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Full test suite passes
    Tool: Bash (npm test)
    Preconditions: All features implemented
    Steps:
      1. npm test
      2. Assert all unit tests pass
      3. npm run test:integration
      4. Assert all integration tests pass
      5. npm run test:e2e
      6. Assert all e2e tests pass
    Expected Result: 100% test pass rate
    Failure Indicators: Any test failures
    Evidence: .sisyphus/evidence/task-16-full-test-suite.log

  Scenario: 4-hour stability test
    Tool: Bash (long-running test)
    Preconditions: Minecraft server running, bot configured
    Steps:
      1. npm run mc:start
      2. node src/index.js > logs/stability-test.log 2>&1 &
      3. sleep 14400 (4 hours)
      4. Check bot still running (ps aux | grep "node src/index.js")
      5. grep "stuck" logs/stability-test.log | wc -l
      6. cat state/commands.json (check for valid state)
    Expected Result: Bot runs for 4 hours without getting stuck
    Failure Indicators: Bot crashed, stuck events, invalid state
    Evidence: .sisyphus/evidence/task-16-4hour-stability.log

  Scenario: Item progression matches paper baseline
    Tool: Bash (check metrics)
    Preconditions: 4-hour stability test complete
    Steps:
      1. node scripts/run-benchmarks.js
      2. cat benchmarks/report-$(date +%Y%m%d).json | grep "uniqueItems"
      3. Assert uniqueItems >= 100 (paper achieved 320, we target 100+)
      4. Assert itemsPerHour >= 25
    Expected Result: Reasonable progression compared to paper
    Failure Indicators: Very low item count (<50), low rate (<10/hour)
    Evidence: .sisyphus/evidence/task-16-progression-comparison.json
  ```

  **Evidence to Capture**:
  - [ ] task-16-full-test-suite.log (all test results)
  - [ ] task-16-4hour-stability.log (long-running stability)
  - [ ] task-16-progression-comparison.json (benchmark vs paper)

  **Commit**: YES
  - Message: `chore: final integration, cleanup, and stability verification`
  - Files: Multiple files (cleanup changes)
  - Pre-commit: `npm test && npm run test:integration`

---

## Final Verification Wave (MANDATORY)

> 4 review agents run in PARALLEL after ALL implementation tasks complete.
> ALL must APPROVE. Present consolidated results to user and get explicit "okay" before marking work complete.

- [ ] F1. **Plan Compliance Audit** — `oracle`

  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, check code). For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  
  Output: `Must Have [7/7] | Must NOT Have [0 violations] | Tasks [16/16] | Evidence [48/48] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`

  Run `npm test` + `npm run test:integration` + `npm run test:e2e`. Check coverage report (target: 70%). Review all new files for: proper error handling, no console.log in production, consistent style, proper async/await usage. Check for AI slop: excessive comments, over-abstraction, generic names.
  
  Output: `Tests [PASS/FAIL] | Coverage [X%] | Files [N clean/N issues] | VERDICT: APPROVE/REJECT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if needed)

  Start from clean state. Run bot for 1 hour. Verify: autonomous goal generation works, skills execute correctly, reflection runs and logs learnings, memory consolidation reduces size, failure recovery works. Test edge cases: bot death, stuck detection, low health. Save evidence to `.sisyphus/evidence/final-qa/`.
  
  Output: `Runtime [1h] | Goals Generated [N] | Skills Executed [N] | Failures Recovered [N] | VERDICT: APPROVE/REJECT`

- [ ] F4. **Scope Fidelity Check** — `deep`

  For each task: read "What to do", compare against actual implementation (git diff, file contents). Verify 1:1 match - everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect scope creep: features not in plan. Flag unaccounted changes.
  
  Output: `Tasks [16/16 compliant] | Scope Creep [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT: APPROVE/REJECT`

---

## Commit Strategy

- **Wave 1**: 4 commits (one per task)
- **Wave 2**: 4 commits (one per task)
- **Wave 3**: 4 commits (one per task)
- **Wave 4**: 4 commits (one per task)
- **Total**: 16 commits

Each commit message follows: `type(scope): description`

---

## Success Criteria

### Verification Commands
```bash
# All tests pass
npm test && npm run test:integration && npm run test:e2e

# Coverage meets target
npm run test:coverage
# Expected: >=70% coverage

# Bot runs for 4 hours
node src/index.js
# Expected: No stuck events, 100+ unique items

# Benchmarks meet targets
node scripts/run-benchmarks.js
# Expected: actionSuccessRate >0.9, itemsPerHour >25
```

### Final Checklist
- [ ] All "Must Have" features present
- [ ] All "Must NOT Have" patterns absent (scope guardrails enforced)
- [ ] All tests passing (unit + integration + e2e)
- [ ] Coverage >=70%
- [ ] 4-hour stability test passed
- [ ] Bot acquires 100+ unique items autonomously
- [ ] Action success rate >90%
- [ ] Memory stays under 10,000 nodes
- [ ] Reflection generates learnings
- [ ] Documentation updated
- [ ] Evidence files captured for all tasks
- [ ] All 7 technical assumptions validated (A1-A7)
- [ ] All 12 edge cases tested (E1-E12)
- [ ] Integration tests pass for all module pairs
- [ ] Rollback criteria tested and working
- [ ] Feature flags functional
- [ ] Performance regression checks pass (Pilot <250ms, Strategy <600ms, Commander <1500ms)

---

## Metis Findings Summary

**Critical Issues Identified:**
1. **7 Unvalidated Assumptions** - API compatibility, performance, concurrency not verified
2. **12 Edge Cases Missing** - Death, disconnection, resource limits, race conditions
3. **No Integration Tests** - Module pairs not tested together
4. **No Rollback Criteria** - Features can't disable themselves on failure
5. **Scope Creep Risks** - Skill learning, goal optimization, danger prediction could expand

**Metis Recommendations Implemented:**
- ✅ Added Wave 0 validation tasks (5 hours)
- ✅ Added integration test matrix requirement
- ✅ Added edge case test matrix requirement
- ✅ Added rollback criteria definition
- ✅ Added explicit scope guardrails to "Must NOT Have"
- ✅ Updated effort estimate: 38-48 hours (was 33-43h)

**Next Step:** Ask user about high accuracy mode (Momus review)
