import type { Vec3 } from '../core/vec';

/** Where the camera wants to be: behind the worm along its heading, raised by height. */
export function cameraTarget(head: Vec3, heading: number, distance: number, height: number): Vec3 {
  return {
    x: head.x - Math.sin(heading) * distance,
    y: head.y + height,
    z: head.z - Math.cos(heading) * distance,
  };
}

/** Exponential smoothing that behaves the same at any frame rate. */
export function smoothToward(current: Vec3, target: Vec3, rate: number, dtSec: number): Vec3 {
  const a = 1 - Math.exp(-rate * dtSec);
  return {
    x: current.x + (target.x - current.x) * a,
    y: current.y + (target.y - current.y) * a,
    z: current.z + (target.z - current.z) * a,
  };
}
