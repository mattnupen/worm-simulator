import { LEAF_KINDS } from './leafLitter';
import { scaleSpec } from './worldScale';

/**
 * The hero-leaf pool (spec 5.4): the per-slot state of a small set of loose leaves, as plain
 * typed arrays (see heroLeaves.ts for their physics, heroSpawn.ts for where they appear).
 */

export const HERO_MAX = 32;
/** Leaves start within this of the head... */
export const HERO_RADIUS = 3;
/** ...and are recycled beyond this. */
export const HERO_RECYCLE = 4;
/** Slot i rests i * HERO_Y_BIAS above the surface so overlapping leaves never z-fight. */
export const HERO_Y_BIAS = 0.0006;
/** A leaf that appears (scattered or recycled) grows in from nothing over this long (s), so it never pops in. */
export const HERO_GROW_IN = 0.18;

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
  /** How long (s) the leaf has been continuously pushed back out of a trunk, rock or the log. */
  readonly wedged: Float32Array;
  /**
   * How flat the leaf is pressed (0 its natural cupped form, 1 flat): a body point riding on
   * the litter presses a leaf it passes over, which springs back once the worm has gone.
   */
  readonly flat: Float32Array;
  /** How far (0 to 1) the leaf has grown in since it appeared (HERO_GROW_IN); drawing only. */
  readonly grow: Float32Array;
  /** The previous step, for render interpolation. */
  readonly px: Float32Array; readonly py: Float32Array; readonly pz: Float32Array;
  readonly pyaw: Float32Array; readonly pflip: Float32Array; readonly ppitch: Float32Array;
  readonly ppitchDir: Float32Array;
  readonly pflat: Float32Array; readonly pgrow: Float32Array;
  /** Leaf length (m) and species index (into LEAF_KINDS), fixed per slot. */
  readonly size: Float32Array;
  readonly kind: Uint8Array;
}

/** Integer hash to [0, 1). */
export function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b + 0x632be5ab) | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Sets every slot's leaf length from its fixed base (0.55 to 1 m) times its species' size in the
 * active scale mode (worldScale.ts). createHeroLeaves calls it; call it again after a mode change.
 */
export function sizeHeroLeaves(p: HeroLeaves): void {
  const grow = scaleSpec().leaf;
  for (let i = 0; i < p.max; i++) p.size[i] = (0.55 + 0.45 * hash01(i, p.seed + 101)) * grow[LEAF_KINDS[p.kind[i]]];
}

export function createHeroLeaves(max = HERO_MAX, seed = 1): HeroLeaves {
  const f = () => new Float32Array(max);
  const p: HeroLeaves = {
    max, count: 0, seed, spawned: 0, headX: NaN, headZ: NaN,
    x: f(), y: f(), z: f(), yaw: f(), flip: f(), vx: f(), vy: f(), vz: f(), spin: f(), flipRate: f(),
    pitch: f(), pitchDir: f(), lift: f(), pinned: f(), wedged: f(), flat: f(), grow: f(),
    px: f(), py: f(), pz: f(), pyaw: f(), pflip: f(), ppitch: f(), ppitchDir: f(), pflat: f(), pgrow: f(),
    size: f(), kind: new Uint8Array(max),
  };
  for (let i = 0; i < max; i++) p.kind[i] = Math.floor(hash01(i, seed + 202) * 5);
  sizeHeroLeaves(p);
  return p;
}

/**
 * Empties the pool back to exactly how createHeroLeaves made it: no live leaves, no respawns
 * yet, every slot's state zeroed (its size and species are fixed per slot and stay).
 */
export function clearHeroLeaves(p: HeroLeaves): void {
  p.count = 0;
  p.spawned = 0;
  p.headX = NaN;
  p.headZ = NaN;
  for (const a of [
    p.x, p.y, p.z, p.yaw, p.flip, p.vx, p.vy, p.vz, p.spin, p.flipRate, p.pitch, p.pitchDir, p.lift,
    p.pinned, p.wedged, p.flat, p.grow, p.px, p.py, p.pz, p.pyaw, p.pflip, p.ppitch, p.ppitchDir, p.pflat,
    p.pgrow,
  ]) a.fill(0);
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
    p.pgrow[i] = p.grow[i];
  }
}

/** The surface at (x, z), or `fallback` if the surface function gives a non-finite height. */
export function surfaceOr(surfaceAt: SurfaceFn, x: number, z: number, fallback: number): number {
  const s = surfaceAt(x, z);
  return Number.isFinite(s) ? s : fallback;
}

export const clamp = (v: number, m: number): number => Math.max(-m, Math.min(m, v));
