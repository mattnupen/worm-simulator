import { describe, expect, it } from 'vitest';
import { createRhythm, inWindow, RHYTHM, ringProgress, shrinkOf, startRhythm, stepRhythm, toTarget, type BeatCall, type RhythmState } from '../../src/predators/rhythm';

const DT = 1 / 60;

/**
 * Plays a grab: `tapAt(s)` says how long before (+) or after (-) the ring meets the dot to tap in
 * each beat (null: no tap). Returns the state at the end and each beat's call.
 */
function play(tapAt: (s: RhythmState) => number | null, limit = 40): { s: RhythmState; calls: BeatCall[] } {
  const s = createRhythm();
  const calls: BeatCall[] = [];
  let tapped = -1;
  while (s.result === 'none' && s.elapsed < limit) {
    const want = s.phase === 'ring' ? tapAt(s) : null;
    // Tap on the first step at or past the wanted moment (once a beat).
    const press = want !== null && tapped !== s.beat && toTarget(s) - DT <= want;
    if (press) tapped = s.beat;
    const c = stepRhythm(s, DT, press);
    if (c !== 'none') calls.push(c);
  }
  return { s, calls };
}

describe('the rhythm grip (V4 revision 1)', () => {
  it('starts with a lead-in, then rings that take shrinkFirst, a little faster each beat', () => {
    const s = createRhythm();
    expect(s.phase).toBe('lead');
    for (let t = 0; t < RHYTHM.lead + DT; t += DT) stepRhythm(s, DT, false);
    expect(s.phase).toBe('ring');
    expect(s.beat).toBe(1);
    expect(s.shrink).toBeCloseTo(RHYTHM.shrinkFirst);
    expect(shrinkOf(2)).toBeLessThan(shrinkOf(1));
    expect(shrinkOf(50)).toBeCloseTo(RHYTHM.shrinkLast);
    expect(RHYTHM.shrinkFirst).toBeGreaterThanOrEqual(1);
    expect(RHYTHM.shrinkFirst).toBeLessThanOrEqual(1.3);
  });

  it('5 taps on time escape, in about 8 to 11 seconds', () => {
    const { s, calls } = play(() => 0);
    expect(s.result).toBe('escaped');
    expect(calls).toEqual(['good', 'good', 'good', 'good', 'good']);
    expect(s.goods).toBe(RHYTHM.goods);
    expect(s.elapsed).toBeGreaterThan(8);
    expect(s.elapsed).toBeLessThan(11);
  });

  it('3 misses and the robin wins: no taps, too early or too late', () => {
    for (const tap of [() => null, () => RHYTHM.early + 0.08, () => -(RHYTHM.late + 0.06)]) {
      const { s, calls } = play(tap);
      expect(s.result).toBe('pulledOut');
      expect(s.misses).toBe(RHYTHM.misses);
      expect(calls.length).toBe(3);
    }
    expect(play(() => RHYTHM.early + 0.08).calls).toEqual(['early', 'early', 'early']);
    expect(play(() => null).calls).toEqual(['late', 'late', 'late']);
  });

  it('the window: from `early` before the dot to `late` after it is good, just outside is not', () => {
    expect(play(() => RHYTHM.early - 0.02).calls[0]).toBe('good');
    expect(play(() => -(RHYTHM.late - 0.03)).calls[0]).toBe('good');
    expect(play(() => RHYTHM.early + 0.04).calls[0]).toBe('early');
    // The window is fair on a Chromebook: about a third of a second, more after than before.
    expect(RHYTHM.early + RHYTHM.late).toBeGreaterThanOrEqual(0.3);
    expect(RHYTHM.late).toBeGreaterThanOrEqual(RHYTHM.early);
  });

  it('mixed beats: whichever count fills first ends it', () => {
    // good, miss, good, miss, good, good, good: 5 goods before the third miss.
    const pattern = [0, null, 0, null, 0, 0, 0];
    const { s, calls } = play((st) => pattern[st.beat - 1] ?? null);
    expect(calls).toEqual(['good', 'late', 'good', 'late', 'good', 'good', 'good']);
    expect(s.result).toBe('escaped');
    expect(s.misses).toBe(2);
  });

  it('the first press in a beat decides it; more presses that beat change nothing', () => {
    const s = createRhythm();
    while (s.phase !== 'ring') stepRhythm(s, DT, false);
    // Hammering from the start of the ring: the deaf moment passes, then the first press is early.
    const calls: BeatCall[] = [];
    while (s.phase === 'ring') {
      const c = stepRhythm(s, DT, true);
      if (c !== 'none') calls.push(c);
    }
    expect(calls).toEqual(['early']);
    expect(s.offset).toBeCloseTo(RHYTHM.deaf - s.shrink + DT, 1);
    // Pressing all through the regrip does nothing: the beat is decided.
    while (s.phase === 'regrip') expect(stepRhythm(s, DT, true)).toBe('none');
    expect(s.misses).toBe(1);
    expect(s.goods).toBe(0);
  });

  it('a press in the ring\'s first moments (a double tap) is not the beat\'s tap', () => {
    const s = createRhythm();
    while (s.phase !== 'ring') stepRhythm(s, DT, false);
    expect(stepRhythm(s, DT, true)).toBe('none');
    expect(s.phase).toBe('ring');
  });

  it('reports the ring for the HUD: progress, time to the dot, and the window', () => {
    const s = createRhythm();
    expect(toTarget(s)).toBeNaN();
    while (s.phase !== 'ring') stepRhythm(s, DT, false);
    expect(ringProgress(s)).toBeLessThan(0.05);
    while (toTarget(s) > 0.05) stepRhythm(s, DT, false);
    expect(inWindow(s)).toBe(true);
    expect(ringProgress(s)).toBeGreaterThan(0.95);
  });

  it('starts again cleanly for the next grab, and does nothing once over', () => {
    const { s } = play(() => 0);
    expect(stepRhythm(s, DT, true)).toBe('none');
    startRhythm(s);
    expect(s.result).toBe('none');
    expect(s.goods + s.misses + s.beat).toBe(0);
    expect(s.phase).toBe('lead');
  });
});
