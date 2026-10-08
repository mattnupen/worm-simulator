import { describe, it, expect } from 'vitest';
import { stepBurrower, TUNNEL_R } from '../../src/underground/burrowMotion';
import { cellAt, cellU, cellV, CELL, GRID_W, type SoilGrid } from '../../src/underground/soilGrid';
import { boundaryAt, B_F, B_H } from '../../src/underground/slab';
import { mulberry32 } from '../../src/core/random';
import { DT, N, setup, midOf, tunnel } from './burrowWorld';
import { makeGame, digDown, run } from './burrowPlay';

// The tunnel in section is a round tube the worm's own width (TUNNEL_R about the body's radius):
// only the head digs, and the body follows inside its tunnel (bodyTrail.ts). Before,
// every body point dug and cut each bend's inside: curves came out 0.4 to 0.6 u wide, 2x the worm.

/** The open run across the head's path at each of its samples (every 3rd), along the path's normal. */
function widths(g: SoilGrid, pu: number[], pv: number[]): number[] {
  const out: number[] = [];
  for (let k = 3; k < pu.length - 3; k += 3) {
    const tu = pu[k + 3] - pu[k - 3];
    const tv = pv[k + 3] - pv[k - 3];
    const l = Math.hypot(tu, tv);
    if (l < 0.03) continue;
    const open = (d: number) => { const i = cellAt(g, pu[k] - (tv / l) * d, pv[k] + (tu / l) * d); return i >= 0 && g.open[i] === 1; };
    let a = 0;
    while (a < 1.5 && open(a + 0.01)) a += 0.01;
    let b = 0;
    while (b < 1.5 && open(-b - 0.01)) b += 0.01;
    out.push(a + b);
  }
  return out.sort((x, y) => x - y);
}
const at = (a: number[], p: number) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
/** Cells open beyond `reach` of the head's path (pu, pv) and of the line the body lay along at the start (lineU0..lineU1 at lineV). */
function beyond(g: SoilGrid, pu: number[], pv: number[], line: [number, number, number]): number {
  const reach = TUNNEL_R + CELL * Math.SQRT1_2 + 1e-9;
  let n = 0;
  for (let i = 0; i < g.open.length; i++) {
    if (!g.open[i]) continue;
    const u = cellU(i % GRID_W);
    const v = cellV(g, Math.floor(i / GRID_W));
    if (Math.hypot(u - Math.max(line[0], Math.min(line[1], u)), v - line[2]) <= reach) continue;
    let near = Infinity;
    for (let k = 0; k < pu.length; k++) near = Math.min(near, Math.hypot(pu[k] - u, pv[k] - v));
    if (near > reach) n++;
  }
  return n;
}

describe('the tunnel is the worm\'s own width (a round tube)', () => {
  const ways: Record<string, (t: number) => [number, number]> = {
    straight: () => [1, 0],
    'gentle curve': (t) => [Math.cos(0.5 * t), 0.6 * Math.sin(0.5 * t)],
    's-curve': (t) => [1, Math.sin(1.4 * t)],
    wandering: (t) => [Math.cos(0.37 * t + 0.5), Math.sin(0.61 * t) - 0.15],
  };
  for (const [name, way] of Object.entries(ways)) {
    it(`${name}: about 2 x TUNNEL_R across, every open cell within the head's own dig, the body inside it`, () => {
      const all: number[] = [];
      for (const seed of [1, 2, 3, 5, 8]) {
        const w = setup(-3, midOf(B_H), false, seed);
        const tail0 = w.b.u[N - 1];
        const head0 = w.b.u[0];
        const v0 = w.b.v[0];
        // The tunnel it lies in (as digging down leaves it: burrowMoves.ts arriveBelow).
        tunnel(w, tail0, head0);
        const pu: number[] = [];
        const pv: number[] = [];
        for (let k = 0; k < 6 / DT; k++) {
          const [du, dv] = way(k * DT);
          stepBurrower(w.b, w.s, w.g, w.o, du, dv, DT);
          pu.push(w.b.u[0]);
          pv.push(w.b.v[0]);
          // The whole body, head included, lies in open tunnel.
          for (let i = 0; i < N; i++) expect(w.g.open[cellAt(w.g, w.b.u[i], w.b.v[i])], `seed ${seed} point ${i}`).toBe(1);
        }
        all.push(...widths(w.g, pu, pv));
        // Nothing is open beyond the head's own dig (a cell opens where its centre is within
        // TUNNEL_R: up to half a cell's diagonal more), but where the body lay at the start.
        expect(beyond(w.g, pu, pv, [tail0, head0, v0]), `seed ${seed}`).toBe(0);
      }
      // Across the path: 2 or 3 cells (0.2 to 0.3 u: TUNNEL_R 0.14 on a 0.1 u grid); a little more
      // only where the path itself turns back over its own tunnel.
      expect(at(all, 0.5)).toBeLessThanOrEqual(0.31);
      expect(at(all, 0.9)).toBeLessThanOrEqual(0.36);
    });
  }

  it("sharp turns every second over seeds: the body all but never digs beyond the head's own dig", () => {
    let outside = 0;
    let open = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const rand = mulberry32(seed);
      const w = setup(-3, midOf(B_H), false, seed);
      const line: [number, number, number] = [w.b.u[N - 1], w.b.u[0], w.b.v[0]];
      const pu: number[] = [];
      const pv: number[] = [];
      let du = 1;
      let dv = 0;
      for (let k = 0; k < 10 / DT; k++) {
        if (k % 60 === 0) { const a = rand() * Math.PI * 2; du = Math.cos(a); dv = Math.sin(a); }
        stepBurrower(w.b, w.s, w.g, w.o, du, dv, DT);
        pu.push(w.b.u[0]);
        pv.push(w.b.v[0]);
      }
      for (let i = 0; i < w.g.open.length; i++) open += w.g.open[i];
      outside += beyond(w.g, pu, pv, line);
    }
    // With every body point digging, 12 to 15% of the cells dug lay beyond the head's dig. Now only
    // a tail backed up to its tunnel's very end (it stops at the edge) keeps a cell or two open there.
    expect(open).toBeGreaterThan(600);
    expect(outside / open).toBeLessThan(0.01);
  });

  it('digging down: the hole below the F top is no wider than the body', () => {
    const { game } = makeGame();
    run(game, 0.5, { x: 0, y: 1 });
    digDown(game);
    const g = game.grid;
    const hu = game.worm.u[0];
    for (const below of [0.1, 0.25, 0.4, 0.6]) {
      const v = boundaryAt(game.slab!, B_F, hu) - below;
      let open = 0;
      for (let u = hu - 1.5; u <= hu + 1.5; u += CELL) if (g.open[cellAt(g, u, v)]) open++;
      expect(open, `${below} below the F top`).toBeLessThanOrEqual(3);
      expect(open).toBeGreaterThanOrEqual(2);
    }
  });
});
