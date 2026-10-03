import { describe, it, expect } from 'vitest';
import { parseParams } from '../../src/game/params';

describe('parseParams', () => {
  it('defaults: no forced preset or scale, no fps tag, not quick, Start screen', () => {
    expect(parseParams('')).toEqual({ preset: null, scale: null, fps: false, quick: false, speedTest: false });
  });
  it('reads ?preset=, ?scale=, ?fps=1, ?quick=1 and ?speedtest=1', () => {
    expect(parseParams('?preset=ultra&scale=hybrid&fps=1&quick=1&speedtest=1'))
      .toEqual({ preset: 'ultra', scale: 'hybrid', fps: true, quick: true, speedTest: true });
  });
  it('ignores an unknown preset (and Auto, which is not a preset)', () => {
    expect(parseParams('?preset=extreme').preset).toBeNull();
    expect(parseParams('?preset=auto').preset).toBeNull();
  });
  it('reads each scale mode and ignores an unknown one', () => {
    expect(parseParams('?scale=classic').scale).toBe('classic');
    expect(parseParams('?scale=true').scale).toBe('true');
    expect(parseParams('?scale=huge').scale).toBeNull();
  });
});
