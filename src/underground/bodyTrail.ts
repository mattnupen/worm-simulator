import { hypot2 } from '../core/vec';
import { SPACING } from '../game/crawl';

/**
 * The way the burrower's body follows its head (V2 spec 6): through the tunnel the head dug, not
 * cutting its corners. The trail is the head's own path, newest first, with each point's place
 * along it (arc length, largest at the head); every body point has its place on the trail, and
 * moves along it like a rope: it stays put until the point ahead is more than SPACING ahead along
 * the trail, then follows it there. So the body lies in the head's tunnel, however tight the turn
 * (follow-the-leader cut each bend's inside, about 0.15 u on a gentle curve, and the body's dig
 * made the tunnel half again as wide). Backing up runs the same rope from the tail (burrowBack.ts).
 * Typed arrays only: allocates nothing per step, and passes no fractional number to a call (a
 * number passed to a call V8 does not inline is boxed on the heap: solidShapes.ts).
 */

/**
 * The head's newest point stays on the trail once it is this far past the last. Until then it moves
 * with the head, so a head pressed into a stone and jiggling there adds nothing to the trail's
 * length (with a point every step the jiggles added up, pulled the neck onto the head and wobbled
 * its facing).
 */
const TRAIL_STEP = 0.02;
/** Points on the trail at most (a ring): about 10 u of path at TRAIL_STEP, three body lengths. */
const CAP = 512;
/**
 * A body point the caller pushed off the trail (out of a stone, or under the leaves' top) moves as
 * its place on the trail moves, and back toward the trail by at most this share of that move: it
 * never jumps back (a point pushed out of a stone would flick to the stone's far side), and a point
 * at rest stays put.
 */
const CATCH = 0.2;
/**
 * Each body point but the head and neck lies at the trail's average over this far either side of
 * its place (weighted 1 2 3 2 1 over five samples): a kink in the head's path, where a stone or root
 * pushed it or it turned on the spot, is softened instead of folding the worm there, while an
 * ordinary bend is followed within about 0.01 u (the body stays in the tunnel). The neck stays on
 * the trail: the head's facing is held to it, and a smoothed neck wobbled it against the top. At
 * most half the gap to the next point less a little, so each step's samples run head to tail.
 */
const SMOOTH = 0.1;
const TAPS = [1, 0.5, 0, -0.5, -1] as const;
const TAP_W = [1 / 9, 2 / 9, 3 / 9, 2 / 9, 1 / 9] as const;

export interface BodyTrail {
  readonly u: Float64Array;
  readonly v: Float64Array;
  /** Each trail point's place along the trail (decreasing from the newest). */
  readonly s: Float64Array;
  /** Ring index of the newest point (the head, as last placed), and how many points there are. */
  front: number;
  count: number;
  /** Each body point's place along the trail, head first, and where that place is (onU, onV). */
  readonly at: Float64Array;
  readonly onU: Float64Array;
  readonly onV: Float64Array;
  /** The tail's place before it moved back (followTail). */
  fromU: number;
  fromV: number;
  /** A lookup's answer (scratch). */
  pu: number;
  pv: number;
}

/** The body a trail moves: its points (head first), as a Burrower holds them. */
export interface TrailBody {
  readonly u: Float64Array;
  readonly v: Float64Array;
  readonly trail: BodyTrail;
}

export function createTrail(n: number): BodyTrail {
  return {
    u: new Float64Array(CAP), v: new Float64Array(CAP), s: new Float64Array(CAP), front: 0, count: 0,
    at: new Float64Array(n), onU: new Float64Array(n), onV: new Float64Array(n), fromU: 0, fromV: 0, pu: 0, pv: 0,
  };
}

/** Ring index of the k-th newest point. */
const ix = (t: BodyTrail, k: number): number => (t.front + k) % CAP;

/** The trail is the body as it lies (head first): its points, spaced as they are. */
export function resetTrail(b: TrailBody): void {
  const t = b.trail;
  const n = b.u.length;
  t.front = 0;
  t.count = n;
  for (let k = 0; k < n; k++) {
    t.u[k] = t.onU[k] = b.u[k];
    t.v[k] = t.onV[k] = b.v[k];
    t.s[k] = k === 0 ? 0 : t.s[k - 1] - hypot2(b.u[k] - b.u[k - 1], b.v[k] - b.v[k - 1]);
    t.at[k] = t.s[k];
  }
}

/** Where the trail is at place `a` (into t.pu, t.pv), searching from the k-th newest point on; returns where it found it. */
function lookup(t: BodyTrail, a: number, k: number): number {
  while (k < t.count - 2 && t.s[ix(t, k + 1)] > a) k++;
  const j0 = ix(t, k);
  const j1 = ix(t, k + 1);
  const span = t.s[j0] - t.s[j1];
  const f = span > 1e-12 ? Math.min(1, Math.max(0, (t.s[j0] - a) / span)) : 0;
  t.pu = t.u[j0] + (t.u[j1] - t.u[j0]) * f;
  t.pv = t.v[j0] + (t.v[j1] - t.v[j0]) * f;
  return k;
}

/**
 * Body point i to its place on the trail (`t.at[i]`; smoothed but at the head and neck), searching from the
 * k-th newest point on; returns where it found the last sample. The point moves as its place moved
 * (and a little toward it: CATCH).
 */
function place(b: TrailBody, i: number, k: number): number {
  const t = b.trail;
  let pu = 0;
  let pv = 0;
  if (i < 2) {
    k = lookup(t, t.at[i], k);
    pu = t.pu;
    pv = t.pv;
  } else {
    for (let q = 0; q < TAPS.length; q++) {
      k = lookup(t, t.at[i] + TAPS[q] * SMOOTH, k);
      pu += t.pu * TAP_W[q];
      pv += t.pv * TAP_W[q];
    }
  }
  const mu = pu - t.onU[i];
  const mv = pv - t.onV[i];
  t.onU[i] = pu;
  t.onV[i] = pv;
  const cu = b.u[i] + mu;
  const cv = b.v[i] + mv;
  const eu = pu - cu;
  const ev = pv - cv;
  const off = hypot2(eu, ev);
  const most = CATCH * hypot2(mu, mv);
  const g = off > most ? most / off : 1;
  b.u[i] = cu + eu * g;
  b.v[i] = cv + ev * g;
  return k;
}

/** Drops the oldest points the tail no longer needs (one at or behind `margin` past it is kept). */
function trimBack(t: BodyTrail, n: number, margin: number): void {
  while (t.count > 2 && t.s[ix(t, t.count - 2)] <= t.at[n - 1] - margin) t.count--;
}

/**
 * After the head moved (b.u[0], b.v[0]): the trail grows with it, and the rest of the body follows
 * along the trail, each point at most SPACING behind the one ahead.
 */
export function followHead(b: TrailBody): void {
  const t = b.trail;
  const n = b.u.length;
  // The newest point keeps up with the head, and stays on the trail once TRAIL_STEP past the last.
  let j = t.front;
  let j1 = ix(t, 1);
  if (t.count < CAP && hypot2(t.u[j] - t.u[j1], t.v[j] - t.v[j1]) >= TRAIL_STEP) {
    t.front = (t.front + CAP - 1) % CAP;
    t.count++;
    j1 = j;
    j = t.front;
  }
  t.u[j] = t.onU[0] = b.u[0];
  t.v[j] = t.onV[0] = b.v[0];
  t.s[j] = t.s[j1] + hypot2(b.u[0] - t.u[j1], b.v[0] - t.v[j1]);
  t.at[0] = t.s[j];
  let k = 0;
  for (let i = 1; i < n; i++) {
    t.at[i] = Math.min(t.at[i - 1], Math.max(t.at[i], t.at[i - 1] - SPACING));
    k = place(b, i, k);
  }
  trimBack(t, n, SMOOTH);
}

/**
 * After the tail moved back (backing up) from (t.fromU, t.fromV) to b.u[n-1], b.v[n-1]: the trail
 * grows behind it, the rest of the body follows back along the trail, each point at most SPACING
 * ahead of the one behind, and the trail ahead of the head (where it no longer is) is dropped.
 */
export function followTail(b: TrailBody): void {
  const t = b.trail;
  const n = b.u.length;
  // The tail's old place becomes the trail's oldest point, then its new place goes behind it.
  trimBack(t, n, 0);
  let j = ix(t, t.count - 1);
  t.u[j] = t.fromU;
  t.v[j] = t.fromV;
  t.s[j] = t.at[n - 1];
  const d = hypot2(b.u[n - 1] - t.fromU, b.v[n - 1] - t.fromV);
  if (d > 0) {
    if (t.count < CAP) t.count++;
    j = ix(t, t.count - 1);
    t.u[j] = t.onU[n - 1] = b.u[n - 1];
    t.v[j] = t.onV[n - 1] = b.v[n - 1];
    t.s[j] = t.at[n - 1] - d;
    t.at[n - 1] -= d;
  }
  for (let i = n - 2; i >= 0; i--) t.at[i] = Math.max(t.at[i + 1], Math.min(t.at[i], t.at[i + 1] + SPACING));
  // The head's place is now the trail's newest: drop what lies ahead of it.
  while (t.count > 2 && t.s[ix(t, 1)] >= t.at[0]) {
    t.front = ix(t, 1);
    t.count--;
  }
  let k = 0;
  for (let i = 0; i < n - 1; i++) k = place(b, i, k);
  t.u[t.front] = t.onU[0];
  t.v[t.front] = t.onV[0];
  t.s[t.front] = t.at[0];
}
