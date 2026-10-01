import { mulberry32 } from '../core/random';
import { WORLD_HALF } from './terrain';

export interface TreeSite { x: number; z: number; birch: boolean }

const TREE_COUNT = 14;

/** Near-tree positions: a fixed seeded layout, clear of the spawn area. Pure. */
export function treeSites(): TreeSite[] {
  const rng = mulberry32(7);
  const out: TreeSite[] = [];
  for (let i = 0; i < TREE_COUNT; i++) {
    let x = 0;
    let z = 0;
    do {
      x = (rng() * 2 - 1) * (WORLD_HALF - 2);
      z = (rng() * 2 - 1) * (WORLD_HALF - 2);
    } while (Math.hypot(x, z) < 4);
    out.push({ x, z, birch: i % 2 === 0 });
  }
  return out;
}
