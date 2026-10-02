import { litterDepth, litterMound, underAmount } from '../surface/litterDepth';
import { meshGroundHeight } from '../surface/terrainMesh';

export interface WormSurface {
  /** Height the worm rests on (m). */
  y: number;
  /** 1: crawling on the soil under the leaves; 0: riding on top of them. */
  under: number;
}

/**
 * The surface under the worm at (x, z) (spec 5.2): where the litter is thin (< 0.06) the worm
 * crawls on the soil beneath it (under = 1); where it is deep (> 0.12) it rides on top
 * (under = 0); smooth between. The height is the ground exactly as the terrain mesh draws it
 * (soil plus the litter mound, `meshGroundHeight`, which differs from the analytic ground by
 * up to ~18 cm where the 0.5 m grid cuts a sharp mound), so the worm never sinks into a pile
 * or floats off it. With `reaction` off (the Low preset) under is always 0: the worm also
 * rides over the loose leaves above the mound. Writes into `out`, so the per-step calls
 * allocate nothing.
 */
export function wormSurface(
  x: number, z: number, reaction = true, out: WormSurface = { y: 0, under: 0 },
): WormSurface {
  const depth = litterDepth(x, z);
  const under = underAmount(depth);
  out.y = meshGroundHeight(x, z) + (reaction ? 0 : depth * under);
  out.under = reaction ? under : 0;
  return out;
}

/** The belly line just touches the soil when under the leaves... */
export const BELLY_UNDER = 0.01;
/** ...and clears the top leaves when riding on them. */
export const BELLY_ON_TOP = 0.035;

/** Height of the worm's belly line (its simulated spine) over a surface. */
export function bellyHeight(s: WormSurface): number {
  return s.y + BELLY_UNDER + (BELLY_ON_TOP - BELLY_UNDER) * (1 - s.under);
}

/**
 * Top of the leaf litter (the leaves themselves included): the rendered ground plus the loose
 * leaves above its mound. The camera keeps its margin over this.
 */
export function litterTop(x: number, z: number): number {
  const depth = litterDepth(x, z);
  return meshGroundHeight(x, z) + depth - litterMound(depth);
}
