import { mulberry32 } from '../core/random';
import { WORLD_HALF } from './terrain';
import { LOOP, LOOP_MARGIN } from './wormPaths';
import { REAL_SCALE, type TreeLayout } from './realScale';

export interface TreeSite {
  x: number;
  z: number;
  birch: boolean;
  /** A paper birch clump: a second, smaller stem leans from beside the first (forestTrees.ts). */
  clump: boolean;
}

/** These sites (by index) grow as a birch clump. */
export const CLUMPS: ReadonlySet<number> = new Set([2, 12]);

/** A trunk's base radius above its root flare (times REAL_SCALE's birch or maple): paper birch and sugar maple. */
export const TRUNK_RADIUS = { birch: 0.32, maple: 0.48 } as const;
/**
 * The widest a base-size trunk gets near the ground (its root flare and buttresses, up to the worm's
 * height), measured from the drawn trunks: what the worm and the hero leaves cannot pass through
 * (obstacles.ts). A clump's circle holds both stems: the second stands 0.5 away, at 0.8 the size.
 */
export const TRUNK_FOOT = { birch: 0.52, maple: 1.08, clump: 0.5 + 0.8 * 0.52 + 0.03 } as const;

/** A tree's radius above its flare at real size (trunk shadows, litter drifts). */
export function trunkRadiusOf(t: TreeSite): number {
  return t.birch ? TRUNK_RADIUS.birch * REAL_SCALE.birch : TRUNK_RADIUS.maple * REAL_SCALE.maple;
}

/** A tree's footprint at the ground at real size. */
export function trunkFootOf(t: TreeSite): number {
  if (!t.birch) return TRUNK_FOOT.maple * REAL_SCALE.maple;
  return (t.clump ? TRUNK_FOOT.clump : TRUNK_FOOT.birch) * REAL_SCALE.birch;
}

/**
 * Near-tree positions (pure): `count` sites from `seed`, birch and maple in turn, at least `clear`
 * from the spawn and with their footprint (plus a body width) off the speed test's loop. The
 * spawn's straight run is kept clear by `clear` alone (tests/unit/propPlacement.test.ts).
 */
export function placeTrees(layout: TreeLayout): TreeSite[] {
  const rng = mulberry32(layout.seed);
  const out: TreeSite[] = [];
  for (let i = 0; i < layout.count; i++) {
    const birch = i % 2 === 0;
    const clump = CLUMPS.has(i);
    const foot = trunkFootOf({ x: 0, z: 0, birch, clump });
    let x = 0;
    let z = 0;
    do {
      x = (rng() * 2 - 1) * (WORLD_HALF - 2);
      z = (rng() * 2 - 1) * (WORLD_HALF - 2);
    } while (Math.hypot(x, z) < layout.clear || Math.hypot(x - LOOP.x, z - LOOP.z) < LOOP.r + LOOP_MARGIN + foot);
    out.push({ x, z, birch, clump });
  }
  return out;
}

let cache: readonly TreeSite[] | null = null;

/** The near trees (built once). Read-only. */
export function treeSites(): readonly TreeSite[] {
  cache ??= placeTrees(REAL_SCALE.trees);
  return cache;
}
