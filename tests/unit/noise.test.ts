import { describe, it, expect } from 'vitest';
import { valueNoise2, fbm2 } from '../../src/core/noise';

describe('valueNoise2', () => {
  it('is deterministic and within [0, 1]', () => {
    for (let i = 0; i < 400; i++) {
      const x = i * 0.37 - 50;
      const y = i * 0.91 - 120;
      const v = valueNoise2(x, y, 3);
      expect(v).toBe(valueNoise2(x, y, 3));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('depends on the seed', () => {
    let diff = 0;
    for (let i = 0; i < 50; i++) diff += Math.abs(valueNoise2(i * 0.7, i * 0.3, 1) - valueNoise2(i * 0.7, i * 0.3, 2));
    expect(diff).toBeGreaterThan(1);
  });

  it('is continuous', () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 0.53 - 40;
      const y = i * 0.29 - 20;
      expect(Math.abs(valueNoise2(x + 1e-4, y, 5) - valueNoise2(x, y, 5))).toBeLessThan(1e-3);
    }
  });

  it('tiles when given a period', () => {
    for (let i = 0; i < 50; i++) {
      const x = i * 0.61;
      const y = i * 0.17;
      expect(valueNoise2(x + 8, y, 9, 8)).toBeCloseTo(valueNoise2(x, y, 9, 8), 9);
      expect(valueNoise2(x, y + 8, 9, 8)).toBeCloseTo(valueNoise2(x, y, 9, 8), 9);
    }
  });
});

describe('fbm2', () => {
  it('stays within [0, 1] and tiles with a period', () => {
    for (let i = 0; i < 100; i++) {
      const x = i * 0.41;
      const y = i * 0.23;
      const v = fbm2(x, y, 4, 7, 4);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(fbm2(x + 4, y + 4, 4, 7, 4)).toBeCloseTo(v, 9);
    }
  });
});

describe('valueNoise2 with separate periods', () => {
  it('tiles each axis at its own period', () => {
    for (let i = 0; i < 50; i++) {
      const x = i * 0.61;
      const y = i * 0.17;
      expect(valueNoise2(x + 4, y, 9, 4, 16)).toBeCloseTo(valueNoise2(x, y, 9, 4, 16), 9);
      expect(valueNoise2(x, y + 16, 9, 4, 16)).toBeCloseTo(valueNoise2(x, y, 9, 4, 16), 9);
    }
  });
});
