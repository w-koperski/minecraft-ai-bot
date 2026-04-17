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

 // ============================================
 // Persistence Methods
 // ============================================

 /**
  * Save graph to JSON file
  * @param {string} filePath - Optional custom file path
  * @returns {Promise<boolean>} - Success status
  */
 async save(filePath = null) {
   const fs = require('fs').promises;
   const path = require('path');
   const targetPath = filePath || path.join(process.cwd(), 'state', 'knowledge-graph.json');

   try {
     // Ensure state directory exists
     const stateDir = path.dirname(targetPath);
     await fs.mkdir(stateDir, { recursive: true });

     // Serialize nodes
     const nodes = [];
     this.graph.forEachNode((nodeId, attrs) => {
       nodes.push({ id: nodeId, ...attrs });
     });

     // Serialize edges
     const edges = [];
     this.graph.forEachEdge((edge, attrs, source, target) => {
       edges.push({ key: edge, source, target, ...attrs });
     });

     const data = {
       version: 1,
       savedAt: Date.now(),
       nodes,
       edges,
       stats: this.stats,
       accessOrder: Array.from(this.accessOrder.entries())
     };

     await fs.writeFile(targetPath, JSON.stringify(data, null, 2), 'utf8');
     logger.debug('KnowledgeGraph saved', { nodeCount: nodes.length, edgeCount: edges.length });
     return true;
   } catch (error) {
     logger.error('Failed to save KnowledgeGraph', { error: error.message });
     return false;
   }
 }

 /**
  * Load graph from JSON file
  * @param {string} filePath - Optional custom file path
  * @returns {Promise<boolean>} - Success status
  */
 async load(filePath = null) {
   const fs = require('fs').promises;
   const path = require('path');
   const targetPath = filePath || path.join(process.cwd(), 'state', 'knowledge-graph.json');

   try {
     // Check if file exists
     await fs.access(targetPath);

     // Read and parse file
     const content = await fs.readFile(targetPath, 'utf8');
     const data = JSON.parse(content);

     // Validate version
     if (!data.version || data.version !== 1) {
       logger.warn('Unknown knowledge-graph file version, starting fresh', { version: data.version });
       return false;
     }

     // Clear existing graph
     this.graph = new Graph({ type: 'directed' });
     this.accessOrder.clear();

     // Restore nodes
     if (data.nodes && Array.isArray(data.nodes)) {
       for (const node of data.nodes) {
         const { id, ...attrs } = node;
         if (id) {
           this.graph.addNode(id, attrs);
         }
       }
     }

     // Restore edges
     if (data.edges && Array.isArray(data.edges)) {
       for (const edge of data.edges) {
         const { key, source, target, ...attrs } = edge;
         if (source && target) {
           try {
             // Use the original key if provided, otherwise let graphology generate one
             if (key && !this.graph.hasEdge(key)) {
               this.graph.addEdge(key, source, target, attrs);
             } else {
               this.graph.addEdge(source, target, attrs);
             }
           } catch (e) {
             // Edge might already exist or nodes missing, skip
             logger.debug('Skipping edge during load', { source, target, error: e.message });
           }
         }
       }
     }

     // Restore stats
     if (data.stats) {
       this.stats = { ...this.stats, ...data.stats };
     }

     // Restore access order
     if (data.accessOrder && Array.isArray(data.accessOrder)) {
       for (const [nodeId, timestamp] of data.accessOrder) {
         if (this.graph.hasNode(nodeId)) {
           this.accessOrder.set(nodeId, timestamp);
         }
       }
     }

     logger.debug('KnowledgeGraph loaded', {
       nodeCount: this.graph.order,
       edgeCount: this.graph.size
     });
     return true;
   } catch (error) {
     if (error.code === 'ENOENT') {
       logger.debug('No existing knowledge-graph file, starting fresh');
       return false;
     }
     logger.error('Failed to load KnowledgeGraph', { error: error.message });
     return false;
   }
 }

 // ============================================
 // Memory Type Methods (Task 10)
  // ============================================

  /**
   * Add a spatial memory (location, biome, structure)
   * @param {string} name - Location name or identifier
   * @param {object} coordinates - { x, y, z }
   * @param {string} biome - Biome type
   * @param {number} timestamp - When this memory was formed
   * @returns {boolean} - Success status
   */
  addSpatialMemory(name, coordinates, biome, timestamp = Date.now()) {
    if (!name || !coordinates) {
      logger.warn('addSpatialMemory requires name and coordinates', { name, coordinates });
      return false;
    }

    const id = `spatial_${name}_${timestamp}`;
    const properties = {
      category: 'location',
      name,
      coordinates: { ...coordinates },
      biome: biome || 'unknown',
      last_visited: timestamp
    };

    const result = this.addEntity(id, 'spatial_memory', properties);
    
    // Create index entries for fast lookup
    if (result && biome) {
      this._addSpatialIndex(id, biome, coordinates);
    }

    return result;
  }

  /**
   * Add a temporal memory (event sequence, pattern)
   * @param {string} event - Event name or type
   * @param {number} timestamp - When this event occurred
   * @param {number} sequence - Sequence number in a series
   * @returns {boolean} - Success status
   */
  addTemporalMemory(event, timestamp = Date.now(), sequence = 0) {
    if (!event) {
      logger.warn('addTemporalMemory requires event');
      return false;
    }

    const id = `temporal_${event}_${timestamp}`;
    const properties = {
      category: 'event_sequence',
      event,
      timestamp,
      sequence,
      pattern: null // Can be set later if pattern detected
    };

    return this.addEntity(id, 'temporal_memory', properties);
  }

  /**
   * Add an episodic memory (experience with full context)
   * @param {string} experience - Description of what happened
   * @param {Array} participants - Who was involved [{ type, identifier, role }]
   * @param {object} location - Where it happened { x, y, z, dimension, biome }
   * @param {number} timestamp - When it happened
   * @param {number} importance - Importance score (1-10, default 5)
   * @returns {boolean} - Success status
   */
  addEpisodicMemory(experience, participants = [], location = null, timestamp = Date.now(), importance = 5) {
    if (!experience) {
      logger.warn('addEpisodicMemory requires experience');
      return false;
    }

    const id = `episodic_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
    const properties = {
      category: 'experience',
      experience,
      participants: participants || [],
      location: location || { x: 0, y: 0, z: 0, dimension: 'overworld', biome: 'unknown' },
      timestamp,
      importance: Math.max(1, Math.min(10, importance)),
      memory_tier: 'stm' // Short-term memory initially
    };

    const result = this.addEntity(id, 'episodic_memory', properties, { valid_from: new Date(timestamp).toISOString() });

    // Link to participant entities if they exist
    if (result && participants) {
      participants.forEach(p => {
        const participantId = p.identifier;
        if (this.graph.hasNode(participantId)) {
          this.addRelation(id, participantId, 'INVOLVES', { role: p.role });
        }
      });
    }

    return result;
  }

  /**
   * Add a semantic memory (fact, rule, relationship)
   * @param {string} fact - The fact or rule
   * @param {string} category - Category (fact, rule, relationship, preference, recipe)
   * @param {number} confidence - Confidence level (0-1)
   * @param {number} timestamp - When this was learned
   * @returns {boolean} - Success status
   */
  addSemanticMemory(fact, category = 'fact', confidence = 1.0, timestamp = Date.now()) {
    if (!fact) {
      logger.warn('addSemanticMemory requires fact');
      return false;
    }

    const id = `semantic_${category}_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
    const properties = {
      category,
      subject: this._extractSubject(fact),
      predicate: this._extractPredicate(fact),
      object: this._extractObject(fact),
      confidence: Math.max(0, Math.min(1, confidence)),
      source: 'direct_learning',
      expiry: null
    };

    return this.addEntity(id, 'semantic_memory', properties);
  }

  // ============================================
  // Memory Query Methods
  // ============================================

  /**
   * Get spatial memories filtered by criteria
   * @param {object} filter - Filter criteria { biome, name, near: { x, y, z, radius } }
   * @returns {Array} - Matching spatial memories
   */
  getSpatialMemories(filter = {}) {
    const { biome, name, near } = filter;
    const memories = this.filterByType('spatial_memory');
    
    return memories.filter(m => {
      const props = m.properties;
      
      // Filter by biome
      if (biome && props.biome !== biome) return false;
      
      // Filter by name (partial match)
      if (name && !props.name.toLowerCase().includes(name.toLowerCase())) return false;
      
      // Filter by proximity
      if (near && props.coordinates) {
        const coords = props.coordinates;
        const dx = coords.x - near.x;
        const dy = coords.y - near.y;
        const dz = coords.z - near.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (distance > near.radius) return false;
      }
      
      return true;
    }).map(m => ({
      id: m.id,
      ...m.properties
    }));
  }

  /**
   * Get temporal memories filtered by criteria
   * @param {object} filter - Filter criteria { event, fromTime, toTime, pattern }
   * @returns {Array} - Matching temporal memories
   */
  getTemporalMemories(filter = {}) {
    const { event, fromTime, toTime, pattern } = filter;
    const memories = this.filterByType('temporal_memory');
    
    return memories.filter(m => {
      const props = m.properties;
      
      // Filter by event type (partial match)
      if (event && !props.event.toLowerCase().includes(event.toLowerCase())) return false;
      
      // Filter by time range
      if (fromTime && props.timestamp < fromTime) return false;
      if (toTime && props.timestamp > toTime) return false;
      
      // Filter by pattern
      if (pattern && props.pattern !== pattern) return false;
      
      return true;
    }).map(m => ({
      id: m.id,
      ...m.properties
    })).sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get episodic memories filtered by criteria
   * @param {object} filter - Filter criteria { participant, location, category, minImportance }
   * @returns {Array} - Matching episodic memories
   */
  getEpisodicMemories(filter = {}) {
    const { participant, location, category, minImportance, memoryTier } = filter;
    const memories = this.filterByType('episodic_memory');
    
    return memories.filter(m => {
      const props = m.properties;
      
      // Filter by participant
      if (participant) {
        const hasParticipant = props.participants.some(p => 
          p.identifier === participant || p.type === participant
        );
        if (!hasParticipant) return false;
      }
      
      // Filter by location (nearby)
      if (location && props.location) {
        const coords = props.location;
        const dx = coords.x - location.x;
        const dy = coords.y - location.y;
        const dz = coords.z - location.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (distance > location.radius) return false;
      }
      
      // Filter by category
      if (category && props.category !== category) return false;
      
      // Filter by importance
      if (minImportance && props.importance < minImportance) return false;
      
      // Filter by memory tier
      if (memoryTier && props.memory_tier !== memoryTier) return false;
      
      return true;
    }).map(m => ({
      id: m.id,
      ...m.properties
    })).sort((a, b) => b.importance - a.importance);
  }

  /**
   * Get semantic memories filtered by criteria
   * @param {object} filter - Filter criteria { category, subject, minConfidence }
   * @returns {Array} - Matching semantic memories
   */
  getSemanticMemories(filter = {}) {
    const { category, subject, minConfidence, predicate } = filter;
    const memories = this.filterByType('semantic_memory');
    
    return memories.filter(m => {
      const props = m.properties;
      
      // Filter by category
      if (category && props.category !== category) return false;
      
      // Filter by subject (partial match)
      if (subject && !props.subject.toLowerCase().includes(subject.toLowerCase())) return false;
      
      // Filter by predicate
      if (predicate && !props.predicate.toLowerCase().includes(predicate.toLowerCase())) return false;
      
      // Filter by confidence
      if (minConfidence && props.confidence < minConfidence) return false;
      
      return true;
    }).map(m => ({
      id: m.id,
      ...m.properties
    })).sort((a, b) => b.confidence - a.confidence);
  }

  // ============================================
  // Memory Consolidation
  // ============================================

  /**
   * Consolidate memories: STM → Episodic → LTM
   * Moves memories based on age and importance
   * @param {object} options - Consolidation options { stmToEpisodicMs, episodicToLtmMs }
   * @returns {object} - Consolidation stats { stmToEpisodic, episodicToLtm, dropped }
   */
  consolidate(options = {}) {
    const now = Date.now();
    const stmToEpisodicMs = options.stmToEpisodicMs || 60 * 60 * 1000; // 1 hour
    const episodicToLtmMs = options.episodicToLtmMs || 24 * 60 * 60 * 1000; // 24 hours
    
    const stats = {
      stmToEpisodic: 0,
      episodicToLtm: 0,
      dropped: 0
    };

    // Get all episodic memories
    const episodicMemories = this.filterByType('episodic_memory');
    
    for (const memory of episodicMemories) {
      const props = memory.properties;
      const age = now - props.timestamp;
      const id = memory.id;
      
      // STM → Episodic (after 1 hour, if importance >= 3)
      if (props.memory_tier === 'stm') {
        if (age > stmToEpisodicMs && props.importance >= 3) {
          this.updateEntity(id, { memory_tier: 'episodic' });
          stats.stmToEpisodic++;
        } else if (age > stmToEpisodicMs && props.importance < 3) {
          // Drop trivial STM memories
          this.deleteEntity(id);
          stats.dropped++;
        }
      }
      // Episodic → LTM (after 24 hours, if importance >= 6)
      else if (props.memory_tier === 'episodic') {
        if (age > episodicToLtmMs && props.importance >= 6) {
          this.updateEntity(id, { memory_tier: 'ltm' });
          stats.episodicToLtm++;
        } else if (age > episodicToLtmMs && props.importance < 6) {
          // Drop less important episodic memories
          this.deleteEntity(id);
          stats.dropped++;
        }
      }
    }

if (stats.stmToEpisodic > 0 || stats.episodicToLtm > 0 || stats.dropped > 0) {
     logger.info('Memory consolidation complete', stats);
   }

   if (process.env.ENABLE_AUTO_CONSOLIDATION === 'true') {
     this.save().catch(err => logger.error('Auto-save failed after consolidation', { error: err.message }));
   }

   return stats;
 }

  /**
   * Get memory tier statistics
   * @returns {object} - { stm: count, episodic: count, ltm: count }
   */
  getMemoryTierStats() {
    const episodicMemories = this.filterByType('episodic_memory');
    const stats = { stm: 0, episodic: 0, ltm: 0 };
    
    for (const memory of episodicMemories) {
      const tier = memory.properties.memory_tier || 'stm';
      stats[tier]++;
    }
    
    return stats;
  }

  // ============================================
  // Helper Methods for Memory Types
  // ============================================

  /**
   * Add spatial index for fast biome/location lookup
   * @private
   */
  _addSpatialIndex(spatialId, biome, coordinates) {
    // Create a biome index node if it doesn't exist
    const biomeIndexId = `spatial_index_biome_${biome}`;
    if (!this.graph.hasNode(biomeIndexId)) {
      this.addEntity(biomeIndexId, 'spatial_index', { biome });
    }
    
    // Link spatial memory to biome index
    this.addRelation(spatialId, biomeIndexId, 'IN_BIOME');
  }

  /**
   * Extract subject from fact string (simple implementation)
   * @private
   */
  _extractSubject(fact) {
    const parts = fact.split(/[is|are|has|have|can|does|will|should]/);
    return parts[0]?.trim() || fact;
  }

  /**
   * Extract predicate from fact string
   * @private
   */
  _extractPredicate(fact) {
    const match = fact.match(/(is|are|has|have|can|does|will|should)/);
    return match ? match[1] : 'relates';
  }

  /**
   * Extract object from fact string
   * @private
   */
  _extractObject(fact) {
    const parts = fact.split(/[is|are|has|have|can|does|will|should]/);
    return parts[1]?.trim() || '';
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
