import { describe, it, expect } from 'vitest';
import { hypot2, hypot3 } from '../../src/core/vec';
import { mulberry32 } from '../../src/core/random';

// hypot2 and hypot3 replace Math.hypot on the per-step paths (it allocates every call), so they
// must give the very same numbers: the game's behaviour may not change by a bit.

const SPECIAL = [
  0, -0, 1, -1, 3, 4, 0.1, 0.2, 0.3, NaN, Infinity, -Infinity, 5e-324, -5e-324,
  2.2250738585072014e-308, 1.7976931348623157e308, -1.7976931348623157e308, 1e-160, 1e160,
];

describe('hypot2 and hypot3 (Math.hypot without its garbage)', () => {
  it('match Math.hypot bit for bit on zeros, infinities, NaN, the extremes and subnormals', () => {
    for (const a of SPECIAL) {
      for (const b of SPECIAL) {
        expect(Object.is(hypot2(a, b), Math.hypot(a, b)), `${a}, ${b}`).toBe(true);
        for (const c of SPECIAL) expect(Object.is(hypot3(a, b, c), Math.hypot(a, b, c)), `${a}, ${b}, ${c}`).toBe(true);
      }
    }
  });

  it('match Math.hypot bit for bit on random values of every size', () => {
    const rand = mulberry32(17);
    const value = (): number => {
      const k = rand();
      const sign = rand() < 0.5 ? -1 : 1;
      if (k < 0.6) return sign * rand() * 10;
      if (k < 0.8) return sign * rand() * 1e-3;
      return sign * Math.exp((rand() - 0.5) * 1400);
    };
    let wrong = 0;
    for (let i = 0; i < 300_000; i++) {
      const a = value();
      const b = value();
      const c = value();
      if (!Object.is(hypot2(a, b), Math.hypot(a, b))) wrong++;
      if (!Object.is(hypot3(a, b, c), Math.hypot(a, b, c))) wrong++;
    }
    expect(wrong).toBe(0);
  });
});
