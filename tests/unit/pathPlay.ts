import { expect } from 'vitest';
import { poseAt, POINT_SPEED, SHORT, TURN_RATE, type BodyPath } from '../../src/underground/bodyPath';
import { slabX, slabZ, type Slab } from '../../src/underground/slab';
import { Crawl, SPACING } from '../../src/game/crawl';

/** Shared by bodyPath.test.ts and emergePath.test.ts: playing a move frame by frame and checking it. */
export const N = 16;
export const DT = 1 / 60;
export const DEG = Math.PI / 180;
/** A joint never bends more than this during a move, unless the body was already bent more. */
export const KINK = 45 * DEG;
/** The most a point's per-frame step may change between frames (u): a snap or a sudden stop shows as far more. */
export const MAX_ACCEL = 0.02;

/** A point never turns its way by this much from one visible step to the next (a stall between or not). */
export const REVERSE = 90 * (Math.PI / 180);
/** A step a frame this small (0.03 u/s, about 1 mm/s) does not show. */
export const SEEN = 5e-4;

export type P3 = [number, number, number];

/** A crawl that has wandered a while (seeded turns), so its body has a natural curve. */
export function crawled(seed: number): Crawl {
  const c = new Crawl();
  const steps = 50 + 25 * seed;
  for (let k = 0; k < steps; k++) c.step(DT, { x: 0.9 * Math.sin(k * 0.04 * seed + seed), y: 1 });
  return c;
}

/** World points (head first) of the pose at progress t: the axis (v is the axis height). */
export function world(s: Slab, p: BodyPath, t: number, u: Float64Array, v: Float64Array, w: Float64Array): P3[] {
  poseAt(p, t, u, v, w);
  return Array.from({ length: N }, (_, i): P3 => [slabX(s, u[i]) + s.nx * w[i], v[i], slabZ(s, u[i]) + s.nz * w[i]]);
}

export const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const len = (a: P3): number => Math.hypot(a[0], a[1], a[2]);
export function angle(a: P3, b: P3): number {
  const l = len(a) * len(b);
  if (l < 1e-18) return 0;
  return Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / l)));
}
/** The sharpest bend between neighbouring segments. */
export function maxBend(b: P3[]): number {
  let m = 0;
  for (let i = 1; i < b.length - 1; i++) m = Math.max(m, angle(sub(b[i], b[i - 1]), sub(b[i + 1], b[i])));
  return m;
}

export interface Played { first: P3[]; last: P3[]; frames: P3[][]; topSpeed: number; topHead: number; topTurn: number; topWay: number }

/**
 * Plays the move over `seconds` at 60 Hz and checks it frame by frame:
 * - no point moves faster than POINT_SPEED, nor the head than `headSpeed` (u/s);
 * - no segment turns faster than TURN_RATE;
 * - every point moves smoothly (the change in its step bounded, still at both ends) and never
 *   doubles back: while it moves visibly (over SEEN a frame) its way changes by under REVERSE from
 *   one such frame to the next, across a stall too;
 * - no joint kinks and no segment stretches (past SPACING, or the longest it started at).
 * Returns the end poses, the fastest point, head and segment turn seen (per second) and the largest
 * change of way.
 */
export function play(s: Slab, p: BodyPath, seconds: number, headSpeed: number): Played {
  const u = new Float64Array(N);
  const v = new Float64Array(N);
  const w = new Float64Array(N);
  const n = Math.round(seconds / DT);
  const dt = seconds / n;
  const frames: P3[][] = [];
  for (let k = 0; k <= n; k++) frames.push(world(s, p, k / n, u, v, w));
  const bend0 = maxBend(frames[0]);
  let span0 = 0;
  for (let i = 1; i < N; i++) span0 = Math.max(span0, len(sub(frames[0][i], frames[0][i - 1])));
  const lastWay: (P3 | null)[] = Array.from({ length: N }, () => null);
  let topSpeed = 0;
  let topHead = 0;
  let topTurn = 0;
  let topWay = 0;
  for (let k = 1; k <= n; k++) {
    const a = frames[k - 1];
    const b = frames[k];
    for (let i = 0; i < N; i++) {
      const d = sub(b[i], a[i]);
      const speed = len(d) / dt;
      if (i === 0) topHead = Math.max(topHead, speed);
      else topSpeed = Math.max(topSpeed, speed);
      expect(speed).toBeLessThanOrEqual((i === 0 ? Math.min(headSpeed, POINT_SPEED) : POINT_SPEED) * 1.02);
      // No snap: a point's step changes only a little from one frame to the next.
      if (k >= 2) expect(len(sub(d, sub(a[i], frames[k - 2][i])))).toBeLessThanOrEqual(MAX_ACCEL);
      if (len(d) > SEEN) {
        const before = lastWay[i];
        if (before) {
          const way = angle(before, d);
          expect(way).toBeLessThan(REVERSE);
          topWay = Math.max(topWay, way);
        }
        lastWay[i] = d;
      }
      if (i > 0) {
        expect(len(sub(b[i], b[i - 1]))).toBeLessThanOrEqual(Math.max(SPACING, span0) * 1.04);
        const sa = sub(a[i], a[i - 1]);
        const sb = sub(b[i], b[i - 1]);
        const turn = len(sa) > SHORT && len(sb) > SHORT ? angle(sa, sb) / dt : 0;
        topTurn = Math.max(topTurn, turn);
        expect(turn).toBeLessThanOrEqual(TURN_RATE * 1.02);
      }
    }
    expect(maxBend(b)).toBeLessThanOrEqual(Math.max(bend0, KINK) + 1e-9);
  }
  // Starts and stops gently: no jump from or into a still worm.
  for (let i = 0; i < N; i++) {
    expect(len(sub(frames[1][i], frames[0][i]))).toBeLessThan(2e-3);
    expect(len(sub(frames[n][i], frames[n - 1][i]))).toBeLessThan(2e-3);
  }
  return { first: frames[0], last: frames[n], frames, topSpeed, topHead, topTurn, topWay };
}

/** A burrower body in the plane: the head at (hu, hv) facing `dir`, the body trailing in a gentle curve. */
export function burrowerBody(hu: number, hv: number, dir: number, curve: number): { us: Float64Array; vs: Float64Array } {
  const us = new Float64Array(N);
  const vs = new Float64Array(N);
  let a = dir + Math.PI;
  us[0] = hu;
  vs[0] = hv;
  for (let i = 1; i < N; i++) {
    us[i] = us[i - 1] + Math.cos(a) * SPACING;
    vs[i] = vs[i - 1] + Math.sin(a) * SPACING;
    a += curve;
  }
  return { us, vs };
}

