class MockOmnirouteClient {
  constructor() {
    this.callCount = {
      pilot: 0,
      strategy: 0,
      commander: 0
    };
    
    this.responses = {
      pilot: this.defaultPilotResponse.bind(this),
      strategy: this.defaultStrategyResponse.bind(this),
      commander: this.defaultCommanderResponse.bind(this)
    };
    
    this.delay = 0;
  }

  setDelay(ms) {
    this.delay = ms;
  }

  async simulateDelay() {
    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }
  }

  defaultPilotResponse(prompt, options = {}) {
    return {
      choices: [{
        message: {
          content: JSON.stringify({ type: 'move', direction: 'forward', duration: 500 })
        }
      }],
      model: 'mock-pilot',
      latency: 210
    };
  }

  defaultStrategyResponse(messages, options = {}) {
    return {
      choices: [{
        message: {
          content: JSON.stringify([
            { action: 'move_to', params: { target: 'oak_log' }, description: 'Find oak tree' },
            { action: 'collect_block', params: { target: 'oak_log', count: 10 }, description: 'Collect oak logs' },
            { action: 'wait', params: { duration: 1000 }, description: 'Verify collection' }
          ])
        }
      }],
      model: 'mock-strategy',
      latency: 410
    };
  }

  defaultCommanderResponse(messages, options = {}) {
    return {
      choices: [{
        message: {
          content: JSON.stringify({ goal: 'survive', priority: 'high' })
        }
      }],
      model: 'mock-commander',
      latency: 1000
    };
  }

  async pilot(prompt, options = {}) {
    await this.simulateDelay();
    this.callCount.pilot++;
    return this.responses.pilot(prompt, options);
  }

  async strategy(messages, options = {}) {
    await this.simulateDelay();
    this.callCount.strategy++;
    return this.responses.strategy(messages, options);
  }

  async commander(messages, options = {}) {
    await this.simulateDelay();
    this.callCount.commander++;
    return this.responses.commander(messages, options);
  }

  reset() {
    this.callCount = { pilot: 0, strategy: 0, commander: 0 };
  }

  getCallCount() {
    return { ...this.callCount };
  }

  setResponse(layer, responseFn) {
    this.responses[layer] = responseFn;
  }

  async stop() {
    return Promise.resolve();
  }
}

function createMockOmniroute() {
  return new MockOmnirouteClient();
}

module.exports = { MockOmnirouteClient, createMockOmniroute };
