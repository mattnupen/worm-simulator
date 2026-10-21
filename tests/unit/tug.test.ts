import { describe, expect, it } from 'vitest';
import { createTug, startTug, stepTug, TUG, type TugState } from '../../src/predators/tug';

const DT = 1 / 60;

/** A steady, repeatable 0..1 sequence (no Math.random in tests). */
function seq(seed = 1): () => number {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
}

/** Plays a grab with a holding strategy; returns the end state. */
function play(hold: (s: TugState) => boolean, seed = 1, limit = 40): TugState {
  const rand = seq(seed);
  const s = createTug();
  startTug(s, rand);
  while (s.result === 'none' && s.elapsed < limit) stepTug(s, DT, hold(s), rand);
  return s;
}

describe('grip mini-game', () => {
  it('pulling between tugs and easing off as they land escapes in about 6 to 10 seconds', () => {
    for (const seed of [1, 7, 42, 99]) {
      const s = play((st) => st.phase !== 'tug', seed);
      expect(s.result).toBe('escaped');
      expect(s.elapsed).toBeGreaterThan(5);
      expect(s.elapsed).toBeLessThan(11);
    }
  });

  it('holding all the time stretches the worm until it breaks', () => {
    expect(play(() => true).result).toBe('broke');
  });

  it('never holding, the robin pulls the worm out', () => {
    expect(play(() => false).result).toBe('pulledOut');
  });

  it('a cautious player who lets go as soon as the robin leans back still escapes', () => {
    expect(play((st) => st.phase === 'calm').result).toBe('escaped');
  });

  it('a late let-go (holding through the lean, letting go once the tug lands) still escapes', () => {
    const s = play((st) => st.phase !== 'tug' || st.t < 0.1);
    expect(s.result).toBe('escaped');
  });

  it('the robin leans back before every tug, long enough to react', () => {
    const rand = seq(3);
    const s = createTug();
    startTug(s, rand);
    let prev = s.phase;
    let leanTime = 0;
    for (let i = 0; i < 600; i++) {
      stepTug(s, DT, false, rand);
      if (s.result !== 'none') break;
      if (s.phase === 'lean') leanTime += DT;
      if (s.phase === 'tug' && prev !== 'tug') {
        expect(prev).toBe('lean');
        expect(leanTime).toBeGreaterThanOrEqual(TUG.lean - DT);
        leanTime = 0;
      }
      prev = s.phase;
    }
  });

  it('stays in range and stops changing once it has a result', () => {
    const s = play(() => true);
    const before = { ...s };
    stepTug(s, DT, true, seq());
    expect(s).toEqual(before);
    expect(s.pos).toBeGreaterThanOrEqual(0);
    expect(s.stretch).toBeLessThanOrEqual(1);
  });
});
