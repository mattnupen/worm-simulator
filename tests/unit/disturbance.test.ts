import { describe, it, expect } from 'vitest';
import {
  createDisturbance, recentre, stamp, decay, clearDisturbance, packDisturbance, cellAt, disturbedBox,
  originX, originZ, stampBody, DIST_N, DIST_SPAN, DIST_CELL, DIST_REACH, ON_TOP_DISTANCE, type DisturbanceMap,
} from '../../src/surface/disturbance';
import { leafReach, maxLeafRadius, stampLimit } from '../../src/surface/leafScale';
import { DRAPE_FOOT } from '../../src/render/leafGlsl';
import { SCALE_MODES, SCALE_SPECS } from '../../src/surface/worldScale';

const sum = (m: DisturbanceMap) => m.data.reduce((a, v) => a + Math.abs(v), 0);
const cell = (m: DisturbanceMap, x: number, z: number) => {
  const k = cellAt(m, x, z);
  return k < 0 ? null : Array.from(m.data.subarray(k, k + 4));
};

describe('disturbance map', () => {
  it('covers 12 x 12 m with 96 x 96 cells (12.5 cm each)', () => {
    expect(DIST_N).toBe(96);
    expect(DIST_SPAN).toBe(12);
    expect(DIST_CELL).toBeCloseTo(0.125, 12);
    expect(createDisturbance().data.length).toBe(96 * 96 * 4);
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
      expect(cell(under, 0.06, 0.06)![2]).toBeGreaterThan(0.95);
      // On top it reads as if 3.4 m away: it reaches only 0.2 m.
      expect(cell(onTop, 0.06, 0.06)![2]).toBeGreaterThan(0.03);
      expect(cell(onTop, 0.06, 0.06)![2]).toBeLessThan(0.07);
      expect(DIST_REACH - ON_TOP_DISTANCE).toBeCloseTo(0.2, 9);
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

  it('packs an empty map to zeros, and full values to 255 (low bytes 0), clamped to 0..1', () => {
    const m = createDisturbance();
    const near = new Uint8Array(DIST_N * DIST_N * 4);
    const trail = new Uint8Array(DIST_N * DIST_N * 2);
    packDisturbance(m, near, trail);
    expect([...near.subarray(0, 4), ...trail.subarray(0, 2)]).toEqual([0, 0, 0, 0, 0, 0]);
    m.data.set([1, 0.7, 1.4, 0.5], 0);
    packDisturbance(m, near, trail);
    // near: path high, low, body high, low; trail: trail, path.
    expect([...near.subarray(0, 4), ...trail.subarray(0, 2)]).toEqual([255, 0, 255, 0, 128, 255]);
  });

  it('disturbedBox bounds every cell holding anything, grown by a cell; empty when clear', () => {
    const m = createDisturbance();
    const box = [0, 0, 0, 0];
    disturbedBox(m, box);
    expect(box).toEqual([Infinity, Infinity, -Infinity, -Infinity]);
    recentre(m, 1, 1);
    stamp(m, 1, 1, 1);
    disturbedBox(m, box);
    // The stamp reaches DIST_REACH from (1, 1), so its cells span about that, plus a cell each side
    // (the outermost stamped cell's centre lies within the reach; the box adds a cell).
    for (const [lo, hi] of [[box[0], box[2]], [box[1], box[3]]]) {
      expect(lo).toBeLessThanOrEqual(1 - DIST_REACH + 1e-9);
      expect(lo).toBeGreaterThan(1 - DIST_REACH - 2 * DIST_CELL - 1e-9);
      expect(hi).toBeGreaterThanOrEqual(1 + DIST_REACH - 1e-9);
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

  it('disturbedBox keeps to the shaders\' window around the map\'s centre; empty when nothing is in it', () => {
    const m = createDisturbance();
    const box = [0, 0, 0, 0];
    recentre(m, 0, 0);
    const cx = originX(m) + DIST_SPAN / 2;
    const cz = originZ(m) + DIST_SPAN / 2;
    stamp(m, 0, 0, 1);
    disturbedBox(m, box, 1.2);
    expect(box).toEqual([cx - 1.2, cz - 1.2, cx + 1.2, cz + 1.2]);
    // A trail only past the window: nothing a leaf reads.
    clearDisturbance(m);
    stamp(m, 5, 0, 1, 0.3);
    disturbedBox(m, box, 3.88);
    expect(box[0]).toBe(Infinity);
    disturbedBox(m, box);
    expect(box[0]).toBeGreaterThan(4.5);
    expect(box[2]).toBeLessThanOrEqual(cx + DIST_SPAN / 2);
  });

  it('reaches past the biggest leaf plus the drape, inside the map\'s unfaded middle', () => {
    expect(DIST_REACH).toBeGreaterThan(ON_TOP_DISTANCE);
    // The map centres 7 segments (1.54 m) behind the head; a True leaf whose edge reaches the
    // drape's foot from the head must sit inside the leaf shader's widest edge fade (85% of the half span).
    expect(7 * 0.22 + maxLeafRadius(SCALE_SPECS.true) + DRAPE_FOOT).toBeLessThan(0.85 * DIST_SPAN / 2);
    for (const mode of SCALE_MODES) expect(stampLimit(SCALE_SPECS[mode])).toBeLessThanOrEqual(DIST_REACH);
    // The whole map's default: a body riding on top reaches 0.2 m (each mode's own: disturbReach.test.ts).
    expect(DIST_REACH - ON_TOP_DISTANCE).toBeCloseTo(0.2, 9);
    // Classic's leaves react exactly as far as before the map grew.
    expect(leafReach(SCALE_SPECS.classic)).toBeCloseTo(1.6, 9);
    expect(leafReach(SCALE_SPECS.classic) - maxLeafRadius(SCALE_SPECS.classic)).toBeCloseTo(DRAPE_FOOT, 9);
  });

  it('a stamp limit leaves far cells empty and the near ones exactly as before', () => {
    const body = Array.from({ length: 16 }, (_, i) => ({ x: 0.03, y: 0, z: 0.05 - i * 0.22 }));
    const under = new Float32Array(16).fill(1);
    const full = createDisturbance();
    const near = createDisturbance();
    for (const m of [full, near]) recentre(m, 0, -1.5);
    stampBody(full, body, under);
    stampBody(near, body, under, 1.8);
    let kept = 0;
    for (let x = -4; x <= 4; x += 0.1) {
      for (let z = -6; z <= 3; z += 0.1) {
        const a = cell(full, x, z)!;
        const b = cell(near, x, z)!;
        // Distance from the cell's centre to the body's line (x = 0.03, z from -3.25 to 0.05).
        const cx = (Math.floor(x / DIST_CELL) + 0.5) * DIST_CELL;
        const cz = (Math.floor(z / DIST_CELL) + 0.5) * DIST_CELL;
        const d = Math.hypot(cx - 0.03, cz - Math.max(-3.25, Math.min(0.05, cz)));
        if (d < 1.79) {
          expect(b).toEqual(a);
          kept++;
        } else if (d > 1.81) {
          expect(b.every((v) => v === 0)).toBe(true);
        }
      }
    }
    expect(kept).toBeGreaterThan(1000);
  });
});
