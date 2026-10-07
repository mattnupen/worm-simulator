import { describe, it, expect } from 'vitest';
import { PAINTERS, TEXELS_PER_U, LITTER_TILE_U, OLD_TILE_U, SOIL_TILE_U } from '../../src/underground/soilTiles';
import type { Canvas } from '../../src/underground/soilPaint';

const tiles = Object.fromEntries(Object.entries(PAINTERS).map(([k, paint]) => [k, paint()])) as Record<keyof typeof PAINTERS, Canvas>;
const at = (c: Canvas, x: number, y: number, ch: number): number =>
  c.px[((((y % c.h) + c.h) % c.h) * c.w + (((x % c.w) + c.w) % c.w)) * 4 + ch];
const lum = (c: Canvas, x: number, y: number): number => (at(c, x, y, 0) + at(c, x, y, 1) + at(c, x, y, 2)) / 3;

/** Mean difference between neighbouring columns (or rows) at `i` and `i + 1`, over every channel. */
function step(c: Canvas, i: number, across: boolean): number {
  let sum = 0;
  const n = across ? c.h : c.w;
  for (let j = 0; j < n; j++) {
    for (let ch = 0; ch < 4; ch++) {
      sum += across ? Math.abs(at(c, i + 1, j, ch) - at(c, i, j, ch)) : Math.abs(at(c, j, i + 1, ch) - at(c, j, i, ch));
    }
  }
  return sum / (n * 4);
}

describe('the layers\' baked pattern tiles (spec 5.3)', () => {
  it('are their tiles\' sizes at 128 texels a unit', () => {
    expect([tiles.litter.w, tiles.litter.h]).toEqual([LITTER_TILE_U[0] * TEXELS_PER_U, LITTER_TILE_U[1] * TEXELS_PER_U]);
    expect([tiles.oldLeaves.w, tiles.oldLeaves.h]).toEqual([OLD_TILE_U[0] * TEXELS_PER_U, OLD_TILE_U[1] * TEXELS_PER_U]);
    expect([tiles.grain.w, tiles.grain.h]).toEqual([SOIL_TILE_U * TEXELS_PER_U, SOIL_TILE_U * TEXELS_PER_U]);
  });

  it('repeat seamlessly: across each wrap the paint changes no more than between any two texels', () => {
    for (const c of Object.values(tiles)) {
      for (const across of [true, false]) {
        const n = across ? c.w : c.h;
        let mean = 0;
        for (let i = 0; i < n - 1; i++) mean += step(c, i, across);
        mean /= n - 1;
        // The wrap (last column or row to the first) is as smooth as the tile's own steps.
        expect(step(c, n - 1, across)).toBeLessThan(mean * 1.6);
      }
    }
  });

  it('differ by pattern, not only colour: litter bright and varied, humus dark, grain grainy, moss in stems', () => {
    const { litter, oldLeaves, grain } = tiles;
    let bright = 0;
    let humusDark = 0;
    let grainMin = 1;
    let grainMax = 0;
    let moss = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const x = (i * 97) % litter.w;
      const y = (i * 61) % litter.h;
      if (at(litter, x, y, 0) > 0.5) bright++;
      // H is a value the face colours: black and crumbs (below 0.4) far more than roots and hyphae.
      if (at(litter, x, y, 3) < 0.4) humusDark++;
      const gr = at(grain, x, y, 0);
      grainMin = Math.min(grainMin, gr);
      grainMax = Math.max(grainMax, gr);
      if (at(oldLeaves, x, y, 3) > 0.3) moss++;
    }
    expect(bright / N).toBeGreaterThan(0.12);
    expect(humusDark / N).toBeGreaterThan(0.85);
    expect(grainMax - grainMin).toBeGreaterThan(0.4);
    expect(moss / N).toBeGreaterThan(0.1);
    // Old leaves are dark, but their hyphae and roots are pale threads.
    let pale = 0;
    let dark = 0;
    for (let i = 0; i < N; i++) {
      const l = lum(oldLeaves, (i * 97) % oldLeaves.w, (i * 61) % oldLeaves.h);
      if (l > 0.4) pale++;
      if (l < 0.2) dark++;
    }
    expect(dark / N).toBeGreaterThan(0.6);
    expect(pale).toBeGreaterThan(20);
  });
});
