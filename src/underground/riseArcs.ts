import { restAt, wrap, type BodyPath } from './bodyPath';

/** Arc geometry for coming up (emergePath.ts): turns in the cut's plane, the body's front bent round, nearest places on the path. Pure. */

/** a in [0, 2 pi). */
export const mod = (a: number): number => a - 2 * Math.PI * Math.floor(a / (2 * Math.PI));
/** Sweep of the turn from facing a0 to facing a1 going `rho` (+1 counterclockwise in the plane). */
export const sweepOf = (a0: number, a1: number, rho: number): number => mod(rho * (a1 - a0));
/** Rise and run of an arc of radius r from facing a0, turning `rho` through `sweep`. */
export const arcRise = (r: number, a0: number, rho: number, sweep: number): number => -r * rho * (Math.cos(a0 + rho * sweep) - Math.cos(a0));
export const arcRun = (r: number, a0: number, rho: number, sweep: number): number => r * rho * (Math.sin(a0 + rho * sweep) - Math.sin(a0));

/**
 * The body's front (its last few segments, `front.len` long from their back end, arriving there along
 * `front.from`) bent into one arc that leaves facing a0: where the head then stands (fu, fv), the
 * arc's radius and way. The rise starts there; the front eases onto that arc as the move begins.
 * `lie`: the front is not bent at all; the rise starts from the head as it lies.
 */
export const front = { bu: 0, bv: 0, from: 0, len: 0, fu: 0, fv: 0, r: 0, rho: 1, turn: 0, lie: true };

/**
 * The lowest an arc of radius r from facing a0, turning `rho` through `sweep`, goes below its start
 * (0 or less: at an end, or at its trough, where it faces along u).
 */
export function arcLow(r: number, a0: number, rho: number, sweep: number): number {
  let low = Math.min(0, arcRise(r, a0, rho, sweep));
  const trough = rho > 0 ? 0 : Math.PI;
  if (sweepOf(a0, trough, rho) <= sweep) low = Math.min(low, -r * (1 - rho * Math.cos(a0)));
  return low;
}

export function bendFront(a0: number): void {
  const d = wrap(a0 - front.from);
  front.turn = Math.abs(d);
  front.rho = d >= 0 ? 1 : -1;
  if (front.turn < 1e-6) {
    front.r = Infinity;
    front.fu = front.bu + front.len * Math.cos(front.from);
    front.fv = front.bv + front.len * Math.sin(front.from);
    return;
  }
  front.r = front.len / front.turn;
  front.fu = front.bu + arcRun(front.r, front.from, front.rho, front.turn);
  front.fv = front.bv + arcRise(front.r, front.from, front.rho, front.turn);
}

/** The arc length along the path (from vertex `from`, up to arc `upTo`) of the point nearest (u, v). */
export function nearestAlong(p: BodyPath, u: number, v: number, from: number, upTo: number): number {
  let best = Infinity;
  let at = p.s[from];
  for (let j = from; j < p.count - 1 && p.s[j] <= upTo; j++) {
    const du = p.u[j + 1] - p.u[j];
    const dv = p.v[j + 1] - p.v[j];
    const l = du * du + dv * dv;
    const f = l > 0 ? Math.max(0, Math.min(1, ((u - p.u[j]) * du + (v - p.v[j]) * dv) / l)) : 0;
    const d = Math.hypot(u - p.u[j] - du * f, v - p.v[j] - dv * f);
    if (d < best) {
      best = d;
      at = p.s[j] + f * (p.s[j + 1] - p.s[j]);
    }
  }
  return at;
}

/**
 * Lands the rise (path points after `headAt`) exactly on the floor where it ends, leaving the way the
 * floor's run does (its first step `dx` along u): the last planning pass's small misses in height and
 * slope, eased in from nothing at the head (its start unchanged) by a cubic along the rise.
 */
export function landOnFloor(p: BodyPath, headAt: number, dx: number): void {
  const riseFrom = p.s[headAt];
  const eu = p.u[p.count - 1];
  const miss = restAt(p, eu, 0) - p.v[p.count - 1];
  const k = p.count - 1;
  const slopeNow = (p.v[k] - p.v[k - 1]) / Math.max(1e-9, p.s[k] - p.s[k - 1]);
  const run = Math.atan2(restAt(p, eu + dx, 0) - restAt(p, eu, 0), dx);
  const turn = Math.sin(run) - slopeNow;
  const span = Math.max(1e-9, p.s[k] - riseFrom);
  // Eased in from nothing at the head (its start unchanged): a cubic in the share along the rise.
  for (let i = headAt + 1; i < p.count; i++) {
    const f = (p.s[i] - riseFrom) / span;
    p.v[i] += miss * f * f * (3 - 2 * f) + turn * span * f * f * (f - 1);
  }
  // The arc lengths along the corrected rise.
  for (let i = headAt + 1; i < p.count; i++) p.s[i] = p.s[i - 1] + Math.hypot(p.u[i] - p.u[i - 1], p.v[i] - p.v[i - 1]);
}
