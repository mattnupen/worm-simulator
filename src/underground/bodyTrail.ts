import { SPACING, WORM_SEGMENTS } from '../game/crawl';
import { hypot2 } from '../core/vec';

/**
 * The burrowing body rides its head's trail (V2 emergency fix, spec 2026-10-08 section 3): a chain
 * on a rail. The trail is the head's path drawn through a pursuit point that follows the head at
 * most TRAIL_LAG behind (a tractrix: sharp corners, a turn on the spot or a slide along a stone,
 * come out rounded to about TRAIL_LAG). Every trail point lies within TRAIL_LAG of where the head
 * then was, inside the TUNNEL_R disc it dug there, so the trail is always in open tunnel. Each body
 * point lies on the trail at exactly its link's length (a chord) from the point ahead: the links
 * never stretch or shrink (5ede96b put points at arc length and averaged them: the body shrank to
 * 58% where the trail folded). Backing, the tail leads back along the trail and the rest is placed
 * forward from the point behind. Pure; allocates nothing, and no number crosses a call that V8
 * might not inline (the helpers read and write the scratch objects `pt`, `lead` and `hit`).
 */
const N = WORM_SEGMENTS;
/** A new trail point is begun once the live one is this far (u) past the point before it. */
export const TRAIL_STEP = 0.02;
/** The pursuit point follows the head at most this far (u) behind: under TUNNEL_R (0.14). */
export const TRAIL_LAG = 0.1;
/** Most trail points kept (about 160 u of path); when full the oldest half is dropped. */
export const TRAIL_CAP = 8192;
/** Seeded links ease to SPACING at this share per unit (u) the head moves. */
const LEN_EASE = 2;

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
  /** Each body point's place on the trail (k + f: on segment k..k+1 at f). The head's only while backed. */
  readonly at: Float64Array;
  /** len[i]: the link (u) from body point i - 1 to point i (i >= 1). */
  readonly len: Float64Array;
  /** The head has backed along the trail since it last moved forward (its place is at[0]). */
  backed: boolean;
}

export function createTrail(): BodyTrail {
  return {
    u: new Float64Array(TRAIL_CAP), v: new Float64Array(TRAIL_CAP), arc: new Float64Array(TRAIL_CAP), n: 0,
    at: new Float64Array(N), len: new Float64Array(N).fill(SPACING), backed: false,
  };
}

/** A point on the trail: place `s` in, (u, v) out (pointAt), or (u, v) in (push). */
const pt = { u: 0, v: 0, s: 0 };

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

function setArc(t: BodyTrail, k: number): void {
  t.arc[k] = k === 0 ? 0 : t.arc[k - 1] + hypot2(t.u[k] - t.u[k - 1], t.v[k] - t.v[k - 1]);
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
 * head and committed every TRAIL_STEP; the links ease toward SPACING.
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
  const d = hypot2(du, dv);
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
  const moved = hypot2(b.u[0] - b.prevU[0], b.v[0] - b.prevV[0]);
  const e = Math.min(1, moved * LEN_EASE);
  for (let i = 1; i < N; i++) t.len[i] += (SPACING - t.len[i]) * e;
}

/** A walk's lead: the point (u, v) it measures from, the place `s` it starts at, the link `len`. */
const lead = { u: 0, v: 0, s: 0, len: 0 };
/** Where a walk puts a point: (u, v) and its place s. */
const hit = { u: 0, v: 0, s: 0 };

/**
 * From place lead.s along the trail toward `dir` (-1 back, +1 forward), the first place exactly
 * lead.len from the lead (lead.u, lead.v), into `hit`; the trail's end when it gives out first.
 * The start is nearer the lead than lead.len (it is the lead's own place, or for body point 1 the
 * live end, within TRAIL_LAG of the head), so the crossing is where the trail first leaves the
 * lead's circle: on the first segment whose far end is on or outside it.
 */
function walk(t: BodyTrail, dir: number): void {
  pt.s = lead.s;
  pointAt(t);
  let cu = pt.u;
  let cv = pt.v;
  let cs = lead.s;
  let mu = cu - lead.u;
  let mv = cv - lead.v;
  const L2 = lead.len * lead.len;
  if (mu * mu + mv * mv >= L2) {
    // Not expected (only a seeded link shorter than TRAIL_LAG could do it): toward the start, off the trail.
    const d = hypot2(mu, mv);
    hit.u = lead.u + (mu * lead.len) / d;
    hit.v = lead.v + (mv * lead.len) / d;
    hit.s = cs;
    return;
  }
  // The first vertex past place cs: back, floor(cs) when cs is fractional, cs - 1 when whole;
  // forward, floor(cs) + 1 either way.
  for (let j = dir < 0 ? Math.ceil(cs) - 1 : Math.floor(cs) + 1; j >= 0 && j < t.n; j += dir) {
    const bu = t.u[j];
    const bv = t.v[j];
    const eu = bu - lead.u;
    const ev = bv - lead.v;
    if (eu * eu + ev * ev >= L2) {
      // c inside the circle, b on or outside it: one crossing on c..b (a disc is convex), the
      // larger root of |m + r (b - c)|^2 = len^2. b - c is not zero, as c and b are on either side.
      const du = bu - cu;
      const dv = bv - cv;
      const a = du * du + dv * dv;
      const bq = 2 * (du * mu + dv * mv);
      const c0 = mu * mu + mv * mv - L2;
      const r = Math.max(0, Math.min(1, (-bq + Math.sqrt(Math.max(0, bq * bq - 4 * a * c0))) / (2 * a)));
      hit.u = cu + du * r;
      hit.v = cv + dv * r;
      hit.s = cs + (j - cs) * r;
      return;
    }
    cu = bu;
    cv = bv;
    cs = j;
    mu = eu;
    mv = ev;
  }
  hit.u = cu;
  hit.v = cv;
  hit.s = cs;
}

/**
 * Points 1..15 placed back along the trail, each from the point ahead. The head itself is off the
 * trail (the live end trails it by up to TRAIL_LAG), so point 1 starts its walk at the live end but
 * measures its link from the head.
 */
export function poseBehind(t: BodyTrail, b: TrailBody): void {
  for (let i = 1; i < N; i++) {
    lead.u = b.u[i - 1];
    lead.v = b.v[i - 1];
    lead.s = i === 1 ? t.n - 1 : t.at[i - 1];
    lead.len = t.len[i];
    walk(t, -1);
    b.u[i] = hit.u;
    b.v[i] = hit.v;
    t.at[i] = hit.s;
  }
}

/**
 * One step backing `step.step` (u): the head is pinned as the trail's end (no jump), the tail goes
 * back along the trail (never past its start: the tunnel's end), and the rest is placed forward
 * from the point behind, the head last.
 */
export function backAlong(t: BodyTrail, b: TrailBody, step: { step: number }): void {
  if (!t.backed) {
    pt.u = b.u[0];
    pt.v = b.v[0];
    push(t);
    t.at[0] = t.n - 1;
    t.backed = true;
  }
  const T = N - 1;
  // The tail's place, moved back by step.step of arc length.
  let k = Math.min(t.n - 2, Math.floor(t.at[T]));
  const want = t.arc[k] + (t.arc[k + 1] - t.arc[k]) * (t.at[T] - k) - step.step;
  if (want <= 0) pt.s = 0;
  else {
    while (k > 0 && t.arc[k] > want) k--;
    const l = t.arc[k + 1] - t.arc[k];
    pt.s = k + (l > 1e-12 ? (want - t.arc[k]) / l : 0);
  }
  t.at[T] = pt.s;
  pointAt(t);
  b.u[T] = pt.u;
  b.v[T] = pt.v;
  for (let i = T - 1; i >= 0; i--) {
    lead.u = b.u[i + 1];
    lead.v = b.v[i + 1];
    lead.s = t.at[i + 1];
    lead.len = t.len[i + 1];
    walk(t, 1);
    b.u[i] = hit.u;
    b.v[i] = hit.v;
    t.at[i] = hit.s;
  }
}
