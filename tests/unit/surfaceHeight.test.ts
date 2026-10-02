import { describe, it, expect } from 'vitest';
import {
  wormSurface, bellyHeight, litterTop, BELLY_UNDER, BELLY_ON_TOP, type WormSurface,
} from '../../src/worm/surfaceHeight';
import {
  litterDepth, litterMound, underAmount, PILES, UNDER_THIN, UNDER_DEEP,
} from '../../src/surface/litterDepth';
import { meshGroundHeight } from '../../src/surface/terrainMesh';
import { terrainHeight, PLAY_HALF, WORLD_HALF } from '../../src/surface/terrain';
import { treeSites } from '../../src/surface/treeSites';
import { ROCKS, HERO_LOG } from '../../src/surface/propPlacement';

describe('wormSurface', () => {
  it('is under the leaves on thin litter: on the soil', () => {
    expect(litterDepth(0, 0)).toBeLessThan(UNDER_THIN);
    const s = wormSurface(0, 0);
    expect(s.under).toBe(1);
    // The soil under thin litter is the rendered ground (the mound is ~0 here).
    expect(s.y).toBeCloseTo(meshGroundHeight(0, 0), 12);
    expect(Math.abs(s.y - terrainHeight(0, 0))).toBeLessThan(0.01);
  });

  it('rides on top of deep piles: on the litter top', () => {
    for (const p of PILES) {
      expect(litterDepth(p.x, p.z)).toBeGreaterThan(UNDER_DEEP);
      const s = wormSurface(p.x, p.z);
      expect(s.under).toBe(0);
      expect(s.y).toBeCloseTo(meshGroundHeight(p.x, p.z), 12);
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

  it('is always finite, with under in [0, 1], and never below the rendered ground', () => {
    for (let x = -WORLD_HALF - 4; x <= WORLD_HALF + 4; x += 0.41) {
      for (let z = -WORLD_HALF - 4; z <= WORLD_HALF + 4; z += 0.43) {
        const s = wormSurface(x, z);
        expect(Number.isFinite(s.y)).toBe(true);
        expect(s.under).toBeGreaterThanOrEqual(0);
        expect(s.under).toBeLessThanOrEqual(1);
        expect(s.y).toBeGreaterThanOrEqual(meshGroundHeight(x, z) - 1e-3);
      }
    }
  });

  it('with leaf reaction off (Low) always rides on top', () => {
    for (let x = -PLAY_HALF; x <= PLAY_HALF; x += 1.3) {
      for (let z = -PLAY_HALF; z <= PLAY_HALF; z += 1.7) {
        const s = wormSurface(x, z, false);
        expect(s.under).toBe(0);
        const depth = litterDepth(x, z);
        // On the rendered ground plus the loose leaves above the mound.
        expect(s.y).toBeCloseTo(meshGroundHeight(x, z) + depth - litterMound(depth), 12);
        expect(s.y).toBeGreaterThanOrEqual(meshGroundHeight(x, z) - 1e-3);
      }
    }
  });

  it('writes into and returns the object it is given', () => {
    const out: WormSurface = { y: 0, under: 0 };
    expect(wormSurface(1, 2, true, out)).toBe(out);
  });
});

describe('wormSurface rests on the rendered ground', () => {
  /** Points over the play area, around every pile, trunk, rock and the log (mound edges). */
  function* samples(): Generator<[number, number]> {
    for (let x = -PLAY_HALF; x <= PLAY_HALF; x += 0.13) for (let z = -PLAY_HALF; z <= PLAY_HALF; z += 0.17) yield [x, z];
    for (const p of PILES) {
      for (let a = 0; a < 2 * Math.PI; a += 0.05) for (let r = 0; r < 2.5 * p.r; r += 0.05) yield [p.x + r * Math.cos(a), p.z + r * Math.sin(a)];
    }
    const round = [...treeSites(), ...ROCKS, HERO_LOG];
    for (const o of round) {
      for (let a = 0; a < 2 * Math.PI; a += 0.1) for (let r = 0.1; r < 2; r += 0.1) yield [o.x + r * Math.cos(a), o.z + r * Math.sin(a)];
    }
  }

  it('is never below meshGroundHeight - 1e-3 (reaction on or off)', () => {
    for (const [x, z] of samples()) {
      for (const reaction of [true, false]) {
        const s = wormSurface(x, z, reaction);
        expect(s.y).toBeGreaterThanOrEqual(meshGroundHeight(x, z) - 1e-3);
      }
    }
  });

  it('with leaf reaction on, is the rendered ground itself: no sinking, no floating', () => {
    for (const [x, z] of samples()) expect(Math.abs(wormSurface(x, z).y - meshGroundHeight(x, z))).toBeLessThan(1e-9);
  });

  it('the belly stays clear of the rendered ground when on top, and the camera floor clears it', () => {
    for (const [x, z] of samples()) {
      const s = wormSurface(x, z);
      expect(bellyHeight(s)).toBeGreaterThan(meshGroundHeight(x, z));
      expect(litterTop(x, z)).toBeGreaterThanOrEqual(meshGroundHeight(x, z) - 1e-9);
      expect(underAmount(litterDepth(x, z))).toBeCloseTo(s.under, 12);
    }
  });
});

describe('bellyHeight and litterTop', () => {
  it('puts the belly on the soil when under and over the top leaves when on top', () => {
    expect(bellyHeight({ y: 0.3, under: 1 })).toBeCloseTo(0.3 + BELLY_UNDER, 12);
    expect(bellyHeight({ y: 0.3, under: 0 })).toBeCloseTo(0.3 + BELLY_ON_TOP, 12);
  });
  it('the litter top is the rendered ground plus the loose leaves above its mound', () => {
    const depth = litterDepth(3, 4);
    expect(litterTop(3, 4)).toBeCloseTo(meshGroundHeight(3, 4) + depth - litterMound(depth), 12);
  });
});
