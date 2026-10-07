import { describe, it, expect } from 'vitest';
import {
  createSlab, boundaryAt, layerAt, slabSeed, slabU, slabX, slabZ,
  B_TOP, B_F, B_H, B_A, B_E, B_B, SLAB_HALF, SLAB_DEPTH, COLUMN_STEP,
} from '../../src/underground/slab';
import { LAYER, EAT_SPEED, THICKNESS_CM } from '../../src/underground/layers';
import { UNITS_PER_CM } from '../../src/surface/realScale';
import { floorHeight, litterTopHeight } from '../../src/surface/litterDepth';
import { PLAY_HALF, WORLD_HALF } from '../../src/surface/terrain';

const SEEDS = [1, 7, 42, 99, 1234, 98765];
const cm = (u: number) => u / UNITS_PER_CM;

describe('the slab (spec 4.1, 5.1)', () => {
  it('every layer stays within its spec thickness everywhere along the cut, for many seeds', () => {
    for (const seed of SEEDS) {
      const s = createSlab(1.5, -2, 0.7, 1, seed);
      for (let u = s.faceLo; u <= s.faceHi; u += 0.05) {
        const pairs: [number, number, readonly [number, number]][] = [
          [B_F, B_H, THICKNESS_CM.F], [B_H, B_A, THICKNESS_CM.H], [B_A, B_E, THICKNESS_CM.A], [B_E, B_B, THICKNESS_CM.E],
        ];
        for (const [a, b, [lo, hi]] of pairs) {
          const t = cm(boundaryAt(s, a, u) - boundaryAt(s, b, u));
          expect(t).toBeGreaterThanOrEqual(lo - 1e-3);
          expect(t).toBeLessThanOrEqual(hi + 1e-3);
        }
      }
    }
  });

  it('the boundaries are irregular, not ruler lines, and each slab differs', () => {
    const a = createSlab(0, 0, 0, 1, 11);
    const b = createSlab(0, 0, 0, 1, 12);
    let spread = 0;
    let differs = 0;
    for (let u = -8; u <= 8; u += 0.25) {
      const ta = boundaryAt(a, B_H, u) - boundaryAt(a, B_A, u);
      const tb = boundaryAt(b, B_H, u) - boundaryAt(b, B_A, u);
      spread = Math.max(spread, Math.abs(ta - (boundaryAt(a, B_H, 0) - boundaryAt(a, B_A, 0))));
      differs = Math.max(differs, Math.abs(ta - tb));
    }
    expect(spread).toBeGreaterThan(0.02);
    expect(differs).toBeGreaterThan(0.02);
  });

  it('is deterministic per seed', () => {
    const a = createSlab(3, 4, 1.1, -1, 555);
    const b = createSlab(3, 4, 1.1, -1, 555);
    expect(Array.from(a.bounds)).toEqual(Array.from(b.bounds));
    expect(slabSeed(3.1, 4.2)).toBe(slabSeed(3.1, 4.2));
    expect(slabSeed(3.1, 4.2)).not.toBe(slabSeed(6, 4.2));
  });

  it('the L band at the entry is exactly the surface litter, its F top the floor (spec 8.2)', () => {
    for (const [x, z, h] of [[0, 0, 0], [5.3, -7.1, 2.2], [-11, 9, -1], [9, 10.5, -2.7]]) {
      const s = createSlab(x, z, h, 1, 3);
      expect(boundaryAt(s, B_F, 0)).toBeCloseTo(floorHeight(x, z), 5);
      expect(boundaryAt(s, B_TOP, 0) - boundaryAt(s, B_F, 0)).toBeCloseTo(litterTopHeight(x, z) - floorHeight(x, z), 5);
      expect(s.bottom).toBeCloseTo(litterTopHeight(x, z) - SLAB_DEPTH, 5);
    }
  });

  it('is 16 wide and clipped to the world: the playable part to the play area, the face to the world edge', () => {
    const mid = createSlab(0, 0, 0.3, 1, 1);
    expect(mid.playLo).toBe(-SLAB_HALF);
    expect(mid.playHi).toBe(SLAB_HALF);
    const edge = createSlab(PLAY_HALF - 4, 0, Math.PI / 2, 1, 1);
    expect(edge.playHi).toBeLessThan(4);
    expect(slabX(edge, edge.playHi)).toBeLessThanOrEqual(PLAY_HALF);
    expect(slabX(edge, edge.faceHi)).toBeLessThanOrEqual(WORLD_HALF);
    expect(edge.playLo).toBe(-SLAB_HALF);
    expect(edge.faceLo).toBeLessThan(edge.playLo);
    expect(edge.cols).toBe(Math.floor((edge.faceHi - edge.faceLo) / COLUMN_STEP) + 1);
  });

  it('maps between the world and the cut', () => {
    const s = createSlab(2, 3, 0.9, -1, 8);
    expect(slabU(s, slabX(s, 2.5), slabZ(s, 2.5))).toBeCloseTo(2.5, 9);
    // The camera's side normal is horizontal and square to the cut.
    expect(s.nx * s.tx + s.nz * s.tz).toBeCloseTo(0, 9);
    expect(Math.hypot(s.nx, s.nz)).toBeCloseTo(1, 9);
  });

  it('layerAt reads the layers top to bottom', () => {
    const s = createSlab(0, 0, 0, 1, 5);
    const at = (k: number, d: number) => boundaryAt(s, k, 1) - d;
    expect(layerAt(s, 1, boundaryAt(s, B_TOP, 1) + 0.01)).toBe(-1);
    expect(layerAt(s, 1, at(B_TOP, 0.01))).toBe(LAYER.L);
    expect(layerAt(s, 1, at(B_F, 0.01))).toBe(LAYER.F);
    expect(layerAt(s, 1, at(B_H, 0.01))).toBe(LAYER.H);
    expect(layerAt(s, 1, at(B_A, 0.01))).toBe(LAYER.A);
    expect(layerAt(s, 1, at(B_E, 0.01))).toBe(LAYER.E);
    expect(layerAt(s, 1, at(B_B, 0.01))).toBe(LAYER.B);
    expect(layerAt(s, 1, s.bottom)).toBe(LAYER.B);
  });

  it('the litter band stays positive all along the face, so the layers never cross (real surface, many spots)', () => {
    for (const [x, z, h] of [[0, 0, 0], [5.3, -7.1, 2.2], [-11, 9, -1], [14, 14, 0.8], [-17, -3, 1.9]]) {
      const s = createSlab(x, z, h, 1, slabSeed(x, z));
      for (let u = s.faceLo; u <= s.faceHi; u += 0.1) {
        expect(boundaryAt(s, B_TOP, u)).toBeGreaterThan(boundaryAt(s, B_F, u));
        expect(boundaryAt(s, B_B, u)).toBeGreaterThan(s.bottom);
      }
    }
  });

  it('the boundary indices line up with the layer ids (layerAt relies on it)', () => {
    expect([B_F, B_H, B_A, B_E, B_B]).toEqual([LAYER.F, LAYER.H, LAYER.A, LAYER.E, LAYER.B]);
    expect(Object.keys(EAT_SPEED).length).toBe(6);
  });

  it('slabSeed gives every 0.5 u cell its own seed', () => {
    const seen = new Set<number>();
    let n = 0;
    for (let i = -20; i <= 20; i++) for (let j = -20; j <= 20; j++) { seen.add(slabSeed(i / 2, j / 2)); n++; }
    expect(seen.size).toBe(n);
    expect(seen.has(0)).toBe(false);
    expect(slabSeed(0, 0)).toBe(slabSeed(0.2, -0.2)); // the same 0.5 u cell: the same slab
  });

  it('refuses a non-finite entry or heading', () => {
    expect(() => createSlab(NaN, 0, 0, 1, 1)).toThrow();
    expect(() => createSlab(0, 0, Infinity, 1, 1)).toThrow();
  });
});
