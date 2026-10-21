import { describe, it, expect } from 'vitest';
import { parseParams } from '../../src/game/params';

describe('parseParams', () => {
  it('defaults: no forced preset, no fps tag, not quick, Start screen', () => {
    expect(parseParams('')).toEqual({ preset: null, fps: false, quick: false, speedTest: false, prompt: null, dig: false, lesson: false, opening: null, openingAt: null, wormLength: null });
  });
  it('reads ?preset=, ?fps=1, ?quick=1 and ?speedtest=1', () => {
    expect(parseParams('?preset=ultra&fps=1&quick=1&speedtest=1'))
      .toEqual({ preset: 'ultra', fps: true, quick: true, speedTest: true, prompt: null, dig: false, lesson: false, opening: null, openingAt: null, wormLength: null });
  });
  it('ignores an unknown preset (and Auto, which is not a preset)', () => {
    expect(parseParams('?preset=extreme').preset).toBeNull();
    expect(parseParams('?preset=auto').preset).toBeNull();
  });
  it('ignores V1\'s ?scale= (V2 is real size only)', () => {
    expect(parseParams('?scale=classic&preset=low')).toEqual({ preset: 'low', fps: false, quick: false, speedTest: false, prompt: null, dig: false, lesson: false, opening: null, openingAt: null, wormLength: null });
  });
  it('reads ?prompt= (tests and screenshots) and ignores an unknown kind', () => {
    expect(parseParams('?prompt=digDown').prompt).toBe('digDown');
    expect(parseParams('?prompt=viewClose').prompt).toBe('viewClose');
    expect(parseParams('?prompt=fly').prompt).toBeNull();
  });
  it('reads ?dig=1: the speed test digs underground (V2 perf gates)', () => {
    expect(parseParams('?speedtest=1&dig=1').dig).toBe(true);
    expect(parseParams('?dig=yes').dig).toBe(false);
  });
  it('reads ?wormLength= (a short worm to look at) and ignores one that is not a number', () => {
    expect(parseParams('?wormLength=0.6').wormLength).toBe(0.6);
    expect(parseParams('?wormLength=short').wormLength).toBeNull();
    expect(parseParams('?wormLength=').wormLength).toBeNull();
  });
});
