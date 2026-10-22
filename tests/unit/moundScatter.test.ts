import { describe, it, expect } from 'vitest';
import {
  CANDIDATES, HEADINGS, LIM, MIN_HEADINGS, MOUND_GAP, SPAWN_CLEAR, headingsOpen, scatterMounds,
} from '../../src/underground/moundScatter';
import { MOUND_SPOTS } from '../../src/underground/moundSpots';
import { MAX_LITTER, litterUnder } from '../../src/underground/moundScatter';

const pairs = (s: readonly number[]): [number, number][] => Array.from({ length: s.length / 2 }, (_, i) => [s[i * 2], s[i * 2 + 1]]);

describe('where the casting mounds stand (Matt\'s review: "Spread them out")', () => {
  it('the baked table is the scatter, run again now (deterministic: every load and device the same)', () => {
    const now = scatterMounds();
    // On a failure the world changed under the mounds: paste this into src/underground/moundSpots.ts.
    if (JSON.stringify(now) !== JSON.stringify(MOUND_SPOTS)) console.log(`MOUND_SPOTS = ${JSON.stringify(now)}`);
    expect(now).toEqual(MOUND_SPOTS);
    expect(scatterMounds()).toEqual(now);
  });

  it('spread out over the play area: MOUND_GAP apart, inside the dig limits, off the spawn, a modest count', () => {
    const spots = pairs(MOUND_SPOTS);
    expect(spots.length).toBeGreaterThanOrEqual(10);
    expect(spots.length).toBeLessThanOrEqual(40);
    expect(MOUND_GAP).toBeGreaterThanOrEqual(7);
    for (const [i, [x, z]] of spots.entries()) {
      expect(Math.abs(x)).toBeLessThanOrEqual(LIM);
      expect(Math.abs(z)).toBeLessThanOrEqual(LIM);
      expect(Math.hypot(x, z)).toBeGreaterThanOrEqual(SPAWN_CLEAR);
      expect(litterUnder(x, z)).toBeLessThanOrEqual(MAX_LITTER);
      for (const [x2, z2] of spots.slice(i + 1)) expect(Math.hypot(x - x2, z - z2)).toBeGreaterThanOrEqual(MOUND_GAP);
    }
    // Every quarter of the play area has some (not bunched in one corner).
    const quarters = new Set(spots.map(([x, z]) => `${x > 0}${z > 0}`));
    expect(quarters.size).toBe(4);
  });

  it('each stands where the worm can really dig down, from most directions', () => {
    for (const [x, z] of pairs(MOUND_SPOTS)) expect(headingsOpen(x, z)).toBeGreaterThanOrEqual(MIN_HEADINGS);
    expect(MIN_HEADINGS * 2).toBeGreaterThanOrEqual(HEADINGS.length);
  });

  it('with digging allowed everywhere it fills the area, still never closer than MOUND_GAP (no grid)', () => {
    const spots = pairs(scatterMounds(() => true));
    expect(spots.length).toBeGreaterThan(12);
    let nearest = Infinity;
    for (const [i, [x, z]] of spots.entries()) {
      for (const [x2, z2] of spots.slice(i + 1)) nearest = Math.min(nearest, Math.hypot(x - x2, z - z2));
    }
    expect(nearest).toBeGreaterThanOrEqual(MOUND_GAP);
    // Not lined up: the x positions are all different (darts, not a lattice).
    expect(new Set(spots.map(([x]) => Math.round(x))).size).toBeGreaterThan(spots.length * 0.6);
    expect(CANDIDATES).toBeGreaterThan(spots.length * 10);
  });
});
