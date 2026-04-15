const fs = require('fs');
const path = require('path');

const mockLockfile = {
  lock: jest.fn((filePath, opts, cb) => {
    if (opts && opts.timeout === 0) {
      return cb(new Error('Lock timeout'));
    }
    setTimeout(() => cb(null), 5);
  }),
  unlock: jest.fn((filePath, cb) => setTimeout(() => cb(null), 5)),
  check: jest.fn((filePath, opts, cb) => cb(null, false))
};

jest.mock('lockfile', () => mockLockfile);

describe('StateManager', () => {
  let StateManager;
  let stateDir;

  beforeEach(() => {
    jest.resetModules();
    stateDir = path.join(__dirname, '../../state');
    StateManager = require('../../src/utils/state-manager');
  });

  afterEach(async () => {
    mockLockfile.lock.mockClear();
    mockLockfile.unlock.mockClear();
    if (fs.existsSync(stateDir)) {
      const files = fs.readdirSync(stateDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            fs.unlinkSync(path.join(stateDir, file));
          } catch (e) {}
        }
      }
    }
  });

  describe('constructor', () => {
    it('should create instance with default stateDir', () => {
      const manager = new StateManager();
      expect(manager.stateDir).toBeDefined();
      expect(manager.lockTimeout).toBe(5000);
    });

    it('should create instance with custom stateDir and lockTimeout', () => {
      const manager = new StateManager('/custom/path', 3000);
      expect(manager.stateDir).toBe('/custom/path');
      expect(manager.lockTimeout).toBe(3000);
    });
  });

  describe('read', () => {
    it('should return null for non-existent key', async () => {
      const manager = new StateManager();
      const result = await manager.read('nonexistent_key');
      expect(result).toBeNull();
    });

    it('should return parsed JSON for existing key', async () => {
      const manager = new StateManager();
      const testData = { hello: 'world', count: 42 };
      await manager.write('test_read', testData);

      const result = await manager.read('test_read');
      expect(result).toEqual(testData);
    });

    it('should acquire lock before reading', async () => {
      const manager = new StateManager();
      const testData = { test: true };
      await manager.write('lock_test', testData);
      mockLockfile.lock.mockClear();
      await manager.read('lock_test');
      expect(mockLockfile.lock).toHaveBeenCalled();
    });
  });

  describe('write', () => {
    it('should write JSON data to file', async () => {
      const manager = new StateManager();
      const testData = { action: 'move', direction: 'north' };

      await manager.write('test_write', testData);

      const filePath = path.join(stateDir, 'test_write.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(fileContent).toEqual(testData);
    });

    it('should validate schema for state key - reject invalid state', async () => {
      const manager = new StateManager();
      const invalidData = { position: { x: 0, y: 64, z: 0 } };

      await expect(manager.write('state', invalidData)).rejects.toThrow();
    });

    it('should acquire lock before writing', async () => {
      const manager = new StateManager();
      const testData = { custom: true };
      mockLockfile.lock.mockClear();
      await manager.write('custom_key', testData);
      expect(mockLockfile.lock).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete existing file', async () => {
      const manager = new StateManager();
      const testData = { toDelete: true };
      await manager.write('delete_me', testData);

      await manager.delete('delete_me');

      const filePath = path.join(stateDir, 'delete_me.json');
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('should not throw for non-existent key', async () => {
      const manager = new StateManager();
      await expect(manager.delete('never_existed')).resolves.not.toThrow();
    });
  });

describe('concurrent writes', () => {
  it('should serialize concurrent writes to same key', async () => {
    const manager = new StateManager();

    const writePromises = [];
    for (let i = 0; i < 5; i++) {
      writePromises.push(
        manager.write('concurrent_test', { iteration: i })
      );
    }

    await Promise.all(writePromises);

    const result = await manager.read('concurrent_test');
    expect([0, 1, 2, 3, 4]).toContain(result.iteration);
  });

    it('should handle concurrent writes to different keys', async () => {
      const manager = new StateManager();

      const writePromises = [];
      for (let i = 0; i < 5; i++) {
        writePromises.push(
          manager.write(`concurrent_different_${i}`, { index: i })
        );
      }

      await Promise.all(writePromises);

      for (let i = 0; i < 5; i++) {
        const result = await manager.read(`concurrent_different_${i}`);
        expect(result.index).toBe(i);
      }
    });
  });

  describe('lock timeout', () => {
    it('should reject when lock cannot be acquired', async () => {
      mockLockfile.lock.mockImplementationOnce((filePath, opts, cb) => {
        cb(new Error('Lock timeout'));
      });

      const manager = new StateManager(stateDir, 0);
      const testData = { shouldFail: true };

      await expect(manager.write('timeout_test', testData)).rejects.toThrow('Lock timeout');
    });
  });

  describe('schema validation', () => {
    it('should have default schemas for state.json', () => {
      const manager = new StateManager();
      expect(manager.schemas.state).toBeDefined();
    });

    it('should have default schemas for plan.json', () => {
      const manager = new StateManager();
      expect(manager.schemas.plan).toBeDefined();
    });

    it('should have default schemas for commands.json', () => {
      const manager = new StateManager();
      expect(manager.schemas.commands).toBeDefined();
    });

    it('should allow custom schemas to be added', () => {
      const customSchema = { type: 'object', properties: { custom: true } };
      const manager = new StateManager();
      manager.addSchema('custom', customSchema);
      expect(manager.schemas.custom).toEqual(customSchema);
    });

    it('should validate against state schema structure', async () => {
      const manager = new StateManager();
      const validState = {
        position: { x: 0, y: 64, z: 0 },
        health: 20,
        inventory: [],
        entities: [],
        blocks: []
      };

      await expect(manager.write('state', validState)).resolves.not.toThrow();
    });

    it('should reject state with missing required fields', async () => {
      const manager = new StateManager();
      const invalidState = {
        position: { x: 0, y: 64, z: 0 }
      };

      await expect(manager.write('state', invalidState)).rejects.toThrow();
    });
  });
});