import type { LeafLitter } from '../../src/surface/leafLitterMesh';

/** How many of chunk c's leaves the litter's one low-detail draw lists now. */
export function farLeaves(l: LeafLitter, c: number): number {
  const ch = l.chunks[c];
  let n = 0;
  for (let a = 0; a < l.far.drawn; a++) {
    const p = l.far.parts[a];
    if (p >= ch.farFirst && p < ch.farFirst + ch.leaves.length) n++;
  }
  return n;
}
