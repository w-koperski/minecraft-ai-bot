'use strict';

const logger = require('../utils/logger');
const featureFlags = require('../utils/feature-flags');

const VISION_STALE_MS = 30000;

function normalizeText(values = []) {
  return values
    .filter(value => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

class VisionPathfindingBridge {
  constructor(options = {}) {
    this.visionState = options.visionState || null;
    this.enabled = featureFlags.isEnabled('VISION') && featureFlags.isEnabled('ADVANCED_PATHFINDING') && !!this.visionState;
  }

  isEnabled() {
    return this.enabled;
  }

  getLatestAnalysis() {
    if (!this.enabled || !this.visionState || typeof this.visionState.getLatestAnalysis !== 'function') {
      return null;
    }

    const analysis = this.visionState.getLatestAnalysis();
    if (!analysis || typeof analysis.timestamp !== 'number') {
      return null;
    }

    const ageMs = Date.now() - analysis.timestamp;
    if (ageMs >= VISION_STALE_MS) {
      logger.debug('VisionPathfindingBridge: Vision analysis stale, skipping', { ageMs });
      return null;
    }

    return analysis;
  }

  getWaterHint() {
    const analysis = this.getLatestAnalysis();
    if (!analysis) return null;

    const text = normalizeText([...(analysis.observations || []), ...(analysis.threats || [])]);
    const hint = { preferShallow: false, avoidDeep: false, avoidCurrents: false, source: 'vision' };

    if (/deep water|deep pool|deep/.test(text)) hint.avoidDeep = true;
    if (/shallow water|shallow/.test(text)) hint.preferShallow = true;
    if (/current|flowing water|strong current/.test(text)) hint.avoidCurrents = true;

    return hint.preferShallow || hint.avoidDeep || hint.avoidCurrents ? hint : null;
  }

  getNetherHint() {
    const analysis = this.getLatestAnalysis();
    if (!analysis) return null;

    const text = normalizeText([...(analysis.observations || []), ...(analysis.threats || [])]);
    const hint = { increaseLavaAvoidance: false, widenVoidBuffer: false, avoidFire: false, source: 'vision' };

    if (/lava|magma|fire/.test(text)) {
      hint.increaseLavaAvoidance = true;
      hint.avoidFire = true;
    }

    if (/drop|void|edge/.test(text)) hint.widenVoidBuffer = true;

    return hint.increaseLavaAvoidance || hint.widenVoidBuffer || hint.avoidFire ? hint : null;
  }

  getParkourHint() {
    const analysis = this.getLatestAnalysis();
    if (!analysis) return null;

    const text = normalizeText([...(analysis.observations || []), ...(analysis.threats || [])]);
    const hint = { blockRiskyJump: false, requireVisualConfirmation: false, maxGapWidth: null, source: 'vision' };

    if (/dangerous gap|risky jump|unsafe gap|drop/.test(text)) {
      hint.blockRiskyJump = true;
      hint.requireVisualConfirmation = true;
    }

    const widthMatch = text.match(/gap(?:\s+width)?\s*(?:of)?\s*(\d+)/);
    if (widthMatch) hint.maxGapWidth = Math.max(1, parseInt(widthMatch[1], 10) - 1);

    return hint.blockRiskyJump || hint.requireVisualConfirmation || hint.maxGapWidth !== null ? hint : null;
  }

  getSafetyHint() {
    const analysis = this.getLatestAnalysis();
    if (!analysis) return null;

    const text = normalizeText([...(analysis.observations || []), ...(analysis.threats || [])]);
    const hazards = [];

    if (/lava/.test(text)) hazards.push('lava');
    if (/fire/.test(text)) hazards.push('fire');
    if (/current/.test(text)) hazards.push('current');
    if (/drop|void/.test(text)) hazards.push('void');
    if (/hazard|danger|threat/.test(text)) hazards.push('general');

    return hazards.length > 0 ? { hasHazards: true, hazards, source: 'vision' } : null;
  }

  getSummary() {
    return {
      enabled: this.isEnabled(),
      water: this.getWaterHint(),
      nether: this.getNetherHint(),
      parkour: this.getParkourHint(),
      safety: this.getSafetyHint()
    };
  }
}

function createVisionPathfindingBridge(options = {}) {
  return new VisionPathfindingBridge(options);
}

module.exports = {
  VisionPathfindingBridge,
  createVisionPathfindingBridge,
  VISION_STALE_MS
};
