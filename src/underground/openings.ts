import { boundaryAt, slabX, slabZ, B_TOP, type Slab } from './slab';
import type { BodyPath } from './bodyPath';

/**
 * Burrow openings left on the surface this session (V2 spec 4.2, 4.3): up to MAX_OPENINGS, the
 * oldest replaced first. Session only: never saved.
 */
export const MAX_OPENINGS = 8;
/**
 * A new opening closer than this to an old one replaces it (the worm came up in its old burrow):
 * two middens (up to about 0.72 u in radius, middens.ts) never grow into each other.
 */
export const OPENING_MERGE = 1.25;

export interface Openings {
  /** Per opening: x, the litter's top there (the midden's base), z and a turn. */
  readonly data: Float32Array;
  count: number;
  /** When each slot was last written (`added` then): the oldest is replaced once all are taken. */
  readonly born: Float64Array;
  added: number;
  /** Bumped on every change (the renderer rewrites its mesh). */
  version: number;
}

export function createOpenings(): Openings {
  return { data: new Float32Array(MAX_OPENINGS * 4), count: 0, born: new Float64Array(MAX_OPENINGS), added: 0, version: 0 };
}

/** Records the opening where the worm just came out (the coming-up path's exit point). */
export function addOpening(o: Openings, p: BodyPath, s: Slab): void {
  const x = slabX(s, p.exitU);
  const z = slabZ(s, p.exitU);
  // The nearest old opening within OPENING_MERGE, else a free slot, else the oldest.
  let slot = -1;
  let near = OPENING_MERGE;
  for (let i = 0; i < o.count; i++) {
    const d = Math.hypot(o.data[i * 4] - x, o.data[i * 4 + 2] - z);
    if (d < near) {
      near = d;
      slot = i;
    }
  }
  if (slot < 0 && o.count < MAX_OPENINGS) slot = o.count++;
  if (slot < 0) {
    slot = 0;
    for (let i = 1; i < MAX_OPENINGS; i++) if (o.born[i] < o.born[slot]) slot = i;
  }
  const k = slot * 4;
  o.data[k] = x;
  o.data[k + 1] = boundaryAt(s, B_TOP, p.exitU);
  o.data[k + 2] = z;
  o.data[k + 3] = (s.seed % 628) / 100;
  o.born[slot] = ++o.added;
  o.version++;
}

/** Forgets every opening (a fresh session state, e.g. the speed test's reset). */
export function clearOpenings(o: Openings): void {
  o.count = 0;
  o.version++;
}
