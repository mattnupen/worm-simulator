import { footprints, obstacleDepth, type ObstacleHit } from '../surface/obstacles';
import { rocks } from '../surface/propPlacement';
import { PLAY_HALF, WORLD_HALF } from '../surface/terrain';
import { rockReach } from './sections';
import { FACE_EXTRA, SLAB_HALF } from './slab';

/**
 * Where the worm may dig down, the direction of the cut, and which side of it the camera looks
 * from (V2 spec 4.1). Pure; allocates nothing per call.
 *
 * FOR THE GAME (Task 15): create the slab with `cutHeading(x, z, wormHeading)`, never the raw
 * heading, and give `chooseSide` the same. The worm turns to face along the cut while its head
 * sinks (the spec allows a smooth turn during the sink).
 */

/** The dig point keeps this far off every rock and log footprint (more than a body width)... */
export const DIG_PAD = 0.5;
/** ...and this far off every trunk's footprint (the sink path at the entry; the cut itself keeps CUT_MARGIN)... */
export const TRUNK_PAD = 0.5;
/** ...and this far inside the worm's play area: not at the play edge. */
export const DIG_EDGE = 2.5;
/**
 * The cut has a section for each rock and the log but none for a trunk, so it must not cross a
 * trunk's footprint: it keeps this far off every one.
 */
export const CUT_MARGIN = 0.3;
/** The cut direction is searched outward from the worm's heading in steps of this (radians, 2 degrees). */
const TURN_STEP = Math.PI / 90;
/** The slab clips its playable range this far inside the play area (slab.ts's PLAY_MARGIN). */
const PLAY_MARGIN = 0.5;
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
const span: [number, number] = [0, 0];

/** The u interval where the line (x + tx u, z + tz u) stays within |x|, |z| <= half (slab.ts's clipLine). */
function clip(x: number, z: number, tx: number, tz: number, half: number): void {
  let lo = -Infinity;
  let hi = Infinity;
  if (Math.abs(tx) > 1e-9) {
    const a = (-half - x) / tx;
    const b = (half - x) / tx;
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
  }
  if (Math.abs(tz) > 1e-9) {
    const a = (-half - z) / tz;
    const b = (half - z) / tz;
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
  }
  span[0] = lo;
  span[1] = hi;
}

/** Whether the cut through (x, z) along (tx, tz), over u in `span`, keeps CUT_MARGIN off every trunk. */
function spanClear(x: number, z: number, tx: number, tz: number): boolean {
  const { round } = footprints();
  const lo = span[0];
  const hi = span[1];
  for (let k = 0; k < round.length; k += 4) {
    if (round[k + 3] !== Infinity) continue;
    const u = Math.max(lo, Math.min(hi, (round[k] - x) * tx + (round[k + 1] - z) * tz));
    if (Math.hypot(round[k] - x - tx * u, round[k + 1] - z - tz * u) < round[k + 2] + CUT_MARGIN) return false;
  }
  return true;
}

/** Whether the cut along `heading` keeps off the trunks over the playable range (`face` false) or the drawn face. */
function cutClear(x: number, z: number, heading: number, face: boolean): boolean {
  const tx = Math.sin(heading);
  const tz = Math.cos(heading);
  if (face) {
    clip(x, z, tx, tz, WORLD_HALF - 0.05);
    span[0] = Math.max(-SLAB_HALF - FACE_EXTRA, span[0]);
    span[1] = Math.min(SLAB_HALF + FACE_EXTRA, span[1]);
  } else {
    clip(x, z, tx, tz, PLAY_HALF - PLAY_MARGIN);
    span[0] = Math.max(-SLAB_HALF, span[0]);
    span[1] = Math.min(SLAB_HALF, span[1]);
  }
  return spanClear(x, z, tx, tz);
}

/**
 * The heading of the cut through (x, z), or null where no direction works. The cut is a plane, so
 * `wormHeading` and `wormHeading + PI` give the same one; this returns the direction nearest the
 * worm's heading (so the turn is at most 90 degrees) whose cut keeps off every trunk footprint:
 * over the playable slab and the drawn face's extra 6 u each side if any direction manages that,
 * else over the playable slab alone. It returns `wormHeading` itself when that is already clear.
 * Called once per dig; canDigAt calls it every step for the prompt, with nothing allocated.
 */
export function cutHeading(x: number, z: number, wormHeading: number): number | null {
  for (let pass = 0; pass < 2; pass++) {
    const face = pass === 0;
    for (let i = 0; i <= 45; i++) {
      const turn = i * TURN_STEP;
      if (cutClear(x, z, wormHeading + turn, face)) return wormHeading + turn;
      if (i > 0 && i < 45 && cutClear(x, z, wormHeading - turn, face)) return wormHeading - turn;
    }
  }
  return null;
}

/**
 * True where the worm may dig down when facing `heading`: open ground, not within DIG_PAD of a
 * rock (as far as it bulges underground, `rockReach`) or the log, not within TRUNK_PAD of a trunk,
 * not at the play edge, and with a cut direction that keeps off the trunks (`cutHeading`).
 */
export function canDigAt(x: number, z: number, heading: number): boolean {
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
  return cutHeading(x, z, heading) !== null;
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
 * The camera's side for the cut through (x, z) along `cutHeading(x, z, wormHeading)`: +1 looks from the normal (tz, -tx),
 * -1 from the other. A side whose swing would pass through a trunk loses to one that does not.
 * Otherwise it is the side whose view of the cut is clearest of trunks, rocks and the log, and
 * stays inside the world. On a tie the camera stands on the sun's side (the light comes from
 * about (0.5, 0.7) in x, z: paintedMaterial's uLightDir), so the face is lit from behind it.
 */
export function chooseSide(x: number, z: number, wormHeading: number): 1 | -1 {
  const heading = cutHeading(x, z, wormHeading) ?? wormHeading;
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
