import { describe, it, expect } from 'vitest';
import { createBody, followHead } from '../../src/worm/body';
import { stepWorm, clampToNeck } from '../../src/worm/locomotion';
import { dist3 } from '../../src/core/vec';

const OPTS = { speed: 2, turnRate: 2, halfSize: 10 };

describe('createBody', () => {
  it('lays segments out behind the head at the given spacing', () => {
    const b = createBody(5, 0.5, { x: 0, y: 0, z: 0 }, 0);
    expect(b).toHaveLength(5);
    expect(b[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(b[1].z).toBeCloseTo(-0.5);
    expect(b[4].z).toBeCloseTo(-2);
  });
});

describe('followHead', () => {
  it('pulls segments along at exact spacing after a big move', () => {
    const b = createBody(6, 0.5, { x: 0, y: 0, z: 0 }, 0);
    followHead(b, { x: 0, y: 0, z: 3 }, 0.5);
    expect(b[0]).toEqual({ x: 0, y: 0, z: 3 });
    for (let i = 1; i < b.length; i++) expect(dist3(b[i], b[i - 1])).toBeCloseTo(0.5, 6);
  });
  it('leaves slack segments alone (no pushing)', () => {
    const b = createBody(4, 0.5, { x: 0, y: 0, z: 0 }, 0);
    const tail = { ...b[3] };
    followHead(b, { x: 0, y: 0, z: -0.2 }, 0.5);
    expect(b[3]).toEqual(tail);
  });
});

describe('stepWorm', () => {
  const start = { head: { x: 0, y: 0.1, z: 0 }, heading: 0 };
  it('moves forward along the heading', () => {
    const m = stepWorm(start, { x: 0, y: 1 }, 0.5, OPTS);
    expect(m.head.z).toBeCloseTo(1);
    expect(m.head.x).toBeCloseTo(0);
    expect(m.head.y).toBe(0.1);
  });
  it('turning right lowers the heading', () => {
    expect(stepWorm(start, { x: 1, y: 0 }, 0.5, OPTS).heading).toBeCloseTo(-1);
  });
  it('backs up at half speed', () => {
    expect(stepWorm(start, { x: 0, y: -1 }, 0.5, OPTS).head.z).toBeCloseTo(-0.5);
  });
  it('stays inside the world bounds', () => {
    const m = stepWorm({ head: { x: 0, y: 0, z: 9.9 }, heading: 0 }, { x: 0, y: 1 }, 1, OPTS);
    expect(m.head.z).toBe(10);
  });
  it('does not mutate the input', () => {
    const s = { head: { x: 0, y: 0, z: 0 }, heading: 0 };
    stepWorm(s, { x: 1, y: 1 }, 1, OPTS);
    expect(s).toEqual({ head: { x: 0, y: 0, z: 0 }, heading: 0 });
  });
  it('min turn radius limits steering while moving', () => {
    const m = stepWorm(start, { x: 1, y: 1 }, 0.1, { ...OPTS, turnRate: 5, minTurnRadius: 1 });
    expect(Math.abs(m.heading - start.heading)).toBeLessThanOrEqual(0.2 + 1e-9);
  });
  it('min turn radius keeps a body from coiling', () => {
    const body = createBody(16, 0.22, { x: 0, y: 0, z: 0 }, 0);
    const opts = { speed: 1.6, turnRate: 5, halfSize: 19, minTurnRadius: 1 };
    let m = { head: { x: 0, y: 0, z: 0 }, heading: 0 };
    for (let step = 0; step < 300; step++) {
      m = stepWorm(m, { x: 1, y: 1 }, 1 / 60, opts);
      followHead(body, m.head, 0.22);
    }
    let minDist = Infinity;
    for (let i = 0; i < body.length; i++) {
      for (let j = i + 2; j < body.length; j++) {
        minDist = Math.min(minDist, dist3(body[i], body[j]));
      }
    }
    expect(minDist).toBeGreaterThan(0.3);
  });
});

describe('clampToNeck', () => {
  it('returns heading unchanged within limit', () => {
    const result = clampToNeck(0.5, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 }, 1.3);
    expect(result).toBeCloseTo(0.5);
  });
  it('clamps heading past the limit', () => {
    const result = clampToNeck(Math.PI, { x: 0, y: 0, z: 0.22 }, { x: 0, y: 0, z: 0 }, 1.3);
    expect(Math.abs(result)).toBeCloseTo(1.3, 1);
  });
  it('handles angle wrap correctly', () => {
    const result = clampToNeck(2 * Math.PI + 0.1, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 }, 1.3);
    expect(result).toBeCloseTo(2 * Math.PI + 0.1, 5);
  });
  it('returns heading unchanged when head and neck coincide', () => {
    const result = clampToNeck(0.5, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 1.3);
    expect(result).toBeCloseTo(0.5);
  });
});
