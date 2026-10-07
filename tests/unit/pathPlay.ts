import { expect } from 'vitest';
import { poseAt, type BodyPath } from '../../src/underground/bodyPath';
import { slabX, slabZ, type Slab } from '../../src/underground/slab';
import { Crawl, SPACING } from '../../src/game/crawl';

/** Shared by bodyPath.test.ts and emergePath.test.ts: playing a move frame by frame and checking it. */
export const N = 16;
export const DT = 1 / 60;
export const DEG = Math.PI / 180;
/** A joint never bends more than this during a move, unless the body was already bent more. */
export const KINK = 45 * DEG;
/**
 * The most a point's per-frame step may change between frames (u): a snap or a sudden stop shows as
 * far more. Sweeping the tail (3.3 u behind the head) through an 80 degree turn within the 1 s sink
 * needs about 0.023.
 */
export const MAX_ACCEL = 0.03;

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

export interface Played { first: P3[]; last: P3[]; frames: P3[][] }

/**
 * Plays the move at 60 Hz and checks it frame by frame: every point moves smoothly (its step and the
 * change in its step bounded, still at both ends), the head never doubles back, no joint kinks and
 * no segment stretches.
 */
export function play(s: Slab, p: BodyPath, seconds: number, maxStep: number, maxHeadTurn: number): Played {
  const u = new Float64Array(N);
  const v = new Float64Array(N);
  const w = new Float64Array(N);
  const n = Math.round(seconds / DT);
  const frames: P3[][] = [];
  for (let k = 0; k <= n; k++) frames.push(world(s, p, k / n, u, v, w));
  const bend0 = maxBend(frames[0]);
  for (let k = 1; k <= n; k++) {
    const a = frames[k - 1];
    const b = frames[k];
    for (let i = 0; i < N; i++) {
      const d = sub(b[i], a[i]);
      expect(len(d)).toBeLessThanOrEqual(maxStep);
      // No snap: a point's step changes only a little from one frame to the next.
      if (k >= 2) expect(len(sub(d, sub(a[i], frames[k - 2][i])))).toBeLessThanOrEqual(MAX_ACCEL);
      if (i > 0) expect(len(sub(b[i], b[i - 1]))).toBeLessThanOrEqual(SPACING * 1.04);
    }
    expect(maxBend(b)).toBeLessThanOrEqual(Math.max(bend0, KINK) + 1e-9);
    if (k >= 2) {
      // The head never reverses or jerks sideways: its way changes a little from frame to frame.
      const h1 = sub(a[0], frames[k - 2][0]);
      const h2 = sub(b[0], a[0]);
      if (len(h1) > 1e-4 && len(h2) > 1e-4) expect(angle(h1, h2)).toBeLessThan(maxHeadTurn);
    }
  }
  // Starts and stops gently: no jump from or into a still worm.
  for (let i = 0; i < N; i++) {
    expect(len(sub(frames[1][i], frames[0][i]))).toBeLessThan(2e-3);
    expect(len(sub(frames[n][i], frames[n - 1][i]))).toBeLessThan(2e-3);
  }
  return { first: frames[0], last: frames[n], frames };
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

