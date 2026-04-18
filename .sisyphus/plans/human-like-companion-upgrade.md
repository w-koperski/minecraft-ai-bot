# Human-Like Companion Bot Upgrade

## TL;DR

> **Quick Summary**: Transform Minecraft bot into emotionally intelligent companion using PIANO architecture principles. Add Cognitive Controller for coherence, emotion detection for player sentiment understanding, and knowledge graph for relationship/location memory.
> 
> **Deliverables**:
> - Cognitive Controller module (Commander layer bottleneck)
> - Emotion detection system (transformers.js + boltuix/bert-emotion)
> - Social Awareness module (track player sentiment, infer intentions)
> - Knowledge graph with 4 memory types (Spatial, Temporal, Episodic, Semantic)
> 
> **Estimated Effort**: 3-4 weeks (MVP scope)
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Phase 1 (Architecture) → Phase 2 (Emotion) → Phase 3 (Knowledge Graph)

---

## Context

### Original Request
User wants to add neural models for personality, multispeaker voice tracking, emotion detection, knowledge graph, and enhance the 3-layer architecture to make the bot feel more human-like and autonomous.

### Interview Summary
**Key Discussions**:
- User approved MVP scope (Phases 1-3 only, 3-4 weeks)
- Voice implementation excluded (design voice-ready, implement later)
- Keep existing 6 personality traits (no neural embeddings)
- Build standalone knowledge graph with graphology (no OpenClaw integration)
- Chat autonomy: multitask for casual, interrupt for urgent (emotion-detected)

**Research Findings**:
- PIANO architecture (Project Sid): Concurrency + Coherence via Cognitive Controller
- User already has Action Awareness module (PIANO's key component!)
- graphology: 178KB, <1ms queries, perfect for in-memory graph
- transformers.js + boltuix/bert-emotion: 13 emotions in <50ms
- 30+ papers on multi-agent systems, Theory of Mind, memory architectures

### Metis Review
**Identified Gaps** (addressed):
- Data migration strategy: Start fresh, no migration (existing memory.db preserved but not migrated)
- Emotion model conflict: Detected emotions feed into Social Awareness only, don't override personality traits
- Cognitive Controller throttling: Runs at Commander frequency (0.1 Hz), wraps existing Commander logic
- Knowledge graph latency: Strategy-layer only (async queries, 500ms budget), never in Pilot loop
- Emotion detection false positives: Confidence threshold >0.7, blend with context (player health, recent events)

---

## Work Objectives

### Core Objective
Add PIANO architecture principles to existing 3-layer system, enabling emotional intelligence and persistent relationship memory without breaking existing functionality.

### Concrete Deliverables
- `src/layers/cognitive-controller.js` - Bottleneck module ensuring coherence
- `src/emotion/emotion-detector.js` - Text-based emotion detection (<50ms)
- `src/social/social-awareness.js` - Player sentiment tracking and intention inference
- `src/memory/knowledge-graph.js` - 4-type memory system (Spatial, Temporal, Episodic, Semantic)
- Updated Commander layer with Cognitive Controller integration
- Updated Strategy layer with knowledge graph queries
- Integration tests for module communication

### Definition of Done
- [ ] All existing tests pass (unit, integration, e2e)
- [ ] New modules have >70% test coverage
- [ ] Emotion detection processes messages in <50ms (P99)
- [ ] Knowledge graph queries complete in <10ms (P99)
- [ ] Cognitive Controller prevents "say yes, do no" incoherence (tested)
- [ ] Bot responds to player emotions appropriately (integration test)
- [ ] No performance regression in Pilot loop (200-2000ms adaptive maintained)

### Must Have
- Cognitive Controller as bottleneck (PIANO principle)
- Emotion detection with confidence thresholds (>0.7)
- Social Awareness module tracking player sentiment
- Knowledge graph with temporal validity (valid_from/valid_until)
- 4 memory types: Spatial, Temporal, Episodic, Semantic
- Integration with existing Action Awareness module
- Concurrent module execution in Commander layer

### Must NOT Have (Guardrails)
- Voice implementation (explicitly excluded, Phase 6)
- Neural personality embeddings (keep existing traits)
- OCEAN personality scores (not needed for MVP)
- OpenClaw integration (standalone for now)
- Enhanced goal generation (Phase 4, out of scope)
- Chat autonomy system (Phase 5, out of scope)
- PII storage in knowledge graph (player names only, no emails/IPs)
- Pilot loop blocking on graph queries or emotion detection
- Performance regression (maintain current loop speeds)
- Memory footprint >100MB for knowledge graph

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (Jest, existing test suite)
- **Automated tests**: Tests-after (implementation first, then tests)
- **Framework**: Jest (existing)
- **Coverage target**: >70% for new modules

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Module tests**: Use Jest (run tests, assert pass/fail)
- **Integration tests**: Use Jest + mock Minecraft bot
- **Performance tests**: Use Bash (time commands, assert latency)
- **E2E tests**: Use existing e2e suite (npm run test:e2e)

---

## Execution Strategy

### Parallel Execution Waves

> Maximize throughput by grouping independent tasks into parallel waves.

```
Wave 1 (Start Immediately - validation + scaffolding):
├── Task 1: Validate transformers.js Node.js compatibility [quick]
├── Task 2: Test bert-emotion on Minecraft chat samples [quick]
├── Task 3: Prototype graphology query latency [quick]
├── Task 4: Map bot scenarios to memory types [quick]
└── Task 5: Create Cognitive Controller skeleton [quick]

Wave 2 (After Wave 1 - core implementation):
├── Task 6: Implement Cognitive Controller bottleneck (depends: 5) [deep]
├── Task 7: Implement emotion detection module (depends: 1, 2) [unspecified-high]
├── Task 8: Implement Social Awareness module (depends: 7) [deep]
├── Task 9: Implement knowledge graph core (depends: 3, 4) [deep]
└── Task 10: Implement 4 memory types (depends: 9) [unspecified-high]

Wave 3 (After Wave 2 - integration):
├── Task 11: Integrate Cognitive Controller with Commander (depends: 6) [deep]
├── Task 12: Integrate emotion detection with chat handler (depends: 7, 8) [unspecified-high]
├── Task 13: Integrate knowledge graph with Strategy (depends: 9, 10) [unspecified-high]
├── Task 14: Add concurrent module execution (depends: 11) [deep]
└── Task 15: Write integration tests (depends: 11, 12, 13, 14) [unspecified-high]

Wave FINAL (After ALL tasks - verification):
├── Task F1: Run full test suite and verify no regressions [quick]
├── Task F2: Performance validation (latency, memory) [quick]
├── Task F3: Manual QA with real Minecraft server [unspecified-high]
└── Task F4: Code review and documentation [quick]
```

**Critical Path**: Task 1 → Task 5 → Task 6 → Task 11 → Task 14 → Task 15 → F1-F4
**Parallel Speedup**: ~60% faster than sequential
**Max Concurrent**: 5 (Wave 1)

### Dependency Matrix

- **1-5**: - → 6-10
- **6**: 5 → 11
- **7**: 1, 2 → 8, 12
- **8**: 7 → 12
- **9**: 3, 4 → 10, 13
- **10**: 9 → 13
- **11**: 6 → 14, 15
- **12**: 7, 8 → 15
- **13**: 9, 10 → 15
- **14**: 11 → 15
- **15**: 11, 12, 13, 14 → F1-F4

### Agent Dispatch Summary

- **Wave 1**: 5 tasks → `quick` (validation, scaffolding)
- **Wave 2**: 5 tasks → `deep` (6, 8, 9), `unspecified-high` (7, 10)
- **Wave 3**: 5 tasks → `deep` (11, 14), `unspecified-high` (12, 13, 15)
- **Wave FINAL**: 4 tasks → `quick` (F1, F2, F4), `unspecified-high` (F3)

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. Validate transformers.js Node.js compatibility

  **What to do**:
  - Run `npm info @xenova/transformers` and check Node.js support
  - Verify it doesn't require WebGL/GPU for inference
  - Check actual bundle size in Node.js environment
  - Test basic model loading in Node.js script
  - Document findings in validation report

  **Must NOT do**:
  - Install transformers.js yet (validation only)
  - Test in browser environment
  - Benchmark performance (just verify it works)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple validation task, npm commands and documentation reading
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: Task 7 (emotion detection implementation)
  - **Blocked By**: None (can start immediately)

  **References**:
  - NPM package: `https://www.npmjs.com/package/@xenova/transformers`
  - GitHub: `https://github.com/xenova/transformers.js`
  - Metis finding A1: "Need to verify transformers.js Node.js support"

  **Acceptance Criteria**:
  - [ ] npm info command executed successfully
  - [ ] Documentation confirms Node.js support (not browser-only)
  - [ ] Bundle size documented (<100MB acceptable)
  - [ ] Test script loads model without errors

  **QA Scenarios**:
  ```
  Scenario: Verify transformers.js Node.js compatibility
    Tool: Bash
    Preconditions: Node.js v18+ installed
    Steps:
      1. Run: npm info @xenova/transformers
      2. Check output for "engines": {"node": ">=18"}
      3. Create test.js: const { pipeline } = require('@xenova/transformers');
      4. Run: node test.js (should not error on require)
    Expected Result: Package supports Node.js, no browser-only warnings
    Failure Indicators: "browser only", "requires WebGL", require() fails
    Evidence: .sisyphus/evidence/task-1-transformers-validation.txt
  ```

  **Commit**: NO (validation only, no code changes)

- [x] 2. Test bert-emotion on Minecraft chat samples

  **What to do**:
  - Create 20 sample Minecraft chat messages (varied emotions)
  - Install boltuix/bert-emotion model temporarily
  - Run inference on all samples, record results
  - Check accuracy on game-specific jargon ("gg", "noob", "brb")
  - Measure inference latency (must be <50ms)
  - Document findings in validation report

  **Must NOT do**:
  - Integrate with bot code yet (validation only)
  - Test on real player chat (use synthetic samples)
  - Fine-tune the model (use pre-trained only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Testing pre-trained model, straightforward validation
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5)
  - **Blocks**: Task 7 (emotion detection implementation)
  - **Blocked By**: None (can start immediately)

  **References**:
  - Model: `https://huggingface.co/boltuix/bert-emotion`
  - Metis finding A3: "Test model on sample Minecraft chat logs before committing"
  - Sample messages should include: greetings, frustration, excitement, sarcasm, commands

  **Acceptance Criteria**:
  - [ ] 20 sample messages created covering 6+ emotion types
  - [ ] Model inference runs successfully on all samples
  - [ ] Latency measured: P99 <50ms
  - [ ] Accuracy on game jargon documented (>70% acceptable)

  **QA Scenarios**:
  ```
  Scenario: BERT emotion detection on Minecraft chat
    Tool: Bash (Node.js script)
    Preconditions: transformers.js installed, test samples created
    Steps:
      1. Create samples.json with 20 messages
      2. Run: node test-bert-emotion.js samples.json
      3. Measure latency for each inference
      4. Check detected emotions match expected (manual review)
    Expected Result: 14+ correct detections (70%), all <50ms
    Failure Indicators: <70% accuracy, any inference >50ms, model crash
    Evidence: .sisyphus/evidence/task-2-bert-emotion-results.json
  ```

  **Commit**: NO (validation only, no code changes)

- [x] 3. Prototype graphology query latency

  **What to do**:
  - Install graphology library
  - Create synthetic graph with 500 nodes, 2000 edges
  - Implement common query patterns (find neighbors, shortest path, filter by type)
  - Measure query latency (P99 must be <10ms)
  - Test concurrent read access (multiple queries simultaneously)
  - Document findings in validation report

  **Must NOT do**:
  - Implement full knowledge graph yet (prototype only)
  - Use real bot data (synthetic only)
  - Add persistence layer (in-memory only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Prototype with synthetic data, performance measurement
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5)
  - **Blocks**: Task 9 (knowledge graph core implementation)
  - **Blocked By**: None (can start immediately)

  **References**:
  - Library: `https://graphology.github.io/`
  - Metis finding A2: "Check graphology docs for concurrency guarantees"
  - Metis finding AC2: "Query completes in <10ms (P99)"

  **Acceptance Criteria**:
  - [ ] Synthetic graph created with 500 nodes, 2000 edges
  - [ ] 5+ query patterns implemented and tested
  - [ ] P99 latency <10ms for all query types
  - [ ] Concurrent reads tested (no race conditions)

  **QA Scenarios**:
  ```
  Scenario: Graphology query performance
    Tool: Bash (Node.js script with console.time)
    Preconditions: graphology installed, synthetic graph created
    Steps:
      1. Create graph: 500 nodes (players, locations, items), 2000 edges
      2. Run 1000 queries: findNeighbors(nodeId)
      3. Measure latency for each query
      4. Calculate P99 latency
    Expected Result: P99 <10ms, no errors
    Failure Indicators: P99 >10ms, memory leak, crashes
    Evidence: .sisyphus/evidence/task-3-graphology-latency.txt
  ```

  **Commit**: NO (validation only, no code changes)

- [x] 4. Map bot scenarios to memory types

  **What to do**:
  - List 20+ common bot scenarios (combat, building, trading, exploring, etc.)
  - For each scenario, identify what should be remembered
  - Map each memory to one of 4 types: Spatial, Temporal, Episodic, Semantic
  - Identify gaps where memory type is unclear
  - Document mapping in validation report
  - Propose schema for each memory type

  **Must NOT do**:
  - Implement memory storage yet (mapping only)
  - Add new memory types beyond the 4 approved
  - Design complex inference logic (simple storage only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Analysis and documentation task, no coding
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5)
  - **Blocks**: Task 10 (4 memory types implementation)
  - **Blocked By**: None (can start immediately)

  **References**:
  - Metis finding A5: "Map 20+ bot scenarios to memory types, find gaps"
  - RoboMemory paper: 4 memory types (Spatial, Temporal, Episodic, Semantic)
  - Current bot scenarios in `src/layers/pilot.js`, `src/layers/strategy.js`

  **Acceptance Criteria**:
  - [ ] 20+ scenarios documented with memory requirements
  - [ ] Each memory mapped to one of 4 types
  - [ ] Gaps identified and resolution proposed
  - [ ] Schema defined for each memory type

  **QA Scenarios**:
  ```
  Scenario: Memory type mapping completeness
    Tool: Read (manual review)
    Preconditions: Scenarios documented
    Steps:
      1. Review mapping document
      2. Check each scenario has memory type assigned
      3. Verify no ambiguous mappings (e.g., "could be Episodic or Semantic")
      4. Confirm schema covers all mapped memories
    Expected Result: All scenarios mapped, no gaps, clear schema
    Failure Indicators: Unmapped scenarios, ambiguous types, missing schema fields
    Evidence: .sisyphus/evidence/task-4-memory-mapping.md
  ```

  **Commit**: YES
  - Message: `docs: map bot scenarios to 4 memory types`
  - Files: `.sisyphus/evidence/task-4-memory-mapping.md`
  - Pre-commit: None (documentation only)

- [x] 5. Create Cognitive Controller skeleton

  **What to do**:
  - Create `src/layers/cognitive-controller.js` with basic structure
  - Define interface: receives (personality, emotion, social, goals), outputs (decision)
  - Add placeholder methods: synthesize(), broadcast(), checkCoherence()
  - Add basic logging for debugging
  - Write unit tests for skeleton (no logic yet, just structure)

  **Must NOT do**:
  - Implement actual decision logic (skeleton only)
  - Integrate with Commander yet (standalone module)
  - Add complex state management (simple object for now)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Scaffolding task, basic structure with placeholders
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4)
  - **Blocks**: Task 6 (Cognitive Controller implementation)
  - **Blocked By**: None (can start immediately)

  **References**:
  - PIANO architecture: Cognitive Controller as bottleneck
  - `src/layers/action-awareness.js` - Similar module pattern
  - `src/layers/commander.js` - Will integrate with this

  **Acceptance Criteria**:
  - [ ] File created: `src/layers/cognitive-controller.js`
  - [ ] Class exported with constructor and 3 methods
  - [ ] Unit test file created: `tests/unit/cognitive-controller.test.js`
  - [ ] Tests pass (structure only, no logic)

  **QA Scenarios**:
  ```
  Scenario: Cognitive Controller skeleton structure
    Tool: Bash (Jest)
    Preconditions: File created
    Steps:
      1. Run: npm test tests/unit/cognitive-controller.test.js
      2. Check class can be instantiated
      3. Check methods exist: synthesize(), broadcast(), checkCoherence()
      4. Check methods return expected types (object, boolean, etc.)
    Expected Result: All tests pass, no errors
    Failure Indicators: Import fails, methods missing, tests fail
    Evidence: .sisyphus/evidence/task-5-controller-skeleton.txt
  ```

  **Commit**: YES
  - Message: `feat(layers): add Cognitive Controller skeleton`
  - Files: `src/layers/cognitive-controller.js`, `tests/unit/cognitive-controller.test.js`
  - Pre-commit: `npm test tests/unit/cognitive-controller.test.js`

- [x] 6. Implement Cognitive Controller bottleneck

  **What to do**:
  - Implement synthesize() method: aggregate personality, emotion, social, goals
  - Implement checkCoherence() method: detect conflicts between talk and action
  - Implement broadcast() method: send decision to all modules
  - Add confidence scoring for decisions
  - Add conflict resolution logic (priority: danger > social > goals)
  - Write comprehensive unit tests

  **Must NOT do**:
  - Integrate with Commander yet (standalone implementation)
  - Add LLM calls (rule-based logic only)
  - Implement complex state machine (simple priority rules)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core logic implementation, conflict resolution, requires careful design
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 5)
  - **Blocks**: Task 11 (Commander integration)
  - **Blocked By**: Task 5 (skeleton must exist)

  **References**:
  - PIANO paper: Cognitive Controller as information bottleneck
  - Metis finding: "Controller defers goal if combat has priority"
  - `src/layers/action-awareness.js` - Similar verification pattern
  - Priority rules: danger (Pilot) > social (Strategy) > goals (Commander)

  **Acceptance Criteria**:
  - [ ] synthesize() aggregates inputs into single decision object
  - [ ] checkCoherence() detects talk/action conflicts (returns boolean)
  - [ ] broadcast() returns decision for all modules
  - [ ] Conflict resolution follows priority rules
  - [ ] Unit tests cover all methods with 80%+ coverage

  **QA Scenarios**:
  ```
  Scenario: Coherence detection - conflict case
    Tool: Bash (Jest)
    Preconditions: Controller implemented
    Steps:
      1. Create test: talk="I'll help you", action="attack player"
      2. Call checkCoherence({talk, action})
      3. Assert returns false (incoherent)
      4. Check logs contain conflict reason
    Expected Result: Conflict detected, logged
    Failure Indicators: Returns true (missed conflict), no log
    Evidence: .sisyphus/evidence/task-6-coherence-conflict.txt

  Scenario: Priority resolution - danger overrides social
    Tool: Bash (Jest)
    Preconditions: Controller implemented
    Steps:
      1. Create inputs: danger=true, social={emotion: "happy", action: "chat"}
      2. Call synthesize({danger, social, goals: null})
      3. Assert decision prioritizes danger (action="flee")
    Expected Result: Danger action chosen, social deferred
    Failure Indicators: Social action chosen, danger ignored
    Evidence: .sisyphus/evidence/task-6-priority-danger.txt
  ```

  **Commit**: YES
  - Message: `feat(layers): implement Cognitive Controller bottleneck logic`
  - Files: `src/layers/cognitive-controller.js`
  - Pre-commit: `npm test tests/unit/cognitive-controller.test.js`

- [x] 7. Implement emotion detection module

  **What to do**:
  - Create `src/emotion/emotion-detector.js`
  - Install @xenova/transformers and boltuix/bert-emotion
  - Implement detectEmotion(message) method using transformers.js pipeline
  - Add confidence threshold filtering (>0.7)
  - Add caching for repeated messages
  - Measure and log latency (must be <50ms P99)
  - Write unit tests with mock messages

  **Must NOT do**:
  - Integrate with chat handler yet (standalone module)
  - Add emotion history tracking (single message only)
  - Implement multi-language support (English only)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: ML model integration, performance requirements, moderate complexity
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 8, 9, 10)
  - **Blocks**: Task 8 (Social Awareness), Task 12 (chat handler integration)
  - **Blocked By**: Tasks 1, 2 (validation must pass)

  **References**:
  - Validation: Task 1 (transformers.js compatibility), Task 2 (BERT accuracy)
  - Model: `boltuix/bert-emotion` (13 emotion classes)
  - Metis finding: "Confidence threshold >0.7, blend with context"
  - Performance target: <50ms P99 latency

  **Acceptance Criteria**:
  - [ ] Module exports detectEmotion(message) function
  - [ ] Returns {emotion: string, confidence: number}
  - [ ] Filters low-confidence results (<0.7)
  - [ ] P99 latency <50ms (measured in tests)
  - [ ] Unit tests cover happy path, low confidence, errors

  **QA Scenarios**:
  ```
  Scenario: Emotion detection - happy path
    Tool: Bash (Jest)
    Preconditions: Module implemented, model loaded
    Steps:
      1. Call detectEmotion("I'm so frustrated!")
      2. Assert emotion="frustration" or "anger"
      3. Assert confidence >0.7
      4. Measure latency (should be <50ms)
    Expected Result: Correct emotion, high confidence, fast
    Failure Indicators: Wrong emotion, low confidence, >50ms
    Evidence: .sisyphus/evidence/task-7-emotion-happy.txt

  Scenario: Emotion detection - low confidence filtering
    Tool: Bash (Jest)
    Preconditions: Module implemented
    Steps:
      1. Call detectEmotion("brb") (ambiguous message)
      2. Assert returns null or {emotion: "neutral", confidence: <0.7}
      3. Check no action triggered on low confidence
    Expected Result: Low confidence filtered out
    Failure Indicators: Returns high confidence on ambiguous input
    Evidence: .sisyphus/evidence/task-7-emotion-lowconf.txt
  ```

  **Commit**: YES
  - Message: `feat(emotion): add emotion detection module with BERT`
  - Files: `src/emotion/emotion-detector.js`, `tests/unit/emotion-detector.test.js`, `package.json`
  - Pre-commit: `npm test tests/unit/emotion-detector.test.js`

- [x] 8. Implement Social Awareness module

  **What to do**:
  - Create `src/social/social-awareness.js`
  - Implement trackSentiment(playerId, emotion) method
  - Implement inferIntention(playerId, message, context) method
  - Add player mental state modeling (beliefs, desires, intentions - BDI)
  - Store sentiment history (last 10 interactions per player)
  - Integrate with emotion detector (call detectEmotion internally)
  - Write unit tests with mock players

  **Must NOT do**:
  - Store sentiment in knowledge graph yet (in-memory only)
  - Add complex Theory of Mind inference (simple BDI model)
  - Implement proactive emotional support (reactive only)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Social reasoning logic, mental state modeling, requires careful design
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 9, 10)
  - **Blocks**: Task 12 (chat handler integration)
  - **Blocked By**: Task 7 (emotion detector must exist)

  **References**:
  - ToMA paper: Explicit mental state modeling (BDI)
  - Metis finding: "Track player beliefs, desires, intentions"
  - `src/memory/conversation-store.js` - Similar relationship tracking
  - Emotion detector: `src/emotion/emotion-detector.js`

  **Acceptance Criteria**:
  - [ ] Module exports trackSentiment() and inferIntention() methods
  - [ ] Sentiment history stored (last 10 per player)
  - [ ] BDI model tracks beliefs, desires, intentions
  - [ ] Integration with emotion detector works
  - [ ] Unit tests cover sentiment tracking, intention inference

  **QA Scenarios**:
  ```
  Scenario: Sentiment tracking over time
    Tool: Bash (Jest)
    Preconditions: Module implemented
    Steps:
      1. Call trackSentiment("player1", {emotion: "happy", confidence: 0.9})
      2. Call trackSentiment("player1", {emotion: "frustrated", confidence: 0.8})
      3. Call getSentimentHistory("player1")
      4. Assert returns array with 2 entries, most recent first
    Expected Result: History tracked correctly
    Failure Indicators: Missing entries, wrong order, data loss
    Evidence: .sisyphus/evidence/task-8-sentiment-tracking.txt

  Scenario: Intention inference from context
    Tool: Bash (Jest)
    Preconditions: Module implemented
    Steps:
      1. Set context: player health=5, recent message="help!"
      2. Call inferIntention("player1", "help!", {health: 5})
      3. Assert intention="needs_assistance", urgency="high"
    Expected Result: Correct intention inferred
    Failure Indicators: Wrong intention, missed urgency
    Evidence: .sisyphus/evidence/task-8-intention-inference.txt
  ```

  **Commit**: YES
  - Message: `feat(social): add Social Awareness module with BDI modeling`
  - Files: `src/social/social-awareness.js`, `tests/unit/social-awareness.test.js`
  - Pre-commit: `npm test tests/unit/social-awareness.test.js`

- [x] 9. Implement knowledge graph core

  **What to do**:
  - Create `src/memory/knowledge-graph.js`
  - Install graphology library
  - Implement addEntity(id, type, properties) method
  - Implement addRelation(from, to, relationType, metadata) method
  - Implement query methods: getNeighbors(), findPath(), filterByType()
  - Add temporal validity support (valid_from, valid_until)
  - Add TTL and pruning (max 10,000 nodes, LRU eviction)
  - Write unit tests with synthetic data

  **Must NOT do**:
  - Implement all 4 memory types yet (core graph only)
  - Add persistence layer (in-memory only for now)
  - Implement complex graph algorithms (basic queries only)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core data structure, query optimization, temporal logic
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8, 10)
  - **Blocks**: Task 10 (4 memory types), Task 13 (Strategy integration)
  - **Blocked By**: Tasks 3, 4 (validation and mapping must be done)

  **References**:
  - Validation: Task 3 (graphology latency), Task 4 (memory mapping)
  - Library: graphology (178KB, <1ms queries)
  - Metis finding: "Max 10,000 nodes, LRU eviction, TTL 30 days"
  - Temporal pattern: valid_from/valid_until timestamps

  **Acceptance Criteria**:
  - [ ] Module exports KnowledgeGraph class
  - [ ] addEntity() and addRelation() methods work
  - [ ] Query methods return results in <10ms (P99)
  - [ ] Temporal validity filtering works (valid_from/valid_until)
  - [ ] Pruning triggers at 10,000 nodes (LRU)
  - [ ] Unit tests cover CRUD operations, queries, pruning

  **QA Scenarios**:
  ```
  Scenario: Entity and relation CRUD
    Tool: Bash (Jest)
    Preconditions: Module implemented
    Steps:
      1. Create graph, add entity: {id: "player1", type: "player"}
      2. Add relation: player1 --FRIEND--> player2
      3. Query: getNeighbors("player1", "FRIEND")
      4. Assert returns ["player2"]
    Expected Result: CRUD operations work correctly
    Failure Indicators: Entity not found, relation missing, query fails
    Evidence: .sisyphus/evidence/task-9-graph-crud.txt

  Scenario: Temporal validity filtering
    Tool: Bash (Jest)
    Preconditions: Module implemented
    Steps:
      1. Add relation with valid_from="2026-04-01", valid_until="2026-04-10"
      2. Query at timestamp "2026-04-05" (should return relation)
      3. Query at timestamp "2026-04-15" (should NOT return relation)
    Expected Result: Temporal filtering works
    Failure Indicators: Expired relations returned, valid relations missing
    Evidence: .sisyphus/evidence/task-9-temporal-validity.txt

  Scenario: Pruning at 10,000 nodes
    Tool: Bash (Jest)
    Preconditions: Module implemented
    Steps:
      1. Add 10,001 entities
      2. Check oldest entity (LRU) is evicted
      3. Check graph size = 10,000
    Expected Result: LRU eviction works
    Failure Indicators: Graph exceeds 10,000, wrong entity evicted
    Evidence: .sisyphus/evidence/task-9-pruning.txt
  ```

  **Commit**: YES
  - Message: `feat(memory): add knowledge graph core with temporal validity`
  - Files: `src/memory/knowledge-graph.js`, `tests/unit/knowledge-graph.test.js`, `package.json`
  - Pre-commit: `npm test tests/unit/knowledge-graph.test.js`

- [x] 10. Implement 4 memory types

  **What to do**:
  - Extend KnowledgeGraph with 4 memory type methods
  - Implement addSpatialMemory(location, coordinates, biome, timestamp)
  - Implement addTemporalMemory(event, timestamp, sequence)
  - Implement addEpisodicMemory(experience, participants, location, timestamp)
  - Implement addSemanticMemory(fact, category, confidence)
  - Add query methods for each type
  - Implement memory consolidation (STM → Episodic → LTM)
  - Write unit tests for each memory type

  **Must NOT do**:
  - Add spreading activation (future enhancement)
  - Implement memory inference (simple storage only)
  - Add complex consolidation logic (time-based only)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Extends core graph, multiple memory types, moderate complexity
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8, 9)
  - **Blocks**: Task 13 (Strategy integration)
  - **Blocked By**: Task 9 (core graph must exist)

  **References**:
  - Memory mapping: Task 4 (scenarios mapped to types)
  - RoboMemory paper: 4 memory types architecture
  - Consolidation pattern: STM (session) → Episodic (recent) → LTM (persistent)
  - `src/memory/conversation-store.js` - Similar consolidation pattern

  **Acceptance Criteria**:
  - [ ] 4 memory type methods implemented
  - [ ] Each type has specific schema (from Task 4 mapping)
  - [ ] Query methods work for each type
  - [ ] Consolidation moves memories between types
  - [ ] Unit tests cover all 4 types + consolidation

  **QA Scenarios**:
  ```
  Scenario: Spatial memory storage and query
    Tool: Bash (Jest)
    Preconditions: Module implemented
    Steps:
      1. Add spatial: {location: "spawn", coords: {x:0, y:64, z:0}, biome: "plains"}
      2. Query: getSpatialMemories({biome: "plains"})
      3. Assert returns spawn location
    Expected Result: Spatial memory stored and queried
    Failure Indicators: Memory not found, wrong schema
    Evidence: .sisyphus/evidence/task-10-spatial-memory.txt

  Scenario: Memory consolidation (STM → Episodic)
    Tool: Bash (Jest)
    Preconditions: Module implemented
    Steps:
      1. Add 10 STM memories (recent events)
      2. Call consolidate() (simulates time passing)
      3. Check STM count reduced, Episodic count increased
      4. Verify important memories moved, trivial ones dropped
    Expected Result: Consolidation works correctly
    Failure Indicators: No consolidation, all memories kept, important ones lost
    Evidence: .sisyphus/evidence/task-10-consolidation.txt
  ```

  **Commit**: YES
  - Message: `feat(memory): add 4 memory types with consolidation`
  - Files: `src/memory/knowledge-graph.js`, `tests/unit/knowledge-graph.test.js`
  - Pre-commit: `npm test tests/unit/knowledge-graph.test.js`

- [x] 11. Integrate Cognitive Controller with Commander

  **What to do**:
  - Modify `src/layers/commander.js` to use Cognitive Controller
  - Add Controller instantiation in Commander constructor
  - Wrap Commander's decision-making with Controller.synthesize()
  - Add coherence checks before writing to commands.json
  - Broadcast Controller decisions to Strategy/Pilot via state files
  - Update Commander tests to include Controller
  - Ensure existing Commander functionality preserved

  **Must NOT do**:
  - Break existing Commander behavior (must be backward compatible)
  - Add new Commander features (integration only)
  - Change state file formats (commands.json schema unchanged)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Critical integration, must preserve existing behavior, requires careful testing
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 6)
  - **Blocks**: Task 14 (concurrent execution), Task 15 (integration tests)
  - **Blocked By**: Task 6 (Controller must be implemented)

  **References**:
  - Cognitive Controller: `src/layers/cognitive-controller.js`
  - Commander: `src/layers/commander.js` (existing implementation)
  - Metis finding: "Controller runs at Commander frequency (0.1 Hz)"
  - State files: `state/commands.json` (schema must not change)

  **Acceptance Criteria**:
  - [ ] Commander uses Cognitive Controller for decisions
  - [ ] Coherence checks prevent conflicting commands
  - [ ] Existing Commander tests still pass
  - [ ] New tests verify Controller integration
  - [ ] No breaking changes to commands.json format

  **QA Scenarios**:
  ```
  Scenario: Commander with Controller - coherent decision
    Tool: Bash (Jest)
    Preconditions: Integration complete
    Steps:
      1. Mock inputs: personality={warmth: 0.8}, emotion={happy: 0.9}, goal="collect wood"
      2. Call Commander loop
      3. Check Controller.synthesize() called
      4. Check commands.json written with coherent command
    Expected Result: Coherent command written
    Failure Indicators: Controller not called, incoherent command, crash
    Evidence: .sisyphus/evidence/task-11-commander-coherent.txt

  Scenario: Commander with Controller - conflict detected
    Tool: Bash (Jest)
    Preconditions: Integration complete
    Steps:
      1. Mock conflict: goal="attack player", social={emotion: "friendly"}
      2. Call Commander loop
      3. Check Controller.checkCoherence() returns false
      4. Check command deferred or adjusted
    Expected Result: Conflict detected and resolved
    Failure Indicators: Conflicting command written, no coherence check
    Evidence: .sisyphus/evidence/task-11-commander-conflict.txt
  ```

  **Commit**: YES
  - Message: `feat(layers): integrate Cognitive Controller with Commander`
  - Files: `src/layers/commander.js`, `tests/unit/commander.test.js`
  - Pre-commit: `npm test tests/unit/commander.test.js`

- [x] 12. Integrate emotion detection with chat handler

  **What to do**:
  - Modify `src/chat/chat-handler.js` to use emotion detector
  - Add emotion detection call in handleChat() method
  - Pass detected emotion to Social Awareness module
  - Update response generation to consider detected emotion
  - Add confidence threshold filtering (>0.7)
  - Update chat handler tests
  - Ensure existing chat functionality preserved

  **Must NOT do**:
  - Change existing command system (!bot commands)
  - Add proactive emotional responses (reactive only)
  - Block chat responses on emotion detection (async)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration with existing chat system, moderate complexity
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 11, 13, 14, 15)
  - **Blocks**: Task 15 (integration tests)
  - **Blocked By**: Tasks 7, 8 (emotion detector and Social Awareness must exist)

  **References**:
  - Emotion detector: `src/emotion/emotion-detector.js`
  - Social Awareness: `src/social/social-awareness.js`
  - Chat handler: `src/chat/chat-handler.js` (existing implementation)
  - Metis finding: "Emotion detection runs in worker thread, Pilot never blocks"

  **Acceptance Criteria**:
  - [ ] Chat handler calls emotion detector on messages
  - [ ] Detected emotions passed to Social Awareness
  - [ ] Response tone adjusted based on emotion
  - [ ] Existing chat tests still pass
  - [ ] New tests verify emotion integration

  **QA Scenarios**:
  ```
  Scenario: Chat with emotion detection - frustrated player
    Tool: Bash (Jest)
    Preconditions: Integration complete
    Steps:
      1. Send message: "This is so frustrating!"
      2. Check emotion detector called
      3. Check emotion="frustration" detected (confidence >0.7)
      4. Check Social Awareness updated
      5. Check response tone is empathetic
    Expected Result: Emotion detected and response adjusted
    Failure Indicators: Emotion not detected, response unchanged, crash
    Evidence: .sisyphus/evidence/task-12-chat-emotion-frustrated.txt

  Scenario: Chat with low confidence emotion
    Tool: Bash (Jest)
    Preconditions: Integration complete
    Steps:
      1. Send ambiguous message: "ok"
      2. Check emotion detector called
      3. Check confidence <0.7 (filtered out)
      4. Check response uses default tone (not emotion-adjusted)
    Expected Result: Low confidence filtered, default response
    Failure Indicators: Low confidence used, response incorrectly adjusted
    Evidence: .sisyphus/evidence/task-12-chat-lowconf.txt
  ```

  **Commit**: YES
  - Message: `feat(chat): integrate emotion detection with chat handler`
  - Files: `src/chat/chat-handler.js`, `tests/unit/chat-handler.test.js`
  - Pre-commit: `npm test tests/unit/chat-handler.test.js`

- [x] 13. Integrate knowledge graph with Strategy

  **What to do**:
  - Modify `src/layers/strategy.js` to use knowledge graph
  - Add graph instantiation in Strategy constructor
  - Add graph queries for planning (relationships, locations)
  - Store plan outcomes in graph (Episodic memory)
  - Add async query pattern (never block Strategy loop)
  - Update Strategy tests
  - Ensure existing Strategy functionality preserved

  **Must NOT do**:
  - Query graph in Pilot layer (Strategy only)
  - Add synchronous blocking queries
  - Change plan.json format

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration with existing Strategy, async patterns
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 11, 12, 14, 15)
  - **Blocks**: Task 15 (integration tests)
  - **Blocked By**: Tasks 9, 10 (knowledge graph must be implemented)

  **References**:
  - Knowledge graph: `src/memory/knowledge-graph.js`
  - Strategy: `src/layers/strategy.js` (existing implementation)
  - Metis finding: "Strategy-layer async queries, 500ms budget"
  - Query patterns: relationships, locations, conversation topics

  **Acceptance Criteria**:
  - [ ] Strategy uses knowledge graph for planning
  - [ ] Queries are async (don't block loop)
  - [ ] Plan outcomes stored in graph
  - [ ] Existing Strategy tests still pass
  - [ ] New tests verify graph integration

  **QA Scenarios**:
  ```
  Scenario: Strategy queries graph for planning
    Tool: Bash (Jest)
    Preconditions: Integration complete
    Steps:
      1. Add graph data: player1 --FRIEND--> player2, location "spawn"
      2. Trigger Strategy planning
      3. Check graph queried for relationships
      4. Check plan considers graph data (e.g., "help friend at spawn")
    Expected Result: Graph data used in planning
    Failure Indicators: Graph not queried, plan ignores data
    Evidence: .sisyphus/evidence/task-13-strategy-graph-query.txt

  Scenario: Strategy stores plan outcome in graph
    Tool: Bash (Jest)
    Preconditions: Integration complete
    Steps:
      1. Execute plan: "collect wood at location X"
      2. Plan completes successfully
      3. Check graph updated with Episodic memory
      4. Query graph: getEpisodicMemories({type: "collect"})
      5. Assert memory exists with location X
    Expected Result: Plan outcome stored in graph
    Failure Indicators: Memory not stored, wrong type, missing data
    Evidence: .sisyphus/evidence/task-13-strategy-graph-store.txt
  ```

  **Commit**: YES
  - Message: `feat(layers): integrate knowledge graph with Strategy`
  - Files: `src/layers/strategy.js`, `tests/unit/strategy.test.js`
  - Pre-commit: `npm test tests/unit/strategy.test.js`

- [x] 14. Add concurrent module execution

  **What to do**:
  - Modify Commander to run modules concurrently (not sequentially)
  - Use Promise.all() for parallel module execution
  - Add module timing/profiling
  - Ensure Cognitive Controller still acts as bottleneck
  - Add error handling for module failures
  - Update Commander tests for concurrency
  - Verify no race conditions in state file access

  **Must NOT do**:
  - Remove Cognitive Controller bottleneck (must remain)
  - Allow Pilot to run concurrently with Commander (different layers)
  - Change state file locking mechanism

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Concurrency patterns, race condition prevention, critical for PIANO
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 11)
  - **Blocks**: Task 15 (integration tests)
  - **Blocked By**: Task 11 (Commander integration must be done)

  **References**:
  - PIANO paper: Concurrent modules with central orchestration
  - Commander: `src/layers/commander.js`
  - Metis finding: "Lock acquisition order: Commander > Controller > Strategy > Pilot"
  - State manager: `src/utils/state-manager.js` (lockfile pattern)

  **Acceptance Criteria**:
  - [ ] Commander modules run concurrently (Promise.all)
  - [ ] Cognitive Controller still acts as bottleneck
  - [ ] Module timing logged for debugging
  - [ ] No race conditions in state file access
  - [ ] Tests verify concurrent execution

  **QA Scenarios**:
  ```
  Scenario: Concurrent module execution
    Tool: Bash (Jest)
    Preconditions: Concurrency implemented
    Steps:
      1. Mock 3 modules: emotion (50ms), social (100ms), goals (150ms)
      2. Run Commander loop
      3. Measure total execution time
      4. Assert time ~150ms (not 300ms sequential)
    Expected Result: Modules run in parallel
    Failure Indicators: Sequential execution (300ms), race conditions
    Evidence: .sisyphus/evidence/task-14-concurrent-execution.txt

  Scenario: State file locking under concurrency
    Tool: Bash (Jest)
    Preconditions: Concurrency implemented
    Steps:
      1. Run Commander and Strategy simultaneously
      2. Both try to write state files
      3. Check lockfile prevents race conditions
      4. Check both writes succeed (sequential via lock)
    Expected Result: No race conditions, both writes succeed
    Failure Indicators: Corrupted state files, lock timeout, data loss
    Evidence: .sisyphus/evidence/task-14-state-locking.txt
  ```

  **Commit**: YES
  - Message: `feat(layers): add concurrent module execution in Commander`
  - Files: `src/layers/commander.js`, `tests/unit/commander.test.js`
  - Pre-commit: `npm test tests/unit/commander.test.js`

- [x] 15. Write integration tests

  **What to do**:
  - Create `tests/integration/piano-architecture.test.js`
  - Test full flow: chat message → emotion → social → controller → commander
  - Test coherence: conflicting inputs resolved correctly
  - Test knowledge graph: data flows through all layers
  - Test concurrent execution: modules run in parallel
  - Test error handling: module failures don't crash system
  - Ensure all integration tests pass

  **Must NOT do**:
  - Test individual modules (unit tests already exist)
  - Add e2e tests (separate task)
  - Test performance (separate validation task)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration testing, multiple modules, moderate complexity
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Tasks 11, 12, 13, 14)
  - **Blocks**: Wave FINAL (verification tasks)
  - **Blocked By**: Tasks 11, 12, 13, 14 (all integrations must be done)

  **References**:
  - Existing integration tests: `tests/integration/`
  - All new modules: cognitive-controller, emotion-detector, social-awareness, knowledge-graph
  - PIANO architecture: end-to-end flow

  **Acceptance Criteria**:
  - [ ] Integration test file created
  - [ ] 5+ integration scenarios tested
  - [ ] All tests pass
  - [ ] Test coverage includes error cases
  - [ ] Tests run in <30s

  **QA Scenarios**:
  ```
  Scenario: Full PIANO flow - happy path
    Tool: Bash (Jest)
    Preconditions: All modules integrated
    Steps:
      1. Send chat: "I'm frustrated with this task"
      2. Check emotion detected: frustration (confidence >0.7)
      3. Check Social Awareness updated
      4. Check Cognitive Controller synthesizes decision
      5. Check Commander writes coherent command
      6. Check knowledge graph stores interaction
    Expected Result: Full flow works end-to-end
    Failure Indicators: Any step fails, data not propagated
    Evidence: .sisyphus/evidence/task-15-integration-happy.txt

  Scenario: Coherence conflict resolution
    Tool: Bash (Jest)
    Preconditions: All modules integrated
    Steps:
      1. Set up conflict: goal="attack", emotion="friendly"
      2. Trigger Commander loop
      3. Check Cognitive Controller detects conflict
      4. Check conflict resolved (goal deferred or adjusted)
      5. Check coherent command written
    Expected Result: Conflict detected and resolved
    Failure Indicators: Incoherent command, no conflict detection
    Evidence: .sisyphus/evidence/task-15-integration-conflict.txt
  ```

  **Commit**: YES
  - Message: `test(integration): add PIANO architecture integration tests`
  - Files: `tests/integration/piano-architecture.test.js`
  - Pre-commit: `npm test tests/integration/piano-architecture.test.js`

---

## Final Verification Wave

> 4 verification tasks run in PARALLEL after all implementation complete.
> Present consolidated results to user and get explicit "okay" before marking work complete.

- [x] F1. Run full test suite and verify no regressions

  **What to do**:
  - Run `npm test` (all unit + integration tests)
  - Run `npm run test:e2e` (end-to-end tests with Minecraft server)
  - Check all existing tests still pass
  - Check new tests pass (>70% coverage for new modules)
  - Generate coverage report
  - Document any test failures

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running existing test suite, straightforward verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave FINAL (with F2, F3, F4)
  - **Blocked By**: Task 15 (all integration tests must exist)

  **References**:
  - Test commands: `npm test`, `npm run test:e2e`, `npm run test:coverage`
  - Coverage target: >70% for new modules

  **Acceptance Criteria**:
  - [ ] All existing tests pass (0 failures)
  - [ ] All new tests pass
  - [ ] Coverage >70% for new modules
  - [ ] E2E tests pass (bot connects, survives, responds)

  **QA Scenarios**:
  ```
  Scenario: Full test suite execution
    Tool: Bash
    Preconditions: All code complete
    Steps:
      1. Run: npm test
      2. Check exit code = 0 (all pass)
      3. Run: npm run test:coverage
      4. Check coverage >70% for new modules
    Expected Result: All tests pass, coverage met
    Failure Indicators: Test failures, coverage <70%
    Evidence: .sisyphus/evidence/task-f1-test-results.txt
  ```

  **Commit**: NO (verification only)

- [x] F2. Performance validation (latency, memory)

  **What to do**:
  - Measure emotion detection latency (P99 must be <50ms)
  - Measure knowledge graph query latency (P99 must be <10ms)
  - Measure Pilot loop timing (must maintain 200-2000ms adaptive)
  - Check memory footprint (graph must be <100MB)
  - Run bot for 30 minutes, check for memory leaks
  - Document performance metrics

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Performance measurement, straightforward benchmarking
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave FINAL (with F1, F3, F4)
  - **Blocked By**: Task 15 (all code must be complete)

  **References**:
  - Performance targets: emotion <50ms, graph <10ms, Pilot 200-2000ms
  - Memory target: graph <100MB
  - Metis findings: latency budgets for each component

  **Acceptance Criteria**:
  - [ ] Emotion detection P99 <50ms
  - [ ] Graph query P99 <10ms
  - [ ] Pilot loop maintains adaptive timing
  - [ ] Memory footprint <100MB for graph
  - [ ] No memory leaks after 30 min

  **QA Scenarios**:
  ```
  Scenario: Emotion detection latency
    Tool: Bash (Node.js script)
    Preconditions: Bot running
    Steps:
      1. Send 1000 chat messages
      2. Measure emotion detection time for each
      3. Calculate P99 latency
      4. Assert P99 <50ms
    Expected Result: P99 <50ms
    Failure Indicators: P99 >50ms, crashes, timeouts
    Evidence: .sisyphus/evidence/task-f2-emotion-latency.txt

  Scenario: Memory leak detection
    Tool: Bash (Node.js with --expose-gc)
    Preconditions: Bot running
    Steps:
      1. Start bot, record initial memory
      2. Run for 30 minutes (simulate gameplay)
      3. Force GC, record final memory
      4. Assert memory increase <50MB
    Expected Result: No significant memory growth
    Failure Indicators: Memory grows >50MB, OOM crash
    Evidence: .sisyphus/evidence/task-f2-memory-leak.txt
  ```

  **Commit**: NO (verification only)

- [x] F3. Manual QA with real Minecraft server

  **What to do**:
  - Start Minecraft server (`npm run mc:start`)
  - Start bot (`node src/index.js`)
  - Test emotion detection: send frustrated message, check response
  - Test Social Awareness: interact multiple times, check sentiment tracking
  - Test knowledge graph: visit locations, check memory storage
  - Test coherence: give conflicting commands, check resolution
  - Test existing features: mining, building, combat (no regressions)
  - Document findings

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Manual testing, requires judgment and exploration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave FINAL (with F1, F2, F4)
  - **Blocked By**: Task 15 (all code must be complete)

  **References**:
  - Minecraft server: Docker container (npm run mc:start)
  - Bot startup: `node src/index.js`
  - Test scenarios: emotion, social, graph, coherence, existing features

  **Acceptance Criteria**:
  - [ ] Bot connects to server successfully
  - [ ] Emotion detection works in real chat
  - [ ] Social Awareness tracks sentiment correctly
  - [ ] Knowledge graph stores interactions
  - [ ] Coherence prevents conflicts
  - [ ] Existing features work (no regressions)

  **QA Scenarios**:
  ```
  Scenario: Real-world emotion detection
    Tool: Minecraft client + chat
    Preconditions: Bot connected to server
    Steps:
      1. Send chat: "I'm so frustrated!"
      2. Observe bot response (should be empathetic)
      3. Check logs: emotion="frustration" detected
      4. Send chat: "This is great!"
      5. Observe bot response (should be positive)
    Expected Result: Bot responds appropriately to emotions
    Failure Indicators: Wrong emotion detected, inappropriate response
    Evidence: .sisyphus/evidence/task-f3-real-emotion.txt

  Scenario: Coherence in real gameplay
    Tool: Minecraft client + chat
    Preconditions: Bot mining
    Steps:
      1. Bot is mining wood
      2. Send chat: "Come here now!"
      3. Observe bot behavior (should detect urgency, stop mining)
      4. Send chat: "What's the weather?"
      5. Observe bot behavior (should respond while continuing task)
    Expected Result: Bot handles urgency correctly
    Failure Indicators: Ignores urgent command, stops for casual chat
    Evidence: .sisyphus/evidence/task-f3-real-coherence.txt
  ```

  **Commit**: NO (verification only)

- [x] F4. Code review and documentation

  **What to do**:
  - Review all new code for quality, readability
  - Check for AI slop patterns (excessive comments, over-abstraction)
  - Verify all modules have JSDoc comments
  - Update AGENTS.md with new architecture
  - Update README.md with new features
  - Create architecture diagram (optional)
  - Document any known issues or limitations

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Code review and documentation, straightforward
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave FINAL (with F1, F2, F3)
  - **Blocked By**: Task 15 (all code must be complete)

  **References**:
  - AI slop patterns: excessive comments, generic names, over-abstraction
  - Documentation files: AGENTS.md, README.md
  - New modules: cognitive-controller, emotion-detector, social-awareness, knowledge-graph

  **Acceptance Criteria**:
  - [ ] No AI slop patterns found
  - [ ] All modules have JSDoc comments
  - [ ] AGENTS.md updated with new architecture
  - [ ] README.md updated with new features
  - [ ] Known issues documented

  **QA Scenarios**:
  ```
  Scenario: AI slop detection
    Tool: Grep + manual review
    Preconditions: All code complete
    Steps:
      1. Search for excessive comments (>50% comment lines)
      2. Search for generic names (data, result, item, temp)
      3. Search for over-abstraction (single-use utilities)
      4. Review findings, refactor if needed
    Expected Result: No AI slop patterns
    Failure Indicators: Excessive comments, generic names, over-abstraction
    Evidence: .sisyphus/evidence/task-f4-code-review.txt

  Scenario: Documentation completeness
    Tool: Read (manual review)
    Preconditions: Documentation updated
    Steps:
      1. Read AGENTS.md, check new architecture documented
      2. Read README.md, check new features listed
      3. Check all new modules have JSDoc
      4. Verify examples are accurate
    Expected Result: Documentation complete and accurate
    Failure Indicators: Missing sections, outdated info, no JSDoc
    Evidence: .sisyphus/evidence/task-f4-documentation.txt
  ```

  **Commit**: YES
  - Message: `docs: update AGENTS.md and README.md with PIANO architecture`
  - Files: `AGENTS.md`, `README.md`
  - Pre-commit: None (documentation only)

---

## Commit Strategy

- **Wave 1**: 1 commit (Task 4 - memory mapping documentation)
- **Wave 1**: 1 commit (Task 5 - Cognitive Controller skeleton)
- **Wave 2**: 1 commit per task (Tasks 6-10: 5 commits)
- **Wave 3**: 1 commit per task (Tasks 11-15: 5 commits)
- **Wave FINAL**: 1 commit (Task F4 - documentation)

**Total commits**: 13

**Commit message format**: `type(scope): description`
- Types: feat, test, docs
- Scopes: layers, emotion, social, memory, chat, integration

---

## Success Criteria

### Verification Commands
```bash
# All tests pass
npm test
npm run test:e2e

# Performance validation
node scripts/measure-latency.js  # Expected: emotion <50ms, graph <10ms

# Memory check
node --expose-gc src/index.js  # Expected: <100MB graph, no leaks

# Coverage check
npm run test:coverage  # Expected: >70% for new modules
```

### Final Checklist
- [ ] All "Must Have" features implemented
- [ ] All "Must NOT Have" guardrails enforced
- [ ] All tests pass (unit, integration, e2e)
- [ ] Performance targets met (latency, memory)
- [ ] No regressions in existing functionality
- [ ] Documentation updated (AGENTS.md, README.md)
- [ ] Code reviewed (no AI slop)
- [ ] User explicitly approves final verification results
