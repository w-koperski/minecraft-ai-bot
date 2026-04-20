# Test Suite

## Overview

This directory contains the test suite for the Minecraft AI Bot project. The bot uses a 3-layer AI architecture (Pilot, Strategy, Commander) and all three layers are tested.

## Test Structure

```
tests/
├── unit/              # Isolated component tests
├── integration/       # Layer communication tests
├── e2e/              # Full bot lifecycle tests
├── helpers/          # Test utilities
├── mocks/            # Test doubles
├── fixtures/         # Sample data for tests
└── README.md         # This file
```

## Test Types

### Unit Tests (`tests/unit/`)

Unit tests verify individual components in isolation with mocks.

- `state-manager.test.js` - File-based state management
- `api-client.test.js` - LLM API client
- `commander.test.js` - Commander layer logic
- `action-awareness.test.js` - PIANO verification
- `rate-limiter.test.js` - Rate limiting
- `openai-client.test.js` - OpenAI-compatible API client
- `personality-engine.test.js` - Personality trait system
- `nlp-handler.test.js` - NLP and intent parsing

### Integration Tests (`tests/integration/`)

Integration tests verify communication between layers via state files.

### E2E Tests (`tests/e2e/`)

End-to-end tests verify full bot lifecycle with real Minecraft server.

## Running Tests

```bash
npm test                    # Unit + Integration (excludes e2e)
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only
npm run test:e2e            # E2E tests (requires Minecraft server)
```

## Testing Patterns

### Mocking External Dependencies

```javascript
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    post: jest.fn(),
    get: jest.fn(),
  })),
}));

jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));
```

### Using Mock Utilities

```javascript
const { createMockOpenAIClient } = require('../helpers/mock-api');

test('should chat', async () => {
  const mockClient = createMockOpenAIClient();
  const response = await mockClient.chat('Hello');
  expect(response).toBeDefined();
});
```

### Using Test Fixtures

```javascript
const conversations = require('../fixtures/conversations');
const personalities = require('../fixtures/personalities');

test('should parse collect command', async () => {
  const fixture = conversations.fixtures.find(f => f.id === 'collect_command');
  const result = await handler.parse(fixture.input);
  expect(result.intent).toBe(fixture.expected.intent);
});
```

## Test Utilities

- `tests/helpers/bot-factory.js` - Creates test bot instances
- `tests/helpers/mock-api.js` - Mock API responses
- `tests/helpers/mock-personality.js` - Mock personality traits
- `tests/mocks/mock-api-client.js` - Mock API client

## Test Fixtures

- `tests/fixtures/conversations.json` - Sample conversations and commands
- `tests/fixtures/personalities.json` - Sample personality configurations

## Coverage

Target: 70% code coverage. Run `npm run test:coverage` to generate a coverage report.

## Companion Features Testing

New companion features (OpenAI client, Personality Engine, NLP Handler) follow the same patterns:

1. **OpenAI Client** - Tests API calls, streaming, error handling
2. **Personality Engine** - Tests trait management, serialization, emotional triggers
3. **NLP Handler** - Tests intent recognition, entity extraction, sentiment analysis

All use mocks for external dependencies and fixtures for test data.