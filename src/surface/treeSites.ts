import { mulberry32 } from '../core/random';
import { WORLD_HALF } from './terrain';
import { LOOP, LOOP_MARGIN } from './wormPaths';
import { REAL_SCALE, type TreeLayout } from './realScale';

export interface TreeSite {
  x: number;
  z: number;
  birch: boolean;
}

/** A trunk's base radius above its root flare (times REAL_SCALE's birch or maple): paper birch and sugar maple. */
export const TRUNK_RADIUS = { birch: 0.32, maple: 0.48 } as const;
/**
 * The widest a base-size trunk gets near the ground (its root flare and buttresses, up to the worm's
 * height), measured from the drawn trunks: what the worm and the hero leaves cannot pass through
 * (obstacles.ts).
 */
export const TRUNK_FOOT = { birch: 0.52, maple: 1.08 } as const;

/** A tree's radius above its flare at real size (trunk shadows, litter drifts). */
export function trunkRadiusOf(t: TreeSite): number {
  return t.birch ? TRUNK_RADIUS.birch * REAL_SCALE.birch : TRUNK_RADIUS.maple * REAL_SCALE.maple;
}

/** A tree's footprint at the ground at real size. */
export function trunkFootOf(t: TreeSite): number {
  return t.birch ? TRUNK_FOOT.birch * REAL_SCALE.birch : TRUNK_FOOT.maple * REAL_SCALE.maple;
}

/**
 * Near-tree positions (pure): `count` sites from `seed`, birch and maple in turn, at least `clear`
 * from the spawn and with their footprint (plus a body width) off the speed test's loop. The
 * spawn's straight run is kept clear by `clear` alone (tests/unit/propPlacement.test.ts).
 */
function placeTrees(layout: TreeLayout): TreeSite[] {
  const rng = mulberry32(layout.seed);
  const out: TreeSite[] = [];
  for (let i = 0; i < layout.count; i++) {
    const birch = i % 2 === 0;
    const foot = trunkFootOf({ x: 0, z: 0, birch });
    let x = 0;
    let z = 0;
    do {
      x = (rng() * 2 - 1) * (WORLD_HALF - 2);
      z = (rng() * 2 - 1) * (WORLD_HALF - 2);
    } while (Math.hypot(x, z) < layout.clear || Math.hypot(x - LOOP.x, z - LOOP.z) < LOOP.r + LOOP_MARGIN + foot);
    out.push({ x, z, birch });
  }
  return out;
}

let cache: readonly TreeSite[] | null = null;

/** The near trees (built once). Read-only. */
export function treeSites(): readonly TreeSite[] {
  cache ??= placeTrees(REAL_SCALE.trees);
  return cache;
}
