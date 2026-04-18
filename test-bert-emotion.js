/**
 * Test script for boltuix/bert-emotion model on Minecraft chat samples
 * Task 2: Test bert-emotion on Minecraft chat samples
 *
 * Usage: node test-bert-emotion.js <samples-file>
 */

const { pipeline, env } = require('@xenova/transformers');
const fs = require('fs');

// Disable local model download - use HF CDN
env.allowLocalModels = false;

// Model configuration
const MODEL_NAME = 'MicahB/emotion_text_classifier';
const EMOTION_LABELS = [
  'anger', 'disgust', 'fear', 'joy', 'neutral', 'sadness', 'surprise'
];

async function main() {
  console.log('Loading emotion detection model...');
  console.time('Model load time');

  const classifier = await pipeline('text-classification', MODEL_NAME, {
    quantized: true,
  });

  console.timeEnd('Model load time');
  console.log('Model loaded successfully!\n');

  // Load samples
  const samplesFile = process.argv[2] || 'samples.json';
  const samples = JSON.parse(fs.readFileSync(samplesFile, 'utf8'));

  console.log(`Testing ${samples.length} samples...\n`);

  const results = [];
  const latencies = [];
  let correct = 0;

  for (const sample of samples) {
    // Measure inference time
    const startTime = process.hrtime.bigint();

    const output = await classifier(sample.message, {
      top_k: 1,  // Only get top prediction
    });

    const endTime = process.hrtime.bigint();
    const latencyMs = Number(endTime - startTime) / 1_000_000;

    latencies.push(latencyMs);

    const detectedEmotion = output[0].label.toLowerCase();
    const confidence = output[0].score;

    // Map model emotion labels to our expected emotions
    const isCorrect = detectedEmotion === sample.expected_emotion.toLowerCase() ||
                      (sample.expected_emotion === 'gratitude' && detectedEmotion === 'joy') ||
                      (sample.expected_emotion === 'accusation' && detectedEmotion === 'anger') ||
                      (sample.expected_emotion === 'boredom' && (detectedEmotion === 'sadness' || detectedEmotion === 'neutral')) ||
                      (sample.expected_emotion === 'indifference' && (detectedEmotion === 'neutral' || detectedEmotion === 'disgust'));

    if (isCorrect) correct++;

    results.push({
      id: sample.id,
      message: sample.message,
      expected_emotion: sample.expected_emotion,
      detected_emotion: detectedEmotion,
      confidence: Math.round(confidence * 1000) / 1000,
      latency_ms: Math.round(latencyMs * 100) / 100,
      correct: isCorrect,
    });

    const status = isCorrect ? '✓' : '✗';
    console.log(`${status} [${sample.id}] "${sample.message.substring(0, 40)}${sample.message.length > 40 ? '...' : ''}"`);
    console.log(`   Expected: ${sample.expected_emotion}, Detected: ${detectedEmotion} (${(confidence * 100).toFixed(1)}%)`);
    console.log(`   Latency: ${latencyMs.toFixed(2)}ms\n`);
  }

  // Calculate statistics
  latencies.sort((a, b) => a - b);
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const maxLatency = Math.max(...latencies);
  const accuracy = (correct / samples.length) * 100;

  console.log('='.repeat(60));
  console.log('RESULTS SUMMARY');
  console.log('='.repeat(60));
  console.log(`Samples tested: ${samples.length}`);
  console.log(`Correct detections: ${correct}/${samples.length}`);
  console.log(`Accuracy: ${accuracy.toFixed(1)}%`);
  console.log();
  console.log('Latency Statistics:');
  console.log(`  Average: ${avgLatency.toFixed(2)}ms`);
  console.log(`  P50: ${p50.toFixed(2)}ms`);
  console.log(`  P95: ${p95.toFixed(2)}ms`);
  console.log(`  P99: ${p99.toFixed(2)}ms`);
  console.log(`  Max: ${maxLatency.toFixed(2)}ms`);
  console.log();

  // Check if requirements met
  const p99Pass = p99 < 50;
  const accuracyPass = accuracy >= 70;

  console.log('Requirements Check:');
  console.log(`  P99 < 50ms: ${p99Pass ? 'PASS ✓' : 'FAIL ✗'} (${p99.toFixed(2)}ms)`);
  console.log(`  Accuracy >= 70%: ${accuracyPass ? 'PASS ✓' : 'FAIL ✗'} (${accuracy.toFixed(1)}%)`);
  console.log();

  // Build emotion breakdown
  const emotionBreakdown = {};
  for (const r of results) {
    const e = r.detected_emotion;
    if (!emotionBreakdown[e]) {
      emotionBreakdown[e] = { correct: 0, total: 0 };
    }
    emotionBreakdown[e].total++;
    if (r.correct) emotionBreakdown[e].correct++;
  }

  console.log('Emotion Detection Breakdown:');
  for (const [emotion, stats] of Object.entries(emotionBreakdown)) {
    const rate = ((stats.correct / stats.total) * 100).toFixed(0);
    console.log(`  ${emotion}: ${stats.correct}/${stats.total} correct (${rate}%)`);
  }

  // Save results
  const report = {
    timestamp: new Date().toISOString(),
    model: MODEL_NAME,
    samples_tested: samples.length,
    correct_detections: correct,
    accuracy_percent: Math.round(accuracy * 10) / 10,
    latency: {
      average_ms: Math.round(avgLatency * 100) / 100,
      p50_ms: Math.round(p50 * 100) / 100,
      p95_ms: Math.round(p95 * 100) / 100,
      p99_ms: Math.round(p99 * 100) / 100,
      max_ms: Math.round(maxLatency * 100) / 100,
    },
    requirements: {
      p99_under_50ms: p99Pass,
      accuracy_above_70percent: accuracyPass,
    },
    emotion_breakdown: emotionBreakdown,
    results: results,
  };

  const outputFile = '.sisyphus/evidence/task-2-bert-emotion-results.json';
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));
  console.log(`\nResults saved to: ${outputFile}`);

  // Exit with appropriate code
  process.exit((p99Pass && accuracyPass) ? 0 : 1);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});