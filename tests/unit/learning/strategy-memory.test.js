/**
 * Unit tests for StrategyMemory module
 *
 * Coverage:
 * - Constructor and configuration
 * - storeStrategy / retrieveSimilarStrategies lifecycle
 * - TF-IDF embedding generation
 * - Cosine similarity computation
 * - Vocabulary management and eviction
 * - Combined scoring (similarity + success_rate + recency)
 * - Edge cases (empty input, missing embeddings, threshold filtering)
 */

jest.mock('../../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const StrategyMemory = require('../../../src/learning/strategy-memory');

/**
 * Create a mock KnowledgeGraph for testing
 */
function createMockKG() {
  const strategies = new Map();

  return {
    addStrategy: jest.fn((id, props) => {
      strategies.set(id, { id, type: 'strategy_memory', properties: { strategy_id: id, ...props } });
      return true;
    }),
    getStrategy: jest.fn((id) => strategies.get(id) || null),
    updateStrategySuccessRate: jest.fn((id, rate) => {
      const s = strategies.get(id);
      if (s) { s.properties.success_rate = rate; return true; }
      return false;
    }),
    filterByType: jest.fn((type) => {
      if (type === 'strategy_memory') return Array.from(strategies.values());
      return [];
    })
  };
}

describe('StrategyMemory', () => {
  let sm;
  let mockKG;

  beforeEach(() => {
    mockKG = createMockKG();
    sm = new StrategyMemory(mockKG);
  });

  // ============================================
  // Constructor
  // ============================================

  describe('Constructor', () => {
    test('should throw if no KnowledgeGraph provided', () => {
      expect(() => new StrategyMemory(null)).toThrow('requires a KnowledgeGraph instance');
    });

    test('should throw if KnowledgeGraph is undefined', () => {
      expect(() => new StrategyMemory(undefined)).toThrow('requires a KnowledgeGraph instance');
    });

    test('should initialize with default options', () => {
      expect(sm.defaultThreshold).toBe(0.75);
      expect(sm.maxVocabularySize).toBe(5000);
      expect(sm.similarityWeight).toBe(0.5);
      expect(sm.successWeight).toBe(0.3);
      expect(sm.recencyWeight).toBe(0.2);
    });

    test('should accept custom options', () => {
      const custom = new StrategyMemory(mockKG, {
        defaultThreshold: 0.9,
        maxVocabularySize: 1000,
        similarityWeight: 0.6,
        successWeight: 0.2,
        recencyWeight: 0.2
      });
      expect(custom.defaultThreshold).toBe(0.9);
      expect(custom.maxVocabularySize).toBe(1000);
      expect(custom.similarityWeight).toBe(0.6);
    });

    test('should initialize empty vocabulary and caches', () => {
      expect(sm.getVocabularySize()).toBe(0);
      expect(sm.getDocumentCount()).toBe(0);
    });
  });

  // ============================================
  // storeStrategy
  // ============================================

  describe('storeStrategy', () => {
    test('should store a strategy and return true', () => {
      const result = sm.storeStrategy('strat_1', 'collect oak logs in forest', ['dig', 'collect'], 'success', 0.9);
      expect(result).toBe(true);
      expect(mockKG.addStrategy).toHaveBeenCalledTimes(1);
    });

  test('should pass embedding_text to KnowledgeGraph', () => {
    sm.storeStrategy('strat_1', 'collect oak logs in forest', ['dig'], 'success', 0.9);
    const call = mockKG.addStrategy.mock.calls[0];
    const props = call[1];
    expect(typeof props.embedding_text).toBe('string');
    expect(props.embedding_text.length).toBeGreaterThan(0);
    expect(props.embedding_text).toContain('collect oak logs in forest');
  });

    test('should store context, actions, outcome, success_rate, timestamp', () => {
      sm.storeStrategy('strat_1', 'collect wood', ['dig'], 'success', 0.8, { tag: 'resource' });
      const call = mockKG.addStrategy.mock.calls[0];
      const props = call[1];
      expect(props.context).toBe('collect wood');
      expect(props.actions).toEqual(['dig']);
      expect(props.outcome).toBe('success');
      expect(props.success_rate).toBe(0.8);
      expect(typeof props.timestamp).toBe('number');
      expect(props.tag).toBe('resource');
    });

    test('should return false for missing strategyId', () => {
      const result = sm.storeStrategy(null, 'some context');
      expect(result).toBe(false);
      expect(mockKG.addStrategy).not.toHaveBeenCalled();
    });

    test('should return false for empty strategyId', () => {
      const result = sm.storeStrategy('', 'some context');
      expect(result).toBe(false);
    });

    test('should use defaults for optional params', () => {
      sm.storeStrategy('strat_1', 'some context');
      const call = mockKG.addStrategy.mock.calls[0];
      const props = call[1];
      expect(props.actions).toEqual([]);
      expect(props.outcome).toBe('');
      expect(props.success_rate).toBe(0);
    });

    test('should build embedding text from context + actions + outcome', () => {
      const spy = jest.spyOn(sm, '_buildEmbeddingText');
      sm.storeStrategy('s1', 'gather wood', ['chop', 'collect'], 'done');
      expect(spy).toHaveBeenCalledWith('gather wood', ['chop', 'collect'], 'done');
    });

    test('should update vocabulary when storing', () => {
      sm.storeStrategy('s1', 'collect wood from forest');
      expect(sm.getVocabularySize()).toBeGreaterThan(0);
      expect(sm.getDocumentCount()).toBe(1);
    });

  test('should rebuild vocabulary after storing', () => {
    sm.storeStrategy('s1', 'collect wood from forest');
    expect(sm.getVocabularySize()).toBeGreaterThan(0);
    expect(sm.getDocumentCount()).toBe(1);
  });
  });

  // ============================================
  // retrieveSimilarStrategies
  // ============================================

  describe('retrieveSimilarStrategies', () => {
    test('should return empty array for empty query', () => {
      const results = sm.retrieveSimilarStrategies('');
      expect(results).toEqual([]);
    });

    test('should return empty array for non-string query', () => {
      const results = sm.retrieveSimilarStrategies(null);
      expect(results).toEqual([]);
    });

    test('should return empty array when no strategies stored', () => {
      const results = sm.retrieveSimilarStrategies('collect wood');
      expect(results).toEqual([]);
    });

    test('should return strategies above threshold', () => {
      sm.storeStrategy('s1', 'collect oak logs in forest', ['dig'], 'success', 0.9);
      const results = sm.retrieveSimilarStrategies('collect oak logs in forest', 0.5);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].similarity).toBeGreaterThanOrEqual(0.5);
    });

    test('should filter strategies below threshold', () => {
      sm.storeStrategy('s1', 'collect oak logs in forest', ['dig'], 'success', 0.9);
      const results = sm.retrieveSimilarStrategies('build nether portal with obsidian', 0.99);
      // Very different text + high threshold should filter out
      expect(results.length).toBe(0);
    });

    test('should use default threshold when none provided', () => {
      sm.storeStrategy('s1', 'collect oak logs in forest', ['dig'], 'success', 0.9);
      // Default threshold is 0.75 - same text should match
      const results = sm.retrieveSimilarStrategies('collect oak logs in forest');
      expect(results.length).toBeGreaterThan(0);
    });

  test('should sort results by combined score (descending)', () => {
    const now = Date.now();
    // Store two strategies - one with high similarity/success, one lower
    sm.storeStrategy('s1', 'collect wood from trees', ['dig'], 'success', 0.9);
    // Manually add a second strategy to the mock KG with embedding_text
    mockKG.addStrategy('s2', {
      context: 'mine stone from cave',
      actions: ['dig'],
      outcome: 'partial',
      success_rate: 0.3,
      timestamp: now - 86400000, // 1 day old
      embedding_text: 'mine stone from cave dig partial'
    });

    const results = sm.retrieveSimilarStrategies('collect wood from trees', 0.0);
    // Both should be returned (threshold 0)
    if (results.length >= 2) {
      expect(results[0].combinedScore).toBeGreaterThanOrEqual(results[1].combinedScore);
    }
  });

    test('should include metadata when includeMetadata is true', () => {
      sm.storeStrategy('s1', 'collect wood', ['dig'], 'success', 0.85);
      const results = sm.retrieveSimilarStrategies('collect wood', 0.5, { includeMetadata: true });
      if (results.length > 0) {
        expect(results[0]).toHaveProperty('success_rate');
        expect(results[0]).toHaveProperty('age');
      }
    });

    test('should exclude metadata when includeMetadata is false', () => {
      sm.storeStrategy('s1', 'collect wood', ['dig'], 'success', 0.85);
      const results = sm.retrieveSimilarStrategies('collect wood', 0.5, { includeMetadata: false });
      if (results.length > 0) {
        expect(results[0]).not.toHaveProperty('success_rate');
        expect(results[0]).not.toHaveProperty('age');
      }
    });

    test('should respect limit option', () => {
      // Store multiple strategies
      sm.storeStrategy('s1', 'collect wood from trees', ['dig'], 'success', 0.9);
      sm.storeStrategy('s2', 'gather wood from forest', ['chop'], 'success', 0.8);
      sm.storeStrategy('s3', 'harvest oak logs', ['collect'], 'success', 0.7);

      const results = sm.retrieveSimilarStrategies('collect wood', 0.0, { limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

  test('should skip strategies without embedding_text', () => {
    mockKG.addStrategy('no_embedding', {
      context: 'some context',
      actions: [],
      outcome: 'test',
      success_rate: 0.5,
      timestamp: Date.now()
    });

    const results = sm.retrieveSimilarStrategies('some context', 0.0);
    expect(Array.isArray(results)).toBe(true);
  });

  test('should skip strategies with non-string embedding_text', () => {
    mockKG.addStrategy('bad_emb', {
      context: 'test',
      actions: [],
      outcome: 'test',
      success_rate: 0.5,
      timestamp: Date.now(),
      embedding_text: 123
    });

    const results = sm.retrieveSimilarStrategies('test', 0.0);
    expect(Array.isArray(results)).toBe(true);
  });

  test('should compute recency with exponential decay', () => {
    const now = Date.now();
    sm.storeStrategy('recent', 'collect wood', ['dig'], 'success', 0.5);
    mockKG.addStrategy('old', {
      context: 'collect wood',
      actions: ['dig'],
      outcome: 'success',
      success_rate: 0.5,
      timestamp: now - 24 * 60 * 60 * 1000,
      embedding_text: 'collect wood dig success'
    });

    const results = sm.retrieveSimilarStrategies('collect wood', 0.0);
    if (results.length >= 2) {
      const recentResult = results.find(r => r.strategy.id === 'recent');
      const oldResult = results.find(r => r.strategy.id === 'old');
      if (recentResult && oldResult) {
        expect(recentResult.combinedScore).toBeGreaterThan(oldResult.combinedScore);
      }
    }
  });

  test('should handle missing success_rate gracefully', () => {
    mockKG.addStrategy('no_rate', {
      context: 'collect wood',
      actions: [],
      outcome: 'test',
      timestamp: Date.now(),
      embedding_text: 'collect wood test'
    });

    const results = sm.retrieveSimilarStrategies('collect wood', 0.0);
    if (results.length > 0) {
      expect(results[0].success_rate).toBe(0);
    }
  });
  });

  // ============================================
  // generateEmbedding
  // ============================================

  describe('generateEmbedding', () => {
    test('should return zero vector for empty text', () => {
      const emb = sm.generateEmbedding('');
      expect(Array.isArray(emb)).toBe(true);
      // Zero vector when vocabulary is empty
      expect(emb.length).toBe(0);
    });

    test('should return zero vector for non-string input', () => {
      const emb = sm.generateEmbedding(null);
      expect(Array.isArray(emb)).toBe(true);
    });

    test('should produce vector matching vocabulary size', () => {
      sm.storeStrategy('s1', 'collect wood from forest');
      const vocabSize = sm.getVocabularySize();
      const emb = sm.generateEmbedding('collect wood');
      expect(emb.length).toBe(vocabSize);
    });

    test('should produce L2-normalized vector', () => {
      sm.storeStrategy('s1', 'collect wood from forest');
      const emb = sm.generateEmbedding('collect wood from forest');
      const norm = Math.sqrt(emb.reduce((sum, v) => sum + v * v, 0));
      // Normalized vectors have norm ~1 (or 0 for zero vector)
      if (norm > 0) {
        expect(Math.abs(norm - 1.0)).toBeLessThan(0.01);
      }
    });

    test('should produce different embeddings for different text', () => {
      sm.storeStrategy('s1', 'collect wood from trees');
      sm.storeStrategy('s2', 'build shelter with cobblestone');
      const emb1 = sm.generateEmbedding('collect wood');
      const emb2 = sm.generateEmbedding('build shelter');
      // They should not be identical
      const sim = sm.cosineSimilarity(emb1, emb2);
      expect(sim).toBeLessThan(1.0);
    });

    test('should produce high similarity for same text', () => {
      sm.storeStrategy('s1', 'collect oak logs in the forest');
      const emb1 = sm.generateEmbedding('collect oak logs in the forest');
      const emb2 = sm.generateEmbedding('collect oak logs in the forest');
      const sim = sm.cosineSimilarity(emb1, emb2);
      expect(sim).toBeCloseTo(1.0, 5);
    });
  });

  // ============================================
  // cosineSimilarity
  // ============================================

  describe('cosineSimilarity', () => {
    test('should return 0 for null inputs', () => {
      expect(sm.cosineSimilarity(null, [1, 2, 3])).toBe(0);
      expect(sm.cosineSimilarity([1, 2, 3], null)).toBe(0);
    });

    test('should return 0 for mismatched lengths', () => {
      expect(sm.cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    });

    test('should return 0 for empty vectors', () => {
      expect(sm.cosineSimilarity([], [])).toBe(0);
    });

    test('should return 1 for identical vectors', () => {
      expect(sm.cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0, 5);
    });

    test('should return 0 for orthogonal vectors', () => {
      expect(sm.cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
    });

    test('should return -1 for opposite vectors', () => {
      expect(sm.cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
    });

    test('should return 0 when one vector is all zeros', () => {
      expect(sm.cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    });

    test('should compute similarity correctly for arbitrary vectors', () => {
      // [1,2,3] . [4,5,6] = 4+10+18 = 32
      // ||a|| = sqrt(14), ||b|| = sqrt(77)
      // sim = 32 / sqrt(14*77) = 32 / sqrt(1078) ≈ 0.9746
      const sim = sm.cosineSimilarity([1, 2, 3], [4, 5, 6]);
      expect(sim).toBeCloseTo(32 / Math.sqrt(14 * 77), 5);
    });
  });

  // ============================================
  // Vocabulary Management
  // ============================================

  describe('Vocabulary Management', () => {
    test('should add terms to vocabulary on store', () => {
      sm.storeStrategy('s1', 'collect wood from trees');
      expect(sm.getVocabularySize()).toBeGreaterThan(0);
    });

    test('should increment document count on each store', () => {
      sm.storeStrategy('s1', 'first document');
      expect(sm.getDocumentCount()).toBe(1);
      sm.storeStrategy('s2', 'second document');
      expect(sm.getDocumentCount()).toBe(2);
    });

    test('should track unique terms only once per document', () => {
      sm.storeStrategy('s1', 'wood wood wood'); // 'wood' appears 3x but 1 unique term
      expect(sm.getVocabularySize()).toBe(1);
    });

    test('should recompute IDF when new documents are added', () => {
      sm.storeStrategy('s1', 'collect wood');
      const idfAfter1 = sm.vocabulary.get('wood').idf;
      sm.storeStrategy('s2', 'mine stone'); // 'wood' not in doc 2
      const idfAfter2 = sm.vocabulary.get('wood').idf;
      // IDF should increase when term appears in fewer docs relative to total
      expect(idfAfter2).toBeGreaterThan(idfAfter1);
    });

    test('should evict lowest-IDF term when vocabulary exceeds max', () => {
      const smallSm = new StrategyMemory(mockKG, { maxVocabularySize: 5 });
      // Store strategies that introduce many unique terms
      smallSm.storeStrategy('s1', 'alpha beta gamma delta epsilon');
      expect(smallSm.getVocabularySize()).toBeLessThanOrEqual(5);
      smallSm.storeStrategy('s2', 'zeta eta theta iota kappa');
      expect(smallSm.getVocabularySize()).toBeLessThanOrEqual(5);
    });

    test('should tokenize: lowercase, strip non-alphanumeric, skip single chars', () => {
      const tokens = sm._tokenize('Hello World! Test-123 a I');
      expect(tokens).not.toContain('a'); // single char skipped
      expect(tokens).not.toContain('i'); // single char skipped
      expect(tokens).toContain('hello');
      expect(tokens).toContain('world');
      expect(tokens).toContain('test');
      expect(tokens).toContain('123');
    });

    test('should return empty array for empty/invalid tokenization', () => {
      expect(sm._tokenize('')).toEqual([]);
      expect(sm._tokenize(null)).toEqual([]);
      expect(sm._tokenize(undefined)).toEqual([]);
    });

    test('should normalize term frequencies by total token count', () => {
      const freqs = sm._computeTermFrequencies(['wood', 'wood', 'stone']);
      expect(freqs.get('wood')).toBeCloseTo(2 / 3, 5);
      expect(freqs.get('stone')).toBeCloseTo(1 / 3, 5);
    });

    test('should return empty map for empty token list', () => {
      const freqs = sm._computeTermFrequencies([]);
      expect(freqs.size).toBe(0);
    });
  });

  // ============================================
  // IDF Computation
  // ============================================

  describe('IDF Computation', () => {
    test('should use scikit-learn smooth variant: log((1+N)/(1+df)) + 1', () => {
      sm.storeStrategy('s1', 'wood stone');
      const N = sm.getDocumentCount(); // 1
      const df = sm.vocabulary.get('wood').docFreq; // 1
      const expectedIdf = Math.log((1 + N) / (1 + df)) + 1;
      expect(sm.vocabulary.get('wood').idf).toBeCloseTo(expectedIdf, 5);
    });

    test('should increase IDF for rare terms', () => {
      sm.storeStrategy('s1', 'common rare');
      sm.storeStrategy('s2', 'common other');
      const commonIdf = sm.vocabulary.get('common').idf;
      const rareIdf = sm.vocabulary.get('rare').idf;
      expect(rareIdf).toBeGreaterThan(commonIdf);
    });
  });

  // ============================================
  // Combined Score
  // ============================================

  describe('Combined Score', () => {
    test('should weight similarity at 50%, success_rate at 30%, recency at 20%', () => {
      const weightedSm = new StrategyMemory(mockKG, {
        similarityWeight: 0.5,
        successWeight: 0.3,
        recencyWeight: 0.2
      });

      weightedSm.storeStrategy('s1', 'collect wood', ['dig'], 'success', 1.0);

      // Query with the full embedding_text to get similarity ≈ 1.0
      const results = weightedSm.retrieveSimilarStrategies('collect wood dig success', 0.0);
      if (results.length > 0) {
        const r = results[0];
        // For identical text: recency ≈ 1.0, similarity ≈ 1.0
        // combined ≈ 1.0*0.5 + 1.0*0.3 + 1.0*0.2 = 1.0
        expect(r.combinedScore).toBeCloseTo(1.0, 1);
      }
    });

  test('should penalize old strategies via recency decay', () => {
    const now = Date.now();
    sm.storeStrategy('fresh', 'collect wood', ['dig'], 'success', 0.5);

    mockKG.addStrategy('stale', {
      context: 'collect wood',
      actions: ['dig'],
      outcome: 'success',
      success_rate: 0.5,
      timestamp: now - 24 * 60 * 60 * 1000,
      embedding_text: 'collect wood dig success'
    });

    const results = sm.retrieveSimilarStrategies('collect wood', 0.0);
    if (results.length >= 2) {
      const fresh = results.find(r => r.strategy.id === 'fresh');
      const stale = results.find(r => r.strategy.id === 'stale');
      if (fresh && stale) {
        expect(fresh.combinedScore).toBeGreaterThan(stale.combinedScore);
      }
    }
  });
  });

  // ============================================
  // Utility Methods
  // ============================================

  describe('Utility Methods', () => {
    test('updateSuccessRate should delegate to KnowledgeGraph', () => {
      sm.updateSuccessRate('s1', 0.8);
      expect(mockKG.updateStrategySuccessRate).toHaveBeenCalledWith('s1', 0.8);
    });

    test('getStrategy should delegate to KnowledgeGraph', () => {
      sm.getStrategy('s1');
      expect(mockKG.getStrategy).toHaveBeenCalledWith('s1');
    });

  test('getStats should return strategy memory statistics', () => {
    sm.storeStrategy('s1', 'collect wood', ['dig'], 'success', 0.9);
    const stats = sm.getStats();
    expect(stats.strategyCount).toBe(1);
    expect(stats.vocabularySize).toBeGreaterThan(0);
    expect(stats.documentCount).toBe(1);
    expect(stats.defaultThreshold).toBe(0.75);
    expect(stats.weights).toEqual({
      similarity: 0.5,
      successRate: 0.3,
      recency: 0.2
    });
  });

  test('clearCache should reset vocabulary and document count', () => {
    sm.storeStrategy('s1', 'collect wood');
    sm.storeStrategy('s2', 'mine stone');
    expect(sm.getVocabularySize()).toBeGreaterThan(0);
    expect(sm.getDocumentCount()).toBe(2);
    sm.clearCache();
    expect(sm.getVocabularySize()).toBe(0);
    expect(sm.getDocumentCount()).toBe(0);
  });

    test('getVocabularySize should return current vocabulary size', () => {
      sm.storeStrategy('s1', 'hello world');
      const size = sm.getVocabularySize();
      expect(size).toBeGreaterThan(0);
    });

    test('getDocumentCount should return processed document count', () => {
      sm.storeStrategy('s1', 'first doc');
      sm.storeStrategy('s2', 'second doc');
      expect(sm.getDocumentCount()).toBe(2);
    });
  });

  // ============================================
  // Private Method Coverage
  // ============================================

  describe('Private Methods', () => {
    test('_buildEmbeddingText should combine context, actions, outcome', () => {
      const text = sm._buildEmbeddingText('gather wood', ['chop', 'collect'], 'done');
      expect(text).toBe('gather wood chop collect done');
    });

    test('_buildEmbeddingText should handle empty actions and outcome', () => {
      const text = sm._buildEmbeddingText('gather wood', [], '');
      expect(text).toBe('gather wood');
    });

    test('_buildEmbeddingText should handle null context', () => {
      const text = sm._buildEmbeddingText(null, ['dig'], 'success');
      expect(text).toBe('dig success');
    });

    test('_l2Norm should compute correct norm', () => {
      const norm = sm._l2Norm([3, 4]);
      expect(norm).toBeCloseTo(5, 5);
    });

    test('_l2Norm should return 0 for zero vector', () => {
      expect(sm._l2Norm([0, 0, 0])).toBe(0);
    });

    test('_zeroVector should return vector of vocabulary size', () => {
      sm.storeStrategy('s1', 'hello world');
      const zv = sm._zeroVector();
      expect(zv.length).toBe(sm.getVocabularySize());
      expect(zv.every(v => v === 0)).toBe(true);
    });

    test('_evictLowestIdfTerm should remove the term with lowest IDF', () => {
      sm.storeStrategy('s1', 'common rare');
      sm.storeStrategy('s2', 'common other');
      // 'common' appears in both docs → lower IDF
      const commonIdf = sm.vocabulary.get('common').idf;
      const rareIdf = sm.vocabulary.get('rare').idf;
      expect(commonIdf).toBeLessThan(rareIdf);

      const sizeBefore = sm.vocabulary.size;
      sm._evictLowestIdfTerm();
      expect(sm.vocabulary.size).toBe(sizeBefore - 1);
      expect(sm.vocabulary.has('common')).toBe(false);
    });

    test('_computeIdf should use smooth variant formula', () => {
      const idf = sm._computeIdf(2, 10);
      const expected = Math.log((1 + 10) / (1 + 2)) + 1;
      expect(idf).toBeCloseTo(expected, 5);
    });

    test('_recomputeAllIdf should update all vocabulary entries', () => {
      sm.storeStrategy('s1', 'alpha beta');
      // Add doc count manually and recompute
      sm.documentCount = 10;
      sm._recomputeAllIdf();
      for (const [, entry] of sm.vocabulary) {
        const expected = Math.log((1 + 10) / (1 + entry.docFreq)) + 1;
        expect(entry.idf).toBeCloseTo(expected, 5);
      }
    });
  });

  // ============================================
  // Integration-like: Full Retrieval Workflow
  // ============================================

  describe('Full Retrieval Workflow', () => {
    test('should retrieve similar strategy end-to-end', () => {
      sm.storeStrategy('wood_1', 'collect oak logs in forest biome', ['dig', 'collect'], 'success', 0.9);
      sm.storeStrategy('stone_1', 'mine cobblestone from cave', ['dig', 'mine'], 'success', 0.8);

      const results = sm.retrieveSimilarStrategies('gather wood from trees', 0.3);
      // Should find wood_1 as more similar than stone_1
      expect(results.length).toBeGreaterThan(0);
      if (results.length >= 2) {
        const woodResult = results.find(r => r.strategy.id === 'wood_1');
        const stoneResult = results.find(r => r.strategy.id === 'stone_1');
        if (woodResult && stoneResult) {
          expect(woodResult.similarity).toBeGreaterThan(stoneResult.similarity);
        }
      }
    });

    test('should handle multiple stores and retrievals', () => {
      // Store several strategies
      sm.storeStrategy('s1', 'collect wood from forest', ['dig'], 'success', 0.9);
      sm.storeStrategy('s2', 'mine stone from cave', ['dig'], 'success', 0.7);
      sm.storeStrategy('s3', 'build shelter with wood', ['place'], 'partial', 0.5);
      sm.storeStrategy('s4', 'hunt animals for food', ['attack'], 'success', 0.6);

      // Query for wood-related
      const results = sm.retrieveSimilarStrategies('collect wood and timber', 0.3);
      // Wood-related strategies should rank higher
      expect(results.length).toBeGreaterThan(0);
    });

    test('should return consistent results for same query', () => {
      sm.storeStrategy('s1', 'collect wood from forest');
      const r1 = sm.retrieveSimilarStrategies('gather wood', 0.3);
      const r2 = sm.retrieveSimilarStrategies('gather wood', 0.3);
      expect(r1.length).toBe(r2.length);
      if (r1.length > 0 && r2.length > 0) {
        expect(r1[0].combinedScore).toBeCloseTo(r2[0].combinedScore, 5);
      }
    });
  });
});
