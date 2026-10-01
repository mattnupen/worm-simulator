import { describe, it, expect } from 'vitest';
import { createStepper, advance } from '../../src/core/stepper';
import { mulberry32 } from '../../src/core/random';

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

  it('holds 30 fps on a jittery 60 Hz display', () => {
    const r = mulberry32(9);
    const s = createStepper();
    let renderCount = 0;
    let totalMs = 0;
    for (let i = 0; i < 600; i++) {
      const dt = 1000 / 60 + (r() * 2 - 1) * 1.5;
      if (advance(s, dt, STEP, CAP30).render) renderCount++;
      totalMs += dt;
    }
    const fps = (renderCount / totalMs) * 1000;
    expect(fps).toBeGreaterThanOrEqual(29.5);
    expect(fps).toBeLessThanOrEqual(30.5);
  });

  it('holds about 30 fps on a 144 Hz display', () => {
    const s = createStepper();
    let renderCount = 0;
    let totalMs = 0;
    for (let i = 0; i < 1440; i++) {
      const dt = 1000 / 144;
      if (advance(s, dt, STEP, CAP30).render) renderCount++;
      totalMs += dt;
    }
    const fps = (renderCount / totalMs) * 1000;
    expect(fps).toBeGreaterThanOrEqual(29);
    expect(fps).toBeLessThanOrEqual(31);
  });

  it('ignores NaN elapsed time', () => {
    const s = createStepper();
    const r1 = advance(s, NaN, STEP, CAP30);
    expect(r1.steps).toBe(0);
    const r2 = advance(s, STEP, STEP, 0);
    expect(r2.steps).toBe(1);
    expect(r2.render).toBe(true);
  });

  it('reports interpolation alpha', () => {
    const s = createStepper();
    const r = advance(s, STEP * 1.5, STEP, 0);
    expect(r.alpha).toBeCloseTo(0.5, 6);
  });
});
