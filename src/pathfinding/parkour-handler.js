'use strict';

const logger = require('../utils/logger');
const featureFlags = require('../utils/feature-flags');
const { VisionPathfindingBridge } = require('./vision-pathfinding-bridge');

const PARKOUR_COSTS = {
  gapJump: 5.0,
  sprintJump: 3.0,
  riskyJump: 10.0
};

const SAFETY_DEFAULTS = {
  minHealth: 10,
  maxGapWidth: 4,
  minLandingClearance: 2,
  hazardCheckRadius: 3
};

const LAVA_BLOCKS = new Set(['lava', 'flowing_lava']);

class ParkourHandler {
  constructor(bot, options = {}) {
    this.bot = bot;
    this.enabled = featureFlags.isEnabled('ADVANCED_PATHFINDING');
    this.visionBridge = options.visionBridge || new VisionPathfindingBridge({
      visionState: options.visionState || null
    });

    this.costs = { ...PARKOUR_COSTS, ...(options.costs || {}) };

    this.minHealth = options.minHealth !== undefined
      ? options.minHealth : SAFETY_DEFAULTS.minHealth;
    this.maxGapWidth = options.maxGapWidth !== undefined
      ? options.maxGapWidth : SAFETY_DEFAULTS.maxGapWidth;
    this.minLandingClearance = options.minLandingClearance !== undefined
      ? options.minLandingClearance : SAFETY_DEFAULTS.minLandingClearance;
    this.hazardCheckRadius = options.hazardCheckRadius !== undefined
      ? options.hazardCheckRadius : SAFETY_DEFAULTS.hazardCheckRadius;

    this._lastGapDetected = null;
    this._jumpCount = 0;
  }

  createParkourMovement(mcData) {
    if (!this.enabled) {
      logger.debug('ParkourHandler: Advanced pathfinding disabled, skipping parkour movement setup');
      return null;
    }

    try {
      const { Movements } = require('mineflayer-pathfinder');
      const movements = new Movements(this.bot, mcData);

      movements.allowParkour = true;
      movements.allowSprinting = true;
      movements.canDig = true;
      movements.dontCreateFlow = true;

      const visionHint = this.getVisionParkourHint();
      if (visionHint) {
        if (visionHint.blockRiskyJump) {
          movements.allowParkour = false;
        }

        if (visionHint.maxGapWidth !== null && visionHint.maxGapWidth !== undefined) {
          this.maxGapWidth = Math.min(this.maxGapWidth, visionHint.maxGapWidth);
        }
      }

      logger.info('ParkourHandler: Parkour-enabled movements configured', {
        allowParkour: movements.allowParkour,
        allowSprinting: movements.allowSprinting
      });

      return movements;
    } catch (err) {
      logger.error('ParkourHandler: Failed to create parkour movements', {
        error: err.message
      });
      return null;
    }
  }

  applyParkourMovements(mcData) {
    if (!this.enabled) {
      logger.debug('ParkourHandler: Not applying, advanced pathfinding disabled');
      return false;
    }

    if (!this.bot.pathfinder) {
      logger.warn('ParkourHandler: Bot has no pathfinder plugin loaded');
      return false;
    }

    const movements = this.createParkourMovement(mcData);
    if (!movements) {
      return false;
    }

    this.bot.pathfinder.setMovements(movements);
    logger.info('ParkourHandler: Parkour movements applied to pathfinder');
    return true;
  }

  detectGap(position, direction) {
    const pos = position.floored ? position.floored() : position;
    let gapWidth = 0;
    let foundGap = false;

    for (let i = 1; i <= this.maxGapWidth + 1; i++) {
      const checkX = pos.x + direction.x * i;
      const checkY = pos.y - 1;
      const checkZ = pos.z + direction.z * i;

      const block = this.bot.blockAt({ x: checkX, y: checkY, z: checkZ });
      const isAir = !block || block.name === 'air' || block.name === 'cave_air' || block.name === 'void_air';

      if (isAir) {
        if (!foundGap) foundGap = true;
        gapWidth++;
      } else {
        if (foundGap) {
          if (gapWidth <= this.maxGapWidth) {
            const landingPosition = { x: checkX, y: pos.y, z: checkZ };
            this._lastGapDetected = { gapWidth, landingPosition, timestamp: Date.now() };
            return { gapDetected: true, gapWidth, landingPosition };
          }
          return { gapDetected: false };
        }
      }
    }

    if (foundGap && gapWidth <= this.maxGapWidth) {
      const landX = pos.x + direction.x * (gapWidth + 1);
      const landZ = pos.z + direction.z * (gapWidth + 1);
      const landBlock = this.bot.blockAt({ x: landX, y: pos.y - 1, z: landZ });
      const landIsAir = !landBlock || landBlock.name === 'air' || landBlock.name === 'cave_air' || landBlock.name === 'void_air';

      if (!landIsAir) {
        const landingPosition = { x: landX, y: pos.y, z: landZ };
        this._lastGapDetected = { gapWidth, landingPosition, timestamp: Date.now() };
        return { gapDetected: true, gapWidth, landingPosition };
      }
    }

    return { gapDetected: false };
  }

  analyzeJump(from, to) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    this._jumpCount++;

    if (distance === 0) {
      return { jumpable: false, requiresSprint: false, distance: 0, landingSafe: false, reason: 'zero distance' };
    }

    if (distance > this.maxGapWidth) {
      return { jumpable: false, requiresSprint: distance > 3, distance, landingSafe: false, reason: 'too far to jump' };
    }

    const requiresSprint = distance > 3;

    const groundBlock = this.bot.blockAt({ x: to.x, y: to.y - 1, z: to.z });
    const groundSolid = groundBlock && groundBlock.name !== 'air' && groundBlock.name !== 'cave_air' && groundBlock.name !== 'void_air';

    const hazards = this._checkLandingHazards(to);
    const landingSafe = groundSolid && !hazards.hasHazards;

    return { jumpable: true, requiresSprint, distance, landingSafe, reason: landingSafe ? 'safe' : 'unsafe landing' };
  }

  checkHealthSafety() {
    if (this.bot.health === undefined || this.bot.health === null) {
      return false;
    }
    return this.bot.health > this.minHealth;
  }

  getStatus() {
    return {
      enabled: this.enabled,
      vision: this.visionBridge ? this.visionBridge.getParkourHint() : null,
      health: this.bot.health,
      minHealth: this.minHealth,
      lastGapDetected: this._lastGapDetected,
      jumpCount: this._jumpCount
    };
  }

  _calculateJumpDistance(sprint) {
    return sprint ? 4.5 : 3.0;
  }

  _predictLanding(from, velocity) {
    const landingX = from.x + (velocity.x || 0);
    const landingZ = from.z + (velocity.z || 0);
    const landingY = from.y;

    const landingPosition = { x: landingX, y: landingY, z: landingZ };

    const groundBlock = this.bot.blockAt({ x: landingX, y: landingY - 1, z: landingZ });

    if (!groundBlock) {
      return { safe: false, landingPosition, reason: 'void at landing' };
    }

    if (LAVA_BLOCKS.has(groundBlock.name)) {
      return { safe: false, landingPosition, reason: 'lava at landing' };
    }

    const isAir = groundBlock.name === 'air' || groundBlock.name === 'cave_air' || groundBlock.name === 'void_air';
    if (isAir) {
      return { safe: false, landingPosition, reason: 'no solid ground' };
    }

    for (let dy = 0; dy < this.minLandingClearance; dy++) {
      const clearBlock = this.bot.blockAt({ x: landingX, y: landingY + dy, z: landingZ });
      if (clearBlock && clearBlock.name !== 'air' && clearBlock.name !== 'cave_air' && clearBlock.name !== 'void_air') {
        return { safe: false, landingPosition, reason: 'insufficient clearance' };
      }
    }

    return { safe: true, landingPosition };
  }

  _checkLandingHazards(position) {
    const pos = position.floored ? position.floored() : position;
    const hazards = [];
    const radius = this.hazardCheckRadius;

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const block = this.bot.blockAt({
            x: pos.x + dx,
            y: pos.y + dy,
            z: pos.z + dz
          });

          if (!block) {
            if (!hazards.includes('void')) hazards.push('void');
            continue;
          }

          if (LAVA_BLOCKS.has(block.name)) {
            if (!hazards.includes('lava')) hazards.push('lava');
          }
        }
      }
    }

    return { hasHazards: hazards.length > 0, hazards };
  }

  getVisionParkourHint() {
    if (!this.visionBridge || !this.visionBridge.isEnabled()) {
      return null;
    }

    return this.visionBridge.getParkourHint();
  }
}

function createParkourHandler(bot, mcData, options = {}) {
  const handler = new ParkourHandler(bot, options);

  if (!handler.enabled) {
    logger.info('ParkourHandler: Advanced pathfinding disabled');
    return { handler, applied: false };
  }

  const applied = handler.applyParkourMovements(mcData);
  return { handler, applied };
}

module.exports = {
  ParkourHandler,
  createParkourHandler,
  PARKOUR_COSTS,
  SAFETY_DEFAULTS
};
