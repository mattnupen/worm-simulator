import { describe, it, expect } from 'vitest';
import { REAL_SCALE, REAL_LEAF_CM, UNITS_PER_CM } from '../../src/surface/realScale';
import { LEAF_KINDS } from '../../src/surface/leafLitter';
import { LEAF_SIZE } from '../../src/surface/leafPalette';
import { leafCountScale, scaledLeafCount } from '../../src/surface/leafScale';

describe('real size', () => {
  it('the worm is 3.5 units for 15 cm', () => {
    expect(UNITS_PER_CM * 15).toBeCloseTo(3.5, 12);
  });

  it('keeps V1\'s True numbers (Step 1b spec 4.1)', () => {
    expect(REAL_SCALE).toMatchObject({ mushroom: 3, rock: 4, fern: 7, sedge: 7, log: 9, birch: 9, maple: 11 });
    expect(REAL_SCALE.trees).toEqual({ count: 2, seed: 284, clear: 18 });
    expect(REAL_SCALE.logSite).toEqual({ x: 0, z: 15.5, yaw: 0, length: 4.4, radius: 0.32 });
    expect(REAL_SCALE.rocks).toHaveLength(5);
    expect([REAL_SCALE.clutter, REAL_SCALE.clutterSeed, REAL_SCALE.distantScale, REAL_SCALE.distantCount]).toEqual([24, 5, 9, 14]);
  });

  it('leaves are each species\' real length on average', () => {
    for (const k of LEAF_KINDS) {
      const meanLength = REAL_SCALE.leaf[k] * LEAF_SIZE[k] * 0.9;
      expect(meanLength / UNITS_PER_CM).toBeCloseTo(REAL_LEAF_CM[k], 1);
    }
  });
});

describe('leaf counts follow leaf area', () => {
  it('about a quarter as many leaves as the presets\' base-size counts, each about four times the area', () => {
    const f = leafCountScale();
    expect(f).toBeGreaterThan(0.22);
    expect(f).toBeLessThan(0.3);
    expect(scaledLeafCount(1500)).toBe(Math.round(1500 * f));
    expect(scaledLeafCount(0)).toBe(0);
    expect(scaledLeafCount(1)).toBe(1);
  });
});
