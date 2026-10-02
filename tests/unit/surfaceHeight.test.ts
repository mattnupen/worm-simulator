import { describe, it, expect } from 'vitest';
import {
  wormSurface, bellyHeight, litterTop, BELLY_UNDER, BELLY_ON_TOP, type WormSurface,
} from '../../src/worm/surfaceHeight';
import { litterDepth, PILES, LITTER_MIN, UNDER_THIN, UNDER_DEEP } from '../../src/surface/litterDepth';
import { terrainHeight, PLAY_HALF, WORLD_HALF } from '../../src/surface/terrain';

describe('wormSurface', () => {
  it('is under the leaves on thin litter: on the soil', () => {
    expect(litterDepth(0, 0)).toBeLessThan(UNDER_THIN);
    const s = wormSurface(0, 0);
    expect(s.under).toBe(1);
    expect(s.y).toBeCloseTo(terrainHeight(0, 0), 12);
  });

  it('rides on top of deep piles: on the litter top', () => {
    for (const p of PILES) {
      expect(litterDepth(p.x, p.z)).toBeGreaterThan(UNDER_DEEP);
      const s = wormSurface(p.x, p.z);
      expect(s.under).toBe(0);
      expect(s.y).toBeCloseTo(terrainHeight(p.x, p.z) + litterDepth(p.x, p.z), 12);
    }
  });

  it('blends smoothly from the open onto a pile (1 mm steps)', () => {
    const p = PILES[0];
    let prev = wormSurface(0, 0);
    let prevY = prev.y;
    let prevU = prev.under;
    const n = Math.round(Math.hypot(p.x, p.z) / 0.001);
    for (let i = 1; i <= n; i++) {
      const s = wormSurface((p.x * i) / n, (p.z * i) / n);
      expect(Math.abs(s.y - prevY)).toBeLessThan(0.003);
      expect(Math.abs(s.under - prevU)).toBeLessThan(0.03);
      prevY = s.y;
      prevU = s.under;
    }
    expect(prevU).toBe(0);
  });

  it('is always finite, with under in [0, 1], and never below the soil', () => {
    for (let x = -WORLD_HALF - 4; x <= WORLD_HALF + 4; x += 0.41) {
      for (let z = -WORLD_HALF - 4; z <= WORLD_HALF + 4; z += 0.43) {
        const s = wormSurface(x, z);
        expect(Number.isFinite(s.y)).toBe(true);
        expect(s.under).toBeGreaterThanOrEqual(0);
        expect(s.under).toBeLessThanOrEqual(1);
        expect(s.y).toBeGreaterThanOrEqual(terrainHeight(x, z));
      }
    }
  });

  it('with leaf reaction off (Low) always rides on top', () => {
    for (let x = -PLAY_HALF; x <= PLAY_HALF; x += 1.3) {
      for (let z = -PLAY_HALF; z <= PLAY_HALF; z += 1.7) {
        const s = wormSurface(x, z, false);
        expect(s.under).toBe(0);
        expect(s.y).toBeCloseTo(terrainHeight(x, z) + litterDepth(x, z), 12);
        expect(s.y).toBeGreaterThanOrEqual(terrainHeight(x, z) + LITTER_MIN);
      }
    }
  });

  it('writes into and returns the object it is given', () => {
    const out: WormSurface = { y: 0, under: 0 };
    expect(wormSurface(1, 2, true, out)).toBe(out);
  });
});

describe('bellyHeight and litterTop', () => {
  it('puts the belly on the soil when under and over the top leaves when on top', () => {
    expect(bellyHeight({ y: 0.3, under: 1 })).toBeCloseTo(0.3 + BELLY_UNDER, 12);
    expect(bellyHeight({ y: 0.3, under: 0 })).toBeCloseTo(0.3 + BELLY_ON_TOP, 12);
  });
  it('the litter top is the soil plus the full litter depth', () => {
    expect(litterTop(3, 4)).toBeCloseTo(terrainHeight(3, 4) + litterDepth(3, 4), 12);
  });
});
