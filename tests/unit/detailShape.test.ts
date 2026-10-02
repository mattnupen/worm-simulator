import { describe, it, expect } from 'vitest';
import { detailShape } from '../../src/surface/detailShape';
import { leafShape } from '../../src/surface/leafShapes';
import { LEAF_KINDS } from '../../src/surface/leafLitter';

const area = (p: Float32Array, a: number, b: number, c: number) =>
  ((p[b * 2] - p[a * 2]) * (p[c * 2 + 1] - p[a * 2 + 1]) - (p[c * 2] - p[a * 2]) * (p[b * 2 + 1] - p[a * 2 + 1])) / 2;

describe('detailShape', () => {
  for (const kind of LEAF_KINDS) {
    describe(kind, () => {
      const base = leafShape(kind);
      const d = detailShape(kind);

      it('keeps the outline, base and tip', () => {
        expect(d.outline).toBe(base.outline);
        expect(d.base).toBe(base.base);
        expect(d.tip).toBe(base.tip);
        expect(Array.from(d.points.subarray(0, base.outline * 2))).toEqual(Array.from(base.points.subarray(0, base.outline * 2)));
      });

      it('has more vertices than the litter leaf (except oak, already detailed)', () => {
        if (kind === 'oak') expect(d).toBe(base);
        else {
          expect(d.points.length / 2).toBeGreaterThan(base.points.length / 2);
          expect(d.indices.length / 3).toBeGreaterThan(base.indices.length / 3);
          expect(d.indices.length / 3).toBeLessThanOrEqual(2 * base.indices.length / 3 + 2);
        }
      });

      it('uses every vertex, only valid indices, and covers the same area', () => {
        const np = d.points.length / 2;
        const used = new Set<number>();
        for (const i of d.indices) {
          expect(i).toBeLessThan(np);
          used.add(i);
        }
        expect(used.size).toBe(np);
        let a0 = 0;
        for (let t = 0; t < base.indices.length; t += 3) a0 += Math.abs(area(base.points, base.indices[t], base.indices[t + 1], base.indices[t + 2]));
        let a1 = 0;
        for (let t = 0; t < d.indices.length; t += 3) a1 += area(d.points, d.indices[t], d.indices[t + 1], d.indices[t + 2]);
        expect(a1).toBeCloseTo(a0, 6);
      });

      it('vein weights stay in [0, 1]', () => {
        for (const v of d.vein) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      });
    });
  }
});
