import type { TugResult } from './tug';

/**
 * What happens when the grip mini-game ends (V4 spec 3). Pure: the game rolls the dice and acts.
 *
 * | The mini-game          | Roll                     | Outcome                                     |
 * |------------------------|--------------------------|---------------------------------------------|
 * | escaped                | -                        | escaped: back underground, same length      |
 * | pulledOut or broke     | under WHOLE_WORM_CHANCE  | taken: the robin gets the whole worm        |
 * | pulledOut or broke     | otherwise, length > last | broke: shorter (1 → 0.8 → 0.6), underground |
 * | pulledOut or broke     | otherwise, at the last   | tooShort: start again, full length          |
 */

/**
 * Game choice: 1 catch in 4 the robin gets the whole worm (Matt, 2026-10-21). Real catches go
 * either way; the share is the game's.
 */
export const WHOLE_WORM_CHANCE = 0.25;

/** The worm's lengths as robins break it: full, about 80%, about 60%. A break at the last is too short. */
export const BREAK_LENGTHS: readonly number[] = [1, 0.8, 0.6];

export type HuntOutcome = 'escaped' | 'broke' | 'tooShort' | 'taken';

/**
 * The outcome of a finished mini-game `result` ('none' while it runs), for a worm `length` long
 * (a share of full length) and a dice `roll` in [0, 1).
 */
export function huntOutcome(result: TugResult, roll: number, length: number): HuntOutcome | null {
  if (result === 'none') return null;
  if (result === 'escaped') return 'escaped';
  if (roll < WHOLE_WORM_CHANCE) return 'taken';
  return nextLength(length) === null ? 'tooShort' : 'broke';
}

/** The length after a break of a worm `length` long, or null when that break leaves it too short. */
export function nextLength(length: number): number | null {
  for (let i = 0; i < BREAK_LENGTHS.length - 1; i++) {
    // The first length it is at or below (within rounding): the next one down.
    if (length <= BREAK_LENGTHS[i] + 1e-6 && length > BREAK_LENGTHS[i + 1] + 1e-6) return BREAK_LENGTHS[i + 1];
  }
  return null;
}
