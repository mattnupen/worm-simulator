import { describe, expect, it } from 'vitest';
import { PIECE, bristleOut, segLength, segRadius, squeeze } from '../../src/anatomy/bristles/shapes';
import { BristleScene } from '../../src/anatomy/bristles/scene';

describe('bristle close-up', () => {
  it('a squeezed segment is short and fat with its bristles out; a stretched one is long and thin with them in', () => {
    expect(segLength(1)).toBeLessThan(segLength(0));
    expect(segRadius(1)).toBeGreaterThan(segRadius(0));
    expect(bristleOut(1)).toBe(1);
    expect(bristleOut(0)).toBe(0);
  });

  it('the squeeze travels from head to tail', () => {
    // Segment 0 is squeezed most first; a moment later the peak is further back.
    const peak = (phase: number) => {
      let best = 0;
      for (let i = 0; i < PIECE; i++) if (squeeze(i, phase) > squeeze(best, phase)) best = i;
      return best;
    };
    expect(peak(0.3)).toBeGreaterThan(peak(0.1));
  });

  it('the worm crawls head first: the soil slides back past it', () => {
    const scene = new BristleScene();
    const soil = scene.group.children.find((c) => c.type === 'Group')!;
    const before = (scene as unknown as { travelled: number }).travelled;
    for (let i = 0; i < 300; i++) scene.update(1 / 30);
    expect((scene as unknown as { travelled: number }).travelled).toBeLessThan(before - 2);
    expect(soil).toBeDefined();
  });
});
