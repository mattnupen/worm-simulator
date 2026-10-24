import { litterTopHeight } from '../surface/litterDepth';
import { treeSites, trunkFootOf, trunkRadiusOf } from '../surface/treeSites';
import { WORLD_HALF } from '../surface/terrain';
import { UNITS_PER_CM } from '../surface/realScale';
import type { RobinPose } from './robin';
import { NEST_TIMES, curveAt, robinAt, span, type NestSetup } from './nestScript';

/**
 * The nest scene's camera (nestScript.ts has the rest of the script). Three shots: low on the forest
 * floor beside the robin as it takes off with the worm; a slow crane up with it as it flies to the
 * maple; then close at the nest, a little below the rim, so the nestlings' open mouths show against
 * the tree. With reduced motion the camera never moves: it cuts between three still shots.
 */

/** The nest shot, in the nest frame (cm): from the side and a little in front, easing in. */
const NEST_FROM = [34, 30, 21];
const NEST_TO = [27, 25, 16];
const NEST_LOOK = [0, 8, 1];
const NEST_LOOK_TO = [0, 8.5, 0.5];
/** Closer in for the feeding, on the first nestling's open mouth (nestScript.ts NEST_TIMES.feed). */
const FEED_FROM = [17, 18, 14];
const FEED_LOOK = [0, 9.8, 0.5];
/** The flight shot: how far above the robin the camera flies with it (how far to the side: planCamera). */
const TRACK_UP = 1.5;
/** How close the camera may come to a trunk's bark (world units). */
const BARK_CLEAR = 0.8;
/** Vertical field of view (degrees), widened on tall screens (nestScene.ts). */
export const NEST_FOV = 50;
/** Reduced motion: when each still shot cuts in. */
export const STILL_CUTS = [0, 1.6, NEST_TIMES.land - 0.15, NEST_TIMES.leanIn[0]] as const;

const a3 = [0, 0, 0];
const b3 = [0, 0, 0];
const c3 = [0, 0, 0];
const d3 = [0, 0, 0];
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** A nest-frame point (cm) into world units, into `out`. */
export function nestToWorld(s: NestSetup, lx: number, ly: number, lz: number, out: number[]): number[] {
  const c = Math.cos(s.nestYaw);
  const n = Math.sin(s.nestYaw);
  const k = UNITS_PER_CM;
  out[0] = s.nx + (c * lx + n * lz) * k;
  out[1] = s.ny + ly * k;
  out[2] = s.nz + (-n * lx + c * lz) * k;
  return out;
}

/**
 * The side the moving shots keep to: across the flight (from the catch to the nest), on the same
 * side as the nest shot, so the camera never swings round. Into `out` (x, z).
 */
function side(s: NestSetup, out: number[]): number[] {
  const dx = s.curve[9] - s.x0;
  const dz = s.curve[11] - s.z0;
  const l = Math.hypot(dx, dz) || 1;
  let k = s.camSide;
  if (!k) {
    nestShot(s, 0, d3);
    k = (d3[0] - s.curve[9]) * (dz / l) - (d3[2] - s.curve[11]) * (dx / l) >= 0 ? 1 : -1;
  }
  out[0] = (dz / l) * k;
  out[2] = (-dx / l) * k;
  return out;
}

/** The first shot's camera: low, beside the robin and a little in front, inside the world. */
function floorShot(s: NestSetup, out: number[]): number[] {
  side(s, out);
  const fx = Math.sin(s.heading);
  const fz = Math.cos(s.heading);
  const lim = WORLD_HALF - 1;
  const sx = out[0];
  const sz = out[2];
  out[0] = Math.min(lim, Math.max(-lim, s.x0 + sx * 7 + fx * 3));
  out[2] = Math.min(lim, Math.max(-lim, s.z0 + sz * 7 + fz * 3));
  out[1] = litterTopHeight(out[0], out[2]) + 2.2;
  return out;
}

/** The nest shot's camera at k (0 start, 1 end), into `out`. */
function nestShot(s: NestSetup, k: number, out: number[]): number[] {
  return nestToWorld(s, lerp(NEST_FROM[0], NEST_TO[0], k), lerp(NEST_FROM[1], NEST_TO[1], k), lerp(NEST_FROM[2], NEST_TO[2], k), out);
}

/** Where the robin's body is (world): what the moving shots look at. */
function robinMiddle(r: RobinPose, out: number[]): number[] {
  out[0] = r.x; out[1] = r.y + (r.lift + 7) * UNITS_PER_CM; out[2] = r.z;
  return out;
}

/**
 * The camera at t: its place into `pos` and the point it looks at into `look`. `robin` is the
 * robin's pose at t (the moving shots follow it).
 */
export function cameraAt(t: number, s: NestSetup, robin: RobinPose, reduced: boolean, pos: number[], look: number[]): void {
  if (reduced) {
    if (t < STILL_CUTS[1]) {
      floorShot(s, pos);
      look[0] = s.x0; look[1] = s.y0 + 9 * UNITS_PER_CM; look[2] = s.z0;
    } else if (t < STILL_CUTS[2]) {
      // A wide still of the flight: the robin crosses it on its way up to the tree.
      side(s, pos);
      curveAt(s, 0.6, look);
      pos[0] = look[0] + pos[0] * 22;
      pos[1] = look[1] + 2;
      pos[2] = look[2] + pos[2] * 22;
    } else if (t < STILL_CUTS[3]) {
      nestShot(s, 0.6, pos);
      nestToWorld(s, NEST_LOOK_TO[0], NEST_LOOK_TO[1], NEST_LOOK_TO[2], look);
    } else feedShot(s, 1, pos, look);
    return;
  }
  // The flight: from the floor shot the camera flies up beside the robin, a little above it, then
  // eases into the nest shot as it lands.
  robinMiddle(robin, c3);
  floorShot(s, a3);
  side(s, b3);
  const tx = c3[0] + b3[0] * s.camTrack;
  const tz = c3[2] + b3[2] * s.camTrack;
  const ty = c3[1] + TRACK_UP;
  const fly = span(t, NEST_TIMES.takeoff - 0.1, NEST_TIMES.takeoff + 0.9);
  const land = span(t, NEST_TIMES.land - 1.0, NEST_TIMES.land + 0.3);
  nestShot(s, span(t, NEST_TIMES.land - 0.3, NEST_TIMES.end), b3);
  pos[0] = lerp(lerp(a3[0], tx, fly), b3[0], land);
  pos[1] = lerp(lerp(a3[1], Math.max(a3[1], ty), fly), b3[1], land);
  pos[2] = lerp(lerp(a3[2], tz, fly), b3[2], land);
  // Looks at the robin, then settles on the nest as it lands.
  const k = span(t, NEST_TIMES.land - 0.6, NEST_TIMES.land + 0.3);
  const settle = span(t, NEST_TIMES.land, NEST_TIMES.end);
  nestToWorld(s, lerp(NEST_LOOK[0], NEST_LOOK_TO[0], settle), lerp(NEST_LOOK[1], NEST_LOOK_TO[1], settle), lerp(NEST_LOOK[2], NEST_LOOK_TO[2], settle), b3);
  for (let i = 0; i < 3; i++) look[i] = lerp(c3[i], b3[i], k);
  // In close for the feeding.
  const feed = span(t, NEST_TIMES.leanIn[0] - 0.3, NEST_TIMES.feed[1]);
  if (feed > 0) {
    feedShot(s, feed, pos, look);
  }
}

/** Eases the camera (`pos`, `look`) by k toward the feeding shot. */
function feedShot(s: NestSetup, k: number, pos: number[], look: number[]): void {
  nestToWorld(s, FEED_FROM[0], FEED_FROM[1], FEED_FROM[2], a3);
  nestToWorld(s, FEED_LOOK[0], FEED_LOOK[1], FEED_LOOK[2], b3);
  for (let i = 0; i < 3; i++) {
    pos[i] = lerp(pos[i], a3[i], k);
    look[i] = lerp(look[i], b3[i], k);
  }
}

/**
 * Picks the moving camera's side and distance for this flight (into `s`): the nest shot's side at
 * the full distance if the whole move stays clear of the trunks, else the other side, else closer
 * in; failing all, whichever keeps furthest from the bark. Once per scene, when it starts.
 */
export function planCamera(s: NestSetup, robin: RobinPose): void {
  s.camSide = 0;
  side(s, d3);
  // Which way "the nest shot's side" is, as a sign of the perpendicular.
  const dx = s.curve[9] - s.x0;
  const dz = s.curve[11] - s.z0;
  const l = Math.hypot(dx, dz) || 1;
  const home = d3[0] * (dz / l) - d3[2] * (dx / l) >= 0 ? 1 : -1;
  let best = -Infinity;
  let pick = [home, 13];
  for (const [k, track] of [[home, 13], [-home, 13], [home, 8], [-home, 8], [home, 4], [-home, 4]]) {
    s.camSide = k;
    s.camTrack = track;
    const clear = clearance(s, robin);
    if (clear >= BARK_CLEAR) { pick = [k, track]; break; }
    if (clear > best) { best = clear; pick = [k, track]; }
  }
  s.camSide = pick[0];
  s.camTrack = pick[1];
}

/** The closest the moving camera comes to any trunk's bark over the scene (world units). */
export function clearance(s: NestSetup, robin: RobinPose): number {
  const pos = [0, 0, 0];
  const look = [0, 0, 0];
  let min = Infinity;
  for (let t = 0; t <= NEST_TIMES.end; t += 0.1) {
    robinAt(t, s, robin);
    cameraAt(t, s, robin, false, pos, look);
    for (const tree of treeSites()) {
      // The root flare near the ground, the trunk above.
      const r = pos[1] - litterTopHeight(pos[0], pos[2]) < 4 ? trunkFootOf(tree) : trunkRadiusOf(tree);
      min = Math.min(min, Math.hypot(pos[0] - tree.x, pos[2] - tree.z) - r);
    }
  }
  return min;
}
