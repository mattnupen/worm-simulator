import { BODY_RADIUS } from '../game/crawl';
import { boundaryOf, bound, B_TOP, type Slab } from './slab';
import type { Solids } from './solids';
import { pushOutFrom } from './solidPush';
import { TOP_KEEP, type UV } from './solidShapes';

/**
 * Backing up (V2 spec 6: nightcrawlers crawl backward as well as forward, and pull back into their
 * burrows). The head cannot turn back past its own neck, so a head pushed into a dead end (a
 * crease between a rock's flank and the line under the leaves' top, or a slab end) could neither go
 * on nor turn round. Pointing back against the body while the head is stuck, the worm backs up:
 * the head's arc moves back along the trail it came by and the body follows behind it
 * (bodyTrail.ts backAlong), so the tail goes first in the tunnel. It keeps backing while the stick
 * points back, and stops when the tail reaches the trail's start (a worm's tail does not dig); then
 * the head is free to turn. Allocates nothing.
 */

/**
 * The head is stuck once it has tried this long to move and got less than STUCK_SHARE of the way its
 * speed would have taken it from where it started trying (and under STUCK_REACH; a slow turn in
 * hard soil is not stuck)... Backing stops when the tail gets less than STUCK_SHARE of its way too.
 */
export const STUCK_S = 0.3;
export const STUCK_REACH = 0.03;
export const STUCK_SHARE = 0.2;
/** ...and only once its speed would have taken it this far (a head turning slowly from rest is not stuck). */
export const STUCK_TRIED = 0.1;
/** ...and backing starts when the stick points within about 37 degrees of straight back along the body (this far off the neck's way). */
export const BACK_ANGLE = 2.5;
/**
 * ...and once backing, it keeps on while the stick stays within about 60 degrees of straight back
 * (the neck's way swings as the body moves under the head: one threshold would flick it on and off).
 */
export const BACK_KEEP = 2.1;
/** Backing up is slow and steady: about half a crawl through its own tunnel. */
export const BACK_SPEED = 0.7;

const p: UV = { u: 0, v: 0 };
const from: UV = { u: 0, v: 0 };

/**
 * Keeps the head, digging forward, under the leaves' top and out of stones and roots, from where it
 * was. Backing, the head rides the trail as the body does and is not kept out: it may graze a
 * stone's margin by up to 0.025 u, as the body may (bodyTrail.ts).
 */
export function keepOut(s: Slab, o: Solids, u: Float64Array, v: Float64Array, prevU: Float64Array, prevV: Float64Array, i: number): void {
  p.u = u[i];
  boundaryOf(s, B_TOP, p);
  p.v = Math.min(bound.v - TOP_KEEP, v[i]);
  from.u = prevU[i];
  from.v = prevV[i];
  pushOutFrom(o, p, BODY_RADIUS, TOP_KEEP, from);
  u[i] = p.u;
  v[i] = p.v;
}
