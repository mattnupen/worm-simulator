import { AUTO_DRIVE_MOVE, LOCOMOTION } from '../game/drive';

/**
 * The worm's fixed paths, kept clear of solid props and clutter (pure):
 * - the speed test's auto-drive loop: AUTO_DRIVE_MOVE with LOCOMOTION (move {x: 0.35, y: 1} at
 *   speed 1.6 and turn rate 2.2) traces a circle of radius 1.6 / 0.77 ~ 2.08, centred left of the
 *   spawn;
 * - the straight run ahead of the spawn (it is not empty: a climbable windblown leaf pile sits
 *   ahead).
 */
const LOOP_RADIUS = (LOCOMOTION.speed * AUTO_DRIVE_MOVE.move.y) / (LOCOMOTION.turnRate * AUTO_DRIVE_MOVE.move.x);
export const LOOP = { x: -LOOP_RADIUS, z: 0, r: LOOP_RADIUS };
/** Clearance around the loop line: the body, its shadow, and the camera 2.6 behind the head. */
export const LOOP_MARGIN = 1.8;
export const CORRIDOR = { x0: -1.8, x1: 1.8, z0: -3.5, z1: 7.5 };

/** True when a thing of `radius` at (x, z) keeps off the auto-drive loop and the spawn corridor. */
export function clearOfPaths(x: number, z: number, radius: number): boolean {
  if (Math.hypot(x - LOOP.x, z - LOOP.z) < LOOP.r + LOOP_MARGIN + radius) return false;
  return !(x > CORRIDOR.x0 - radius && x < CORRIDOR.x1 + radius && z > CORRIDOR.z0 - radius && z < CORRIDOR.z1 + radius);
}
