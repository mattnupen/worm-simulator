import { describe, it, expect } from 'vitest';
import { disturbBound, disturbVertex, type MapSampler } from '../../src/render/leafGlsl';
import { DIST_SPAN } from '../../src/surface/disturbance';
import { mulberry32 } from '../../src/core/random';

/**
 * disturbBound is what the pocket lists its leaves by (pocketLeaves.ts): a leaf it leaves out must
 * never be moved into view, so the bound must hold for every vertex disturb() moves.
 */
describe('disturbBound bounds how far disturb() moves a leaf', () => {
  it('no vertex slides or rises past it, over random maps, leaves and vertices', () => {
    const rng = mulberry32(11);
    // A random map, near the body and path often enough that leaves slide and drape.
    let seed = 0;
    const field = (u: number, v: number, k: number) => {
      const h = Math.sin(u * 127.1 + v * 311.7 + k * 74.7 + seed) * 43758.5453;
      return 0.55 + 0.45 * (h - Math.floor(h));
    };
    const sample: MapSampler = (u, v, out) => {
      out[0] = field(u, v, 0);
      out[1] = 0;
      out[2] = field(u, v, 1);
      out[3] = field(u, v, 2);
    };
    const s0 = [0, 0, 0, 0];
    const bound = [0, 0];
    const p = [0, 0, 0];
    const anchor = [0, 0, 0, 0];
    const out = [0, 0, 0];
    let slid = 0;
    let rose = 0;
    let tightSlide = 0;
    let tightRise = 0;
    for (let c = 0; c < 4000; c++) {
      seed = rng() * 1000;
      const r = 0.02 + rng() * 0.5;
      anchor[0] = (rng() - 0.5) * 30;
      anchor[1] = (rng() - 0.5) * 30;
      anchor[2] = r;
      anchor[3] = rng() * 0.1;
      // The map centred on the leaf, so it reacts in full.
      const ox = anchor[0] - DIST_SPAN / 2;
      const oz = anchor[1] - DIST_SPAN / 2;
      sample(0.5, 0.5, s0);
      disturbBound(r, s0[0], s0[2], 1e-9, bound);
      for (let k = 0; k < 8; k++) {
        const a = rng() * Math.PI * 2;
        const d = rng() * r;
        p[0] = anchor[0] + Math.cos(a) * d;
        p[1] = rng();
        p[2] = anchor[1] + Math.sin(a) * d;
        disturbVertex(sample, ox, oz, true, p, anchor, 0, out);
        const s = Math.hypot(out[0] - p[0], out[2] - p[2]);
        const y = out[1] - p[1];
        expect(s).toBeLessThanOrEqual(bound[0] + 1e-9);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(bound[1] + 1e-9);
        if (s > 0) slid++;
        if (y > 0) rose++;
        if (s > 0.9 * bound[0] && bound[0] > 0) tightSlide++;
        if (y > 0.5 * bound[1] && bound[1] > 0) tightRise++;
      }
    }
    // Not vacuous: many vertices move, and some come close to the bound.
    expect(slid).toBeGreaterThan(1000);
    expect(rose).toBeGreaterThan(1000);
    expect(tightSlide).toBeGreaterThan(10);
    expect(tightRise).toBeGreaterThan(10);
  });
});
