import { floorHeight } from '../surface/litterDepth';

export interface WormSurface {
  /** Height the worm rests on (m): the top of the F layer, under all the loose leaves. */
  y: number;
}

/**
 * The surface under the worm at (x, z) (V2 spec 8.2): the worm travels buried in the loose leaf
 * layer, its belly on the F layer's top (floorHeight), on every preset. The floor is the soil's
 * own smooth shape, so the worm never steps on the drawn grid's edges. Writes into `out`, so the
 * per-step calls allocate nothing.
 */
export function wormSurface(x: number, z: number, out: WormSurface = { y: 0 }): WormSurface {
  out.y = floorHeight(x, z);
  return out;
}

/** The belly line just touches the floor. */
export const BELLY_UNDER = 0.01;

/** Height of the worm's belly line (its simulated spine) over a surface. */
export function bellyHeight(s: WormSurface): number {
  return s.y + BELLY_UNDER;
}
