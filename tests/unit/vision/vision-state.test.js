/**
 * Unit tests for VisionState
 * @module tests/unit/vision/vision-state
 */

const VisionState = require('../../../src/vision/vision-state');

describe('VisionState', () => {
  let visionState;

  beforeEach(() => {
    visionState = new VisionState();
  });

  describe('constructor', () => {
    test('should initialize with null analysis', () => {
      expect(visionState.getLatestAnalysis()).toBeNull();
    });
  });

  describe('getLatestAnalysis', () => {
    test('should return null when no analysis has been set', () => {
      expect(visionState.getLatestAnalysis()).toBeNull();
    });

    test('should return the analysis when setAnalysis was called', () => {
      const analysis = {
        timestamp: Date.now(),
        mode: 'idle',
        position: { x: 0, y: 64, z: 0 },
        observations: ['oak tree ahead'],
        threats: [],
        entities: [],
        blocks: [],
        confidence: 0.9,
        state: 'idle'
      };
      visionState.setAnalysis(analysis);
      expect(visionState.getLatestAnalysis()).toEqual(analysis);
    });

    test('should return only the most recent analysis', () => {
      const analysis1 = { timestamp: 1000, mode: 'idle', observations: ['first'] };
      const analysis2 = { timestamp: 2000, mode: 'danger', observations: ['second'] };
      visionState.setAnalysis(analysis1);
      visionState.setAnalysis(analysis2);
      expect(visionState.getLatestAnalysis()).toEqual(analysis2);
    });
  });

  describe('setAnalysis', () => {
    test('should store full analysis data', () => {
      const analysis = {
        timestamp: 1234567890,
        mode: 'active',
        position: { x: 10, y: 65, z: -20 },
        observations: ['cave entrance', 'water pool'],
        threats: ['zombie 5 blocks north'],
        entities: [{ type: 'zombie', distance: 5, direction: 'north' }],
        blocks: [{ type: 'diamond_ore', position: { x: 15, y: 40, z: -18 }, distance: 12 }],
        confidence: 0.85,
        state: 'active'
      };
      visionState.setAnalysis(analysis);
      expect(visionState.getLatestAnalysis()).toEqual(analysis);
    });

    test('should overwrite previous analysis', () => {
      const first = { timestamp: 1000, observations: ['first analysis'] };
      const second = { timestamp: 2000, observations: 'second analysis' };
      visionState.setAnalysis(first);
      visionState.setAnalysis(second);
      expect(visionState.getLatestAnalysis().timestamp).toBe(2000);
      expect(visionState.getLatestAnalysis().observations).toBe('second analysis');
    });

    test('should handle empty arrays', () => {
      const analysis = {
        timestamp: Date.now(),
        mode: 'idle',
        position: { x: 0, y: 64, z: 0 },
        observations: [],
        threats: [],
        entities: [],
        blocks: [],
        confidence: 0,
        state: 'idle'
      };
      visionState.setAnalysis(analysis);
      expect(visionState.getLatestAnalysis()).toEqual(analysis);
    });

    test('should handle all mode types', () => {
      const modes = ['danger', 'active', 'idle'];
      modes.forEach(mode => {
        const analysis = { timestamp: Date.now(), mode, observations: [] };
        visionState.setAnalysis(analysis);
        expect(visionState.getLatestAnalysis().mode).toBe(mode);
      });
    });
  });

  describe('clear', () => {
    test('should clear stored analysis', () => {
      visionState.setAnalysis({ timestamp: Date.now(), observations: ['test'] });
      visionState.clear();
      expect(visionState.getLatestAnalysis()).toBeNull();
    });

    test('should handle clear when no analysis stored', () => {
      expect(() => visionState.clear()).not.toThrow();
      expect(visionState.getLatestAnalysis()).toBeNull();
    });
  });

  describe('thread-safety simulation (no locks)', () => {
    test('should handle rapid setAnalysis calls', () => {
      const iterations = 100;
      for (let i = 0; i < iterations; i++) {
        visionState.setAnalysis({ timestamp: i, index: i });
      }
      // Should have the last one stored
      expect(visionState.getLatestAnalysis().index).toBe(iterations - 1);
    });

    test('should handle interleaved reads and writes', () => {
      let lastIndex = -1;
      const iterations = 50;

      for (let i = 0; i < iterations; i++) {
        visionState.setAnalysis({ timestamp: i, index: i });
        const current = visionState.getLatestAnalysis();
        if (current) {
          lastIndex = Math.max(lastIndex, current.index);
        }
      }

      expect(lastIndex).toBe(iterations - 1);
    });
  });
});