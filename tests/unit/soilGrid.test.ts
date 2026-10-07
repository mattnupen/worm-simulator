import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSoilGrid, fillSoilGrid, digDisc, castBlob, takeDirty, cellAt, cellU, cellV, rowOf, colOf,
  AIR, GRID_W, GRID_H, CELL, MIX_RING, SOLID_STONE, type Eaten, type SoilGrid,
} from '../../src/underground/soilGrid';
import { markSolid, packRows, dampen } from '../../src/underground/soilGridEdit';
import { mulberry32 } from '../../src/core/random';
import { PLAY_HALF } from '../../src/surface/terrain';
import { createSlab, boundaryAt, layerAt, B_TOP, B_F, B_H, B_A, SLAB_DEPTH, type Slab } from '../../src/underground/slab';
import { LAYER } from '../../src/underground/layers';

const eaten: Eaten = { cells: 0, organic: 0 };
const dirty = { lo: 0, hi: 0 };
let slab: Slab;
let g: SoilGrid;

beforeEach(() => {
  slab = createSlab(0, 0, 0, 1, 77);
  g = createSoilGrid();
  fillSoilGrid(g, slab);
});

/** Depth (v) halfway down layer boundary k's layer at u. */
const mid = (k: number, u: number) => (boundaryAt(slab, k, u) + boundaryAt(slab, k + 1, u)) / 2;

describe('the soil grid (spec 10)', () => {
  it('is 160 x 120 cells of 0.1 u, filled with the slab\'s layers and air above the litter', () => {
    expect([GRID_W, GRID_H, CELL]).toEqual([160, 136, 0.1]);
    for (let r = 0; r < GRID_H; r += 7) {
      for (let c = 0; c < GRID_W; c += 9) {
        const l = layerAt(slab, cellU(c), cellV(g, r));
        expect(g.layer[r * GRID_W + c]).toBe(l < 0 ? AIR : l);
      }
    }
    expect(g.open.every((x) => x === 0)).toBe(true);
  });

  it('digDisc opens the soil within the radius only, and counts what it ate once', () => {
    const v = mid(B_A, 0);
    takeDirty(g, dirty);
    digDisc(g, 0, v, 0.2, eaten);
    expect(eaten.cells).toBeGreaterThan(8);
    expect(eaten.organic).toBe(0);
    for (let r = 0; r < GRID_H; r++) {
      for (let c = 0; c < GRID_W; c++) {
        const d = Math.hypot(cellU(c), cellV(g, r) - v);
        expect(g.open[r * GRID_W + c]).toBe(d <= 0.2 ? 1 : 0);
      }
    }
    digDisc(g, 0, v, 0.2, eaten);
    expect(eaten.cells).toBe(0);
  });

  it('tracks exactly the rows that changed', () => {
    takeDirty(g, dirty);
    expect([dirty.lo, dirty.hi]).toEqual([0, GRID_H - 1]);
    takeDirty(g, dirty);
    expect(dirty.lo).toBeGreaterThan(dirty.hi);
    const v = mid(B_A, 2);
    digDisc(g, 2, v, 0.14, eaten);
    takeDirty(g, dirty);
    const rows = new Set<number>();
    for (let i = 0; i < g.open.length; i++) if (g.open[i]) rows.add(Math.floor(i / GRID_W));
    expect(dirty.lo).toBe(Math.min(...rows));
    expect(dirty.hi).toBe(Math.max(...rows));
  });

  it('never digs air or blockers', () => {
    const top = boundaryAt(slab, B_TOP, -3);
    digDisc(g, -3, top + 0.05, 0.14, eaten);
    for (let i = 0; i < g.open.length; i++) if (g.layer[i] === AIR) expect(g.open[i]).toBe(0);
    const v = mid(B_A, 4);
    markSolid(g, 4, v, 0.3, SOLID_STONE);
    digDisc(g, 4, v, 0.2, eaten);
    expect(eaten.cells).toBe(0);
  });

  it('mixes the walls where it eats F or H, not in mineral soil (spec 6)', () => {
    const vf = mid(B_F, -5);
    digDisc(g, -5, vf, 0.14, eaten);
    expect(eaten.organic).toBe(eaten.cells);
    let ring = 0;
    for (let i = 0; i < g.mixed.length; i++) {
      if (!g.mixed[i]) continue;
      ring++;
      const d = Math.hypot(cellU(i % GRID_W) + 5, cellV(g, Math.floor(i / GRID_W)) - vf);
      expect(d).toBeGreaterThan(0.14 - 1e-9);
      expect(d).toBeLessThanOrEqual(0.14 + MIX_RING + 1e-9);
      expect(g.open[i]).toBe(0);
    }
    expect(ring).toBeGreaterThan(8);
    const before = g.mixed.reduce((a, b) => a + b, 0);
    digDisc(g, 5, mid(B_A, 5), 0.14, eaten);
    expect(g.mixed.reduce((a, b) => a + b, 0)).toBe(before);
    expect(g.layer[cellAt(g, -5, mid(B_H, -5))]).toBe(LAYER.H);
  });

  /** A straight horizontal tunnel at depth v from u = 0 to 2, then a cast at u = 1. */
  const tunnelWithCast = (v: number, shade = 200) => {
    for (let u = 0; u <= 2; u += 0.05) digDisc(g, u, v, 0.14, eaten);
    const tunnel: number[] = [];
    for (let i = 0; i < g.open.length; i++) {
      if (g.open[i] && Math.hypot(cellU(i % GRID_W) - 1, cellV(g, Math.floor(i / GRID_W)) - v) <= 0.14) tunnel.push(i);
    }
    castBlob(g, 1, v, 0.14, shade);
    return tunnel;
  };
  /** 4-connected path through cells that are open and not cast, from column cA to column cB. */
  const openPath = (cA: number, cB: number): boolean => {
    const free = (i: number) => g.open[i] === 1 && g.cast[i] === 0;
    const seen = new Uint8Array(g.open.length);
    const stack: number[] = [];
    for (let r = 0; r < GRID_H; r++) if (free(r * GRID_W + cA)) { stack.push(r * GRID_W + cA); seen[r * GRID_W + cA] = 1; }
    while (stack.length) {
      const i = stack.pop()!;
      if (i % GRID_W === cB) return true;
      for (const j of [i - 1, i + 1, i - GRID_W, i + GRID_W]) {
        if (j < 0 || j >= g.open.length || seen[j] || !free(j)) continue;
        if (Math.abs((j % GRID_W) - (i % GRID_W)) > 1) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    return false;
  };

  it('a casting settles low, partly refills the tunnel and never seals it (spec 6)', () => {
    // Several heights, so the tunnel falls on 2 and 3 rows of cells.
    let share = 0;
    for (let k = 0; k < 10; k++) {
      slab = createSlab(0, 0, 0, 1, 77);
      fillSoilGrid(g, slab);
      const v = mid(B_A, 1) + k * 0.01;
      const tunnel = tunnelWithCast(v);
      let filled = 0;
      let lowest = 0;
      for (const i of tunnel) {
        if (!g.cast[i]) continue;
        filled++;
        expect(cellV(g, Math.floor(i / GRID_W))).toBeLessThanOrEqual(v + 0.2 * 0.14 + 1e-9);
        lowest += cellV(g, Math.floor(i / GRID_W)) - v;
      }
      expect(filled / tunnel.length).toBeGreaterThan(0.3);
      expect(filled / tunnel.length).toBeLessThan(0.9);
      share += filled / tunnel.length / 10;
      expect(lowest / filled).toBeLessThan(0);
      expect(openPath(colOf(0.3), colOf(1.7))).toBe(true);
    }
    // About 50% of a 2-row tunnel, 65% of a 3-row one.
    expect(share).toBeGreaterThan(0.5);
    expect(share).toBeLessThan(0.75);
  });

  it('eating a casting opens it again', () => {
    const v = mid(B_A, 1);
    const tunnel = tunnelWithCast(v);
    digDisc(g, 1, v, 0.14, eaten);
    for (const i of tunnel) expect(g.cast[i]).toBe(0);
  });

  it('castings clamp their shade, and a NaN shade gets a sane one', () => {
    const v = mid(B_A, 1);
    tunnelWithCast(v, 9999);
    expect(Math.max(...g.cast)).toBe(255);
    slab = createSlab(0, 0, 0, 1, 77);
    fillSoilGrid(g, slab);
    tunnelWithCast(v, 0);
    expect(Math.min(...Array.from(g.cast).filter((x) => x > 0))).toBe(1);
    fillSoilGrid(g, slab);
    tunnelWithCast(v, NaN);
    const shades = new Set(Array.from(g.cast).filter((x) => x > 0));
    expect(shades.size).toBe(1);
    const shade = [...shades][0];
    expect(shade).toBeGreaterThan(0);
    expect(shade).toBeLessThanOrEqual(255);
  });

  it('the grid reaches the litter top across the whole playable slab, on rising ground too', () => {
    const rand = mulberry32(5);
    const top = (g2: SoilGrid) => g2.v0 + GRID_H * CELL;
    let rise = 0;
    for (let n = 0; n < 300; n++) {
      const s = createSlab((rand() * 2 - 1) * (PLAY_HALF - 1), (rand() * 2 - 1) * (PLAY_HALF - 1), rand() * 6.283, rand() < 0.5 ? 1 : -1, n + 1);
      fillSoilGrid(g, s);
      for (let c = colOf(s.playLo) + 1; c < colOf(s.playHi); c++) {
        const u = cellU(c);
        const lt = boundaryAt(s, B_TOP, u);
        rise = Math.max(rise, lt - (s.bottom + SLAB_DEPTH));
        expect(lt).toBeLessThan(top(g) - 0.2);
        // Just under the litter top is litter, never air or off the grid; just above it is air.
        const i = cellAt(g, u, lt - 0.06);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(g.layer[i]).not.toBe(AIR);
        expect(g.layer[cellAt(g, u, lt + 0.15)]).toBe(AIR);
      }
    }
    expect(rise).toBeLessThan(GRID_H * CELL - SLAB_DEPTH - 0.2);
  });

  it('digs half outside the grid are clipped, not crashes', () => {
    takeDirty(g, dirty);
    for (const [u, v] of [[-8, mid(B_A, -8)], [8, mid(B_A, 8)], [0, g.v0], [0, g.v0 - 0.05], [0, g.v0 + GRID_H * CELL]] as const) {
      digDisc(g, u, v, 0.2, eaten);
      castBlob(g, u, v, 0.15, 100);
      markSolid(g, u, v, 0.3, SOLID_STONE);
      dampen(g, u, v, 0.3, 40);
    }
    for (let i = 0; i < g.open.length; i++) {
      if (g.open[i]) expect(g.layer[i]).not.toBe(AIR);
    }
    expect(g.open[cellAt(g, -7.95, mid(B_A, -8))]).toBe(1);
    expect(rowOf(g, g.v0 - 0.05)).toBeLessThan(0);
  });

  it('castings, mixing and damp each mark their rows dirty', () => {
    const rowsOf = (flag: Uint8Array, was?: Uint8Array) => {
      let lo = GRID_H, hi = -1;
      for (let i = 0; i < flag.length; i++) {
        if (flag[i] && !(was && was[i])) { lo = Math.min(lo, Math.floor(i / GRID_W)); hi = Math.max(hi, Math.floor(i / GRID_W)); }
      }
      return [lo, hi];
    };
    // Mixing: digging F also marks the walls' rows.
    takeDirty(g, dirty);
    digDisc(g, -5, mid(B_F, -5), 0.14, eaten);
    takeDirty(g, dirty);
    const [mlo, mhi] = rowsOf(g.mixed);
    expect(dirty.lo).toBeLessThanOrEqual(mlo);
    expect(dirty.hi).toBeGreaterThanOrEqual(mhi);
    // A cast marks the rows it filled.
    const v = mid(B_A, 1);
    for (let u = 0; u <= 2; u += 0.05) digDisc(g, u, v, 0.14, eaten);
    takeDirty(g, dirty);
    castBlob(g, 1, v, 0.14, 100);
    takeDirty(g, dirty);
    const [clo, chi] = rowsOf(g.cast);
    expect([dirty.lo, dirty.hi]).toEqual([clo, chi]);
    // Damp marks the rows it changed.
    const before = g.damp.slice();
    dampen(g, 3, mid(B_A, 3), 0.3, 50);
    takeDirty(g, dirty);
    let lo = GRID_H, hi = -1;
    for (let i = 0; i < g.damp.length; i++) if (g.damp[i] !== before[i]) { lo = Math.min(lo, Math.floor(i / GRID_W)); hi = Math.max(hi, Math.floor(i / GRID_W)); }
    expect(hi).toBeGreaterThan(lo);
    expect([dirty.lo, dirty.hi]).toEqual([lo, hi]);
  });

  it('packs rows as RGBA: open, castings, mixed, damp', () => {
    const bytes = new Uint8Array(GRID_W * GRID_H * 4);
    const v = mid(B_H, 0);
    digDisc(g, 0, v, 0.14, eaten);
    packRows(g, bytes, 0, GRID_H - 1);
    const i = cellAt(g, 0, v);
    expect(bytes[i * 4]).toBe(255);
    expect(bytes[i * 4 + 3]).toBe(g.damp[i]);
    const wall = g.mixed.findIndex((x) => x === 1);
    expect(bytes[wall * 4 + 2]).toBe(255);
    // Damper in F than in the mineral soil below.
    expect(g.damp[cellAt(g, 3, mid(B_F, 3))]).toBeGreaterThan(g.damp[cellAt(g, 3, mid(B_A, 3))]);
  });
});
