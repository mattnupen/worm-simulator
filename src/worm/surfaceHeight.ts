import { floorHeight } from '../surface/litterDepth';

export interface WormSurface {
  /** Height the worm rests on (m): the top of the F layer, under all the loose leaves. */
  y: number;
}

/**
 * What lifts the worm over the floor: the casting mounds (src/underground/mounds.ts). Mound i at
 * (x[i], z[i]) lifts the belly by lift[i] out to RIDE_TOP, easing down (smoothstep) to nothing at
 * reach[i]; a mound with shown[i] 0 lifts nothing.
 */
export interface WormRise {
  readonly count: number;
  readonly x: Float64Array;
  readonly z: Float64Array;
  readonly lift: Float64Array;
  readonly reach: Float64Array;
  readonly shown: Uint8Array;
}

/** The ride is flat over a mound's hole and rim, out to this (u) from its centre. */
export const RIDE_TOP = 0.32;

let lifts: WormRise | null = null;

/** The game's casting mounds, which the worm crawls over (null: none, as in most unit tests). */
export function setWormRise(r: WormRise | null): void {
  lifts = r;
}

/**
 * The spot asked about: [x, z]. Numbers cross riseInto in this typed array and `out`, never as
 * arguments or a result: a number passed to (or returned from) a call V8 does not inline is boxed
 * on the heap, and wormSurface runs for every body point every step (stepAllocation.test.ts).
 */
const ask = new Float64Array(2);

/** Adds the belly's lift over the floor at (a[0], a[1]) from `r`'s shown mounds to out.y (none off them). */
export function riseInto(r: WormRise, a: Float64Array, out: WormSurface): void {
  const x = a[0];
  const z = a[1];
  let best = 0;
  for (let i = 0; i < r.count; i++) {
    const far = r.reach[i];
    const dx = x - r.x[i];
    const dz = z - r.z[i];
    if (dx > far || dx < -far || dz > far || dz < -far || r.shown[i] === 0) continue;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d >= far) continue;
    const t = d <= RIDE_TOP ? 1 : (far - d) / (far - RIDE_TOP);
    const up = r.lift[i] * t * t * (3 - 2 * t);
    if (up > best) best = up;
  }
  if (best > 0) out.y += best;
}

/**
 * The surface under the worm at (x, z) (V2 spec 8.2): the worm travels buried in the loose leaf
 * layer, its belly on the F layer's top (floorHeight), on every preset. The floor is the soil's
 * own smooth shape, so the worm never steps on the drawn grid's edges. Over a casting mound (V4)
 * its belly rides up onto the castings and down again (setWormRise). Writes into `out`, so the
 * per-step calls allocate nothing.
 */
export function wormSurface(x: number, z: number, out: WormSurface = { y: 0 }): WormSurface {
  out.y = floorHeight(x, z);
  if (lifts) {
    ask[0] = x;
    ask[1] = z;
    riseInto(lifts, ask, out);
  }
  return out;
}

/** The belly line just touches the floor. */
export const BELLY_UNDER = 0.01;

/** Height of the worm's belly line (its simulated spine) over a surface. */
export function bellyHeight(s: WormSurface): number {
  return s.y + BELLY_UNDER;
}
