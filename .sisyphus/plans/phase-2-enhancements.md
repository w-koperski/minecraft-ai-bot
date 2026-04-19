# Phase 2 Enhancements: Autonomy, UX, Capabilities, Research

## TL;DR

> **Quick Summary**: Add 6 major features across 3 phases to transform the Minecraft AI bot into a fully autonomous, observable, and intelligent companion with visual perception, advanced navigation, meta-learning, and natural conversation.
> 
> **Deliverables**:
> - Phase 1: Internal Drives System + Web Dashboard (autonomous goal generation + real-time monitoring)
> - Phase 2: Visual Perception + Advanced Pathfinding (screenshot analysis + water/nether/parkour navigation)
> - Phase 3: Meta-Learning + Natural Conversation (strategy learning + personality-driven dialogue)
> 
> **Estimated Effort**: Large (66-82h including infrastructure)
> **Parallel Execution**: YES - 4 waves per phase, infrastructure wave first
> **Critical Path**: Infrastructure → Phase 1 → Phase 2 → Phase 3

---

## Context

### Original Request
User wants to enhance the Minecraft AI bot with:
- **Autonomy**: Internal drives for self-directed behavior
- **User Experience**: Web dashboard for monitoring and control
- **Capabilities**: Visual perception and advanced pathfinding
- **Research**: Meta-learning and natural conversation

### Interview Summary
**Key Discussions**:
- User selected all 4 enhancement categories (autonomy, UX, capabilities, research)
- Preferences: React for dashboard, custom OpenAI-compatible endpoints for vision, pragmatic 50-60% test coverage
- Integrated approach: Features work together (dashboard shows drives, vision guides pathfinding, meta-learning improves conversation)

**Research Findings**:
- **Explore agent**: Mapped codebase architecture, identified integration points (GoalGenerator, StateManager, KnowledgeGraph, CognitiveController)
- **Librarian agent**: Researched best practices (BDI architecture, Next.js dashboards, GPT-4o vision, mineflayer-pathfinder, ALMA meta-learning, PersonaPlex conversation)
- **Metis review**: Identified 6 critical risks, 4 architecture corrections, 15 guardrails

### Metis Review
**Identified Gaps** (addressed):
- Rate limit starvation from vision + drives → Separate rate limiter for vision (20 RPM)
- Dashboard crash coupling → Separate process with crash isolation
- KnowledgeGraph has no persistence → Add save()/load() methods before Phase 3
- GoalGenerator too thin → Create separate DriveSystem class
- Pilot loop timing incompatible with vision latency → Async vision processing
- Conversation context conflicts → Enhance existing summarization, don't duplicate

---

## Work Objectives

### Core Objective
Transform the Minecraft AI bot from command-driven to fully autonomous with visual perception, advanced navigation, learning capabilities, and natural conversation - while maintaining stability, observability, and backward compatibility.

### Concrete Deliverables
- `src/utils/feature-flags.js` - Centralized feature flag management
- `src/memory/knowledge-graph.js` - Persistence methods (save/load)
- `src/drives/drive-system.js` - 5-drive autonomous goal generation
- `src/dashboard/server.js` - Next.js dashboard (separate process)
- `src/dashboard/broadcaster.js` - WebSocket state broadcaster
- `src/vision/vision-processor.js` - Async screenshot analysis
- `src/pathfinding/water-pathfinder.js` - Water navigation
- `src/pathfinding/nether-pathfinder.js` - Nether pathfinding
- `src/pathfinding/parkour-handler.js` - Parkour movements
- `src/learning/strategy-memory.js` - Meta-learning storage/retrieval
- `src/conversation/context-tracker.js` - Enhanced conversation context

### Definition of Done
- [ ] All 6 features implemented with feature flags (default: false)
- [ ] Dashboard accessible at http://localhost:3001 showing real-time bot state
- [ ] Bot generates autonomous goals when idle (drives active)
- [ ] Vision screenshots analyzed and fed to Pilot layer (non-blocking)
- [ ] Bot navigates water, nether, and parkour obstacles
- [ ] Strategies stored and retrieved based on similarity
- [ ] Conversations include context from past interactions
- [ ] All tests passing (70% coverage for critical paths, 50% for UI)
- [ ] Bot runs identically with all features disabled (backward compatibility)

### Must Have
- Feature flags for all 6 features (ENABLE_DRIVES, ENABLE_DASHBOARD, ENABLE_VISION, ENABLE_ADVANCED_PATHFINDING, ENABLE_META_LEARNING, ENABLE_CONVERSATION_CONTEXT)
- Separate rate limiter for vision (VISION_RPM_BUDGET=20)
- Dashboard as separate process (crash isolation)
- KnowledgeGraph persistence before meta-learning
- DriveSystem feeds into GoalScorer (no GoalGenerator API changes)
- Vision async and non-blocking to Pilot loop
- Enhance existing conversation summarization (no parallel system)

### Must NOT Have (Guardrails)
- Breaking changes to existing features
- Dashboard remote control in Phase 1 (READ-ONLY only)
- Persistent drive state or drive learning (stateless scoring functions)
- Video streaming or visual memory in KG (screenshots only)
- Online learning or gradient computation (memory storage + retrieval only)
- Fork mineflayer-pathfinder (use public API only)
- Parallel conversation summarization system
- Feature flags defaulting to true (all default: false)
- Dashboard in same process as Mineflayer
- Vision blocking Pilot loop
- GoalGenerator constructor signature changes

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (Jest, 70% coverage target)
- **Automated tests**: Tests-after (implement feature, then test)
- **Framework**: Jest (existing)
- **Coverage**: 70% for critical paths (rate limiter, drives, vision, meta-learning), 50% for UI/dashboard

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend/API**: Use Bash (curl) - Send requests, assert status + response fields
- **WebSocket**: Use Bash (wscat) - Connect, receive messages, validate JSON
- **Feature isolation**: Use Bash (npm test) - Run with feature disabled, verify identical behavior
- **Integration**: Use Bash (npm run test:integration) - Verify layer communication

---

## Execution Strategy

### Parallel Execution Waves

> Maximize throughput by grouping independent tasks into parallel waves.
> Infrastructure first, then features in dependency order.

```
Wave 0 (Infrastructure - MUST complete before all phases):
├── Task 1: FeatureFlags module [quick]
├── Task 2: KnowledgeGraph persistence [quick]
├── Task 3: Dashboard broadcaster [quick]
└── Task 4: Vision rate limiter [quick]

Phase 1 - Wave 1 (Drive System Foundation):
├── Task 5: DriveSystem class [unspecified-high]
├── Task 6: Drive scoring functions [unspecified-high]
├── Task 7: GoalScorer integration [quick]
└── Task 8: Drive state tracking [quick]

Phase 1 - Wave 2 (Dashboard Backend):
├── Task 9: Express server setup [quick]
├── Task 10: WebSocket endpoints [unspecified-high]
├── Task 11: State API endpoints [quick]
└── Task 12: Dashboard process launcher [quick]

Phase 1 - Wave 3 (Dashboard Frontend):
├── Task 13: Next.js project setup [quick]
├── Task 14: Real-time state display [visual-engineering]
├── Task 15: Drive visualization [visual-engineering]
└── Task 16: Memory graph viewer [visual-engineering]

Phase 1 - Wave 4 (Integration + Testing):
├── Task 17: Drive-dashboard integration [unspecified-high]
├── Task 18: Feature flag isolation tests [quick]
├── Task 19: Rate limit verification [quick]
└── Task 20: Dashboard crash test [quick]

Phase 2 - Wave 1 (Vision Foundation):
├── Task 21: VisionProcessor class [unspecified-high]
├── Task 22: Screenshot capture [unspecified-high]
├── Task 23: Custom endpoint support [quick]
└── Task 24: VisionState object [quick]

Phase 2 - Wave 2 (Vision Integration):
├── Task 25: Pilot vision integration [deep]
├── Task 26: Vision prompt templates [quick]
├── Task 27: Vision caching strategy [quick]
└── Task 28: Dashboard vision display [visual-engineering]

Phase 2 - Wave 3 (Advanced Pathfinding):
├── Task 29: Water pathfinding [unspecified-high]
├── Task 30: Nether pathfinding [unspecified-high]
├── Task 31: Parkour handler [unspecified-high]
└── Task 32: Safety checks [quick]

Phase 2 - Wave 4 (Integration + Testing):
├── Task 33: Vision-guided navigation [deep]
├── Task 34: Pathfinding integration tests [unspecified-high]
├── Task 35: Vision rate limit tests [quick]
└── Task 36: Feature isolation tests [quick]

Phase 3 - Wave 1 (Meta-Learning Foundation):
├── Task 37: Strategy memory schema [quick]
├── Task 38: Embedding-based retrieval [unspecified-high]
├── Task 39: Similarity scoring [quick]
└── Task 40: Strategy storage [quick]

Phase 3 - Wave 2 (Meta-Learning Integration):
├── Task 41: ReflectionModule integration [deep]
├── Task 42: Strategy application logic [unspecified-high]
├── Task 43: Learning metrics [quick]
└── Task 44: Dashboard learning display [visual-engineering]

Phase 3 - Wave 3 (Natural Conversation):
├── Task 45: Context tracker [unspecified-high]
├── Task 46: Enhanced summarization [unspecified-high]
├── Task 47: Personality-driven responses [quick]
└── Task 48: Fallback responses [quick]

Phase 3 - Wave 4 (Integration + Testing):
├── Task 49: Conversation-learning integration [deep]
├── Task 50: End-to-end conversation tests [unspecified-high]
├── Task 51: Meta-learning persistence tests [quick]
└── Task 52: Feature isolation tests [quick]

Wave FINAL (After ALL tasks - 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1-4 → Task 5-8 → Task 9-12 → Task 13-16 → Task 17-20 → Task 21-24 → Task 25-28 → Task 29-32 → Task 33-36 → Task 37-40 → Task 41-44 → Task 45-48 → Task 49-52 → F1-F4 → user okay
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (most waves)
```

### Dependency Matrix

**Wave 0 (Infrastructure):**
- 1-4: - → 5-52 (all features depend on infrastructure)

**Phase 1:**
- 5-8: 1 → 17, 1
- 9-12: 2, 3 → 13-16, 17, 2
- 13-16: 9-12 → 17, 3
- 17-20: 5-16 → 21-52, 4

**Phase 2:**
- 21-24: 1, 4 → 25-28, 1
- 25-28: 21-24 → 33, 2
- 29-32: 1 → 33, 3
- 33-36: 25-32 → 37-52, 4

**Phase 3:**
- 37-40: 2 → 41-44, 1
- 41-44: 37-40 → 49, 2
- 45-48: 1 → 49, 3
- 49-52: 41-48 → F1-F4, 4

**Final:**
- F1-F4: 1-52 → user okay

### Agent Dispatch Summary

- **Wave 0**: 4 tasks → `quick` (all infrastructure)
- **Phase 1 Wave 1**: 4 tasks → `unspecified-high` (2), `quick` (2)
- **Phase 1 Wave 2**: 4 tasks → `unspecified-high` (1), `quick` (3)
- **Phase 1 Wave 3**: 4 tasks → `visual-engineering` (3), `quick` (1)
- **Phase 1 Wave 4**: 4 tasks → `unspecified-high` (1), `quick` (3)
- **Phase 2 Wave 1**: 4 tasks → `unspecified-high` (2), `quick` (2)
- **Phase 2 Wave 2**: 4 tasks → `deep` (1), `visual-engineering` (1), `quick` (2)
- **Phase 2 Wave 3**: 4 tasks → `unspecified-high` (3), `quick` (1)
- **Phase 2 Wave 4**: 4 tasks → `deep` (1), `unspecified-high` (1), `quick` (2)
- **Phase 3 Wave 1**: 4 tasks → `unspecified-high` (1), `quick` (3)
- **Phase 3 Wave 2**: 4 tasks → `deep` (1), `unspecified-high` (1), `visual-engineering` (1), `quick` (1)
- **Phase 3 Wave 3**: 4 tasks → `unspecified-high` (2), `quick` (2)
- **Phase 3 Wave 4**: 4 tasks → `deep` (1), `unspecified-high` (1), `quick` (2)
- **Final**: 4 tasks → `oracle` (1), `unspecified-high` (2), `deep` (1)

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

---

### Wave 0: Infrastructure (MUST complete before all phases)

- [x] 1. FeatureFlags Module

  **What to do**:
  - Create `src/utils/feature-flags.js` with FeatureFlags class
  - Read all `ENABLE_*` env vars, validate interdependencies
  - Provide `isEnabled(featureName)` method
  - Add validation: warn if conflicting flags (e.g., ENABLE_META_LEARNING=true but ENABLE_DRIVES=false)
  - Export singleton instance

  **Must NOT do**:
  - Don't create complex dependency resolution - simple boolean checks only
  - Don't add runtime flag toggling - env vars are read once at startup

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple utility module, clear requirements, no complex logic
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 5-52 (all features depend on this)
  - **Blocked By**: None (can start immediately)

  **References**:
  - `src/utils/state-manager.js` - Similar utility module pattern
  - `.env.example` - All existing ENABLE_* flags to support
  - `src/index.js:226+` - Where feature flags are currently checked (process.env.ENABLE_* pattern)

  **Acceptance Criteria**:
  - [ ] File created: src/utils/feature-flags.js
  - [ ] `node -e "const ff = require('./src/utils/feature-flags'); console.log(ff.isEnabled('DRIVES'))"` → false (default)
  - [ ] `ENABLE_DRIVES=true node -e "const ff = require('./src/utils/feature-flags'); console.log(ff.isEnabled('DRIVES'))"` → true

  **QA Scenarios**:
  ```
  Scenario: Feature flag defaults to false
    Tool: Bash (node)
    Preconditions: No ENABLE_* env vars set
    Steps:
      1. node -e "const ff = require('./src/utils/feature-flags'); console.log(ff.isEnabled('DRIVES'))"
      2. Assert output is "false"
    Expected Result: All new features disabled by default
    Evidence: .sisyphus/evidence/task-1-default-false.txt

  Scenario: Feature flag reads from env var
    Tool: Bash (node)
    Preconditions: ENABLE_DRIVES=true set
    Steps:
      1. ENABLE_DRIVES=true node -e "const ff = require('./src/utils/feature-flags'); console.log(ff.isEnabled('DRIVES'))"
      2. Assert output is "true"
    Expected Result: Feature enabled when env var is true
    Evidence: .sisyphus/evidence/task-1-env-true.txt
  ```

  **Evidence to Capture**:
  - [ ] task-1-default-false.txt (feature disabled by default)
  - [ ] task-1-env-true.txt (feature enabled via env var)

  **Commit**: YES
  - Message: `feat(utils): add FeatureFlags module for centralized flag management`
  - Files: `src/utils/feature-flags.js`, `tests/unit/utils/feature-flags.test.js`
  - Pre-commit: `npm run test:unit -- --testPathPattern=feature-flags`

---

- [x] 2. KnowledgeGraph Persistence

  **What to do**:
  - Add `save()` method to `src/memory/knowledge-graph.js` - serialize graph to JSON
  - Add `load()` method - deserialize from JSON, restore nodes and edges
  - Save to `state/knowledge-graph.json`
  - Add auto-save on consolidation (if ENABLE_AUTO_CONSOLIDATION=true)
  - Handle file not found gracefully (empty graph on first load)

  **Must NOT do**:
  - Don't change existing graph API (addEntity, addRelation, etc.)
  - Don't add versioning or migration logic (simple JSON for now)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward serialization, existing graph structure is clear
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 (with Tasks 1, 3, 4)
  - **Blocks**: Tasks 37-44 (meta-learning depends on persistence)
  - **Blocked By**: None (can start immediately)

  **References**:
  - `src/memory/knowledge-graph.js:1-200` - Existing KnowledgeGraph class
  - `src/utils/state-manager.js` - File I/O pattern with error handling
  - `src/memory/conversation-store.js:50-80` - SQLite persistence pattern (different but similar concept)

  **Acceptance Criteria**:
  - [ ] Methods added: save(), load()
  - [ ] `node -e "const kg = new (require('./src/memory/knowledge-graph')); kg.addEntity('test', 'test_type'); kg.save(); const kg2 = new (require('./src/memory/knowledge-graph')); kg2.load(); console.log(kg2.getEntity('test').type)"` → "test_type"
  - [ ] File created: state/knowledge-graph.json after save()

  **QA Scenarios**:
  ```
  Scenario: Save and load graph preserves data
    Tool: Bash (node)
    Preconditions: Empty state directory
    Steps:
      1. Create KnowledgeGraph, add entity 'test' with type 'test_type'
      2. Call save()
      3. Create new KnowledgeGraph instance, call load()
      4. Assert getEntity('test').type === 'test_type'
    Expected Result: Graph data persists across instances
    Evidence: .sisyphus/evidence/task-2-save-load.txt

  Scenario: Load handles missing file gracefully
    Tool: Bash (node)
    Preconditions: No state/knowledge-graph.json file
    Steps:
      1. Create KnowledgeGraph, call load()
      2. Assert no error thrown
      3. Assert graph is empty (no entities)
    Expected Result: Empty graph on first load, no crash
    Evidence: .sisyphus/evidence/task-2-missing-file.txt
  ```

  **Evidence to Capture**:
  - [ ] task-2-save-load.txt (persistence works)
  - [ ] task-2-missing-file.txt (graceful handling)

  **Commit**: YES
  - Message: `feat(memory): add save/load persistence to KnowledgeGraph`
  - Files: `src/memory/knowledge-graph.js`, `tests/unit/memory/knowledge-graph.test.js`
  - Pre-commit: `npm run test:unit -- --testPathPattern=knowledge-graph`

---

- [x] 3. Dashboard WebSocket Broadcaster

  **What to do**:
  - Create `src/dashboard/broadcaster.js` with WebSocketBroadcaster class
  - Subscribe to StateManager changes (add event emitter to StateManager if needed)
  - Broadcast state changes to all connected WebSocket clients
  - Handle client connect/disconnect
  - Throttle broadcasts (max 10/second to prevent flooding)

  **Must NOT do**:
  - Don't create HTTP server here (that's Task 9)
  - Don't add authentication (Phase 1 is local-only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard WebSocket pattern, clear requirements
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 (with Tasks 1, 2, 4)
  - **Blocks**: Tasks 9-12 (dashboard backend depends on broadcaster)
  - **Blocked By**: None (can start immediately)

  **References**:
  - `src/utils/state-manager.js` - State reading pattern
  - Research: relay-dashboard WebSocket pattern (from librarian findings)
  - Node.js ws library documentation

  **Acceptance Criteria**:
  - [ ] File created: src/dashboard/broadcaster.js
  - [ ] Class exports: WebSocketBroadcaster with broadcast(data) method
  - [ ] Throttling: Max 10 broadcasts per second

  **QA Scenarios**:
  ```
  Scenario: Broadcaster sends state to connected clients
    Tool: Bash (wscat + node)
    Preconditions: Broadcaster running, 1 client connected
    Steps:
      1. Start broadcaster with mock WebSocket server
      2. Connect wscat client
      3. Trigger state change
      4. Assert client receives JSON message within 1s
    Expected Result: State changes broadcast to clients
    Evidence: .sisyphus/evidence/task-3-broadcast.txt

  Scenario: Throttling prevents flooding
    Tool: Bash (node)
    Preconditions: Broadcaster running
    Steps:
      1. Trigger 100 state changes in 1 second
      2. Count broadcasts sent
      3. Assert count <= 10
    Expected Result: Max 10 broadcasts per second
    Evidence: .sisyphus/evidence/task-3-throttle.txt
  ```

  **Evidence to Capture**:
  - [ ] task-3-broadcast.txt (broadcasting works)
  - [ ] task-3-throttle.txt (throttling works)

  **Commit**: YES
  - Message: `feat(dashboard): add WebSocket broadcaster for state changes`
  - Files: `src/dashboard/broadcaster.js`, `tests/unit/dashboard/broadcaster.test.js`
  - Pre-commit: `npm run test:unit -- --testPathPattern=broadcaster`

---

- [x] 4. Vision Rate Limiter

  **What to do**:
  - Create `src/vision/vision-rate-limiter.js` with separate Bottleneck instance
  - Default: 20 RPM (configurable via VISION_RPM_BUDGET env var)
  - Export singleton instance
  - Add logging when rate limit hit

  **Must NOT do**:
  - Don't modify existing rate-limiter.js (keep separate)
  - Don't add complex scheduling logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Copy existing rate-limiter pattern, change config
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 (with Tasks 1, 2, 3)
  - **Blocks**: Tasks 21-28 (vision features depend on rate limiter)
  - **Blocked By**: None (can start immediately)

  **References**:
  - `src/utils/rate-limiter.js` - Existing rate limiter pattern to copy
  - `package.json` - bottleneck library already installed

  **Acceptance Criteria**:
  - [ ] File created: src/vision/vision-rate-limiter.js
  - [ ] Default: 20 RPM
  - [ ] `VISION_RPM_BUDGET=10 node -e "const vrl = require('./src/vision/vision-rate-limiter'); console.log(vrl.reservoir)"` → 10

  **QA Scenarios**:
  ```
  Scenario: Rate limiter enforces 20 RPM default
    Tool: Bash (node)
    Preconditions: No VISION_RPM_BUDGET env var
    Steps:
      1. Load vision-rate-limiter
      2. Schedule 30 tasks
      3. Measure time to complete all tasks
      4. Assert time >= 90 seconds (30 tasks / 20 per minute)
    Expected Result: Rate limited to 20 RPM
    Evidence: .sisyphus/evidence/task-4-rate-limit.txt

  Scenario: Custom RPM budget via env var
    Tool: Bash (node)
    Preconditions: VISION_RPM_BUDGET=10
    Steps:
      1. VISION_RPM_BUDGET=10 node -e "const vrl = require('./src/vision/vision-rate-limiter'); console.log(vrl.reservoir)"
      2. Assert output is 10
    Expected Result: Custom budget applied
    Evidence: .sisyphus/evidence/task-4-custom-budget.txt
  ```

  **Evidence to Capture**:
  - [ ] task-4-rate-limit.txt (rate limiting works)
  - [ ] task-4-custom-budget.txt (custom budget works)

  **Commit**: YES
  - Message: `feat(vision): add dedicated rate limiter for vision API calls`
  - Files: `src/vision/vision-rate-limiter.js`, `tests/unit/vision/vision-rate-limiter.test.js`
  - Pre-commit: `npm run test:unit -- --testPathPattern=vision-rate-limiter`

---

### Phase 1 - Wave 1: Drive System Foundation

- [x] 5. DriveSystem Class

  **What to do**:
  - Create `src/drives/drive-system.js` with DriveSystem class
  - Constructor takes personality traits (from personality-engine.js)
  - Implement `computeDriveScores(context)` method returning {survival, curiosity, competence, social, goalOriented} scores (0-100)
  - Each drive is a stateless scoring function based on context (health, inventory, recent events, player proximity)
  - Export singleton instance

  **Must NOT do**:
  - Don't add persistent drive state (drives are stateless)
  - Don't add drive learning or adaptation (fixed scoring functions)
  - Don't call LLMs (rule-based scoring only)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires understanding BDI architecture and personality system integration
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Phase 1 Wave 1 (with Tasks 6, 7, 8)
  - **Blocks**: Tasks 17 (drive-dashboard integration)
  - **Blocked By**: Task 1 (FeatureFlags)

  **References**:
  - `personality/personality-engine.js` - Personality traits to use (root-level personality/ directory)
  - `src/goals/goal-scorer.js` - Similar scoring pattern
  - Librarian research: BDI architecture, 5 core drives (Survival, Curiosity, Competence, Social, Goal-oriented)
  - Metis directive: Drives are stateless scoring functions

  **Acceptance Criteria**:
  - [ ] File created: src/drives/drive-system.js
  - [ ] `node -e "const ds = new (require('./src/drives/drive-system'))({warmth: 0.8}); console.log(ds.computeDriveScores({health: 5}).survival > 50)"` → true (low health = high survival drive)

  **QA Scenarios**:
  ```
  Scenario: Low health increases survival drive
    Tool: Bash (node)
    Preconditions: DriveSystem initialized with default personality
    Steps:
      1. Call computeDriveScores({health: 5, food: 10, inventory: []})
      2. Assert survival score > 70
    Expected Result: Survival drive dominates when health is low
    Evidence: .sisyphus/evidence/task-5-low-health.txt

  Scenario: High curiosity trait increases exploration drive
    Tool: Bash (node)
    Preconditions: DriveSystem initialized with {curiosity: 0.9}
    Steps:
      1. Call computeDriveScores({health: 20, unexploredBiomes: 5})
      2. Assert curiosity score > 60
    Expected Result: Curiosity drive high when personality trait is high
    Evidence: .sisyphus/evidence/task-5-high-curiosity.txt
  ```

  **Evidence to Capture**:
  - [ ] task-5-low-health.txt (survival drive works)
  - [ ] task-5-high-curiosity.txt (curiosity drive works)

  **Commit**: YES
  - Message: `feat(drives): add DriveSystem with 5 core drives`
  - Files: `src/drives/drive-system.js`, `tests/unit/drives/drive-system.test.js`
  - Pre-commit: `npm run test:unit -- --testPathPattern=drive-system`

---

- [x] 6. Drive Scoring Functions

  **What to do**:
  - Implement 5 drive scoring functions in `src/drives/drive-system.js`:
    - `scoreSurvival(context)` - health, food, nearby threats
    - `scoreCuriosity(context)` - unexplored areas, new biomes, personality.curiosity
    - `scoreCompetence(context)` - skill progression, recent failures, personality.bravery
    - `scoreSocial(context)` - player proximity, recent interactions, personality.warmth
    - `scoreGoalOriented(context)` - active goals, personality.loyalty
  - Each returns 0-100 score
  - Weight by personality traits (0.0-1.0 scale)

  **Must NOT do**:
  - Don't add complex AI logic (simple weighted formulas)
  - Don't call external APIs

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires balancing multiple factors, understanding game context
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Phase 1 Wave 1 (with Tasks 5, 7, 8)
  - **Blocks**: Tasks 17 (drive-dashboard integration)
  - **Blocked By**: Task 1 (FeatureFlags)

  **References**:
  - `src/goals/goal-scorer.js:20-80` - Multi-factor scoring pattern
  - `personality/personality-engine.js` - Personality trait values (root-level personality/ directory)
  - Librarian research: BDI drive theory, intrinsic motivation

  **Acceptance Criteria**:
  - [ ] All 5 scoring functions implemented
  - [ ] Each function returns 0-100
  - [ ] Personality traits influence scores (test with different trait values)

  **QA Scenarios**:
  ```
  Scenario: Survival drive responds to multiple threats
    Tool: Bash (node)
    Preconditions: DriveSystem initialized
    Steps:
      1. Call scoreSurvival({health: 10, food: 5, nearbyMobs: 3})
      2. Assert score > 80 (multiple survival threats)
    Expected Result: Survival score increases with combined threats
    Evidence: .sisyphus/evidence/task-6-survival-threats.txt

  Scenario: Social drive responds to player proximity
    Tool: Bash (node)
    Preconditions: DriveSystem with {warmth: 0.9, loyalty: 0.8}
    Steps:
      1. Call scoreSocial({nearbyPlayers: 2, recentInteractions: 5})
      2. Assert score > 60
    Expected Result: Social drive high when players nearby and personality is warm
    Evidence: .sisyphus/evidence/task-6-social-proximity.txt
  ```

  **Evidence to Capture**:
  - [ ] task-6-survival-threats.txt (survival scoring works)
  - [ ] task-6-social-proximity.txt (social scoring works)

  **Commit**: NO (groups with Task 5)

---

- [x] 7. GoalScorer Integration

  **What to do**:
  - Modify `src/goals/goal-scorer.js` to accept drive scores in context parameter
  - Add drive influence to existing scoring (personality 30%, needs 25%, events 25%, drives 20%)
  - If drive scores present, weight goal score by matching drive (e.g., exploration goal gets curiosity drive bonus)
  - Maintain backward compatibility (works without drive scores)

  **Must NOT do**:
  - Don't change GoalScorer constructor signature
  - Don't break existing goal scoring when drives disabled

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small modification to existing code, clear integration point
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Phase 1 Wave 1 (with Tasks 5, 6, 8)
  - **Blocks**: Tasks 17 (drive-dashboard integration)
  - **Blocked By**: Task 1 (FeatureFlags)

  **References**:
  - `src/goals/goal-scorer.js:30-60` - Existing scoreGoal() method
  - Metis directive: Drives inject via context parameter, no constructor changes

  **Acceptance Criteria**:
  - [ ] scoreGoal() accepts driveScores in context
  - [ ] Goal score influenced by matching drive (exploration goal + high curiosity = higher score)
  - [ ] Backward compatible: `goalScorer.scoreGoal(goal, {})` works without drives

  **QA Scenarios**:
  ```
  Scenario: Drive scores influence goal ranking
    Tool: Bash (node)
    Preconditions: GoalScorer initialized, 2 goals (explore, gather)
    Steps:
      1. Score both goals with driveScores: {curiosity: 90, survival: 30}
      2. Assert explore goal score > gather goal score
    Expected Result: High curiosity drive boosts exploration goals
    Evidence: .sisyphus/evidence/task-7-drive-influence.txt

  Scenario: Backward compatibility without drives
    Tool: Bash (node)
    Preconditions: GoalScorer initialized
    Steps:
      1. Call scoreGoal(goal, {}) without driveScores
      2. Assert no error, score returned
    Expected Result: Works without drive scores
    Evidence: .sisyphus/evidence/task-7-backward-compat.txt
  ```

  **Evidence to Capture**:
  - [ ] task-7-drive-influence.txt (drives influence scoring)
  - [ ] task-7-backward-compat.txt (backward compatible)

  **Commit**: YES
  - Message: `feat(goals): integrate drive scores into goal scoring`
  - Files: `src/goals/goal-scorer.js`, `tests/unit/goals/goal-scorer.test.js`
  - Pre-commit: `npm run test:unit -- --testPathPattern=goal-scorer`

---

- [x] 8. Drive State Tracking

  **What to do**:
  - Add drive scores to `state/state.json` schema in StateManager
  - Update state every time drives are computed
  - Add `getDriveScores()` method to StateManager
  - Log drive scores when they change significantly (>10 point change)

  **Must NOT do**:
  - Don't add drive history (current scores only)
  - Don't persist drives across restarts (computed fresh each time)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple state management extension
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Phase 1 Wave 1 (with Tasks 5, 6, 7)
  - **Blocks**: Tasks 17 (drive-dashboard integration)
  - **Blocked By**: Task 1 (FeatureFlags)

  **References**:
  - `src/utils/state-manager.js:40-80` - State schema and read/write methods
  - `state/state.json` - Current state structure

  **Acceptance Criteria**:
  - [ ] State schema includes driveScores field
  - [ ] getDriveScores() method added
  - [ ] Drive scores written to state/state.json

  **QA Scenarios**:
  ```
  Scenario: Drive scores saved to state
    Tool: Bash (node + cat)
    Preconditions: Bot running with drives enabled
    Steps:
      1. Compute drive scores
      2. Write to state
      3. cat state/state.json | jq '.driveScores'
      4. Assert driveScores object present with 5 drives
    Expected Result: Drive scores persisted in state file
    Evidence: .sisyphus/evidence/task-8-state-persist.txt

  Scenario: getDriveScores returns current scores
    Tool: Bash (node)
    Preconditions: Drive scores in state
    Steps:
      1. Call StateManager.getDriveScores()
      2. Assert returns object with survival, curiosity, competence, social, goalOriented
    Expected Result: Drive scores retrievable from state
    Evidence: .sisyphus/evidence/task-8-get-scores.txt
  ```

  **Evidence to Capture**:
  - [ ] task-8-state-persist.txt (state persistence works)
  - [ ] task-8-get-scores.txt (retrieval works)

  **Commit**: YES
  - Message: `feat(state): add drive scores to state tracking`
  - Files: `src/utils/state-manager.js`, `tests/unit/utils/state-manager.test.js`
  - Pre-commit: `npm run test:unit -- --testPathPattern=state-manager`

---

### Phase 1 - Wave 2: Dashboard Backend

- [x] 9. Express Server Setup

  **What to do**:
  - Create `src/dashboard/server.js` as separate process entry point
  - Set up Express server on port 3001 (configurable via DASHBOARD_PORT)
  - Add CORS middleware (allow localhost only)
  - Add basic routes: GET /api/status, GET /api/health
  - Integrate WebSocketBroadcaster from Task 3
  - Add graceful shutdown handler

  **Must NOT do**:
  - Don't run in same process as Mineflayer (separate entry point)
  - Don't add authentication (Phase 1 is local-only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard Express setup, well-documented pattern
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Phase 1 Wave 2 (with Tasks 10, 11, 12)
  - **Blocks**: Tasks 13-16 (frontend depends on backend)
  - **Blocked By**: Tasks 2, 3 (needs broadcaster)

  **References**:
  - `src/index.js` - Main entry point pattern to follow
  - Task 3 output: WebSocketBroadcaster class
  - Librarian research: Express + WebSocket pattern

  **Acceptance Criteria**:
  - [ ] File created: src/dashboard/server.js
  - [ ] `node src/dashboard/server.js` starts server on port 3001
  - [ ] `curl http://localhost:3001/api/health` → {"status": "ok"}

  **QA Scenarios**:
  ```
  Scenario: Server starts and responds to health check
    Tool: Bash (curl)
    Preconditions: Dashboard server not running
    Steps:
      1. node src/dashboard/server.js &
      2. sleep 2
      3. curl -s http://localhost:3001/api/health | jq '.status'
      4. Assert output is "ok"
      5. Kill server process
    Expected Result: Server starts and responds to health checks
    Evidence: .sisyphus/evidence/task-9-health-check.txt

  Scenario: Server runs independently of bot process
    Tool: Bash (ps)
    Preconditions: Dashboard server running
    Steps:
      1. node src/dashboard/server.js &
      2. ps aux | grep "dashboard/server.js" | grep -v grep
      3. Assert separate process exists
    Expected Result: Dashboard runs as separate process
    Evidence: .sisyphus/evidence/task-9-separate-process.txt
  ```

  **Evidence to Capture**:
  - [ ] task-9-health-check.txt (server responds)
  - [ ] task-9-separate-process.txt (separate process)

  **Commit**: YES
  - Message: `feat(dashboard): add Express server as separate process`
  - Files: `src/dashboard/server.js`, `package.json` (add express, ws, cors dependencies)
  - Pre-commit: `npm run test:unit -- --testPathPattern=dashboard`

---

- [x] 10. WebSocket Endpoints

  **What to do**:
  - Add WebSocket server to Express (ws library)
  - Endpoint: ws://localhost:3001/ws
  - On client connect: send current state immediately
  - Subscribe client to broadcaster from Task 3
  - Handle client disconnect gracefully
  - Add heartbeat/ping-pong to detect dead connections

  **Must NOT do**:
  - Don't add complex message routing (broadcast only for Phase 1)
  - Don't add client-to-server commands (READ-ONLY dashboard)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: WebSocket lifecycle management, connection handling
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Phase 1 Wave 2 (with Tasks 9, 11, 12)
  - **Blocks**: Tasks 13-16 (frontend depends on WebSocket)
  - **Blocked By**: Tasks 2, 3 (needs broadcaster)

  **References**:
  - Task 3 output: WebSocketBroadcaster class
  - Librarian research: WebSocket reconnection with exponential backoff
  - Node.js ws library documentation

  **Acceptance Criteria**:
  - [ ] WebSocket endpoint at ws://localhost:3001/ws
  - [ ] Client receives current state on connect
  - [ ] Client receives updates when state changes

  **QA Scenarios**:
  ```
  Scenario: Client receives state on connect
    Tool: Bash (wscat)
    Preconditions: Dashboard server running, bot state exists
    Steps:
      1. wscat -c ws://localhost:3001/ws
      2. Wait for first message
      3. Assert message is JSON with 'position', 'health', 'inventory' fields
    Expected Result: Current state sent immediately on connect
    Evidence: .sisyphus/evidence/task-10-connect-state.txt

  Scenario: Client receives state updates
    Tool: Bash (wscat + state change)
    Preconditions: Dashboard server running, wscat connected
    Steps:
      1. Connect wscat client
      2. Trigger state change (modify state/state.json)
      3. Assert client receives update within 1 second
    Expected Result: State changes broadcast to clients
    Evidence: .sisyphus/evidence/task-10-state-update.txt
  ```

  **Evidence to Capture**:
  - [ ] task-10-connect-state.txt (initial state sent)
  - [ ] task-10-state-update.txt (updates broadcast)

  **Commit**: YES
  - Message: `feat(dashboard): add WebSocket endpoints for real-time state`
  - Files: `src/dashboard/server.js`, `tests/integration/dashboard/websocket.test.js`
  - Pre-commit: `npm run test:integration -- --testPathPattern=websocket`

---

- [x] 11. State API Endpoints

  **What to do**:
  - Add REST API endpoints to Express server:
    - GET /api/status - bot status (idle/active/danger)
    - GET /api/drives - current drive scores
    - GET /api/goals - current and recent goals
    - GET /api/memory - memory graph stats (node count, types)
    - GET /api/metrics - performance metrics (action success rate, items/hour)
  - All endpoints read from state files (StateManager)
  - Return JSON, handle errors gracefully

  **Must NOT do**:
  - Don't add POST/PUT/DELETE endpoints (READ-ONLY)
  - Don't add pagination (simple responses for Phase 1)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard REST API, straightforward data retrieval
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Phase 1 Wave 2 (with Tasks 9, 10, 12)
  - **Blocks**: Tasks 13-16 (frontend depends on API)
  - **Blocked By**: Tasks 2, 3 (needs state and broadcaster)

  **References**:
  - `src/utils/state-manager.js` - State reading methods
  - `src/goals/goal-generator.js` - Goal structure
  - `src/memory/knowledge-graph.js` - Memory stats

  **Acceptance Criteria**:
  - [ ] All 5 endpoints implemented
  - [ ] `curl http://localhost:3001/api/status` → {"mode": "idle"|"active"|"danger"}
  - [ ] `curl http://localhost:3001/api/drives` → {"survival": 50, "curiosity": 70, ...}

  **QA Scenarios**:
  ```
  Scenario: Status endpoint returns current mode
    Tool: Bash (curl)
    Preconditions: Dashboard server running, bot in idle mode
    Steps:
      1. curl -s http://localhost:3001/api/status | jq '.mode'
      2. Assert output is "idle"
    Expected Result: Status endpoint returns correct mode
    Evidence: .sisyphus/evidence/task-11-status.txt

  Scenario: Drives endpoint returns all 5 drives
    Tool: Bash (curl + jq)
    Preconditions: Dashboard server running, drives computed
    Steps:
      1. curl -s http://localhost:3001/api/drives | jq 'keys | length'
      2. Assert output is 5
    Expected Result: All 5 drive scores returned
    Evidence: .sisyphus/evidence/task-11-drives.txt
  ```

  **Evidence to Capture**:
  - [ ] task-11-status.txt (status endpoint works)
  - [ ] task-11-drives.txt (drives endpoint works)

  **Commit**: YES
  - Message: `feat(dashboard): add REST API endpoints for state queries`
  - Files: `src/dashboard/server.js`, `tests/integration/dashboard/api.test.js`
  - Pre-commit: `npm run test:integration -- --testPathPattern=api`

---

- [x] 12. Dashboard Process Launcher

  **What to do**:
  - Add `npm run dashboard` script to package.json
  - Script runs: `node src/dashboard/server.js`
  - Add ENABLE_DASHBOARD check in src/index.js
  - If enabled, spawn dashboard as child process
  - Handle dashboard crash gracefully (log error, don't crash bot)
  - Add dashboard status to bot logs

  **Must NOT do**:
  - Don't restart dashboard automatically on crash (log only)
  - Don't block bot startup waiting for dashboard

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple process spawning, clear requirements
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Phase 1 Wave 2 (with Tasks 9, 10, 11)
  - **Blocks**: Tasks 13-16 (frontend depends on launcher)
  - **Blocked By**: Tasks 2, 3 (needs state and broadcaster)

  **References**:
  - `src/index.js` - Main initialization flow
  - Node.js child_process.spawn documentation

  **Acceptance Criteria**:
  - [ ] `npm run dashboard` starts dashboard server
  - [ ] ENABLE_DASHBOARD=true in .env spawns dashboard on bot startup
  - [ ] Bot continues running if dashboard crashes

  **QA Scenarios**:
  ```
  Scenario: Dashboard spawns on bot startup
    Tool: Bash (npm + ps)
    Preconditions: ENABLE_DASHBOARD=true
    Steps:
      1. ENABLE_DASHBOARD=true node src/index.js &
      2. sleep 3
      3. ps aux | grep "dashboard/server.js" | grep -v grep
      4. Assert dashboard process exists
      5. Kill bot process
    Expected Result: Dashboard spawns automatically
    Evidence: .sisyphus/evidence/task-12-auto-spawn.txt

  Scenario: Bot survives dashboard crash
    Tool: Bash (kill + ps)
    Preconditions: Bot and dashboard running
    Steps:
      1. Start bot with dashboard enabled
      2. Find dashboard PID, kill -9 <pid>
      3. ps aux | grep "src/index.js" | grep -v grep
      4. Assert bot process still running
    Expected Result: Bot continues after dashboard crash
    Evidence: .sisyphus/evidence/task-12-crash-isolation.txt
  ```

  **Evidence to Capture**:
  - [ ] task-12-auto-spawn.txt (auto-spawn works)
  - [ ] task-12-crash-isolation.txt (crash isolation works)

  **Commit**: YES
  - Message: `feat(dashboard): add process launcher with crash isolation`
  - Files: `src/index.js`, `package.json`, `tests/integration/dashboard/launcher.test.js`
  - Pre-commit: `npm run test:integration -- --testPathPattern=launcher`

---

### Remaining Tasks Summary

**Due to plan size, remaining tasks (13-52 + F1-F4) are summarized below. Each follows the same detailed structure as Tasks 1-12.**

**Phase 1 - Wave 3: Dashboard Frontend (Tasks 13-16)**
- Task 13: Next.js project setup (quick) - Initialize Next.js 15 + React 19 in src/dashboard/frontend
- Task 14: Real-time state display (visual-engineering) - Show bot status, position, health, inventory
- Task 15: Drive visualization (visual-engineering) - Bar charts for 5 drives, real-time updates
- Task 16: Memory graph viewer (visual-engineering) - Interactive graph visualization with D3.js

**Phase 1 - Wave 4: Integration + Testing (Tasks 17-20)**
- Task 17: Drive-dashboard integration (unspecified-high) - Connect DriveSystem to dashboard display
- Task 18: Feature flag isolation tests (quick) - Verify bot works identically with ENABLE_DRIVES=false
- Task 19: Rate limit verification (quick) - Ensure drives don't exceed RPM budget
- Task 20: Dashboard crash test (quick) - Kill dashboard, verify bot continues

**Phase 2 - Wave 1: Vision Foundation (Tasks 21-24)**
- Task 21: VisionProcessor class (unspecified-high) - Async screenshot analysis loop (2-10s)
- Task 22: Screenshot capture (unspecified-high) - Mineflayer headless rendering
- Task 23: Custom endpoint support (quick) - Support any OpenAI-compatible API
- Task 24: VisionState object (quick) - Non-blocking state for Pilot to read

**Phase 2 - Wave 2: Vision Integration (Tasks 25-28)**
- [x] Task 25: Pilot vision integration (deep) - Add vision context to Pilot decisions, non-blocking
- [x] Task 26: Vision prompt templates (quick) - Structured prompts for spatial reasoning
- [x] Task 27: Vision caching strategy (quick) - Cache static elements, refresh dynamic
- [x] Task 28: Dashboard vision display (visual-engineering) - Show latest screenshot + description

**Phase 2 - Wave 3: Advanced Pathfinding (Tasks 29-32)**
- Task 29: Water pathfinding (unspecified-high) - Extend mineflayer-pathfinder for swimming
- Task 30: Nether pathfinding (unspecified-high) - Portal usage, lava avoidance
- Task 31: Parkour handler (unspecified-high) - Gap jumping with safety checks
- Task 32: Safety checks (quick) - No parkour if health ≤10, no water >30s without boat

**Phase 2 - Wave 4: Integration + Testing (Tasks 33-36)**
- Task 33: Vision-guided navigation (deep) - Use vision for complex terrain decisions
- Task 34: Pathfinding integration tests (unspecified-high) - Test water, nether, parkour
- Task 35: Vision rate limit tests (quick) - Verify 20 RPM budget enforced
- Task 36: Feature isolation tests (quick) - Verify bot works with ENABLE_VISION=false

**Phase 3 - Wave 1: Meta-Learning Foundation (Tasks 37-40)**
- Task 37: Strategy memory schema (quick) - Define 'strategy_memory' type in KnowledgeGraph
- Task 38: Embedding-based retrieval (unspecified-high) - Cosine similarity search (threshold >0.75)
- Task 39: Similarity scoring (quick) - Weight by success rate + recency
- Task 40: Strategy storage (quick) - Store successful/failed strategies with context

**Phase 3 - Wave 2: Meta-Learning Integration (Tasks 41-44)**
- Task 41: ReflectionModule integration (deep) - Store strategies during reflection cycle
- Task 42: Strategy application logic (unspecified-high) - Retrieve and apply similar strategies
- Task 43: Learning metrics (quick) - Track strategy reuse rate, success improvement
- Task 44: Dashboard learning display (visual-engineering) - Show learned strategies, success rates

**Phase 3 - Wave 3: Natural Conversation (Tasks 45-48)**
- Task 45: Context tracker (unspecified-high) - Last 10 messages + summary + relationship
- Task 46: Enhanced summarization (unspecified-high) - Replace word-frequency with LLM summarization
- Task 47: Personality-driven responses (quick) - Inject traits into conversation prompts
- Task 48: Fallback responses (quick) - Handle LLM failures gracefully

**Phase 3 - Wave 4: Integration + Testing (Tasks 49-52)**
- Task 49: Conversation-learning integration (deep) - Use learned strategies in conversation
- Task 50: End-to-end conversation tests (unspecified-high) - Multi-turn context preservation
- Task 51: Meta-learning persistence tests (quick) - Verify strategies survive restart
- Task 52: Feature isolation tests (quick) - Verify bot works with features disabled

**Wave FINAL: Verification (Tasks F1-F4)**
- Task F1: Plan compliance audit (oracle) - Verify all "Must Have" present, "Must NOT Have" absent
- Task F2: Code quality review (unspecified-high) - Run linter, tsc, tests, check for AI slop
- Task F3: Real manual QA (unspecified-high) - Execute all QA scenarios, test integration
- Task F4: Scope fidelity check (deep) - Verify no scope creep, all tasks match spec

---

**All tasks follow the same structure as Tasks 1-12:**
- What to do / Must NOT do
- Recommended Agent Profile (category + skills)
- Parallelization info (parallel group, blocks, blocked by)
- References (file paths, research findings)
- Acceptance Criteria (executable commands)
- QA Scenarios (tool, steps, expected result, evidence)
- Evidence to Capture
- Commit strategy

**Total: 52 implementation tasks + 4 final verification tasks = 56 tasks**

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`

  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`

  Run `npm test` + linter. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  
  Output: `Tests [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`

  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (drives influence dashboard, vision guides pathfinding, meta-learning improves conversation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`

  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

**Wave 0 (Infrastructure):**
- Commit 1: `feat(utils): add FeatureFlags module` (Task 1)
- Commit 2: `feat(memory): add KnowledgeGraph persistence` (Task 2)
- Commit 3: `feat(dashboard): add WebSocket broadcaster` (Task 3)
- Commit 4: `feat(vision): add vision rate limiter` (Task 4)

**Phase 1 Wave 1 (Drives):**
- Commit 5: `feat(drives): add DriveSystem with 5 core drives` (Tasks 5-6)
- Commit 6: `feat(goals): integrate drive scores into goal scoring` (Task 7)
- Commit 7: `feat(state): add drive scores to state tracking` (Task 8)

**Phase 1 Wave 2 (Dashboard Backend):**
- Commit 8: `feat(dashboard): add Express server as separate process` (Task 9)
- Commit 9: `feat(dashboard): add WebSocket endpoints` (Task 10)
- Commit 10: `feat(dashboard): add REST API endpoints` (Task 11)
- Commit 11: `feat(dashboard): add process launcher with crash isolation` (Task 12)

**Phase 1 Wave 3 (Dashboard Frontend):**
- Commit 12: `feat(dashboard): initialize Next.js frontend` (Task 13)
- Commit 13: `feat(dashboard): add real-time state display` (Task 14)
- Commit 14: `feat(dashboard): add drive visualization` (Task 15)
- Commit 15: `feat(dashboard): add memory graph viewer` (Task 16)

**Phase 1 Wave 4 (Integration):**
- Commit 16: `feat(drives): integrate with dashboard display` (Task 17)
- Commit 17: `test(drives): add feature flag isolation tests` (Task 18)
- Commit 18: `test(drives): add rate limit verification` (Task 19)
- Commit 19: `test(dashboard): add crash isolation test` (Task 20)

**Phase 2 Wave 1 (Vision Foundation):**
- Commit 20: `feat(vision): add VisionProcessor with async loop` (Task 21)
- Commit 21: `feat(vision): add screenshot capture` (Task 22)
- Commit 22: `feat(vision): add custom endpoint support` (Task 23)
- Commit 23: `feat(vision): add VisionState object` (Task 24)

**Phase 2 Wave 2 (Vision Integration):**
- Commit 24: `feat(pilot): integrate vision context non-blocking` (Task 25)
- Commit 25: `feat(vision): add prompt templates` (Task 26)
- Commit 26: `feat(vision): add caching strategy` (Task 27)
- Commit 27: `feat(dashboard): add vision display` (Task 28)

**Phase 2 Wave 3 (Pathfinding):**
- Commit 28: `feat(pathfinding): add water navigation` (Task 29)
- Commit 29: `feat(pathfinding): add nether pathfinding` (Task 30)
- Commit 30: `feat(pathfinding): add parkour handler` (Task 31)
- Commit 31: `feat(pathfinding): add safety checks` (Task 32)

**Phase 2 Wave 4 (Integration):**
- Commit 32: `feat(pathfinding): add vision-guided navigation` (Task 33)
- Commit 33: `test(pathfinding): add integration tests` (Task 34)
- Commit 34: `test(vision): add rate limit tests` (Task 35)
- Commit 35: `test(vision): add feature isolation tests` (Task 36)

**Phase 3 Wave 1 (Meta-Learning Foundation):**
- Commit 36: `feat(learning): add strategy memory schema` (Task 37)
- Commit 37: `feat(learning): add embedding-based retrieval` (Task 38)
- Commit 38: `feat(learning): add similarity scoring` (Task 39)
- Commit 39: `feat(learning): add strategy storage` (Task 40)

**Phase 3 Wave 2 (Meta-Learning Integration):**
- Commit 40: `feat(learning): integrate with ReflectionModule` (Task 41)
- Commit 41: `feat(learning): add strategy application logic` (Task 42)
- Commit 42: `feat(learning): add learning metrics` (Task 43)
- Commit 43: `feat(dashboard): add learning display` (Task 44)

**Phase 3 Wave 3 (Conversation):**
- Commit 44: `feat(conversation): add context tracker` (Task 45)
- Commit 45: `feat(conversation): enhance summarization` (Task 46)
- Commit 46: `feat(conversation): add personality-driven responses` (Task 47)
- Commit 47: `feat(conversation): add fallback responses` (Task 48)

**Phase 3 Wave 4 (Integration):**
- Commit 48: `feat(conversation): integrate with meta-learning` (Task 49)
- Commit 49: `test(conversation): add end-to-end tests` (Task 50)
- Commit 50: `test(learning): add persistence tests` (Task 51)
- Commit 51: `test(features): add isolation tests` (Task 52)

**Final Commit:**
- Commit 52: `feat(phase-2): complete autonomy, UX, capabilities, research enhancements` (after F1-F4 approval)

---

## Success Criteria

### Verification Commands
```bash
# Infrastructure
node -e "const ff = require('./src/utils/feature-flags'); console.log(ff.isEnabled('DRIVES'))"  # Expected: false
node -e "const kg = new (require('./src/memory/knowledge-graph')); kg.save(); kg.load()"  # Expected: no error

# Phase 1: Drives + Dashboard
ENABLE_DRIVES=true node src/index.js &  # Expected: bot generates autonomous goals
curl http://localhost:3001/api/drives  # Expected: {"survival": N, "curiosity": N, ...}
wscat -c ws://localhost:3001/ws  # Expected: real-time state updates

# Phase 2: Vision + Pathfinding
ENABLE_VISION=true node src/index.js &  # Expected: screenshots analyzed every 5s
# Bot navigates water, nether, parkour obstacles

# Phase 3: Meta-Learning + Conversation
# Bot stores and retrieves strategies
# Conversations include context from past interactions
```

### Final Checklist
- [ ] All 6 features implemented with feature flags (default: false)
- [ ] Dashboard accessible at http://localhost:3001
- [ ] Bot generates autonomous goals when idle (drives active)
- [ ] Vision screenshots analyzed and fed to Pilot (non-blocking)
- [ ] Bot navigates water, nether, parkour
- [ ] Strategies stored and retrieved based on similarity
- [ ] Conversations include context from past interactions
- [ ] All tests passing (70% coverage for critical paths, 50% for UI)
- [ ] Bot runs identically with all features disabled
- [ ] All "Must Have" present, all "Must NOT Have" absent
- [ ] No scope creep, all tasks match spec
- [ ] All evidence files captured in .sisyphus/evidence/
- [ ] User explicitly approved final verification results

