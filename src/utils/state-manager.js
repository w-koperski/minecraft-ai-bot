const fs = require('fs').promises;
const path = require('path');
const lockfile = require('lockfile');

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
          blocks: { type: 'array' }
        }
      },
      plan: {
        type: 'array'
      },
      commands: {
        type: 'object'
      }
    };
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
        filePath,
        { timeout: this.lockTimeout, retries: 0 },
        async (err) => {
          if (err) return reject(err);
          try {
            const result = await operation();
            resolve(result);
          } catch (opErr) {
            reject(opErr);
          } finally {
            lockfile.unlock(filePath, () => {});
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
    await this.validate(key, data);
    const filePath = this.getFilePath(key);

    return this.withLock(filePath, async () => {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    });
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