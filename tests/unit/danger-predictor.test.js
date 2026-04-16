const DangerPredictor = require('../../src/safety/danger-predictor');

describe('DangerPredictor', () => {
  let dp;
  let mockKG;

  beforeEach(() => {
    mockKG = { 
      addSpatialMemory: jest.fn().mockReturnValue(true)
    };
    dp = new DangerPredictor(mockKG);
  });

  afterEach(() => {
    dp.clear();
  });

  describe('markDangerous', () => {
    test('marks position as dangerous', () => {
      const result = dp.markDangerous({x: 100, y: 64, z: 200}, 'creeper_death');
      expect(result).toBe(true);
      expect(dp.getDangerZones()).toHaveLength(1);
    });

    test('stores in knowledge graph', () => {
      dp.markDangerous({x: 100, y: 64, z: 200}, 'creeper_death', 1234567890);
      expect(mockKG.addSpatialMemory).toHaveBeenCalledWith(
        'danger_creeper_death_1234567890',
        {x: 100, y: 64, z: 200},
        'danger_zone',
        1234567890
      );
    });

    test('requires valid position', () => {
      const result = dp.markDangerous(null, 'test');
      expect(result).toBe(false);
    });

    test('requires reason', () => {
      const result = dp.markDangerous({x: 100, y: 64, z: 200}, null);
      expect(result).toBe(false);
    });
  });

  describe('isDangerous', () => {
    test('returns true for position within danger radius', () => {
      dp.markDangerous({x: 100, y: 64, z: 200}, 'creeper_death');
      expect(dp.isDangerous({x: 105, y: 64, z: 205})).toBe(true);
    });

    test('returns false for position outside danger radius', () => {
      dp.markDangerous({x: 100, y: 64, z: 200}, 'creeper_death');
      expect(dp.isDangerous({x: 200, y: 64, z: 300})).toBe(false);
    });

    test('returns false for invalid position', () => {
      dp.markDangerous({x: 100, y: 64, z: 200}, 'test');
      expect(dp.isDangerous(null)).toBe(false);
    });

    test('returns false when disabled', () => {
      dp.enabled = false;
      dp.markDangerous({x: 100, y: 64, z: 200}, 'test');
      expect(dp.isDangerous({x: 100, y: 64, z: 200})).toBe(false);
    });
  });

  describe('getDangerLevel', () => {
    test('returns 1.0 for fresh danger zone', () => {
      dp.markDangerous({x: 100, y: 64, z: 200}, 'test');
      const level = dp.getDangerLevel({x: 100, y: 64, z: 200});
      expect(level).toBeCloseTo(1.0, 2);
    });

    test('returns 0.0 for position outside all danger zones', () => {
      dp.markDangerous({x: 100, y: 64, z: 200}, 'test');
      const level = dp.getDangerLevel({x: 500, y: 64, z: 500});
      expect(level).toBe(0.0);
    });

    test('danger decays over time (7-day half-life)', () => {
      const oldTime = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days ago
      dp.markDangerous({x: 100, y: 64, z: 200}, 'old_death', oldTime);
      const level = dp.getDangerLevel({x: 100, y: 64, z: 200});
      expect(level).toBeCloseTo(0.5, 2); // Should be ~0.5 after 7 days
    });

    test('danger decays to ~0.42 after 8 days', () => {
      const oldTime = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days ago
      dp.markDangerous({x: 100, y: 64, z: 200}, 'old_death', oldTime);
      const level = dp.getDangerLevel({x: 100, y: 64, z: 200});
      expect(level).toBeGreaterThan(0.4);
      expect(level).toBeLessThan(0.5);
    });

    test('returns highest level from multiple zones', () => {
      const oldTime = Date.now() - 7 * 24 * 60 * 60 * 1000;
      dp.markDangerous({x: 100, y: 64, z: 200}, 'old_death', oldTime); // level ~0.5
      dp.markDangerous({x: 105, y: 64, z: 205}, 'fresh_death'); // level ~1.0
      const level = dp.getDangerLevel({x: 103, y: 64, z: 203});
      expect(level).toBeCloseTo(1.0, 1); // Should return highest (fresh)
    });
  });

  describe('getDangerZones', () => {
    test('returns copy of danger zones', () => {
      dp.markDangerous({x: 100, y: 64, z: 200}, 'test1');
      dp.markDangerous({x: 200, y: 64, z: 300}, 'test2');
      const zones = dp.getDangerZones();
      expect(zones).toHaveLength(2);
      expect(zones[0].position).toEqual({x: 100, y: 64, z: 200});
      expect(zones[1].position).toEqual({x: 200, y: 64, z: 300});
    });

    test('returned array is a copy', () => {
      dp.markDangerous({x: 100, y: 64, z: 200}, 'test');
      const zones = dp.getDangerZones();
      zones[0].position.x = 999;
      expect(dp.getDangerZones()[0].position.x).toBe(100);
    });
  });

  describe('clear', () => {
    test('removes all danger zones', () => {
      dp.markDangerous({x: 100, y: 64, z: 200}, 'test1');
      dp.markDangerous({x: 200, y: 64, z: 300}, 'test2');
      expect(dp.getDangerZones()).toHaveLength(2);
      dp.clear();
      expect(dp.getDangerZones()).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    test('returns statistics', () => {
      dp.markDangerous({x: 100, y: 64, z: 200}, 'creeper_death');
      dp.markDangerous({x: 200, y: 64, z: 300}, 'creeper_death');
      dp.markDangerous({x: 300, y: 64, z: 400}, 'lava_damage');
      const stats = dp.getStats();
      expect(stats.count).toBe(3);
      expect(stats.reasons.creeper_death).toBe(2);
      expect(stats.reasons.lava_damage).toBe(1);
      expect(stats.enabled).toBe(true);
    });
  });

  describe('distance calculation', () => {
    test('calculates 3D Euclidean distance correctly', () => {
      dp.markDangerous({x: 0, y: 0, z: 0}, 'test');
      // Distance from (0,0,0) to (3,4,0) should be 5
      const level1 = dp.getDangerLevel({x: 3, y: 4, z: 0});
      expect(level1).toBeGreaterThan(0); // Within 20 block radius
      
      // Distance from (0,0,0) to (15,15,15) should be ~26 (outside radius)
      const level2 = dp.getDangerLevel({x: 15, y: 15, z: 15});
      expect(level2).toBe(0);
    });
  });
});
