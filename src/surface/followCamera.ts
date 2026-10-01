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
  if (!(dtSec > 0)) return { ...current };
  const a = 1 - Math.exp(-rate * dtSec);
  return {
    x: current.x + (target.x - current.x) * a,
    y: current.y + (target.y - current.y) * a,
    z: current.z + (target.z - current.z) * a,
  };
}

/** Critically damped spring (Game Programming Gems 4 "SmoothDamp"). Eases in and out; never overshoots. */
export function smoothDamp(
  current: number,
  target: number,
  velocity: number,
  smoothTimeSec: number,
  dtSec: number,
): { value: number; velocity: number } {
  if (!(dtSec > 0)) return { value: current, velocity };
  const omega = 2 / Math.max(1e-4, smoothTimeSec);
  const x = omega * dtSec;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (velocity + omega * change) * dtSec;
  return { value: target + (change + temp) * decay, velocity: (velocity - omega * temp) * decay };
}

export interface FollowCamState {
  yaw: number;
  yawVel: number;
  pos: Vec3;
}

export interface FollowCamOptions {
  distance: number;
  height: number;
  /** Seconds for the yaw spring to mostly settle. Higher = gentler. */
  yawSmoothTime: number;
  /** Exponential rate (1/s) for position follow. Higher = tighter. */
  posRate: number;
}

export function createFollowCam(head: Vec3, heading: number, o: FollowCamOptions): FollowCamState {
  return { yaw: heading, yawVel: 0, pos: cameraTarget(head, heading, o.distance, o.height) };
}

/** Camera orbits at constant distance using a spring-smoothed yaw, then follows position. Pure. Heading is unwrapped upstream, so no angle wrapping is needed. */
export function stepFollowCam(
  s: FollowCamState,
  head: Vec3,
  heading: number,
  dtSec: number,
  o: FollowCamOptions,
): FollowCamState {
  if (!(dtSec > 0)) return s;
  const y = smoothDamp(s.yaw, heading, s.yawVel, o.yawSmoothTime, dtSec);
  const target = cameraTarget(head, y.value, o.distance, o.height);
  return { yaw: y.value, yawVel: y.velocity, pos: smoothToward(s.pos, target, o.posRate, dtSec) };
}
