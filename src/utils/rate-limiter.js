const Bottleneck = require('bottleneck');

const DEFAULT_CONFIG = {
  reservoir: 448,
  reservoirRefreshAmount: 448,
  reservoirRefreshInterval: 60000,
  maxConcurrent: 10,
  minTime: 133
};

class RateLimiter {
  constructor(config = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    this.limiter = new Bottleneck(fullConfig);
    this.stopped = false;
    this.limiter.on('failed', (error, jobInfo) => {
      if (error?.response?.status === 429) {
        this.stopped = true;
        this.limiter.stop({ dropWaitingJobs: true });
      }
      return null;
    });
  }

  async schedule(fn) {
    if (this.stopped) {
      throw new Error('Limiter has been stopped due to 429');
    }
    return this.limiter.schedule(fn);
  }

  async stop() {
    this.stopped = true;
    return this.limiter.stop();
  }
}

module.exports = RateLimiter;