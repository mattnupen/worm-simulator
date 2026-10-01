import { describe, it, expect } from 'vitest';
import { leafShape, type LeafShape } from '../../src/surface/leafShapes';
import { LEAF_KINDS } from '../../src/surface/leafLitter';

const px = (s: LeafShape, i: number) => s.points[i * 2];
const py = (s: LeafShape, i: number) => s.points[i * 2 + 1];
const pointCount = (s: LeafShape) => s.points.length / 2;

/** Shoelace area of the outline (positive when counter-clockwise). */
function outlineArea(s: LeafShape): number {
  let a = 0;
  for (let i = 0; i < s.outline; i++) {
    const j = (i + 1) % s.outline;
    a += px(s, i) * py(s, j) - px(s, j) * py(s, i);
  }
  return a / 2;
}

function triArea(s: LeafShape, a: number, b: number, c: number): number {
  return ((px(s, b) - px(s, a)) * (py(s, c) - py(s, a)) - (px(s, c) - px(s, a)) * (py(s, b) - py(s, a))) / 2;
}

function segmentsCross(
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number,
): boolean {
  const o = (px1: number, py1: number, px2: number, py2: number, px3: number, py3: number) =>
    Math.sign((px2 - px1) * (py3 - py1) - (py2 - py1) * (px3 - px1));
  return o(ax, ay, bx, by, cx, cy) * o(ax, ay, bx, by, dx, dy) < 0
    && o(cx, cy, dx, dy, ax, ay) * o(cx, cy, dx, dy, bx, by) < 0;
}

/** Prominent local maxima of a cyclic sequence (topographic prominence above `minProm`). */
function prominentMaxima(v: number[], minProm: number, cyclic = true): number[] {
  const n = v.length;
  const out: number[] = [];
  const at = (i: number) => (cyclic ? v[((i % n) + n) % n] : (i < 0 || i >= n ? -Infinity : v[i]));
  for (let i = 0; i < n; i++) {
    if (!(v[i] > at(i - 1) && v[i] >= at(i + 1))) continue;
    // Walk each way until higher ground; the higher of the two lowest dips sets the prominence.
    // (A non-cyclic end point has no dip on its open side, so it never counts.)
    let minL = v[i];
    let minR = v[i];
    let k = 1;
    for (; k < n; k++) {
      const j = i - k;
      if (!cyclic && j < 0) break;
      if (at(j) > v[i]) break;
      minL = Math.min(minL, at(j));
    }
    for (k = 1; k < n; k++) {
      const j = i + k;
      if (!cyclic && j >= n) break;
      if (at(j) > v[i]) break;
      minR = Math.min(minR, at(j));
    }
    if (v[i] - Math.max(minL, minR) > minProm) out.push(i);
  }
  return out;
}

/** Interior angle (degrees) of the outline at point i. */
function cornerAngle(s: LeafShape, i: number): number {
  const p = (i - 1 + s.outline) % s.outline;
  const q = (i + 1) % s.outline;
  const ax = px(s, p) - px(s, i);
  const ay = py(s, p) - py(s, i);
  const bx = px(s, q) - px(s, i);
  const by = py(s, q) - py(s, i);
  return (Math.acos((ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by))) * 180) / Math.PI;
}

function bbox(s: LeafShape) {
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  for (let i = 0; i < s.outline; i++) {
    x0 = Math.min(x0, px(s, i)); x1 = Math.max(x1, px(s, i));
    y0 = Math.min(y0, py(s, i)); y1 = Math.max(y1, py(s, i));
  }
  return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0 };
}

describe('leafShape: every kind', () => {
  for (const kind of LEAF_KINDS) {
    describe(kind, () => {
      const s = leafShape(kind);

      it('has finite points and per-point vein weights', () => {
        expect(s.outline).toBeGreaterThanOrEqual(10);
        expect(pointCount(s)).toBeGreaterThanOrEqual(s.outline);
        for (const v of s.points) expect(Number.isFinite(v)).toBe(true);
        expect(s.vein).toHaveLength(pointCount(s));
        for (const v of s.vein) expect(v >= 0 && v <= 1).toBe(true);
      });

      it('is a closed, simple, counter-clockwise outline', () => {
        expect(outlineArea(s)).toBeGreaterThan(0.05);
        // Closed implicitly: the last point is not a repeat of the first.
        expect(Math.hypot(px(s, 0) - px(s, s.outline - 1), py(s, 0) - py(s, s.outline - 1))).toBeGreaterThan(1e-4);
        for (let i = 0; i < s.outline; i++) {
          const i2 = (i + 1) % s.outline;
          for (let j = i + 2; j < s.outline; j++) {
            const j2 = (j + 1) % s.outline;
            if (j2 === i) continue;
            expect(segmentsCross(
              px(s, i), py(s, i), px(s, i2), py(s, i2), px(s, j), py(s, j), px(s, j2), py(s, j2),
            )).toBe(false);
          }
        }
      });

      it('is roughly unit size and centred (the midrib on x = 0)', () => {
        const b = bbox(s);
        expect(Math.max(b.w, b.h)).toBeCloseTo(1, 5);
        expect(Math.abs((b.x0 + b.x1) / 2)).toBeLessThan(0.06);
        expect((b.y0 + b.y1) / 2).toBeCloseTo(0, 5);
      });

      it('points its tip up (+y) and its petiole base down, both on the midrib (x = 0)', () => {
        expect(px(s, s.tip)).toBeCloseTo(0, 6);
        expect(px(s, s.base)).toBeCloseTo(0, 6);
        expect(py(s, s.tip)).toBeCloseTo(bbox(s).y1, 6);
        expect(py(s, s.base)).toBeLessThan(0);
        expect(s.vein[s.tip]).toBe(1);
        expect(s.vein[s.base]).toBe(1);
      });

      it('triangulates validly: in-range indices, all CCW, exactly tiling the outline', () => {
        expect(s.indices.length % 3).toBe(0);
        const n = pointCount(s);
        let sum = 0;
        for (let t = 0; t < s.indices.length; t += 3) {
          const [a, b, c] = [s.indices[t], s.indices[t + 1], s.indices[t + 2]];
          for (const k of [a, b, c]) {
            expect(Number.isInteger(k)).toBe(true);
            expect(k).toBeGreaterThanOrEqual(0);
            expect(k).toBeLessThan(n);
          }
          const area = triArea(s, a, b, c);
          expect(area).toBeGreaterThan(0);
          sum += area;
        }
        expect(sum).toBeCloseTo(outlineArea(s), 6);
        // Every point is used.
        const used = new Set(s.indices);
        expect(used.size).toBe(n);
      });

      it('never puts a triangle across the midrib (so a fold along x = 0 stays clean)', () => {
        for (let t = 0; t < s.indices.length; t += 3) {
          const xs = [0, 1, 2].map((k) => px(s, s.indices[t + k]));
          expect(Math.min(...xs) < -1e-9 && Math.max(...xs) > 1e-9).toBe(false);
        }
      });

      it('stays light on vertices', () => {
        expect(pointCount(s)).toBeLessThanOrEqual(34);
      });
    });
  }
});

/** Radial distance from the vein centre (where the palmate veins meet) along the outline. */
function radii(s: LeafShape, cx: number, cy: number): number[] {
  return Array.from({ length: s.outline }, (_, i) => Math.hypot(px(s, i) - cx, py(s, i) - cy));
}

describe('leafShape: species silhouettes', () => {
  it('sugar maple is palmate with 5 pointed lobes', () => {
    const s = leafShape('maple');
    const c = s.outline; // the fan centre (where the veins radiate) is the first interior point
    const r = radii(s, px(s, c), py(s, c));
    const tips = prominentMaxima(r, 0.1 * Math.max(...r));
    expect(tips).toHaveLength(5);
    for (const i of tips) {
      expect(s.vein[i]).toBe(1);
      expect(cornerAngle(s, i)).toBeLessThan(95);
    }
    const b = bbox(s);
    expect(b.w / b.h).toBeGreaterThan(0.95);
    expect(b.w / b.h).toBeLessThan(1.3);
  });

  it('oak has 7 rounded lobes: 3 down each side plus the terminal lobe', () => {
    const s = leafShape('oak');
    // Right side runs base -> tip, left side tip -> base: walk each chain's half-width.
    const right = [];
    for (let i = s.base; i !== s.tip; i = (i + 1) % s.outline) right.push(px(s, i));
    const left = [];
    for (let i = s.tip + 1; ; i = (i + 1) % s.outline) {
      left.push(-px(s, i));
      if (i === s.base) break;
    }
    const rLobes = prominentMaxima(right, 0.04, false);
    const lLobes = prominentMaxima(left, 0.04, false);
    expect(rLobes).toHaveLength(3);
    expect(lLobes).toHaveLength(3);
    // Rounded: obtuse corners at the lobe ends.
    for (const k of rLobes) expect(cornerAngle(s, (s.base + k) % s.outline)).toBeGreaterThan(100);
    const b = bbox(s);
    expect(b.h).toBeCloseTo(1, 5);
    expect(b.w / b.h).toBeLessThan(0.75);
  });

  it('aspen is round-ovate with a short point', () => {
    const s = leafShape('aspen');
    const b = bbox(s);
    expect(b.w / b.h).toBeGreaterThan(0.8);
    expect(b.w / b.h).toBeLessThan(1.1);
    expect(cornerAngle(s, s.tip)).toBeLessThan(140);
  });

  it('basswood is heart-shaped with an uneven base and a serrate margin', () => {
    const s = leafShape('basswood');
    const b = bbox(s);
    // Cordate: the basal lobes reach below the petiole sinus.
    expect(py(s, s.base)).toBeGreaterThan(b.y0 + 0.04);
    // Oblique: the two basal lobes do not reach equally low.
    let lowR = Infinity;
    let lowL = Infinity;
    for (let i = 0; i < s.outline; i++) {
      if (px(s, i) > 0) lowR = Math.min(lowR, py(s, i));
      if (px(s, i) < 0) lowL = Math.min(lowL, py(s, i));
    }
    expect(Math.abs(lowR - lowL)).toBeGreaterThan(0.02);
    // Serrate: many small teeth along the radius.
    const c = s.outline;
    const r = radii(s, px(s, c), py(s, c));
    expect(prominentMaxima(r, 0.008).length).toBeGreaterThanOrEqual(8);
  });

  it('ash is a narrow, lanceolate leaflet', () => {
    const b = bbox(leafShape('ash'));
    expect(b.w / b.h).toBeLessThan(0.42);
    expect(b.h).toBeCloseTo(1, 5);
  });

  it('caches one shape per kind', () => {
    expect(leafShape('maple')).toBe(leafShape('maple'));
  });
});
