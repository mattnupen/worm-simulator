import type { Vec2, Vec3 } from '../core/vec';

export interface WormMotion { head: Vec3; heading: number }
export interface LocomotionOptions { speed: number; turnRate: number; halfSize: number }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** move.y = forward/back, move.x = turn right/left. Returns a new motion. */
export function stepWorm(m: WormMotion, move: Vec2, dt: number, o: LocomotionOptions): WormMotion {
  const heading = m.heading - move.x * o.turnRate * dt;
  const forward = move.y >= 0 ? move.y : move.y * 0.5;
  const dist = forward * o.speed * dt;
  return {
    heading,
    head: {
      x: clamp(m.head.x + Math.sin(heading) * dist, -o.halfSize, o.halfSize),
      y: m.head.y,
      z: clamp(m.head.z + Math.cos(heading) * dist, -o.halfSize, o.halfSize),
    },
  };
}
