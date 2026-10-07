import { describe, it, expect } from 'vitest';
import { frameTarget, BELOW_SLAB } from '../../src/underground/cutCamera';
import { createSlab, boundaryAt, B_H } from '../../src/underground/slab';
import { SCREENS, frame, project, world, sweep } from './cutWorld';

// Close keeps the whole worm in frame when it fits (Matt: a closer, following view; a worm cut
// off reads badly), and near the slab's bottom no view pins the head to the screen's bottom edge,
// where the Action prompt sits on phones.

const LEGS: Array<[((k: number) => [number, number]) | undefined, number]> = [
  [undefined, 25],
  [(k) => (k < 120 ? [0, -1] : [1, 0]), 30],
  [(k) => (k < 120 ? [0, -1] : [-1, 0]), 30],
  [() => [0, -1], 40],
];

describe('the cut camera frames the whole worm, and keeps the head off the bottom edge', () => {
  for (const [w, h] of SCREENS) {
    it(`Close keeps the whole body in frame whenever it fits, at ${w}x${h} (seed sweep)`, () => {
      let fits = 0;
      let shown = 0;
      for (const [steer, seconds] of LEGS) {
        for (let seed = 1; seed <= 6; seed++) {
          sweep('close', w, h, seed, (p, _q, s, hu, hv, b, cam) => {
            let u0 = hu; let u1 = hu; let v0 = hv; let v1 = hv;
            for (let i = 1; i < b.u.length; i++) {
              u0 = Math.min(u0, b.u[i]); u1 = Math.max(u1, b.u[i]); v0 = Math.min(v0, b.v[i]); v1 = Math.max(v1, b.v[i]);
            }
            // Its extent, with a little room each side, fits the frame shown.
            if (u1 - u0 + 1 > cam.h.value * (w / h) || v1 - v0 + 1 > cam.h.value) return;
            fits++;
            let all = true;
            for (let i = 0; i < b.u.length; i++) {
              const pt = project(p, w / h, ...world(s, b.u[i], b.v[i]));
              if (Math.abs(pt.nx) > 1 || Math.abs(pt.ny) > 1) all = false;
            }
            if (all) shown++;
          }, steer, seconds);
        }
      }
      expect(fits).toBeGreaterThan(30000);
      expect(shown / fits).toBeGreaterThanOrEqual(0.95);
      console.log(`close ${w}x${h}: whole body in frame in ${((100 * shown) / fits).toFixed(1)}% of ${fits} frames where it fits`);
    });

    it(`near the slab's bottom the head stays off the screen's bottom edge, in both views, at ${w}x${h}`, () => {
      for (const view of ['wide', 'close'] as const) {
        let worst = 0;
        let near = 0;
        for (const [steer, seconds] of [LEGS[3], [(k: number) => (k < 1500 ? [0, -1] : [1, 0]), 45]] as const) {
          for (let seed = 1; seed <= 6; seed++) {
            sweep(view, w, h, seed, (p, _q, s, hu, hv) => {
              // The frame never reaches more than BELOW_SLAB under the slab.
              expect(frame.cv - frame.h / 2).toBeGreaterThanOrEqual(s.bottom - BELOW_SLAB - 1e-9);
              if (hv - s.bottom > 0.5) return;
              near++;
              worst = Math.max(worst, Math.abs(project(p, w / h, ...world(s, hu, hv)).ny));
            }, steer as (k: number) => [number, number], seconds);
          }
        }
        expect(near).toBeGreaterThan(1000);
        expect(worst).toBeLessThanOrEqual(0.72);
        console.log(`${view} ${w}x${h}: head at the bottom, worst |ny| ${worst.toFixed(3)}`);
      }
    });
  }

  it('a body too long to fit: Close slides from framing it all to the head with its room ahead, continuously', () => {
    const s = createSlab(0, 0, 0, 1, 2);
    const hv = boundaryAt(s, B_H, 0);
    const n = 16;
    const body = { u: new Float64Array(n), v: new Float64Array(n).fill(hv) };
    for (const aspect of [1366 / 768, 360 / 640]) {
      let last = NaN;
      for (let len = 2; len <= 14; len += 0.01) {
        for (let i = 0; i < n; i++) body.u[i] = -(len * i) / (n - 1);
        const f = frameTarget('close', s, 0, hv, 1, 0, aspect, NaN, NaN, frame, body);
        const half = (f.h * aspect) / 2;
        // The head is always in, with room; its frame moves only a little as the body grows.
        expect(Math.abs(f.cu)).toBeLessThanOrEqual(half - 0.5 + 1e-9);
        if (!Number.isNaN(last)) expect(Math.abs(f.cu - last)).toBeLessThan(0.05);
        last = f.cu;
        // Short enough: all of it in. Far too long: the head keeps its room ahead.
        if (len + 1 <= 2 * half) expect(f.cu - half).toBeLessThanOrEqual(-len + 1e-9);
        if (len > 2 * half + 1) expect(f.cu).toBeCloseTo(0.18 * 2 * half, 6);
      }
    }
  });
});
