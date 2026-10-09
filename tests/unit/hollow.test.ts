// tests/unit/hollow.test.ts
import { describe, it, expect } from 'vitest';
import { createSlab } from '../../src/underground/slab';
import {
  createSoilGrid, fillSoilGrid, digDisc, takeHollowDirty, hollowAt, AIR, GRID_W, HOLLOW_MAX, HOLLOW_STEP, HOLLOW_W, HOLLOW_H,
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

  it('never carves air or stone', () => {
    const { g } = setUp();
    const i = cellAt(g, 1, -3);
    g.solid[i] = SOLID_STONE;
    digDisc(g, 1, -3, 0.14, ate);
    expect(hollowAt(g, 1, -3)).toBe(0);
    // A cell of air (above the litter): set one and dig it.
    const j = cellAt(g, 3, -3);
    g.layer[j] = AIR;
    digDisc(g, 3, -3, 0.14, ate);
    expect(hollowAt(g, 3, -3)).toBe(0);
    expect(GRID_W).toBe(160);
  });
});
