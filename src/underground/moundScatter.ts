import { mulberry32 } from '../core/random';
import { hypot2 } from '../core/vec';
import { PLAY_HALF } from '../surface/terrain';
import { litterDepth } from '../surface/litterDepth';
import { canDigAt, DIG_EDGE } from './digSpot';

/**
 * Where the casting mounds stand (mounds.ts; V4, Matt's review: "Too many worm castings piles.
 * Spread them out"): a scatter over the whole play area from a fixed seed, each on a spot where the
 * worm can really dig down, at least MOUND_GAP apart (with no grid: seeded darts), off the spawn.
 *
 * The dig tests are costly (canDigAt is about 100 to 150 us here, several times that on a
 * Chromebook, and the scatter makes about 2,000 of them: some 130 ms here), so the game does not
 * run this at load: its result is baked into moundSpots.ts, the same on every load and device.
 * tests/unit/moundScatter.test.ts runs it again and fails (printing the new table) if the world
 * changed under the mounds.
 */

/** Two mounds keep at least this far apart (world units; 3.5 u is 15 cm, the worm's length). */
export const MOUND_GAP = 7;
/** Mounds keep this far from the spawn (the opening scene and the first steps stay clear). */
export const SPAWN_CLEAR = 5;
/**
 * Mounds stand where the leaves are no deeper than this anywhere under them (not on drifts or
 * piles), so the worm's ride over one stays a low hump.
 */
export const MAX_LITTER = 0.8;
/** Candidate spots tried, in a fixed order from SEED. */
export const CANDIDATES = 1500;
export const SEED = 90210;
/** Mounds stand this far inside the play area (where digging is allowed). */
export const LIM = PLAY_HALF - DIG_EDGE;
/**
 * The dig test is made for a worm arriving from each of these headings (its body straight behind
 * it): at least MIN_HEADINGS must pass, so most ways of crawling up to a mound can dig there.
 */
export const HEADINGS: readonly number[] = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
export const MIN_HEADINGS = 4;

/** A dig test of (x, z) for a worm arriving facing `heading` (the game's canDigAt unless a test passes another). */
export type MoundTest = (x: number, z: number, heading: number) => boolean;

/** The deepest the leaves are under a mound at (x, z) (out a little past its foot). */
export function litterUnder(x: number, z: number): number {
  let most = litterDepth(x, z);
  for (let a = 0; a < 12; a++) {
    for (const d of [0.4, 0.8, 1.1]) most = Math.max(most, litterDepth(x + Math.cos(a * 0.5236) * d, z + Math.sin(a * 0.5236) * d));
  }
  return most;
}

/** How many HEADINGS pass the dig test at (x, z). */
export function headingsOpen(x: number, z: number, test: MoundTest = canDigAt): number {
  let n = 0;
  for (const h of HEADINGS) if (test(x, z, h)) n++;
  return n;
}

/** The scatter: [x, z, x, z, ...] (to the cm, 0.01 u), in the order chosen. */
export function scatterMounds(test: MoundTest = canDigAt): number[] {
  const rand = mulberry32(SEED);
  const out: number[] = [];
  for (let i = 0; i < CANDIDATES; i++) {
    const x = Math.round((rand() * 2 - 1) * LIM * 100) / 100;
    const z = Math.round((rand() * 2 - 1) * LIM * 100) / 100;
    if (hypot2(x, z) < SPAWN_CLEAR) continue;
    let crowded = false;
    for (let k = 0; k < out.length && !crowded; k += 2) crowded = hypot2(out[k] - x, out[k + 1] - z) < MOUND_GAP;
    if (!crowded && litterUnder(x, z) <= MAX_LITTER && headingsOpen(x, z, test) >= MIN_HEADINGS) out.push(x, z);
  }
  return out;
}
