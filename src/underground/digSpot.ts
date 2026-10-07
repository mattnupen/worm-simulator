import type { Vec3 } from '../core/vec';
import { footprints, obstacleDepth, type ObstacleHit } from '../surface/obstacles';
import { rocks } from '../surface/propPlacement';
import { PLAY_HALF, WORLD_HALF } from '../surface/terrain';
import { rockReach } from './sections';
import { canEmergeNearEntry } from './emergeMap';
import { bodyFan, sweepClear } from './sinkSweep';
import { cutSpans } from './slab';

/**
 * Where the worm may dig down, the direction of the cut, and which side of it the camera looks
 * from (V2 spec 4.1). Pure; allocates nothing per call.
 *
 * FOR THE GAME (Task 15): create the slab with `cutHeading(x, z, wormHeading, crawl.body)`, never
 * the raw heading, and give `canDigAt` and `chooseSide` the same body. The worm turns to lie along
 * the cut while its head sinks (bodyPath.ts), and a cut is only taken if that turn keeps the body
 * off every trunk, rock and log footprint.
 */

/** The dig point keeps this far off every trunk, rock and log footprint (more than a body width)... */
export const DIG_PAD = 0.5;
/** ...and this far inside the worm's play area: not at the play edge. */
export const DIG_EDGE = 2.5;
/**
 * A cut is taken only if its playable range (kept FACE_END_ROOM inside the face's ends, slab.ts)
 * reaches this far each side of the entry: the head starts at u = 0 clear of the end's soft stop
 * (0.55). Near the world's edge a cut running out toward it is too short; one along it is taken.
 */
export const ENTRY_ROOM = 1;
/**
 * The cut has a section for each rock and the log but none for a trunk, so it must not cross a
 * trunk's footprint: it keeps this far off every one.
 */
export const CUT_MARGIN = 0.3;
/** The cut direction is searched outward from the worm's heading in steps of this (radians, 2 degrees). */
const TURN_STEP = Math.PI / 90;
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
const spans: [number, number, number, number] = [0, 0, 0, 0];
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

/**
 * Whether the cut along `heading` has ENTRY_ROOM of playable slab each side of the entry and keeps
 * off the trunks over its whole drawn face (as createSlab makes them: cutSpans).
 */
function cutClear(x: number, z: number, heading: number): boolean {
  const tx = Math.sin(heading);
  const tz = Math.cos(heading);
  cutSpans(x, z, tx, tz, spans);
  if (spans[0] > -ENTRY_ROOM || spans[1] < ENTRY_ROOM) return false;
  span[0] = spans[2];
  span[1] = spans[3];
  return spanClear(x, z, tx, tz);
}

/**
 * A cut cutHeading may offer: room each side of the entry, clear of trunks, the body's turn into it
 * clear, and a way back up near the entry.
 */
function cutOk(x: number, z: number, heading: number): boolean {
  return cutClear(x, z, heading) && sweepClear(x, z, heading) && canEmergeNearEntry(x, z, heading);
}

/**
 * The heading of the cut through (x, z), or null where no direction works. The cut is a plane, so
 * `wormHeading` and `wormHeading + PI` give the same one; this returns the direction nearest the
 * worm's heading (so the turn is at most 90 degrees) whose cut keeps off every trunk footprint
 * over its whole drawn face, with ENTRY_ROOM of playable slab each side of the entry (near the
 * world's edge a cut running out toward it is too short: one along the edge is taken). The body (`body`, head first, as `Crawl.body`; without it, a
 * straight body behind the head) must also turn into that cut clear of every footprint
 * (`sweepClear`), and the worm must be able to come back up near the entry (`canEmergeNearEntry`),
 * so no dig leaves it with nowhere to come up. It returns `wormHeading` itself when that works.
 * Called once per dig; canDigAt calls it every step for the prompt, with nothing allocated.
 */
export function cutHeading(x: number, z: number, wormHeading: number, body?: ArrayLike<Vec3>): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(wormHeading)) return null;
  bodyFan(wormHeading, body);
  for (let i = 0; i <= 45; i++) {
    const turn = i * TURN_STEP;
    const a = wormHeading + turn;
    if (cutOk(x, z, a)) return a;
    const b = wormHeading - turn;
    if (i > 0 && i < 45 && cutOk(x, z, b)) return b;
  }
  return null;
}

/**
 * True where the worm may dig down: open ground, not within DIG_PAD of a trunk, rock (as far as it
 * bulges underground, `rockReach`) or the log, not at the play edge, and with a cut direction that
 * keeps off the trunks and that the body can turn into clear of every footprint (`cutHeading`,
 * given the same `body`). False for a non-finite x, z or heading.
 *
 * Without a body it in effect does not depend on `heading`: cutHeading's search from the heading
 * covers every cut plane, so turning in place does not change the answer (only a clear window
 * narrower than the 2 degree search step could). With the body, the answer can change as the body
 * moves near a footprint, which is the point: the prompt then shows only where the dig is clean.
 */
export function canDigAt(x: number, z: number, heading: number, body?: ArrayLike<Vec3>): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(heading)) return false;
  if (Math.abs(x) > PLAY_HALF - DIG_EDGE || Math.abs(z) > PLAY_HALF - DIG_EDGE) return false;
  if (obstacleDepth(x, z, DIG_PAD, hit) > 0) return false;
  const rs = rocks();
  for (let i = 0; i < rs.length; i++) {
    if (Math.hypot(x - rs[i].x, z - rs[i].z) < rockReach(i) + DIG_PAD) return false;
  }
  return cutHeading(x, z, heading, body) !== null;
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
 * The camera's side for the cut through (x, z) along `cutHeading(x, z, wormHeading, body)`: +1 looks from the normal (tz, -tx),
 * -1 from the other. A side whose swing would pass through a trunk loses to one that does not.
 * Otherwise it is the side whose view of the cut is clearest of trunks, rocks and the log, and
 * stays inside the world. On a tie the camera stands on the sun's side (the light comes from
 * about (0.5, 0.7) in x, z: paintedMaterial's uLightDir), so the face is lit from behind it.
 */
export function chooseSide(x: number, z: number, wormHeading: number, body?: ArrayLike<Vec3>): 1 | -1 {
  const heading = cutHeading(x, z, wormHeading, body) ?? wormHeading;
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
