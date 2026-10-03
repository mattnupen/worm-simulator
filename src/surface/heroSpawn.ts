import { PLAY_HALF } from './terrain';
import { LEAF_REACH, PUSHER_STRIDE } from './heroClearance';
import { obstacleDepth, type ObstacleHit } from './obstacles';
import {
  HERO_RADIUS, HERO_Y_BIAS, clamp, hash01, surfaceOr, type HeroLeaves, type SurfaceFn,
} from './heroPool';

/** Where hero leaves appear: free spots near the head, clear of each other and of the body. */

/** Two hero leaves start no closer than this. */
const SPACING = 0.6;
/** No body: for placing leaves with nothing to keep clear of. */
const NO_BODY = new Float32Array(0);
/** A new leaf lands at least this far (m) beyond the body's side and its own reach. */
const BODY_GAP = 0.1;
/** A leaf's centre keeps this share of its reach clear of trunks, rocks and the log. */
export const OBSTACLE_PAD = 0.5;
const hit: ObstacleHit = { nx: 0, nz: 0 };

/** The fallback search: RINGS rings of RING_SPOTS spots, RING_STEP (m) apart, round the head. */
const RINGS = 6;
const RING_SPOTS = 12;
const RING_STEP = 0.7;

/**
 * Whether a leaf reaching `clear0` from its centre at (x, z) is off every trunk, rock and the log
 * (by OBSTACLE_PAD of its reach) and off the body (`count` pushers, by its reach plus BODY_GAP).
 */
function freeSpot(x: number, z: number, clear0: number, pushers: Float32Array, count: number): boolean {
  if (obstacleDepth(x, z, OBSTACLE_PAD * clear0, hit) > 0) return false;
  const clear = clear0 + BODY_GAP;
  for (let k = 0; k < count; k++) {
    const o = k * PUSHER_STRIDE;
    const dx = pushers[o] - x;
    const dz = pushers[o + 1] - z;
    const lim = pushers[o + 2] + clear;
    if (dx * dx + dz * dz < lim * lim) return false;
  }
  return true;
}

/**
 * Moves slot i to a free spot: around the head (`around`) or ahead of it, inside the playable
 * world, clear of the other leaves, of trunks, rocks and the log, and of the body (`count`
 * pushers; at the world's edge the spots ahead can all be on it, so later tries look around
 * the head too). Resets its motion.
 * Only slots below `p.count` count as occupied.
 */
export function respawn(
  p: HeroLeaves, i: number, hx: number, hz: number, heading: number, surfaceAt: SurfaceFn, around: boolean,
  pushers: Float32Array = NO_BODY, count = 0,
): number {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const clear0 = p.size[i] * LEAF_REACH[p.kind[i]];
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
    // Off trunks, rocks and the log too (they block like the body).
    if (!freeSpot(x, z, clear0, pushers, count)) {
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
  // Every spot tried can lie in one big footprint (a True-scale trunk is wider than the spawn
  // ring): look round the head, ring by ring, for the nearest spot off it and off the body. Only
  // when there is none (never seen) does the leaf land at the head, which the worm keeps clear of
  // every footprint.
  if (obstacleDepth(x, z, OBSTACLE_PAD * clear0, hit) > 0) {
    let free = false;
    for (let ring = 1; ring <= RINGS && !free; ring++) {
      for (let a = 0; a < RING_SPOTS && !free; a++) {
        const ang = ((a + ring * 0.5) / RING_SPOTS) * Math.PI * 2;
        const sx = clamp(hx + Math.cos(ang) * ring * RING_STEP, PLAY_HALF);
        const sz = clamp(hz + Math.sin(ang) * ring * RING_STEP, PLAY_HALF);
        if (!freeSpot(sx, sz, clear0, pushers, count)) continue;
        x = sx;
        z = sz;
        free = true;
      }
    }
    if (!free) {
      x = hx;
      z = hz;
    }
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
  p.lift[i] = p.pinned[i] = p.wedged[i] = 0;
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
