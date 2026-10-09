import { SPACING, WORM_SEGMENTS } from '../game/crawl';
import { hypot2 } from '../core/vec';

/**
 * The burrowing body rides its head's trail (V2 emergency fix, spec 2026-10-08 section 3): a chain
 * on a rail. The trail is the head's path drawn through a pursuit point that follows the head at
 * most TRAIL_LAG behind (a tractrix): a sharp corner or a slide along a stone comes out rounded to
 * about TRAIL_LAG. Every trail point lies within TRAIL_LAG of where the head then was, inside the
 * TUNNEL_R disc it dug there, so the trail is always in open tunnel. While the head turns or
 * jitters within TRAIL_LAG of the pursuit point, no trail is added. A true reversal (the head going
 * straight back along its own line) retraces the trail, and the body doubles over on it: still on
 * the path, and nothing pops.
 *
 * Each body point lies on the trail its link's length of arc behind the point ahead, so the body
 * slides along its tunnel and nothing pops: placing points by chord (the first point a link's
 * length away) jumped up to 0.4 u in a step on a hairpin whose legs were closer than a link. The
 * body keeps its length because no point is averaged and no trail is added while the head turns in
 * place (an earlier arc-length body that did both shrank to 58%). Across a bend a link's chord is
 * shorter than its arc, as the tunnel is. The head, off the trail, counts as its distance from the
 * pursuit point past the trail's end, so the neck's chord is never longer than its link; turning
 * in place shortens it (by about 2.5 times the radius the head turns on).
 *
 * Backing, the head's arc moves back and the body follows behind it along the trail, so the tail
 * goes first in the tunnel, stopping at the trail's start. The head then rides the trail too: on a
 * corner rounded round a stone it may graze the stone's margin, as the body does, by up to about
 * 0.02 u (measured 2026-10-08). Pure; allocates nothing, and no fractional number crosses a call
 * that V8 might not inline (the helpers read and write the scratch objects `pt` and `pose`).
 */
const N = WORM_SEGMENTS;
/** A new trail point is begun once the live one is this far (u) past the point before it. */
export const TRAIL_STEP = 0.02;
/** The pursuit point follows the head at most this far (u) behind: under TUNNEL_R (0.14). */
export const TRAIL_LAG = 0.1;
/** Most trail points kept (about 160 u of path); when full the oldest half is dropped. */
export const TRAIL_CAP = 8192;
/** Seeded links ease to SPACING at this share per unit (u) the head moves... */
const LEN_EASE = 2;
/**
 * ...but the body grows by at most this share of the head's move: short seeded links grew faster
 * than the head moved, and the tail slid back along the trail.
 */
const GROW_MOST = 0.5;

/** The body the trail poses: points head first, now and at the last step. */
export interface TrailBody {
  readonly u: Float64Array;
  readonly v: Float64Array;
  readonly prevU: Float64Array;
  readonly prevV: Float64Array;
}

export interface BodyTrail {
  /** Trail points, oldest first; point n - 1 is the live pursuit point (the pinned head while backed). */
  readonly u: Float64Array;
  readonly v: Float64Array;
  /** Arc length (u) from point 0. */
  readonly arc: Float64Array;
  n: number;
  /**
   * Each body point's place on the trail (k + f: on segment k..k+1 at f), where the next search
   * for it starts. The head's only while backed (moving forward, it is just past the trail's end).
   */
  readonly at: Float64Array;
  /** len[i]: the link from body point i - 1 to point i (i >= 1), as arc length (u) along the trail. */
  readonly len: Float64Array;
  /** The head has backed along the trail since it last moved forward (its place is at[0]). */
  backed: boolean;
}

/** An empty trail: seed it (seedTrail) before poseBehind or backAlong. */
export function createTrail(): BodyTrail {
  return {
    u: new Float64Array(TRAIL_CAP), v: new Float64Array(TRAIL_CAP), arc: new Float64Array(TRAIL_CAP), n: 0,
    at: new Float64Array(N), len: new Float64Array(N).fill(SPACING), backed: false,
  };
}

/**
 * A point on the trail: its place s, arc length a and (u, v), passed in and out of the helpers
 * below. The fields start as fractions: a field that first held a whole number had V8 box every
 * fractional value written to it later (burrower.ts).
 */
const pt = { u: 0.5, v: 0.5, s: 0.5, a: 0.5 };

/** The point at place pt.s, into pt.u, pt.v. */
function pointAt(t: BodyTrail): void {
  const k = Math.min(t.n - 1, Math.floor(pt.s));
  const f = pt.s - k;
  if (f <= 0 || k >= t.n - 1) {
    pt.u = t.u[k];
    pt.v = t.v[k];
    return;
  }
  pt.u = t.u[k] + (t.u[k + 1] - t.u[k]) * f;
  pt.v = t.v[k] + (t.v[k + 1] - t.v[k]) * f;
}

/** The arc length at place pt.s, into pt.a. */
function arcAt(t: BodyTrail): void {
  const k = Math.min(t.n - 2, Math.floor(pt.s));
  pt.a = t.arc[k] + (t.arc[k + 1] - t.arc[k]) * (pt.s - k);
}

/**
 * The place at arc length pt.a (within the trail), into pt.s and its point into pt.u, pt.v. The
 * search starts at place pt.s, the point's place last step, so it walks a segment or two.
 */
function placeOf(t: BodyTrail): void {
  const a = pt.a;
  let k = Math.max(0, Math.min(t.n - 2, Math.floor(pt.s)));
  while (k > 0 && t.arc[k] > a) k--;
  while (k < t.n - 2 && t.arc[k + 1] < a) k++;
  const l = t.arc[k + 1] - t.arc[k];
  const f = l > 1e-12 ? Math.max(0, Math.min(1, (a - t.arc[k]) / l)) : 0;
  pt.s = k + f;
  pt.u = t.u[k] + (t.u[k + 1] - t.u[k]) * f;
  pt.v = t.v[k] + (t.v[k + 1] - t.v[k]) * f;
}

function setArc(t: BodyTrail, k: number): void {
  if (k === 0) {
    t.arc[0] = 0;
    return;
  }
  // Math.sqrt, not hypot2 (as in followHead): it runs every step.
  const du = t.u[k] - t.u[k - 1];
  const dv = t.v[k] - t.v[k - 1];
  t.arc[k] = t.arc[k - 1] + Math.sqrt(du * du + dv * dv);
}

/** Appends (pt.u, pt.v) as the new last point, dropping the oldest half first when full. */
function push(t: BodyTrail): void {
  if (t.n === TRAIL_CAP) dropHalf(t);
  const k = t.n++;
  t.u[k] = pt.u;
  t.v[k] = pt.v;
  setArc(t, k);
}

/** Drops the oldest half (the body needs only its last 3.3 u; backing rarely more). */
function dropHalf(t: BodyTrail): void {
  const h = t.n >> 1;
  t.u.copyWithin(0, h, t.n);
  t.v.copyWithin(0, h, t.n);
  t.arc.copyWithin(0, h, t.n);
  t.n -= h;
  const a0 = t.arc[0];
  for (let k = 0; k < t.n; k++) t.arc[k] -= a0;
  for (let i = 0; i < N; i++) t.at[i] = Math.max(0, t.at[i] - h);
}

/**
 * A fresh trail through the body's points, tail first, with a live point at the head; the links
 * keep their lengths (eased to SPACING as the worm moves: nothing pops).
 */
export function seedTrail(t: BodyTrail, b: Pick<TrailBody, 'u' | 'v'>): void {
  t.n = 0;
  for (let i = N - 1; i >= 0; i--) {
    pt.u = b.u[i];
    pt.v = b.v[i];
    push(t);
    t.at[i] = N - 1 - i;
  }
  // The head's own point stays where it was seeded; this copy is the live point that pursues it.
  push(t);
  for (let i = 1; i < N; i++) t.len[i] = Math.max(1e-3, hypot2(b.u[i] - b.u[i - 1], b.v[i] - b.v[i - 1]));
  t.backed = false;
}

/**
 * After the head moved forward: if it had backed, the trail is cut at its place (the old branch
 * stays in the soil, not in the record); the pursuit point is drawn to within TRAIL_LAG of the
 * head and committed every TRAIL_STEP; the links ease toward SPACING. It commits at most one point
 * a step: when the head jumps further, the live segment is longer than TRAIL_STEP, a straight
 * chord of the head's path, which is fine.
 */
export function followHead(t: BodyTrail, b: TrailBody): void {
  if (t.backed) {
    // Keep points 0..floor(at[0]), then the head's place itself as the new live point.
    pt.s = t.at[0];
    pointAt(t);
    t.n = Math.floor(t.at[0]) + 1;
    push(t);
    t.backed = false;
  }
  const k = t.n - 1;
  const du = b.u[0] - t.u[k];
  const dv = b.v[0] - t.v[k];
  // Math.sqrt, not hypot2, in this and poseBehind: V8 did not inline hypot2 into them and boxed
  // its result, 48 bytes a step (stepAllocation.test.ts). The lengths here are small and finite.
  const d = Math.sqrt(du * du + dv * dv);
  if (d > TRAIL_LAG) {
    t.u[k] += (du * (d - TRAIL_LAG)) / d;
    t.v[k] += (dv * (d - TRAIL_LAG)) / d;
    setArc(t, k);
  }
  if (k > 0 && t.arc[k] - t.arc[k - 1] >= TRAIL_STEP) {
    pt.u = t.u[k];
    pt.v = t.v[k];
    push(t);
  }
  const mu = b.u[0] - b.prevU[0];
  const mv = b.v[0] - b.prevV[0];
  const moved = Math.sqrt(mu * mu + mv * mv);
  let e = Math.min(1, moved * LEN_EASE);
  let grow = 0;
  for (let i = 1; i < N; i++) grow += (SPACING - t.len[i]) * e;
  if (grow > GROW_MOST * moved) e *= (GROW_MOST * moved) / grow;
  for (let i = 1; i < N; i++) t.len[i] += (SPACING - t.len[i]) * e;
}

/** The head's arc length (`a`), and its distance (u) past the live point while moving forward (`d`). */
const pose = { a: 0.5, d: 0.5 };

/**
 * Points 1..15, each its link's arc length behind the one ahead, from the head at pose.a (never
 * before the trail's start). Moving forward the head is just past the live point, on the straight
 * on to it: a point that falls there (only one whose links are shorter than TRAIL_LAG) lies on it.
 */
function placeBehind(t: BodyTrail, b: TrailBody): void {
  const k = t.n - 1;
  const end = t.arc[k];
  let a = pose.a;
  for (let i = 1; i < N; i++) {
    a -= t.len[i];
    if (a < 0) a = 0;
    if (a > end) {
      const f = (a - end) / pose.d;
      b.u[i] = t.u[k] + (b.u[0] - t.u[k]) * f;
      b.v[i] = t.v[k] + (b.v[0] - t.v[k]) * f;
      t.at[i] = k;
    } else {
      pt.a = a;
      pt.s = t.at[i];
      placeOf(t);
      b.u[i] = pt.u;
      b.v[i] = pt.v;
      t.at[i] = pt.s;
    }
  }
}

/** Points 1..15 placed back along the trail from the head, which is just past the live point. */
export function poseBehind(t: BodyTrail, b: TrailBody): void {
  const k = t.n - 1;
  const du = b.u[0] - t.u[k];
  const dv = b.v[0] - t.v[k];
  const d = Math.sqrt(du * du + dv * dv);
  pose.a = t.arc[k] + d;
  pose.d = d;
  placeBehind(t, b);
}

/**
 * One step backing `step.step` (u). The first step pins the head as the trail's end, so nothing
 * jumps; each step then moves the head that far back along the trail, but never so far that the
 * tail would pass the trail's start (the tunnel's end: a worm's tail does not dig), and places the
 * rest behind it.
 */
export function backAlong(t: BodyTrail, b: TrailBody, step: { step: number }): void {
  if (!t.backed) {
    pt.u = b.u[0];
    pt.v = b.v[0];
    push(t);
    t.at[0] = t.n - 1;
    t.backed = true;
  }
  pt.s = t.at[0];
  arcAt(t);
  let body = 0;
  for (let i = 1; i < N; i++) body += t.len[i];
  let a = pt.a - step.step;
  if (a < body) a = Math.min(pt.a, body);
  pt.a = a;
  placeOf(t);
  b.u[0] = pt.u;
  b.v[0] = pt.v;
  t.at[0] = pt.s;
  // The head is on the trail now, so no point falls past its end (pose.d is not used).
  pose.a = a;
  placeBehind(t, b);
}
