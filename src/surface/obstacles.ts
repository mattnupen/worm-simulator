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

/**
 * How far (m) the point (x, z) lies inside the deepest footprint grown by `pad` (0 or less: clear
 * of them all), and in `out` the direction straight out of it. Allocates nothing.
 */
export function obstacleDepth(x: number, z: number, pad: number, out: ObstacleHit): number {
  const { round, log } = footprints();
  let best = -Infinity;
  for (let o = 0; o < round.length; o += 4) {
    const dx = x - round[o];
    const dz = z - round[o + 1];
    const lim = round[o + 2] + pad;
    if (Math.abs(dx) >= lim || Math.abs(dz) >= lim) continue;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (lim - d > best) {
      best = lim - d;
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
