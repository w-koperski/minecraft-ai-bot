/**
 * Schema Validation Tests
 * Tests for JSON schema validators in src/utils/schemas.js
 */

const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};
jest.mock('../../src/utils/logger', () => mockLogger);

const {
  validateState,
  validateCommands,
  validatePlan,
  validateActionError,
  validateProgress
} = require('../../src/utils/schemas');

describe('schemas', () => {
  describe('validateState', () => {
    it('should accept valid state object', () => {
      const validState = {
        position: { x: 0, y: 64, z: 0 },
        health: 20,
        inventory: [],
        entities: {},
        blocks: {}
      };
      const result = validateState(validState);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject state missing required position field', () => {
      const invalidState = {
        health: 20,
        inventory: [],
        entities: {},
        blocks: {}
      };
      const result = validateState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: position');
    });

    it('should reject state missing required health field', () => {
      const invalidState = {
        position: { x: 0, y: 64, z: 0 },
        inventory: [],
        entities: {},
        blocks: {}
      };
      const result = validateState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: health');
    });

    it('should reject state missing required inventory field', () => {
      const invalidState = {
        position: { x: 0, y: 64, z: 0 },
        health: 20,
        entities: {},
        blocks: {}
      };
      const result = validateState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: inventory');
    });

    it('should reject state with invalid position type', () => {
      const invalidState = {
        position: 'not an object',
        health: 20,
        inventory: [],
        entities: {},
        blocks: {}
      };
      const result = validateState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid value for field: position');
    });

    it('should reject state with invalid health type', () => {
      const invalidState = {
        position: { x: 0, y: 64, z: 0 },
        health: 'not a number',
        inventory: [],
        entities: {},
        blocks: {}
      };
      const result = validateState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid value for field: health');
    });

    it('should reject state with negative health', () => {
      const invalidState = {
        position: { x: 0, y: 64, z: 0 },
        health: -5,
        inventory: [],
        entities: {},
        blocks: {}
      };
      const result = validateState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid value for field: health');
    });

    it('should reject state with invalid inventory type', () => {
      const invalidState = {
        position: { x: 0, y: 64, z: 0 },
        health: 20,
        inventory: 'not an array',
        entities: {},
        blocks: {}
      };
      const result = validateState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid value for field: inventory');
    });

    it('should reject null state', () => {
      const result = validateState(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Expected object, got object');
    });

    it('should reject undefined state', () => {
      const result = validateState(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Expected object, got undefined');
    });

    it('should accept state with optional fields', () => {
      const validState = {
        position: { x: 0, y: 64, z: 0 },
        health: 20,
        inventory: [],
        entities: {},
        blocks: {},
        chat: [],
        events: [],
        timestamp: Date.now()
      };
      const result = validateState(validState);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('validateCommands', () => {
    it('should accept valid commands object with string goal', () => {
      const validCommands = {
        goal: 'collect 64 oak logs'
      };
      const result = validateCommands(validCommands);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should accept valid commands object with null goal', () => {
      const validCommands = {
        goal: null
      };
      const result = validateCommands(validCommands);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should accept commands with optional priority', () => {
      const validCommands = {
        goal: 'collect wood',
        priority: 5
      };
      const result = validateCommands(validCommands);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should accept commands with optional createdAt', () => {
      const validCommands = {
        goal: 'collect wood',
        createdAt: Date.now()
      };
      const result = validateCommands(validCommands);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject commands missing required goal field', () => {
      const invalidCommands = {
        priority: 5
      };
      const result = validateCommands(invalidCommands);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: goal');
    });

    it('should reject commands with invalid goal type', () => {
      const invalidCommands = {
        goal: 123
      };
      const result = validateCommands(invalidCommands);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid value for field: goal');
    });

    it('should reject null commands', () => {
      const result = validateCommands(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Expected object, got object');
    });
  });

  describe('validatePlan', () => {
    it('should accept empty plan array', () => {
      const result = validatePlan([]);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should accept valid plan with single action', () => {
      const validPlan = [
        {
          action: 'move',
          target: { x: 10, y: 64, z: 10 }
        }
      ];
      const result = validatePlan(validPlan);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should accept valid plan with multiple actions', () => {
      const validPlan = [
        { action: 'move', target: { x: 10, y: 64, z: 10 } },
        { action: 'dig', target: { x: 10, y: 64, z: 10 } },
        { action: 'collect', target: { item: 'oak_log' } }
      ];
      const result = validatePlan(validPlan);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should accept plan with optional fields', () => {
      const validPlan = [
        {
          action: 'move',
          target: { x: 10, y: 64, z: 10 },
          expectedOutcome: { position: { x: 10, y: 64, z: 10 } },
          timeout: 5000
        }
      ];
      const result = validatePlan(validPlan);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject non-array plan', () => {
      const result = validatePlan({ action: 'move' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Plan must be an array');
    });

    it('should reject plan with non-object item', () => {
      const invalidPlan = ['move', 'dig'];
      const result = validatePlan(invalidPlan);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Plan[0]: must be an object');
    });

    it('should reject plan item missing action field', () => {
      const invalidPlan = [
        { target: { x: 10, y: 64, z: 10 } }
      ];
      const result = validatePlan(invalidPlan);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Plan[0]: missing or invalid action field');
    });

    it('should reject plan item with invalid action type', () => {
      const invalidPlan = [
        { action: 123 }
      ];
      const result = validatePlan(invalidPlan);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Plan[0]: missing or invalid action field');
    });

    it('should reject plan item with invalid target type', () => {
      const invalidPlan = [
        { action: 'move', target: 'not an object' }
      ];
      const result = validatePlan(invalidPlan);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Plan[0]: target must be an object if provided');
    });

    it('should reject plan item with invalid timeout type', () => {
      const invalidPlan = [
        { action: 'move', timeout: 'not a number' }
      ];
      const result = validatePlan(invalidPlan);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Plan[0]: timeout must be a number if provided');
    });
  });

  describe('validateActionError', () => {
    it('should accept valid action error', () => {
      const validError = {
        action: { action: 'move', target: { x: 10, y: 64, z: 10 } },
        expected: { position: { x: 10, y: 64, z: 10 } },
        actual: { position: { x: 5, y: 64, z: 5 } },
        timestamp: Date.now()
      };
      const result = validateActionError(validError);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should accept action error with string action', () => {
      const validError = {
        action: 'move',
        expected: { position: { x: 10, y: 64, z: 10 } },
        actual: { position: { x: 5, y: 64, z: 5 } },
        timestamp: Date.now()
      };
      const result = validateActionError(validError);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should accept action error with optional severity', () => {
      const validError = {
        action: 'move',
        expected: { position: { x: 10, y: 64, z: 10 } },
        actual: { position: { x: 5, y: 64, z: 5 } },
        timestamp: Date.now(),
        severity: 'high'
      };
      const result = validateActionError(validError);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject action error missing required action field', () => {
      const invalidError = {
        expected: { position: { x: 10, y: 64, z: 10 } },
        actual: { position: { x: 5, y: 64, z: 5 } },
        timestamp: Date.now()
      };
      const result = validateActionError(invalidError);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: action');
    });

    it('should reject action error missing required expected field', () => {
      const invalidError = {
        action: 'move',
        actual: { position: { x: 5, y: 64, z: 5 } },
        timestamp: Date.now()
      };
      const result = validateActionError(invalidError);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: expected');
    });

    it('should reject action error missing required actual field', () => {
      const invalidError = {
        action: 'move',
        expected: { position: { x: 10, y: 64, z: 10 } },
        timestamp: Date.now()
      };
      const result = validateActionError(invalidError);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: actual');
    });

    it('should reject action error missing required timestamp field', () => {
      const invalidError = {
        action: 'move',
        expected: { position: { x: 10, y: 64, z: 10 } },
        actual: { position: { x: 5, y: 64, z: 5 } }
      };
      const result = validateActionError(invalidError);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: timestamp');
    });

    it('should reject action error with invalid severity value', () => {
      const invalidError = {
        action: 'move',
        expected: { position: { x: 10, y: 64, z: 10 } },
        actual: { position: { x: 5, y: 64, z: 5 } },
        timestamp: Date.now(),
        severity: 'invalid'
      };
      const result = validateActionError(invalidError);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid value for field: severity');
    });
  });

  describe('validateProgress', () => {
    it('should accept valid progress object', () => {
      const validProgress = {
        goal: 'collect 64 oak logs',
        completedSteps: ['move to tree', 'dig log'],
        totalSteps: 5,
        status: 'in_progress'
      };
      const result = validateProgress(validProgress);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should accept progress with null goal', () => {
      const validProgress = {
        goal: null,
        completedSteps: [],
        totalSteps: 0,
        status: 'pending'
      };
      const result = validateProgress(validProgress);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should accept progress with optional timestamps', () => {
      const validProgress = {
        goal: 'collect wood',
        completedSteps: [],
        totalSteps: 5,
        status: 'in_progress',
        startedAt: Date.now(),
        updatedAt: Date.now()
      };
      const result = validateProgress(validProgress);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject progress missing required goal field', () => {
      const invalidProgress = {
        completedSteps: [],
        totalSteps: 5,
        status: 'pending'
      };
      const result = validateProgress(invalidProgress);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: goal');
    });

    it('should reject progress missing required completedSteps field', () => {
      const invalidProgress = {
        goal: 'collect wood',
        totalSteps: 5,
        status: 'pending'
      };
      const result = validateProgress(invalidProgress);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: completedSteps');
    });

    it('should reject progress missing required totalSteps field', () => {
      const invalidProgress = {
        goal: 'collect wood',
        completedSteps: [],
        status: 'pending'
      };
      const result = validateProgress(invalidProgress);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: totalSteps');
    });

    it('should reject progress missing required status field', () => {
      const invalidProgress = {
        goal: 'collect wood',
        completedSteps: [],
        totalSteps: 5
      };
      const result = validateProgress(invalidProgress);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: status');
    });

    it('should reject progress with invalid status value', () => {
      const invalidProgress = {
        goal: 'collect wood',
        completedSteps: [],
        totalSteps: 5,
        status: 'invalid_status'
      };
      const result = validateProgress(invalidProgress);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid value for field: status');
    });

    it('should accept all valid status values', () => {
      const statuses = ['pending', 'in_progress', 'completed', 'failed'];
      statuses.forEach(status => {
        const validProgress = {
          goal: 'test',
          completedSteps: [],
          totalSteps: 1,
          status: status
        };
        const result = validateProgress(validProgress);
        expect(result.valid).toBe(true);
      });
    });
  });
});
