import { describe, it, expect } from 'vitest';
import { lodShape, lodRadius, LOD_POINTS } from '../../src/surface/leafLod';
import { leafShape } from '../../src/surface/leafShapes';
import { LEAF_KINDS } from '../../src/surface/leafLitter';

const area = (p: Float32Array, idx: ArrayLike<number>) => {
  let a = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const [i, j, k] = [idx[t], idx[t + 1], idx[t + 2]];
    a += ((p[j * 2] - p[i * 2]) * (p[k * 2 + 1] - p[i * 2 + 1]) - (p[k * 2] - p[i * 2]) * (p[j * 2 + 1] - p[i * 2 + 1])) / 2;
  }
  return a;
};

describe('lodShape', () => {
  for (const kind of LEAF_KINDS) {
    it(`${kind}: ${LOD_POINTS} triangles, keeps base and tip, faces up, same rough size`, () => {
      const full = leafShape(kind);
      const lod = lodShape(kind);
      expect(lod.indices.length / 3).toBe(LOD_POINTS);
      expect(lod.points.length / 2).toBe(LOD_POINTS + 1);
      expect(lod.points[lod.base * 2 + 1]).toBe(full.points[full.base * 2 + 1]);
      expect(lod.tip).toBeGreaterThanOrEqual(0);
      expect(lod.points[lod.tip * 2 + 1]).toBe(full.points[full.tip * 2 + 1]);
      for (let t = 0; t < lod.indices.length; t += 3) {
        expect(area(lod.points, lod.indices.subarray(t, t + 3))).toBeGreaterThan(0);
      }
      const a = area(lod.points, lod.indices);
      const b = Math.abs(area(full.points, full.indices));
      expect(a).toBeGreaterThan(b * 0.45);
      expect(a).toBeLessThan(b * 1.3);
    });
  }
  it('lodRadius is the farthest written vertex from the leaf origin (the drape anchor)', () => {
    for (const kind of LEAF_KINDS) {
      const lod = lodShape(kind);
      let far = 0;
      for (let i = 0; i < lod.points.length / 2; i++) far = Math.max(far, Math.hypot(lod.points[i * 2], lod.points[i * 2 + 1]));
      expect(lodRadius(kind)).toBe(far);
      expect(lodRadius(kind)).toBeGreaterThan(0.3);
      // The 6 picks are outline points of the full leaf, so the far shape never reaches past it.
      const full = leafShape(kind);
      let fullFar = 0;
      for (let i = 0; i < full.points.length / 2; i++) fullFar = Math.max(fullFar, Math.hypot(full.points[i * 2], full.points[i * 2 + 1]));
      expect(lodRadius(kind)).toBeLessThanOrEqual(fullFar + 1e-9);
    }
  });
  it('keeps a maple\'s lobes: its six main-vein outline points (base, basal and lateral lobes, tip)', () => {
    const full = leafShape('maple');
    const lod = lodShape('maple');
    const veined: number[] = [];
    for (let i = 0; i < full.outline; i++) if (full.vein[i] >= 1) veined.push(i);
    expect(veined).toHaveLength(LOD_POINTS);
    for (let m = 0; m < LOD_POINTS; m++) {
      const j = veined[m];
      expect([lod.points[m * 2], lod.points[m * 2 + 1]]).toEqual([full.points[j * 2], full.points[j * 2 + 1]]);
      expect(lod.vein[m]).toBe(1);
    }
  });
  it('is cached', () => {
    expect(lodShape('maple')).toBe(lodShape('maple'));
  });
});
