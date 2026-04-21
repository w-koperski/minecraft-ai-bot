const fs = require('fs').promises;
const path = require('path');
const lockfile = require('lockfile');
const logger = require('./logger');

// Threshold for logging significant drive score changes ( >10 points)
const DRIVE_CHANGE_LOG_THRESHOLD = 10;

class StateManager {
  constructor(stateDir = path.join(process.cwd(), 'state'), lockTimeout = 5000) {
    this.stateDir = stateDir;
    this.lockTimeout = lockTimeout;
    this.schemas = {
      state: {
        type: 'object',
        required: ['position', 'health', 'inventory', 'entities', 'blocks'],
        properties: {
          position: { type: 'object', required: ['x', 'y', 'z'] },
          health: { type: 'number' },
          inventory: { type: 'array' },
          entities: { type: 'array' },
          blocks: { type: 'array' },
          driveScores: {
            type: 'object',
            properties: {
              survival: { type: 'number' },
              curiosity: { type: 'number' },
              competence: { type: 'number' },
              social: { type: 'number' },
              goalOriented: { type: 'number' }
            }
          }
        }
      },
      plan: {
        type: 'array'
      },
      commands: {
        type: 'object'
      }
    };
    // Track previous drive scores to detect significant changes
    this._previousDriveScores = null;
    // Clean stale locks on startup
    this._cleanStaleLocks();
  }

  _cleanStaleLocks() {
    const fs = require('fs');
    const now = Date.now();
    const STALE_THRESHOLD = 10000; // 10 seconds

    try {
      const files = fs.readdirSync(this.stateDir);
      for (const file of files) {
        if (file.endsWith('.lock')) {
          const lockPath = path.join(this.stateDir, file);
          try {
            const stats = fs.statSync(lockPath);
            if (now - stats.mtimeMs > STALE_THRESHOLD) {
              fs.unlinkSync(lockPath);
            }
          } catch {
            // Ignore files that can't be accessed
          }
        }
      }
    } catch {
      // State dir may not exist yet
    }
  }

  addSchema(name, schema) {
    this.schemas[name] = schema;
  }

  async validate(key, data) {
    const schema = this.schemas[key];
    if (!schema) return true;

    if (schema.type === 'object' && typeof data === 'object' && data !== null) {
      if (schema.required) {
        for (const field of schema.required) {
          if (data[field] === undefined) {
            throw new Error(`Validation failed: missing required field '${field}'`);
          }
        }
      }
      if (schema.properties) {
        for (const [field, fieldSchema] of Object.entries(schema.properties)) {
          if (data[field] !== undefined) {
            if (fieldSchema.type === 'object' && typeof data[field] === 'object') {
              if (fieldSchema.required) {
                for (const subField of fieldSchema.required) {
                  if (data[field][subField] === undefined) {
                    throw new Error(`Validation failed: missing required field '${field}.${subField}'`);
                  }
                }
              }
            }
          }
        }
      }
    } else if (schema.type === 'array' && !Array.isArray(data)) {
      throw new Error('Validation failed: expected array');
    }

    return true;
  }

  getFilePath(key) {
    return path.join(this.stateDir, `${key}.json`);
  }

  async withLock(filePath, operation) {
    return new Promise((resolve, reject) => {
      lockfile.lock(
        filePath + '.lock',
        { timeout: this.lockTimeout, retries: 10, minDelay: 50, maxDelay: 500, stale: 10000 },
        async (err) => {
          if (err) return reject(err);
          try {
            const result = await operation();
            resolve(result);
          } catch (opErr) {
            reject(opErr);
          } finally {
            lockfile.unlock(filePath + '.lock', () => {});
          }
        }
      );
    });
  }

  async read(key) {
    const filePath = this.getFilePath(key);

    try {
      await fs.access(filePath);
    } catch {
      return null;
    }

    return this.withLock(filePath, async () => {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    });
  }

  async write(key, data) {
    const filePath = this.getFilePath(key);

    return this.withLock(filePath, async () => {
      await this.validate(key, data);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    });
  }

  async getDriveScores() {
    const state = await this.read('state');
    if (!state || !state.driveScores) {
      return null;
    }
    return state.driveScores;
  }

  async setDriveScores(scores) {
    const state = await this.read('state') || {
      position: { x: 0, y: 64, z: 0 },
      health: 20,
      inventory: [],
      entities: [],
      blocks: []
    };

    const previousScores = state.driveScores;
    state.driveScores = { ...scores };

    await this.write('state', state);
    this._previousDriveScores = previousScores;

    this._logSignificantDriveChanges(previousScores, scores);
  }

  _logSignificantDriveChanges(previous, current) {
    if (!previous) return;

    const changes = [];
    const drives = ['survival', 'curiosity', 'competence', 'social', 'goalOriented'];

    for (const drive of drives) {
      const prevValue = previous[drive];
      const currValue = current[drive];
      if (prevValue !== undefined && currValue !== undefined) {
        const change = Math.abs(currValue - prevValue);
        if (change > DRIVE_CHANGE_LOG_THRESHOLD) {
          changes.push(`${drive}: ${prevValue} -> ${currValue} (${change > 0 ? '+' : ''}${currValue - prevValue})`);
        }
      }
    }

    if (changes.length > 0) {
      logger.info('Drive scores changed significantly', { changes: changes.join(', ') });
    }
  }

  async delete(key) {
    const filePath = this.getFilePath(key);

    try {
      await fs.access(filePath);
    } catch {
      return true;
    }

    return this.withLock(filePath, async () => {
      await fs.unlink(filePath);
      return true;
    });
  }
}

module.exports = StateManager;