# tests/ - Test Suite

**Purpose:** Unit, integration, and E2E tests with Docker-based Minecraft server

## Structure

```
tests/
├── unit/           # 9 test files - isolated components with mocks
├── integration/    # 1 test file - layer communication via state files
├── e2e/            # 4 test files - full bot lifecycle (requires server)
├── helpers/        # 6 files - test utilities (bot-factory, mock-api, e2e-setup)
├── mocks/          # 1 file - test doubles (mock API client)
└── fixtures/       # Sample data (conversations, personalities)
```

## Test Commands

```bash
npm test                    # Unit + integration (excludes e2e)
npm run test:unit           # Unit only
npm run test:integration    # Integration only
npm run test:e2e            # E2E (requires Minecraft server)
npm run test:coverage       # Coverage report (70% target)
npm run test:all            # Sequential: unit → integration → e2e
```

## E2E Test Quirks

**Jest configuration (jest.e2e.config.js):**
- `maxWorkers: 1` - Sequential execution (avoids server conflicts)
- `forceExit: true` - Forces process exit (Mineflayer keeps connections)
- `detectOpenHandles: false` - Suppresses handle warnings
- `retryTimes: 2` - Retries for network flakiness
- `testTimeout: 30000` - 30s per test (vs standard 5s)

**Docker requirements:**
```bash
npm run mc:start    # Start Minecraft server (port 25565, offline mode)
npm run mc:stop     # Stop and remove container
npm run mc:restart  # Restart server
```

**Global setup/teardown:**
- `tests/helpers/global-setup.js` - Checks server availability before tests
- `tests/helpers/global-teardown.js` - Cleanup after tests

## Test Patterns

**Mocking external dependencies:**
```javascript
jest.mock('axios');
jest.mock('../../src/utils/logger');
```

**Using test utilities:**
```javascript
const { createMockOpenAIClient } = require('../helpers/mock-api');
const mockClient = createMockOpenAIClient();
```

**Using fixtures:**
```javascript
const conversations = require('../fixtures/conversations');
const fixture = conversations.fixtures.find(f => f.id === 'collect_command');
```

## Coverage

**Target:** 70% for statements, branches, functions, lines

**Scope:** Unit + integration only (E2E excluded via `collectCoverage: false`)

**Rationale:** E2E tests are integration-heavy; coverage focuses on core logic

## Test Execution Order

**Sequential execution (test:all):**
1. Unit tests (fast, isolated)
2. Integration tests (state file communication)
3. E2E tests (slow, requires server)

**Rationale:** Fail fast on unit errors before running expensive E2E tests

## Editing Guidance

**Adding unit tests:**
- Mock external dependencies (axios, logger, mineflayer)
- Use helpers from `tests/helpers/`
- Follow existing patterns in `tests/unit/`

**Adding E2E tests:**
- Ensure server is running (`npm run mc:start`)
- Use 30s timeout for bot actions
- Expect sequential execution (maxWorkers: 1)
- Handle Mineflayer connection cleanup

**Modifying test config:**
- Changes to jest.e2e.config.js affect all E2E tests
- Coverage threshold changes affect CI/CD
- Test path ignore patterns affect default `npm test`

## Common Issues

**E2E tests hang:**
- Check server is running: `docker ps | grep minecraft-test-server`
- Verify port 25565 is accessible
- Check logs: `docker logs minecraft-test-server`

**Coverage below 70%:**
- Run `npm run test:coverage` to see uncovered lines
- Focus on unit tests for core logic
- Integration/E2E don't count toward coverage

**Tests fail intermittently:**
- E2E has `retryTimes: 2` for network flakiness
- Check server stability
- Verify no port conflicts

## Dependencies

- `jest` - Test framework
- `jest-junit` - JUnit XML reporter (E2E only)
- Docker - Minecraft server (E2E only)
- `itzg/minecraft-server` - Docker image (version 1.20.4)
