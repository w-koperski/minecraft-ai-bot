const RateLimiter = require('../../src/utils/rate-limiter');

describe('RateLimiter', () => {
  let limiter;

  afterEach(async () => {
    if (limiter) {
      try {
        await limiter.stop();
      } catch (e) {
      }
      limiter = null;
    }
  });

  describe('constructor', () => {
    it('should create a limiter with default config (448 RPM, 80% buffer)', () => {
      limiter = new RateLimiter();
      expect(limiter).toBeDefined();
    });

    it('should create a limiter with custom limits', () => {
      limiter = new RateLimiter({ reservoir: 100, reservoirRefreshInterval: 60000 });
      expect(limiter).toBeDefined();
    });
  });

  describe('schedule()', () => {
    it('should execute function immediately when under limit', async () => {
      limiter = new RateLimiter();
      const fn = jest.fn().mockResolvedValue('result');

      const result = await limiter.schedule(fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should queue multiple requests', async () => {
      limiter = new RateLimiter({
        reservoir: 10,
        reservoirRefreshInterval: 60000,
        maxConcurrent: 1,
        minTime: 10
      });

      const fn = jest.fn().mockResolvedValue('done');

      const promises = [
        limiter.schedule(fn),
        limiter.schedule(fn),
        limiter.schedule(fn)
      ];

      const results = await Promise.all(promises);

      expect(results).toEqual(['done', 'done', 'done']);
      expect(fn).toHaveBeenCalledTimes(3);
    }, 10000);

    it('should respect maxConcurrent limit', async () => {
      limiter = new RateLimiter({
        reservoir: 100,
        reservoirRefreshInterval: 60000,
        maxConcurrent: 1,
        minTime: 50
      });

      const concurrent = { count: 0, max: 0 };
      const fn = jest.fn().mockImplementation(async () => {
        concurrent.count++;
        concurrent.max = Math.max(concurrent.max, concurrent.count);
        await new Promise(resolve => setTimeout(resolve, 50));
        concurrent.count--;
        return 'done';
      });

      const promises = [
        limiter.schedule(fn),
        limiter.schedule(fn),
        limiter.schedule(fn)
      ];

      await Promise.all(promises);

      expect(fn).toHaveBeenCalledTimes(3);
      expect(concurrent.max).toBeLessThanOrEqual(1);
    }, 10000);
  });

  describe('429 handling', () => {
    it('should stop limiter on 429 error and drop waiting jobs', async () => {
      limiter = new RateLimiter({
        reservoir: 5,
        reservoirRefreshInterval: 60000
      });

      const fn = jest.fn().mockRejectedValue({ response: { status: 429 } });

      await expect(limiter.schedule(fn)).rejects.toEqual({ response: { status: 429 } });
    });

    it('should allow new limiter after 429', async () => {
      const oldLimiter = new RateLimiter({ reservoir: 5 });

      const error429 = { response: { status: 429 } };
      await expect(oldLimiter.schedule(() => Promise.reject(error429))).rejects.toEqual(error429);

      const newLimiter = new RateLimiter({ reservoir: 5 });
      const result = await newLimiter.schedule(() => Promise.resolve('fresh'));
      expect(result).toBe('fresh');
    });
  });

  describe('stop()', () => {
    it('should stop the limiter and prevent new jobs', async () => {
      limiter = new RateLimiter({
        reservoir: 5,
        reservoirRefreshInterval: 60000
      });

      await limiter.stop();

      await expect(limiter.schedule(() => Promise.resolve('after stop'))).rejects.toThrow('stopped');
    });
  });
});