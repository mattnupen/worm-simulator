import { treeSites } from './treeSites';
import { HERO_LOG, ROCKS } from './propPlacement';
import type { HeroLeaves } from './heroPool';

/**
 * The rigid things a hero leaf cannot lie inside (pure): the near tree trunks (with their root
 * flare), the rocks and the hero log, as footprints on the ground. A leaf whose centre comes
 * within `pad` of one is pushed back out (heroLeaves.ts), so it never wedges up a trunk.
 */

/** Trunk footprint: its radius (as treeShadows) widened by the root flare. */
const FLARE = 1.15;
/** Round footprints, [x, z, radius] each: trunks, then rocks. */
const ROUND = Float64Array.from([
  ...treeSites().flatMap((t) => [t.x, t.z, (t.birch ? 0.32 : 0.48) * FLARE]),
  ...ROCKS.flatMap((k) => [k.x, k.z, k.size]),
]);
const LOG_DX = Math.cos(HERO_LOG.yaw);
const LOG_DZ = Math.sin(HERO_LOG.yaw);

/** The way out of the deepest obstacle (unit ground vector), written by obstacleDepth. */
export interface ObstacleHit { nx: number; nz: number }

/**
 * How far (m) the point (x, z) lies inside the deepest obstacle footprint grown by `pad`
 * (0 or less: clear of them all), and in `out` the direction straight out of it. Allocates
 * nothing.
 */
export function obstacleDepth(x: number, z: number, pad: number, out: ObstacleHit): number {
  let best = -Infinity;
  for (let o = 0; o < ROUND.length; o += 3) {
    const dx = x - ROUND[o];
    const dz = z - ROUND[o + 1];
    const lim = ROUND[o + 2] + pad;
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
  const half = HERO_LOG.length / 2;
  const t = Math.max(-half, Math.min(half, (x - HERO_LOG.x) * LOG_DX + (z - HERO_LOG.z) * LOG_DZ));
  const dx = x - (HERO_LOG.x + LOG_DX * t);
  const dz = z - (HERO_LOG.z + LOG_DZ * t);
  const d = Math.sqrt(dx * dx + dz * dz);
  const into = HERO_LOG.radius + pad - d;
  if (into > best) {
    best = into;
    if (d > 1e-9) {
      out.nx = dx / d;
      out.nz = dz / d;
    } else {
      out.nx = -LOG_DZ;
      out.nz = LOG_DX;
    }
  }
  return best;
}

/** Pushed back out of an obstacle this long (s): the leaf is recycled. */
export const WEDGE_TIME = 0.5;
/** Deeper than this (m) in a footprint counts as in it (not a rounding hair). */
const WEDGE_EPS = 1e-4;
const hit: ObstacleHit = { nx: 0, nz: 0 };

/**
 * Leaf i, its centre within `pad` of a trunk, rock or the log, goes straight back out, losing
 * the part of its velocity into it. Returns true once it has been wedged there for longer than
 * WEDGE_TIME (it would only be propped up against it: recycle it).
 */
export function unwedge(p: HeroLeaves, i: number, pad: number, dt: number): boolean {
  const into = obstacleDepth(p.x[i], p.z[i], pad, hit);
  if (!(into > WEDGE_EPS)) {
    p.wedged[i] = 0;
    return false;
  }
  p.x[i] += hit.nx * into;
  p.z[i] += hit.nz * into;
  const vn = p.vx[i] * hit.nx + p.vz[i] * hit.nz;
  if (vn < 0) {
    p.vx[i] -= vn * hit.nx;
    p.vz[i] -= vn * hit.nz;
  }
  p.wedged[i] += dt;
  return p.wedged[i] > WEDGE_TIME;
}
