import { describe, it, expect } from 'vitest';
import { pointToBox, pointToSegment, segmentToBox } from '../../src/core/geom2d';
import { mulberry32 } from '../../src/core/random';

describe('geom2d', () => {
  it('point to box and to segment', () => {
    expect(pointToBox(0.5, 0.5, 0, 1, 0, 1)).toBe(0);
    expect(pointToBox(4, 5, 0, 1, 0, 1)).toBeCloseTo(5, 9);
    expect(pointToSegment(0, 1, -1, 0, 1, 0)).toBeCloseTo(1, 9);
    expect(pointToSegment(3, 4, 0, 0, 0, 0)).toBeCloseTo(5, 9);
    expect(pointToSegment(2, 1, -1, 0, 1, 0)).toBeCloseTo(Math.SQRT2, 9);
  });

  it('segment to box matches a dense sampling of the segment', () => {
    const rng = mulberry32(9);
    for (let n = 0; n < 500; n++) {
      const r = () => rng() * 4 - 2;
      const [ax, ay, bx, by] = [r(), r(), r(), r()];
      const x0 = r(); const y0 = r();
      const x1 = x0 + rng(); const y1 = y0 + rng();
      let best = Infinity;
      for (let k = 0; k <= 2000; k++) {
        const t = k / 2000;
        best = Math.min(best, pointToBox(ax + (bx - ax) * t, ay + (by - ay) * t, x0, x1, y0, y1));
      }
      const d = segmentToBox(ax, ay, bx, by, x0, x1, y0, y1);
      expect(d).toBeLessThanOrEqual(best + 1e-9);
      expect(d).toBeGreaterThan(best - 0.005);
    }
  });
});
