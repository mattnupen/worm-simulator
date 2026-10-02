import { WORLD_HALF } from './terrain';

/**
 * Hero leaves (spec 5.4): a small pool of loose leaves lying on top of the litter near the
 * worm's head, with simple damped physics run every step. The head and body shove a leaf they
 * overlap (the head hardest); a strong shove from the head lifts its near edge so it flips
 * over; it slides with friction and settles on the litter, never below it. A leaf more than
 * HERO_RECYCLE from the head is recycled to a free spot ahead of the worm, chosen
 * deterministically. Pure: plain typed arrays, no allocation per step.
 */
export const HERO_MAX = 32;
/** Leaves start within this of the head... */
export const HERO_RADIUS = 3;
/** ...and are recycled beyond this. */
export const HERO_RECYCLE = 4;

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

/** Height (m) of the rendered litter top at (x, z): `litterTop` (src/worm/surfaceHeight.ts) in the game. */
export type SurfaceFn = (x: number, z: number) => number;

export interface HeroLeaves {
  readonly max: number;
  /** Active leaves: the first `count` slots. */
  count: number;
  readonly seed: number;
  /** Respawns so far: feeds the deterministic choice of the next free spot. */
  spawned: number;
  readonly x: Float32Array; readonly y: Float32Array; readonly z: Float32Array;
  /** Turn about the vertical, and the flip about the leaf's own midrib (0 face up, pi face down). */
  readonly yaw: Float32Array; readonly flip: Float32Array;
  readonly vx: Float32Array; readonly vy: Float32Array; readonly vz: Float32Array;
  readonly spin: Float32Array; readonly flipRate: Float32Array;
  /** The previous step, for render interpolation. */
  readonly px: Float32Array; readonly py: Float32Array; readonly pz: Float32Array;
  readonly pyaw: Float32Array; readonly pflip: Float32Array;
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
    max, count: 0, seed, spawned: 0,
    x: f(), y: f(), z: f(), yaw: f(), flip: f(), vx: f(), vy: f(), vz: f(), spin: f(), flipRate: f(),
    px: f(), py: f(), pz: f(), pyaw: f(), pflip: f(), size: f(), kind: new Uint8Array(max),
  };
  for (let i = 0; i < max; i++) {
    p.size[i] = 0.55 + 0.45 * hash01(i, seed + 101);
    p.kind[i] = Math.floor(hash01(i, seed + 202) * 5);
  }
  return p;
}

/** Moves slot i to a free spot: around the head (`around`) or ahead of it. Resets its motion. */
function respawn(p: HeroLeaves, i: number, hx: number, hz: number, heading: number, surfaceAt: SurfaceFn, around: boolean): void {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  let x = hx;
  let z = hz;
  for (let c = 0; c < 4; c++) {
    const n = p.spawned * 4 + c;
    const h1 = hash01(n, p.seed);
    const h2 = hash01(n, p.seed + 7);
    if (around) {
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
    let free = true;
    for (let j = 0; j < p.count && free; j++) {
      if (j !== i && Math.hypot(p.x[j] - x, p.z[j] - z) < SPACING) free = false;
    }
    if (free) break;
  }
  const h3 = hash01(p.spawned, p.seed + 13);
  p.spawned++;
  p.x[i] = p.px[i] = x;
  p.z[i] = p.pz[i] = z;
  p.y[i] = p.py[i] = surfaceAt(x, z);
  p.yaw[i] = p.pyaw[i] = h3 * Math.PI * 2;
  p.flip[i] = p.pflip[i] = h3 < 0.25 ? Math.PI : 0;
  p.vx[i] = p.vy[i] = p.vz[i] = p.spin[i] = p.flipRate[i] = 0;
}

/** Sets how many leaves are active (the preset). New ones are scattered around the head. */
export function setHeroCount(p: HeroLeaves, n: number, hx: number, hz: number, heading: number, surfaceAt: SurfaceFn): void {
  const next = Math.max(0, Math.min(p.max, Math.floor(n)));
  const prev = p.count;
  p.count = next;
  for (let i = prev; i < next; i++) respawn(p, i, hx, hz, heading, surfaceAt, true);
}

/** Copies the current state to the previous-step arrays (call at the start of each step). */
export function snapshotHeroLeaves(p: HeroLeaves): void {
  const n = p.count;
  p.px.set(p.x.subarray(0, n));
  p.py.set(p.y.subarray(0, n));
  p.pz.set(p.z.subarray(0, n));
  p.pyaw.set(p.yaw.subarray(0, n));
  p.pflip.set(p.flip.subarray(0, n));
}

const clamp = (v: number, m: number): number => Math.max(-m, Math.min(m, v));

/**
 * One physics step. `pushers` packs [x, z, radius, strength] per body point (strength 1 at the
 * head); `count` of them are read. (hx, hz, heading): the head, for recycling.
 */
export function stepHeroLeaves(
  p: HeroLeaves, dt: number, pushers: Float32Array, count: number,
  hx: number, hz: number, heading: number, surfaceAt: SurfaceFn,
): void {
  if (!(dt > 0)) return;
  const friction = Math.exp(-FRICTION * dt);
  const drag = Math.exp(-DRAG * dt);
  const spinDamp = Math.exp(-SPIN_DAMP * dt);
  for (let i = 0; i < p.count; i++) {
    if (Math.hypot(p.x[i] - hx, p.z[i] - hz) > HERO_RECYCLE) {
      respawn(p, i, hx, hz, heading, surfaceAt, false);
      continue;
    }
    const grounded = p.y[i] <= surfaceAt(p.x[i], p.z[i]) + 1e-4;
    const r = p.size[i] * 0.4;
    for (let k = 0; k < count; k++) {
      const o = k * 4;
      let nx = p.x[i] - pushers[o];
      let nz = p.z[i] - pushers[o + 1];
      const d = Math.hypot(nx, nz);
      const overlap = pushers[o + 2] + r - d;
      if (overlap <= 0) continue;
      if (d > 1e-6) {
        nx /= d;
        nz /= d;
      } else {
        nx = Math.sin(heading);
        nz = Math.cos(heading);
      }
      const strength = pushers[o + 3];
      // Out of the overlap, carrying the shove on as velocity.
      p.x[i] += nx * overlap;
      p.z[i] += nz * overlap;
      const shove = overlap / dt;
      p.vx[i] += nx * shove * 0.5 * strength;
      p.vz[i] += nz * shove * 0.5 * strength;
      // Across the leaf: its own x axis is (cos yaw, -sin yaw) on the ground.
      const across = nx * Math.cos(p.yaw[i]) - nz * Math.sin(p.yaw[i]);
      p.spin[i] += across * shove * 0.8 * strength;
      if (grounded && strength >= 0.9 && shove > FLIP_SPEED && Math.abs(p.flipRate[i]) < 0.5) {
        // The near edge lifts: the leaf rolls over away from the push.
        p.flipRate[i] = across >= 0 ? -FLIP_RATE : FLIP_RATE;
        p.vy[i] = HOP;
      }
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
    p.flip[i] += p.flipRate[i] * dt;
    const floor = surfaceAt(p.x[i], p.z[i]);
    if (p.y[i] <= floor) {
      // Resting on the litter: never below it; friction; settles flat, face up or face down.
      p.y[i] = floor;
      if (p.vy[i] < 0) p.vy[i] = 0;
      p.vx[i] *= friction;
      p.vz[i] *= friction;
      p.spin[i] *= spinDamp;
      const target = Math.round(p.flip[i] / Math.PI) * Math.PI;
      p.flipRate[i] += (SETTLE * SETTLE * (target - p.flip[i]) - 2 * SETTLE * p.flipRate[i]) * dt;
      if (Math.hypot(p.vx[i], p.vz[i]) < REST_SPEED) p.vx[i] = p.vz[i] = 0;
      if (Math.abs(p.spin[i]) < REST_SPEED) p.spin[i] = 0;
      if (Math.abs(p.flipRate[i]) < REST_SPEED && Math.abs(p.flip[i] - target) < REST_ANGLE) {
        p.flipRate[i] = 0;
        p.flip[i] = target;
      }
    } else {
      p.vx[i] *= drag;
      p.vz[i] *= drag;
    }
  }
}
