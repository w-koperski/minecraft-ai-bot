/**
 * Custom error classes for minecraft-ai-bot
 * Error taxonomy with severity levels and retry support
 */

// Error codes enum
const ErrorCodes = {
  // Action errors (0xxx)
  ACTION_FAILED: 'ACTION_001',
  ACTION_TIMEOUT: 'ACTION_002',
  ACTION_INVALID: 'ACTION_003',
  ACTION_BLOCKED: 'ACTION_004',

  // State errors (1xxx)
  STATE_INVALID: 'STATE_001',
  STATE_MISSING: 'STATE_002',
  STATE_LOCK_FAILED: 'STATE_003',
  STATE_CORRUPT: 'STATE_004',

  // Rate limit errors (2xxx)
  RATE_LIMIT_EXCEEDED: 'RATE_001',
  RATE_LIMIT_BACKOFF: 'RATE_002',

  // Connection errors (3xxx)
  CONN_FAILED: 'CONN_001',
  CONN_TIMEOUT: 'CONN_002',
  CONN_LOST: 'CONN_003',
  CONN_REFUSED: 'CONN_004',
};

// Severity levels
const Severity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

/**
 * Base error class for all bot errors
 */
class BaseError extends Error {
  constructor(message, code = 'UNKNOWN', severity = Severity.MEDIUM, retryable = false) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.severity = severity;
    this.retryable = retryable;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      retryable: this.retryable,
    };
  }
}

/**
 * Action errors - failed bot actions (movement, mining, crafting, etc.)
 */
class ActionError extends BaseError {
  constructor(message, code = ErrorCodes.ACTION_FAILED, severity = Severity.MEDIUM, retryable = true) {
    super(message, code, severity, retryable);
    this.actionType = null;
  }

  static timeout(actionType = 'unknown') {
    const err = new ActionError(`Action timed out: ${actionType}`, ErrorCodes.ACTION_TIMEOUT, Severity.MEDIUM, true);
    err.actionType = actionType;
    return err;
  }

  static failed(actionType, reason) {
    const err = new ActionError(`Action failed: ${actionType} - ${reason}`, ErrorCodes.ACTION_FAILED, Severity.MEDIUM, true);
    err.actionType = actionType;
    return err;
  }
}

/**
 * State errors - issues with state management, file locking, etc.
 */
class StateError extends BaseError {
  constructor(message, code = ErrorCodes.STATE_INVALID, severity = Severity.HIGH, retryable = false) {
    super(message, code, severity, retryable);
  }

  static missing(key) {
    return new StateError(`State missing: ${key}`, ErrorCodes.STATE_MISSING, Severity.HIGH, false);
  }

  static lockFailed(resource) {
    return new StateError(`Failed to acquire lock: ${resource}`, ErrorCodes.STATE_LOCK_FAILED, Severity.HIGH, false);
  }

  static corrupt(key, reason = 'unknown') {
    return new StateError(`State corrupted: ${key} (${reason})`, ErrorCodes.STATE_CORRUPT, Severity.CRITICAL, false);
  }
}

/**
 * Rate limit errors - API rate limiting, backoff, etc.
 */
class RateLimitError extends BaseError {
  constructor(message, code = ErrorCodes.RATE_LIMIT_EXCEEDED, severity = Severity.MEDIUM, retryable = true, retryAfter = null) {
    super(message, code, severity, retryable);
    this.retryAfter = retryAfter;
  }

  static exceeded(limit = 448, retryAfter = 60000) {
    const err = new RateLimitError(
      `Rate limit exceeded: ${limit} req/min`,
      ErrorCodes.RATE_LIMIT_EXCEEDED,
      Severity.MEDIUM,
      true,
      retryAfter
    );
    return err;
  }

  static backoff(reason, retryAfter) {
    return new RateLimitError(
      `Rate limit backoff: ${reason}`,
      ErrorCodes.RATE_LIMIT_BACKOFF,
      Severity.LOW,
      true,
      retryAfter
    );
  }
}

/**
 * Connection errors - Minecraft server, API connection issues
 */
class ConnectionError extends BaseError {
  constructor(message, code = ErrorCodes.CONN_FAILED, severity = Severity.CRITICAL, retryable = true) {
    super(message, code, severity, retryable);
  }

  static failed(host, port, reason) {
    return new ConnectionError(
      `Connection failed: ${host}:${port} - ${reason}`,
      ErrorCodes.CONN_FAILED,
      Severity.CRITICAL,
      true
    );
  }

  static timeout(host, port) {
    return new ConnectionError(
      `Connection timeout: ${host}:${port}`,
      ErrorCodes.CONN_TIMEOUT,
      Severity.HIGH,
      true
    );
  }

  static lost(reason) {
    return new ConnectionError(
      `Connection lost: ${reason}`,
      ErrorCodes.CONN_LOST,
      Severity.CRITICAL,
      true
    );
  }

  static refused(host, port) {
    return new ConnectionError(
      `Connection refused: ${host}:${port}`,
      ErrorCodes.CONN_REFUSED,
      Severity.CRITICAL,
      false
    );
  }
}

module.exports = {
  ErrorCodes,
  Severity,
  BaseError,
  ActionError,
  StateError,
  RateLimitError,
  ConnectionError,
};