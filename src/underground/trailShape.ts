import { hypot2 } from '../core/vec';

/**
 * Where on its trail each body point lies (bodyTrail.ts): the trail read at a place along it, and
 * the body's shape from it, rounded. The head's path has real corners (a stone or root it slid
 * round, a turn on the spot); read point by point the body showed an elbow there, pulsing as each
 * point flowed past. So each point lies at the trail's average over SPACING either side of its
 * place, and then no bend is left sharper than MAX_BEND. Typed arrays and scratch fields only: no
 * fractional number crosses a call (it would be boxed on the heap: solidShapes.ts).
 */

/** Points on a trail at most (a ring): about 10 u of path at its 0.02 u step, three body lengths. */
export const TRAIL_CAP = 512;
/** A point lies at the trail's average over this far either side of its place (one SPACING), weighted 1 2 3 2 1. */
export const SMOOTH = 0.22;
const TAPS = [1, 0.5, 0, -0.5, -1] as const;
const TAP_W = [1 / 9, 2 / 9, 3 / 9, 2 / 9, 1 / 9] as const;
/**
 * No bend at a point sharper than this (radians between its segments): about a radius of 0.44 u,
 * as follow-the-leader's body bent. Sharper bends are eased toward the chord across them (a few
 * passes, each point moved only as much as its bend is over), the head and neck left where they are.
 */
const MAX_BEND = 0.5;
const PASSES = 12;
/** Past either end the trail runs on straight, the way its last this much went. */
const END_RUN = 0.1;

export interface BodyTrail {
  readonly u: Float64Array;
  readonly v: Float64Array;
  /** Each trail point's place along the trail (decreasing from the newest). */
  readonly s: Float64Array;
  /** Ring index of the newest point (the head, as last placed), and how many points there are. */
  front: number;
  count: number;
  /** Each body point's place along the trail, head first, and where its shape puts it (onU, onV). */
  readonly at: Float64Array;
  readonly onU: Float64Array;
  readonly onV: Float64Array;
  /** The shape as just worked out (shapeBody). */
  readonly toU: Float64Array;
  readonly toV: Float64Array;
  /** Each smoothing tap's place in the trail (searched head to tail). */
  readonly taps: Int32Array;
  /** The tail's place before it moved back (followTail). */
  fromU: number;
  fromV: number;
  /** Scratch: a place to read (qa), what was read there (pu, pv), the ends' ways on (fu, fv; bu, bv). */
  qa: number;
  pu: number;
  pv: number;
  fu: number;
  fv: number;
  bu: number;
  bv: number;
}

export function createTrail(n: number): BodyTrail {
  return {
    u: new Float64Array(TRAIL_CAP), v: new Float64Array(TRAIL_CAP), s: new Float64Array(TRAIL_CAP), front: 0, count: 0,
    at: new Float64Array(n), onU: new Float64Array(n), onV: new Float64Array(n), toU: new Float64Array(n), toV: new Float64Array(n),
    // Fractions to start: a field that first held a whole number boxes later fractions (burrower.ts).
    taps: new Int32Array(TAPS.length), fromU: 0.5, fromV: 0.5, qa: 0.5, pu: 0.5, pv: 0.5, fu: 0.5, fv: 0.5, bu: 0.5, bv: 0.5,
  };
}

/** Ring index of the k-th newest point. */
export const ix = (t: BodyTrail, k: number): number => (t.front + k) % TRAIL_CAP;

/** The trail at place t.qa (into t.pu, t.pv), searching from the k-th newest point on; returns where it found it. */
function lookup(t: BodyTrail, k: number): number {
  const a = t.qa;
  while (k < t.count - 2 && t.s[ix(t, k + 1)] > a) k++;
  const j0 = ix(t, k);
  const j1 = ix(t, k + 1);
  if (a > t.s[j0]) {
    t.pu = t.u[j0] + t.fu * (a - t.s[j0]);
    t.pv = t.v[j0] + t.fv * (a - t.s[j0]);
  } else if (a < t.s[j1]) {
    t.pu = t.u[j1] + t.bu * (t.s[j1] - a);
    t.pv = t.v[j1] + t.bv * (t.s[j1] - a);
  } else {
    const span = t.s[j0] - t.s[j1];
    const f = span > 1e-12 ? (t.s[j0] - a) / span : 0;
    t.pu = t.u[j0] + (t.u[j1] - t.u[j0]) * f;
    t.pv = t.v[j0] + (t.v[j1] - t.v[j0]) * f;
  }
  return k;
}

/** The ways the trail runs on past its ends (unit; over its last END_RUN at each end). */
function endWays(t: BodyTrail): void {
  const jf = ix(t, 0);
  const jb = ix(t, t.count - 1);
  t.fu = t.fv = t.bu = t.bv = 0;
  t.qa = Math.max(t.s[jb], t.s[jf] - END_RUN);
  lookup(t, 0);
  let l = hypot2(t.u[jf] - t.pu, t.v[jf] - t.pv);
  if (l > 1e-9) {
    t.fu = (t.u[jf] - t.pu) / l;
    t.fv = (t.v[jf] - t.pv) / l;
  }
  t.qa = Math.min(t.s[jf], t.s[jb] + END_RUN);
  lookup(t, 0);
  l = hypot2(t.u[jb] - t.pu, t.v[jb] - t.pv);
  if (l > 1e-9) {
    t.bu = (t.u[jb] - t.pu) / l;
    t.bv = (t.v[jb] - t.pv) / l;
  }
}

/**
 * The body's shape now (into t.toU, t.toV) from each point's place `t.at`: the head and neck on the
 * trail, the rest at its smoothed average, then every bend eased to at most MAX_BEND.
 */
export function shapeBody(t: BodyTrail): void {
  const n = t.at.length;
  const tu = t.toU;
  const tv = t.toV;
  endWays(t);
  let k = 0;
  for (let i = 0; i < 2; i++) {
    t.qa = t.at[i];
    k = lookup(t, k);
    tu[i] = t.pu;
    tv[i] = t.pv;
  }
  t.taps.fill(0);
  for (let i = 2; i < n; i++) {
    let su = 0;
    let sv = 0;
    for (let q = 0; q < TAPS.length; q++) {
      t.qa = t.at[i] + TAPS[q] * SMOOTH;
      t.taps[q] = lookup(t, t.taps[q]);
      su += t.pu * TAP_W[q];
      sv += t.pv * TAP_W[q];
    }
    tu[i] = su;
    tv[i] = sv;
  }
  for (let p = 0; p < PASSES; p++) for (let i = 2; i < n - 1; i++) ease(t, i);
}

/**
 * Eases the bend at point i (from the point after the neck back) to MAX_BEND if sharper: point i
 * toward its neighbours' middle. (The bend at the neck is the head's own turning, MAX_NECK_BEND in
 * burrowMotion.ts: swinging the point after it round to ease it pulled that point off the tunnel.)
 */
function ease(t: BodyTrail, i: number): void {
  const u = t.toU;
  const v = t.toV;
  const au = u[i] - u[i - 1];
  const av = v[i] - v[i - 1];
  const cu = u[i + 1] - u[i];
  const cv = v[i + 1] - v[i];
  const bend = Math.abs(Math.atan2(au * cv - av * cu, au * cu + av * cv));
  if (!(bend > MAX_BEND)) return;
  const g = (bend - MAX_BEND) / bend;
  u[i] += ((u[i - 1] + u[i + 1]) / 2 - u[i]) * g;
  v[i] += ((v[i - 1] + v[i + 1]) / 2 - v[i]) * g;
}
