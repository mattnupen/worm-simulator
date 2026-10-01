import { describe, it, expect } from 'vitest';
import { createStepper, advance } from '../../src/core/stepper';

const STEP = 1000 / 60;
const CAP30 = 1000 / 30;

describe('advance', () => {
  it('runs whole fixed steps and keeps the remainder', () => {
    const s = createStepper();
    const r = advance(s, 55, STEP, 0);
    expect(r.steps).toBe(3);
    expect(s.accumulator).toBeCloseTo(55 - 3 * STEP, 6);
  });

  it('caps rendering at 30 fps on a 60 Hz display', () => {
    const s = createStepper();
    expect(advance(s, STEP, STEP, CAP30).render).toBe(false);
    expect(advance(s, STEP, STEP, CAP30).render).toBe(true);
    expect(advance(s, STEP, STEP, CAP30).render).toBe(false);
  });

  it('renders every frame when uncapped', () => {
    const s = createStepper();
    expect(advance(s, STEP, STEP, 0).render).toBe(true);
    expect(advance(s, STEP, STEP, 0).render).toBe(true);
  });

  it('does not spiral after a long pause (tab switch)', () => {
    const s = createStepper();
    const r = advance(s, 10_000, STEP, CAP30);
    expect(r.steps).toBeLessThanOrEqual(5);
    expect(s.accumulator).toBe(0);
  });
});
