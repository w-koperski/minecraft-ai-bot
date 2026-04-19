const logger = require('../utils/logger');

class StrategyMemory {
  constructor(knowledgeGraph, options = {}) {
    if (!knowledgeGraph) {
      throw new Error('StrategyMemory requires a KnowledgeGraph instance');
    }

    this.knowledgeGraph = knowledgeGraph;
    this.defaultThreshold = options.defaultThreshold || 0.75;
    this.maxVocabularySize = options.maxVocabularySize || 5000;
    this.recencyWeight = options.recencyWeight || 0.2;
    this.successWeight = options.successWeight || 0.3;
    this.similarityWeight = options.similarityWeight || 0.5;

    this.vocabulary = new Map();
    this.documentCount = 0;

    logger.debug('StrategyMemory initialized', {
      defaultThreshold: this.defaultThreshold,
      maxVocabularySize: this.maxVocabularySize
    });
  }

  storeStrategy(strategyId, context, actions = [], outcome = '', successRate = 0, extra = {}) {
    if (!strategyId) {
      logger.warn('storeStrategy requires strategyId');
      return false;
    }

    const textForEmbedding = this._buildEmbeddingText(context, actions, outcome);

    // Rebuild vocabulary from all stored strategies then add current doc
    this._rebuildVocabulary();
    this._addToVocabulary(textForEmbedding);

    const result = this.knowledgeGraph.addStrategy(strategyId, {
      context,
      actions,
      outcome,
      success_rate: successRate,
      timestamp: Date.now(),
      embedding_text: textForEmbedding,
      ...extra
    });

    if (result) {
      logger.debug('Strategy stored', { strategyId, textLen: textForEmbedding.length });
    }

    return result;
  }

  retrieveSimilarStrategies(queryContext, threshold = null, options = {}) {
    const simThreshold = threshold !== null ? threshold : this.defaultThreshold;
    const limit = options.limit || 10;
    const includeMetadata = options.includeMetadata !== false;

    if (!queryContext || typeof queryContext !== 'string') {
      logger.warn('retrieveSimilarStrategies requires queryContext string');
      return [];
    }

    const strategies = this.knowledgeGraph.filterByType('strategy_memory');

    if (strategies.length === 0) {
      logger.debug('No strategy memories found for retrieval');
      return [];
    }

    // Rebuild vocabulary so query and stored embeddings use identical vocabulary/IDF
    this._rebuildVocabulary();
    const queryEmbedding = this.generateEmbedding(queryContext);

    const now = Date.now();
    const results = [];

    for (const strategy of strategies) {
      const props = strategy.properties;
      const embeddingText = props.embedding_text;

      if (!embeddingText || typeof embeddingText !== 'string') {
        continue;
      }

      // Re-embed from embedding_text using current vocabulary
      const storedEmbedding = this.generateEmbedding(embeddingText);

      if (storedEmbedding.length === 0 || storedEmbedding.every(v => v === 0)) {
        continue;
      }

      const similarity = this.cosineSimilarity(queryEmbedding, storedEmbedding);

      if (similarity < simThreshold) {
        continue;
      }

      const ageMs = now - (props.timestamp || now);
      const ageHours = ageMs / (1000 * 60 * 60);
      const recency = Math.pow(0.5, ageHours / 24);

      const successRate = typeof props.success_rate === 'number' ? props.success_rate : 0;

      const combinedScore =
        similarity * this.similarityWeight +
        successRate * this.successWeight +
        recency * this.recencyWeight;

      const result = {
        strategy: {
          id: strategy.id,
          context: props.context,
          actions: props.actions,
          outcome: props.outcome,
          timestamp: props.timestamp
        },
        similarity,
        combinedScore
      };

      if (includeMetadata) {
        result.success_rate = successRate;
        result.age = ageMs;
      }

      results.push(result);
    }

    results.sort((a, b) => b.combinedScore - a.combinedScore);
    const limited = results.slice(0, limit);

    logger.debug('Strategy retrieval complete', {
      queryContext: queryContext.substring(0, 50),
      threshold: simThreshold,
      candidates: strategies.length,
      matches: results.length,
      returned: limited.length
    });

    return limited;
  }

  updateSuccessRate(strategyId, successRate) {
    return this.knowledgeGraph.updateStrategySuccessRate(strategyId, successRate);
  }

  getStrategy(strategyId) {
    return this.knowledgeGraph.getStrategy(strategyId);
  }

  generateEmbedding(text) {
    if (!text || typeof text !== 'string') {
      return this._zeroVector();
    }

    const tokens = this._tokenize(text);
    const termFreqs = this._computeTermFrequencies(tokens);

    const embedding = new Array(this.vocabulary.size).fill(0);

    let idx = 0;
    for (const [term, vocabEntry] of this.vocabulary) {
      if (termFreqs.has(term)) {
        const tf = termFreqs.get(term);
        const idf = vocabEntry.idf;
        embedding[idx] = tf * idf;
      }
      idx++;
    }

    const norm = this._l2Norm(embedding);
    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= norm;
      }
    }

    return embedding;
  }

  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length || a.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  getVocabularySize() {
    return this.vocabulary.size;
  }

  getDocumentCount() {
    return this.documentCount;
  }

  getStats() {
    const strategies = this.knowledgeGraph.filterByType('strategy_memory');
    return {
      strategyCount: strategies.length,
      vocabularySize: this.vocabulary.size,
      documentCount: this.documentCount,
      defaultThreshold: this.defaultThreshold,
      weights: {
        similarity: this.similarityWeight,
        successRate: this.successWeight,
        recency: this.recencyWeight
      }
    };
  }

  clearCache() {
    this.vocabulary.clear();
    this.documentCount = 0;
  }

  _rebuildVocabulary() {
    this.vocabulary.clear();
    this.documentCount = 0;

    const strategies = this.knowledgeGraph.filterByType('strategy_memory');
    for (const strategy of strategies) {
      const text = strategy.properties.embedding_text;
      if (text) {
        this._addToVocabulary(text);
      }
    }
  }

  _buildEmbeddingText(context, actions, outcome) {
    const parts = [context || ''];
    if (Array.isArray(actions) && actions.length > 0) {
      parts.push(actions.join(' '));
    }
    if (outcome) {
      parts.push(outcome);
    }
    return parts.join(' ').trim();
  }

  _tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);
  }

  _computeTermFrequencies(tokens) {
    const freqs = new Map();
    if (tokens.length === 0) return freqs;

    for (const token of tokens) {
      freqs.set(token, (freqs.get(token) || 0) + 1);
    }

    const total = tokens.length;
    for (const [term, count] of freqs) {
      freqs.set(term, count / total);
    }

    return freqs;
  }

  _addToVocabulary(text) {
    const tokens = this._tokenize(text);
    const uniqueTerms = new Set(tokens);

    this.documentCount++;

    for (const term of uniqueTerms) {
      if (this.vocabulary.has(term)) {
        const entry = this.vocabulary.get(term);
        entry.docFreq++;
        entry.idf = this._computeIdf(entry.docFreq, this.documentCount);
      } else {
        if (this.vocabulary.size >= this.maxVocabularySize) {
          this._evictLowestIdfTerm();
        }

        this.vocabulary.set(term, {
          docFreq: 1,
          idf: this._computeIdf(1, this.documentCount)
        });
      }
    }

    this._recomputeAllIdf();
  }

  _computeIdf(docFreq, totalDocs) {
    return Math.log((1 + totalDocs) / (1 + docFreq)) + 1;
  }

  _recomputeAllIdf() {
    for (const [, entry] of this.vocabulary) {
      entry.idf = this._computeIdf(entry.docFreq, this.documentCount);
    }
  }

  _evictLowestIdfTerm() {
    let lowestIdf = Infinity;
    let lowestTerm = null;

    for (const [term, entry] of this.vocabulary) {
      if (entry.idf < lowestIdf) {
        lowestIdf = entry.idf;
        lowestTerm = term;
      }
    }

    if (lowestTerm) {
      this.vocabulary.delete(lowestTerm);
      logger.debug('Evicted low-IDF term from vocabulary', { term: lowestTerm, idf: lowestIdf });
    }
  }

  _zeroVector() {
    return new Array(this.vocabulary.size).fill(0);
  }

  _l2Norm(vec) {
    let sum = 0;
    for (let i = 0; i < vec.length; i++) {
      sum += vec[i] * vec[i];
    }
    return Math.sqrt(sum);
  }
}

module.exports = StrategyMemory;
