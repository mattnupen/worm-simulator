import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSoilGrid, fillSoilGrid, digDisc, castBlob, markSolid, packRows, takeDirty, cellAt, cellU, cellV,
  AIR, GRID_W, GRID_H, CELL, MIX_RING, SOLID_STONE, type Eaten, type SoilGrid,
} from '../../src/underground/soilGrid';
import { createSlab, boundaryAt, layerAt, B_TOP, B_F, B_H, B_A, type Slab } from '../../src/underground/slab';
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
    expect([GRID_W, GRID_H, CELL]).toEqual([160, 120, 0.1]);
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

  it('a casting partly refills the tunnel, and eating it opens it again', () => {
    const v = mid(B_A, 1);
    for (let u = 0; u <= 2; u += 0.05) digDisc(g, u, v, 0.14, eaten);
    const open = () => g.open.reduce((a, b, i) => a + (b && !g.cast[i] ? 1 : 0), 0);
    const before = open();
    castBlob(g, 1, v, 0.14, 200);
    const filled = before - open();
    let covered = 0;
    for (let i = 0; i < g.open.length; i++) {
      if (Math.hypot(cellU(i % GRID_W) - 1, cellV(g, Math.floor(i / GRID_W)) - v) <= 0.14 && g.open[i]) covered++;
    }
    expect(filled).toBeGreaterThan(0.5 * covered);
    expect(filled).toBeLessThan(covered);
    digDisc(g, 1, v, 0.14, eaten);
    expect(open()).toBe(before);
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
