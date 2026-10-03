import { describe, it, expect } from 'vitest';
import { DataUtils } from 'three';
import {
  createDisturbance, recentre, stamp, decay, clearDisturbance, packDisturbance, cellAt, disturbedBox,
  originX, originZ, DIST_N, DIST_SPAN, DIST_CELL, DIST_REACH, ON_TOP_DISTANCE, type DisturbanceMap,
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
    it('marks the body near, more when the worm is under the leaves', () => {
      const under = createDisturbance();
      const onTop = createDisturbance();
      stamp(under, 0.06, 0.06, 1);
      stamp(onTop, 0.06, 0.06, 0);
      expect(cell(under, 0.06, 0.06)![2]).toBeGreaterThan(0.9);
      expect(cell(onTop, 0.06, 0.06)![2]).toBeGreaterThan(0.1);
      expect(cell(onTop, 0.06, 0.06)![2]).toBeLessThan(0.3);
    });

    it('nearness falls linearly with distance, so a shader can read the distance back', () => {
      const m = createDisturbance();
      // At a cell centre, so the cells 0.5 m and 1 m away along x sit exactly that far.
      stamp(m, 0.0625, 0.0625, 1);
      for (const dx of [0, 0.5, 1]) {
        const c = cell(m, 0.0625 + dx, 0.0625)!;
        expect(c[0]).toBeCloseTo(1 - dx / DIST_REACH, 6);
        expect(c[1]).toBe(0);
        expect(c[2]).toBeCloseTo(1 - dx / DIST_REACH, 6);
        expect(c[3]).toBe(1);
      }
    });

    it('a segment on top of the litter reaches less far', () => {
      const m = createDisturbance();
      stamp(m, 0.0625, 0.0625, 0);
      expect(cell(m, 0.0625, 0.0625)![2]).toBeCloseTo(1 - ON_TOP_DISTANCE / DIST_REACH, 6);
      expect(cell(m, 0.0625 + 0.25, 0.0625)!.every((v) => v === 0)).toBe(true);
    });

    it('stamps nothing beyond DIST_REACH', () => {
      const m = createDisturbance();
      stamp(m, 0, 0, 1);
      expect(cell(m, DIST_REACH + DIST_CELL, 0)!.every((v) => v === 0)).toBe(true);
      expect(cell(m, 0, -DIST_REACH - DIST_CELL)!.every((v) => v === 0)).toBe(true);
    });

    it('a nearer path takes a cell over; a farther one leaves it and its fading trail alone', () => {
      const m = createDisturbance();
      stamp(m, 0.0625, 0.0625, 1);
      for (let t = 0; t < 6 * 60; t++) decay(m, 1 / 60);
      const old = cell(m, 0.0625, 0.0625)!;
      stamp(m, 0.5625, 0.0625, 1);
      const kept = cell(m, 0.0625, 0.0625)!;
      expect([kept[0], kept[3]]).toEqual([old[0], old[3]]);
      expect(kept[3]).toBeCloseTo(0.5, 2);
      const taken = cell(m, 0.5625, 0.0625)!;
      expect(taken[0]).toBeGreaterThan(0.99);
      expect(taken[3]).toBe(1);
    });

    it('stamping the same point twice changes nothing more', () => {
      const m = createDisturbance();
      stamp(m, 0.3, 0.2, 0.5);
      const once = Float32Array.from(m.data);
      stamp(m, 0.3, 0.2, 0.5);
      expect(m.data).toEqual(once);
    });

    it('keeps every value within its range', () => {
      const m = createDisturbance();
      for (let t = 0; t < 200; t++) stamp(m, Math.sin(t) * 2, Math.cos(t * 0.7) * 2, (t % 3) / 2);
      for (let k = 0; k < m.data.length; k++) {
        expect(m.data[k]).toBeGreaterThanOrEqual(0);
        expect(m.data[k]).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('decay', () => {
    it('halves a trail in about 6 s and settles it in about 20 s', () => {
      const m = createDisturbance();
      stamp(m, 0, 0, 1);
      const k = cellAt(m, 0, 0);
      const start = m.data[k + 3];
      for (let t = 0; t < 6 * 60; t++) decay(m, 1 / 60);
      expect(m.data[k + 3] / start).toBeCloseTo(0.5, 2);
      for (let t = 0; t < 14 * 60; t++) decay(m, 1 / 60);
      expect(m.data[k + 3] / start).toBeLessThan(0.11);
    });

    it('empties the body nearness each step, ready for the body as it is now', () => {
      const m = createDisturbance();
      stamp(m, 0, 0, 1);
      const k = cellAt(m, 0, 0);
      decay(m, 1 / 60);
      expect(m.data[k + 2]).toBe(0);
      expect(m.data[k]).toBeGreaterThan(0.9);
    });

    it('clears a settled trail, path and all', () => {
      const m = createDisturbance();
      stamp(m, 0, 0, 1);
      for (let t = 0; t < 45 * 60; t++) decay(m, 1 / 60);
      expect(sum(m)).toBe(0);
    });

    it('never goes negative', () => {
      const m = createDisturbance();
      stamp(m, 0, 0, 1);
      for (let t = 0; t < 3000; t++) decay(m, 1 / 60);
      for (let k = 2; k < m.data.length; k += 4) expect(m.data[k]).toBeGreaterThanOrEqual(0);
    });
  });

  describe('scrolling', () => {
    it('keeps each stamp at its world place, with no loss and no doubling', () => {
      const m = createDisturbance();
      recentre(m, 0, 0);
      stamp(m, 0.5, -0.4, 1);
      const before = cell(m, 0.5, -0.4);
      const total = sum(m);
      // Walk a few metres in odd directions, whole and part cells at a time, keeping the stamp
      // (DIST_REACH around it) on the map.
      for (const [x, z] of [[0.3, 0.1], [1.1, -0.6], [-0.7, 1.4], [1.8, 1.6], [-1.5, -1.0]]) {
        recentre(m, x, z);
        expect(cell(m, 0.5, -0.4)).toEqual(before);
        expect(sum(m)).toBeCloseTo(total, 6);
      }
    });

    it('clears what scrolls off and exposes only empty cells', () => {
      const m = createDisturbance();
      recentre(m, 0, 0);
      stamp(m, 0, 0, 1);
      recentre(m, 10, 0);
      expect(sum(m)).toBe(0);
      recentre(m, 0, 0);
      expect(sum(m)).toBe(0);
    });

    it('a big jump clears everything', () => {
      const m = createDisturbance();
      stamp(m, 0, 0, 1);
      recentre(m, 100, -100);
      expect(sum(m)).toBe(0);
    });
  });

  it('clearDisturbance empties the map', () => {
    const m = createDisturbance();
    stamp(m, 0, 0, 1);
    clearDisturbance(m);
    expect(sum(m)).toBe(0);
  });

  it('packs an empty map to zeros and values to half floats, clamped to 0..1', () => {
    const m = createDisturbance();
    const out = new Uint16Array(m.data.length);
    packDisturbance(m, out);
    expect(Array.from(out.subarray(0, 4))).toEqual([0, 0, 0, 0]);
    m.data.set([1, 0.7, 1.4, 0.5], 0);
    packDisturbance(m, out);
    expect(Array.from(out.subarray(0, 4)).map((v) => DataUtils.fromHalfFloat(v))).toEqual([1, 0, 1, 0.5]);
  });

  it('disturbedBox bounds every cell holding anything, grown by a cell; empty when clear', () => {
    const m = createDisturbance();
    const box = [0, 0, 0, 0];
    disturbedBox(m, box);
    expect(box).toEqual([Infinity, Infinity, -Infinity, -Infinity]);
    recentre(m, 1, 1);
    stamp(m, 1, 1, 1);
    disturbedBox(m, box);
    // The stamp reaches DIST_REACH from (1, 1), so its cells span about that, plus a cell each side.
    for (const [lo, hi] of [[box[0], box[2]], [box[1], box[3]]]) {
      expect(lo).toBeLessThanOrEqual(1 - DIST_REACH - DIST_CELL + 1e-9);
      expect(lo).toBeGreaterThan(1 - DIST_REACH - 2 * DIST_CELL - 1e-9);
      expect(hi).toBeGreaterThanOrEqual(1 + DIST_REACH + DIST_CELL - 1e-9);
      expect(hi).toBeLessThan(1 + DIST_REACH + 2 * DIST_CELL + 1e-9);
    }
    // A fading trail still counts until it is cleared.
    decay(m, 1);
    disturbedBox(m, box);
    expect(box[0]).toBeLessThan(1);
    clearDisturbance(m);
    disturbedBox(m, box);
    expect(box[0]).toBe(Infinity);
  });

  it('reaches past the body plus a leaf, inside the map', () => {
    expect(DIST_REACH).toBeGreaterThan(ON_TOP_DISTANCE);
    expect(DIST_REACH).toBeLessThan(DIST_SPAN / 4);
  });
});
