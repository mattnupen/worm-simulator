import type { Vec3 } from '../core/vec';
import { treeSites, trunkRadiusOf } from './treeSites';

/** A vertical trunk that throws a long, soft shadow across the floor. */
export interface ShadowCaster { x: number; z: number; radius: number }

const smoothstep = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The active mode's near trees as shadow casters (approximate trunk radii by species). */
export function shadowCasters(): ShadowCaster[] {
  return treeSites().map((t) => ({ x: t.x, z: t.z, radius: trunkRadiusOf(t) }));
}

/**
 * How deep in trunk shadow the ground at (x, z) is: 0 sunlit .. 1 fully shaded. Each trunk
 * casts a soft band away from `sun` (unit vector toward the sun) that widens and fades with
 * distance, so the low sun paints long, painterly shadow streaks. Pure; baked once into
 * static vertex colours (no shadow maps).
 */
export function trunkShadow(x: number, z: number, casters: readonly ShadowCaster[], sun: Vec3, reach = 12): number {
  const hl = Math.hypot(sun.x, sun.z) || 1;
  const dx = -sun.x / hl;
  const dz = -sun.z / hl;
  let lit = 1;
  for (const c of casters) {
    const rx = x - c.x;
    const rz = z - c.z;
    const along = rx * dx + rz * dz;
    if (along < -c.radius || along > reach) continue;
    const across = Math.abs(rx * dz - rz * dx);
    const half = c.radius * 1.5 + along * 0.06;
    const band = 1 - smoothstep(half * 0.5, half + 0.45 + along * 0.04, across);
    const fade = smoothstep(-c.radius, c.radius * 0.5, along) * (1 - smoothstep(reach * 0.35, reach, along));
    lit *= 1 - band * fade;
  }
  return 1 - lit;
}

/** How much a full trunk shadow darkens what it falls on. */
export const TRUNK_SHADE = 0.55;

/** Light multiplier (1 sunlit .. 1 - TRUNK_SHADE) at (x, z), for baking into vertex colours. */
export function makeShadeAt(sun: Vec3): (x: number, z: number) => number {
  const casters = shadowCasters();
  return (x, z) => 1 - TRUNK_SHADE * trunkShadow(x, z, casters, sun);
}
