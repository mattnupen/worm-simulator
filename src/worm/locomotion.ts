import { hypot2, type Vec2, type Vec3 } from '../core/vec';

export interface WormMotion { head: Vec3; heading: number }
export interface LocomotionOptions { speed: number; turnRate: number; halfSize: number; minTurnRadius?: number; pivotZone?: number }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Limits heading change to prevent the worm from coiling into its own body.
 * When moving forward, the turn radius is constrained: |delta heading| <= forward distance / minTurnRadius.
 * When turning in place (dist === 0), the turn is unlimited.
 * Near-sideways stick input pivots instead of creeping with a near-zero turn rate.
 * move.y = forward/back, move.x = turn right/left. Returns a new motion.
 */
export function stepWorm(m: WormMotion, move: Vec2, dt: number, o: LocomotionOptions): WormMotion {
  const next = { head: { x: m.head.x, y: m.head.y, z: m.head.z }, heading: m.heading };
  stepWormInto(next, move, dt, o);
  return next;
}

/** stepWorm in place (the crawl's step): allocates nothing. */
export function stepWormInto(m: WormMotion, move: Vec2, dt: number, o: LocomotionOptions): void {
  let forward = move.y >= 0 ? move.y : move.y * 0.5;

  // Pivot zone: if |move.y| < pivotZone, treat forward as 0 for this step
  if (Math.abs(move.y) < (o.pivotZone ?? 0)) {
    forward = 0;
  }

  const dist = forward * o.speed * dt;
  let deltaHeading = -move.x * o.turnRate * dt;

  // Apply minimum turn radius constraint
  if (o.minTurnRadius !== undefined && dist !== 0) {
    const maxDelta = Math.abs(dist) / o.minTurnRadius;
    deltaHeading = clamp(deltaHeading, -maxDelta, maxDelta);
  }

  const heading = m.heading + deltaHeading;
  m.heading = heading;
  m.head.x = clamp(m.head.x + Math.sin(heading) * dist, -o.halfSize, o.halfSize);
  m.head.z = clamp(m.head.z + Math.cos(heading) * dist, -o.halfSize, o.halfSize);
}

/**
 * Keeps the head from turning back into its own body.
 * Limits heading to within ±maxBend radians of the neck direction.
 * If head and neck coincide (distance < 1e-6), returns heading unchanged.
 */
export function clampToNeck(heading: number, head: Vec3, neck: Vec3, maxBend: number): number {
  const dx = head.x - neck.x;
  const dz = head.z - neck.z;
  const dist = hypot2(dx, dz);

  // If head and neck coincide, return unchanged
  if (dist < 1e-6) return heading;

  // Neck direction: atan2(head.x - neck.x, head.z - neck.z)
  const neckDir = Math.atan2(dx, dz);

  // Compute wrapped difference in (-π, π] using wrap-safe multi-turn formula
  let diff = heading - neckDir;
  diff = diff - 2 * Math.PI * Math.round(diff / (2 * Math.PI));

  // Clamp the difference
  const clampedDiff = clamp(diff, -maxBend, maxBend);

  // Return heading - (diff - clampedDiff) to preserve unwrapped continuity
  return heading - (diff - clampedDiff);
}
