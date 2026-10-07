import { describe, it, expect } from 'vitest';
import { createPressEdge } from '../../src/input/actionEdge';

describe('createPressEdge', () => {
  it('is true only on the step the level goes down', () => {
    const e = createPressEdge();
    const seen = [false, true, true, true, false, false, true, false, true].map((l) => e.update(l));
    expect(seen).toEqual([false, true, false, false, false, false, true, false, true]);
  });

  it('a level held from the first step counts as one press', () => {
    const e = createPressEdge();
    expect(e.update(true)).toBe(true);
    expect(e.update(true)).toBe(false);
  });

  it('each edge detector keeps its own state', () => {
    const a = createPressEdge();
    const b = createPressEdge();
    expect(a.update(true)).toBe(true);
    expect(b.update(true)).toBe(true);
  });
});
