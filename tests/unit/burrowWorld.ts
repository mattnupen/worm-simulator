import {
  createBurrower, placeBurrower, stepBurrower, TUNNEL_R, type Burrower,
} from '../../src/underground/burrowMotion';
import { createSlab, boundaryAt, type Slab } from '../../src/underground/slab';
import { createSoilGrid, fillSoilGrid, digDisc, cellU, cellV, colOf, rowOf, CELL, GRID_W, GRID_H, type SoilGrid } from '../../src/underground/soilGrid';
import { createSolids, placeSolids, markSolids, solidDepth, type Solids } from '../../src/underground/solids';
import { BODY_RADIUS, SPACING } from '../../src/game/crawl';

// Shared by burrowMotion.test.ts and burrowMotion.jitter.test.ts: a slab, its grid and blockers,
// a worm lying in it, and a frame-to-frame watcher of its head.

export const DT = 1 / 60;
export const N = 16;
export const hit = { nu: 0, nv: 0 };

export interface World { s: Slab; g: SoilGrid; o: Solids; b: Burrower }

/**
 * A slab with no blockers (unless `solids`), the worm lying straight with its head at (u, v) facing
 * +u; with blockers, moved along the cut (by up to 4 u) until no body point is in one.
 */
export function setup(u: number, v: (s: Slab) => number, solids = false, seed = 3): World {
  const s = createSlab(0, 0, 0, 1, seed);
  const g = createSoilGrid();
  fillSoilGrid(g, s);
  const o = createSolids();
  if (solids) { placeSolids(s, o); markSolids(g, o); }
  const b = createBurrower();
  const vv = v(s);
  const clear = (at: number) => Array.from({ length: N }, (_, i) => at - SPACING * i)
    .every((x) => solidDepth(o, x, vv, BODY_RADIUS, hit) <= 0);
  for (let k = 0; solids && k < 80 && !clear(u); k++) u += k % 2 ? 0.1 * k : -0.1 * k;
  const us = Array.from({ length: N }, (_, i) => u - SPACING * i);
  placeBurrower(b, us, us.map(() => vv), 0, { phase: 0, activity: 0 });
  return { s, g, o, b };
}

export const run = (w: World, du: number, dv: number, steps: number, each?: () => void) => {
  for (let k = 0; k < steps; k++) { stepBurrower(w.b, w.s, w.g, w.o, du, dv, DT); each?.(); }
};
/** Digs a straight open tunnel along the worm's depth from u0 to u1. */
export function tunnel(w: World, u0: number, u1: number): void {
  const ate = { cells: 0, organic: 0 };
  for (let u = u0; u <= u1; u += 0.05) digDisc(w.g, u, w.b.v[0], TUNNEL_R, ate);
}
export const midOf = (k: number) => (s: Slab) => (boundaryAt(s, k, 0) + boundaryAt(s, k + 1, 0)) / 2;


/**
 * Frame-to-frame watcher of the head (Matt notices jitter): its steps, the turn of its facing, and
 * the oscillations a viewer would see: a step that reverses the last one, or a turn that flips
 * one way, back and forth again within a few frames. Steps under SEEN (about a tenth of a pixel
 * in the Close view, 6 u across 768 px) are too small to see: a head pressed into a stone or the
 * top creeps along it by less than that, and turns the way the stick turns.
 */
export const SEEN = 1e-3;
/**
 * Turns under this (radians a frame, 0.03 degrees) are too small to see: a head pressed into a stone
 * with its facing held MAX_NECK_BEND off its neck (burrowMotion.ts) eases to and fro by less.
 */
export const TURN_SEEN = 5e-4;
export function watch(b: Burrower) {
  const st = { pu: 0, pv: 0, lastU: b.u[0], lastV: b.v[0], lastDir: b.dir, turn: 0, flips: [] as number[], k: 0,
    reversals: 0, wobbles: 0, maxStep: 0, maxTurn: 0, maxAccel: 0 };
  return Object.assign(st, {
    step(): void {
      const su = b.u[0] - st.lastU;
      const sv = b.v[0] - st.lastV;
      const len = Math.hypot(su, sv);
      const pl = Math.hypot(st.pu, st.pv);
      if (len > SEEN && pl > SEEN && su * st.pu + sv * st.pv < 0) st.reversals++;
      st.maxAccel = Math.max(st.maxAccel, Math.hypot(su - st.pu, sv - st.pv));
      st.maxStep = Math.max(st.maxStep, len);
      const turn = b.dir - st.lastDir;
      st.maxTurn = Math.max(st.maxTurn, Math.abs(turn));
      if (Math.abs(turn) > TURN_SEEN) {
        if (st.turn !== 0 && Math.sign(turn) !== st.turn) {
          // A flip back within 4 frames of the last flip is a wobble.
          if (st.flips.length && st.k - st.flips[st.flips.length - 1] <= 4) st.wobbles++;
          st.flips.push(st.k);
        }
        st.turn = Math.sign(turn);
      }
      st.pu = su; st.pv = sv;
      st.lastU = b.u[0]; st.lastV = b.v[0]; st.lastDir = b.dir;
      st.k++;
    },
  });
}

/**
 * How far (u) the point lies outside open tunnel: 0 in an open cell, else its distance to the
 * nearest open cell's edge (looked for within 0.6 u; farther counts as 0.6).
 */
export function strayOf(g: SoilGrid, u: number, v: number): number {
  const c0 = colOf(u);
  const r0 = rowOf(g, v);
  if (c0 >= 0 && c0 < GRID_W && r0 >= 0 && r0 < GRID_H && g.open[r0 * GRID_W + c0]) return 0;
  let best = 0.6;
  for (let r = r0 - 6; r <= r0 + 6; r++) {
    if (r < 0 || r >= GRID_H) continue;
    for (let c = c0 - 6; c <= c0 + 6; c++) {
      if (c < 0 || c >= GRID_W || !g.open[r * GRID_W + c]) continue;
      const du = Math.max(0, Math.abs(cellU(c) - u) - CELL / 2);
      const dv = Math.max(0, Math.abs(cellV(g, r) - v) - CELL / 2);
      best = Math.min(best, Math.hypot(du, dv));
    }
  }
  return best;
}

