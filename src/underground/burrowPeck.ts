import { B_F, B_TOP, bound, boundaryOf, type UV } from './slab';
import { digDiscAt, type Eaten } from './soilGrid';
import { TUNNEL_R } from './burrowMotion';
import type { MoveState } from './burrowMoves';

/**
 * The robin digging down to a worm underground, seen in the side view (V4 revision 4): first it
 * scratches the leaf litter away above the head (down to the old leaves), then it probes down with
 * its bill to the head, so the hole opens bit by bit before the grab (burrowGrab.ts holdFromBelow
 * then pulls the worm up it). Allocates nothing.
 */

/** The scrape and the probe hole are this wide (a bill's width or so, narrower than a tunnel). */
const PECK_R = TUNNEL_R * 0.8;
/** A disc every this far down. */
const STEP = 0.1;

// Fields start as fractions: a field that first held a whole number had V8 box every fraction written later.
const pt: UV = { u: 0.5, v: 0.5 };
const ate: Eaten = { cells: 0.5, organic: 0.5 };

export interface Peck {
  /** Where along the cut (the hole over the head), and how deep it is dug so far (below the litter's top). */
  u: number;
  dug: number;
}

export function createPeck(): Peck {
  return { u: 0.5, dug: 0.5 };
}

/** A new hole at `u` (the head moved off the last one, or a new robin). */
export function startPeck(p: Peck, u: number): void {
  p.u = u;
  p.dug = 0;
}

/**
 * Digs the hole on to its depth now: `scratch` 0..1 of the way through the leaf litter, then
 * `probe` 0..1 of the rest of the way down to the head's height `headV`.
 */
export function digPeck(g: MoveState, p: Peck, scratch: number, probe: number, headV: number): void {
  const s = g.slab;
  if (!s) return;
  pt.u = p.u;
  boundaryOf(s, B_TOP, pt);
  const top = bound.v;
  boundaryOf(s, B_F, pt);
  const litter = Math.max(0, top - bound.v);
  const head = Math.max(litter, top - headV);
  const want = litter * scratch + (head - litter) * probe;
  for (let d = p.dug + STEP; d <= want + 1e-6; d += STEP) {
    pt.u = p.u;
    pt.v = top - d;
    digDiscAt(g.grid, pt, PECK_R, ate);
    p.dug = d;
  }
}
