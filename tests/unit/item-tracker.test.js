const ItemTracker = require('../../src/metrics/item-tracker');

describe('ItemTracker', () => {
  let tracker;

  beforeEach(() => {
    tracker = new ItemTracker();
  });

  describe('track', () => {
    test('tracks unique items only', () => {
      tracker.track('oak_log');
      tracker.track('oak_log'); // duplicate
      tracker.track('oak_log'); // duplicate again

      expect(tracker.getStats().uniqueItems).toBe(1);
      expect(tracker.items.size).toBe(1);
    });

    test('tracks multiple different items', () => {
      tracker.track('oak_log');
      tracker.track('cobblestone');
      tracker.track('dirt');

      expect(tracker.getStats().uniqueItems).toBe(3);
    });

    test('ignores null and undefined items', () => {
      tracker.track(null);
      tracker.track(undefined);
      tracker.track('');

      expect(tracker.getStats().uniqueItems).toBe(0);
    });

    test('ignores non-string items', () => {
      tracker.track(123);
      tracker.track({ name: 'test' });
      tracker.track(['array']);

      expect(tracker.getStats().uniqueItems).toBe(0);
    });

    test('records first acquisition timestamp', () => {
      const timestamp1 = Date.now() - 1000;
      const timestamp2 = Date.now();

      tracker.track('oak_log', timestamp1);
      tracker.track('oak_log', timestamp2); // later, should be ignored

      expect(tracker.items.get('oak_log')).toBe(timestamp1);
    });

    test('uses default timestamp when not provided', () => {
      const before = Date.now();
      tracker.track('oak_log');
      const after = Date.now();

      const recorded = tracker.items.get('oak_log');
      expect(recorded).toBeGreaterThanOrEqual(before);
      expect(recorded).toBeLessThanOrEqual(after);
    });
  });

  describe('getStats', () => {
    test('returns correct unique item count', () => {
      tracker.track('oak_log');
      tracker.track('cobblestone');
      tracker.track('iron_ingot');

      const stats = tracker.getStats();
      expect(stats.uniqueItems).toBe(3);
    });

    test('returns items array', () => {
      tracker.track('oak_log');
      tracker.track('cobblestone');

      const stats = tracker.getStats();
      expect(stats.items).toContain('oak_log');
      expect(stats.items).toContain('cobblestone');
      expect(stats.items).toHaveLength(2);
    });

    test('returns session duration', () => {
      const before = Date.now();
      tracker.track('test');

      const stats = tracker.getStats();
      expect(stats.sessionDuration).toBeGreaterThanOrEqual(0);
    });

    test('calculates items per hour correctly', () => {
      // Items per hour should be based on the span between first and last item
      // 15 items over 30 minutes = 30 items/hour
      const tracker = new ItemTracker();
      const startTime = Date.now() - 30 * 60 * 1000; // 30 minutes ago

      for (let i = 0; i < 15; i++) {
        tracker.track(`item${i}`, startTime + i * 2 * 60 * 1000);
      }

      const stats = tracker.getStats();
      expect(stats.uniqueItems).toBe(15);
      // 15 items over ~28 minutes (from item0 to item14) ~= 30 items/hour
      expect(stats.itemsPerHour).toBe(30);
    });

    test('items per hour is 0 when session duration is 0', () => {
      const stats = tracker.getStats();
      expect(stats.itemsPerHour).toBe(0);
    });
  });

  describe('tech tree level calculation', () => {
    test('returns wood_age by default', () => {
      expect(tracker.getStats().techTreeLevel).toBe('wood_age');
    });

    test('returns stone_age when cobblestone is tracked', () => {
      tracker.track('cobblestone');
      expect(tracker.getStats().techTreeLevel).toBe('stone_age');
    });

    test('returns iron_age when iron_ingot is tracked', () => {
      tracker.track('iron_ingot');
      expect(tracker.getStats().techTreeLevel).toBe('iron_age');
    });

    test('returns diamond_age when diamond is tracked', () => {
      tracker.track('diamond');
      expect(tracker.getStats().techTreeLevel).toBe('diamond_age');
    });

    test('returns nether_age when netherrack is tracked', () => {
      tracker.track('netherrack');
      expect(tracker.getStats().techTreeLevel).toBe('nether_age');
    });

    test('returns nether_age when nether_brick is tracked', () => {
      tracker.track('nether_brick');
      expect(tracker.getStats().techTreeLevel).toBe('nether_age');
    });

    test('nether_age takes precedence over diamond_age', () => {
      tracker.track('diamond');
      tracker.track('netherrack');
      expect(tracker.getStats().techTreeLevel).toBe('nether_age');
    });

    test('diamond_age takes precedence over iron_age', () => {
      tracker.track('iron_ingot');
      tracker.track('diamond');
      expect(tracker.getStats().techTreeLevel).toBe('diamond_age');
    });

    test('iron_age takes precedence over stone_age', () => {
      tracker.track('cobblestone');
      tracker.track('iron_ingot');
      expect(tracker.getStats().techTreeLevel).toBe('iron_age');
    });
  });

  describe('getMilestones', () => {
    test('returns empty array when no milestones', () => {
      expect(tracker.getMilestones()).toEqual([]);
    });

    test('detects first_iron milestone', () => {
      const timestamp = Date.now();
      tracker.track('iron_ingot', timestamp);

      const milestones = tracker.getMilestones();
      expect(milestones).toHaveLength(1);
      expect(milestones[0].name).toBe('first_iron');
      expect(milestones[0].timestamp).toBe(timestamp);
    });

    test('detects first_diamond milestone', () => {
      const timestamp = Date.now();
      tracker.track('diamond', timestamp);

      const milestones = tracker.getMilestones();
      expect(milestones).toHaveLength(1);
      expect(milestones[0].name).toBe('first_diamond');
      expect(milestones[0].timestamp).toBe(timestamp);
    });

    test('detects first_nether_entry milestone via netherrack', () => {
      const timestamp = Date.now();
      tracker.track('netherrack', timestamp);

      const milestones = tracker.getMilestones();
      expect(milestones).toHaveLength(1);
      expect(milestones[0].name).toBe('first_nether_entry');
      expect(milestones[0].timestamp).toBe(timestamp);
    });

    test('detects first_nether_entry milestone via nether_brick', () => {
      const timestamp = Date.now();
      tracker.track('nether_brick', timestamp);

      const milestones = tracker.getMilestones();
      expect(milestones).toHaveLength(1);
      expect(milestones[0].name).toBe('first_nether_entry');
      expect(milestones[0].timestamp).toBe(timestamp);
    });

    test('returns multiple milestones when applicable', () => {
      const t1 = Date.now() - 1000;
      const t2 = Date.now();

      tracker.track('iron_ingot', t1);
      tracker.track('diamond', t2);

      const milestones = tracker.getMilestones();
      expect(milestones).toHaveLength(2);
      expect(milestones.map(m => m.name)).toContain('first_iron');
      expect(milestones.map(m => m.name)).toContain('first_diamond');
    });

    test('milestones are in chronological order', () => {
      const t1 = Date.now() - 1000;
      const t2 = Date.now();

      tracker.track('diamond', t1);
      tracker.track('iron_ingot', t2);

      const milestones = tracker.getMilestones();
      expect(milestones[0].name).toBe('first_diamond');
      expect(milestones[1].name).toBe('first_iron');
    });
  });

  describe('reset', () => {
    test('clears all items', () => {
      tracker.track('oak_log');
      tracker.track('cobblestone');

      tracker.reset();

      expect(tracker.getStats().uniqueItems).toBe(0);
      expect(tracker.items.size).toBe(0);
    });

    test('resets start time', () => {
      const oldStartTime = tracker.startTime;

      // Wait a bit then reset
      setTimeout(() => {
        tracker.reset();
        expect(tracker.startTime).toBeGreaterThan(oldStartTime);
      }, 10);
    });
  });

  describe('getItemsMap', () => {
    test('returns a copy of the items map', () => {
      tracker.track('oak_log');
      tracker.track('cobblestone');

      const map = tracker.getItemsMap();
      map.set('new_item', Date.now());

      // Original should be unchanged
      expect(tracker.items.has('new_item')).toBe(false);
    });

    test('returns map with correct entries', () => {
      tracker.track('oak_log', 100);
      tracker.track('cobblestone', 200);

      const map = tracker.getItemsMap();
      expect(map.get('oak_log')).toBe(100);
      expect(map.get('cobblestone')).toBe(200);
    });
  });
});