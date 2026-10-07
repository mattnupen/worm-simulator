import { footprints, obstacleDepth, type ObstacleHit } from '../surface/obstacles';
import { rocks } from '../surface/propPlacement';
import { PLAY_HALF, WORLD_HALF } from '../surface/terrain';
import { rockReach } from './sections';

/**
 * Where the worm may dig down, and which side of the cut the camera looks from (V2 spec 4.1).
 * Pure; allocates nothing per call.
 */

/** The dig point keeps this far off every rock and log footprint (more than a body width)... */
export const DIG_PAD = 0.5;
/**
 * ...and this far off every trunk's footprint: the worm's length. The cut has a section for each
 * rock and the log but none for a trunk, so for any heading the worm's own length of the cut either
 * side of the entry stays out of every trunk.
 */
export const TRUNK_PAD = 3.5;
/** ...and this far inside the worm's play area: not at the play edge. */
export const DIG_EDGE = 2.5;
/** The region in front of the cut that a camera side should find clear: u span, and depth range. */
const FRONT_HALF = 12;
const FRONT_NEAR = 0.3;
const FRONT_FAR = 11;
/** The camera stands up to this far from the cut (Wide on a phone is the farthest; cutCamera.ts)... */
export const CAM_REACH = 11.5;
/** The follow camera starts this far behind the head (CAM_OPTS.distance)... */
const CAM_BEHIND = 2.6;
/** ...and its swing keeps this far off a trunk's footprint. */
const CAM_PAD = 0.3;

const hit: ObstacleHit = { nx: 0, nz: 0 };

/**
 * True where the worm may dig down: open ground, not within DIG_PAD of a rock (as far as it
 * bulges underground, `rockReach`) or the log, not within TRUNK_PAD of a trunk, not at the play edge.
 */
export function canDigAt(x: number, z: number): boolean {
  if (Math.abs(x) > PLAY_HALF - DIG_EDGE || Math.abs(z) > PLAY_HALF - DIG_EDGE) return false;
  if (obstacleDepth(x, z, DIG_PAD, hit) > 0) return false;
  const { round } = footprints();
  for (let k = 0; k < round.length; k += 4) {
    if (round[k + 3] === Infinity && Math.hypot(x - round[k], z - round[k + 1]) < round[k + 2] + TRUNK_PAD) return false;
  }
  const rs = rocks();
  for (let i = 0; i < rs.length; i++) {
    if (Math.hypot(x - rs[i].x, z - rs[i].z) < rockReach(i) + DIG_PAD) return false;
  }
  return true;
}

/** How much of footprint (u, s, r) lies in the region in front of the cut on the s > 0 side (0: none). */
function inFront(u: number, s: number, r: number): number {
  const du = Math.max(0, Math.abs(u) - FRONT_HALF);
  const ds = s < FRONT_NEAR ? FRONT_NEAR - s : s > FRONT_FAR ? s - FRONT_FAR : 0;
  const d = Math.hypot(du, ds);
  return d < r ? (r - d) * r : 0;
}

/** How far the segment a to b passes inside (px, pz) grown by `r` (0 or less: it misses). */
function segInside(ax: number, az: number, bx: number, bz: number, px: number, pz: number, r: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return r - Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

/**
 * How far the deepest trunk reaches into the camera's swing from the entry (x, z) to `CAM_REACH`
 * out along (nx, nz) (0: the swing is clear of them all). The swing starts on the follow camera,
 * CAM_BEHIND from the entry along the cut, whichever way the worm faces, so both starts are tried.
 */
export function trunkInPath(x: number, z: number, nx: number, nz: number): number {
  const { round } = footprints();
  const ex = x + nx * CAM_REACH;
  const ez = z + nz * CAM_REACH;
  let most = 0;
  for (let k = 0; k < round.length; k += 4) {
    if (round[k + 3] !== Infinity) continue;
    const r = round[k + 2] + CAM_PAD;
    for (let side = -1; side <= 1; side += 2) {
      most = Math.max(most, segInside(x - nz * side * CAM_BEHIND, z + nx * side * CAM_BEHIND, ex, ez, round[k], round[k + 1], r));
    }
  }
  return most;
}

/**
 * The camera's side for a cut through (x, z) along `heading`: +1 looks from the normal (tz, -tx),
 * -1 from the other. A side whose swing would pass through a trunk loses to one that does not.
 * Otherwise it is the side whose view of the cut is clearest of trunks, rocks and the log, and
 * stays inside the world. On a tie the camera stands on the sun's side (the light comes from
 * about (0.5, 0.7) in x, z: paintedMaterial's uLightDir), so the face is lit from behind it.
 */
export function chooseSide(x: number, z: number, heading: number): 1 | -1 {
  const tx = Math.sin(heading);
  const tz = Math.cos(heading);
  const blocked = trunkInPath(x, z, tz, -tx) - trunkInPath(x, z, -tz, tx);
  if (Math.abs(blocked) > 1e-9) return blocked > 0 ? -1 : 1;
  let score = 0; // > 0 favours -1
  const { round, log } = footprints();
  for (let k = 0; k < round.length; k += 4) {
    const px = round[k] - x;
    const pz = round[k + 1] - z;
    const u = px * tx + pz * tz;
    const s = px * tz - pz * tx;
    const w = round[k + 3] === Infinity ? 4 : 1; // trunks block the view most
    score += w * (inFront(u, s, round[k + 2]) - inFront(u, -s, round[k + 2]));
  }
  for (let a = -log.half; a <= log.half; a += 0.5) {
    const px = log.x + log.dx * a - x;
    const pz = log.z + log.dz * a - z;
    const u = px * tx + pz * tz;
    const s = px * tz - pz * tx;
    score += 0.5 * (inFront(u, s, log.r) - inFront(u, -s, log.r));
  }
  // A camera standing outside the world looks through the berm and the distant trees.
  const cx = x + tz * 9;
  const cz = z - tx * 9;
  const out = (px: number, pz: number) => Math.max(0, Math.abs(px) - WORLD_HALF) + Math.max(0, Math.abs(pz) - WORLD_HALF);
  score += out(cx, cz) - out(x - tz * 9, z + tx * 9);
  if (Math.abs(score) > 1e-9) return score > 0 ? -1 : 1;
  return tz * 0.5 - tx * 0.7 >= 0 ? 1 : -1;
}
