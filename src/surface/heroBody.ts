import { LEAF_REACH, reachToward } from './heroOutline';

/**
 * The worm's body as the hero leaves see it: the pusher layout (one body point per pusher, in
 * order along the body) and what a single body point does to a leaf (pure).
 */

/**
 * Floats per pusher: [x, z, radius, strength, top, under, belly, fall]. `fall`: how far the top
 * surface drops from the spine to the body's side (0, a flat-topped dome, is always safe).
 */
export const PUSHER_STRIDE = 8;
/**
 * A body point stands for the tube up to halfway to its neighbours along the spine (at most
 * this far: half the crawl's 0.11 m pusher spacing, plus the spine's bend between them).
 * Consecutive body points closer than LINK are one stretch of tube: each one's dome runs along
 * the spine to the midpoints with its neighbours, and the drawn spine (a curve through them)
 * strays at most BEND from those straight pieces.
 */
export const PUSHER_SPAN = 0.07;
export const LINK = 0.2;
export const BEND = 0.015;
/** A pusher with at least this strength is the head. */
export const HEAD_STRENGTH = 0.9;
/** A leaf flattens over this distance (m) before a body point riding over the litter can reach it. */
export const PRESS_RAMP = 0.1;
/**
 * Beyond the body's side the leaf is eased up over this distance (m): a skirt falling from the
 * side of the dome to the litter, so a leaf rises as the worm noses under its edge instead of
 * jumping up when the side arrives.
 */
export const SKIRT = 0.04;

/** Whether the head pusher at offset `o`, (dx, dz) from the leaf's centre, touches its outline. */
export function touches(
  pushers: Float32Array, o: number, dx: number, dz: number, d2: number,
  kind: number, size: number, yaw: number, flip: number,
): boolean {
  const d = Math.sqrt(d2);
  if (d < 1e-6) return true;
  return d < pushers[o + 2] + reachToward(kind, size, yaw, flip, -dx / d, -dz / d);
}

/**
 * Whether a leaf resting at height `rest` goes over a body point: it lies above the worm's belly
 * there (the worm is in the litter beneath it), or it is already held up over the body. Below
 * the belly the worm passes over the leaf instead.
 */
export function overIt(pushers: Float32Array, o: number, held: boolean, rest: number): boolean {
  return held || rest > pushers[o + 6];
}

/** Whether the body points at offsets o and q are consecutive along one stretch of tube. */
export function linked(pushers: Float32Array, o: number, q: number): boolean {
  const dx = pushers[q] - pushers[o];
  const dz = pushers[q + 1] - pushers[o + 1];
  return dx * dx + dz * dz < LINK * LINK;
}

/**
 * How flat (0 its natural cupped form, 1 pressed flat) a leaf at (x, z), resting at `rest`, must
 * be for the body points that pass over it (its rest is under their belly): the leaf's curled
 * rim would otherwise rise into them. Full before any of them can reach the leaf, easing in over
 * the PRESS_RAMP before that. `held`: the leaf lies over the body (no pressing).
 */
export function pressTarget(
  x: number, z: number, size: number, kind: number, rest: number,
  pushers: Float32Array, count: number, held: boolean,
): number {
  if (held) return 0;
  const reach = size * LEAF_REACH[kind];
  let press = 0;
  for (let k = 0; k < count; k++) {
    const o = k * PUSHER_STRIDE;
    if (overIt(pushers, o, false, rest)) continue;
    const dx = x - pushers[o];
    const dz = z - pushers[o + 1];
    const lim = reach + pushers[o + 2] + PUSHER_SPAN + PRESS_RAMP;
    const d2 = dx * dx + dz * dz;
    if (d2 >= lim * lim) continue;
    press = Math.max(press, Math.min(1, (lim - Math.sqrt(d2)) / PRESS_RAMP));
  }
  return press;
}

/**
 * A circle around the whole body (`count` pushers, each with its radius) into `out`; its radius
 * is -Infinity with no body. Allocates nothing.
 */
export function bodyBounds(
  pushers: Float32Array, count: number, out: { x: number; z: number; r: number },
): { x: number; z: number; r: number } {
  let cx = 0;
  let cz = 0;
  for (let k = 0; k < count; k++) {
    cx += pushers[k * PUSHER_STRIDE];
    cz += pushers[k * PUSHER_STRIDE + 1];
  }
  if (count > 0) {
    cx /= count;
    cz /= count;
  }
  let r = -Infinity;
  for (let k = 0; k < count; k++) {
    const o = k * PUSHER_STRIDE;
    const dx = pushers[o] - cx;
    const dz = pushers[o + 1] - cz;
    r = Math.max(r, Math.sqrt(dx * dx + dz * dz) + pushers[o + 2]);
  }
  out.x = cx;
  out.z = cz;
  out.r = r;
  return out;
}
