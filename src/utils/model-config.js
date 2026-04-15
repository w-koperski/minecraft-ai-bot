const logger = require('./logger');

const VALID_PROVIDERS = ['openai', 'anthropic', 'nvidia', 'local', 'ollama', 'lmstudio'];

const DEFAULT_MODELS = {
  pilot: {
    provider: 'nvidia',
    model: 'meta/llama-3.2-1b-instruct',
    temperature: 0.7,
    max_tokens: 500,
    timeout: 10000
  },
  strategy: {
    provider: 'nvidia',
    model: 'qwen/qwen2.5-7b-instruct',
    temperature: 0.7,
    max_tokens: 1000,
    timeout: 15000
  },
  commander: {
    provider: 'anthropic',
    model: 'claude-sonnet-4.5',
    temperature: 0.7,
    max_tokens: 1500,
    timeout: 20000
  }
};

// Cached config
let cachedConfig = null;
let configPath = null;

function loadConfig(path) {
  if (cachedConfig && !path) {
    return cachedConfig;
  }

  const configFile = path || require.resolve('../../config/bot-config.json');
  
  try {
    cachedConfig = require(configFile);
    configPath = configFile;
    logger.debug('Model-Config: Loaded config from', { path: configFile });
    return cachedConfig;
  } catch (error) {
    logger.warn('Model-Config: Failed to load config, using defaults', { error: error.message });
    cachedConfig = { models: {} };
    return cachedConfig;
  }
}

function validateModelConfig(config, layerName) {
  if (!config || typeof config !== 'object') {
    throw new Error(`Invalid config for ${layerName}: not an object`);
  }

  if (!config.model) {
    throw new Error(`Missing required field 'model' for ${layerName} model`);
  }

  const provider = config.provider || 'openai';
  if (provider && !VALID_PROVIDERS.includes(provider.toLowerCase())) {
    logger.warn(`Model-Config: Unknown provider '${provider}' for ${layerName}, using default`);
  }

  let temperature = config.temperature;
  if (temperature !== undefined && temperature !== null) {
    if (typeof temperature !== 'number' || temperature < 0 || temperature > 2) {
      throw new Error(`Invalid temperature for ${layerName}: ${temperature} (must be 0-2)`);
    }
  } else {
    temperature = 0.7;
  }

  let maxTokens = config.max_tokens || config.maxTokens;
  if (maxTokens !== undefined && maxTokens !== null) {
    if (typeof maxTokens !== 'number' || maxTokens <= 0) {
      throw new Error(`Invalid max_tokens for ${layerName}: ${maxTokens} (must be > 0)`);
    }
  } else {
    maxTokens = 1000;
  }

  let timeout = config.timeout;
  if (timeout !== undefined && timeout !== null) {
    if (typeof timeout !== 'number' || timeout <= 0) {
      throw new Error(`Invalid timeout for ${layerName}: ${timeout} (must be > 0)`);
    }
  } else {
    timeout = 15000;
  }

  return {
    provider: provider.toLowerCase(),
    model: config.model,
    temperature,
    max_tokens: maxTokens,
    timeout
  };
}

function validateConfig(config) {
  const errors = [];

  if (!config) {
    config = loadConfig();
  }

const layers = ['pilot', 'strategy', 'commander'];

  for (const layer of layers) {
    try {
      const modelConfig = getModelForLayer(layer, config, true);
      if (!modelConfig) {
        errors.push(`Missing configuration for layer: ${layer}`);
      }
    } catch (error) {
      errors.push(`${layer}: ${error.message}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

function getModelForLayer(layerName, config, skipFallback = false) {
  const normalizedLayer = layerName.toLowerCase();
  
  const validLayers = ['pilot', 'strategy', 'commander'];
  if (!validLayers.includes(normalizedLayer)) {
    throw new Error(`Invalid layer name: ${layerName}. Must be one of: ${validLayers.join(', ')}`);
  }

  if (!config) {
    config = loadConfig();
  }

  const rawConfig = config.models?.[normalizedLayer];

  if (!rawConfig && skipFallback) {
    return null;
  }

  if (!rawConfig) {
    const defaultConfig = DEFAULT_MODELS[normalizedLayer];
    logger.info(`Model-Config: No config for ${normalizedLayer}, using defaults`, { defaults: defaultConfig });
    return defaultConfig;
  }

  const mappedConfig = {
    model: rawConfig.id || rawConfig.model,
    provider: rawConfig.provider,
    temperature: rawConfig.temperature,
    max_tokens: rawConfig.max_tokens || rawConfig.maxTokens,
    timeout: rawConfig.timeout
  };

  Object.keys(mappedConfig).forEach(key => {
    if (mappedConfig[key] === undefined) {
      delete mappedConfig[key];
    }
  });

  try {
    const validated = validateModelConfig(mappedConfig, normalizedLayer);
    
    logger.info(`Model-Config: Loaded config for ${normalizedLayer}`, {
      provider: validated.provider,
      model: validated.model,
      temperature: validated.temperature,
      max_tokens: validated.max_tokens,
      timeout: validated.timeout
    });
    
    return validated;
  } catch (error) {
    if (skipFallback) {
      throw error;
    }
    
    logger.warn(`Model-Config: Invalid config for ${normalizedLayer}, falling back to defaults`, {
      error: error.message
    });
    return DEFAULT_MODELS[normalizedLayer];
  }
}

function logModelSelection() {
  const layers = ['pilot', 'strategy', 'commander'];
  
  logger.info('Model-Config: === Model Selection ===');
  
  for (const layer of layers) {
    try {
      const config = getModelForLayer(layer);
      logger.info(`Model-Config: ${layer.toUpperCase()}`, {
        provider: config.provider,
        model: config.model,
        temperature: config.temperature,
        max_tokens: config.max_tokens,
        timeout: config.timeout
      });
    } catch (error) {
      logger.error(`Model-Config: Failed to load ${layer}`, { error: error.message });
    }
  }
  
  logger.info('Model-Config: ==============================');
}

function resetCache() {
  cachedConfig = null;
  configPath = null;
}

module.exports = {
  getModelForLayer,
  validateConfig,
  logModelSelection,
  loadConfig,
  resetCache,
  DEFAULT_MODELS,
  VALID_PROVIDERS
};