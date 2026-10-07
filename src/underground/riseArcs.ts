import { wrap } from './bodyPath';

/** Arc geometry for coming up (emergePath.ts): turns in the cut's plane, and the body's front bent round. Pure. */

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
 */
export const front = { bu: 0, bv: 0, from: 0, len: 0, fu: 0, fv: 0, r: 0, rho: 1, turn: 0 };

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
