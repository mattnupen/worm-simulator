import { obstacleDepth, type ObstacleHit } from './obstacles';
import type { HeroLeaves } from './heroPool';

/**
 * Hero leaves and the solid props (pure): a leaf whose centre comes within `pad` of a trunk, rock
 * or the log (their footprints, obstacles.ts) is pushed back out, so it never wedges up a trunk.
 */

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
