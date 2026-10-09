// tests/unit/hollow.test.ts
import { describe, it, expect } from 'vitest';
import { createSlab } from '../../src/underground/slab';
import {
  createSoilGrid, fillSoilGrid, digDisc, takeHollowDirty, hollowAt, AIR, GRID_W, HOLLOW_MAX, HOLLOW_STEP, HOLLOW_W, HOLLOW_H, HOLLOW_MOUND_R, HOLLOW_PELLET,
  cellAt, SOLID_STONE,
} from '../../src/underground/soilGrid';
import { castBlob } from '../../src/underground/castings';

const ate = { cells: 0, organic: 0 };
const rect = { c0: 0, c1: -1, r0: 0, r1: -1 };
function setUp() {
  const s = createSlab(0, 0, 0, 1, 4);
  const g = createSoilGrid();
  fillSoilGrid(g, s);
  return { s, g };
}

describe('the hollow: how deep the tunnels go behind the face (spec 4.2)', () => {
  it('is a fine map, all zero on a fresh slab, and whole-dirty', () => {
    const { g } = setUp();
    expect(g.hollow.length).toBe(HOLLOW_W * HOLLOW_H);
    expect(HOLLOW_STEP).toBeCloseTo(0.025, 9);
    expect(g.hollow.every((x) => x === 0)).toBe(true);
    takeHollowDirty(g, rect);
    expect(rect.c0).toBe(0);
    expect(rect.c1).toBe(HOLLOW_W - 1);
  });

  it('a dig carves a round profile, sqrt(r^2 - d^2) deep, to byte precision', () => {
    const { g } = setUp();
    takeHollowDirty(g, rect);
    digDisc(g, 1, -3, 0.14, ate);
    const byte = HOLLOW_MAX / 255;
    // (Not out at 0.13: there the profile is so steep that a sample's own 0.0125 u offset beats the tolerance.)
    for (const d of [0, 0.05, 0.1, 0.12]) {
      expect(hollowAt(g, 1 + d, -3)).toBeGreaterThan(Math.sqrt(0.14 ** 2 - d ** 2) - 0.02 - byte);
      expect(hollowAt(g, 1 + d, -3)).toBeLessThan(Math.sqrt(0.14 ** 2 - d ** 2) + 0.02 + byte);
    }
    expect(hollowAt(g, 1.2, -3)).toBe(0);
    takeHollowDirty(g, rect);
    expect(rect.c0).toBeLessThanOrEqual(rect.c1);
    expect(rect.r1 - rect.r0).toBeLessThan(20);
  });

  it('overlapping digs keep the deeper; digging the same place again marks nothing dirty', () => {
    const { g } = setUp();
    digDisc(g, 1, -3, 0.14, ate);
    digDisc(g, 1.1, -3, 0.14, ate);
    expect(hollowAt(g, 1.05, -3)).toBeGreaterThan(0.13);
    takeHollowDirty(g, rect);
    digDisc(g, 1.1, -3, 0.14, ate);
    takeHollowDirty(g, rect);
    expect(rect.c0).toBeGreaterThan(rect.c1); // nothing changed
  });

  it('a casting fills part of the hollow as a mound; a later dig opens it again', () => {
    const { g } = setUp();
    for (let u = 0; u <= 2; u += 0.05) digDisc(g, u, -3, 0.14, ate);
    const before = hollowAt(g, 1, -3.06);
    const filled = castBlob(g, 1, -3, 0.15, 128, 1, 0);
    expect(filled).toBeGreaterThan(0);
    expect(hollowAt(g, 1, -3.06)).toBeLessThan(before);
    expect(hollowAt(g, 1, -3.06)).toBeGreaterThan(0); // a mound, not filled flush
    digDisc(g, 1, -3, 0.14, ate);
    expect(hollowAt(g, 1, -3.06)).toBeCloseTo(before, 2);
  });

  it('never carves air or stone, but carves the cell next to a stone', () => {
    const { g } = setUp();
    const i = cellAt(g, 1, -3);
    g.solid[i] = SOLID_STONE;
    digDisc(g, 1, -3, 0.14, ate);
    expect(hollowAt(g, 1, -3)).toBe(0);
    expect(hollowAt(g, 1.12, -3)).toBeGreaterThan(0); // the neighbouring unblocked cell still carves
    // A cell of air (above the litter): set one and dig it.
    const j = cellAt(g, 3, -3);
    g.layer[j] = AIR;
    digDisc(g, 3, -3, 0.14, ate);
    expect(hollowAt(g, 3, -3)).toBe(0);
    expect(hollowAt(g, 3.12, -3)).toBeGreaterThan(0);
  });

  it('a fresh slab resets the hollow and marks the whole map dirty', () => {
    const { s, g } = setUp();
    digDisc(g, 1, -3, 0.14, ate);
    expect(g.hollow.some((x) => x > 0)).toBe(true);
    takeHollowDirty(g, rect);
    fillSoilGrid(g, s);
    expect(g.hollow.every((x) => x === 0)).toBe(true);
    takeHollowDirty(g, rect);
    expect(rect).toEqual({ c0: 0, c1: HOLLOW_W - 1, r0: 0, r1: HOLLOW_H - 1 });
  });

  it('a casting marks its hollow samples dirty, lowers them to about the spec mound, and never raises one', () => {
    const { g } = setUp();
    for (let u = 0; u <= 2; u += 0.05) digDisc(g, u, -3, 0.14, ate);
    const before = Uint8Array.from(g.hollow);
    takeHollowDirty(g, rect);
    expect(castBlob(g, 1, -3, 0.15, 128, 1, 0)).toBeGreaterThan(0);
    takeHollowDirty(g, rect);
    expect(rect.c0).toBeLessThanOrEqual(rect.c1);
    expect(rect.r0).toBeLessThanOrEqual(rect.r1);
    let lowered = 0;
    for (let k = 0; k < g.hollow.length; k++) {
      expect(g.hollow[k]).toBeLessThanOrEqual(before[k]);
      if (g.hollow[k] < before[k]) lowered++;
    }
    expect(lowered).toBeGreaterThan(0);
    // Wherever the mound was set, it is 0.30..0.55 of the tunnel radius deep, plus its pellets
    // (up to HOLLOW_PELLET deeper) and grain (0.0075).
    const lo = HOLLOW_MOUND_R * 0.3 - 0.0075 - HOLLOW_MAX / 255;
    const hi = HOLLOW_MOUND_R * 0.55 + HOLLOW_PELLET + 0.0075 + HOLLOW_MAX / 255;
    for (let k = 0; k < g.hollow.length; k++) {
      if (g.hollow[k] === before[k]) continue;
      const depth = (g.hollow[k] * HOLLOW_MAX) / 255;
      expect(depth).toBeGreaterThanOrEqual(Math.max(0, lo));
      expect(depth).toBeLessThanOrEqual(hi);
    }
    // A second casting on top of the first changes nothing.
    const again = Uint8Array.from(g.hollow);
    castBlob(g, 1, -3, 0.15, 128, 1, 0);
    expect(Array.from(g.hollow)).toEqual(Array.from(again));
  });

  it('a dig at the edge of the grid does not throw and stays inside the map', () => {
    const { g } = setUp();
    const top = g.v0 + 13.6;
    expect(() => {
      digDisc(g, -8, g.v0, 0.14, ate);
      digDisc(g, 8, g.v0 + 0.01, 0.14, ate);
      digDisc(g, -8.05, top, 0.14, ate);
      digDisc(g, 9, -3, 0.14, ate);
    }).not.toThrow();
    expect(g.hollow.length).toBe(HOLLOW_W * HOLLOW_H);
    for (const x of g.hollow) expect(x).toBeLessThanOrEqual(255);
    expect(hollowAt(g, -8, g.v0 - 1)).toBe(0);
    expect(hollowAt(g, 20, 0)).toBe(0);
    expect(GRID_W).toBe(160);
  });
});
