import { describe, it, expect } from 'vitest';
import {
  createBurrows, claimBurrow, useBurrow, saveBurrow, restoreBurrow, findBurrow, clearBurrows, MAX_BURROWS,
} from '../../src/underground/burrows';
import { createOpenings, addOpening, MAX_OPENINGS, OPENING_MERGE } from '../../src/underground/openings';
import { createSoilGrid, fillSoilGrid, digDisc, takeDirty, takeHollowDirty, GRID_H, HOLLOW_H, HOLLOW_W } from '../../src/underground/soilGrid';
import { createBodyPath } from '../../src/underground/bodyPath';
import { boundaryAt, createSlab, slabX, slabZ, B_F } from '../../src/underground/slab';

const eaten = { cells: 0, organic: 0 };
const sum = (a: Uint8Array) => a.reduce((n, x) => n + x, 0);

describe('burrows kept for the play: tunnels stay (V4 spec 4.1)', () => {
  it('keeps a slab\'s tunnels, castings, mixed walls and hollow, and puts them back exactly into a fresh grid', () => {
    const s = createSlab(1, 2, 0.3, 1, 5);
    const g = createSoilGrid();
    fillSoilGrid(g, s);
    for (let u = -3; u <= 3; u += 0.1) digDisc(g, u, boundaryAt(s, B_F, u) - 0.6 - 0.2 * Math.sin(u), 0.14, eaten);
    g.cast[g.open.indexOf(1)] = 200;
    const want = { open: g.open.slice(), cast: g.cast.slice(), mixed: g.mixed.slice(), hollow: g.hollow.slice() };
    expect(sum(want.open)).toBeGreaterThan(100);
    expect(sum(want.mixed)).toBeGreaterThan(0);
    expect(want.hollow.some((x) => x > 0)).toBe(true);
    const b = createBurrows();
    const o = createOpenings();
    const k = claimBurrow(b, s, o);
    // Nothing kept until the worm leaves: restoring does nothing then.
    fillSoilGrid(g, s);
    expect(restoreBurrow(b, k, g)).toBe(false);
    expect(sum(g.open)).toBe(0);
    for (const key of ['open', 'cast', 'mixed', 'hollow'] as const) g[key].set(want[key]);
    saveBurrow(b, k, g);
    // A different slab dug meanwhile, then back: the same soil as the worm left it.
    fillSoilGrid(g, createSlab(-4, 0, 1.2, -1, 9));
    digDisc(g, 0, g.v0 + 10, 0.3, eaten);
    fillSoilGrid(g, s);
    takeDirty(g, { lo: 0, hi: 0 });
    const rect = { c0: 0, c1: 0, r0: 0, r1: 0 };
    takeHollowDirty(g, rect);
    expect(restoreBurrow(b, k, g)).toBe(true);
    for (const key of ['open', 'cast', 'mixed', 'hollow'] as const) expect(g[key]).toEqual(want[key]);
    // Every row and the whole hollow are marked changed: the renderer redraws them all.
    expect(takeDirty(g, { lo: 0, hi: 0 })).toEqual({ lo: 0, hi: GRID_H - 1 });
    takeHollowDirty(g, rect);
    expect(rect).toEqual({ c0: 0, c1: HOLLOW_W - 1, r0: 0, r1: HOLLOW_H - 1 });
  });

  it('copies into its own arrays, made once (saving allocates nothing)', () => {
    const b = createBurrows();
    const o = createOpenings();
    const g = createSoilGrid();
    const arrays = [...b.open, ...b.cast, ...b.mixed, ...b.hollow];
    expect(arrays).toHaveLength(4 * MAX_BURROWS);
    expect(new Set(arrays.map((a) => a.buffer)).size).toBe(4 * MAX_BURROWS);
    for (let n = 0; n < 3 * MAX_BURROWS; n++) {
      const k = claimBurrow(b, createSlab(n, 0, 0, 1, n), o);
      saveBurrow(b, k, g);
    }
    arrays.forEach((a, i) => expect(a === [...b.open, ...b.cast, ...b.mixed, ...b.hollow][i]).toBe(true));
  });

  it('keeps the newest 8 burrows, the oldest replaced (dug into again counts as new); its openings no longer lead to it', () => {
    const b = createBurrows();
    const o = createOpenings();
    const p = createBodyPath();
    const slabs = Array.from({ length: MAX_BURROWS + 2 }, (_, n) => createSlab(3 * n - 12, 4, 0, 1, n + 1));
    const ks = slabs.slice(0, MAX_BURROWS).map((s) => claimBurrow(b, s, o));
    expect(new Set(ks).size).toBe(MAX_BURROWS);
    // An opening over the first and the second burrows.
    addOpening(o, p, slabs[0], ks[0]);
    addOpening(o, p, slabs[1], ks[1]);
    expect(Array.from(o.burrow.slice(0, 2))).toEqual([ks[0], ks[1]]);
    // The worm went back down the first: the second is now the oldest.
    useBurrow(b, ks[0]);
    const k8 = claimBurrow(b, slabs[MAX_BURROWS], o);
    expect(k8).toBe(ks[1]);
    expect(b.slabs[k8]).toBe(slabs[MAX_BURROWS]);
    expect(b.saved[k8]).toBe(0);
    expect(o.burrow[1]).toBe(-1);
    expect(o.burrow[0]).toBe(ks[0]);
    // Then the third.
    expect(claimBurrow(b, slabs[MAX_BURROWS + 1], o)).toBe(ks[2]);
    expect(b.slabs).toContain(slabs[0]);
    expect(b.slabs).not.toContain(slabs[1]);
    expect(b.slabs).not.toContain(slabs[2]);
    clearBurrows(b);
    expect(b.slabs.every((s) => s === null)).toBe(true);
    expect(claimBurrow(b, slabs[0], o)).toBe(0);
  });

  it('finds the burrow at hand: the nearest opening over one, or entry, within OPENING_MERGE', () => {
    const b = createBurrows();
    const o = createOpenings();
    const p = createBodyPath();
    // Two parallel cuts along z, 3 u apart; each came out 4 u along from where it was dug.
    const a = createSlab(0, 0, 0, 1, 1);
    const c = createSlab(3, 0, 0, 1, 2);
    const ka = claimBurrow(b, a, o);
    const kc = claimBurrow(b, c, o);
    p.exitU = 4;
    addOpening(o, p, a, ka);
    addOpening(o, p, c, kc);
    expect(findBurrow(b, o, { x: slabX(a, 4) + 0.3, z: slabZ(a, 4) - 0.5 })).toBe(ka);
    expect(findBurrow(b, o, { x: 0.2, z: -0.4 })).toBe(ka); // at its entry
    expect(findBurrow(b, o, { x: 3 - 0.9, z: 4.2 })).toBe(kc);
    // Between them: the nearer one.
    expect(findBurrow(b, o, { x: 1.9, z: 0 })).toBe(kc);
    expect(findBurrow(b, o, { x: 1.2, z: 0 })).toBe(ka);
    // Too far from all.
    expect(findBurrow(b, o, { x: 0, z: 2 })).toBe(-1);
    expect(findBurrow(b, o, { x: -OPENING_MERGE - 0.01, z: 0 })).toBe(-1);
    // An opening over no burrow (or a replaced one) leads nowhere.
    p.exitU = -6;
    addOpening(o, p, a);
    expect(findBurrow(b, o, { x: 0, z: -6 })).toBe(-1);
    expect(o.count).toBeLessThanOrEqual(MAX_OPENINGS);
  });
});
