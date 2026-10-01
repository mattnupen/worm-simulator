import { describe, it, expect } from 'vitest';
import { placeLeaves, LEAF_KINDS, LEAF_COLORS } from '../../src/surface/leafLitter';

describe('placeLeaves', () => {
  it('makes exactly count leaves inside the square', () => {
    const leaves = placeLeaves(2000, 20, 1);
    expect(leaves).toHaveLength(2000);
    for (const l of leaves) {
      expect(Math.abs(l.x)).toBeLessThanOrEqual(20);
      expect(Math.abs(l.z)).toBeLessThanOrEqual(20);
      expect(l.y).toBeGreaterThanOrEqual(0);
      expect(l.y).toBeLessThan(0.08);
      expect(LEAF_KINDS).toContain(l.kind);
    }
  });
  it('is deterministic for a seed and differs across seeds', () => {
    expect(placeLeaves(10, 5, 3)).toEqual(placeLeaves(10, 5, 3));
    expect(placeLeaves(10, 5, 3)).not.toEqual(placeLeaves(10, 5, 4));
  });
  it('has a color for every kind', () => {
    for (const k of LEAF_KINDS) expect(LEAF_COLORS[k]).toMatch(/^#[0-9a-f]{6}$/);
  });
});
