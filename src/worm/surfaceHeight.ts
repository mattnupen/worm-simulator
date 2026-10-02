import { terrainHeight } from '../surface/terrain';
import { litterDepth, underAmount } from '../surface/litterDepth';

export interface WormSurface {
  /** Height the worm rests on (m). */
  y: number;
  /** 1: crawling on the soil under the leaves; 0: riding on top of them. */
  under: number;
}

/**
 * The surface under the worm at (x, z) (spec 5.2): where the litter is thin (< 0.06) the worm
 * crawls on the soil beneath it (under = 1); where it is deep (> 0.12) it rides on top
 * (under = 0); smooth between. y = terrainHeight + litterDepth * (1 - under). With
 * `reaction` off (the Low preset) under is always 0, so the worm always rides on top.
 * Writes into `out`, so the per-step calls allocate nothing.
 */
export function wormSurface(
  x: number, z: number, reaction = true, out: WormSurface = { y: 0, under: 0 },
): WormSurface {
  const depth = litterDepth(x, z);
  const under = reaction ? underAmount(depth) : 0;
  out.y = terrainHeight(x, z) + depth * (1 - under);
  out.under = under;
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

/** Top of the leaf litter (the leaves themselves included): the camera keeps its margin over this. */
export function litterTop(x: number, z: number): number {
  return terrainHeight(x, z) + litterDepth(x, z);
}
