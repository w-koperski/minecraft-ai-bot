/**
 * Unit tests for KnowledgeGraph module
 * 
 * Coverage:
 * - CRUD operations (add/get/update/delete entities and relations)
 * - Query methods (getNeighbors, findPath, filterByType, queryByTime)
 * - Temporal validity filtering
 * - LRU eviction at max nodes
 * - Performance (P99 < 10ms)
 */

const KnowledgeGraph = require('../../src/memory/knowledge-graph');

describe('KnowledgeGraph', () => {
  let kg;

  beforeEach(() => {
    kg = new KnowledgeGraph();
  });

  afterEach(() => {
    kg.clear();
  });

  describe('Constructor', () => {
    test('should initialize with default max nodes', () => {
      expect(kg.maxNodes).toBe(10000);
      expect(kg.graph.order).toBe(0);
      expect(kg.graph.size).toBe(0);
    });

    test('should accept custom max nodes', () => {
      const customKg = new KnowledgeGraph({ maxNodes: 5000 });
      expect(customKg.maxNodes).toBe(5000);
    });

    test('should initialize empty stats', () => {
      const stats = kg.getStats();
      expect(stats.entitiesAdded).toBe(0);
      expect(stats.relationsAdded).toBe(0);
      expect(stats.nodesEvicted).toBe(0);
      expect(stats.queriesRun).toBe(0);
    });
  });

  describe('addEntity', () => {
    test('should add entity with id and type', () => {
      const result = kg.addEntity('player1', 'player');
      expect(result).toBe(true);
      expect(kg.graph.order).toBe(1);
      expect(kg.graph.hasNode('player1')).toBe(true);
    });

    test('should store entity properties', () => {
      kg.addEntity('player1', 'player', { name: 'Alice', health: 20 });
      const entity = kg.getEntity('player1');
      expect(entity.properties.name).toBe('Alice');
      expect(entity.properties.health).toBe(20);
    });

    test('should reject entity without id', () => {
      const result = kg.addEntity(null, 'player');
      expect(result).toBe(false);
      expect(kg.graph.order).toBe(0);
    });

    test('should reject entity without type', () => {
      const result = kg.addEntity('player1', null);
      expect(result).toBe(false);
    });

    test('should update existing entity', () => {
      kg.addEntity('player1', 'player', { health: 20 });
      kg.addEntity('player1', 'player', { health: 15, armor: 10 });
      
      const entity = kg.getEntity('player1');
      expect(entity.properties.health).toBe(15);
      expect(entity.properties.armor).toBe(10);
    });

    test('should increment entitiesAdded counter', () => {
      kg.addEntity('player1', 'player');
      kg.addEntity('player2', 'player');
      
      const stats = kg.getStats();
      expect(stats.entitiesAdded).toBe(2);
    });
  });

  describe('Temporal Validity - Entities', () => {
    test('should set validFrom to current time by default', () => {
      const before = Date.now();
      kg.addEntity('player1', 'player');
      const after = Date.now();
      
      const entity = kg.getEntity('player1');
      expect(entity.validFrom).toBeGreaterThanOrEqual(before);
      expect(entity.validFrom).toBeLessThanOrEqual(after);
    });

    test('should set validUntil to null by default', () => {
      kg.addEntity('player1', 'player');
      const entity = kg.getEntity('player1');
      expect(entity.validUntil).toBeNull();
    });

    test('should accept custom valid_from', () => {
      kg.addEntity('event1', 'event', {}, { valid_from: '2026-04-01' });
      const entity = kg.getEntity('event1');
      expect(entity.validFrom).toBe(new Date('2026-04-01').getTime());
    });

    test('should accept custom valid_until', () => {
      kg.addEntity('event1', 'event', {}, { valid_until: '2026-04-10' });
      const entity = kg.getEntity('event1');
      // Without timestamp filter, entity should be returned if validFrom <= now <= validUntil
      // But since validUntil is in past, entity is invalid when queried at current time
      // Check raw attributes via graph instead
      const attrs = kg.graph.getNodeAttributes('event1');
      expect(attrs.validUntil).toBe(new Date('2026-04-10').getTime());
    });

    test('should filter entity by timestamp - within range', () => {
      kg.addEntity('event1', 'event', {}, {
        valid_from: '2026-04-01',
        valid_until: '2026-04-10'
      });
      
      const entity = kg.getEntity('event1', { timestamp: '2026-04-05' });
      expect(entity).not.toBeNull();
    });

    test('should filter entity by timestamp - before valid_from', () => {
      kg.addEntity('event1', 'event', {}, {
        valid_from: '2026-04-01',
        valid_until: '2026-04-10'
      });
      
      const entity = kg.getEntity('event1', { timestamp: '2026-03-30' });
      expect(entity).toBeNull();
    });

    test('should filter entity by timestamp - after valid_until', () => {
      kg.addEntity('event1', 'event', {}, {
        valid_from: '2026-04-01',
        valid_until: '2026-04-10'
      });
      
      const entity = kg.getEntity('event1', { timestamp: '2026-04-15' });
      expect(entity).toBeNull();
    });
  });

  describe('addRelation', () => {
    test('should add relation between entities', () => {
      kg.addEntity('player1', 'player');
      kg.addEntity('player2', 'player');
      
      const result = kg.addRelation('player1', 'player2', 'FRIEND');
      expect(result).toBe(true);
      expect(kg.graph.size).toBe(1);
    });

    test('should reject relation without from', () => {
      kg.addEntity('player2', 'player');
      const result = kg.addRelation(null, 'player2', 'FRIEND');
      expect(result).toBe(false);
    });

    test('should reject relation without to', () => {
      kg.addEntity('player1', 'player');
      const result = kg.addRelation('player1', null, 'FRIEND');
      expect(result).toBe(false);
    });

    test('should reject relation without type', () => {
      kg.addEntity('player1', 'player');
      kg.addEntity('player2', 'player');
      const result = kg.addRelation('player1', 'player2', null);
      expect(result).toBe(false);
    });

    test('should reject relation if node missing', () => {
      kg.addEntity('player1', 'player');
      const result = kg.addRelation('player1', 'player2', 'FRIEND');
      expect(result).toBe(false);
    });

    test('should store relation metadata', () => {
      kg.addEntity('player1', 'player');
      kg.addEntity('player2', 'player');
      kg.addRelation('player1', 'player2', 'FRIEND', { since: '2026-01-01' });
      
      const neighbors = kg.getNeighbors('player1', 'FRIEND');
      expect(neighbors[0].metadata.since).toBe('2026-01-01');
    });

    test('should increment relationsAdded counter', () => {
      kg.addEntity('player1', 'player');
      kg.addEntity('player2', 'player');
      kg.addRelation('player1', 'player2', 'FRIEND');
      
      const stats = kg.getStats();
      expect(stats.relationsAdded).toBe(1);
    });
  });

  describe('Temporal Validity - Relations', () => {
    test('should filter relation by timestamp', () => {
      kg.addEntity('player1', 'player', {}, { valid_from: '2026-03-01' });
      kg.addEntity('player2', 'player', {}, { valid_from: '2026-03-01' });
      kg.addRelation('player1', 'player2', 'FRIEND', {}, {
        valid_from: '2026-04-01',
        valid_until: '2026-04-10'
      });
      
      const neighbors1 = kg.getNeighbors('player1', 'FRIEND', { timestamp: '2026-04-05' });
      expect(neighbors1.length).toBe(1);
      
      const neighbors2 = kg.getNeighbors('player1', 'FRIEND', { timestamp: '2026-04-15' });
      expect(neighbors2.length).toBe(0);
    });
  });

  describe('getNeighbors', () => {
    test('should return empty array for missing node', () => {
      const neighbors = kg.getNeighbors('nonexistent');
      expect(neighbors).toEqual([]);
    });

    test('should return all outgoing neighbors', () => {
      kg.addEntity('player1', 'player');
      kg.addEntity('player2', 'player');
      kg.addEntity('player3', 'player');
      kg.addRelation('player1', 'player2', 'FRIEND');
      kg.addRelation('player1', 'player3', 'FRIEND');
      
      const neighbors = kg.getNeighbors('player1');
      expect(neighbors.length).toBe(2);
      expect(neighbors.map(n => n.id)).toContain('player2');
      expect(neighbors.map(n => n.id)).toContain('player3');
    });

    test('should filter by relation type', () => {
      kg.addEntity('player1', 'player');
      kg.addEntity('player2', 'player');
      kg.addEntity('location1', 'location');
      kg.addRelation('player1', 'player2', 'FRIEND');
      kg.addRelation('player1', 'location1', 'LOCATED_AT');
      
      const friends = kg.getNeighbors('player1', 'FRIEND');
      expect(friends.length).toBe(1);
      expect(friends[0].id).toBe('player2');
      
      const locations = kg.getNeighbors('player1', 'LOCATED_AT');
      expect(locations.length).toBe(1);
      expect(locations[0].id).toBe('location1');
    });

    test('should support incoming neighbors', () => {
      kg.addEntity('player1', 'player');
      kg.addEntity('player2', 'player');
      kg.addRelation('player1', 'player2', 'FRIEND');
      
      const neighbors = kg.getNeighbors('player2', null, { direction: 'in' });
      expect(neighbors.length).toBe(1);
      expect(neighbors[0].id).toBe('player1');
    });

    test('should support both directions', () => {
      kg.addEntity('player1', 'player');
      kg.addEntity('player2', 'player');
      kg.addEntity('player3', 'player');
      kg.addRelation('player1', 'player2', 'FRIEND');
      kg.addRelation('player3', 'player2', 'FRIEND');
      
      const neighbors = kg.getNeighbors('player2', null, { direction: 'both' });
      expect(neighbors.length).toBe(2);
    });

    test('should increment queriesRun counter', () => {
      kg.addEntity('player1', 'player');
      kg.getNeighbors('player1');
      
      const stats = kg.getStats();
      expect(stats.queriesRun).toBe(1);
    });
  });

  describe('findPath', () => {
    test('should return null for missing nodes', () => {
      const path = kg.findPath('nonexistent1', 'nonexistent2');
      expect(path).toBeNull();
    });

    test('should return direct path for connected nodes', () => {
      kg.addEntity('player1', 'player');
      kg.addEntity('player2', 'player');
      kg.addRelation('player1', 'player2', 'FRIEND');
      
      const path = kg.findPath('player1', 'player2');
      expect(path).toEqual(['player1', 'player2']);
    });

    test('should find multi-hop path', () => {
      kg.addEntity('a', 'player');
      kg.addEntity('b', 'player');
      kg.addEntity('c', 'player');
      kg.addRelation('a', 'b', 'KNOWS');
      kg.addRelation('b', 'c', 'KNOWS');
      
      const path = kg.findPath('a', 'c');
      expect(path).toEqual(['a', 'b', 'c']);
    });

    test('should return null for disconnected nodes', () => {
      kg.addEntity('player1', 'player');
      kg.addEntity('player2', 'player');
      
      const path = kg.findPath('player1', 'player2');
      expect(path).toBeNull();
    });

    test('should respect temporal validity in path finding', () => {
      kg.addEntity('a', 'player', {}, { valid_from: '2026-03-01' });
      kg.addEntity('b', 'player', {}, { valid_from: '2026-03-01' });
      kg.addEntity('c', 'player', {}, { valid_from: '2026-03-01' });
      kg.addRelation('a', 'b', 'KNOWS', {}, {
        valid_from: '2026-04-01',
        valid_until: '2026-04-10'
      });
      kg.addRelation('b', 'c', 'KNOWS', {}, { valid_from: '2026-03-01' });
      
      const path1 = kg.findPath('a', 'c', { timestamp: '2026-04-05' });
      expect(path1).toEqual(['a', 'b', 'c']);
      
      const path2 = kg.findPath('a', 'c', { timestamp: '2026-04-15' });
      expect(path2).toBeNull();
    });
  });

  describe('filterByType', () => {
    test('should return nodes of specified type', () => {
      kg.addEntity('player1', 'player');
      kg.addEntity('player2', 'player');
      kg.addEntity('location1', 'location');
      
      const players = kg.filterByType('player');
      expect(players.length).toBe(2);
      expect(players.map(p => p.id)).toContain('player1');
      expect(players.map(p => p.id)).toContain('player2');
    });

    test('should return empty array for nonexistent type', () => {
      kg.addEntity('player1', 'player');
      
      const mobs = kg.filterByType('mob');
      expect(mobs).toEqual([]);
    });

    test('should respect temporal validity', () => {
      kg.addEntity('event1', 'event', {}, {
        valid_from: '2026-04-01',
        valid_until: '2026-04-10'
      });
      kg.addEntity('event2', 'event', {}, { valid_from: '2026-03-01' });
      
      const events = kg.filterByType('event', { timestamp: '2026-04-05' });
      expect(events.length).toBe(2);
      
      const events2 = kg.filterByType('event', { timestamp: '2026-04-15' });
      expect(events2.length).toBe(1);
      expect(events2[0].id).toBe('event2');
    });
  });

  describe('queryByTime', () => {
    test('should return all valid entities at timestamp', () => {
      kg.addEntity('player1', 'player', {}, { valid_from: '2026-03-01' });
      kg.addEntity('event1', 'event', {}, {
        valid_from: '2026-04-01',
        valid_until: '2026-04-10'
      });
      
      const result = kg.queryByTime('2026-04-05');
      expect(result.entities.length).toBe(2);
      
      const result2 = kg.queryByTime('2026-04-15');
      expect(result2.entities.length).toBe(1);
      expect(result2.entities[0].id).toBe('player1');
    });

    test('should return all valid relations at timestamp', () => {
      kg.addEntity('player1', 'player', {}, { valid_from: '2026-03-01' });
      kg.addEntity('player2', 'player', {}, { valid_from: '2026-03-01' });
      kg.addEntity('player3', 'player', {}, { valid_from: '2026-03-01' });
      kg.addRelation('player1', 'player2', 'FRIEND', {}, { valid_from: '2026-03-01' });
      kg.addRelation('player1', 'player3', 'FRIEND', {}, {
        valid_from: '2026-04-01',
        valid_until: '2026-04-10'
      });
      
      const result = kg.queryByTime('2026-04-05');
      expect(result.relations.length).toBe(2);
      
      const result2 = kg.queryByTime('2026-04-15');
      expect(result2.relations.length).toBe(1);
    });
  });

  describe('updateEntity', () => {
    test('should update entity properties', () => {
      kg.addEntity('player1', 'player', { health: 20 });
      kg.updateEntity('player1', { health: 15, armor: 5 });
      
      const entity = kg.getEntity('player1');
      expect(entity.properties.health).toBe(15);
      expect(entity.properties.armor).toBe(5);
    });

    test('should return false for missing entity', () => {
      const result = kg.updateEntity('nonexistent', { health: 20 });
      expect(result).toBe(false);
    });
  });

  describe('deleteEntity', () => {
    test('should delete entity and its edges', () => {
      kg.addEntity('player1', 'player');
      kg.addEntity('player2', 'player');
      kg.addRelation('player1', 'player2', 'FRIEND');
      
      kg.deleteEntity('player1');
      
      expect(kg.graph.hasNode('player1')).toBe(false);
      expect(kg.graph.size).toBe(0);
    });

    test('should return false for missing entity', () => {
      const result = kg.deleteEntity('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('LRU Eviction', () => {
    test('should evict oldest node when exceeding maxNodes', () => {
      const smallKg = new KnowledgeGraph({ maxNodes: 3 });
      
      smallKg.addEntity('a', 'player');
      smallKg.addEntity('b', 'player');
      smallKg.addEntity('c', 'player');
      
      // Add 4th entity, should evict 'a' (oldest)
      smallKg.addEntity('d', 'player');
      
      expect(smallKg.graph.order).toBe(3);
      expect(smallKg.graph.hasNode('a')).toBe(false);
      expect(smallKg.graph.hasNode('b')).toBe(true);
      expect(smallKg.graph.hasNode('c')).toBe(true);
      expect(smallKg.graph.hasNode('d')).toBe(true);
      
      const stats = smallKg.getStats();
      expect(stats.nodesEvicted).toBe(1);
    });

    test('should update access order on getEntity', async () => {
      const smallKg = new KnowledgeGraph({ maxNodes: 3 });
      
      smallKg.addEntity('a', 'player');
      await new Promise(r => setTimeout(r, 2));
      smallKg.addEntity('b', 'player');
      await new Promise(r => setTimeout(r, 2));
      smallKg.addEntity('c', 'player');
      
      smallKg.getEntity('a');
      
      smallKg.addEntity('d', 'player');
      
      expect(smallKg.graph.hasNode('a')).toBe(true);
      expect(smallKg.graph.hasNode('b')).toBe(false);
    });

    test('should update access order on getNeighbors', async () => {
      const smallKg = new KnowledgeGraph({ maxNodes: 3 });
      
      smallKg.addEntity('a', 'player');
      await new Promise(r => setTimeout(r, 2));
      smallKg.addEntity('b', 'player');
      await new Promise(r => setTimeout(r, 2));
      smallKg.addEntity('c', 'player');
      
      smallKg.getNeighbors('a');
      smallKg.addEntity('d', 'player');
      
      expect(smallKg.graph.hasNode('a')).toBe(true);
      expect(smallKg.graph.hasNode('b')).toBe(false);
      expect(smallKg.graph.order).toBe(3);
    });

    test('should evict at exactly 10,000 nodes', () => {
      const startStats = kg.getStats();
      
      // Add 10,001 entities
      for (let i = 0; i < 10001; i++) {
        kg.addEntity(`node${i}`, 'test');
      }
      
      const endStats = kg.getStats();
      expect(kg.graph.order).toBe(10000);
      expect(endStats.nodesEvicted - startStats.nodesEvicted).toBe(1);
    });
  });

  describe('Performance Tests', () => {
    test('P99 getNeighbors should be <10ms', () => {
      // Setup: 500 nodes, 2000 edges (from Task 3 validation)
      for (let i = 0; i < 500; i++) {
        kg.addEntity(`node${i}`, i % 2 === 0 ? 'player' : 'location');
      }
      
      for (let i = 0; i < 2000; i++) {
        const from = `node${Math.floor(Math.random() * 500)}`;
        const to = `node${Math.floor(Math.random() * 500)}`;
        kg.addRelation(from, to, 'KNOWS');
      }
      
      // Measure 1000 queries
      const latencies = [];
      for (let i = 0; i < 1000; i++) {
        const start = process.hrtime.bigint();
        kg.getNeighbors(`node${Math.floor(Math.random() * 500)}`);
        const end = process.hrtime.bigint();
        latencies.push(Number(end - start) / 1_000_000); // Convert to ms
      }
      
      // Calculate P99
      latencies.sort((a, b) => a - b);
      const p99Index = Math.floor(latencies.length * 0.99);
      const p99 = latencies[p99Index];
      
      console.log(`P99 getNeighbors latency: ${p99.toFixed(3)}ms`);
      expect(p99).toBeLessThan(10);
    });

    test('P99 findPath should be <10ms', () => {
      for (let i = 0; i < 100; i++) {
        kg.addEntity(`node${i}`, 'player');
      }
      
      for (let i = 0; i < 99; i++) {
        kg.addRelation(`node${i}`, `node${i + 1}`, 'NEXT');
      }
      
      const latencies = [];
      for (let i = 0; i < 100; i++) {
        const start = process.hrtime.bigint();
        kg.findPath('node0', 'node99');
        const end = process.hrtime.bigint();
        latencies.push(Number(end - start) / 1_000_000);
      }
      
      latencies.sort((a, b) => a - b);
      const p99Index = Math.floor(latencies.length * 0.99);
      const p99 = latencies[p99Index];
      
      console.log(`P99 findPath latency: ${p99.toFixed(3)}ms`);
      expect(p99).toBeLessThan(10);
    });

    test('P99 filterByType should be <10ms', () => {
      // Setup: 500 nodes, mixed types
      for (let i = 0; i < 500; i++) {
        kg.addEntity(`node${i}`, i % 5 === 0 ? 'player' : 'location');
      }
      
      // Measure 1000 queries
      const latencies = [];
      for (let i = 0; i < 1000; i++) {
        const start = process.hrtime.bigint();
        kg.filterByType('player');
        const end = process.hrtime.bigint();
        latencies.push(Number(end - start) / 1_000_000);
      }
      
      // Calculate P99
      latencies.sort((a, b) => a - b);
      const p99Index = Math.floor(latencies.length * 0.99);
      const p99 = latencies[p99Index];
      
      console.log(`P99 filterByType latency: ${p99.toFixed(3)}ms`);
      expect(p99).toBeLessThan(10);
    });

    test('P99 queryByTime should be <10ms', () => {
      // Setup: 500 nodes with temporal validity
      for (let i = 0; i < 500; i++) {
        kg.addEntity(`node${i}`, 'player', {}, {
          valid_from: '2026-01-01',
          valid_until: i % 2 === 0 ? '2026-12-31' : null
        });
      }
      
      // Measure 100 queries
      const latencies = [];
      for (let i = 0; i < 100; i++) {
        const start = process.hrtime.bigint();
        kg.queryByTime('2026-06-01');
        const end = process.hrtime.bigint();
        latencies.push(Number(end - start) / 1_000_000);
      }
      
      // Calculate P99
      latencies.sort((a, b) => a - b);
      const p99Index = Math.floor(latencies.length * 0.99);
      const p99 = latencies[p99Index];
      
      console.log(`P99 queryByTime latency: ${p99.toFixed(3)}ms`);
      expect(p99).toBeLessThan(10);
    });
  });

  describe('Clear', () => {
    test('should clear all nodes and edges', () => {
      kg.addEntity('player1', 'player');
      kg.addEntity('player2', 'player');
      kg.addRelation('player1', 'player2', 'FRIEND');
      
      kg.clear();
      
      expect(kg.graph.order).toBe(0);
      expect(kg.graph.size).toBe(0);
    });

    test('should reset stats', () => {
      kg.addEntity('player1', 'player');
      kg.getEntity('player1');
      
      kg.clear();
      
      const stats = kg.getStats();
      expect(stats.entitiesAdded).toBe(0);
      expect(stats.queriesRun).toBe(0);
    });
  });
});
