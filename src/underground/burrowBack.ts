import { BODY_RADIUS } from '../game/crawl';
import { boundaryOf, bound, B_TOP, type Slab } from './slab';
import type { Solids } from './solids';
import type { Burrower } from './burrower';
import { pushOutFrom } from './solidPush';
import { blockerInto, found, TOP_KEEP, type SolidHit, type UV } from './solidShapes';

/**
 * Backing up (V2 spec 6: nightcrawlers crawl backward as well as forward, and pull back into their
 * burrows). The head cannot turn back past its own neck, so a head pushed into a dead end (a
 * crease between a rock's flank and the line under the leaves' top, or a slab end) could neither go
 * on nor turn round. Pointing back against the body while the head is stuck, the worm backs up:
 * the head's arc moves back along the trail it came by and the body follows behind it
 * (bodyTrail.ts backAlong), so the tail goes first in the tunnel. It keeps backing while the stick
 * points back, and stops when the tail reaches the trail's start (a worm's tail does not dig); then
 * the head is free to turn. Pointing across the body rather than back along it, it backs only until
 * the head has room to make the turn that way (roomToTurn). Allocates nothing, and no number
 * crosses a call here (the stick comes in `stickNow`).
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
/**
 * ...and backing starts when the stick points more than this far (radians, about 86 degrees) off the
 * neck's way: behind the worm, or square across it (V4 hot fix: held only within about 37 degrees of
 * straight back, a stuck worm often did nothing at all, say pressed into the crease under the top
 * by a stone while the player pointed down, or with the arrow keys' 45-degree steps)...
 */
export const BACK_ANGLE = 1.5;
/**
 * ...and once backing, it keeps on while the stick stays more than this far off the neck's way (the
 * neck's way swings as the body moves under the head: one threshold would flick it on and off)...
 */
export const BACK_KEEP = 1.2;
/**
 * ...but pointing less than this far off it (about 120 degrees: across the body more than back
 * along it), it backs only until the head has room to turn that way (roomToTurn), then turns.
 */
export const BACK_STRAIGHT = 2.1;
/** A spent backing re-arms when the stick turns this far (radians) from where it was, or is let go. */
export const SPENT_TURN = 0.5;
/** Stick input below this is no input. */
export const STICK_DEAD = 0.15;
/** The head's limits: this far inside the playable slab's ends, and above the slab's bottom (burrowMotion.ts). */
export const END_KEEP = 0.2;
export const BOTTOM_KEEP = 0.3;
/**
 * roomToTurn's test path: an arc of this radius (u: wider than the head's tightest free turn,
 * MIN_TURN_R) from the head round to the stick's way, then this far on, checked every PROBE_STEP
 * with the body's radius and PROBE_PAD to spare.
 */
const TURN_R = 0.45;
const PROBE_ON = 0.4;
const PROBE_STEP = 0.08;
const PROBE_PAD = 0.03;
/** The pad roomToTurn's points are checked with: a module constant, so no new number crosses the call. */
const PROBE_R = BODY_RADIUS + PROBE_PAD;
/** Backing up is slow and steady: about half a crawl through its own tunnel. */
export const BACK_SPEED = 0.7;

const p: UV = { u: 0, v: 0 };
const from: UV = { u: 0, v: 0 };

/**
 * Keeps the head, digging forward, under the leaves' top and out of stones and roots, from where it
 * was. Backing, the head rides the trail as the body does and is not kept out: it may graze a
 * stone's margin by up to about 0.017 u (measured 2026-10-08; the tests allow 0.025), as the body
 * may (bodyTrail.ts).
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

/** This step's stick for the rules below: its way (radians), its strength, and how far its way is off the neck's. */
export const stickNow = { way: 0.5, mag: 0.5, off: 0.5 };

const wrap = (a: number): number => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
/** The head has tried long and far enough while getting nowhere: stuck. */
const stuckNow = (b: Burrower): boolean => b.stuck >= STUCK_S && b.tried >= STUCK_TRIED;

/**
 * Whether the worm backs up this step (sets `b.backing`): pointing behind or across it once stuck,
 * and on while the stick stays off the neck's way. Once a backing has ended it does not start again
 * until the stick is let go or turned SPENT_TURN (the neck's way swings as the body goes round its
 * tunnel's bends: held still, the stick came to point back, and not, by turns, and the worm backed
 * up in fits and starts), or, when it ended with room to turn, until the head is stuck again.
 */
export function decideBacking(b: Burrower): void {
  const mag = stickNow.mag;
  const back = mag > STICK_DEAD && stickNow.off > (b.backing ? BACK_KEEP : BACK_ANGLE);
  const was = b.backing;
  if (b.backSpent && (mag <= STICK_DEAD || Math.abs(wrap(stickNow.way - b.spentWay)) > SPENT_TURN || (b.spentFree && stuckNow(b)))) {
    b.backSpent = false;
  }
  b.backing = back && !b.backSpent && (was || stuckNow(b));
  if (was && !b.backing && !b.backSpent) spendBacking(b, false);
}

/**
 * Backing ends and is spent (`free`: the head has room to turn the way pointed). The stuck clock
 * starts again from here, so only a fresh stick re-arms it.
 */
export function spendBacking(b: Burrower, free: boolean): void {
  b.backing = false;
  b.backSpent = true;
  b.spentFree = free;
  // With room to turn, it turns no tighter than it may when free (the turn roomToTurn checked).
  if (free) b.free = 1;
  b.spentWay = stickNow.way;
  b.stuck = b.tried = 0;
  b.stuckU = b.u[0];
  b.stuckV = b.v[0];
}

const q: UV = { u: 0.5, v: 0.5 };
const qHit: SolidHit = { nu: 0.5, nv: 0.5 };

/** Whether the head could be at `q`: inside its limits, under the top, clear of stones and roots. */
function clearAt(s: Slab, o: Solids): boolean {
  if (q.u < s.playLo + END_KEEP || q.u > s.playHi - END_KEEP || q.v < s.bottom + BOTTOM_KEEP) return false;
  boundaryOf(s, B_TOP, q);
  if (q.v > bound.v - TOP_KEEP) return false;
  blockerInto(o, q, PROBE_R, o.capCount, qHit);
  return found.into <= 0;
}

/**
 * Whether the head, going forward from where it is, could turn round to the stick's way and on
 * (an arc of TURN_R, then PROBE_ON straight) clear of the slab's limits, the top, stones and roots.
 */
export function roomToTurn(b: Burrower, s: Slab, o: Solids): boolean {
  const u0 = b.u[0];
  const v0 = b.v[0];
  const a0 = b.dir;
  const turn = wrap(stickNow.way - a0);
  const rho = turn >= 0 ? 1 : -1;
  const arc = TURN_R * Math.abs(turn);
  const n = Math.ceil((arc + PROBE_ON) / PROBE_STEP);
  const eu = u0 + TURN_R * rho * (Math.sin(a0 + turn) - Math.sin(a0));
  const ev = v0 - TURN_R * rho * (Math.cos(a0 + turn) - Math.cos(a0));
  for (let k = 1; k <= n; k++) {
    const d = (k * (arc + PROBE_ON)) / n;
    if (d <= arc) {
      const a = a0 + (rho * d) / TURN_R;
      q.u = u0 + TURN_R * rho * (Math.sin(a) - Math.sin(a0));
      q.v = v0 - TURN_R * rho * (Math.cos(a) - Math.cos(a0));
    } else {
      q.u = eu + (d - arc) * Math.cos(stickNow.way);
      q.v = ev + (d - arc) * Math.sin(stickNow.way);
    }
    if (!clearAt(s, o)) return false;
  }
  return true;
}
