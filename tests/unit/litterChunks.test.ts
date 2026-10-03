import { describe, it, expect } from 'vitest';
import {
  CHUNKS, CHUNK_SIZE, LOD_NEAR, LOD_GAP, chunkIndex, chunkCentreX, chunkCentreZ, chunkDistance,
  groupByChunk, countBelow, nextLod, DRAPE_MARGIN, ACTIVE_MARGIN, boxesMeet, hullBox,
} from '../../src/surface/litterChunks';
import { OCC_OUTER } from '../../src/render/occlusion';
import { PUSH_SLIDE, DRAPE_HEIGHT } from '../../src/render/leafGlsl';
import { WORLD_HALF } from '../../src/surface/terrain';
import { placeLeaves } from '../../src/surface/leafLitter';

describe('litter chunks', () => {
  it('tile the world exactly', () => {
    expect(CHUNKS * CHUNK_SIZE).toBeCloseTo(2 * WORLD_HALF, 12);
    expect(chunkIndex(-WORLD_HALF, -WORLD_HALF)).toBe(0);
    expect(chunkIndex(WORLD_HALF, WORLD_HALF)).toBe(CHUNKS * CHUNKS - 1);
    expect(chunkIndex(999, -999)).toBe(CHUNKS - 1);
  });

  it('every point lies in the chunk whose square holds it', () => {
    for (let x = -WORLD_HALF; x <= WORLD_HALF; x += 0.73) {
      for (let z = -WORLD_HALF; z <= WORLD_HALF; z += 0.81) {
        const c = chunkIndex(x, z);
        expect(Math.abs(x - chunkCentreX(c))).toBeLessThanOrEqual(CHUNK_SIZE / 2 + 1e-9);
        expect(Math.abs(z - chunkCentreZ(c))).toBeLessThanOrEqual(CHUNK_SIZE / 2 + 1e-9);
        expect(chunkDistance(c, x, z)).toBe(0);
      }
    }
  });

  it('chunkDistance is the distance to the nearest point of the square', () => {
    const c = chunkIndex(0.1, 0.1);
    const edge = chunkCentreX(c) + CHUNK_SIZE / 2;
    expect(chunkDistance(c, edge + 3, chunkCentreZ(c))).toBeCloseTo(3, 9);
    const cornerX = chunkCentreX(c) + CHUNK_SIZE / 2;
    const cornerZ = chunkCentreZ(c) + CHUNK_SIZE / 2;
    expect(chunkDistance(c, cornerX + 3, cornerZ + 4)).toBeCloseTo(5, 9);
  });

  it('groups leaves so a global prefix is a per-chunk prefix', () => {
    const leaves = placeLeaves(3000, WORLD_HALF, 4);
    const groups = groupByChunk(leaves);
    expect(groups.reduce((a, g) => a + g.length, 0)).toBe(3000);
    for (const g of groups) for (let k = 1; k < g.length; k++) expect(g[k]).toBeGreaterThan(g[k - 1]);
    for (const n of [0, 1, 777, 3000]) {
      const total = groups.reduce((a, g) => a + countBelow(g, n), 0);
      expect(total).toBe(n);
    }
  });

  it('countBelow counts entries under n', () => {
    const s = [1, 4, 4, 9, 20];
    expect(countBelow(s, 0)).toBe(0);
    expect(countBelow(s, 4)).toBe(1);
    expect(countBelow(s, 5)).toBe(3);
    expect(countBelow(s, 100)).toBe(5);
    expect(countBelow([], 3)).toBe(0);
  });

  it('switches level of detail with hysteresis', () => {
    expect(nextLod(false, LOD_NEAR - 0.1)).toBe(true);
    expect(nextLod(true, LOD_NEAR + 1)).toBe(true);
    expect(nextLod(false, LOD_NEAR + 1)).toBe(false);
    expect(nextLod(true, LOD_NEAR + LOD_GAP + 0.1)).toBe(false);
  });

  it('pads chunks for the drape and the fade', () => {
    // A lifted leaf rises up to ~0.5 and slides up to PUSH_SLIDE: the bounding spheres need both.
    expect(DRAPE_MARGIN).toBeGreaterThanOrEqual(0.6);
    expect(DRAPE_MARGIN).toBeGreaterThanOrEqual(Math.hypot(2 * DRAPE_HEIGHT, PUSH_SLIDE));
    expect(ACTIVE_MARGIN).toBe(DRAPE_MARGIN + OCC_OUTER);
  });

  it('boxesMeet grows the first box by pad, and an empty box meets nothing', () => {
    const a = [0, 0, 1, 1];
    expect(boxesMeet(a, [0.5, 0.5, 0.6, 0.6], 0)).toBe(true);
    expect(boxesMeet(a, [1.4, 0, 2, 1], 0.5)).toBe(true);
    expect(boxesMeet(a, [1.6, 0, 2, 1], 0.5)).toBe(false);
    expect(boxesMeet(a, [0, -2, 1, -0.6], 0.5)).toBe(false);
    expect(boxesMeet(a, [-3, -3, 3, 3], 0)).toBe(true);
    expect(boxesMeet(a, [Infinity, Infinity, -Infinity, -Infinity], 100)).toBe(false);
  });

  it('hullBox spans the camera and every spine point, with no allocation', () => {
    const out = new Float32Array(4);
    hullBox(1, -2, [0, 5, 0, 3, 0, 4, -1, 2, 1], out);
    expect(Array.from(out)).toEqual([-1, -2, 3, 4]);
    hullBox(0, 0, [], out);
    expect(Array.from(out)).toEqual([0, 0, 0, 0]);
  });
});
