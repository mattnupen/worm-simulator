import { PLAY_HALF, WORLD_HALF } from './terrain';
import {
  HEAD_STRENGTH, LEAF_REACH, PRESS_RAMP, PUSHER_SPAN, PUSHER_STRIDE, SKIRT, bestTilt, heroShortcuts,
  liftForTilt, overBody, pressTarget, reachToward,
} from './heroClearance';

export { PUSHER_SPAN, PUSHER_STRIDE } from './heroClearance';

/**
 * Hero leaves (spec 5.4): a small pool of loose leaves lying on top of the litter near the
 * worm's head, with simple damped physics run every step.
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
 * playable world. Pure: plain typed arrays, no allocation per step (no Math.hypot,
 * no subarray in the step path).
 */
export const HERO_MAX = 32;
/** Leaves start within this of the head... */
export const HERO_RADIUS = 3;
/** ...and are recycled beyond this. */
export const HERO_RECYCLE = 4;
/** Slot i rests i * HERO_Y_BIAS above the surface so overlapping leaves never z-fight. */
export const HERO_Y_BIAS = 0.0006;

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
/** Two hero leaves start no closer than this. */
const SPACING = 0.6;
/** How fast the over-the-worm lift falls, and the tilt follows (1/s). */
const LIFT_DOWN = 10;
const PITCH_RATE = 14;
/** How fast a pressed leaf springs back to its cupped form (1/s). */
const UNPRESS = 3;
/** Pinned against the body this long (s): recycled. */
const TRAP_TIME = 2;
/** A leaf held at least this high (m) is lying over the body. */
const HELD = 0.002;
/** Beyond the farthest any body point acts on a leaf (skirt or press ramp), plus a hair. */
const SLEEP_MARGIN = Math.max(SKIRT, PRESS_RAMP) + 0.02;
/** Steps this long or longer (s), or not finite, are ignored. */
const MAX_DT = 1;

/** Height (m) of the rendered litter top at (x, z): `litterTop` (src/worm/surfaceHeight.ts) in the game. */
export type SurfaceFn = (x: number, z: number) => number;

export interface HeroLeaves {
  readonly max: number;
  /** Active leaves: the first `count` slots. */
  count: number;
  readonly seed: number;
  /** Respawns so far: feeds the deterministic choice of the next free spot. */
  spawned: number;
  /** The head pusher at the last step (NaN before the first), for how fast it meets a leaf. */
  headX: number;
  headZ: number;
  readonly x: Float32Array; readonly y: Float32Array; readonly z: Float32Array;
  /** Turn about the vertical, and the flip about the leaf's own midrib (0 face up, pi face down). */
  readonly yaw: Float32Array; readonly flip: Float32Array;
  readonly vx: Float32Array; readonly vy: Float32Array; readonly vz: Float32Array;
  readonly spin: Float32Array; readonly flipRate: Float32Array;
  /**
   * Tilt of a leaf lying across the worm: `pitch` radians (0 flat) down toward the world
   * direction (sin pitchDir, cos pitchDir) on the ground plane. It relaxes back to 0 once the
   * worm has passed; pitchDir keeps its last value.
   */
  readonly pitch: Float32Array; readonly pitchDir: Float32Array;
  /** Height above the litter the leaf is currently held at by the worm below it. */
  readonly lift: Float32Array;
  /** How long (s) the leaf has been continuously pinned against the body. */
  readonly pinned: Float32Array;
  /**
   * How flat the leaf is pressed (0 its natural cupped form, 1 flat): a body point riding on
   * the litter presses a leaf it passes over, which springs back once the worm has gone.
   */
  readonly flat: Float32Array;
  /** The previous step, for render interpolation. */
  readonly px: Float32Array; readonly py: Float32Array; readonly pz: Float32Array;
  readonly pyaw: Float32Array; readonly pflip: Float32Array; readonly ppitch: Float32Array;
  readonly ppitchDir: Float32Array;
  readonly pflat: Float32Array;
  /** Leaf length (m) and species index (into LEAF_KINDS), fixed per slot. */
  readonly size: Float32Array;
  readonly kind: Uint8Array;
}

/** Integer hash to [0, 1). */
function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b + 0x632be5ab) | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function createHeroLeaves(max = HERO_MAX, seed = 1): HeroLeaves {
  const f = () => new Float32Array(max);
  const p: HeroLeaves = {
    max, count: 0, seed, spawned: 0, headX: NaN, headZ: NaN,
    x: f(), y: f(), z: f(), yaw: f(), flip: f(), vx: f(), vy: f(), vz: f(), spin: f(), flipRate: f(),
    pitch: f(), pitchDir: f(), lift: f(), pinned: f(), flat: f(),
    px: f(), py: f(), pz: f(), pyaw: f(), pflip: f(), ppitch: f(), ppitchDir: f(), pflat: f(), size: f(), kind: new Uint8Array(max),
  };
  for (let i = 0; i < max; i++) {
    p.size[i] = 0.55 + 0.45 * hash01(i, seed + 101);
    p.kind[i] = Math.floor(hash01(i, seed + 202) * 5);
  }
  return p;
}

/** The surface at (x, z), or `fallback` if the surface function gives a non-finite height. */
function surfaceOr(surfaceAt: SurfaceFn, x: number, z: number, fallback: number): number {
  const s = surfaceAt(x, z);
  return Number.isFinite(s) ? s : fallback;
}

const clamp = (v: number, m: number): number => Math.max(-m, Math.min(m, v));

/** No body: for placing leaves with nothing to keep clear of. */
const NO_BODY = new Float32Array(0);
/** A new leaf lands at least this far (m) beyond the body's side and its own reach. */
const BODY_GAP = 0.1;

/**
 * Moves slot i to a free spot: around the head (`around`) or ahead of it, inside the playable
 * world, clear of the other leaves and of the body (`count` pushers; at the world's edge the
 * spots ahead can all be on it, so later tries look around the head too). Resets its motion.
 * Only slots below `p.count` count as occupied.
 */
function respawn(
  p: HeroLeaves, i: number, hx: number, hz: number, heading: number, surfaceAt: SurfaceFn, around: boolean,
  pushers: Float32Array = NO_BODY, count = 0,
): number {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const clear = p.size[i] * LEAF_REACH[p.kind[i]] + BODY_GAP;
  let x = hx;
  let z = hz;
  // A spot clear of the body but crowded by other leaves, if no spot is clear of both.
  let fx2 = NaN;
  let fz2 = NaN;
  let onBody = false;
  let found = false;
  for (let c = 0; c < 8 && !found; c++) {
    // Crowded by other leaves only: the last spot ahead will do.
    if (c === 4 && !onBody) break;
    const n = p.spawned * 4 + (c & 3) + (c >> 2) * 0x10000;
    const h1 = hash01(n, p.seed);
    const h2 = hash01(n, p.seed + 7);
    if (around || c >= 4) {
      const r = 0.5 + (HERO_RADIUS - 0.5) * Math.sqrt(h1);
      const a = h2 * Math.PI * 2;
      x = hx + Math.cos(a) * r;
      z = hz + Math.sin(a) * r;
    } else {
      const ahead = 1.2 + 1.2 * h1;
      const side = (h2 * 2 - 1) * 1.6;
      x = hx + fx * ahead + fz * side;
      z = hz + fz * ahead - fx * side;
    }
    x = clamp(x, PLAY_HALF);
    z = clamp(z, PLAY_HALF);
    let clearOfBody = true;
    for (let k = 0; k < count && clearOfBody; k++) {
      const o = k * PUSHER_STRIDE;
      const dx = pushers[o] - x;
      const dz = pushers[o + 1] - z;
      const lim = pushers[o + 2] + clear;
      if (dx * dx + dz * dz < lim * lim) clearOfBody = false;
    }
    if (!clearOfBody) {
      onBody = true;
      continue;
    }
    if (fx2 !== fx2) {
      fx2 = x;
      fz2 = z;
    }
    found = true;
    for (let j = 0; j < p.count && found; j++) {
      if (j === i) continue;
      const dx = p.x[j] - x;
      const dz = p.z[j] - z;
      if (Math.sqrt(dx * dx + dz * dz) < SPACING) found = false;
    }
  }
  if (!found && onBody && fx2 === fx2) {
    x = fx2;
    z = fz2;
  }
  const h3 = hash01(p.spawned, p.seed + 13);
  p.spawned++;
  const prevY = Number.isFinite(p.y[i]) ? p.y[i] : 0;
  p.x[i] = p.px[i] = x;
  p.z[i] = p.pz[i] = z;
  // The surface where it is stored (Float32), as every step reads it.
  const surf = surfaceOr(surfaceAt, p.x[i], p.z[i], prevY);
  p.y[i] = p.py[i] = surf + i * HERO_Y_BIAS;
  p.yaw[i] = p.pyaw[i] = h3 * Math.PI * 2;
  p.flip[i] = p.pflip[i] = h3 < 0.25 ? Math.PI : 0;
  p.pitch[i] = p.ppitch[i] = 0;
  p.ppitchDir[i] = p.pitchDir[i];
  p.lift[i] = p.pinned[i] = 0;
  p.flat[i] = p.pflat[i] = 0;
  p.vx[i] = p.vy[i] = p.vz[i] = p.spin[i] = p.flipRate[i] = 0;
  return surf;
}

/**
 * Sets how many leaves are active (the preset). New ones are scattered around the head, away
 * from the leaves already placed (slots not yet placed are not counted) and from the body
 * (`count` pushers, as stepHeroLeaves takes them). A non-finite count is ignored.
 */
export function setHeroCount(
  p: HeroLeaves, n: number, hx: number, hz: number, heading: number, surfaceAt: SurfaceFn,
  pushers: Float32Array = NO_BODY, count = 0,
): void {
  if (!Number.isFinite(n)) return;
  const next = Math.max(0, Math.min(p.max, Math.floor(n)));
  const prev = p.count;
  p.count = Math.min(prev, next);
  for (let i = prev; i < next; i++) {
    respawn(p, i, hx, hz, heading, surfaceAt, true, pushers, count);
    p.count = i + 1;
  }
}

/**
 * Copies the current state to the previous-step arrays (call at the start of each step).
 * Plain loop: no per-call allocation.
 */
export function snapshotHeroLeaves(p: HeroLeaves): void {
  for (let i = 0; i < p.count; i++) {
    p.px[i] = p.x[i];
    p.py[i] = p.y[i];
    p.pz[i] = p.z[i];
    p.pyaw[i] = p.yaw[i];
    p.pflip[i] = p.flip[i];
    p.ppitch[i] = p.pitch[i];
    p.ppitchDir[i] = p.pitchDir[i];
    p.pflat[i] = p.flat[i];
  }
}

/**
 * Leaf i against the body where it lies now, on litter of height `surf`: over the body the tilt
 * eases toward the best one (by `pitchK`) and the lift is at least what that tilt needs (rising
 * at once), easing down otherwise (by `liftDown`); passed over by the body it is pressed flat at
 * once, springing back by `unpress`. Rates of 1 place it at once. Returns true when a leaf the
 * body was passing over (pressed) goes over it instead (the worm dived into the litter beside
 * it): it moves there at once, as it cannot slide through the body.
 */
function rideBody(
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
function settle(p: HeroLeaves, i: number, surf: number, pushers: Float32Array, count: number): void {
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
function atRest(p: HeroLeaves, i: number): boolean {
  return p.vx[i] === 0 && p.vz[i] === 0 && p.vy[i] === 0 && p.spin[i] === 0 && p.flipRate[i] === 0
    && p.lift[i] === 0 && p.pitch[i] === 0 && p.flat[i] === 0;
}

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
  let bcx = 0;
  let bcz = 0;
  for (let k = 0; k < count; k++) {
    bcx += pushers[k * PUSHER_STRIDE];
    bcz += pushers[k * PUSHER_STRIDE + 1];
  }
  if (count > 0) {
    bcx /= count;
    bcz /= count;
  }
  let bodyR = -Infinity;
  for (let k = 0; k < count; k++) {
    const o = k * PUSHER_STRIDE;
    const dx = pushers[o] - bcx;
    const dz = pushers[o + 1] - bcz;
    bodyR = Math.max(bodyR, Math.sqrt(dx * dx + dz * dz) + pushers[o + 2]);
  }
  const shortcuts = heroShortcuts.on;
  for (let i = 0; i < p.count; i++) {
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
