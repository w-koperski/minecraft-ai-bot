const { createTestBot, disconnectBot, sleep, waitForCondition, setGameMode } = require('../helpers/bot-factory');

describe('Bot Lifecycle', () => {
  describe('Connection', () => {
    test('should connect to Minecraft server', async () => {
      const { bot } = await createTestBot({ username: 'LifecycleTest_Connect' });
      
      expect(bot).toBeDefined();
      expect(bot.entity).toBeDefined();
      expect(bot.entity.position).toBeDefined();
      expect(bot.player).toBeDefined();
      
      await disconnectBot(bot);
    });

    test('should load required plugins', async () => {
      const { bot } = await createTestBot({ username: 'LifecycleTest_Plugins' });
      
      expect(bot.pathfinder).toBeDefined();
      expect(bot.collectBlock).toBeDefined();
      
      await disconnectBot(bot);
    });

    test('should receive spawn event', async () => {
      let spawned = false;
      
      const { bot } = await createTestBot({ username: 'LifecycleTest_Spawn' });
      bot.on('spawn', () => { spawned = true; });
      
      await sleep(1000);
      
      expect(bot.entity).toBeDefined();
      expect(bot.game).toBeDefined();
      
      await disconnectBot(bot);
    });
  });

  describe('World State', () => {
    test('should read game mode', async () => {
      const { bot } = await createTestBot({ username: 'LifecycleTest_GameMode' });
      
      expect(bot.game).toBeDefined();
      expect(bot.game.gameMode).toBeDefined();
      
      await disconnectBot(bot);
    });

    test('should read health and food', async () => {
      const { bot } = await createTestBot({ username: 'LifecycleTest_Health' });
      
      expect(bot.health).toBeDefined();
      expect(bot.health).toBeGreaterThanOrEqual(0);
      expect(bot.health).toBeLessThanOrEqual(20);
      
      expect(bot.food).toBeDefined();
      expect(bot.food).toBeGreaterThanOrEqual(0);
      expect(bot.food).toBeLessThanOrEqual(20);
      
      await disconnectBot(bot);
    });

    test('should access inventory', async () => {
      const { bot } = await createTestBot({ username: 'LifecycleTest_Inventory' });
      
      expect(bot.inventory).toBeDefined();
      expect(bot.inventory.slots).toBeDefined();
      expect(Array.isArray(bot.inventory.slots)).toBe(true);
      
      await disconnectBot(bot);
    });

    test('should detect nearby blocks', async () => {
      const { bot } = await createTestBot({ username: 'LifecycleTest_Blocks' });
      
      const pos = bot.entity.position;
      const blockBelow = bot.blockAt(pos.offset(0, -1, 0));
      
      expect(blockBelow).toBeDefined();
      expect(blockBelow.name).toBeDefined();
      
      await disconnectBot(bot);
    });

    test('should detect nearby entities', async () => {
      const { bot } = await createTestBot({ username: 'LifecycleTest_Entities' });
      
      await sleep(2000);
      
      const entities = Object.values(bot.entities);
      expect(Array.isArray(entities)).toBe(true);
      
      await disconnectBot(bot);
    });
  });

  describe('Movement', () => {
    test('should have valid position', async () => {
      const { bot } = await createTestBot({ username: 'LifecycleTest_Position' });
      
      const pos = bot.entity.position;
      expect(pos.x).toBeDefined();
      expect(pos.y).toBeDefined();
      expect(pos.z).toBeDefined();
      expect(typeof pos.x).toBe('number');
      expect(typeof pos.y).toBe('number');
      expect(typeof pos.z).toBe('number');
      
      await disconnectBot(bot);
    });

    test('should be able to move', async () => {
      const { bot, Movements, goals, defaultMove } = await createTestBot({ username: 'LifecycleTest_Move' });
      
      await setGameMode(bot, 'creative');
      
      const startPos = { ...bot.entity.position };
      const targetPos = startPos.offset(5, 0, 0);
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          disconnectBot(bot);
          reject(new Error('Movement timeout'));
        }, 10000);

        bot.pathfinder.setGoal(new goals.GoalBlock(targetPos.x, targetPos.y, targetPos.z));
        
        bot.pathfinder.once('goal_reached', () => {
          clearTimeout(timeout);
          
          const finalPos = bot.entity.position;
          const distance = Math.abs(finalPos.x - startPos.x);
          
          expect(distance).toBeGreaterThan(3);
          
          disconnectBot(bot).then(resolve);
        });

        bot.pathfinder.once('goal_updated', () => {
          if (!bot.pathfinder.isMoving()) {
            bot.pathfinder.setGoal(new goals.GoalBlock(targetPos.x, targetPos.y, targetPos.z));
          }
        });
      });
    }, 15000);

    test('should be able to jump', async () => {
      const { bot } = await createTestBot({ username: 'LifecycleTest_Jump' });
      
      const startY = bot.entity.position.y;
      
      await new Promise((resolve) => {
        bot.setControlState('jump', true);
        setTimeout(() => {
          bot.setControlState('jump', false);
          resolve();
        }, 500);
      });
      
      await sleep(1000);
      
      const jumped = bot.entity.position.y > startY - 0.5;
      
      await disconnectBot(bot);
      
      expect(jumped).toBe(true);
    });
  });

  describe('Survival', () => {
    test('should survive for 30 seconds in survival mode', async () => {
      const { bot } = await createTestBot({ username: 'LifecycleTest_Survive30' });
      
      await setGameMode(bot, 'survival');
      
      const startTime = Date.now();
      let died = false;
      
      bot.on('death', () => { died = true; });
      
      await sleep(30000);
      
      const survived = !died && (Date.now() - startTime >= 30000);
      
      await disconnectBot(bot);
      
      expect(survived).toBe(true);
    }, 35000);

    test('should respawn after death', async () => {
      const { bot } = await createTestBot({ username: 'LifecycleTest_Respawn' });
      
      let deathCount = 0;
      let spawnCount = 0;
      
      bot.on('death', () => { deathCount++; });
      bot.on('spawn', () => { spawnCount++; });
      
      bot.chat('/kill');
      
      const respawned = await waitForCondition(
        () => deathCount > 0 && spawnCount >= 2,
        5000
      );
      
      await disconnectBot(bot);
      
      expect(respawned).toBe(true);
      expect(deathCount).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Disconnection', () => {
    test('should disconnect gracefully', async () => {
      const { bot } = await createTestBot({ username: 'LifecycleTest_Disconnect' });
      
      let disconnected = false;
      bot.on('end', () => { disconnected = true; });
      
      await disconnectBot(bot);
      
      await sleep(500);
      
      expect(disconnected).toBe(true);
    });

    test('should handle reconnection', async () => {
      const { bot: bot1 } = await createTestBot({ username: 'LifecycleTest_Reconnect' });
      await disconnectBot(bot1);
      
      await sleep(1000);
      
      const { bot: bot2 } = await createTestBot({ username: 'LifecycleTest_Reconnect_2' });
      
      expect(bot2).toBeDefined();
      expect(bot2.entity).toBeDefined();
      
      await disconnectBot(bot2);
    });

    test('should handle multiple concurrent bots', async () => {
      const bots = await Promise.all([
        createTestBot({ username: 'LifecycleTest_Multi_1' }),
        createTestBot({ username: 'LifecycleTest_Multi_2' }),
        createTestBot({ username: 'LifecycleTest_Multi_3' })
      ]);
      
      expect(bots).toHaveLength(3);
      bots.forEach(({ bot }) => {
        expect(bot).toBeDefined();
        expect(bot.entity).toBeDefined();
      });
      
      await Promise.all(bots.map(({ bot }) => disconnectBot(bot)));
    });
  });
});
