import { describe, it, expect } from 'vitest';
import { pathDistance, sample, sample1, walkFoot, type FootPose } from '../../src/opening/keys';
import {
  CAPTIONS, EASE_END, EASE_START, KIDS, LID, OPENING_END, RIGHT_HAND, LEFT_HAND, SOIL_SIZE, TEACHER_PATH,
  TEACHER_YAW, TUB, WORM, captionAt, kidPath, wormMove,
} from '../../src/opening/script';
import { TEXT } from '../../src/content/text';

describe('opening keys', () => {
  const track = [[0, 0, 10], [1, 10, 10], [3, 10, 30]];

  it('holds before the first key and after the last', () => {
    expect(sample(track, -1, [0, 0])).toEqual([0, 10]);
    expect(sample(track, 9, [0, 0])).toEqual([10, 30]);
  });

  it('eases each segment, or blends straight when linear', () => {
    expect(sample(track, 0.5, [0, 0])).toEqual([5, 10]);
    expect(sample(track, 0.25, [0, 0])[0]).toBeLessThan(2.5);
    expect(sample(track, 0.25, [0, 0], true)[0]).toBeCloseTo(2.5);
    expect(sample1([[0, 0], [2, 4]], 1)).toBeCloseTo(2);
  });

  it('measures a path walked at a steady speed', () => {
    const path = [[0, 0, 0, 0], [1, 3, 0, 4], [2, 3, 0, 4], [3, 3, 0, 10]];
    expect(pathDistance(path, 0.5)).toBeCloseTo(2.5);
    expect(pathDistance(path, 1.5)).toBeCloseTo(5);
    expect(pathDistance(path, 9)).toBeCloseTo(11);
  });

  it('a planted foot never slides: it moves back exactly as the body moves forward', () => {
    const out: FootPose = { ahead: 0, lift: 0 };
    // Foot 0 is planted for the first half of each 20-unit cycle.
    const at = (d: number): number => d + walkFoot(d, 20, 0, 3, 1, out).ahead;
    expect(walkFoot(2, 20, 0, 3, 1, out).lift).toBe(0);
    expect(at(2)).toBeCloseTo(at(7));
    expect(at(22)).toBeCloseTo(at(29));
    expect(at(22) - at(2)).toBeCloseTo(20);
    expect(walkFoot(15, 20, 0, 3, 1, out).lift).toBeGreaterThan(0);
  });

  it('the feet are half a cycle apart, and a stopped walker\'s feet come down', () => {
    const a: FootPose = { ahead: 0, lift: 0 };
    const b: FootPose = { ahead: 0, lift: 0 };
    walkFoot(5, 20, 0, 3, 1, a);
    walkFoot(5, 20, 1, 3, 1, b);
    expect(a.lift === 0 || b.lift === 0).toBe(true);
    walkFoot(15, 20, 0, 3, 0, a);
    walkFoot(15, 20, 1, 3, 0, b);
    expect(a.lift).toBe(0);
    expect(b.lift).toBe(0);
  });
});

describe('opening script', () => {
  const inOrder = (keys: readonly (readonly number[])[]): boolean => keys.every((k, i) => i === 0 || k[0] >= keys[i - 1][0]);

  it('is a short scene that eases into play before it ends (Matt: 20 seconds)', () => {
    expect(OPENING_END).toBe(20);
    expect(EASE_START).toBeLessThan(EASE_END);
    expect(EASE_END).toBeLessThanOrEqual(OPENING_END);
  });

  it('every track is in time order and inside the scene', () => {
    const kids = KIDS.map((k) => kidPath(k));
    for (const keys of [TEACHER_PATH, TEACHER_YAW, TUB, LID, SOIL_SIZE, RIGHT_HAND, LEFT_HAND, ...kids]) {
      expect(inOrder(keys)).toBe(true);
      expect(keys[keys.length - 1][0]).toBeLessThanOrEqual(OPENING_END);
    }
  });

  it('captions are in order, never overlap, have words, and stay up long enough to read', () => {
    CAPTIONS.forEach((c, i) => {
      expect(c.to).toBeGreaterThan(c.from);
      expect(c.to).toBeLessThanOrEqual(OPENING_END);
      if (i > 0) expect(c.from).toBeGreaterThanOrEqual(CAPTIONS[i - 1].to);
      expect(TEXT[c.line].text.length).toBeGreaterThan(0);
      // Spoken lines: at least about 3 words a second.
      if (c.who) expect(c.to - c.from).toBeGreaterThanOrEqual(TEXT[c.line].text.split(/\s+/).length / 3.2);
    });
    expect(captionAt(CAPTIONS[0].from)).toBe(CAPTIONS[0]);
    expect(captionAt(0)).toBeNull();
    expect(captionAt(OPENING_END)).toBeNull();
  });

  it('the worm waits in the tub, inches out, looks both ways, then crawls until its head is past the big leaf', () => {
    const m = { x: 0, y: 0 };
    const first = WORM.moves[0][0];
    expect(first).toBeGreaterThanOrEqual(WORM.showAt);
    expect(wormMove(first - 0.1, 0, m)).toEqual({ x: 0, y: 0 });
    expect(wormMove(first, 0, m).y).toBeGreaterThan(0);
    // It looks one way and back by the same amount, then turns left (negative x) toward the leaf.
    const turns = WORM.moves.map(([, , x]) => x).filter((x) => x !== 0);
    expect(turns[0] + turns[1]).toBeCloseTo(0);
    expect(turns.reduce((a, b) => a + b, 0)).toBeLessThan(0);
    const last = WORM.moves[WORM.moves.length - 1];
    expect(wormMove(last[0] + 1, 0, m).y).toBe(last[1]);
    expect(Math.abs(m.x)).toBeLessThanOrEqual(WORM.wiggle);
    expect(wormMove(last[0] + 1, WORM.stopZ, m)).toEqual({ x: 0, y: 0 });
  });

  it('the teacher says why a loose bait worm matters, with a source (Matt, 2026-10-16)', () => {
    const facts = CAPTIONS.filter((c) => c.who === 'teacher' && TEXT[c.line].kind === 'fact');
    expect(facts.length).toBeGreaterThanOrEqual(2);
  });
});

describe('the opening on a tall screen', () => {
  it('keeps play\'s field of view on a wide screen and widens it, capped, on a phone held upright', async () => {
    const { sceneFov } = await import('../../src/opening/opening');
    expect(sceneFov(16 / 9, 60)).toBeCloseTo(60);
    expect(sceneFov(1.6, 60)).toBeCloseTo(60);
    expect(sceneFov(4 / 3, 60)).toBeGreaterThan(60);
    expect(sceneFov(390 / 844, 60)).toBe(105);
  });
});
