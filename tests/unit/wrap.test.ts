import { describe, it, expect } from 'vitest';
import { wrapAround, WRAP_GLSL } from '../../src/render/wrap';

describe('wrapAround', () => {
  it('lands within half a box of the centre', () => {
    for (let c = -30; c <= 30; c += 0.77) {
      for (let b = 0; b < 1; b += 0.093) {
        const x = wrapAround(b, c, 13);
        expect(x).toBeGreaterThanOrEqual(c - 6.5 - 1e-9);
        expect(x).toBeLessThan(c + 6.5 + 1e-9);
      }
    }
  });

  it('is a copy of the item home, a whole number of boxes away', () => {
    for (const c of [-21.3, -2, 0, 4.4, 17.9]) {
      const k = (wrapAround(0.37, c, 13) - 0.37 * 13) / 13;
      expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9);
    }
  });

  it('stays put while the centre moves, and jumps a whole box only past the far edge', () => {
    // Home 3 in a 10 m box: copies at -7, 3, 13.
    for (let c = -1.9; c < 7.85; c += 0.1) expect(wrapAround(0.3, c, 10)).toBeCloseTo(3, 9);
    expect(wrapAround(0.3, 8.1, 10)).toBeCloseTo(13, 9);
    expect(wrapAround(0.3, -2.1, 10)).toBeCloseTo(-7, 9);
  });

  it('has a GLSL twin with the same formula', () => {
    expect(WRAP_GLSL).toContain('mod(base * box - centre + box * 0.5, box) - box * 0.5');
  });
});
