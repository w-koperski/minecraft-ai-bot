# E2E Test Suite

End-to-end tests for the Minecraft AI Bot that verify full system behavior with a real Minecraft server.

## Prerequisites

### 1. Minecraft Server

E2E tests require a running Minecraft server. Use Docker for easiest setup:

```bash
npm run mc:start
```

This starts a Minecraft server in offline mode (no authentication required).

**Alternative: Manual setup**
- Download Minecraft server from minecraft.net
- Run with: `java -jar server.jar nogui`
- Set `online-mode=false` in server.properties
- Ensure port 25565 is available

### 2. Environment Configuration

Copy `.env.example` to `.env` and configure:

```env
MINECRAFT_HOST=localhost
MINECRAFT_PORT=25565
```

### 3. Dependencies

```bash
npm install
```

## Running Tests

### All E2E tests

```bash
npm run test:e2e
```

### Verbose output

```bash
npm run test:e2e:verbose
```

### All tests (unit + integration + e2e)

```bash
npm run test:all
```

### Specific test file

```bash
npx jest --config jest.e2e.config.js tests/e2e/bot-lifecycle.test.js
```

## Test Structure

```
tests/e2e/
├── bot-lifecycle.test.js      # Connection, spawn, movement, disconnection
├── goal-completion.test.js    # Resource collection, navigation, crafting
├── chat-commands.test.js      # In-game chat command handling
├── error-recovery.test.js     # Death, stuck, disconnection recovery
└── README.md                   # This file

tests/helpers/
├── e2e-setup.js               # Jest configuration
├── global-setup.js            # Server availability check
├── global-teardown.js         # Cleanup
└── bot-factory.js             # Bot creation utilities

tests/mocks/
└── mock-omniroute.js          # Mock LLM API client
```

## Test Categories

### Bot Lifecycle Tests

- Connection and disconnection
- Spawn event handling
- World state reading (health, inventory, blocks)
- Movement and navigation
- Survival for extended periods

### Goal Completion Tests

- Resource collection (oak logs, cobblestone)
- Inventory management
- Navigation to coordinates
- Pathfinding around obstacles
- Item crafting

### Chat Command Tests

- `!bot collect <resource>`
- `!bot status`
- `!bot help`
- `!bot stop`
- `!bot goto <x> <y> <z>`
- `!bot build <structure>`
- Invalid command handling

### Error Recovery Tests

- Death and respawn
- Stuck detection and recovery
- Connection loss and reconnection
- World boundary handling
- Void fall recovery
- Suffocation recovery

## Timeouts

E2E tests use extended timeouts due to network latency and Minecraft server interactions:

- Default test timeout: 30 seconds
- Connection timeout: 10 seconds
- Spawn timeout: 5 seconds

Some tests have custom timeouts for longer operations:

- Survival test: 35 seconds
- Navigation test: 25 seconds
- Multi-death test: 15 seconds

## Test Helpers

### bot-factory.js

Utilities for creating and managing test bots:

```javascript
const { createTestBot, disconnectBot, sleep } = require('../helpers/bot-factory');

// Create bot with auto-loaded plugins
const { bot } = await createTestBot({ username: 'TestBot' });

// Disconnect gracefully
await disconnectBot(bot);

// Sleep utility
await sleep(1000);
```

### Available helpers

- `createTestBot(options)` - Create bot with pathfinder and collectblock plugins
- `disconnectBot(bot)` - Graceful disconnection
- `sleep(ms)` - Promise-based sleep
- `waitForCondition(fn, timeout, interval)` - Poll until condition met
- `giveItems(bot, itemName, count)` - Give items via commands
- `setGameMode(bot, mode)` - Set creative/survival mode
- `teleport(bot, x, y, z)` - Teleport bot
- `clearInventory(bot)` - Clear inventory
- `findBlock(bot, blockType, maxDistance)` - Find nearby block

## Mocks

### MockOmnirouteClient

Mock for LLM API client that returns predefined responses:

```javascript
const { createMockOmniroute } = require('../tests/mocks/mock-omniroute');

const mockClient = createMockOmniroute();
mockClient.setDelay(210); // Simulate latency

// Track calls
const calls = mockClient.getCallCount();
expect(calls.pilot).toBeGreaterThan(0);
```

## Troubleshooting

### "Minecraft server not available"

Start the server:
```bash
npm run mc:start
```

Or manually start your Minecraft server.

### Connection timeouts

1. Check server is running: `telnet localhost 25565`
2. Verify `online-mode=false` in server.properties
3. Check firewall allows port 25565

### Tests fail with "kicked"

- Server may be in online mode - set `online-mode=false`
- Too many bots connected - restart server

### Docker issues

Restart container:
```bash
npm run mc:restart
```

### Port already in use

Stop existing server:
```bash
npm run mc:stop
```

Or find and kill process:
```bash
lsof -i :25565
kill -9 <PID>
```

## CI/CD Integration

For automated testing in CI:

```yaml
# GitHub Actions example
jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    services:
      minecraft:
        image: itzg/minecraft-server
        ports:
          - 25565:25565
        env:
          EULA: "TRUE"
          ONLINE_MODE: "false"
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test:e2e
        env:
          MINECRAFT_HOST: localhost
          MINECRAFT_PORT: 25565
```

## Known Limitations

1. **No visual perception** - Tests use Mineflayer's block/entity data
2. **Server required** - Cannot run without Minecraft server
3. **Sequential execution** - Tests run one at a time to avoid conflicts
4. **No authentication** - Server must be in offline mode

## Best Practices

1. Always disconnect bots in `finally` blocks or after tests
2. Use unique usernames for each test to avoid conflicts
3. Set creative mode for tests that don't need survival mechanics
4. Clear state files between tests when testing chat commands
5. Use `waitForCondition` instead of fixed delays when possible

## Contributing

When adding new E2E tests:

1. Use helpers from `bot-factory.js`
2. Add appropriate timeout (default 30s, more for long operations)
3. Clean up resources (disconnect bots, clear state)
4. Document any new test categories in this README
5. Ensure tests pass with Docker server setup
