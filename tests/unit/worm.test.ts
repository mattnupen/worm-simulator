import { describe, it, expect } from 'vitest';
import { createBody, followHead } from '../../src/worm/body';
import { stepWorm } from '../../src/worm/locomotion';
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
});
