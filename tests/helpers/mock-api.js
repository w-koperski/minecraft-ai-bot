class MockAPI {
  constructor() {
    this.callHistory = [];
  }

  mockChatResponse(content = 'Test response', model = 'gpt-4') {
    return {
      choices: [{
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: 'stop',
        index: 0,
      }],
      model,
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
      created: Date.now(),
    };
  }

  mockStreamingChunk(content, isFirst = false, isLast = false) {
    return {
      choices: [{
        delta: { content },
        finish_reason: isLast ? 'stop' : null,
        index: 0,
      }],
    };
  }

  mockEmbeddingResponse(embedding = [0.1, 0.2, 0.3]) {
    return {
      data: [{
        embedding,
        index: 0,
      }],
      model: 'text-embedding-ada-002',
      usage: {
        prompt_tokens: 5,
        total_tokens: 5,
      },
    };
  }

  mockErrorResponse(message = 'Error', status = 500) {
    const error = new Error(message);
    error.response = { status, data: { error: { message } } };
    return error;
  }

  mockRateLimitResponse() {
    const error = new Error('Rate limit exceeded');
    error.response = { status: 429, data: { error: { message: 'Rate limit exceeded' } } };
    return error;
  }

  mockTimeoutResponse() {
    const error = new Error('Request timeout');
    error.code = 'ECONNABORTED';
    return error;
  }

  recordCall(method, args) {
    this.callHistory.push({ method, args, timestamp: Date.now() });
  }

  getCallHistory(method = null) {
    if (method) {
      return this.callHistory.filter(c => c.method === method);
    }
    return this.callHistory;
  }

  clearHistory() {
    this.callHistory = [];
  }

  createMockAxios(response) {
    return {
      post: jest.fn().mockResolvedValue({ data: response }),
      get: jest.fn().mockResolvedValue({ data: response }),
    };
  }

  createFailingMockAxios(error) {
    return {
      post: jest.fn().mockRejectedValue(error),
      get: jest.fn().mockRejectedValue(error),
    };
  }
}

function mockStreamResponse(chunks, delayMs = 50) {
  const responses = [];
  for (let i = 0; i < chunks.length; i++) {
    responses.push({
      choices: [{
        delta: { content: chunks[i] },
        finish_reason: i === chunks.length - 1 ? 'stop' : null,
      }],
    });
  }
  return responses;
}

function createMockOpenAIClient() {
  const mock = new MockAPI();

  return {
    chat: jest.fn((messages, options) => {
      mock.recordCall('chat', { messages, options });
      const content = typeof messages === 'string' ? messages : messages[messages.length - 1]?.content || '';
      return Promise.resolve(mock.mockChatResponse(`Echo: ${content}`));
    }),

    embeddings: jest.fn((text) => {
      mock.recordCall('embeddings', { text });
      return Promise.resolve(mock.mockEmbeddingResponse());
    }),

    healthCheck: jest.fn(() => {
      mock.recordCall('healthCheck', {});
      return Promise.resolve({ ok: true, status: 'healthy' });
    }),

    mock,
  };
}

function createMockConversationturn(role = 'user', content = 'Hello') {
  return { role, content, timestamp: Date.now() };
}

function createMockConversationHistory(turnCount = 5) {
  const history = [];
  for (let i = 0; i < turnCount; i++) {
    history.push(createMockConversationturn(i % 2 === 0 ? 'user' : 'assistant', `Message ${i + 1}`));
  }
  return history;
}

const defaultMock = new MockAPI();

function createMockChatResponse(content, model) {
  return defaultMock.mockChatResponse(content, model);
}

function createMockEmbeddingResponse(embedding) {
  return defaultMock.mockEmbeddingResponse(embedding);
}

function createMockErrorResponse(message, status) {
  return defaultMock.mockErrorResponse(message, status);
}

function createMockRateLimitResponse() {
  return defaultMock.mockRateLimitResponse();
}

function createMockTimeoutResponse() {
  return defaultMock.mockTimeoutResponse();
}

module.exports = {
  MockAPI,
  mockStreamResponse,
  createMockOpenAIClient,
  createMockConversationturn,
  createMockConversationHistory,
  createMockChatResponse,
  createMockEmbeddingResponse,
  createMockErrorResponse,
  createMockRateLimitResponse,
  createMockTimeoutResponse,
};