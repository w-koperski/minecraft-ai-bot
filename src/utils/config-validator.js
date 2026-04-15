const fs = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('./logger');

const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'bot-config.json');
const SOUL_MD_PATH = path.join(__dirname, '..', '..', 'personality', 'Soul.md');
const SCHEMA_SQL_PATH = path.join(__dirname, '..', 'memory', 'schema.sql');

/**
 * Configuration validator for startup validation.
 * Validates all config sections, checks required fields, value ranges,
 * file paths, and API connectivity.
 */

/**
 * Validate API section
 * @param {Object} api - API configuration
 * @returns {Object} Validation result { errors: string[], warnings: string[] }
 */
function validateApiSection(api) {
  const errors = [];
  const warnings = [];

  if (!api) {
    errors.push('API section is required');
    return { errors, warnings };
  }

  // Required fields
  if (!api.url) {
    errors.push('API URL is required (api.url)');
  } else {
    // Validate URL format
    try {
      new URL(api.url);
    } catch (e) {
      errors.push(`Invalid API URL format: ${api.url}`);
    }
  }

  if (!api.key) {
    errors.push('API key is required (api.key)');
  }

  // Optional fields with validation
  if (api.timeout !== undefined) {
    if (typeof api.timeout !== 'number' || api.timeout <= 0) {
      errors.push(`Invalid timeout: ${api.timeout} (must be > 0)`);
    }
  }

  if (api.maxConcurrent !== undefined) {
    if (typeof api.maxConcurrent !== 'number' || api.maxConcurrent <= 0) {
      errors.push(`Invalid maxConcurrent: ${api.maxConcurrent} (must be > 0)`);
    }
  }

  return { errors, warnings };
}

/**
 * Validate Models section
 * @param {Object} models - Models configuration
 * @returns {Object} Validation result { errors: string[], warnings: string[] }
 */
function validateModelsSection(models) {
  const errors = [];
  const warnings = [];

  if (!models) {
    errors.push('Models section is required');
    return { errors, warnings };
  }

  const requiredLayers = ['pilot', 'strategy', 'commander'];

  for (const layer of requiredLayers) {
    if (!models[layer]) {
      errors.push(`Missing model configuration for layer: ${layer}`);
      continue;
    }

    const model = models[layer];

    // Required fields
    if (!model.id) {
      errors.push(`Missing model ID for ${layer} layer (model.id)`);
    }

    if (!model.name) {
      warnings.push(`Missing model name for ${layer} layer (model.name)`);
    }

    // Optional fields with validation
    if (model.latencyTarget !== undefined) {
      if (typeof model.latencyTarget !== 'number' || model.latencyTarget <= 0) {
        errors.push(`Invalid latencyTarget for ${layer}: ${model.latencyTarget} (must be > 0)`);
      }
    }
  }

  return { errors, warnings };
}

/**
 * Validate Personality section
 * @param {Object} personality - Personality configuration
 * @returns {Object} Validation result { errors: string[], warnings: string[] }
 */
function validatePersonalitySection(personality) {
  const errors = [];
  const warnings = [];

  if (!personality) {
    warnings.push('Personality section is optional (using defaults)');
    return { errors, warnings };
  }

  // Required fields
  if (!personality.name) {
    errors.push('Personality name is required (personality.name)');
  }

  // Optional fields with validation
  if (personality.temperature !== undefined) {
    if (typeof personality.temperature !== 'number') {
      errors.push(`Invalid temperature type: ${typeof personality.temperature} (must be number)`);
    } else if (personality.temperature < 0 || personality.temperature > 2) {
      errors.push(`Invalid temperature: ${personality.temperature} (must be 0-2)`);
    }
  }

  if (personality.maxTokens !== undefined) {
    if (typeof personality.maxTokens !== 'number' || personality.maxTokens <= 0) {
      errors.push(`Invalid maxTokens: ${personality.maxTokens} (must be > 0)`);
    }
  }

  if (personality.responseStyle && !['helpful', 'concise', 'detailed'].includes(personality.responseStyle)) {
    warnings.push(`Unknown responseStyle: ${personality.responseStyle} (expected: helpful, concise, detailed)`);
  }

  if (personality.traits && !Array.isArray(personality.traits)) {
    errors.push(`Invalid traits: ${typeof personality.traits} (must be array)`);
  }

  return { errors, warnings };
}

/**
 * Validate Autonomy section
 * @param {Object} autonomy - Autonomy configuration
 * @returns {Object} Validation result { errors: string[], warnings: string[] }
 */
function validateAutonomySection(autonomy) {
  const errors = [];
  const warnings = [];

  if (!autonomy) {
    warnings.push('Autonomy section is optional (using defaults)');
    return { errors, warnings };
  }

  // Boolean fields
  const boolFields = ['enabled', 'confirmDangerousActions', 'allowPlayerInteraction', 'autoReconnect', 'restartOnError'];
  for (const field of boolFields) {
    if (autonomy[field] !== undefined && typeof autonomy[field] !== 'boolean') {
      errors.push(`Invalid ${field}: ${typeof autonomy[field]} (must be boolean)`);
    }
  }

  // Numeric fields with validation
  if (autonomy.maxActionsPerMinute !== undefined) {
    if (typeof autonomy.maxActionsPerMinute !== 'number' || autonomy.maxActionsPerMinute <= 0) {
      errors.push(`Invalid maxActionsPerMinute: ${autonomy.maxActionsPerMinute} (must be > 0)`);
    } else if (autonomy.maxActionsPerMinute > 120) {
      warnings.push(`High maxActionsPerMinute value: ${autonomy.maxActionsPerMinute} (may cause rate limiting)`);
    }
  }

  // Trust score validation (if trustScore field exists)
  if (autonomy.trustScore !== undefined) {
    if (typeof autonomy.trustScore !== 'number' || autonomy.trustScore < 0 || autonomy.trustScore > 1) {
      errors.push(`Invalid trustScore: ${autonomy.trustScore} (must be 0-1)`);
    }
  }

  return { errors, warnings };
}

/**
 * Validate Voice section
 * @param {Object} voice - Voice configuration
 * @returns {Object} Validation result { errors: string[], warnings: string[] }
 */
function validateVoiceSection(voice) {
  const errors = [];
  const warnings = [];

  if (!voice) {
    warnings.push('Voice section is optional (using defaults)');
    return { errors, warnings };
  }

  // Boolean fields
  const boolFields = ['enabled', 'inputEnabled', 'outputEnabled', 'pushToTalk'];
  for (const field of boolFields) {
    if (voice[field] !== undefined && typeof voice[field] !== 'boolean') {
      errors.push(`Invalid ${field}: ${typeof voice[field]} (must be boolean)`);
    }
  }

  // Numeric fields
  if (voice.volume !== undefined) {
    if (typeof voice.volume !== 'number' || voice.volume < 0 || voice.volume > 1) {
      errors.push(`Invalid volume: ${voice.volume} (must be 0-1)`);
    }
  }

  if (voice.voiceId && typeof voice.voiceId !== 'string') {
    errors.push(`Invalid voiceId: ${typeof voice.voiceId} (must be string)`);
  }

  if (voice.language && typeof voice.language !== 'string') {
    errors.push(`Invalid language: ${typeof voice.language} (must be string)`);
  }

  return { errors, warnings };
}

/**
 * Validate Memory section
 * @param {Object} memory - Memory configuration
 * @returns {Object} Validation result { errors: string[], warnings: string[] }
 */
function validateMemorySection(memory) {
  const errors = [];
  const warnings = [];

  if (!memory) {
    warnings.push('Memory section is optional (using defaults)');
    return { errors, warnings };
  }

  // Boolean fields
  const boolFields = ['enabled', 'compressOldEntries', 'persistConversation'];
  for (const field of boolFields) {
    if (memory[field] !== undefined && typeof memory[field] !== 'boolean') {
      errors.push(`Invalid ${field}: ${typeof memory[field]} (must be boolean)`);
    }
  }

  // Numeric fields with validation
  if (memory.retentionDays !== undefined) {
    if (typeof memory.retentionDays !== 'number' || memory.retentionDays <= 0) {
      errors.push(`Invalid retentionDays: ${memory.retentionDays} (must be > 0)`);
    } else if (memory.retentionDays > 365) {
      warnings.push(`High retentionDays value: ${memory.retentionDays} (may use significant storage)`);
    }
  }

  if (memory.maxEntries !== undefined) {
    if (typeof memory.maxEntries !== 'number' || memory.maxEntries <= 0) {
      errors.push(`Invalid maxEntries: ${memory.maxEntries} (must be > 0)`);
    }
  }

  return { errors, warnings };
}

/**
 * Validate file paths exist
 * @param {Object} config - Full configuration object
 * @returns {Object} Validation result { errors: string[], warnings: string[] }
 */
function validateFilePaths(config) {
  const errors = [];
  const warnings = [];

  // Check Soul.md exists
  if (!fs.existsSync(SOUL_MD_PATH)) {
    warnings.push(`Soul.md not found at ${SOUL_MD_PATH} (personality file optional but recommended)`);
  }

  // Check schema.sql exists (required for memory)
  if (config.memory?.enabled && !fs.existsSync(SCHEMA_SQL_PATH)) {
    errors.push(`Memory schema not found at ${SCHEMA_SQL_PATH} (required when memory is enabled)`);
  }

  return { errors, warnings };
}

/**
 * Test API connectivity
 * @param {Object} api - API configuration
 * @returns {Promise<Object>} Validation result { errors: string[], warnings: string[] }
 */
async function testApiConnectivity(api) {
  const errors = [];
  const warnings = [];

  if (!api || !api.url) {
    errors.push('Cannot test API connectivity: URL not configured');
    return { errors, warnings };
  }

  try {
    logger.debug('ConfigValidator: Testing API connectivity...');

    const response = await axios.get(`${api.url.replace('/v1/chat/completions', '')}/models`, {
      headers: api.key ? { 'Authorization': `Bearer ${api.key}` } : {},
      timeout: 5000
    });

    if (response.status === 200) {
      logger.debug('ConfigValidator: API connectivity test successful');
    } else {
      warnings.push(`API connectivity returned unexpected status: ${response.status}`);
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      errors.push(`API connection refused: ${api.url} (is Omniroute running?)`);
    } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      warnings.push(`API connectivity timed out: ${api.url}`);
    } else if (error.response?.status === 401 || error.response?.status === 403) {
      errors.push(`API authentication failed: ${error.response.status} (check API key)`);
    } else if (error.response?.status === 404) {
      warnings.push(`API /models endpoint not found (may be normal for some backends)`);
    } else {
      warnings.push(`API connectivity warning: ${error.message}`);
    }
  }

  return { errors, warnings };
}

/**
 * Validate configuration object
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result { valid: boolean, errors: string[], warnings: string[] }
 */
function validateConfig(config) {
  const allErrors = [];
  const allWarnings = [];

  if (!config || typeof config !== 'object') {
    return {
      valid: false,
      errors: ['Invalid config: must be an object'],
      warnings: []
    };
  }

  // Validate each section
  const apiResult = validateApiSection(config.api);
  allErrors.push(...apiResult.errors);
  allWarnings.push(...apiResult.warnings);

  const modelsResult = validateModelsSection(config.models);
  allErrors.push(...modelsResult.errors);
  allWarnings.push(...modelsResult.warnings);

  const personalityResult = validatePersonalitySection(config.personality);
  allErrors.push(...personalityResult.errors);
  allWarnings.push(...personalityResult.warnings);

  const autonomyResult = validateAutonomySection(config.autonomy);
  allErrors.push(...autonomyResult.errors);
  allWarnings.push(...autonomyResult.warnings);

  const voiceResult = validateVoiceSection(config.voice);
  allErrors.push(...voiceResult.errors);
  allWarnings.push(...voiceResult.warnings);

  const memoryResult = validateMemorySection(config.memory);
  allErrors.push(...memoryResult.errors);
  allWarnings.push(...memoryResult.warnings);

  // Validate file paths
  const fileResult = validateFilePaths(config);
  allErrors.push(...fileResult.errors);
  allWarnings.push(...fileResult.warnings);

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings
  };
}

/**
 * Load and validate config from file
 * @param {string} configPath - Path to config file (optional)
 * @returns {Object} Validation result { valid: boolean, errors: string[], warnings: string[], config: Object }
 */
function loadAndValidateConfig(configPath) {
  const filePath = configPath || DEFAULT_CONFIG_PATH;
  let config;

  try {
    config = require(filePath);
  } catch (error) {
    return {
      valid: false,
      errors: [`Failed to load config from ${filePath}: ${error.message}`],
      warnings: [],
      config: null
    };
  }

  const validation = validateConfig(config);
  return {
    ...validation,
    config
  };
}

/**
 * Validate startup - runs all validations including API test
 * Exits process on critical failure
 * @param {string} configPath - Path to config file (optional)
 * @returns {Promise<Object>} Validation result
 */
async function validateStartup(configPath) {
  logger.info('ConfigValidator: Starting configuration validation...');

  // Load config
  const loadResult = loadAndValidateConfig(configPath);

  if (!loadResult.valid) {
    logValidationResults(loadResult.errors, loadResult.warnings);
    logger.error('ConfigValidator: FATAL - Configuration validation failed');
    console.error('\n❌ CONFIGURATION ERROR');
    console.error('Critical validation errors found:');
    loadResult.errors.forEach(err => console.error(`  - ${err}`));
    if (loadResult.warnings.length > 0) {
      console.error('\nWarnings:');
      loadResult.warnings.forEach(warn => console.error(`  - ${warn}`));
    }
    console.error('\nPlease fix these issues before starting the bot.');
    process.exit(1);
  }

  // Test API connectivity (only if config is structurally valid)
  logger.info('ConfigValidator: Testing API connectivity...');
  const apiTestResult = await testApiConnectivity(loadResult.config.api);

  // Combine all results
  const allErrors = [...loadResult.errors, ...apiTestResult.errors];
  const allWarnings = [...loadResult.warnings, ...apiTestResult.warnings];

  logValidationResults(allErrors, allWarnings);

  if (allErrors.length > 0) {
    logger.error('ConfigValidator: FATAL - Startup validation failed');
    console.error('\n❌ STARTUP VALIDATION FAILED');
    console.error('Errors:');
    allErrors.forEach(err => console.error(`  - ${err}`));
    if (allWarnings.length > 0) {
      console.error('\nWarnings:');
      allWarnings.forEach(warn => console.error(`  - ${warn}`));
    }
    console.error('\nPlease fix these issues before starting the bot.');
    process.exit(1);
  }

  if (allWarnings.length > 0) {
    console.error('\n⚠️ STARTUP VALIDATION PASSED (with warnings)');
    console.error('Warnings:');
    allWarnings.forEach(warn => console.error(`  - ${warn}`));
    logger.warn('ConfigValidator: Startup validation passed with warnings', { warnings: allWarnings });
  } else {
    logger.info('ConfigValidator: ✅ Startup validation passed');
    console.log('\n✅ Configuration validated successfully');
  }

  return {
    valid: true,
    errors: allErrors,
    warnings: allWarnings,
    config: loadResult.config
  };
}

/**
 * Log validation results
 * @param {string[]} errors - Error messages
 * @param {string[]} warnings - Warning messages
 */
function logValidationResults(errors, warnings) {
  errors.forEach(err => logger.error(`ConfigValidator: ${err}`));
  warnings.forEach(warn => logger.warn(`ConfigValidator: ${warn}`));
}

module.exports = {
  validateConfig,
  validateStartup,
  loadAndValidateConfig,
  // Exported for testing
  validateApiSection,
  validateModelsSection,
  validatePersonalitySection,
  validateAutonomySection,
  validateVoiceSection,
  validateMemorySection,
  validateFilePaths,
  testApiConnectivity,
  // Constants
  DEFAULT_CONFIG_PATH,
  SOUL_MD_PATH,
  SCHEMA_SQL_PATH
};