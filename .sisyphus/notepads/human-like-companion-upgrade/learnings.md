# Learnings: human-like-companion-upgrade

## Task 1: transformers.js Validation

### Date: 2026-04-15

### Key Discovery
**@xenova/transformers v2.17.2 works in Node.js** but with limitations:
- WASM inference works (onnxruntime-web)
- No GPU acceleration (WebGPU/WebGL are browser-only)
- CPU-only inference significantly slower than GPU

### Package Characteristics
- **Size**: 46.6 MB unpacked (acceptable)
- **Node.js**: No explicit `engines` field, but works on v22
- **Backend**: onnxruntime-web provides WASM support
- **Sharp**: Image processing dependency works in Node.js

### Validation Method
1. npm info shows no explicit Node.js engine requirement
2. Test script proved require() works in Node.js
3. ONNX backend with WASM is Node.js compatible
4. pipeline() function accessible without errors

### Implication for Emotion Detection (Task 7)
- transformers.js can be used for sentiment/emotion analysis
- Use quantized models (q4, q8) for better latency
- First inference will be slow (model download + WASM init)
- For real-time emotion detection in Minecraft chat, acceptable

### References
- GitHub: https://github.com/xenova/transformers.js
- NPM: https://www.npmjs.com/package/@xenova/transformers
- Evidence: .sisyphus/evidence/task-1-transformers-validation/VALIDATION_REPORT.md## Task 5: Cognitive Controller Skeleton (2026-04-15)

### Summary
Created the Cognitive Controller skeleton - the PIANO architecture bottleneck that coordinates all modules.

### Files Created
- `src/layers/cognitive-controller.js` - 125 lines, skeleton class
- `tests/unit/cognitive-controller.test.js` - 27 tests, all passing

### Implementation Details
The Cognitive Controller follows the same patterns as `action-awareness.js`:
- Uses `../utils/logger` for structured logging
- Simple object storage (not state-manager, per task requirements)
- Decision history with max 50 entries
- 3 public methods: `synthesize(inputs)`, `broadcast(decision)`, `checkCoherence(talk, action)`

### Interface Design
- **Inputs**: { personality, emotion, social, goals }
- **Output**: Unified decision object with timestamp, inputs, action, priority, coherence

### Test Results
All 27 unit tests pass:
- Constructor initialization (4 tests)
- Module registration (2 tests)
- synthesize() method (8 tests)
- broadcast() method (4 tests)
- checkCoherence() method (3 tests)
- getHistory() method (6 tests)

### Commit
`856e394` - feat(layers): add Cognitive Controller skeleton

### Notes for Implementation Task (Task 6)
- The skeleton returns null for action - real LLM integration will populate this
- broadcast() currently returns { acknowledged: true } for each module
- checkCoherence() always returns true - needs real conflict detection logic
- Consider integrating with StateManager for persistent decision history

## Task 2: BERT Emotion Testing (2026-04-15)

### Objective
Test bert-emotion model on Minecraft chat samples to validate emotion detection for the companion bot.

### Key Findings

1. **boltuix/bert-emotion model has loading issues** - tokenizer.json returns 401 error when using transformers.js. Alternative model `MicahB/emotion_text_classifier` works correctly.

2. **Latency is excellent** - P99 latency is 13.95ms (well under 50ms requirement). Average inference time is ~9ms.

3. **Accuracy is below 70% target** - Achieved 55% accuracy (11/20 correct). The 70% requirement is NOT met.

4. **Emotion-specific performance**:
   - Joy: 100% accurate (6/6) - works perfectly
   - Fear: 100% accurate (2/2) - works perfectly  
   - Sadness: 50% accurate (1/2)
   - Neutral: 33% accurate (1/3)
   - Anger: 33% accurate (1/3)
   - Surprise: 0% accurate (0/4) - completely fails

5. **Minecraft game jargon**:
   - "gg" (good game) - detected as joy ✓
   - "brb" - detected as neutral ✓
   - "noob" - model detects as neutral instead of disgust/anger ✗
   - "lol" - model detects as neutral instead of joy ✗

6. **Model limitations**:
   - Does not have "disgust" in its emotion labels
   - Surprise is often confused with joy or anger
   - Sarcasm detection is poor (expected for generic models)
   - Short messages with jargon are problematic

### Recommendations

1. **Use confidence threshold >0.7** for actionable detections
2. **Fine-tune on Minecraft chat** data for better accuracy
3. **Map surprise+excitement to joy** when confidence is high
4. **Add context** (player health, recent events) to improve accuracy
5. **Consider emotion mapping**: disgust→anger, surprise→joy/anger based on context

### Evidence
Results saved to: `.sisyphus/evidence/task-2-bert-emotion-results.json`

### Next Steps
- Task 7 (emotion detection implementation) should use MicahB/emotion_text_classifier
- Consider training/fine-tuning on Minecraft chat for >70% accuracy
- Implement context blending to improve detection accuracy

## Task 3: Graphology Query Latency Prototype (2026-04-15)

### Objective
Prototype graphology-based knowledge graph query performance to validate P99 <10ms target.

### Graph Configuration
- **Nodes**: 500 (types: player, location, item, mob, event, goal)
- **Edges**: 2000 (types: knows, located_at, has, interacts_with, targets, precedes)

### Query Patterns Tested (7 total)
1. **findNeighbors** - outNeighbors of a node
2. **shortestPath** - BFS-based path finding
3. **filterByType** - filter nodes by attribute
4. **getNodeProperties** - get node attributes and degree
5. **traverseEdges** - get all outgoing edges
6. **findByAttribute** - range query on attributes
7. **inNeighbors** - nodes pointing to target

### P99 Latency Results (target: <10ms)
| Query | P99 | Status |
|-------|-----|--------|
| findNeighbors | 0.006ms | PASS |
| shortestPath | 0.776ms | PASS |
| filterByType | 0.155ms | PASS |
| getNodeProperties | 0.009ms | PASS |
| traverseEdges | 0.017ms | PASS |
| findByAttribute | 0.212ms | PASS |
| inNeighbors | 0.001ms | PASS |

**All queries PASSED** - P99 latency 100-1600x under target

### Concurrent Read Test (50 simultaneous queries)
All completed without race conditions. Shortest path is slowest at 17ms total (0.345ms per query average).

### Key Findings
1. **Graphology is extremely fast** - even complex queries like shortest path are <1ms P99
2. **No concurrency issues** - Node.js single-threaded model handles parallel reads naturally
3. **API Note**: `graph.neighbors()` exists but for directed graphs prefer `outNeighbors()`/`inNeighbors()`
4. **Dependencies needed**: `graphology`, `graphology-shortest-path`, `graphology-utils`

### Implications for Task 9 (Knowledge Graph Core)
- Graphology can handle 500 nodes / 2000 edges with room to spare
- Scale to much larger graphs (10K+ nodes) likely still meets <10ms target
- No need for special concurrency handling - standard async/await sufficient
- Use directed graph with types on both nodes and edges for knowledge representation

### Evidence
Validation report: `.sisyphus/evidence/task-3-graphology-latency.txt`
Test script: `test-graphology.js`

### Dependencies Installed
```bash
npm install graphology graphology-shortest-path graphology-utils
```

## Task 6: Cognitive Controller Implementation (2026-04-15)

### Summary
Implemented the Cognitive Controller bottleneck logic - the core PIANO architecture component that synthesizes inputs from all modules into unified decisions.

### Files Modified
- `src/layers/cognitive-controller.js` - Full implementation (309 lines)
- `tests/unit/cognitive-controller.test.js` - 49 tests (from 27)

### Implementation Details

#### synthesize() Method
- **Priority resolution**: danger > social > goals (rule-based, no LLM)
- **Confidence scoring**: Each decision includes confidence level
- **Input blending**: Emotion blends with social, personality blends with goals
- **Deferred tracking**: Lower-priority inputs are tracked in `decision.deferred`
- **History management**: Max 50 decisions (same as skeleton)

#### checkCoherence() Method
- **Conflict patterns**: 7 pattern pairs (talk vs action)
- **Pattern matching**: Regex-based, case-insensitive
- **Logging**: Conflicts logged with reason code
- Examples detected:
  - "I'll help you" + attack action → `offering_help_but_attacking`
  - "I love you" + attack action → `expressing_affection_but_harming`
  - "I'll stay here" + move action → `offering_to_stay_but_moving`

#### broadcast() Method
- **Module communication**: Calls `module.receiveDecision(decision)` if present
- **Error handling**: Catches module errors, returns `{ acknowledged: false, error }`
- **Fallback**: Modules without `receiveDecision` get `{ acknowledged: true, response: null }`

### Test Coverage
- **49 tests total** (up from 27 skeleton tests)
- **Coverage**: 98% statements, 91% branches, 100% functions
- **Test categories**:
  - Priority resolution (7 tests)
  - Emotion blending (3 tests)
  - Personality blending (2 tests)
  - Conflict detection (10 tests)
  - Broadcast handling (7 tests)

### Key Patterns Used
- Followed `action-awareness.js` pattern for verification logic
- Used `../utils/logger` for structured logging
- Simple object storage (not state-manager, per requirements)
- Private methods prefixed with underscore (`_blendWithEmotion`, `_getDeferredInputs`)

### Integration Notes
- **Not integrated with Commander yet** (Task 11 will handle this)
- **Rule-based only** (no LLM calls - explicit requirement)
- **Standalone implementation** - can be tested independently

### Evidence
- Coverage report: `.sisyphus/evidence/task-6/coverage-final.json`
- All 49 tests pass

### Commit
`feat(layers): implement Cognitive Controller bottleneck logic`
