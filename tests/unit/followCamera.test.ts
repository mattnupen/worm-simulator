import { describe, it, expect } from 'vitest';
import { cameraTarget, smoothToward } from '../../src/surface/followCamera';

describe('cameraTarget', () => {
  it('sits behind and above the head', () => {
    const t = cameraTarget({ x: 0, y: 0, z: 0 }, 0, 3, 1.5);
    expect(t.x).toBeCloseTo(0);
    expect(t.y).toBeCloseTo(1.5);
    expect(t.z).toBeCloseTo(-3);
  });
  it('follows the heading', () => {
    const t = cameraTarget({ x: 0, y: 0, z: 0 }, Math.PI / 2, 3, 1);
    expect(t.x).toBeCloseTo(-3);
    expect(t.z).toBeCloseTo(0);
  });
});

describe('smoothToward', () => {
  const a = { x: 0, y: 0, z: 0 };
  const b = { x: 10, y: 0, z: 0 };
  it('does not move with dt = 0', () => {
    expect(smoothToward(a, b, 4, 0)).toEqual(a);
  });
  it('moves part of the way, not past the target', () => {
    const p = smoothToward(a, b, 4, 1 / 30);
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(10);
  });
  it('is frame-rate independent', () => {
    let p30 = a;
    for (let i = 0; i < 30; i++) p30 = smoothToward(p30, b, 4, 1 / 30);
    let p60 = a;
    for (let i = 0; i < 60; i++) p60 = smoothToward(p60, b, 4, 1 / 60);
    expect(p30.x).toBeCloseTo(p60.x, 6);
  });
});
