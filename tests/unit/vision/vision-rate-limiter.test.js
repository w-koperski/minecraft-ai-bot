describe('VisionRateLimiter', () => {
  let visionLimiter;

  beforeAll(() => {
    visionLimiter = require('../../../src/vision/vision-rate-limiter');
  });

  describe('singleton export', () => {
    it('should export an object with schedule and stop methods', () => {
      expect(visionLimiter).toBeDefined();
      expect(typeof visionLimiter.schedule).toBe('function');
      expect(typeof visionLimiter.stop).toBe('function');
    });
  });

  describe('reservoir configuration', () => {
    it('should have reservoir of 20 by default', () => {
      expect(visionLimiter.reservoir).toBe(20);
    });
  });

  describe('schedule()', () => {
    it('should execute function and return result', async () => {
      const fn = jest.fn().mockResolvedValue('result');
      const result = await visionLimiter.schedule(fn);
      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});