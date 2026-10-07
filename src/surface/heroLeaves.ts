import { WORLD_HALF } from './terrain';
import {
  HEAD_STRENGTH, LEAF_REACH, PRESS_RAMP, PUSHER_SPAN, PUSHER_STRIDE, SKIRT, heroShortcuts, reachToward,
} from './heroClearance';
import { HELD, atRest, rideBody, settle } from './heroRide';
import { bodyBounds } from './heroBody';
import {
  HERO_GROW_IN, HERO_RECYCLE, HERO_Y_BIAS, clamp, surfaceOr, type HeroLeaves, type SurfaceFn,
} from './heroPool';
import { OBSTACLE_PAD, respawn } from './heroSpawn';
import { unwedge } from './heroObstacles';

export { PUSHER_SPAN, PUSHER_STRIDE } from './heroClearance';
export {
  HERO_GROW_IN, HERO_MAX, HERO_RADIUS, HERO_RECYCLE, HERO_Y_BIAS, clearHeroLeaves, createHeroLeaves, snapshotHeroLeaves,
  type HeroLeaves, type SurfaceFn,
} from './heroPool';
export { setHeroCount } from './heroSpawn';
export { settleHeroLeaves } from './heroRide';

/**
 * Hero leaves (spec 5.4): a small pool of loose leaves near the worm's head, with simple damped
 * physics run every step. In V2 they lie on the floor in the worm's pocket, under the top of the
 * litter (their surface is floorHeight), so the body is always under them (under 1).
 *
 * The worm and the leaves. The head always shoves a leaf it overlaps, and a strong shove from
 * it lifts the leaf's near edge so it flips over. The body depends on how deep the worm is:
 * a body point riding ON the litter (under 0) shoves gently; one crawling UNDER it (under 1)
 * does not shove at all (strength x (1 - under)). Instead the leaf rides OVER the worm: a body
 * point (or the head) whose belly lies below the leaf holds every leaf that reaches it up as a
 * rigid plate clear of its top (heroClearance.ts), tilted down away from the body with its far
 * edge on the litter, and it settles back down once the worm has passed. The lift rises at once
 * (never into the body) and eases back down; the tilt eases toward its target and the lift is
 * always enough for the tilt the leaf has. A body point whose belly is above the leaf passes
 * over it instead and presses it flat (its curled rim would rise into the worm); it springs
 * back once the worm has gone. A leaf the head is turning over swings up clear of the body it
 * reaches, and carries on over even when the body holds it up. A leaf that changes from
 * under the body to over it (or is placed on it) moves there with no in-between frame.
 *
 * A leaf slides with friction and settles on the litter, never below it. A leaf more than
 * HERO_RECYCLE from the head, or one pinned against the body (tight coils) for more than
 * TRAP_TIME, is recycled to a free spot ahead of the worm (around the head if every spot ahead
 * is on the body, as at the world's edge), chosen deterministically and kept inside the
 * playable world. A leaf shoved into a trunk, a rock or the log is pushed back out of its
 * footprint, and recycled if it stays wedged there (heroObstacles.ts). Pure: plain typed
 * arrays, no allocation per step (no Math.hypot, no subarray in the step path).
 */

const GRAVITY = 9.8;
/** A head shove faster than this (m/s) flips a resting leaf. */
const FLIP_SPEED = 0.6;
/** Flip spin (rad/s) and the little hop that goes with it (m/s). */
const FLIP_RATE = 9;
const HOP = 1.2;
/** Ground friction and air drag (1/s), and how fast a leaf settles flat (rad/s). */
const FRICTION = 8;
const DRAG = 1;
const SPIN_DAMP = 6;
const SETTLE = 14;
const MAX_SPEED = 3;
const MAX_SPIN = 10;
const MAX_FLIP_RATE = 15;
/** Below these a grounded leaf is at rest. */
const REST_SPEED = 1e-3;
const REST_ANGLE = 1e-4;
/** How fast the over-the-worm lift falls, and the tilt follows (1/s). */
const LIFT_DOWN = 10;
const PITCH_RATE = 14;
/** How fast a pressed leaf springs back to its cupped form (1/s). */
const UNPRESS = 3;
/** Pinned against the body this long (s): recycled. */
const TRAP_TIME = 2;
/** Beyond the farthest any body point acts on a leaf (skirt or press ramp), plus a hair. */
const SLEEP_MARGIN = Math.max(SKIRT, PRESS_RAMP) + 0.02;
const bounds = { x: 0, z: 0, r: 0 };
/** Steps this long or longer (s), or not finite, are ignored. */
const MAX_DT = 1;

/**
 * One physics step. `pushers` packs PUSHER_STRIDE floats per body point, in order along the
 * body: [x, z, radius, strength, top, under, belly, fall]. radius is the body's half-width
 * there; strength is 1 at the head (>= 0.9 counts as the head, which always shoves and flips)
 * and lower along the body; `top` is the height of the worm's top surface there, `under` is
 * 0..1 (0 riding on the litter, 1 under it; it scales the body's shove), `belly` the height of
 * its underside and `fall` how far its top drops to its side (heroClearance.ts). `count`
 * pushers are read. (hx, hz, heading): the head, for recycling.
 */
export function stepHeroLeaves(
  p: HeroLeaves, dt: number, pushers: Float32Array, count: number,
  hx: number, hz: number, heading: number, surfaceAt: SurfaceFn,
): void {
  if (!(dt > 0 && dt < MAX_DT)) return;
  const friction = Math.exp(-FRICTION * dt);
  const drag = Math.exp(-DRAG * dt);
  const spinDamp = Math.exp(-SPIN_DAMP * dt);
  const liftDown = 1 - Math.exp(-LIFT_DOWN * dt);
  const pitchK = 1 - Math.exp(-PITCH_RATE * dt);
  const settleDecay = Math.exp(-SETTLE * dt);
  const unpress = 1 - Math.exp(-UNPRESS * dt);
  // The head pusher's velocity since the last step (none on the first, or without a head).
  let hk = -1;
  for (let k = 0; k < count && hk < 0; k++) if (pushers[k * PUSHER_STRIDE + 3] >= HEAD_STRENGTH) hk = k * PUSHER_STRIDE;
  const hpx = hk >= 0 ? pushers[hk] : NaN;
  const hpz = hk >= 0 ? pushers[hk + 1] : NaN;
  const hvx = hpx === hpx && p.headX === p.headX ? (hpx - p.headX) / dt : 0;
  const hvz = hpz === hpz && p.headZ === p.headZ ? (hpz - p.headZ) / dt : 0;
  p.headX = hpx;
  p.headZ = hpz;
  // The body's bounding circle, for the leaves no body point can reach (they sleep).
  bodyBounds(pushers, count, bounds);
  const bcx = bounds.x;
  const bcz = bounds.z;
  const bodyR = bounds.r;
  const shortcuts = heroShortcuts.on;
  const grown = dt / HERO_GROW_IN;
  for (let i = 0; i < p.count; i++) {
    if (p.grow[i] < 1) p.grow[i] = Math.min(1, p.grow[i] + grown);
    const hdx = p.x[i] - hx;
    const hdz = p.z[i] - hz;
    if (Math.sqrt(hdx * hdx + hdz * hdz) > HERO_RECYCLE) {
      settle(p, i, respawn(p, i, hx, hz, heading, surfaceAt, false, pushers, count), pushers, count);
      continue;
    }
    if (shortcuts && atRest(p, i)) {
      // At rest and beyond the reach of every body point (its shove, lift, press and skirt):
      // a full step would leave it exactly as it is.
      const dx = p.x[i] - bcx;
      const dz = p.z[i] - bcz;
      const pad = bodyR + p.size[i] * LEAF_REACH[p.kind[i]] + PUSHER_SPAN + SLEEP_MARGIN;
      if (pad < 0 || !(dx * dx + dz * dz < pad * pad)) {
        p.pinned[i] = 0;
        p.wedged[i] = 0;
        continue;
      }
    }
    const slotBias = i * HERO_Y_BIAS;
    const sx = p.x[i];
    const sz = p.z[i];
    const surf0 = surfaceOr(surfaceAt, sx, sz, p.y[i]);
    const grounded = p.y[i] <= surf0 + p.lift[i] + slotBias + 1e-4;
    const reach = p.size[i] * LEAF_REACH[p.kind[i]];
    // A leaf lying over the body rests on it: nothing beneath it shoves it or turns it over.
    const held = p.lift[i] > HELD;
    let pinned = false;
    for (let k = 0; k < count && !held; k++) {
      const o = k * PUSHER_STRIDE;
      let nx = p.x[i] - pushers[o];
      let nz = p.z[i] - pushers[o + 1];
      const d = Math.sqrt(nx * nx + nz * nz);
      const radius = pushers[o + 2];
      const strength = pushers[o + 3];
      const under = pushers[o + 5];
      const head = strength >= HEAD_STRENGTH;
      if (!(d < radius + reach)) continue;
      // The body point against the leaf's own outline, as it lies.
      const edge = d > 1e-6
        ? reachToward(p.kind[i], p.size[i], p.yaw[i], p.flip[i], -nx / d, -nz / d)
        : p.size[i] * 0.4;
      if (head && grounded && d > 1e-6 && d < radius + edge && Math.abs(p.flipRate[i]) < 0.5) {
        // The head meets the leaf's edge fast: the near edge lifts and the leaf rolls over
        // away from it (in the same step, before the leaf can go over the head instead).
        const meet = ((hvx - p.vx[i]) * nx + (hvz - p.vz[i]) * nz) / d;
        if (meet > FLIP_SPEED) {
          const across = (nx * Math.cos(p.yaw[i]) - nz * Math.sin(p.yaw[i])) / d;
          p.flipRate[i] = across >= 0 ? -FLIP_RATE : FLIP_RATE;
          p.vy[i] = HOP;
        }
      }
      const overlap = radius + edge - d;
      if (overlap <= 0) continue;
      const push = head ? strength : strength * (1 - under);
      if (!(push > 0)) continue;
      if (!head && push > 0.05) pinned = true;
      if (d > 1e-6) {
        nx /= d;
        nz /= d;
      } else {
        nx = Math.sin(heading);
        nz = Math.cos(heading);
      }
      // Out of the overlap, carrying the shove on as velocity.
      p.x[i] += nx * overlap;
      p.z[i] += nz * overlap;
      const shove = overlap / dt;
      p.vx[i] += nx * shove * 0.5 * push;
      p.vz[i] += nz * shove * 0.5 * push;
      // Across the leaf: its own x axis is (cos yaw, -sin yaw) on the ground.
      const across = nx * Math.cos(p.yaw[i]) - nz * Math.sin(p.yaw[i]);
      p.spin[i] += across * shove * 0.8 * push;
    }
    // Pinned against the body for too long (tight coils): move it clear.
    p.pinned[i] = pinned ? p.pinned[i] + dt : 0;
    if (p.pinned[i] > TRAP_TIME) {
      settle(p, i, respawn(p, i, hx, hz, heading, surfaceAt, false, pushers, count), pushers, count);
      continue;
    }
    p.vx[i] = clamp(p.vx[i], MAX_SPEED);
    p.vz[i] = clamp(p.vz[i], MAX_SPEED);
    p.spin[i] = clamp(p.spin[i], MAX_SPIN);
    p.flipRate[i] = clamp(p.flipRate[i], MAX_FLIP_RATE);
    p.vy[i] -= GRAVITY * dt;
    p.x[i] = clamp(p.x[i] + p.vx[i] * dt, WORLD_HALF);
    p.z[i] = clamp(p.z[i] + p.vz[i] * dt, WORLD_HALF);
    p.y[i] += p.vy[i] * dt;
    p.yaw[i] += p.spin[i] * dt;
    // Shoved into a trunk, a rock or the log: back out; wedged there for long, recycled.
    if (unwedge(p, i, OBSTACLE_PAD * reach, dt)) {
      settle(p, i, respawn(p, i, hx, hz, heading, surfaceAt, false, pushers, count), pushers, count);
      continue;
    }
    const surf = shortcuts && p.x[i] === sx && p.z[i] === sz ? surf0 : surfaceOr(surfaceAt, p.x[i], p.z[i], surf0);
    const jumped = rideBody(p, i, surf, pushers, count, pitchK, liftDown, unpress);
    const floor = surf + p.lift[i] + slotBias;
    // Hopping up as it turns over, a leaf the body lifts is carried up, still in the air.
    if (p.y[i] < floor && p.vy[i] > 0) p.y[i] = floor;
    const landed = p.y[i] <= floor && !(p.vy[i] > 0);
    // Turning over: still swinging away from the face it left, it turns freely in the air; on
    // the ground (or the worm) it carries on to the next face. Past halfway, in the air or not,
    // a critically damped spring (solved exactly, so stable for any step) settles it on the
    // nearest face, so it never spins on past it.
    const nearest = Math.round(p.flip[i] / Math.PI);
    const rate = p.flipRate[i];
    const away = Math.abs(rate) > 0.5 && rate * (p.flip[i] - nearest * Math.PI) > 0;
    const target = (away ? nearest + Math.sign(rate) : nearest) * Math.PI;
    if (landed || !away) {
      const off = p.flip[i] - target;
      const c = rate + SETTLE * off;
      p.flip[i] = target + (off + c * dt) * settleDecay;
      p.flipRate[i] = (rate - SETTLE * c * dt) * settleDecay;
    } else {
      p.flip[i] += rate * dt;
    }
    if (landed) {
      // Resting on the litter (or on the worm below it): never below; friction; at rest flat,
      // face up or face down.
      p.y[i] = floor;
      if (p.vy[i] < 0) p.vy[i] = 0;
      p.vx[i] *= friction;
      p.vz[i] *= friction;
      p.spin[i] *= spinDamp;
      const vh = Math.sqrt(p.vx[i] * p.vx[i] + p.vz[i] * p.vz[i]);
      if (vh < REST_SPEED) p.vx[i] = p.vz[i] = 0;
      if (Math.abs(p.spin[i]) < REST_SPEED) p.spin[i] = 0;
      if (Math.abs(p.flipRate[i]) < REST_SPEED && Math.abs(p.flip[i] - target) < REST_ANGLE) {
        p.flipRate[i] = 0;
        p.flip[i] = target;
      }
    } else {
      p.vx[i] *= drag;
      p.vz[i] *= drag;
    }
    if (jumped) {
      // From under the body to over it: no frame in between (it would cut through the worm).
      p.py[i] = p.y[i];
      p.ppitch[i] = p.pitch[i];
      p.ppitchDir[i] = p.pitchDir[i];
      p.pflat[i] = p.flat[i];
    }
  }
}
