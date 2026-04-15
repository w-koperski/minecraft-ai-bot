require('dotenv').config();

expect.extend({
  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    return {
      pass,
      message: () => `expected ${received} ${pass ? 'not' : ''} to be within range ${floor} - ${ceiling}`
    };
  }
});

global.E2E_TIMEOUT = 30000;
global.CONNECTION_TIMEOUT = 10000;
global.SPAWN_TIMEOUT = 5000;

console.log('[E2E Setup] Environment loaded');
console.log(`[E2E Setup] MINECRAFT_HOST: ${process.env.MINECRAFT_HOST || 'localhost'}`);
console.log(`[E2E Setup] MINECRAFT_PORT: ${process.env.MINECRAFT_PORT || '25565'}`);
