const Bottleneck = require('bottleneck');
const logger = require('../utils/logger');

const DEFAULT_VISION_RPM = 20;
const REFRESH_INTERVAL_MS = 60000;

class VisionRateLimiter {
  constructor(config = {}) {
    const rpm = parseInt(process.env.VISION_RPM_BUDGET, 10) || DEFAULT_VISION_RPM;

    const limiterConfig = {
      reservoir: rpm,
      reservoirRefreshAmount: rpm,
      reservoirRefreshInterval: REFRESH_INTERVAL_MS,
      maxConcurrent: 1,
      minTime: 0
    };

    this.reservoir = rpm;
    this.limiter = new Bottleneck(limiterConfig);
    this.stopped = false;

    this.limiter.on('depleted', () => {
      logger.warn('Vision rate limit reservoir depleted, waiting for refresh', {
        rpm: this.reservoir
      });
    });

    this.limiter.on('failed', (error, jobInfo) => {
      if (error?.response?.status === 429) {
        logger.error('Vision API rate limit hit (429), stopping limiter', {
          reservoir: this.reservoir
        });
        this.stopped = true;
        this.limiter.stop({ dropWaitingJobs: true });
      }
      return null;
    });
  }

async schedule(fn) {
    if (this.stopped) {
      throw new Error('Vision limiter has been stopped due to 429');
    }
    return this.limiter.schedule(fn);
  }

  async stop() {
    this.stopped = true;
    return this.limiter.stop();
  }
}

const visionLimiter = new VisionRateLimiter();

module.exports = visionLimiter;