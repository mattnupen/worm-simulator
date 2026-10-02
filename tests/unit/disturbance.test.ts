import { describe, it, expect } from 'vitest';
import {
  createDisturbance, recentre, stamp, decay, clearDisturbance, packDisturbance, cellAt,
  originX, originZ, DIST_N, DIST_SPAN, DIST_CELL, BODY_R, PUSH_R, type DisturbanceMap,
} from '../../src/surface/disturbance';

const sum = (m: DisturbanceMap) => m.data.reduce((a, v) => a + Math.abs(v), 0);
const cell = (m: DisturbanceMap, x: number, z: number) => {
  const k = cellAt(m, x, z);
  return k < 0 ? null : Array.from(m.data.subarray(k, k + 4));
};

describe('disturbance map', () => {
  it('covers 8 x 8 m with 64 x 64 cells', () => {
    expect(DIST_N).toBe(64);
    expect(DIST_SPAN).toBe(8);
    expect(DIST_CELL).toBeCloseTo(0.125, 12);
    expect(createDisturbance().data.length).toBe(64 * 64 * 4);
  });

  it('recentres so the point lies in the middle cell', () => {
    const m = createDisturbance();
    recentre(m, 3.3, -1.1);
    expect(originX(m)).toBeLessThanOrEqual(3.3 - DIST_SPAN / 2 + DIST_CELL);
    expect(originX(m)).toBeGreaterThan(3.3 - DIST_SPAN / 2 - DIST_CELL);
    expect(originZ(m)).toBeLessThanOrEqual(-1.1 - DIST_SPAN / 2 + DIST_CELL);
    expect(cellAt(m, 3.3, -1.1)).toBe(((DIST_N / 2) * DIST_N + DIST_N / 2) * 4);
  });

  describe('stamp', () => {
    it('lifts the cells under the body, more when the worm is under the leaves', () => {
      const under = createDisturbance();
      const onTop = createDisturbance();
      stamp(under, 0.06, 0.06, 0, 1, 1, 1);
      stamp(onTop, 0.06, 0.06, 0, 1, 1, 0);
      expect(cell(under, 0.06, 0.06)![2]).toBeGreaterThan(0.9);
      expect(cell(onTop, 0.06, 0.06)![2]).toBeGreaterThan(0.1);
      expect(cell(onTop, 0.06, 0.06)![2]).toBeLessThan(0.3);
    });

    it('pushes beside the body away from the spine, with nothing on the spine itself', () => {
      const m = createDisturbance();
      // Spine along +z through x = 0.0625 (a cell centre).
      stamp(m, 0.0625, 0.0625, 0, 1, 1, 1);
      const right = cell(m, 0.0625 - 0.2, 0.0625)!;
      const left = cell(m, 0.0625 + 0.2, 0.0625)!;
      const centre = cell(m, 0.0625, 0.0625)!;
      expect(Math.hypot(centre[0], centre[1])).toBeLessThan(1e-9);
      expect(right[0]).toBeLessThan(-0.1);
      expect(left[0]).toBeGreaterThan(0.1);
      expect(Math.abs(right[1])).toBeLessThan(1e-9);
    });

    it('stamps the head hardest, and nothing beyond PUSH_R', () => {
      const head = createDisturbance();
      const body = createDisturbance();
      stamp(head, 0, 0, 0, 1, 1, 1);
      stamp(body, 0, 0, 0, 1, 0.5, 1);
      expect(sum(head)).toBeGreaterThan(sum(body));
      expect(cell(head, PUSH_R + DIST_CELL, 0)!.every((v) => v === 0)).toBe(true);
    });

    it('stamping the same point twice changes nothing more', () => {
      const m = createDisturbance();
      stamp(m, 0.3, 0.2, 0.6, 0.8, 1, 0.5);
      const once = Float32Array.from(m.data);
      stamp(m, 0.3, 0.2, 0.6, 0.8, 1, 0.5);
      expect(m.data).toEqual(once);
    });

    it('keeps every value within its range', () => {
      const m = createDisturbance();
      for (let t = 0; t < 200; t++) stamp(m, Math.sin(t) * 2, Math.cos(t * 0.7) * 2, Math.cos(t), Math.sin(t), 1, (t % 3) / 2);
      for (let k = 0; k < m.data.length; k += 4) {
        expect(Math.hypot(m.data[k], m.data[k + 1])).toBeLessThanOrEqual(1 + 1e-6);
        expect(m.data[k + 2]).toBeLessThanOrEqual(1);
        expect(m.data[k + 3]).toBeLessThanOrEqual(1);
        expect(m.data[k + 2]).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('decay', () => {
    it('halves a trail in about 6 s and settles it in about 20 s', () => {
      const m = createDisturbance();
      stamp(m, 0, 0, 0, 1, 1, 1);
      const k = cellAt(m, 0, 0);
      const start = m.data[k + 3];
      for (let t = 0; t < 6 * 60; t++) decay(m, 1 / 60);
      expect(m.data[k + 3] / start).toBeCloseTo(0.5, 2);
      for (let t = 0; t < 14 * 60; t++) decay(m, 1 / 60);
      expect(m.data[k + 3] / start).toBeLessThan(0.11);
    });

    it('lets the drape fall back within about a second', () => {
      const m = createDisturbance();
      stamp(m, 0, 0, 0, 1, 1, 1);
      const k = cellAt(m, 0, 0);
      for (let t = 0; t < 60; t++) decay(m, 1 / 60);
      expect(m.data[k + 2]).toBeLessThan(0.11);
    });

    it('never goes negative', () => {
      const m = createDisturbance();
      stamp(m, 0, 0, 0, 1, 1, 1);
      for (let t = 0; t < 3000; t++) decay(m, 1 / 60);
      for (let k = 2; k < m.data.length; k += 4) expect(m.data[k]).toBeGreaterThanOrEqual(0);
    });
  });

  describe('scrolling', () => {
    it('keeps each stamp at its world place, with no loss and no doubling', () => {
      const m = createDisturbance();
      recentre(m, 0, 0);
      stamp(m, 0.5, -0.4, 0, 1, 1, 1);
      const before = cell(m, 0.5, -0.4);
      const total = sum(m);
      // Walk a few metres in odd directions, whole and part cells at a time.
      for (const [x, z] of [[0.3, 0.1], [1.1, -0.6], [-0.7, 1.4], [2.0, 2.0], [-2.5, -1.0]]) {
        recentre(m, x, z);
        expect(cell(m, 0.5, -0.4)).toEqual(before);
        expect(sum(m)).toBeCloseTo(total, 6);
      }
    });

    it('clears what scrolls off and exposes only empty cells', () => {
      const m = createDisturbance();
      recentre(m, 0, 0);
      stamp(m, 0, 0, 0, 1, 1, 1);
      recentre(m, 10, 0);
      expect(sum(m)).toBe(0);
      recentre(m, 0, 0);
      expect(sum(m)).toBe(0);
    });

    it('a big jump clears everything', () => {
      const m = createDisturbance();
      stamp(m, 0, 0, 0, 1, 1, 1);
      recentre(m, 100, -100);
      expect(sum(m)).toBe(0);
    });
  });

  it('clearDisturbance empties the map', () => {
    const m = createDisturbance();
    stamp(m, 0, 0, 0, 1, 1, 1);
    clearDisturbance(m);
    expect(sum(m)).toBe(0);
  });

  it('packs zero push to exactly 128 and full values to the ends', () => {
    const m = createDisturbance();
    const out = new Uint8Array(m.data.length);
    packDisturbance(m, out);
    expect(Array.from(out.subarray(0, 4))).toEqual([128, 128, 0, 0]);
    m.data.set([1, -1, 1, 0.5], 0);
    packDisturbance(m, out);
    expect(Array.from(out.subarray(0, 4))).toEqual([255, 1, 255, 128]);
    // The shader decodes (v - 128) / 127.
    expect((out[0] - 128) / 127).toBe(1);
  });

  it('BODY_R and PUSH_R fit the worm (radius 0.115)', () => {
    expect(BODY_R).toBeGreaterThan(0.115);
    expect(PUSH_R).toBeGreaterThan(BODY_R * 2);
  });
});
