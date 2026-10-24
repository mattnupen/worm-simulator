import { describe, expect, it } from 'vitest';
import { bristleOut, headScale, segLength, segRadius, squeezeAt } from '../../src/anatomy/bristles/shapes';
import { BristleScene } from '../../src/anatomy/bristles/scene';
import { RINGS, WormBody } from '../../src/anatomy/bristles/body';

describe('bristle close-up', () => {
  it('a squeezed place is short and fat with its bristles out; a stretched one is long and thin with them in', () => {
    expect(segLength(1)).toBeLessThan(segLength(0));
    expect(segRadius(1)).toBeGreaterThan(segRadius(0));
    expect(bristleOut(1)).toBe(1);
    expect(bristleOut(0)).toBe(0);
  });

  it('the squeeze travels from head to tail', () => {
    // At a later phase the same squeeze is found further back.
    expect(squeezeAt(1, 0.1)).toBeCloseTo(squeezeAt(1 + 7 * 0.1, 0.2), 6);
  });

  it('the body is one smooth tube: neighbouring rings never jump in size', () => {
    const body = new WormBody();
    for (const phase of [0, 0.3, 0.7]) {
      body.pose(phase);
      for (let k = 1; k < RINGS; k++) expect(Math.abs(body.r[k] - body.r[k - 1])).toBeLessThan(0.45);
    }
  });

  it('the head is a blunt point, widening behind', () => {
    expect(headScale(-0.75)).toBe(0);
    expect(headScale(1)).toBeGreaterThan(headScale(0));
    expect(headScale(5)).toBe(1);
  });

  it('the worm crawls head first and smoothly: the soil slides back past it', () => {
    const scene = new BristleScene();
    const read = () => (scene as unknown as { travelled: number }).travelled;
    let last = read();
    let biggest = 0;
    for (let i = 0; i < 300; i++) {
      scene.update(1 / 30);
      biggest = Math.max(biggest, Math.abs(read() - last));
      last = read();
    }
    expect(last).toBeLessThan(-2);
    // No sudden jumps from one frame to the next.
    expect(biggest).toBeLessThan(0.08);
  });
});
