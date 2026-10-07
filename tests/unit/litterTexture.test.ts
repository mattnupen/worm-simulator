import { describe, it, expect } from 'vitest';
import {
  litterTextureData, texelCentre, getLitterTexture, sampleLitter, EDGE_REACH, LITTER_TEX_N, LITTER_SPAN, THIN_REACH,
} from '../../src/render/litterTexture';
import { POCKET_FAR } from '../../src/render/detailGlsl';
import { PLAY_HALF, WORLD_HALF } from '../../src/surface/terrain';
import { litterDepth, LITTER_MAX, PILES } from '../../src/surface/litterDepth';

describe('baked litter texture', () => {
  const n = 64;
  const data = litterTextureData(n);

  it('covers the world, texel centres inside it', () => {
    expect(LITTER_SPAN).toBe(40);
    expect(texelCentre(0, n)).toBeCloseTo(-20 + 40 / n / 2, 12);
    expect(texelCentre(n - 1, n)).toBeCloseTo(20 - 40 / n / 2, 12);
  });

  it('stores the depth at each texel centre (within one 8-bit step)', () => {
    const step = LITTER_MAX / 255;
    for (let j = 0; j < n; j += 7) {
      for (let i = 0; i < n; i += 5) {
        const x = texelCentre(i, n);
        const z = texelCentre(j, n);
        const k = (j * n + i) * 4;
        const d = litterDepth(x, z);
        expect(Math.abs((data[k] / 255) * LITTER_MAX - d)).toBeLessThanOrEqual(step);
        // The thinnest depth round it: never deeper than the depth there.
        expect(data[k + 1]).toBeLessThan(data[k]);
        expect(data[k + 2]).toBeGreaterThan(0);
        expect(data[k + 3]).toBe(255);
      }
    }
  });

  it('shows the piles', () => {
    const p = PILES[0];
    const i = Math.floor((p.x / LITTER_SPAN + 0.5) * n);
    const j = Math.floor((p.z / LITTER_SPAN + 0.5) * n);
    expect(data[(j * n + i) * 4]).toBeGreaterThan(200);
  });

  it('is sampled in TS as the GPU filters it: texel values at centres, blended between', () => {
    const out = [0, 0, 0];
    const k = (9 * n + 21) * 4;
    sampleLitter(data, texelCentre(21, n), texelCentre(9, n), out, n);
    expect(out[0]).toBeCloseTo((data[k] / 255) * LITTER_MAX, 9);
    expect(out[1]).toBeCloseTo((data[k + 1] / 255) * LITTER_MAX, 9);
    expect(out[2]).toBeCloseTo(data[k + 2] / 255, 9);
    sampleLitter(data, (texelCentre(21, n) + texelCentre(22, n)) / 2, texelCentre(9, n), out, n);
    expect(out[0]).toBeCloseTo(((data[k] + data[k + 4]) / 2 / 255) * LITTER_MAX, 9);
  });

  it('is built once and shared', () => {
    const t = getLitterTexture();
    expect(getLitterTexture()).toBe(t);
    expect(t.image.width).toBe(LITTER_TEX_N);
  });

  it('G is the thinnest litter within THIN_REACH: no depth sampled near a texel is thinner', () => {
    // At the game's own resolution: 64 texels a side (0.6 m apart) can step over the thinnest
    // point of a rock's bank, which follows the floor's shape. The map covers the world only.
    const N = LITTER_TEX_N;
    const real = litterTextureData(N);
    let checked = 0;
    for (let j = 3; j < N; j += 11) {
      for (let i = 3; i < N; i += 13) {
        const g = (real[(j * N + i) * 4 + 1] / 255) * LITTER_MAX;
        for (let a = 0; a < 16; a++) {
          const r = THIN_REACH * (a % 2 ? 1 : 0.5);
          const x = texelCentre(i, N) + Math.cos(a) * r;
          const z = texelCentre(j, N) + Math.sin(a) * r;
          if (Math.abs(x) > LITTER_SPAN / 2 || Math.abs(z) > LITTER_SPAN / 2) continue;
          expect(litterDepth(x, z)).toBeGreaterThanOrEqual(g - LITTER_MAX / 255);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(5000);
  });

  it('past the world\'s edge, where lookups read the outermost texels, G is still the thinnest within THIN_REACH', () => {
    // A pocket leaf's home lies at most POCKET_FAR from a spine kept within PLAY_HALF.
    expect(EDGE_REACH).toBeGreaterThanOrEqual(POCKET_FAR - (WORLD_HALF - PLAY_HALF) + THIN_REACH);
    const N = LITTER_TEX_N;
    const real = litterTextureData(N);
    const out = [0, 0, 0];
    const past = EDGE_REACH - THIN_REACH;
    let checked = 0;
    for (let t = -WORLD_HALF - past; t <= WORLD_HALF + past; t += 0.37) {
      for (let side = 0; side < 4; side++) {
        // A home from the edge out to `past` beyond it, along each side.
        for (const o of [0, past / 2, past]) {
          const e = WORLD_HALF + o;
          const x = side === 0 ? e : side === 1 ? -e : t;
          const z = side === 2 ? e : side === 3 ? -e : t;
          sampleLitter(real, x, z, out, N);
          for (let a = 0; a < 12; a++) {
            const r = THIN_REACH * (a % 2 ? 1 : 0.5);
            expect(litterDepth(x + Math.cos(a) * r, z + Math.sin(a) * r)).toBeGreaterThanOrEqual(out[1] - LITTER_MAX / 255);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(10000);
  });
});
