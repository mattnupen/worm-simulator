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

/**
 * A value and its velocity, moved by smoothDampInto. A class, not an object literal: three.js's
 * uniforms are `{ value }` literals holding objects, and every `{ value, ... }` literal shares their
 * hidden class, whose `value` then holds any kind of value; storing a number in such a field boxes
 * it on the heap, every step. A class has its own, which keeps `value` a plain number field.
 */
export class Spring {
  declare value: number;
  declare velocity: number;
  constructor(value = 0, velocity = 0) {
    this.value = value;
    this.velocity = velocity;
  }
}

/**
 * Critically damped spring (Game Programming Gems 4 "SmoothDamp"), in place: moves `s` toward
 * `target`. Eases in and out (it starts from its current velocity); never overshoots. Allocates nothing.
 */
export function smoothDampInto(
  s: Spring,
  target: number,
  smoothTimeSec: number,
  dtSec: number,
  maxSpeed = Infinity,
): void {
  if (!(dtSec > 0)) return;
  const current = s.value;
  const omega = 2 / Math.max(1e-4, smoothTimeSec);
  const x = omega * dtSec;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

  const maxChange = maxSpeed * smoothTimeSec;
  const change = Math.max(-maxChange, Math.min(maxChange, current - target));
  const clampedTarget = current - change;

  const temp = (s.velocity + omega * change) * dtSec;
  const value = clampedTarget + (change + temp) * decay;

  // Overshoot guard: if we passed the target, clamp to it
  if ((target - current > 0) === (value > target)) {
    s.value = target;
    s.velocity = 0;
    return;
  }
  s.value = value;
  s.velocity = (s.velocity - omega * temp) * decay;
}

/** Critically damped spring (smoothDampInto), returning the new value and velocity. */
export function smoothDamp(
  current: number,
  target: number,
  velocity: number,
  smoothTimeSec: number,
  dtSec: number,
  maxSpeed = Infinity,
): { value: number; velocity: number } {
  const s = new Spring(current, velocity);
  smoothDampInto(s, target, smoothTimeSec, dtSec, maxSpeed);
  return s;
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
  /** Maximum yaw speed in rad/s. Defaults to Infinity (no limit). */
  maxYawSpeed?: number;
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
  const next = { yaw: s.yaw, yawVel: s.yawVel, pos: { ...s.pos } };
  stepFollowCamInto(next, head, heading, dtSec, o);
  return next;
}

const yawSpring = new Spring();

/** stepFollowCam in place (the crawl's step), the same arithmetic: allocates nothing. */
export function stepFollowCamInto(
  s: FollowCamState,
  head: Vec3,
  heading: number,
  dtSec: number,
  o: FollowCamOptions,
): void {
  if (!(dtSec > 0)) return;
  const y = yawSpring;
  y.value = s.yaw;
  y.velocity = s.yawVel;
  smoothDampInto(y, heading, o.yawSmoothTime, dtSec, o.maxYawSpeed);
  // cameraTarget, then smoothToward, written out in place.
  const tx = head.x - Math.sin(y.value) * o.distance;
  const ty = head.y + o.height;
  const tz = head.z - Math.cos(y.value) * o.distance;
  const a = 1 - Math.exp(-o.posRate * dtSec);
  const p = s.pos;
  p.x = p.x + (tx - p.x) * a;
  p.y = p.y + (ty - p.y) * a;
  p.z = p.z + (tz - p.z) * a;
  s.yaw = y.value;
  s.yawVel = y.velocity;
}
