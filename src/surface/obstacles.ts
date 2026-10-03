import { treeSites, trunkFootOf } from './treeSites';
import { heroLog, LOG_END, LOG_FOOT, rocks, ROCK_FOOT } from './propPlacement';
import { scaleSpec, type ScaleSpec } from './worldScale';

/**
 * The solid things on the forest floor, as footprints on the ground (pure; Step 1b spec 4.4):
 * circles for the trunks (their root flare) and rocks, a capsule for the fallen log. Built from
 * the active ScaleSpec. The worm slides along them (crawl.ts), hero leaves are pushed back out of
 * them (heroObstacles.ts), and the camera stops short of the tall ones (followCamera.ts).
 */

/** How far the drawn rocks and log reach past their size (propPlacement.ts, beside the props). */
export { LOG_END, LOG_FOOT, ROCK_FOOT };
/** A rock's top above the ground, per unit of its size; the log's, per unit of its radius. */
const ROCK_TOP = 0.6;
const LOG_TOP = 1.7;

export interface Footprints {
  /** Round footprints, [x, z, radius, top] each: trunks (top Infinity), then rocks. */
  readonly round: Float64Array;
  /** The log: centre, unit axis, half length, radius and top. */
  readonly log: { x: number; z: number; dx: number; dz: number; half: number; r: number; top: number };
}

let cache: { spec: ScaleSpec; fp: Footprints } | null = null;

/** The active mode's footprints (built once per mode). Read-only. */
export function footprints(): Footprints {
  const spec = scaleSpec();
  if (cache?.spec === spec) return cache.fp;
  const log = heroLog(spec);
  const fp: Footprints = {
    round: Float64Array.from([
      ...treeSites().flatMap((t) => [t.x, t.z, trunkFootOf(t, spec), Infinity]),
      ...rocks().flatMap((k) => [k.x, k.z, k.size * ROCK_FOOT, k.size * ROCK_TOP]),
    ]),
    log: {
      x: log.x, z: log.z, dx: Math.cos(log.yaw), dz: Math.sin(log.yaw), half: log.length / 2 + LOG_END,
      r: log.radius * LOG_FOOT, top: log.radius * LOG_TOP,
    },
  };
  cache = { spec, fp };
  return fp;
}

/** The way out of the deepest obstacle (unit ground vector), written by obstacleDepth. */
export interface ObstacleHit { nx: number; nz: number }

/** Which footprint the last obstacleDepth call found deepest (its offset in `round`, or -1 for the log). */
let deepestId = -1;

/**
 * How far (m) the point (x, z) lies inside the deepest footprint grown by `pad` (0 or less: clear
 * of them all), and in `out` the direction straight out of it. Allocates nothing.
 */
export function obstacleDepth(x: number, z: number, pad: number, out: ObstacleHit): number {
  const { round, log } = footprints();
  let best = -Infinity;
  deepestId = -1;
  for (let o = 0; o < round.length; o += 4) {
    const dx = x - round[o];
    const dz = z - round[o + 1];
    const lim = round[o + 2] + pad;
    if (Math.abs(dx) >= lim || Math.abs(dz) >= lim) continue;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (lim - d > best) {
      best = lim - d;
      deepestId = o;
      if (d > 1e-9) {
        out.nx = dx / d;
        out.nz = dz / d;
      } else {
        out.nx = 1;
        out.nz = 0;
      }
    }
  }
  // The log: a capsule along its axis.
  const t = Math.max(-log.half, Math.min(log.half, (x - log.x) * log.dx + (z - log.z) * log.dz));
  const dx = x - (log.x + log.dx * t);
  const dz = z - (log.z + log.dz * t);
  const d = Math.sqrt(dx * dx + dz * dz);
  const into = log.r + pad - d;
  if (into > best) {
    best = into;
    deepestId = -1;
    if (d > 1e-9) {
      out.nx = dx / d;
      out.nz = dz / d;
    } else {
      out.nx = -log.dz;
      out.nz = log.dx;
    }
  }
  return best;
}

const slideHit: ObstacleHit = { nx: 0, nz: 0 };

/**
 * Moves the ground point `p` (x, z) straight out of any footprint grown by `radius`, the deepest
 * first, a few times over for footprints that touch: a body point pushed into a trunk, rock or
 * the log slides along its edge. Returns how far it moved in all. Allocates nothing.
 */
export function pushOut(p: { x: number; z: number }, radius: number): number {
  let moved = 0;
  for (let k = 0; k < 3; k++) {
    const into = obstacleDepth(p.x, p.z, radius, slideHit);
    if (!(into > 0)) break;
    p.x += slideHit.nx * into;
    p.z += slideHit.nz * into;
    moved += into;
  }
  return moved;
}

const contact: ObstacleHit = { nx: 0, nz: 0 };
/** The footprints a slideMove has met so far, and the way out of each. */
const metIds = new Int32Array(3);
const metN = new Float64Array(6);

/**
 * Collide and slide: `to` is where a point clear of the footprints (grown by `radius`) at `from`
 * would move this step. If the move ends in a footprint, the part of it that points into one
 * is taken away, so the point slides along the edge; the move must keep out of every footprint
 * met on the way, and in a notch where two meet nothing is left, so the point stays put instead
 * of rattling between them. Writes the result into `to`, and leaves `to` exactly as it was when
 * the move is clear. A hair may still lie inside a curved edge: pushOut afterwards. Allocates nothing.
 */
export function slideMove(from: { x: number; z: number }, to: { x: number; z: number }, radius: number): void {
  const mx = to.x - from.x;
  const mz = to.z - from.z;
  let met = 0;
  for (let k = 0; k < 3; k++) {
    if (!(obstacleDepth(to.x, to.z, radius, contact) > 0)) return;
    // Remember the way out of this footprint (one met again keeps its newest).
    let i = 0;
    while (i < met && metIds[i] !== deepestId) i++;
    metIds[i] = deepestId;
    metN[2 * i] = contact.nx;
    metN[2 * i + 1] = contact.nz;
    if (i === met) met++;
    // The whole move, or the move with the part into one footprint taken away: the first that
    // points into none of them. If none does, the point is wedged.
    let dx = 0;
    let dz = 0;
    for (let c = -1; c < met; c++) {
      let ax = mx;
      let az = mz;
      if (c >= 0) {
        const into = ax * metN[2 * c] + az * metN[2 * c + 1];
        if (!(into < 0)) continue;
        ax -= metN[2 * c] * into;
        az -= metN[2 * c + 1] * into;
      }
      let clear = true;
      for (let j = 0; j < met && clear; j++) {
        if (j !== c && ax * metN[2 * j] + az * metN[2 * j + 1] < 0) clear = false;
      }
      if (clear) {
        dx = ax;
        dz = az;
        break;
      }
    }
    to.x = from.x + dx;
    to.z = from.z + dz;
  }
}
