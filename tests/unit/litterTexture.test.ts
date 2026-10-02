import { describe, it, expect } from 'vitest';
import { litterTextureData, texelCentre, getLitterTexture, sampleLitter, LITTER_TEX_N, LITTER_SPAN } from '../../src/render/litterTexture';
import { litterDepth, litterMound, LITTER_MAX, PILES } from '../../src/surface/litterDepth';

describe('baked litter texture', () => {
  const n = 64;
  const data = litterTextureData(n);

  it('covers the world, texel centres inside it', () => {
    expect(LITTER_SPAN).toBe(40);
    expect(texelCentre(0, n)).toBeCloseTo(-20 + 40 / n / 2, 12);
    expect(texelCentre(n - 1, n)).toBeCloseTo(20 - 40 / n / 2, 12);
  });

  it('stores mound and depth at each texel centre (within one 8-bit step)', () => {
    const step = LITTER_MAX / 255;
    for (let j = 0; j < n; j += 7) {
      for (let i = 0; i < n; i += 5) {
        const x = texelCentre(i, n);
        const z = texelCentre(j, n);
        const k = (j * n + i) * 4;
        const d = litterDepth(x, z);
        expect(Math.abs((data[k] / 255) * LITTER_MAX - litterMound(d))).toBeLessThanOrEqual(step);
        expect(Math.abs((data[k + 1] / 255) * LITTER_MAX - d)).toBeLessThanOrEqual(step);
        expect(data[k + 2]).toBeGreaterThan(0);
        expect(data[k + 3]).toBe(255);
      }
    }
  });

  it('shows the piles', () => {
    const p = PILES[0];
    const i = Math.floor((p.x / LITTER_SPAN + 0.5) * n);
    const j = Math.floor((p.z / LITTER_SPAN + 0.5) * n);
    expect(data[(j * n + i) * 4]).toBeGreaterThan(100);
  });

  it('is sampled in TS as the GPU filters it: texel values at centres, blended between', () => {
    const out = [0, 0, 0];
    const k = (9 * n + 21) * 4;
    sampleLitter(data, texelCentre(21, n), texelCentre(9, n), out, n);
    expect(out[0]).toBeCloseTo((data[k] / 255) * LITTER_MAX, 9);
    expect(out[1]).toBeCloseTo((data[k + 1] / 255) * LITTER_MAX, 9);
    expect(out[2]).toBeCloseTo(data[k + 2] / 255, 9);
    sampleLitter(data, (texelCentre(21, n) + texelCentre(22, n)) / 2, texelCentre(9, n), out, n);
    expect(out[1]).toBeCloseTo(((data[k + 1] + data[k + 5]) / 2 / 255) * LITTER_MAX, 9);
  });

  it('is built once and shared', () => {
    const t = getLitterTexture();
    expect(getLitterTexture()).toBe(t);
    expect(t.image.width).toBe(LITTER_TEX_N);
  });
});
