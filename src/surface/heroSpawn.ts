import { PLAY_HALF } from './terrain';
import { LEAF_REACH, PUSHER_STRIDE } from './heroClearance';
import { obstacleDepth, type ObstacleHit } from './obstacles';
import {
  HERO_RADIUS, HERO_RECYCLE, HERO_Y_BIAS, clamp, hash01, surfaceOr, type HeroLeaves, type SurfaceFn,
} from './heroPool';

/** Where hero leaves appear: free spots near the head, clear of each other and of the body. */

/** Two hero leaves start no closer than this... */
const SPACING = 0.6;
/** ...and a best spot nearer than this to another leaf sends it to the ring search (no stacking). */
const STACKED = 0.15;
/** No body: for placing leaves with nothing to keep clear of. */
const NO_BODY = new Float32Array(0);
/** A new leaf lands at least this far (m) beyond the body's side and its own reach. */
const BODY_GAP = 0.1;
/** A leaf's centre keeps this share of its reach clear of trunks, rocks and the log. */
export const OBSTACLE_PAD = 0.5;
const hit: ObstacleHit = { nx: 0, nz: 0 };

/**
 * The fallback search: RINGS rings of RING_SPOTS spots, RING_STEP (m) apart, round the head. The
 * outer ring stays RECYCLE_MARGIN inside HERO_RECYCLE, or a leaf placed on it would be recycled
 * again on the next step (5 rings, out to 3.5).
 */
const RING_SPOTS = 12;
const RING_STEP = 0.7;
const RECYCLE_MARGIN = 0.3;
const RINGS = Math.floor((HERO_RECYCLE - RECYCLE_MARGIN) / RING_STEP);
/**
 * The ring search's order, as (ring, spot) pairs: spot 0 straight ahead, +k and -k to its left and
 * right. First the front half (up to a quarter turn either side), nearest ring first, then the back
 * half: a leaf lands behind the head only when nothing ahead of it or beside it is free.
 */
const RING_ORDER: Int8Array = (() => {
  const half = RING_SPOTS / 2;
  const side = (k: number) => (k === 0 ? [0] : k === half ? [k] : [k, -k]);
  const pairs: number[] = [];
  for (const [from, to] of [[0, half / 2], [half / 2 + 1, half]]) {
    for (let ring = 1; ring <= RINGS; ring++) {
      for (let k = from; k <= to; k++) for (const a of side(k)) pairs.push(ring, a);
    }
  }
  return Int8Array.from(pairs);
})();
/** Where the back half starts in RING_ORDER (an index into it). */
const RING_FRONT = 2 * RINGS * (RING_SPOTS / 2 + 1);

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

/** Squared distance from (x, z) to the nearest active leaf other than slot i (Infinity if none). */
function nearestLeaf2(p: HeroLeaves, i: number, x: number, z: number): number {
  let best = Infinity;
  for (let j = 0; j < p.count; j++) {
    if (j === i) continue;
    const dx = p.x[j] - x;
    const dz = p.z[j] - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) best = d2;
  }
  return best;
}

/**
 * Moves slot i to a free spot: around the head (`around`) or ahead of it, inside the playable
 * world, clear of the other leaves, of trunks, rocks and the log, and of the body (`count`
 * pushers; at the world's edge or beside a big prop the spots ahead can all be blocked, so later
 * tries look wider, still in front of the head). Resets its motion.
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
  // If no spot is clear of both the body and the other leaves: the spot clear of the body that
  // is farthest from its nearest leaf (so leaves crowded together still do not stack).
  let fx2 = NaN;
  let fz2 = NaN;
  let far2 = -1;
  let onBody = false;
  let found = false;
  for (let c = 0; c < 8 && !found; c++) {
    // Crowded by other leaves only: the least crowded spot ahead will do.
    if (c === 4 && !onBody) break;
    const n = p.spawned * 4 + (c & 3) + (c >> 2) * 0x10000;
    const h1 = hash01(n, p.seed);
    const h2 = hash01(n, p.seed + 7);
    if (around || c >= 4) {
      // Scattered round the head; a recycled leaf only in front of it (up to a quarter turn
      // either side of the heading), so the worm still meets it.
      const r = 0.5 + (HERO_RADIUS - 0.5) * Math.sqrt(h1);
      const a = around ? h2 * Math.PI * 2 : Math.atan2(fz, fx) + (h2 - 0.5) * Math.PI;
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
    const d2 = nearestLeaf2(p, i, x, z);
    found = d2 >= SPACING * SPACING;
    if (!found && d2 > far2) {
      far2 = d2;
      fx2 = x;
      fz2 = z;
    }
  }
  if (!found && fx2 === fx2) {
    x = fx2;
    z = fz2;
  }
  // Every spot tried can lie in one big footprint (a True-scale trunk is wider than the spawn
  // ring), or, where few spots are free (the world's edge, crowded by big props), the best of them
  // can be on top of another leaf: look round the head, in front of it first (RING_ORDER), for the
  // nearest spot off the footprints, off the body and SPACING from the other leaves, else the least
  // crowded such spot (in front, if one there does not stack). Each leaf turns the spots its own
  // amount, and each takes the next spot along once one is used, so leaves falling back together
  // spread out instead of stacking. Only when no spot is off the footprints and the body (never seen) does a
  // leaf in a footprint land at the head, which the worm keeps clear of every footprint.
  const inProp = obstacleDepth(x, z, OBSTACLE_PAD * clear0, hit) > 0;
  // How near the spot is to another leaf (Infinity: spaced, or no try was off the body).
  const crowd2 = found || far2 < 0 ? Infinity : far2;
  if (inProp || crowd2 < STACKED * STACKED) {
    // Straight ahead, then alternately left and right of it, each spot turned toward the heading
    // by a per-leaf share of half a spot (so the side spots stay in front).
    const forward = Math.atan2(fz, fx);
    const turn = hash01(p.spawned, p.seed + 17) * 0.5;
    let rx = hx;
    let rz = hz;
    let rfar2 = -1;
    let spaced = false;
    for (let s = 0; s < RING_ORDER.length && !spaced; s += 2) {
      // Past the front half: a spot there that does not stack on another leaf beats a spaced one behind.
      if (s === RING_FRONT && rfar2 >= STACKED * STACKED) break;
      const r = RING_ORDER[s] * RING_STEP;
      const k = RING_ORDER[s + 1];
      const ang = forward + (k === 0 ? turn - 0.25 : k - Math.sign(k) * turn) * ((Math.PI * 2) / RING_SPOTS);
      const sx = clamp(hx + Math.cos(ang) * r, PLAY_HALF);
      const sz = clamp(hz + Math.sin(ang) * r, PLAY_HALF);
      if (!freeSpot(sx, sz, clear0, pushers, count)) continue;
      const d2 = nearestLeaf2(p, i, sx, sz);
      spaced = d2 >= SPACING * SPACING;
      if (d2 > rfar2) {
        rfar2 = d2;
        rx = sx;
        rz = sz;
      }
    }
    if (inProp || rfar2 > crowd2) {
      x = rx;
      z = rz;
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
