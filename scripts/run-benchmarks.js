#!/usr/bin/env node

/**
 * Performance Benchmark Runner
 *
 * Executes all 5 performance benchmarks and outputs results as JSON.
 *
 * Usage:
 *   node scripts/run-benchmarks.js
 *   node scripts/run-benchmarks.js --output path/to/report.json
 *   node scripts/run-benchmarks.js --mock  (use mock data only)
 *
 * Benchmarks:
 *   1. Action Success Rate (target: >90%)
 *   2. Item Acquisition Rate (target: 30+ items/hour)
 *   3. Memory Node Count (target: <10,000 nodes)
 *   4. Reflection Latency (target: <5 seconds)
 *   5. Goal Generation Latency (target: <1 second)
 *
 * Project Sid comparison: 320 items in 4 hours = 80 items/hour (baseline)
 */

const path = require('path');
const BenchmarkSuite = require('../src/metrics/benchmark-suite');

// Parse command line arguments
const args = process.argv.slice(2);
let outputPath = null;
let useMocks = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output' && args[i + 1]) {
    outputPath = args[i + 1];
    i++;
  } else if (args[i] === '--mock') {
    useMocks = true;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
Performance Benchmark Suite Runner

Usage:
  node scripts/run-benchmarks.js [options]

Options:
  --output <path>    Save JSON report to specified file
  --mock             Use mock data instead of real metrics
  --help, -h         Show this help message

Benchmarks:
  1. Action Success Rate      (target: >90%)
  2. Item Acquisition Rate    (target: 30+ items/hour)
  3. Memory Node Count        (target: <10,000 nodes)
  4. Reflection Latency       (target: <5 seconds)
  5. Goal Generation Latency  (target: <1 second)

Project Sid baseline: 320 items in 4 hours = 80 items/hour
`);
    process.exit(0);
  }
}

// Determine output path
const defaultOutputPath = path.join(
  __dirname,
  '..',
  '.sisyphus',
  'evidence',
  'task-14-benchmark-report.json'
);

// Final output path (use arg or default)
const reportPath = outputPath || defaultOutputPath;

// Initialize benchmark suite
const suite = new BenchmarkSuite({ useMocks });

console.log('=================================================');
console.log('  Performance Benchmark Suite');
console.log('  Minecraft AI Bot - Task 14');
console.log('=================================================');
console.log('');
console.log('Running benchmarks...');
console.log('');

// Run benchmarks and generate report
const report = suite.runAndSave(reportPath);

// Display results to console
const benchmarks = report.benchmarks;
const summary = benchmarks.summary;

// Display each benchmark result
for (const [name, result] of Object.entries(benchmarks)) {
  if (name === 'summary') continue;

  const status = result.meetsTarget ? '✅ PASS' : '❌ FAIL';
  const value = typeof result.value === 'number' ? result.value.toString() : result.value;
  const target = result.target;

  console.log(`  ${result.benchmark}`);
  console.log(`    Value: ${value} ${result.unit}`);
  console.log(`    Target: ${target} ${result.unit}`);
  console.log(`    Status: ${status}`);
  console.log('');

  // Show Project Sid comparison for relevant benchmarks
  if (result.projectSidComparison) {
    console.log(`    vs Project Sid: ${result.projectSidComparison.value} ${result.unit}`);
    if (result.projectSidComparison.notes) {
      console.log(`    Note: ${result.projectSidComparison.notes}`);
    }
    console.log('');
  }
}

// Display summary
console.log('-------------------------------------------------');
console.log('  Summary');
console.log('-------------------------------------------------');
console.log(`  Total Benchmarks: ${summary.totalBenchmarks}`);
console.log(`  Passed: ${summary.passed}`);
console.log(`  Failed: ${summary.failed}`);
console.log(`  Pass Rate: ${summary.passRate}%`);
console.log('');

if (summary.allPassed) {
  console.log('  ✅ ALL BENCHMARKS PASSED');
} else {
  console.log('  ⚠️  SOME BENCHMARKS FAILED - Review above');
}
console.log('');

// Report file location
console.log(`Report saved to: ${reportPath}`);
console.log('');

// Exit with appropriate code
process.exit(summary.allPassed ? 0 : 1);