'use strict';

const logger = require('../utils/logger');
const featureFlags = require('../utils/feature-flags');
const { VisionPathfindingBridge } = require('./vision-pathfinding-bridge');

const SAFETY_DEFAULTS = {
  minHealth: 10,
  maxWaterTime: 30000
};

class SafetyChecker {
  constructor(bot, options = {}) {
    this.bot = bot;
    this.enabled = featureFlags.isEnabled('ADVANCED_PATHFINDING');
    this.visionBridge = options.visionBridge || new VisionPathfindingBridge({
      visionState: options.visionState || null
    });

    this.minHealth = options.minHealth !== undefined
      ? options.minHealth
      : SAFETY_DEFAULTS.minHealth;
    this.maxWaterTime = options.maxWaterTime !== undefined
      ? options.maxWaterTime
      : SAFETY_DEFAULTS.maxWaterTime;

    this._waterEntryTime = null;
    this._waterTracking = false;
  }

  isParkourSafe(health = this.bot?.health) {
    if (!this.enabled) {
      return false;
    }

    if (health === undefined || health === null) {
      return false;
    }

    const visionHazard = this.getVisionSafetyHint();
    if (visionHazard && visionHazard.hasHazards) {
      return false;
    }

    return health > this.minHealth;
  }

  startWaterTracking() {
    this._waterEntryTime = Date.now();
    this._waterTracking = true;
  }

  stopWaterTracking() {
    this._waterEntryTime = null;
    this._waterTracking = false;
  }

  isInWater() {
    if (this.bot?.isInWater !== undefined) {
      return Boolean(this.bot.isInWater);
    }

    if (this.bot?.entity?.headInWater !== undefined) {
      return Boolean(this.bot.entity.headInWater || this.bot.entity.inWater);
    }

    return false;
  }

  hasBoat() {
    const items = this.bot?.inventory?.items;

    if (typeof items !== 'function') {
      return false;
    }

    return items().some((item) => item && typeof item.name === 'string' && item.name.endsWith('boat'));
  }

  checkWaterTimeout() {
    if (!this.enabled) {
      return false;
    }

    if (!this.isInWater()) {
      this.stopWaterTracking();
      return true;
    }

    if (!this._waterTracking || !this._waterEntryTime) {
      this.startWaterTracking();
    }

    if (this.hasBoat()) {
      return true;
    }

    const elapsed = Date.now() - this._waterEntryTime;
    return elapsed <= this.maxWaterTime;
  }

  getStatus() {
    const inWater = this.isInWater();
    const elapsed = this._waterTracking && this._waterEntryTime
      ? Date.now() - this._waterEntryTime
      : 0;

    return {
      enabled: this.enabled,
      vision: this.getVisionSafetyHint(),
      health: this.bot?.health,
      minHealth: this.minHealth,
      maxWaterTime: this.maxWaterTime,
      parkourSafe: this.isParkourSafe(),
      inWater,
      hasBoat: this.hasBoat(),
      waterTracking: this._waterTracking,
      elapsed,
      waterTimeoutSafe: this.enabled ? (inWater ? (this.hasBoat() || elapsed <= this.maxWaterTime) : true) : false
    };
  }

  getVisionSafetyHint() {
    if (!this.visionBridge || !this.visionBridge.isEnabled()) {
      return null;
    }

    return this.visionBridge.getSafetyHint();
  }
}

function createSafetyChecker(bot, mcData, options = {}) { // eslint-disable-line no-unused-vars
  const checker = new SafetyChecker(bot, options);

  if (!checker.enabled) {
    logger.info('SafetyChecker: Advanced pathfinding disabled');
    return { checker, applied: false };
  }

  return { checker, applied: true };
}

module.exports = {
  SafetyChecker,
  createSafetyChecker,
  SAFETY_DEFAULTS
};
