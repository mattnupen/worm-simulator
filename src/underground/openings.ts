import { boundaryAt, slabX, slabZ, B_TOP, type Slab } from './slab';
import type { BodyPath } from './bodyPath';

/**
 * Burrow openings left on the surface this session (V2 spec 4.2, 4.3): up to MAX_OPENINGS, the
 * oldest replaced first. Session only: never saved.
 */
export const MAX_OPENINGS = 8;
/**
 * A midden's base sits this far down into the top of the leaves (litterTopHeight), so its heap
 * rises out of the 3D litter and shows from the surface camera (middens.ts).
 */
export const MIDDEN_SINK = 0.2;

export interface Openings {
  /** Per opening: x, y (the midden's base, MIDDEN_SINK under the litter's top), z and a turn. */
  readonly data: Float32Array;
  count: number;
  /** Next slot to write (the oldest once full). */
  next: number;
  /** Bumped on every change (the renderer rewrites its mesh). */
  version: number;
}

export function createOpenings(): Openings {
  return { data: new Float32Array(MAX_OPENINGS * 4), count: 0, next: 0, version: 0 };
}

/** Records the opening where the worm just came out (the coming-up path's exit point). */
export function addOpening(o: Openings, p: BodyPath, s: Slab): void {
  const k = o.next * 4;
  o.data[k] = slabX(s, p.exitU);
  o.data[k + 1] = boundaryAt(s, B_TOP, p.exitU) - MIDDEN_SINK;
  o.data[k + 2] = slabZ(s, p.exitU);
  o.data[k + 3] = (s.seed % 628) / 100;
  o.next = (o.next + 1) % MAX_OPENINGS;
  o.count = Math.min(MAX_OPENINGS, o.count + 1);
  o.version++;
}

/** Forgets every opening (a fresh session state, e.g. the speed test's reset). */
export function clearOpenings(o: Openings): void {
  o.count = 0;
  o.next = 0;
  o.version++;
}
