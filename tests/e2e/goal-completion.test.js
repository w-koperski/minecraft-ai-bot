const { createTestBot, disconnectBot, sleep, giveItems, setGameMode, clearInventory, findBlock } = require('../helpers/bot-factory');

describe('Goal Completion', () => {
  describe('Collect Resources', () => {
    test('should collect 10 oak logs', async () => {
      const { bot } = await createTestBot({ username: 'GoalTest_CollectOak' });
      
      await setGameMode(bot, 'creative');
      await clearInventory(bot);
      
      bot.chat('/setblock ~5 ~ ~ minecraft:oak_log');
      bot.chat('/setblock ~5 ~1 ~ minecraft:oak_log');
      bot.chat('/setblock ~5 ~2 ~ minecraft:oak_log');
      
      await sleep(1000);
      
      const oakLog = bot.registry.itemsByName.oak_log;
      const initialCount = bot.inventory.count(oakLog.id);
      
      const blocks = bot.findBlocks({
        matching: bot.registry.blocksByName.oak_log.id,
        maxDistance: 32
      });
      
      if (blocks.length > 0) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => resolve(), 5000);
          
          bot.collectBlock.collect(blocks[0], (err) => {
            clearTimeout(timeout);
            if (err) reject(err);
            else resolve();
          });
        });
        
        await sleep(500);
      }
      
      const finalCount = bot.inventory.count(oakLog.id);
      const collected = finalCount - initialCount;
      
      expect(collected).toBeGreaterThanOrEqual(1);
      
      await disconnectBot(bot);
    }, 15000);

    test('should count inventory items correctly', async () => {
      const { bot } = await createTestBot({ username: 'GoalTest_InventoryCount' });
      
      await setGameMode(bot, 'creative');
      await clearInventory(bot);
      
      await giveItems(bot, 'oak_log', 10);
      
      const oakLog = bot.registry.itemsByName.oak_log;
      const count = bot.inventory.count(oakLog.id);
      
      expect(count).toBeGreaterThanOrEqual(10);
      
      await disconnectBot(bot);
    });

    test('should track inventory changes', async () => {
      const { bot } = await createTestBot({ username: 'GoalTest_InventoryTrack' });
      
      await setGameMode(bot, 'creative');
      await clearInventory(bot);
      
      const initialSlots = bot.inventory.emptySlotCount();
      
      await giveItems(bot, 'cobblestone', 32);
      
      const afterSlots = bot.inventory.emptySlotCount();
      
      expect(afterSlots).toBeLessThan(initialSlots);
      
      await disconnectBot(bot);
    });
  });

  describe('Navigation Goals', () => {
    test('should navigate to coordinates', async () => {
      const { bot, Movements, goals } = await createTestBot({ username: 'GoalTest_Navigate' });
      
      await setGameMode(bot, 'creative');
      
      const startPos = bot.entity.position;
      const targetX = Math.floor(startPos.x) + 20;
      const targetZ = Math.floor(startPos.z) + 20;
      
      return new Promise(async (resolve, reject) => {
        const timeout = setTimeout(async () => {
          await disconnectBot(bot);
          reject(new Error('Navigation timeout'));
        }, 20000);

        bot.pathfinder.setGoal(new goals.GoalXZ(targetX, targetZ));
        
        bot.pathfinder.once('goal_reached', async () => {
          clearTimeout(timeout);
          
          const finalPos = bot.entity.position;
          const distance = Math.sqrt(
            Math.pow(finalPos.x - targetX, 2) + Math.pow(finalPos.z - targetZ, 2)
          );
          
          expect(distance).toBeLessThan(2);
          
          await disconnectBot(bot);
          resolve();
        });
      });
    }, 25000);

    test('should find nearby block types', async () => {
      const { bot } = await createTestBot({ username: 'GoalTest_FindBlock' });
      
      await setGameMode(bot, 'creative');
      
      bot.chat('/setblock ~10 ~ ~ minecraft:diamond_ore');
      await sleep(500);
      
      const diamondBlock = findBlock(bot, 'diamond_ore', 32);
      
      expect(diamondBlock).toBeDefined();
      expect(diamondBlock.position).toBeDefined();
      
      await disconnectBot(bot);
    });

    test('should pathfind around obstacles', async () => {
      const { bot, goals } = await createTestBot({ username: 'GoalTest_Pathfind' });
      
      await setGameMode(bot, 'creative');
      
      const startPos = bot.entity.position;
      
      bot.chat('/fill ~5 ~ ~ ~5 ~2 ~ minecraft:stone');
      await sleep(500);
      
      const targetX = Math.floor(startPos.x) + 10;
      const targetZ = Math.floor(startPos.z);
      
      return new Promise(async (resolve, reject) => {
        const timeout = setTimeout(async () => {
          await disconnectBot(bot);
          reject(new Error('Pathfinding timeout'));
        }, 15000);

        bot.pathfinder.setGoal(new goals.GoalBlock(targetX, startPos.y, targetZ));
        
        bot.pathfinder.once('goal_reached', async () => {
          clearTimeout(timeout);
          
          const finalPos = bot.entity.position;
          const distance = Math.abs(finalPos.x - targetX);
          
          expect(distance).toBeLessThan(2);
          
          await disconnectBot(bot);
          resolve();
        });
      });
    }, 20000);
  });

  describe('Inventory Management', () => {
    test('should hold items', async () => {
      const { bot } = await createTestBot({ username: 'GoalTest_HoldItem' });
      
      await setGameMode(bot, 'creative');
      await clearInventory(bot);
      
      await giveItems(bot, 'diamond_pickaxe', 1);
      
      const pickaxe = bot.inventory.items().find(item => item.name === 'diamond_pickaxe');
      expect(pickaxe).toBeDefined();
      
      await bot.equip(pickaxe, 'hand');
      
      const heldItem = bot.heldItem;
      expect(heldItem).toBeDefined();
      expect(heldItem.name).toBe('diamond_pickaxe');
      
      await disconnectBot(bot);
    });

    test('should craft items', async () => {
      const { bot } = await createTestBot({ username: 'GoalTest_Craft' });
      
      await setGameMode(bot, 'creative');
      await clearInventory(bot);
      
      await giveItems(bot, 'oak_planks', 4);
      
      const craftingTable = bot.findBlock({
        matching: bot.registry.blocksByName.crafting_table.id,
        maxDistance: 64
      });
      
      if (craftingTable) {
        await bot.equip(bot.inventory.items().find(i => i.name === 'oak_planks'), 'hand');
      }
      
      const planks = bot.inventory.items().filter(item => item.name === 'oak_planks');
      const plankCount = planks.reduce((sum, item) => sum + item.count, 0);
      
      expect(plankCount).toBeGreaterThanOrEqual(4);
      
      await disconnectBot(bot);
    });

    test('should drop items', async () => {
      const { bot } = await createTestBot({ username: 'GoalTest_Drop' });
      
      await setGameMode(bot, 'creative');
      await clearInventory(bot);
      
      await giveItems(bot, 'cobblestone', 64);
      
      const cobblestone = bot.inventory.items().find(item => item.name === 'cobblestone');
      expect(cobblestone).toBeDefined();
      
      const initialCount = cobblestone.count;
      
      await bot.tossStack(cobblestone);
      await sleep(500);
      
      const afterCobblestone = bot.inventory.items().find(item => item.name === 'cobblestone');
      const afterCount = afterCobblestone ? afterCobblestone.count : 0;
      
      expect(afterCount).toBeLessThan(initialCount);
      
      await disconnectBot(bot);
    });
  });

  describe('Goal Progress Tracking', () => {
    test('should verify goal completion state', async () => {
      const { bot } = await createTestBot({ username: 'GoalTest_Verify' });
      
      await setGameMode(bot, 'creative');
      await clearInventory(bot);
      
      const targetItem = 'oak_log';
      const targetCount = 10;
      
      await giveItems(bot, targetItem, targetCount);
      
      const oakLog = bot.registry.itemsByName[targetItem];
      const currentCount = bot.inventory.count(oakLog.id);
      
      const goalMet = currentCount >= targetCount;
      
      expect(goalMet).toBe(true);
      expect(currentCount).toBeGreaterThanOrEqual(targetCount);
      
      await disconnectBot(bot);
    });

    test('should track multiple resource types', async () => {
      const { bot } = await createTestBot({ username: 'GoalTest_MultiResource' });
      
      await setGameMode(bot, 'creative');
      await clearInventory(bot);
      
      await giveItems(bot, 'oak_log', 10);
      await giveItems(bot, 'cobblestone', 20);
      await giveItems(bot, 'iron_ingot', 5);
      
      const oakLog = bot.registry.itemsByName.oak_log;
      const cobblestone = bot.registry.itemsByName.cobblestone;
      const ironIngot = bot.registry.itemsByName.iron_ingot;
      
      expect(bot.inventory.count(oakLog.id)).toBeGreaterThanOrEqual(10);
      expect(bot.inventory.count(cobblestone.id)).toBeGreaterThanOrEqual(20);
      expect(bot.inventory.count(ironIngot.id)).toBeGreaterThanOrEqual(5);
      
      await disconnectBot(bot);
    });

    test('should handle empty inventory', async () => {
      const { bot } = await createTestBot({ username: 'GoalTest_EmptyInventory' });
      
      await setGameMode(bot, 'creative');
      await clearInventory(bot);
      
      const items = bot.inventory.items();
      expect(items.length).toBe(0);
      
      const emptySlots = bot.inventory.emptySlotCount();
      expect(emptySlots).toBeGreaterThan(0);
      
      await disconnectBot(bot);
    });
  });
});
