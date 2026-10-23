import { boundaryOf, bound, B_F, type Slab } from './slab';
import type { Burrower } from './burrower';

/**
 * Where the head is against the top of the soil (V4 hot fix: "if worm is at the top, then space bar
 * allows them to exit"). Two lines, both measured straight above or below the head:
 *
 * - `atTop`, the player's rule: the head is in the leaf litter band, or within AT_TOP_IN (about
 *   2 cm, a seventh of the worm) under it. There Action always means Come up (burrowGame.ts):
 *   straight up where the body can lie out on the floor, or else the worm first crawls over, under
 *   the leaves, to the nearest place where it can (burrowOut.ts). Deeper, Action switches the view.
 *   (Not the whole old-leaves band: a fresh dig-down ends about 0.85 under the litter, and Action
 *   there must still switch the view, as the first visit's hint says.)
 * - `nearTop`, where the climb out itself starts (emergePath.ts plans from there): the head within
 *   NEAR_TOP_IN of the litter's bottom (the F top).
 *
 * Each has a little hysteresis (and nearTop always lies inside atTop), so the prompt does not flicker at the line. Allocates nothing.
 */
/** The head is "near the top" within this of the F top... */
export const NEAR_TOP_IN = 0.2;
/** ...and stops being near it below this. */
export const NEAR_TOP_OUT = 0.35;
/** The head is "at the top" within this of the F top (2.5 times NEAR_TOP_IN)... */
export const AT_TOP_IN = 0.5;
/** ...and stops being at it below this. */
export const AT_TOP_OUT = 0.65;

const pt = { u: 0, v: 0 };

/** Sets `b.nearTop` and `b.atTop` from where the head is now. */
export function markTop(b: Burrower, s: Slab): void {
  pt.u = b.u[0];
  boundaryOf(s, B_F, pt);
  b.nearTop = b.v[0] >= bound.v - (b.nearTop ? NEAR_TOP_OUT : NEAR_TOP_IN);
  b.atTop = b.v[0] >= bound.v - (b.atTop ? AT_TOP_OUT : AT_TOP_IN);
}
