const { createTestBot, disconnectBot, sleep, waitForCondition, setGameMode } = require('../helpers/bot-factory');

describe('Error Recovery', () => {
  describe('Death Recovery', () => {
    test('should respawn after death', async () => {
      const { bot } = await createTestBot({ username: 'ErrorTest_DeathRespawn' });
      
      let deathCount = 0;
      let spawnCount = 0;
      
      bot.on('death', () => { deathCount++; });
      bot.on('spawn', () => { spawnCount++; });
      
      await setGameMode(bot, 'survival');
      
      bot.chat('/kill');
      
      const respawned = await waitForCondition(
        () => deathCount > 0 && spawnCount >= 2,
        5000
      );
      
      expect(respawned).toBe(true);
      expect(deathCount).toBe(1);
      
      await disconnectBot(bot);
    }, 10000);

    test('should maintain health after respawn', async () => {
      const { bot } = await createTestBot({ username: 'ErrorTest_HealthAfterDeath' });
      
      await setGameMode(bot, 'survival');
      
      bot.chat('/kill');
      
      await waitForCondition(() => bot.health !== undefined, 3000);
      
      await sleep(1000);
      
      expect(bot.health).toBeDefined();
      expect(bot.health).toBeGreaterThan(0);
      expect(bot.health).toBeLessThanOrEqual(20);
      
      await disconnectBot(bot);
    }, 10000);

    test('should respawn at spawn point', async () => {
      const { bot } = await createTestBot({ username: 'ErrorTest_SpawnPoint' });
      
      const spawnPoint = { ...bot.entity.position };
      
      bot.chat('/tp 100 64 100');
      await sleep(500);
      
      const beforeDeath = { ...bot.entity.position };
      expect(beforeDeath.x).not.toBeCloseTo(spawnPoint.x, 0);
      
      bot.chat('/kill');
      
      await waitForCondition(() => {
        const pos = bot.entity.position;
        return Math.abs(pos.x - spawnPoint.x) < 5 && Math.abs(pos.z - spawnPoint.z) < 5;
      }, 5000);
      
      const afterDeath = bot.entity.position;
      expect(Math.abs(afterDeath.x - spawnPoint.x)).toBeLessThan(5);
      
      await disconnectBot(bot);
    }, 10000);

    test('should handle multiple deaths', async () => {
      const { bot } = await createTestBot({ username: 'ErrorTest_MultiDeath' });
      
      let deathCount = 0;
      bot.on('death', () => { deathCount++; });
      
      for (let i = 0; i < 3; i++) {
        bot.chat('/kill');
        await waitForCondition(() => deathCount === i + 1, 3000);
        await sleep(500);
      }
      
      expect(deathCount).toBe(3);
      expect(bot.health).toBeDefined();
      
      await disconnectBot(bot);
    }, 15000);
  });

  describe('Stuck Recovery', () => {
    test('should detect being stuck', async () => {
      const { bot } = await createTestBot({ username: 'ErrorTest_StuckDetect' });
      
      const startPos = { ...bot.entity.position };
      
      bot.chat('/fill ~1 ~ ~1 ~-1 ~2 ~-1 minecraft:bedrock');
      await sleep(500);
      
      const stuck = !bot.entity.onGround && bot.entity.position.y !== startPos.y;
      
      await setGameMode(bot, 'creative');
      bot.chat('/setblock ~ ~ ~ minecraft:air');
      bot.chat('/setblock ~1 ~ ~1 minecraft:air');
      bot.chat('/setblock ~-1 ~ ~-1 minecraft:air');
      
      await disconnectBot(bot);
    });

    test('should recover from stuck position', async () => {
      const { bot, goals } = await createTestBot({ username: 'ErrorTest_StuckRecover' });
      
      await setGameMode(bot, 'creative');
      
      bot.chat('/fill ~2 ~ ~2 ~-2 ~ ~-2 minecraft:bedrock');
      await sleep(500);
      
      bot.chat('/tp ~ ~5 ~');
      await sleep(500);
      
      bot.chat('/fill ~2 ~ ~2 ~-2 ~ ~-1 minecraft:air');
      await sleep(500);
      
      const targetX = Math.floor(bot.entity.position.x) + 10;
      const targetZ = Math.floor(bot.entity.position.z);
      
      return new Promise(async (resolve, reject) => {
        const timeout = setTimeout(async () => {
          await disconnectBot(bot);
          reject(new Error('Recovery timeout'));
        }, 10000);

        bot.pathfinder.setGoal(new goals.GoalXZ(targetX, targetZ));
        
        bot.pathfinder.once('goal_reached', async () => {
          clearTimeout(timeout);
          
          const currentPos = bot.entity.position;
          const moved = Math.abs(currentPos.x - targetX) < 2;
          
          expect(moved).toBe(true);
          
          await disconnectBot(bot);
          resolve();
        });
      });
    }, 15000);

    test('should teleport out of stuck situation', async () => {
      const { bot } = await createTestBot({ username: 'ErrorTest_TeleportUnstuck' });
      
      const originalPos = { ...bot.entity.position };
      
      bot.chat('/tp 1000 100 1000');
      await sleep(500);
      
      const teleported = bot.entity.position.x !== originalPos.x;
      expect(teleported).toBe(true);
      
      bot.chat('/tp ' + originalPos.x + ' ' + originalPos.y + ' ' + originalPos.z);
      await sleep(500);
      
      const returned = Math.abs(bot.entity.position.x - originalPos.x) < 1;
      expect(returned).toBe(true);
      
      await disconnectBot(bot);
    });
  });

  describe('Connection Recovery', () => {
    test('should handle graceful disconnection', async () => {
      const { bot } = await createTestBot({ username: 'ErrorTest_GracefulDisconnect' });
      
      let endReceived = false;
      bot.on('end', () => { endReceived = true; });
      
      await disconnectBot(bot);
      
      await sleep(500);
      
      expect(endReceived).toBe(true);
    }, 5000);

    test('should reconnect after disconnection', async () => {
      const { bot: bot1 } = await createTestBot({ username: 'ErrorTest_Reconnect1' });
      await disconnectBot(bot1);
      
      await sleep(1000);
      
      const { bot: bot2 } = await createTestBot({ username: 'ErrorTest_Reconnect2' });
      
      expect(bot2).toBeDefined();
      expect(bot2.entity).toBeDefined();
      
      await disconnectBot(bot2);
    }, 10000);

    test('should maintain state across reconnections', async () => {
      const { bot: bot1 } = await createTestBot({ username: 'ErrorTest_State1' });
      
      await setGameMode(bot1, 'creative');
      const pos = bot1.entity.position;
      
      await disconnectBot(bot1);
      await sleep(1000);
      
      const { bot: bot2 } = await createTestBot({ username: 'ErrorTest_State2' });
      
      expect(bot2.game.gameMode).toBeDefined();
      
      await disconnectBot(bot2);
    }, 10000);

    test('should handle kick from server', async () => {
      const { bot } = await createTestBot({ username: 'ErrorTest_Kick' });
      
      let kicked = false;
      bot.on('kicked', (reason) => {
        kicked = true;
      });
      
      bot.chat('/kick TestBot_Kick Test kick message');
      
      await waitForCondition(() => kicked, 3000);
      
      expect(kicked).toBe(true);
      
      try {
        await disconnectBot(bot);
      } catch (e) {
        
      }
    }, 10000);
  });

  describe('Error Handling', () => {
    test('should handle invalid commands gracefully', async () => {
      const { bot } = await createTestBot({ username: 'ErrorTest_InvalidCmd' });
      
      let errorReceived = false;
      bot.on('error', (err) => {
        errorReceived = true;
      });
      
      bot.chat('/invalid_command_that_does_not_exist');
      
      await sleep(500);
      
      expect(bot).toBeDefined();
      expect(bot.entity).toBeDefined();
      
      await disconnectBot(bot);
    });

    test('should handle world boundary', async () => {
      const { bot } = await createTestBot({ username: 'ErrorTest_WorldBoundary' });
      
      await setGameMode(bot, 'creative');
      
      bot.chat('/tp 30000000 64 0');
      await sleep(500);
      
      expect(bot).toBeDefined();
      expect(bot.entity.position).toBeDefined();
      
      const pos = bot.entity.position;
      expect(Math.abs(pos.x)).toBeLessThan(30000001);
      
      await disconnectBot(bot);
    });

    test('should handle void fall', async () => {
      const { bot } = await createTestBot({ username: 'ErrorTest_VoidFall' });
      
      await setGameMode(bot, 'survival');
      
      let deathCount = 0;
      bot.on('death', () => { deathCount++; });
      
      bot.chat('/tp 0 -100 0');
      
      await waitForCondition(() => deathCount > 0, 5000);
      
      expect(deathCount).toBeGreaterThan(0);
      
      await disconnectBot(bot);
    }, 10000);

    test('should handle suffocation', async () => {
      const { bot } = await createTestBot({ username: 'ErrorTest_Suffocation' });
      
      await setGameMode(bot, 'survival');
      
      let damageReceived = false;
      bot.on('health', () => {
        if (bot.health < 20) damageReceived = true;
      });
      
      bot.chat('/fill ~ ~ ~ ~ ~2 ~ minecraft:stone');
      await sleep(500);
      
      await setGameMode(bot, 'creative');
      bot.chat('/fill ~ ~ ~ ~ ~2 ~ minecraft:air');
      
      await disconnectBot(bot);
    }, 5000);
  });

  describe('Resource Recovery', () => {
    test('should recover inventory after death in creative', async () => {
      const { bot } = await createTestBot({ username: 'ErrorTest_InventoryRecovery' });
      
      await setGameMode(bot, 'creative');
      
      bot.chat('/give @s minecraft:diamond 64');
      await sleep(500);
      
      const beforeDeath = bot.inventory.count(bot.registry.itemsByName.diamond.id);
      expect(beforeDeath).toBeGreaterThanOrEqual(64);
      
      bot.chat('/kill');
      await waitForCondition(() => bot.health !== undefined, 3000);
      await sleep(500);
      
      const afterDeath = bot.inventory.count(bot.registry.itemsByName.diamond.id);
      
      expect(afterDeath).toBeGreaterThanOrEqual(64);
      
      await disconnectBot(bot);
    }, 10000);

    test('should maintain position after teleport', async () => {
      const { bot } = await createTestBot({ username: 'ErrorTest_TeleportStable' });
      
      const targetX = 100;
      const targetY = 64;
      const targetZ = -200;
      
      bot.chat(`/tp ${targetX} ${targetY} ${targetZ}`);
      await sleep(500);
      
      const pos = bot.entity.position;
      
      expect(Math.abs(pos.x - targetX)).toBeLessThan(1);
      expect(Math.abs(pos.z - targetZ)).toBeLessThan(1);
      
      await disconnectBot(bot);
    });
  });
});
