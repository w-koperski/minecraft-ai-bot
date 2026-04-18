/**
 * Graphology Query Latency Prototype
 * Task 3: Validate query performance meets P99 <10ms target
 */

const Graph = require('graphology');
const { allNeighbours, inNeighbours, outNeighbours } = require('graphology-shortest-path');
const { floydWarshall, dijkstra } = require('graphology-shortest-path');
const { filter, map } = require('graphology-utils');

// Synthetic node types for knowledge graph
const NODE_TYPES = ['player', 'location', 'item', 'mob', 'event', 'goal'];

// Create synthetic graph with 500 nodes, 2000 edges
function createSyntheticGraph() {
  const graph = new Graph({ type: 'directed' });

  console.log('Creating synthetic graph with 500 nodes...');

  // Create 500 nodes with varied attributes
  for (let i = 0; i < 500; i++) {
    const nodeType = NODE_TYPES[i % NODE_TYPES.length];
    const attributes = {
      type: nodeType,
      id: `node_${i}`,
      name: `${nodeType}_${i}`,
      created: Date.now(),
      value: Math.random() * 100
    };

    // Add type-specific attributes
    if (nodeType === 'player') {
      attributes.health = 20;
      attributes.position = { x: Math.random() * 1000, y: 64, z: Math.random() * 1000 };
    } else if (nodeType === 'location') {
      attributes.coordinates = { x: Math.random() * 1000, y: Math.random() * 100, z: Math.random() * 1000 };
      attributes.biome = ['forest', 'plains', 'desert', 'mountains'][Math.floor(Math.random() * 4)];
    } else if (nodeType === 'item') {
      attributes.count = Math.floor(Math.random() * 64) + 1;
      attributes.durability = 100;
    }

    graph.addNode(`node_${i}`, attributes);
  }

  console.log(`Created ${graph.order} nodes`);

  // Create 2000 edges with varied relationships
  const EDGE_TYPES = ['knows', 'located_at', 'has', 'interacts_with', 'targets', 'precedes'];
  const usedEdges = new Set();

  let edgeCount = 0;
  while (edgeCount < 2000) {
    const source = Math.floor(Math.random() * 500);
    const target = Math.floor(Math.random() * 500);

    if (source !== target) {
      const edgeKey = `node_${source}->node_${target}`;
      if (!usedEdges.has(edgeKey)) {
        const edgeType = EDGE_TYPES[Math.floor(Math.random() * EDGE_TYPES.length)];
        graph.addEdge(`node_${source}`, `node_${target}`, {
          type: edgeType,
          weight: Math.random() * 10,
          timestamp: Date.now()
        });
        usedEdges.add(edgeKey);
        edgeCount++;
      }
    }
  }

  console.log(`Created ${graph.size} edges`);
  return graph;
}

// Query Pattern 1: Find all neighbors of a node
function queryFindNeighbors(graph, nodeId) {
  const neighbors = graph.outNeighbors(nodeId);
  return neighbors;
}

// Query Pattern 2: Shortest path between two nodes (BFS-based)
function queryShortestPath(graph, source, target) {
  const path = [];
  const queue = [[source]];
  const visited = new Set([source]);

  while (queue.length > 0) {
    const currentPath = queue.shift();
    const current = currentPath[currentPath.length - 1];

    if (current === target) {
      return currentPath;
    }

    for (const neighbor of graph.outNeighbors(current)) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...currentPath, neighbor]);
      }
    }
  }
  return null; // No path found
}

// Query Pattern 3: Filter nodes by type
function queryFilterByType(graph, type) {
  const result = [];
  graph.forEachNode((node, attrs) => {
    if (attrs.type === type) {
      result.push({ node, attrs });
    }
  });
  return result;
}

// Query Pattern 4: Get node properties
function queryGetNodeProperties(graph, nodeId) {
  if (!graph.hasNode(nodeId)) return null;
  return {
    attributes: graph.getNodeAttributes(nodeId),
    inDegree: graph.inDegree(nodeId),
    outDegree: graph.outDegree(nodeId)
  };
}

// Query Pattern 5: Traverse edges (get all outgoing edges with attributes)
function queryTraverseEdges(graph, nodeId) {
  const edges = [];
  graph.forEachOutEdge(nodeId, (edge, attrs, source, target) => {
    edges.push({ edge, attrs, source, target });
  });
  return edges;
}

// Query Pattern 6: Find nodes by attribute value (range query)
function queryFindByAttribute(graph, attr, minVal, maxVal) {
  const result = [];
  graph.forEachNode((node, attrs) => {
    if (attrs[attr] !== undefined && attrs[attr] >= minVal && attrs[attr] <= maxVal) {
      result.push({ node, value: attrs[attr] });
    }
  });
  return result;
}

// Query Pattern 7: In-neighbors (nodes pointing to target)
function queryInNeighbors(graph, nodeId) {
  return graph.inNeighbors(nodeId);
}

// Measure latency for a query pattern
function measureQueryLatency(graph, queryFn, queryArgs, iterations = 1000) {
  const latencies = [];

  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    queryFn(...queryArgs);
    const end = process.hrtime.bigint();
    latencies.push(Number(end - start) / 1_000_000); // Convert to ms
  }

  // Calculate statistics
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(iterations * 0.50)];
  const p90 = latencies[Math.floor(iterations * 0.90)];
  const p99 = latencies[Math.floor(iterations * 0.99)];
  const avg = latencies.reduce((a, b) => a + b, 0) / iterations;
  const min = latencies[0];
  const max = latencies[latencies.length - 1];

  return { p50, p90, p99, avg, min, max, latencies };
}

// Test concurrent reads using Promise.all
async function testConcurrentReads(graph, queryFn, queryArgs, concurrentCount = 50) {
  const start = process.hrtime.bigint();

  const promises = [];
  for (let i = 0; i < concurrentCount; i++) {
    promises.push(Promise.resolve().then(() => queryFn(...queryArgs)));
  }

  await Promise.all(promises);

  const end = process.hrtime.bigint();
  const totalTime = Number(end - start) / 1_000_000;
  const avgPerQuery = totalTime / concurrentCount;

  return { totalTime, avgPerQuery };
}

// Main execution
async function main() {
  const results = [];

  console.log('\n=== Graphology Query Latency Prototype ===\n');

  // Create graph
  const graph = createSyntheticGraph();

  // Define test queries - graph will be prepended at call time
  const queryDefinitions = [
    { name: 'findNeighbors', fn: queryFindNeighbors, args: ['node_100'] },
    { name: 'shortestPath', fn: queryShortestPath, args: ['node_0', 'node_250'] },
    { name: 'filterByType', fn: queryFilterByType, args: ['player'] },
    { name: 'getNodeProperties', fn: queryGetNodeProperties, args: ['node_100'] },
    { name: 'traverseEdges', fn: queryTraverseEdges, args: ['node_100'] },
    { name: 'findByAttribute', fn: queryFindByAttribute, args: ['value', 40, 60] },
    { name: 'inNeighbors', fn: queryInNeighbors, args: ['node_100'] }
  ];

  console.log('\n--- Query Latency Measurements (1000 iterations each) ---\n');

  // Run each query pattern
  for (const query of queryDefinitions) {
    const fullArgs = [graph, ...query.args];
    const stats = measureQueryLatency(graph, query.fn, fullArgs, 1000);
    const passed = stats.p99 < 10;

    results.push({
      query: query.name,
      p50: stats.p50.toFixed(3),
      p90: stats.p90.toFixed(3),
      p99: stats.p99.toFixed(3),
      avg: stats.avg.toFixed(3),
      min: stats.min.toFixed(3),
      max: stats.max.toFixed(3),
      passed
    });

    console.log(`${query.name}: P99=${stats.p99.toFixed(3)}ms ${passed ? '✓ PASS' : '✗ FAIL'} (target: <10ms)`);
    console.log(`  P50=${stats.p50.toFixed(3)}ms, P90=${stats.p90.toFixed(3)}ms, Avg=${stats.avg.toFixed(3)}ms`);
  }

  // Test concurrent reads
  console.log('\n--- Concurrent Read Test (50 simultaneous queries) ---\n');

  const concurrentResults = [];
  for (const query of queryDefinitions) {
    const fullArgs = [graph, ...query.args];
    const concurrentStats = await testConcurrentReads(graph, query.fn, fullArgs, 50);
    concurrentResults.push({
      query: query.name,
      totalTime: concurrentStats.totalTime.toFixed(3),
      avgPerQuery: concurrentStats.avgPerQuery.toFixed(3)
    });
    console.log(`${query.name}: Total=${concurrentStats.totalTime.toFixed(3)}ms, Avg=${concurrentStats.avgPerQuery.toFixed(3)}ms per query`);
  }

  // Summary
  console.log('\n--- Summary ---\n');
  const allPassed = results.every(r => r.passed);
  console.log(`Graph: ${graph.order} nodes, ${graph.size} edges`);
  console.log(`All P99 < 10ms: ${allPassed ? '✓ PASS' : '✗ FAIL'}`);

  // Generate validation report
  const report = {
    timestamp: new Date().toISOString(),
    graph: {
      nodes: graph.order,
      edges: graph.size
    },
    queryResults: results,
    concurrentResults,
    validation: {
      allPassed,
      target: 'P99 < 10ms'
    }
  };

  return report;
}

// Run and save results
main().then(report => {
  const fs = require('fs');
  const path = require('path');

  // Ensure evidence directory exists
  const evidenceDir = path.join(process.cwd(), '.sisyphus', 'evidence');
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }

  // Write validation report
  const reportPath = path.join(evidenceDir, 'task-3-graphology-latency.txt');
  let reportContent = '=== Graphology Query Latency Validation Report ===\n';
  reportContent += `Generated: ${report.timestamp}\n`;
  reportContent += `\n--- Graph Configuration ---\n`;
  reportContent += `Nodes: ${report.graph.nodes}\n`;
  reportContent += `Edges: ${report.graph.edges}\n`;
  reportContent += `\n--- Query Latency Results (P99 target: <10ms) ---\n`;

  for (const r of report.queryResults) {
    reportContent += `\n${r.query}:\n`;
    reportContent += `  P50: ${r.p50}ms\n`;
    reportContent += `  P90: ${r.p90}ms\n`;
    reportContent += `  P99: ${r.p99}ms\n`;
    reportContent += `  Avg: ${r.avg}ms\n`;
    reportContent += `  Min: ${r.min}ms\n`;
    reportContent += `  Max: ${r.max}ms\n`;
    reportContent += `  Status: ${r.passed ? 'PASS ✓' : 'FAIL ✗'}\n`;
  }

  reportContent += `\n--- Concurrent Read Test (50 simultaneous queries) ---\n`;
  for (const r of report.concurrentResults) {
    reportContent += `${r.query}: Total=${r.totalTime}ms, Avg=${r.avgPerQuery}ms/query\n`;
  }

  reportContent += `\n--- Validation Summary ---\n`;
  reportContent += `All P99 < 10ms: ${report.validation.allPassed ? 'PASS ✓' : 'FAIL ✗'}\n`;
  reportContent += `Target: ${report.validation.target}\n`;

  fs.writeFileSync(reportPath, reportContent);
  console.log(`\nValidation report saved to: ${reportPath}`);

  // Exit with appropriate code
  process.exit(report.validation.allPassed ? 0 : 1);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});