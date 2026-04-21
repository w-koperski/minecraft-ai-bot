/**
 * JSON Schemas for State Files
 *
 * Validates: state.json, commands.json, plan.json, action_error.json, progress.json
 * Each validator returns {valid: boolean, errors: string[]}
 */

/**
 * Validates position object
 * @param {object} pos
 * @returns {boolean}
 */
function isValidPosition(pos) {
  return (
    pos &&
    typeof pos.x === 'number' &&
    typeof pos.y === 'number' &&
    typeof pos.z === 'number'
  );
}

/**
 * Generic object validator with optional fields
 * @param {object} obj
 * @param {Array<{key: string, validator: function, required: boolean}>} fieldSpecs
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateObject(obj, fieldSpecs) {
  const errors = [];

  if (typeof obj !== 'object' || obj === null) {
    return { valid: false, errors: ['Expected object, got ' + typeof obj] };
  }

  for (const { key, validator, required } of fieldSpecs) {
    const value = obj[key];

    if (value === undefined) {
      if (required) {
        errors.push(`Missing required field: ${key}`);
      }
    } else {
      if (!validator(value)) {
        errors.push(`Invalid value for field: ${key}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// SCHEMAS
// =============================================================================

/**
 * Schema for state.json - Bot state (vision output)
 * Fields: position, health, inventory, entities, blocks, chat, events, timestamp
 */
const stateSchema = {
  position: { validator: isValidPosition, required: true },
  health: { validator: (v) => typeof v === 'number' && v >= 0, required: true },
  inventory: { validator: (v) => Array.isArray(v), required: true },
  entities: { validator: (v) => typeof v === 'object' && v !== null, required: true },
  blocks: { validator: (v) => typeof v === 'object' && v !== null, required: true },
  chat: { validator: (v) => Array.isArray(v), required: false },
  events: { validator: (v) => Array.isArray(v), required: false },
  timestamp: { validator: (v) => typeof v === 'number', required: false }
};

/**
 * Schema for commands.json - Commander → Strategy (high-level goals)
 * Fields: goal, priority, createdAt
 */
const commandsSchema = {
  goal: { validator: (v) => typeof v === 'string' || v === null, required: true },
  priority: { validator: (v) => typeof v === 'number' || v === undefined, required: false },
  createdAt: { validator: (v) => typeof v === 'number' || typeof v === 'string' || v === undefined, required: false }
};

/**
 * Schema for plan.json - Strategy → Pilot (action sequences)
 * Array of action objects
 */
const planSchema = {
  type: 'array',
  items: {
    type: 'object',
    fields: {
      action: { validator: (v) => typeof v === 'string', required: true },
      target: { validator: (v) => typeof v === 'object' || v === undefined, required: false },
      expectedOutcome: { validator: (v) => typeof v === 'object' || v === undefined, required: false },
      timeout: { validator: (v) => typeof v === 'number' || v === undefined, required: false }
    }
  }
};

/**
 * Schema for action_error.json - Pilot → Strategy errors
 * Fields: action, expected, actual, timestamp, severity
 */
const actionErrorSchema = {
  action: { validator: (v) => typeof v === 'object' || typeof v === 'string', required: true },
  expected: { validator: (v) => typeof v === 'object', required: true },
  actual: { validator: (v) => typeof v === 'object', required: true },
  timestamp: { validator: (v) => typeof v === 'number', required: true },
  severity: { validator: (v) => ['low', 'medium', 'high', 'critical'].includes(v), required: false }
};

/**
 * Schema for progress.json - Progress tracking
 * Fields: goal, completedSteps, totalSteps, status, startedAt, updatedAt
 */
const progressSchema = {
  goal: { validator: (v) => typeof v === 'string' || v === null, required: true },
  completedSteps: { validator: (v) => Array.isArray(v), required: true },
  totalSteps: { validator: (v) => typeof v === 'number', required: true },
  status: { validator: (v) => ['pending', 'in_progress', 'completed', 'failed'].includes(v), required: true },
  startedAt: { validator: (v) => typeof v === 'number', required: false },
  updatedAt: { validator: (v) => typeof v === 'number', required: false }
};

// =============================================================================
// VALIDATORS
// =============================================================================

/**
 * Validates state.json structure
 * @param {object} state
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateState(state) {
  return validateObject(state, Object.entries(stateSchema).map(([key, config]) => ({
    key,
    validator: config.validator,
    required: config.required
  })));
}

/**
 * Validates commands.json structure
 * @param {object} commands
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateCommands(commands) {
  return validateObject(commands, Object.entries(commandsSchema).map(([key, config]) => ({
    key,
    validator: config.validator,
    required: config.required
  })));
}

/**
 * Validates plan.json structure
 * @param {Array} plan
 * @returns {{valid: boolean, errors: string[]}}
 */
function validatePlan(plan) {
  const errors = [];

  if (!Array.isArray(plan)) {
    return { valid: false, errors: ['Plan must be an array'] };
  }

  for (let i = 0; i < plan.length; i++) {
    const item = plan[i];
    if (typeof item !== 'object' || item === null) {
      errors.push(`Plan[${i}]: must be an object`);
      continue;
    }

    if (!item.action || typeof item.action !== 'string') {
      errors.push(`Plan[${i}]: missing or invalid action field`);
    }

    if (item.target !== undefined && typeof item.target !== 'object') {
      errors.push(`Plan[${i}]: target must be an object if provided`);
    }

    if (item.expectedOutcome !== undefined && typeof item.expectedOutcome !== 'object') {
      errors.push(`Plan[${i}]: expectedOutcome must be an object if provided`);
    }

    if (item.timeout !== undefined && typeof item.timeout !== 'number') {
      errors.push(`Plan[${i}]: timeout must be a number if provided`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates action_error.json structure
 * @param {object} actionError
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateActionError(actionError) {
  return validateObject(actionError, Object.entries(actionErrorSchema).map(([key, config]) => ({
    key,
    validator: config.validator,
    required: config.required
  })));
}

/**
 * Validates progress.json structure
 * @param {object} progress
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateProgress(progress) {
  return validateObject(progress, Object.entries(progressSchema).map(([key, config]) => ({
    key,
    validator: config.validator,
    required: config.required
  })));
}

module.exports = {
  validateState,
  validateCommands,
  validatePlan,
  validateActionError,
  validateProgress
};