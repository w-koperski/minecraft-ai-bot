/**
 * Unit tests for vision-enhanced.js - Game state extraction
 * 
 * Tests extractState() and related helper functions via the public API.
 * Note: Internal helper functions (extractSelfState, extractInventory, etc.)
 * are tested indirectly through extractState since they are not exported.
 */

const { extractState, setupChatTracking, setupEventTracking } = require('../../src/utils/vision-enhanced');

// Mock vec3 to avoid mineflayer dependency
jest.mock('vec3', () => {
  return class Vec3 {
    constructor(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    distanceTo(other) {
      return Math.sqrt(
        Math.pow(this.x - other.x, 2) +
        Math.pow(this.y - other.y, 2) +
        Math.pow(this.z - other.z, 2)
      );
    }
  };
});

describe('vision-enhanced', () => {
  let mockBot;

  beforeEach(() => {
    // Create a comprehensive mock bot object
    mockBot = {
      entity: {
        position: { x: 0, y: 64, z: 0 },
        onGround: true,
        isInWater: false,
        isInLava: false
      },
      health: 20,
      food: 20,
      foodSaturation: 5.0,
      experience: {
        level: 5,
        progress: 0.5,
        points: 120
      },
      game: {
        gameMode: 'survival'
      },
      inventory: {
        items: jest.fn(() => [
          { name: 'diamond_pickaxe', displayName: 'Diamond Pickaxe', count: 1, slot: 0, durability: 10, maxDurability: 256 },
          { name: 'oak_log', displayName: 'Oak Log', count: 32, slot: 1 }
        ])
      },
      heldItem: {
        name: 'diamond_pickaxe',
        displayName: 'Diamond Pickaxe',
        count: 1,
        slot: 0
      },
      entities: {
        'entity_1': {
          name: 'zombie',
          type: 'mob',
          position: { x: 10, y: 64, z: 5 },
          uuid: 'uuid-1'
        },
        'entity_2': {
          name: 'cow',
          type: 'mob',
          position: { x: -5, y: 64, z: 8 },
          uuid: 'uuid-2'
        }
      },
      _chatHistory: [],
      _recentEvents: []
    };
  });

  describe('extractState', () => {
    it('should return flat structure with top-level fields', () => {
      const state = extractState(mockBot);

      // Verify top-level fields (schema compatibility - Task 2 flattening)
      expect(state).toHaveProperty('position');
      expect(state).toHaveProperty('health');
      expect(state).toHaveProperty('inventory');
      expect(state).toHaveProperty('blocks');
      expect(state).toHaveProperty('entities');
      expect(state).toHaveProperty('chat');
      expect(state).toHaveProperty('events');
      expect(state).toHaveProperty('self');
      expect(state).toHaveProperty('timestamp');
    });

    it('should extract position at top level', () => {
      const state = extractState(mockBot);

      expect(state.position).toEqual({ x: 0, y: 64, z: 0 });
    });

    it('should extract health at top level', () => {
      const state = extractState(mockBot);

      expect(state.health).toBe(20);
    });

    it('should extract inventory at top level', () => {
      const state = extractState(mockBot);

      expect(state.inventory).toBeInstanceOf(Array);
      expect(state.inventory.length).toBeGreaterThan(0);
      expect(state.inventory[0]).toHaveProperty('name');
      expect(state.inventory[0]).toHaveProperty('count');
    });

    it('should return error when bot is null', () => {
      const state = extractState(null);

      expect(state).toHaveProperty('error');
      expect(state.error).toBe('No bot instance provided');
    });

    it('should return error when bot is undefined', () => {
      const state = extractState(undefined);

      expect(state).toHaveProperty('error');
      expect(state.error).toBe('No bot instance provided');
    });

    it('should include self object with full self state', () => {
      const state = extractState(mockBot);

      expect(state.self).toBeDefined();
      expect(state.self).toHaveProperty('position');
      expect(state.self).toHaveProperty('health');
      expect(state.self).toHaveProperty('food');
      expect(state.self).toHaveProperty('saturation');
      expect(state.self).toHaveProperty('experience');
      expect(state.self).toHaveProperty('game_mode');
      expect(state.self).toHaveProperty('inventory');
      expect(state.self).toHaveProperty('held_item');
      expect(state.self).toHaveProperty('is_on_ground');
      expect(state.self).toHaveProperty('is_in_water');
      expect(state.self).toHaveProperty('is_in_lava');
    });

    it('should include blocks with summary and hazardous/valuable arrays', () => {
      const state = extractState(mockBot);

      expect(state.blocks).toHaveProperty('summary');
      expect(state.blocks).toHaveProperty('hazardous');
      expect(state.blocks).toHaveProperty('valuable');
      expect(state.blocks).toHaveProperty('scan_radius');
      expect(state.blocks.scan_radius).toBe(16);
    });

    it('should include entities with classification arrays', () => {
      const state = extractState(mockBot);

      expect(state.entities).toHaveProperty('players');
      expect(state.entities).toHaveProperty('mobs');
      expect(state.entities).toHaveProperty('passive');
      expect(state.entities).toHaveProperty('hostile');
      expect(state.entities).toHaveProperty('other');
    });

    it('should classify hostile entities correctly', () => {
      const state = extractState(mockBot);

      expect(state.entities.hostile.length).toBeGreaterThan(0);
      expect(state.entities.hostile[0].type).toBe('zombie');
    });

    it('should classify passive entities correctly', () => {
      const state = extractState(mockBot);

      expect(state.entities.passive.length).toBeGreaterThan(0);
      expect(state.entities.passive[0].type).toBe('cow');
    });

    it('should include distance in entity data', () => {
      const state = extractState(mockBot);

      expect(state.entities.hostile[0]).toHaveProperty('distance');
      expect(typeof state.entities.hostile[0].distance).toBe('number');
    });

    it('should handle empty entities gracefully', () => {
      const botWithNoEntities = {
        ...mockBot,
        entities: {}
      };

      const state = extractState(botWithNoEntities);

      expect(state.entities.players).toEqual([]);
      expect(state.entities.mobs).toEqual([]);
      expect(state.entities.hostile).toEqual([]);
      expect(state.entities.passive).toEqual([]);
    });

    it('should handle missing bot.entity gracefully', () => {
      const botWithNoEntity = {
        ...mockBot,
        entity: null
      };

      const state = extractState(botWithNoEntity);

      expect(state.position).toEqual({ x: 0, y: 0, z: 0 });
      expect(state.health).toBe(20);
    });

    it('should handle missing inventory gracefully', () => {
      const botWithNoInventory = {
        ...mockBot,
        inventory: null
      };

      const state = extractState(botWithNoInventory);

      expect(state.self.inventory).toEqual([]);
      expect(state.inventory).toEqual([]);
    });
  });

  describe('extractSelfState (via extractState)', () => {
    it('should extract food level', () => {
      const state = extractState(mockBot);

      expect(state.self.food).toBe(20);
    });

    it('should extract saturation', () => {
      const state = extractState(mockBot);

      expect(state.self.saturation).toBe(5.0);
    });

    it('should extract experience', () => {
      const state = extractState(mockBot);

      expect(state.self.experience).toEqual({
        level: 5,
        progress: 0.5,
        total: 120
      });
    });

    it('should extract game mode', () => {
      const state = extractState(mockBot);

      expect(state.self.game_mode).toBe('survival');
    });

    it('should extract held item', () => {
      const state = extractState(mockBot);

      expect(state.self.held_item).toBeDefined();
      expect(state.self.held_item.name).toBe('diamond_pickaxe');
    });

    it('should handle missing experience gracefully', () => {
      const botWithNoExp = {
        ...mockBot,
        experience: null
      };

      const state = extractState(botWithNoExp);

      expect(state.self.experience).toEqual({
        level: 0,
        progress: 0,
        total: 0
      });
    });

    it('should handle missing game object gracefully', () => {
      const botWithNoGame = {
        ...mockBot,
        game: null
      };

      const state = extractState(botWithNoGame);

      expect(state.self.game_mode).toBe('survival');
    });

    it('should handle missing heldItem gracefully', () => {
      const botWithNoHeld = {
        ...mockBot,
        heldItem: null
      };

      const state = extractState(botWithNoHeld);

      expect(state.self.held_item).toBeNull();
    });
  });

  describe('extractBlocks (via extractState)', () => {
    it('should include scan_radius in blocks', () => {
      const state = extractState(mockBot);

      expect(state.blocks.scan_radius).toBe(16);
    });

    it('should have summary as object with block counts', () => {
      const state = extractState(mockBot);

      expect(state.blocks.summary).toBeInstanceOf(Object);
    });

    it('should have hazardous as array', () => {
      const state = extractState(mockBot);

      expect(state.blocks.hazardous).toBeInstanceOf(Array);
    });

    it('should have valuable as array', () => {
      const state = extractState(mockBot);

      expect(state.blocks.valuable).toBeInstanceOf(Array);
    });
  });

  describe('extractEntities (via extractState)', () => {
    it('should have players array', () => {
      const state = extractState(mockBot);

      expect(state.entities.players).toBeInstanceOf(Array);
    });

    it('should have mobs array containing both hostile and passive', () => {
      const state = extractState(mockBot);

      expect(state.entities.mobs.length).toBeGreaterThanOrEqual(2);
    });

    it('should have entity position data', () => {
      const state = extractState(mockBot);

      expect(state.entities.hostile[0]).toHaveProperty('position');
      expect(state.entities.hostile[0].position).toHaveProperty('x');
      expect(state.entities.hostile[0].position).toHaveProperty('y');
      expect(state.entities.hostile[0].position).toHaveProperty('z');
    });

    it('should handle player entities separately', () => {
      const botWithPlayer = {
        ...mockBot,
        entities: {
          'player_1': {
            name: 'Steve',
            type: 'player',
            username: 'Steve',
            position: { x: 5, y: 64, z: 5 },
            uuid: 'player-uuid'
          }
        }
      };

      const state = extractState(botWithPlayer);

      expect(state.entities.players.length).toBe(1);
      expect(state.entities.players[0].username).toBe('Steve');
    });
  });

  describe('extractChat (via extractState)', () => {
    it('should return chat messages when _chatHistory exists', () => {
      mockBot._chatHistory = [
        { timestamp: '2024-01-01T00:00:00Z', type: 'chat', username: 'Player1', message: 'Hello' }
      ];

      const state = extractState(mockBot);

      expect(state.chat).toBeInstanceOf(Array);
      expect(state.chat.length).toBe(1);
    });

    it('should return structure when no _chatHistory', () => {
      const botNoChat = {
        ...mockBot,
        _chatHistory: undefined
      };

      const state = extractState(botNoChat);

      expect(state.chat).toHaveProperty('messages');
      expect(state.chat).toHaveProperty('note');
    });
  });

  describe('extractEvents (via extractState)', () => {
    it('should return events when _recentEvents exists', () => {
      mockBot._recentEvents = [
        { timestamp: '2024-01-01T00:00:00Z', type: 'death', data: { reason: 'fell' } }
      ];

      const state = extractState(mockBot);

      expect(state.events).toBeInstanceOf(Array);
      expect(state.events.length).toBe(1);
    });

    it('should return structure when no _recentEvents', () => {
      const botNoEvents = {
        ...mockBot,
        _recentEvents: undefined
      };

      const state = extractState(botNoEvents);

      expect(state.events).toHaveProperty('events');
      expect(state.events).toHaveProperty('note');
    });
  });

  describe('setupChatTracking', () => {
    it('should set up _chatHistory array on bot', () => {
      const testBot = { on: jest.fn() };
      setupChatTracking(testBot);

      expect(testBot._chatHistory).toBeInstanceOf(Array);
      expect(testBot._chatHistory.length).toBe(0);
    });

    it('should accept custom maxMessages parameter', () => {
      const testBot = { on: jest.fn() };
      setupChatTracking(testBot, 100);

      expect(testBot._chatHistory).toBeInstanceOf(Array);
    });

    it('should set up chat event listener', () => {
      const testBot = { on: jest.fn() };
      setupChatTracking(testBot);

      expect(testBot.on).toHaveBeenCalledWith('chat', expect.any(Function));
    });

    it('should set up whisper event listener', () => {
      const testBot = { on: jest.fn() };
      setupChatTracking(testBot);

      expect(testBot.on).toHaveBeenCalledWith('whisper', expect.any(Function));
    });
  });

  describe('setupEventTracking', () => {
    it('should set up _recentEvents array on bot', () => {
      const testBot = { on: jest.fn() };
      setupEventTracking(testBot);

      expect(testBot._recentEvents).toBeInstanceOf(Array);
      expect(testBot._recentEvents.length).toBe(0);
    });

    it('should accept custom maxEvents parameter', () => {
      const testBot = { on: jest.fn() };
      setupEventTracking(testBot, 50);

      expect(testBot._recentEvents).toBeInstanceOf(Array);
    });

    it('should set up multiple event listeners', () => {
      const testBot = { on: jest.fn() };
      setupEventTracking(testBot);

      expect(testBot.on).toHaveBeenCalled();
      // Should have multiple event listeners
      expect(testBot.on.mock.calls.length).toBeGreaterThan(5);
    });

    it('should track death events', () => {
      const testBot = { on: jest.fn() };
      setupEventTracking(testBot);

      // Find the death event handler
      const deathHandler = testBot.on.mock.calls.find(call => call[0] === 'death');
      expect(deathHandler).toBeDefined();
    });
  });

  describe('schema compatibility (Task 2 flattening)', () => {
    it('should have position at top level', () => {
      const state = extractState(mockBot);

      expect(state.position).toBeDefined();
      expect(state.position).toEqual({ x: 0, y: 64, z: 0 });
    });

    it('should have health at top level', () => {
      const state = extractState(mockBot);

      expect(state.health).toBeDefined();
      expect(state.health).toBe(20);
    });

    it('should have inventory at top level', () => {
      const state = extractState(mockBot);

      expect(state.inventory).toBeDefined();
      expect(state.inventory).toBeInstanceOf(Array);
    });

    it('should have blocks at top level', () => {
      const state = extractState(mockBot);

      expect(state.blocks).toBeDefined();
      expect(state.blocks).toHaveProperty('summary');
    });

    it('should have entities at top level', () => {
      const state = extractState(mockBot);

      expect(state.entities).toBeDefined();
      expect(state.entities).toHaveProperty('hostile');
      expect(state.entities).toHaveProperty('passive');
    });

    it('should also maintain backward compatibility with self object', () => {
      const state = extractState(mockBot);

      // Both top-level and self should have position/health/inventory
      expect(state.self.position).toEqual(state.position);
      expect(state.self.health).toBe(state.health);
      expect(state.self.inventory).toEqual(state.inventory);
    });
  });
});
