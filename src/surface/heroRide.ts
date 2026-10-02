import { bestTilt, liftForTilt, overBody, pressTarget } from './heroClearance';
import { HERO_Y_BIAS, surfaceOr, type HeroLeaves, type SurfaceFn } from './heroPool';

/** A hero leaf against the body beneath it: held up over it, or pressed flat under it (pure). */

/** A leaf held at least this high (m) is lying over the body. */
export const HELD = 0.002;

/**
 * Leaf i against the body where it lies now, on litter of height `surf`: over the body the tilt
 * eases toward the best one (by `pitchK`) and the lift is at least what that tilt needs (rising
 * at once), easing down otherwise (by `liftDown`); passed over by the body it is pressed flat at
 * once, springing back by `unpress`. Rates of 1 place it at once. Returns true when a leaf the
 * body was passing over (pressed) goes over it instead (the worm dived into the litter beside
 * it): it moves there at once, as it cannot slide through the body.
 */
export function rideBody(
  p: HeroLeaves, i: number, surf: number, pushers: Float32Array, count: number,
  pitchK: number, liftDown: number, unpress: number,
): boolean {
  const rest = surf + i * HERO_Y_BIAS;
  const held = p.lift[i] > HELD;
  const pressed = !held && p.flat[i] > 0.5;
  // A leaf the head is turning over swings up over the body it reaches.
  const turning = Math.abs(p.flipRate[i]) > 0.5;
  const dir = overBody(
    p.x[i], p.z[i], p.size[i], p.kind[i], p.yaw[i], p.flip[i], surf, rest,
    pushers, count, p.pitchDir[i], held || turning,
  );
  const over = dir === dir;
  const pitchTarget = over ? Math.atan(bestTilt()) : 0;
  p.pitch[i] += (pitchTarget - p.pitch[i]) * pitchK;
  if (over) p.pitchDir[i] = dir;
  const need = over ? liftForTilt(Math.tan(p.pitch[i])) : 0;
  p.lift[i] = need >= p.lift[i] ? need : p.lift[i] + (need - p.lift[i]) * liftDown;
  const press = pressTarget(p.x[i], p.z[i], p.size[i], p.kind[i], rest, pushers, count, p.lift[i] > HELD);
  p.flat[i] = press >= p.flat[i] ? press : p.flat[i] + (press - p.flat[i]) * unpress;
  return pressed && over;
}

/**
 * A freshly placed leaf (y on its rest, no lift): lifted over or pressed under the body at once,
 * with no step to interpolate from, so it never appears to pass through the worm.
 */
export function settle(p: HeroLeaves, i: number, surf: number, pushers: Float32Array, count: number): void {
  rideBody(p, i, surf, pushers, count, 1, 1, 1);
  p.y[i] = p.py[i] = surf + p.lift[i] + i * HERO_Y_BIAS;
  p.ppitch[i] = p.pitch[i];
  p.ppitchDir[i] = p.pitchDir[i];
  p.pflat[i] = p.flat[i];
}

/**
 * Places the leaves from slot `from` on (just added by setHeroCount) over or under the body
 * (`count` pushers, see stepHeroLeaves) at once.
 */
export function settleHeroLeaves(
  p: HeroLeaves, from: number, pushers: Float32Array, count: number, surfaceAt?: SurfaceFn,
): void {
  for (let i = Math.max(0, from); i < p.count; i++) {
    const rest = p.y[i] - i * HERO_Y_BIAS;
    settle(p, i, surfaceAt ? surfaceOr(surfaceAt, p.x[i], p.z[i], rest) : rest, pushers, count);
  }
}

/** Leaf i is at rest on the litter: not moving, turning, held, tilted or pressed. */
export function atRest(p: HeroLeaves, i: number): boolean {
  return p.vx[i] === 0 && p.vz[i] === 0 && p.vy[i] === 0 && p.spin[i] === 0 && p.flipRate[i] === 0
    && p.lift[i] === 0 && p.pitch[i] === 0 && p.flat[i] === 0;
}
