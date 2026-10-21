/**
 * The grip mini-game (V4 spec 2): the robin has the worm's front end and tugs; the player holds
 * Action to grip with the bristles and pull back into the ground. Like reeling in a fish: pull
 * while it's calm, ease off as a tug lands. Holding through a tug stretches the worm, and a worm
 * stretched too far breaks (real: Journey North, "the worm can break as the robin tugs"). The
 * timing game itself is a Game choice: real worms don't time their pulls.
 *
 *   calm --(a wait)--> lean (the robin leans back: the warning) --> tug --> calm ...
 *
 * `pos` runs from 0 (back in the burrow: escaped) to 1 (pulled out). Pure and allocation-free:
 * one state object, stepped at the game's fixed step.
 */

/** Every number in one place, so they can change after Matt plays it. Seconds and fractions of the bar. */
export const TUG = {
  /** Where the marker starts: the robin has most of the worm's front out. */
  start: 0.5,
  /** Holding while calm pulls the worm back in this much a second. */
  pull: 0.15,
  /** Not holding while calm, the robin slowly draws the worm out. */
  slack: 0.03,
  /** A tug, not held: the worm is pulled out this much a second. */
  yank: 0.25,
  /** A tug, held: the bristles keep most of the worm in, but it stretches. */
  heldYank: 0.05,
  /** Holding through a tug fills Stretch this much a second... */
  stretch: 1.6,
  /** ...and letting go eases it this much a second. Holding while calm keeps it where it is. */
  relax: 1.2,
  /** Stretch above this shows "Careful!". */
  careful: 0.6,
  /** The calm between tugs: from `calmMin` to `calmMin + calmSpread` seconds. */
  calmMin: 1.1,
  calmSpread: 0.7,
  /** The robin leans back for this long before it tugs: the cue to let go. */
  lean: 0.4,
  /** One tug lasts this long. */
  tugTime: 0.45,
} as const;

export type TugPhase = 'calm' | 'lean' | 'tug';
export type TugResult = 'none' | 'escaped' | 'pulledOut' | 'broke';

export interface TugState {
  /** 0 back in the burrow (escaped) to 1 pulled out. */
  pos: number;
  /** 0 to 1: at 1 the worm breaks. */
  stretch: number;
  phase: TugPhase;
  /** Seconds into the phase. */
  t: number;
  /** How long this calm lasts. */
  calm: number;
  /** Tugs so far (the first grab's hint, tests). */
  tugs: number;
  /** Seconds since the mini-game began. */
  elapsed: number;
  result: TugResult;
}

export function createTug(): TugState {
  return { pos: TUG.start, stretch: 0, phase: 'calm', t: 0, calm: TUG.calmMin, tugs: 0, elapsed: 0, result: 'none' };
}

/** Starts a new grab. `rand` gives 0..1 (Math.random in the game, a fixed sequence in tests). */
export function startTug(s: TugState, rand: () => number): void {
  s.pos = TUG.start;
  s.stretch = 0;
  s.phase = 'calm';
  s.t = 0;
  s.calm = TUG.calmMin + TUG.calmSpread * rand();
  s.tugs = 0;
  s.elapsed = 0;
  s.result = 'none';
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** One step: `holding` is the Action level (Space, the touch button or a click held down). */
export function stepTug(s: TugState, dt: number, holding: boolean, rand: () => number): void {
  if (s.result !== 'none') return;
  s.elapsed += dt;
  s.t += dt;
  if (s.phase === 'tug') {
    s.pos += (holding ? TUG.heldYank : TUG.yank) * dt;
    if (holding) s.stretch += TUG.stretch * dt;
    else s.stretch -= TUG.relax * dt;
    if (s.t >= TUG.tugTime) {
      s.phase = 'calm';
      s.t = 0;
      s.calm = TUG.calmMin + TUG.calmSpread * rand();
    }
  } else {
    // Calm or leaning back: pull while you can, rest to ease the stretch.
    if (holding) s.pos -= TUG.pull * dt;
    else {
      s.pos += TUG.slack * dt;
      s.stretch -= TUG.relax * dt;
    }
    if (s.phase === 'calm' && s.t >= s.calm) {
      s.phase = 'lean';
      s.t = 0;
    } else if (s.phase === 'lean' && s.t >= TUG.lean) {
      s.phase = 'tug';
      s.t = 0;
      s.tugs++;
    }
  }
  s.stretch = clamp01(s.stretch);
  s.pos = clamp01(s.pos);
  if (s.stretch >= 1) s.result = 'broke';
  else if (s.pos >= 1) s.result = 'pulledOut';
  else if (s.pos <= 0) s.result = 'escaped';
}
