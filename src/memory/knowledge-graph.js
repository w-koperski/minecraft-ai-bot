/**
 * Knowledge Graph - In-memory graph with temporal validity and LRU eviction
 * 
 * Features:
 * - Entity and relation storage with graphology
 * - Temporal validity filtering (valid_from/valid_until)
 * - LRU eviction when exceeding max nodes (default: 10,000)
 * - Query methods: getNeighbors, findPath, filterByType, queryByTime
 * - P99 latency <10ms (validated in Task 3)
 */

const Graph = require('graphology');
const { bidirectional } = require('graphology-shortest-path');
const logger = require('../utils/logger');

const DEFAULT_MAX_NODES = 10000;

class KnowledgeGraph {
  constructor(options = {}) {
    this.graph = new Graph({ type: 'directed' });
    this.maxNodes = options.maxNodes || DEFAULT_MAX_NODES;
    this.accessOrder = new Map(); // nodeId -> lastAccessTime (for LRU)
    this.stats = {
      entitiesAdded: 0,
      relationsAdded: 0,
      nodesEvicted: 0,
      queriesRun: 0
    };
    
    logger.debug('KnowledgeGraph initialized', { maxNodes: this.maxNodes });
  }

  /**
   * Add an entity (node) to the graph
   * @param {string} id - Unique entity ID
   * @param {string} type - Entity type (player, location, item, etc.)
   * @param {object} properties - Entity properties
   * @param {object} temporal - Temporal validity { valid_from, valid_until }
   * @returns {boolean} - Success status
   */
  addEntity(id, type, properties = {}, temporal = {}) {
    if (!id || !type) {
      logger.warn('addEntity requires id and type', { id, type });
      return false;
    }

    // Check if we need to evict before adding
    if (this.graph.order >= this.maxNodes && !this.graph.hasNode(id)) {
      this._evictLRU();
    }

    const now = Date.now();
    const validFrom = temporal.valid_from ? new Date(temporal.valid_from).getTime() : now;
    const validUntil = temporal.valid_until ? new Date(temporal.valid_until).getTime() : null;

    if (this.graph.hasNode(id)) {
      this.graph.mergeNodeAttributes(id, {
        type,
        properties: { ...properties },
        validFrom,
        validUntil,
        lastAccessed: now
      });
      this.accessOrder.set(id, now);
      logger.debug('Entity updated', { id, type });
      return true;
    }

    this.graph.addNode(id, {
      type,
      properties: { ...properties },
      validFrom,
      validUntil,
      createdAt: now,
      lastAccessed: now
    });

    this.accessOrder.set(id, now);
    this.stats.entitiesAdded++;

    logger.debug('Entity added', { id, type, validFrom, validUntil });
    return true;
  }

  /**
   * Add a relation (edge) between two entities
   * @param {string} from - Source entity ID
   * @param {string} to - Target entity ID
   * @param {string} relationType - Type of relation (FRIEND, LOCATED_AT, etc.)
   * @param {object} metadata - Additional metadata
   * @param {object} temporal - Temporal validity { valid_from, valid_until }
   * @returns {boolean} - Success status
   */
  addRelation(from, to, relationType, metadata = {}, temporal = {}) {
    if (!from || !to || !relationType) {
      logger.warn('addRelation requires from, to, and relationType', { from, to, relationType });
      return false;
    }

    // Ensure both nodes exist
    if (!this.graph.hasNode(from) || !this.graph.hasNode(to)) {
      logger.warn('Cannot add relation: node(s) missing', { from, to });
      return false;
    }

    const now = Date.now();
    const validFrom = temporal.valid_from ? new Date(temporal.valid_from).getTime() : now;
    const validUntil = temporal.valid_until ? new Date(temporal.valid_until).getTime() : null;

    // Generate unique edge key
    const edgeKey = `${from}-${relationType}-${to}-${now}`;

    try {
      this.graph.addEdge(from, to, {
        relationType,
        metadata: { ...metadata },
        validFrom,
        validUntil,
        createdAt: now
      });

      this.stats.relationsAdded++;

      // Update access times for both nodes
      this._touchNode(from);
      this._touchNode(to);

      logger.debug('Relation added', { from, to, relationType, validFrom, validUntil });
      return true;
    } catch (error) {
      logger.error('Failed to add relation', { error: error.message, from, to, relationType });
      return false;
    }
  }

  /**
   * Get neighbors of a node, optionally filtered by relation type
   * @param {string} nodeId - Node ID to query
   * @param {string} relationType - Optional relation type filter
   * @param {object} options - Query options { timestamp, direction }
   * @returns {Array} - Array of neighbor node IDs
   */
  getNeighbors(nodeId, relationType = null, options = {}) {
    const { timestamp, direction = 'out' } = options;
    const queryTime = timestamp ? new Date(timestamp).getTime() : Date.now();

    if (!this.graph.hasNode(nodeId)) {
      logger.debug('Node not found for getNeighbors', { nodeId });
      return [];
    }

    this._touchNode(nodeId);
    this.stats.queriesRun++;

    const neighbors = [];

    const getEdges = direction === 'in' ? this.graph.inEdges.bind(this.graph) :
                     direction === 'both' ? (id) => [...this.graph.inEdges(id), ...this.graph.outEdges(id)] :
                     this.graph.outEdges.bind(this.graph);

    try {
      const edges = getEdges(nodeId);
      
      for (const edge of edges) {
        const edgeAttrs = this.graph.getEdgeAttributes(edge);
        
        // Filter by relation type
        if (relationType && edgeAttrs.relationType !== relationType) {
          continue;
        }

        // Filter by temporal validity
        if (!this._isValidAt(edgeAttrs, queryTime)) {
          continue;
        }

        const neighborId = direction === 'in' ? this.graph.source(edge) : this.graph.target(edge);
        const neighborAttrs = this.graph.getNodeAttributes(neighborId);

        // Also check node validity
        if (!this._isValidAt(neighborAttrs, queryTime)) {
          continue;
        }

        neighbors.push({
          id: neighborId,
          relationType: edgeAttrs.relationType,
          properties: neighborAttrs.properties,
          metadata: edgeAttrs.metadata
        });
      }

      return neighbors;
    } catch (error) {
      logger.error('getNeighbors failed', { error: error.message, nodeId });
      return [];
    }
  }

  /**
   * Find shortest path between two nodes
   * @param {string} fromId - Source node ID
   * @param {string} toId - Target node ID
   * @param {object} options - Query options { timestamp }
   * @returns {Array|null} - Array of node IDs in path, or null if no path
   */
  findPath(fromId, toId, options = {}) {
    const { timestamp } = options;
    const queryTime = timestamp ? new Date(timestamp).getTime() : Date.now();

    if (!this.graph.hasNode(fromId) || !this.graph.hasNode(toId)) {
      logger.debug('findPath: node(s) missing', { fromId, toId });
      return null;
    }

    this._touchNode(fromId);
    this._touchNode(toId);
    this.stats.queriesRun++;

    // For temporal filtering, we need to create a subgraph
    const temporalGraph = this._createTemporalSubgraph(queryTime);

    try {
      const path = bidirectional(temporalGraph, fromId, toId);
      return path;
    } catch (error) {
      // No path found is normal, not an error
      return null;
    }
  }

  /**
   * Filter nodes by type
   * @param {string} type - Node type to filter
   * @param {object} options - Query options { timestamp }
   * @returns {Array} - Array of matching nodes
   */
  filterByType(type, options = {}) {
    const { timestamp } = options;
    const queryTime = timestamp ? new Date(timestamp).getTime() : Date.now();

    this.stats.queriesRun++;

    const matchingNodes = [];

    this.graph.forEachNode((nodeId, attrs) => {
      if (attrs.type !== type) return;
      if (!this._isValidAt(attrs, queryTime)) return;

      this._touchNode(nodeId);

      matchingNodes.push({
        id: nodeId,
        type: attrs.type,
        properties: attrs.properties,
        createdAt: attrs.createdAt
      });
    });

    return matchingNodes;
  }

  /**
   * Query by timestamp - get all entities/relations valid at a point in time
   * @param {string|number} timestamp - ISO timestamp or epoch ms
   * @returns {object} - { entities, relations }
   */
  queryByTime(timestamp) {
    const queryTime = new Date(timestamp).getTime();

    this.stats.queriesRun++;

    const entities = [];
    const relations = [];

    // Get all valid entities
    this.graph.forEachNode((nodeId, attrs) => {
      if (!this._isValidAt(attrs, queryTime)) return;

      this._touchNode(nodeId);
      entities.push({
        id: nodeId,
        type: attrs.type,
        properties: attrs.properties,
        validFrom: attrs.validFrom,
        validUntil: attrs.validUntil
      });
    });

    // Get all valid relations
    this.graph.forEachEdge((edge, attrs, source, target) => {
      if (!this._isValidAt(attrs, queryTime)) return;

      const sourceAttrs = this.graph.getNodeAttributes(source);
      const targetAttrs = this.graph.getNodeAttributes(target);

      if (!this._isValidAt(sourceAttrs, queryTime) || !this._isValidAt(targetAttrs, queryTime)) {
        return;
      }

      relations.push({
        from: source,
        to: target,
        relationType: attrs.relationType,
        metadata: attrs.metadata,
        validFrom: attrs.validFrom,
        validUntil: attrs.validUntil
      });
    });

    return { entities, relations };
  }

  /**
   * Get entity by ID
   * @param {string} id - Entity ID
   * @param {object} options - Query options { timestamp }
   * @returns {object|null} - Entity data or null
   */
  getEntity(id, options = {}) {
    const { timestamp } = options;
    const queryTime = timestamp ? new Date(timestamp).getTime() : Date.now();

    if (!this.graph.hasNode(id)) {
      return null;
    }

    const attrs = this.graph.getNodeAttributes(id);

    if (!this._isValidAt(attrs, queryTime)) {
      return null;
    }

    this._touchNode(id);

    return {
      id,
      type: attrs.type,
      properties: attrs.properties,
      validFrom: attrs.validFrom,
      validUntil: attrs.validUntil,
      createdAt: attrs.createdAt
    };
  }

  /**
   * Update entity properties
   * @param {string} id - Entity ID
   * @param {object} updates - Properties to update
   * @returns {boolean} - Success status
   */
  updateEntity(id, updates) {
    if (!this.graph.hasNode(id)) {
      logger.warn('updateEntity: node not found', { id });
      return false;
    }

    const current = this.graph.getNodeAttributes(id);
    
    this.graph.mergeNodeAttributes(id, {
      properties: { ...current.properties, ...updates },
      lastAccessed: Date.now()
    });

    this._touchNode(id);
    
    return true;
  }

  /**
   * Delete entity and all its edges
   * @param {string} id - Entity ID
   * @returns {boolean} - Success status
   */
  deleteEntity(id) {
    if (!this.graph.hasNode(id)) {
      return false;
    }

    this.graph.dropNode(id);
    this.accessOrder.delete(id);
    
    return true;
  }

  /**
   * Get graph statistics
   * @returns {object} - Statistics
   */
  getStats() {
    return {
      ...this.stats,
      nodeCount: this.graph.order,
      edgeCount: this.graph.size,
      maxNodes: this.maxNodes
    };
  }

  /**
   * Clear all data
   */
  clear() {
    this.graph = new Graph({ type: 'directed' });
    this.accessOrder.clear();
    this.stats = {
      entitiesAdded: 0,
      relationsAdded: 0,
      nodesEvicted: 0,
      queriesRun: 0
    };
    logger.debug('KnowledgeGraph cleared');
  }

  // Private methods

  /**
   * Check if an entity/relation is valid at a given timestamp
   * @private
   */
  _isValidAt(attrs, timestamp) {
    // validFrom must be <= timestamp
    if (attrs.validFrom && attrs.validFrom > timestamp) {
      return false;
    }
    // validUntil must be null or >= timestamp
    if (attrs.validUntil && attrs.validUntil < timestamp) {
      return false;
    }
    return true;
  }

  /**
   * Update last access time for LRU tracking
   * @private
   */
  _touchNode(nodeId) {
    const now = Date.now();
    this.accessOrder.set(nodeId, now);
    
    if (this.graph.hasNode(nodeId)) {
      this.graph.mergeNodeAttributes(nodeId, { lastAccessed: now });
    }
  }

  /**
   * Evict least recently used node
   * @private
   */
  _evictLRU() {
    if (this.accessOrder.size === 0) return;

    // Find the oldest accessed node
    let oldestId = null;
    let oldestTime = Infinity;

    for (const [id, time] of this.accessOrder) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestId = id;
      }
    }

    if (oldestId && this.graph.hasNode(oldestId)) {
      this.graph.dropNode(oldestId);
      this.accessOrder.delete(oldestId);
      this.stats.nodesEvicted++;
      logger.debug('LRU eviction', { nodeId: oldestId, lastAccessed: oldestTime });
    }
  }

  /**
   * Create a subgraph with only temporally valid edges
   * @private
   */
  _createTemporalSubgraph(queryTime) {
    const subgraph = new Graph({ type: 'directed' });

    // Add all valid nodes
    this.graph.forEachNode((nodeId, attrs) => {
      if (this._isValidAt(attrs, queryTime)) {
        subgraph.addNode(nodeId, attrs);
      }
    });

    // Add all valid edges between valid nodes
    this.graph.forEachEdge((edge, attrs, source, target) => {
      if (!this._isValidAt(attrs, queryTime)) return;
      if (!subgraph.hasNode(source) || !subgraph.hasNode(target)) return;

      try {
        subgraph.addEdge(source, target, attrs);
      } catch (e) {
        // Edge might already exist, skip
      }
    });

    return subgraph;
  }
}

module.exports = KnowledgeGraph;
