/**
 * Jest E2E Test Configuration
 * 
 * Extended timeouts for tests that require real Minecraft server connections.
 * Tests assume Docker Minecraft server is running.
 */

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/e2e/**/*.test.js'],
  testTimeout: 30000, // 30s per test
  setupFilesAfterEnv: ['<rootDir>/tests/helpers/e2e-setup.js'],
  verbose: true,
  collectCoverage: false, // E2E tests don't need coverage
  maxWorkers: 1, // Run tests sequentially to avoid server conflicts
  forceExit: true, // Force exit after tests complete
  detectOpenHandles: false, // Don't warn about open handles (Mineflayer keeps connections)
  
  // Global setup/teardown for Minecraft server
  globalSetup: '<rootDir>/tests/helpers/global-setup.js',
  globalTeardown: '<rootDir>/tests/helpers/global-teardown.js',
  
  // Module paths
  moduleDirectories: ['node_modules', 'src'],
  
  // Test retry on failure (network issues)
  retryTimes: 2,
  
  // Reporters
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'test-results/e2e',
      outputName: 'junit.xml'
    }]
  ]
};
