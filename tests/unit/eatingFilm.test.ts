import { describe, expect, it } from 'vitest';
import {
  BEATS, CASTS, CROP_X, DIP, FILM_END, FOOD, GIZZARD_X, GRIND, INSIDE_FROM, INSIDE_TO, IN_CAMERA, LABELS, MM,
  OUT_CAMERA, PARTS, REACH, SQUEEZE_HZ, TAIL, beatAt, dipAt, insideAt,
} from '../../src/eatingFilm/script';
import { EATING } from '../../src/content/lessons/eating';
import { LENGTH, ORGANS, segStart } from '../../src/anatomy/layout';

const times = (keys: readonly (readonly number[])[]): number[] => keys.map((k) => k[0]);
const rising = (xs: number[]): boolean => xs.every((x, i) => i === 0 || x > xs[i - 1]);

describe('the eating film script (V4 lesson, Follow the leaf)', () => {
  it("has a beat for every stop of the lesson, in the lesson's order, between outside and the midden", () => {
    const body = EATING.steps.find((s) => s.kind === 'body');
    expect(body?.kind).toBe('body');
    if (body?.kind !== 'body') return;
    expect(BEATS.map(([b]) => b)).toEqual(['outside', ...body.stops.map((s) => s.part), 'midden']);
    expect(rising(BEATS.map(([, t]) => t))).toBe(true);
    expect(BEATS[BEATS.length - 1][1]).toBeLessThan(FILM_END);
  });

  it('says the beat at each time, and goes inside the worm for the parts only', () => {
    expect(beatAt(0)).toBe('outside');
    expect(beatAt(INSIDE_FROM)).toBe('mouth');
    expect(beatAt(30)).toBe('gizzard');
    expect(beatAt(FILM_END)).toBe('midden');
    expect(insideAt(INSIDE_FROM - 0.01)).toBe(false);
    expect(insideAt(INSIDE_FROM)).toBe(true);
    expect(insideAt(INSIDE_TO)).toBe(false);
    for (const [b, t] of BEATS) expect(insideAt(t + 0.5)).toBe(b !== 'outside' && b !== 'midden');
  });

  it('dips to black only at the two switches, slowly (no flashing)', () => {
    expect(dipAt(INSIDE_FROM)).toBe(1);
    expect(dipAt(INSIDE_TO)).toBe(1);
    expect(dipAt(INSIDE_FROM - DIP / 2)).toBe(0);
    expect(dipAt(5)).toBe(0);
    expect(dipAt(30)).toBe(0);
    // One fade in and out over DIP seconds: well under 3 changes a second.
    expect(DIP).toBeGreaterThanOrEqual(0.67);
  });

  it('keys run forward in time, inside the film', () => {
    for (const keys of [REACH, OUT_CAMERA, IN_CAMERA, FOOD, CASTS]) {
      expect(rising(times(keys))).toBe(true);
      expect(Math.max(...times(keys))).toBeLessThanOrEqual(FILM_END);
    }
  });

  it('grinds in the gizzard slower than 3 squeezes a second, while the gizzard beat shows', () => {
    expect(SQUEEZE_HZ).toBeLessThan(3);
    expect(beatAt(GRIND[0])).toBe('gizzard');
    expect(beatAt(GRIND[1] - 0.01)).toBe('gizzard');
  });

  it("takes every place inside from the anatomy model, so the film follows it", () => {
    expect(TAIL).toBeCloseTo(LENGTH * MM);
    expect(PARTS.crop[0]).toBeCloseTo(segStart(ORGANS.crop[0]) * MM);
    expect(PARTS.gizzard[1]).toBeCloseTo(segStart(ORGANS.gizzard[1] + 1) * MM);
    expect(PARTS.pharynx[1]).toBeLessThan(PARTS.esophagus[1]);
    expect(PARTS.esophagus[1]).toBeLessThanOrEqual(CROP_X);
    expect(CROP_X).toBeLessThan(GIZZARD_X);
    // Every label points inside the body.
    for (const l of LABELS) {
      expect(l.x, l.name).toBeGreaterThanOrEqual(0);
      expect(l.x, l.name).toBeLessThanOrEqual(TAIL);
      expect(Math.abs(l.y), l.name).toBeLessThan(1.2);
    }
  });
});
