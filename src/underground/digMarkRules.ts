import { PLAY_HALF } from '../surface/terrain';
import { canDigHere, DIG_EDGE } from './digSpot';
import { canReuseHere } from './burrowReuse';
import { OPENING_MERGE, type Openings } from './openings';
import type { Burrows } from './burrows';

/**
 * The dig markers' rules (digMarks.ts, V4 spec 4.2): how many, how far, how often, the dig tests
 * they make and the pattern of spots they try round the head.
 */

export const MAX_MARKS = 3;
/** Dig tests (canDigAt or the reuse test) at most per step. */
export const MARK_BUDGET = 3;
/** Spots are looked for this far from the head... */
export const MARK_NEAR = 1.5;
export const MARK_FAR = 6;
/** ...and a marker is dropped beyond this, or behind the worm (BEHIND_COS) farther than KEEP_NEAR. */
export const DROP_FAR = 7.5;
export const KEEP_NEAR = 2;
export const BEHIND_COS = -0.35;
/** A new marker goes no farther round than this (cos of its angle off the heading): kept ones may drift to BEHIND_COS. */
export const PLACE_COS = -0.1;
/** Two markers keep this far apart; a new spot keeps this far off every opening (its midden marks it). */
export const MARK_GAP = 2;
export const OPENING_GAP = OPENING_MERGE + 0.25;
/** Candidate spots snap to this grid (world units) and are nudged up to NUDGE within their cell. */
export const GRID = 1;
export const NUDGE = 0.3;
/** A score (distance, plus this for each unit of 1 - cos(angle off the heading)): lower is better. */
export const FRONT_WEIGHT = 3;
/** A new spot replaces the worst marker only when it scores this much better. */
export const REPLACE_MARGIN = 1.5;
/** One old opening in reach is tested every this many steps (a tenth of a second). */
export const OPENING_EVERY = 6;
/** One kept marker is tested again every this many steps (it may no longer work). */
export const RECHECK_EVERY = 20;
/** Pattern spots looked at per step at most (a pass over all of them takes 4 steps). */
export const SCAN_LOOKS = 12;
/** Cells whose test failed are remembered (a ring of this many): the world does not change. */
export const FAILED = 128;

/** What a marker marks: nothing (a free slot), a spot, or an old opening. */
export const MARK_NONE = 0;
export const MARK_SPOT = 1;
export const MARK_OPENING = 2;

/** The spot a dig test asks about, as a worm arriving there: an object, so no number is boxed. */
export interface MarkAsk { readonly head: { x: number; y: number; z: number }; heading: number }

/** What the markers stand over: the game's openings and burrows (BurrowGame has both). */
export interface MarkWorld { readonly openings: Openings; readonly burrows: Burrows }

/** The two dig tests (the game's own unless a test passes others). */
export interface DigTests {
  /** canDigAt at the spot, for a worm arriving there. */
  spot(a: MarkAsk): boolean;
  /** Whether the dig at opening `i` goes back into its burrow (burrowReuse.ts canReuseHere). */
  reuse(w: MarkWorld, i: number, a: MarkAsk): boolean;
}

export const GAME_TESTS: DigTests = {
  spot: (a) => canDigHere(a),
  reuse(w, i, a) {
    const k = w.openings.burrow[i];
    const s = k >= 0 ? w.burrows.slabs[k] : null;
    return !!s && canReuseHere(s, a);
  },
};

/** The candidate pattern: (forward, right) offsets round the head, best score first. */
export const PATTERN = ((): Float64Array => {
  const pts: [number, number, number][] = [];
  for (const r of [2, 3, 4, 5, 6]) {
    for (const deg of [0, 20, -20, 40, -40, 60, -60, 90, -90]) {
      const a = (deg * Math.PI) / 180;
      pts.push([r * Math.cos(a), r * Math.sin(a), r + FRONT_WEIGHT * (1 - Math.cos(a))]);
    }
  }
  pts.sort((p, q) => p[2] - q[2]);
  return Float64Array.from(pts.flatMap((p) => [p[0], p[1]]));
})();
export const PATTERN_N = PATTERN.length / 2;
export const LIM = PLAY_HALF - DIG_EDGE;
