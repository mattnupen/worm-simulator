/**
 * The grip mini-game as a rhythm game (V4 spec revision 1, Matt 2026-10-22): the robin holds the
 * worm's front end and keeps letting go a little to get a new grip. Each time, a ring shrinks onto
 * a dot; tap Action (a press, not a hold) as the ring touches the dot. On time, the worm pulls back
 * down a step; too early, too late or no tap, the robin pulls it up a step. GOODS good taps and the
 * worm escapes; MISSES misses and the robin wins. The grip itself is real (setae: Journey North);
 * the timing game is a Game choice: real worms don't time anything.
 *
 *   lead --> ring --(the first press, or the window closing)--> regrip --> ring ... --> the end
 *
 * Pure and allocation-free: one state object, stepped at the game's fixed step with this step's
 * press (an edge: createPressEdge, or a tap).
 */

/** Every number in one place (seconds), so they can change after Matt plays it. */
export const RHYTHM = {
  /** The robin settles its hold before the first ring. */
  lead: 0.8,
  /** The first ring takes this long to shrink onto the dot... */
  shrinkFirst: 1.3,
  /** ...each one after a little less, down to this. */
  shrinkStep: 0.05,
  shrinkLast: 1.05,
  /**
   * A tap this long before the ring meets the dot, up to `late` after it, is on time: a window
   * about a third of a second wide, a little more after than before (a Chromebook's key and touch
   * delay, a slow frame, and a 6th grader's reaction all make taps land late, not early).
   */
  early: 0.15,
  late: 0.2,
  /**
   * Presses in the ring's first moments don't count (a double tap from the last beat, a key bounce):
   * only a press after this is the beat's tap.
   */
  deaf: 0.25,
  /** After each beat: "Good!" or "Missed", the worm moves, and the robin grips again. */
  regrip: 0.6,
  /** Good taps to escape, and misses until the robin wins. */
  goods: 5,
  misses: 3,
} as const;

export type BeatPhase = 'lead' | 'ring' | 'regrip';
/** How the last beat went: on time, too early, or too late (no tap in time counts as late). */
export type BeatCall = 'none' | 'good' | 'early' | 'late';
export type RhythmResult = 'none' | 'escaped' | 'pulledOut';

export interface RhythmState {
  phase: BeatPhase;
  /** Seconds into the phase. */
  t: number;
  /** Beats so far (the one ringing now counts). */
  beat: number;
  /** This beat's ring time: the ring meets the dot `shrink` seconds into the ring phase. */
  shrink: number;
  goods: number;
  misses: number;
  /** The last beat's call ('none' before the first). */
  call: BeatCall;
  /** The last tap's time from the moment the ring met the dot (s; negative early). NaN with no tap. */
  offset: number;
  result: RhythmResult;
  /** Seconds since the grab began. */
  elapsed: number;
}

export function createRhythm(): RhythmState {
  // The time fields start as fractions: a field that first held a whole number had V8 box every
  // fractional value written to it later (as burrower.ts). startRhythm sets them for a grab.
  const s: RhythmState = { phase: 'lead', t: 0.5, beat: 0, shrink: RHYTHM.shrinkFirst, goods: 0, misses: 0, call: 'none', offset: 0.5, result: 'none', elapsed: 0.5 };
  startRhythm(s);
  return s;
}

/** A new grab: the lead-in, then the first ring. */
export function startRhythm(s: RhythmState): void {
  s.phase = 'lead';
  s.t = 0;
  s.beat = 0;
  s.shrink = RHYTHM.shrinkFirst;
  s.goods = 0;
  s.misses = 0;
  s.call = 'none';
  s.offset = NaN;
  s.result = 'none';
  s.elapsed = 0;
}

/** This beat's ring time: a little faster each beat, never faster than shrinkLast. */
export function shrinkOf(beat: number): number {
  return Math.max(RHYTHM.shrinkLast, RHYTHM.shrinkFirst - RHYTHM.shrinkStep * (beat - 1));
}

/**
 * One step. `pressed`: Action went down this step (a press edge or a tap). Returns the call made
 * this step ('none' when no beat ended).
 */
export function stepRhythm(s: RhythmState, dt: number, pressed: boolean): BeatCall {
  if (s.result !== 'none') return 'none';
  s.elapsed += dt;
  s.t += dt;
  switch (s.phase) {
    case 'lead':
      if (s.t >= RHYTHM.lead) ring(s);
      return 'none';
    case 'ring': {
      const off = s.t - s.shrink;
      // The first press decides the beat; then the robin grips again and later presses wait.
      if (pressed && s.t >= RHYTHM.deaf) return judge(s, off < -RHYTHM.early ? 'early' : off <= RHYTHM.late ? 'good' : 'late', off);
      if (off > RHYTHM.late) return judge(s, 'late', NaN);
      return 'none';
    }
    case 'regrip':
      if (s.t < RHYTHM.regrip) return 'none';
      if (s.goods >= RHYTHM.goods) s.result = 'escaped';
      else if (s.misses >= RHYTHM.misses) s.result = 'pulledOut';
      else ring(s);
      return 'none';
  }
}

/** The ring's progress: 0 as it appears, 1 as it meets the dot (more after, until the window closes). */
export function ringProgress(s: RhythmState): number {
  return s.phase === 'ring' ? s.t / s.shrink : 0;
}

/** Seconds until the ring meets the dot (negative after); NaN outside a ring. */
export function toTarget(s: RhythmState): number {
  return s.phase === 'ring' ? s.shrink - s.t : NaN;
}

/** Within the window where a tap is on time. */
export function inWindow(s: RhythmState): boolean {
  if (s.phase !== 'ring') return false;
  const off = s.t - s.shrink;
  return off >= -RHYTHM.early && off <= RHYTHM.late;
}

function ring(s: RhythmState): void {
  s.phase = 'ring';
  s.t = 0;
  s.beat++;
  s.shrink = shrinkOf(s.beat);
}

function judge(s: RhythmState, call: BeatCall, off: number): BeatCall {
  s.call = call;
  s.offset = off;
  if (call === 'good') s.goods++;
  else s.misses++;
  s.phase = 'regrip';
  s.t = 0;
  return call;
}
