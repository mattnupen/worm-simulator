import { describe, it, expect } from 'vitest';
import { parseParams } from '../../src/game/params';

const NO_ROBIN = { robin: false, robinAt: null, robinTurn: 0, robinDist: 9, robinCam: null, wormLength: null, hunt: true, robinIn: null, nest: false, nestAt: null, nestEscape: false, digMarks: true, eatingAt: null };

describe('parseParams', () => {
  it('defaults: no forced preset, no fps tag, not quick, Start screen', () => {
    expect(parseParams('')).toEqual({ preset: null, fps: false, quick: false, speedTest: false, prompt: null, dig: false, lesson: false, opening: null, openingAt: null, ...NO_ROBIN });
  });
  it('reads ?preset=, ?fps=1, ?quick=1 and ?speedtest=1', () => {
    expect(parseParams('?preset=ultra&fps=1&quick=1&speedtest=1'))
      .toEqual({ preset: 'ultra', fps: true, quick: true, speedTest: true, prompt: null, dig: false, lesson: false, opening: null, openingAt: null, ...NO_ROBIN });
  });
  it('ignores an unknown preset (and Auto, which is not a preset)', () => {
    expect(parseParams('?preset=extreme').preset).toBeNull();
    expect(parseParams('?preset=auto').preset).toBeNull();
  });
  it('ignores V1\'s ?scale= (V2 is real size only)', () => {
    expect(parseParams('?scale=classic&preset=low')).toEqual({ preset: 'low', fps: false, quick: false, speedTest: false, prompt: null, dig: false, lesson: false, opening: null, openingAt: null, ...NO_ROBIN });
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
  it('reads the robin preview options (V4 review) and ignores bad numbers', () => {
    expect(parseParams('?robin=1&robinAt=8&robinTurn=90&robinDist=6&robinCam=30'))
      .toMatchObject({ robin: true, robinAt: 8, robinTurn: 90, robinDist: 6, robinCam: 30 });
    expect(parseParams('?robin=yes&robinDist=abc&robinAt=x')).toMatchObject({ robin: false, robinDist: 9, robinAt: null });
  });
  it('reads ?digMarks=0 (no dig markers); anything else leaves them on', () => {
    expect(parseParams('?digMarks=0').digMarks).toBe(false);
    expect(parseParams('?digMarks=1').digMarks).toBe(true);
    expect(parseParams('?digMarks=off').digMarks).toBe(true);
  });
  it('reads ?wormLength= (a short worm to look at) and ignores one that is not a number', () => {
    expect(parseParams('?wormLength=0.6').wormLength).toBe(0.6);
    expect(parseParams('?wormLength=short').wormLength).toBeNull();
    expect(parseParams('?wormLength=').wormLength).toBeNull();
  });
  it('reads ?hunt=0 (the hunt\'s rollback switch) and ?robinIn= (the first robin sooner)', () => {
    expect(parseParams('?hunt=0').hunt).toBe(false);
    expect(parseParams('?hunt=1').hunt).toBe(true);
    expect(parseParams('?hunt=off').hunt).toBe(true);
    expect(parseParams('?robinIn=3').robinIn).toBe(3);
    expect(parseParams('?robinIn=soon').robinIn).toBeNull();
  });
  it('reads the nest scene preview (?nest=1, ?nestAt=) and ignores anything else', () => {
    expect(parseParams('?nest=1&nestAt=6.5')).toMatchObject({ nest: true, nestAt: 6.5 });
    expect(parseParams('?nest=yes&nestAt=soon')).toMatchObject({ nest: false, nestAt: null });
  });
  it('reads ?nestEscape=1 (the wiggle-free test switch), off otherwise', () => {
    expect(parseParams('?nestEscape=1').nestEscape).toBe(true);
    expect(parseParams('?nestEscape=yes').nestEscape).toBe(false);
    expect(parseParams('').nestEscape).toBe(false);
  });
});

describe('the eating film preview', () => {
  it('reads ?eatingAt=31 (the film jumps there and holds); none otherwise', () => {
    expect(parseParams('?lesson=eating&eatingAt=31').eatingAt).toBe(31);
    expect(parseParams('?lesson=eating').eatingAt).toBeNull();
    // A lesson id opens it straight away too, even when it is this build's lesson.
    expect(parseParams('?lesson=eating').lesson).toBe(true);
  });
});
