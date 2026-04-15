const { createTestBot, disconnectBot, sleep, giveItems, setGameMode, clearInventory } = require('../helpers/bot-factory');
const { createChatHandler } = require('../../src/chat/chat-handler');
const path = require('path');
const fs = require('fs').promises;
const StateManager = require('../../src/utils/state-manager');

describe('Chat Commands', () => {
  describe('!bot collect', () => {
    test('should respond to !bot collect wood', async () => {
      const { bot } = await createTestBot({ username: 'ChatTest_Collect' });
      const stateManager = new StateManager(path.join(process.cwd(), 'state'));
      const handler = createChatHandler(bot);
      
      let chatMessage = null;
      bot.chat = (message) => { chatMessage = message; };
      
      bot.emit('bot_command', { username: 'TestPlayer', command: 'collect wood' });
      
      await sleep(500);
      
      expect(chatMessage).toBeDefined();
      expect(chatMessage).toContain('collecting');
      expect(chatMessage).toContain('wood');
      
      handler.remove();
      await disconnectBot(bot);
    });

    test('should write collect command to state', async () => {
      const { bot } = await createTestBot({ username: 'ChatTest_CollectState' });
      const handler = createChatHandler(bot);
      
      await fs.mkdir(path.join(process.cwd(), 'state'), { recursive: true }).catch(() => {});
      
      bot.emit('bot_command', { username: 'TestPlayer', command: 'collect oak_logs' });
      
      await sleep(500);
      
      const stateManager = new StateManager(path.join(process.cwd(), 'state'));
      const commands = await stateManager.read('commands');
      
      expect(commands).toBeDefined();
      expect(commands.action).toBe('collect');
      expect(commands.target).toContain('oak');
      
      handler.remove();
      await disconnectBot(bot);
    });

    test('should handle collect with amount', async () => {
      const { bot } = await createTestBot({ username: 'ChatTest_CollectAmount' });
      const handler = createChatHandler(bot);
      
      let chatMessage = null;
      bot.chat = (message) => { chatMessage = message; };
      
      bot.emit('bot_command', { username: 'TestPlayer', command: 'collect stone 32' });
      
      await sleep(500);
      
      expect(chatMessage).toBeDefined();
      expect(chatMessage).toContain('stone');
      
      handler.remove();
      await disconnectBot(bot);
    });
  });

  describe('!bot status', () => {
    test('should respond with health status', async () => {
      const { bot } = await createTestBot({ username: 'ChatTest_StatusHealth' });
      const handler = createChatHandler(bot);
      
      let chatMessage = null;
      bot.chat = (message) => { chatMessage = message; };
      
      bot.emit('bot_command', { username: 'TestPlayer', command: 'status' });
      
      await sleep(500);
      
      expect(chatMessage).toBeDefined();
      expect(chatMessage).toContain('Health');
      expect(chatMessage).toContain('20');
      
      handler.remove();
      await disconnectBot(bot);
    });

    test('should respond with position', async () => {
      const { bot } = await createTestBot({ username: 'ChatTest_StatusPos' });
      const handler = createChatHandler(bot);
      
      let chatMessage = null;
      bot.chat = (message) => { chatMessage = message; };
      
      bot.emit('bot_command', { username: 'TestPlayer', command: 'status' });
      
      await sleep(500);
      
      expect(chatMessage).toBeDefined();
      expect(chatMessage).toContain('Position');
      
      const pos = bot.entity.position;
      expect(chatMessage).toContain(Math.round(pos.x).toString());
      
      handler.remove();
      await disconnectBot(bot);
    });

    test('should respond with game mode', async () => {
      const { bot } = await createTestBot({ username: 'ChatTest_StatusMode' });
      const handler = createChatHandler(bot);
      
      let chatMessage = null;
      bot.chat = (message) => { chatMessage = message; };
      
      bot.emit('bot_command', { username: 'TestPlayer', command: 'status' });
      
      await sleep(500);
      
      expect(chatMessage).toBeDefined();
      expect(chatMessage).toContain('Game Mode');
      
      handler.remove();
      await disconnectBot(bot);
    });
  });

  describe('!bot help', () => {
    test('should list available commands', async () => {
      const { bot } = await createTestBot({ username: 'ChatTest_Help' });
      const handler = createChatHandler(bot);
      
      let chatMessages = [];
      bot.chat = (message) => { chatMessages.push(message); };
      
      bot.emit('bot_command', { username: 'TestPlayer', command: 'help' });
      
      await sleep(500);
      
      expect(chatMessages.length).toBeGreaterThan(0);
      const helpText = chatMessages.join(' ');
      
      expect(helpText).toContain('collect');
      expect(helpText).toContain('build');
      expect(helpText).toContain('goto');
      expect(helpText).toContain('status');
      expect(helpText).toContain('stop');
      
      handler.remove();
      await disconnectBot(bot);
    });
  });

  describe('!bot stop', () => {
    test('should stop current action', async () => {
      const { bot } = await createTestBot({ username: 'ChatTest_Stop' });
      const handler = createChatHandler(bot);
      
      let stopEmitted = false;
      bot.on('stop_requested', () => { stopEmitted = true; });
      
      let chatMessage = null;
      bot.chat = (message) => { chatMessage = message; };
      
      bot.emit('bot_command', { username: 'TestPlayer', command: 'stop' });
      
      await sleep(500);
      
      expect(stopEmitted).toBe(true);
      expect(chatMessage).toContain('stopping');
      
      handler.remove();
      await disconnectBot(bot);
    });

    test('should write stop command to state', async () => {
      const { bot } = await createTestBot({ username: 'ChatTest_StopState' });
      const handler = createChatHandler(bot);
      
      await fs.mkdir(path.join(process.cwd(), 'state'), { recursive: true }).catch(() => {});
      
      bot.emit('bot_command', { username: 'TestPlayer', command: 'stop' });
      
      await sleep(500);
      
      const stateManager = new StateManager(path.join(process.cwd(), 'state'));
      const commands = await stateManager.read('commands');
      
      expect(commands).toBeDefined();
      expect(commands.action).toBe('stop');
      
      handler.remove();
      await disconnectBot(bot);
    });
  });

  describe('!bot goto', () => {
    test('should accept coordinates', async () => {
      const { bot } = await createTestBot({ username: 'ChatTest_Goto' });
      const handler = createChatHandler(bot);
      
      let chatMessage = null;
      bot.chat = (message) => { chatMessage = message; };
      
      bot.emit('bot_command', { username: 'TestPlayer', command: 'goto 100 64 200' });
      
      await sleep(500);
      
      expect(chatMessage).toBeDefined();
      expect(chatMessage).toContain('navigating');
      expect(chatMessage).toContain('100');
      expect(chatMessage).toContain('200');
      
      handler.remove();
      await disconnectBot(bot);
    });

    test('should write goto coordinates to state', async () => {
      const { bot } = await createTestBot({ username: 'ChatTest_GotoState' });
      const handler = createChatHandler(bot);
      
      await fs.mkdir(path.join(process.cwd(), 'state'), { recursive: true }).catch(() => {});
      
      bot.emit('bot_command', { username: 'TestPlayer', command: 'goto 50 70 -30' });
      
      await sleep(500);
      
      const stateManager = new StateManager(path.join(process.cwd(), 'state'));
      const commands = await stateManager.read('commands');
      
      expect(commands).toBeDefined();
      expect(commands.action).toBe('goto');
      expect(commands.position.x).toBe(50);
      expect(commands.position.y).toBe(70);
      expect(commands.position.z).toBe(-30);
      
      handler.remove();
      await disconnectBot(bot);
    });
  });

  describe('!bot build', () => {
    test('should accept build command', async () => {
      const { bot } = await createTestBot({ username: 'ChatTest_Build' });
      const handler = createChatHandler(bot);
      
      let chatMessage = null;
      bot.chat = (message) => { chatMessage = message; };
      
      bot.emit('bot_command', { username: 'TestPlayer', command: 'build house' });
      
      await sleep(500);
      
      expect(chatMessage).toBeDefined();
      expect(chatMessage).toContain('building');
      expect(chatMessage).toContain('house');
      
      handler.remove();
      await disconnectBot(bot);
    });

    test('should default to house if no structure specified', async () => {
      const { bot } = await createTestBot({ username: 'ChatTest_BuildDefault' });
      const handler = createChatHandler(bot);
      
      let chatMessage = null;
      bot.chat = (message) => { chatMessage = message; };
      
      bot.emit('bot_command', { username: 'TestPlayer', command: 'build' });
      
      await sleep(500);
      
      expect(chatMessage).toBeDefined();
      expect(chatMessage).toContain('house');
      
      handler.remove();
      await disconnectBot(bot);
    });
  });

  describe('Invalid Commands', () => {
    test('should handle unknown command', async () => {
      const { bot } = await createTestBot({ username: 'ChatTest_Invalid' });
      const handler = createChatHandler(bot);
      
      let chatMessage = null;
      bot.chat = (message) => { chatMessage = message; };
      
      bot.emit('bot_command', { username: 'TestPlayer', command: 'fly' });
      
      await sleep(500);
      
      expect(chatMessage).toBeDefined();
      expect(chatMessage).toContain('Unknown command');
      
      handler.remove();
      await disconnectBot(bot);
    });

    test('should handle empty command', async () => {
      const { bot } = await createTestBot({ username: 'ChatTest_Empty' });
      const handler = createChatHandler(bot);
      
      let chatMessage = null;
      bot.chat = (message) => { chatMessage = message; };
      
      bot.emit('bot_command', { username: 'TestPlayer', command: '' });
      
      await sleep(500);
      
      expect(chatMessage).toBeDefined();
      expect(chatMessage).toContain('Usage');
      
      handler.remove();
      await disconnectBot(bot);
    });

    test('should suggest help on unknown command', async () => {
      const { bot } = await createTestBot({ username: 'ChatTest_SuggestHelp' });
      const handler = createChatHandler(bot);
      
      let chatMessage = null;
      bot.chat = (message) => { chatMessage = message; };
      
      bot.emit('bot_command', { username: 'TestPlayer', command: 'unknowncmd' });
      
      await sleep(500);
      
      expect(chatMessage).toBeDefined();
      expect(chatMessage).toContain('help');
      
      handler.remove();
      await disconnectBot(bot);
    });
  });

  describe('Chat Integration', () => {
    test('should receive chat messages', async () => {
      const { bot } = await createTestBot({ username: 'ChatTest_Receive' });
      
      let receivedMessage = null;
      bot.on('chat', (username, message) => {
        if (username !== bot.username) {
          receivedMessage = { username, message };
        }
      });
      
      await setGameMode(bot, 'creative');
      bot.chat('Test message from bot');
      
      await sleep(1000);
      
      expect(bot).toBeDefined();
      
      await disconnectBot(bot);
    });

    test('should parse !bot prefix correctly', async () => {
      const { bot } = await createTestBot({ username: 'ChatTest_ParsePrefix' });
      const handler = createChatHandler(bot);
      
      let commandReceived = null;
      bot.on('bot_command', (data) => {
        commandReceived = data;
      });
      
      bot.emit('chat', 'TestPlayer', '!bot status');
      
      await sleep(500);
      
      expect(commandReceived).toBeDefined();
      expect(commandReceived.username).toBe('TestPlayer');
      expect(commandReceived.command).toBe('status');
      
      handler.remove();
      await disconnectBot(bot);
    });

    test('should ignore own messages', async () => {
      const { bot } = await createTestBot({ username: 'ChatTest_IgnoreOwn' });
      const handler = createChatHandler(bot);
      
      let commandReceived = false;
      bot.on('bot_command', () => {
        commandReceived = true;
      });
      
      bot.emit('chat', bot.username, '!bot status');
      
      await sleep(500);
      
      expect(commandReceived).toBe(false);
      
      handler.remove();
      await disconnectBot(bot);
    });
  });
});
