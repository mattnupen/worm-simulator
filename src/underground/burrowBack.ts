import { BODY_RADIUS } from '../game/crawl';
import { boundaryOf, bound, B_TOP, type Slab } from './slab';
import type { Solids } from './solids';
import { pushOutFrom } from './solidPush';
import { TOP_KEEP, type UV } from './solidShapes';
import { cellAt, type SoilGrid } from './soilGrid';
import { followTail, settleBody, type BodyTrail } from './bodyTrail';

/**
 * Backing up (V2 spec 6: nightcrawlers crawl backward as well as forward, and pull back into their
 * burrows). The head cannot turn back past its own neck, so a head pushed into a dead end (a
 * crease between a rock's flank and the line under the leaves' top, or a slab end) could neither go
 * on nor turn round. Pointing back against the body while the head is stuck, the worm backs up:
 * the tail leads, back along the tunnel it came along, and the rest follows it. It keeps backing
 * while the stick points back, and stops at the tunnel's end (a worm's tail does not dig); then the
 * head is free to turn. Allocates nothing.
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
/**
 * The tail follows its tunnel round bends: it goes the first of these turns (radians off the body's
 * last segment) that keeps it in open tunnel (castings included) FEEL_BACK past where it steps.
 * None does: it is at the tunnel's end, and stays.
 */
const TAIL_TURNS = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9] as const;
const FEEL_BACK = 0.05;

const p: UV = { u: 0, v: 0 };
const from: UV = { u: 0, v: 0 };

/** Keeps a body point under the leaves' top and out of stones and roots, from where it was. */
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

/** The body backUp moves: its points now and at the last step (a Burrower). */
export interface BackBody {
  readonly u: Float64Array;
  readonly v: Float64Array;
  readonly prevU: Float64Array;
  readonly prevV: Float64Array;
  readonly trail: BodyTrail;
}

/**
 * Body points from..n-1 settled on their shape (bodyTrail.ts), each one that moved kept out of the
 * top and the solids from where it was. (The shape rounds the head's path off: where it grazes a
 * stone the head slid round, the point is pushed out and eases back as it moves on. Pushing the
 * shape itself out jumped wherever it grazed two blockers' crotch.) Moving on and backing up.
 */
export function settleOut(b: BackBody, s: Slab, o: Solids, from: number): void {
  const n = b.u.length;
  settleBody(b, from, n);
  for (let i = from; i < n; i++) if (b.u[i] !== b.prevU[i] || b.v[i] !== b.prevV[i]) keepOut(s, o, b.u, b.v, b.prevU, b.prevV, i);
}

/** backUp's step: how far the tail goes, the playable slab's ends and the bottom it keeps above. */
export interface BackLimits { step: number; lo: number; hi: number; bottom: number }

/**
 * One step backing up `lim.step` along its tunnel (from the body's last segment, round the tunnel's
 * bends), inside the playable slab (`lim.lo`..`lim.hi`, above `lim.bottom`). It digs nothing: the
 * body goes back through the tunnel it came along (and leaves its castings there), and at the
 * tunnel's end the tail stays put. The caller measures how far the tail moved (from prevU, prevV):
 * nothing here boxes a number (solidShapes.ts).
 */
export function backUp(s: Slab, o: Solids, g: SoilGrid, b: BackBody, lim: BackLimits): void {
  const { u, v, prevU, prevV } = b;
  const { step, lo, hi, bottom } = lim;
  const t = u.length - 1;
  b.trail.fromU = u[t];
  b.trail.fromV = v[t];
  const eu = u[t] - u[t - 1];
  const ev = v[t] - v[t - 1];
  const along = Math.atan2(ev, eu);
  for (let k = 0; k < TAIL_TURNS.length; k++) {
    const a = along + TAIL_TURNS[k];
    const cu = Math.cos(a);
    const cv = Math.sin(a);
    const i = cellAt(g, u[t] + cu * (step + FEEL_BACK), v[t] + cv * (step + FEEL_BACK));
    if (i < 0 || !g.open[i]) continue;
    u[t] = Math.max(lo, Math.min(hi, u[t] + cu * step));
    v[t] = Math.max(bottom, v[t] + cv * step);
    break;
  }
  keepOut(s, o, u, v, prevU, prevV, t);
  // The tail goes that far back along the way the head came while there is one, and the rest
  // follows it (bodyTrail.ts), each point at most SPACING ahead of the one behind it.
  followTail(b);
  settleOut(b, s, o, 0);
}
