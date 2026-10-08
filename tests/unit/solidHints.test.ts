import { describe, it, expect } from 'vitest';
import { createSlab, boundaryAt, B_F, B_TOP } from '../../src/underground/slab';
import { createSolids, placeSolids, markSolids, pushOutSolids, solidDepth, ENTRY_HI, ENTRY_LO } from '../../src/underground/solids';
import { SNAIL_REACH } from '../../src/underground/solidHints';
import { createSoilGrid, fillSoilGrid, digDisc, SOLID_STONE, GRID_W } from '../../src/underground/soilGrid';
import { BODY_RADIUS } from '../../src/game/crawl';
import { mulberry32 } from '../../src/core/random';

const hit = { nu: 0, nv: 0 };

describe('the snail shell and the beetle are never dug', () => {
  it('lie in the litter, off the entry, and block as small stones the worm slides round', () => {
    const rand = mulberry32(8);
    let snails = 0;
    let beetles = 0;
    for (let n = 0; n < 60; n++) {
      const s = createSlab(rand() * 30 - 15, rand() * 30 - 15, rand() * 6.3, rand() < 0.5 ? 1 : -1, Math.floor(rand() * 1e9));
      const o = placeSolids(s, createSolids());
      const g = createSoilGrid();
      fillSoilGrid(g, s);
      markSolids(g, o);
      const h = o.hints;
      const spots: [number, number, number][] = [];
      if (!Number.isNaN(h.snailU)) { snails++; spots.push([h.snailU, h.snailV, SNAIL_REACH]); }
      if (!Number.isNaN(h.beetleU)) { beetles++; spots.push([h.beetleU, h.beetleV, 0.1]); }
      for (const [u, v, r] of spots) {
        expect(v).toBeGreaterThan(boundaryAt(s, B_F, u));
        expect(v).toBeLessThan(boundaryAt(s, B_TOP, u));
        expect(u + r < ENTRY_LO || u - r > ENTRY_HI).toBe(true);
        // Never dug: the grid holds it as stone, and a dig there eats nothing.
        expect(g.solid[Math.floor((v - g.v0) / 0.1) * GRID_W + Math.floor((u + 8) / 0.1)]).toBe(SOLID_STONE);
        const eaten = { cells: 0, organic: 0 };
        digDisc(g, u, v, 0.08, eaten);
        expect(eaten.cells).toBe(0);
        // A head pushed onto it slides off it.
        const p = { u: u + 0.03, v: v - 0.02 };
        pushOutSolids(o, p, BODY_RADIUS);
        expect(solidDepth(o, p.u, p.v, BODY_RADIUS, hit)).toBeLessThanOrEqual(1e-6);
      }
    }
    expect(snails).toBeGreaterThan(40);
    expect(beetles).toBeGreaterThan(40);
  });
});
