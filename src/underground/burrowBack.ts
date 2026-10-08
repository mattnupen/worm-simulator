import { BODY_RADIUS, SPACING } from '../game/crawl';
import { boundaryOf, bound, B_TOP, type Slab } from './slab';
import type { Solids } from './solids';
import { pushOutFrom } from './solidPush';
import { TOP_KEEP, type UV } from './solidShapes';
import { hypot2 } from '../core/vec';

/**
 * Backing up (V2 spec 6: nightcrawlers crawl backward as well as forward, and pull back into their
 * burrows). The head cannot turn back past its own neck, so a head pushed into a dead end (a
 * crease between a rock's flank and the line under the leaves' top, or a slab end) could neither go
 * on nor turn round. Pointing back against the body while the head is stuck, the worm backs up:
 * the tail leads, back along the body's own line (the tunnel it came along), and the rest follows
 * it. It keeps backing while the stick points back; then the head is free to turn. Allocates nothing.
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
/** Backing up is slow and steady: about half a crawl through its own tunnel. */
export const BACK_SPEED = 0.7;

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
}

/** backUp's step: how far the tail goes, the playable slab's ends and the bottom it keeps above. */
export interface BackLimits { step: number; lo: number; hi: number; bottom: number }

/**
 * One step backing up `lim.step` along the body's own line, inside the playable slab (`lim.lo`..
 * `lim.hi`, above `lim.bottom`). It digs nothing: the body goes back through the tunnel it came
 * along (and leaves its castings there). The caller measures how far the tail moved (from prevU,
 * prevV): nothing here boxes a number (solidShapes.ts).
 */
export function backUp(s: Slab, o: Solids, b: BackBody, lim: BackLimits): void {
  const { u, v, prevU, prevV } = b;
  const { step, lo, hi, bottom } = lim;
  const t = u.length - 1;
  let eu = u[t] - u[t - 1];
  let ev = v[t] - v[t - 1];
  const el = hypot2(eu, ev) || 1;
  eu /= el;
  ev /= el;
  u[t] = Math.max(lo, Math.min(hi, u[t] + eu * step));
  v[t] = Math.max(bottom, v[t] + ev * step);
  keepOut(s, o, u, v, prevU, prevV, t);
  // The rest follows the tail, each point at most SPACING behind the one after it.
  for (let i = t - 1; i >= 0; i--) {
    const du = u[i] - u[i + 1];
    const dv = v[i] - v[i + 1];
    const d = hypot2(du, dv);
    if (d > SPACING) {
      u[i] = u[i + 1] + (du * SPACING) / d;
      v[i] = v[i + 1] + (dv * SPACING) / d;
      keepOut(s, o, u, v, prevU, prevV, i);
    }
  }
}
