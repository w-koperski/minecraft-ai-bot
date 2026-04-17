/**
 * Item Progression Tracker
 *
 * Tracks unique items acquired during a Minecraft session.
 * Calculates progression metrics and detects milestones.
 *
 * Part of Task 8: Item Progression Tracker
 * Integrates with Pilot layer via playerCollect events.
 */

class ItemTracker {
  /**
   * Initialize tracker with empty inventory
   */
  constructor() {
    this.items = new Map(); // itemName -> firstAcquiredTimestamp
    this.startTime = Date.now();
  }

  /**
   * Track an item acquisition
   * Only tracks unique items (first acquisition counts)
   * @param {string} itemName - Name of the item acquired
   * @param {number} timestamp - Optional timestamp (defaults to Date.now())
   */
  track(itemName, timestamp = Date.now()) {
    if (!itemName || typeof itemName !== 'string') {
      return;
    }

    // Only record first acquisition of each item
    if (!this.items.has(itemName)) {
      this.items.set(itemName, timestamp);
    }
  }

  /**
   * Get current statistics
   * @returns {Object} Stats object with uniqueItems, itemsPerHour, sessionDuration, techTreeLevel, items
   */
  getStats() {
    const uniqueItems = this.items.size;
    const sessionDuration = Date.now() - this.startTime;

    // Calculate items per hour based on actual item acquisition span
    // This handles backdated items (e.g., from evidence tests) correctly
    let itemsPerHour = 0;
    if (uniqueItems > 0) {
      const timestamps = Array.from(this.items.values());
      const earliestItem = Math.min(...timestamps);
      const latestItem = Math.max(...timestamps);
      const itemSpan = latestItem - earliestItem;

      if (itemSpan > 0) {
        // Use actual span between first and last item for rate calculation
        itemsPerHour = (uniqueItems / itemSpan) * 3600000;
      } else if (sessionDuration > 0) {
        // Fall back to session duration if items all have same timestamp
        itemsPerHour = (uniqueItems / sessionDuration) * 3600000;
      }
    }

    return {
      uniqueItems,
      itemsPerHour: Math.round(itemsPerHour * 100) / 100,
      sessionDuration,
      techTreeLevel: this._calculateTechLevel(),
      items: Array.from(this.items.keys())
    };
  }

  /**
   * Get detected milestones
   * @returns {Array} Array of milestone objects { name, timestamp } sorted chronologically
   */
  getMilestones() {
    const milestones = [];

    // First iron milestone
    if (this.items.has('iron_ingot')) {
      milestones.push({
        name: 'first_iron',
        timestamp: this.items.get('iron_ingot')
      });
    }

    // First diamond milestone
    if (this.items.has('diamond')) {
      milestones.push({
        name: 'first_diamond',
        timestamp: this.items.get('diamond')
      });
    }

    // First nether entry milestone (netherrack or nether_brick)
    if (this.items.has('netherrack') || this.items.has('nether_brick')) {
      const netherTime = this.items.get('netherrack') || this.items.get('nether_brick');
      milestones.push({
        name: 'first_nether_entry',
        timestamp: netherTime
      });
    }

    // Sort by timestamp (chronological order)
    milestones.sort((a, b) => a.timestamp - b.timestamp);

    return milestones;
  }

  /**
   * Calculate tech tree level based on items acquired
   * Progression: wood_age -> stone_age -> iron_age -> diamond_age -> nether_age
   * @returns {string} Current tech level
   * @private
   */
  _calculateTechLevel() {
    // Nether age requires nether materials
    if (this.items.has('netherrack') || this.items.has('nether_brick')) {
      return 'nether_age';
    }

    // Diamond age
    if (this.items.has('diamond')) {
      return 'diamond_age';
    }

    // Iron age
    if (this.items.has('iron_ingot')) {
      return 'iron_age';
    }

    // Stone age - has cobblestone
    if (this.items.has('cobblestone')) {
      return 'stone_age';
    }

    // Wood age - default starting level
    return 'wood_age';
  }

  /**
   * Reset the tracker (for testing or new session)
   */
  reset() {
    this.items.clear();
    this.startTime = Date.now();
  }

  /**
   * Get items as map (for advanced use)
   * @returns {Map} Copy of items map
   */
  getItemsMap() {
    return new Map(this.items);
  }
}

module.exports = ItemTracker;