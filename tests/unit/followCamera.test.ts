import { describe, it, expect } from 'vitest';
import { cameraTarget, smoothToward, smoothDamp, createFollowCam, stepFollowCam } from '../../src/surface/followCamera';

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

describe('smoothDamp', () => {
  it('converges without overshoot', () => {
    let state = { value: 0, velocity: 0 };
    let maxValue = 0;
    for (let i = 0; i < 240; i++) {
      state = smoothDamp(state.value, 1, state.velocity, 0.5, 1 / 60);
      maxValue = Math.max(maxValue, state.value);
    }
    expect(state.value).toBeCloseTo(1, 3);
    expect(maxValue).toBeLessThanOrEqual(1);
  });

  it('eases in with lower initial velocity than first-order', () => {
    const state = smoothDamp(0, 1, 0, 0.5, 1 / 60);
    const firstOrderVel = (1 - Math.exp(-4 / 60)) * 1 * 60;
    expect(Math.abs(state.velocity)).toBeLessThan(0.25 * firstOrderVel);
  });

  it('ignores bad dt', () => {
    const initial = { value: 5, velocity: 2 };
    expect(smoothDamp(initial.value, 10, initial.velocity, 0.5, 0)).toEqual(initial);
    expect(smoothDamp(initial.value, 10, initial.velocity, 0.5, -1)).toEqual(initial);
    expect(smoothDamp(initial.value, 10, initial.velocity, 0.5, NaN)).toEqual(initial);
  });
});

describe('stepFollowCam', () => {
  const OPTS = { distance: 3.2, height: 1.6, yawSmoothTime: 0.5, posRate: 10 };
  const origin = { x: 0, y: 0, z: 0 };
  const dt = 1 / 60;

  it('keeps orbit distance during a pivot', () => {
    let cam = createFollowCam(origin, 0, OPTS);
    for (let i = 0; i < 120; i++) {
      cam = stepFollowCam(cam, origin, 1.3, dt, OPTS);
      const horz = Math.sqrt(cam.pos.x * cam.pos.x + cam.pos.z * cam.pos.z);
      const tolerance = OPTS.distance * 0.08;
      expect(horz).toBeGreaterThan(OPTS.distance - tolerance);
      expect(horz).toBeLessThan(OPTS.distance + tolerance);
    }
  });

  it('bounds yaw speed during pivot', () => {
    let cam = createFollowCam(origin, 0, OPTS);
    let maxYawVel = 0;
    for (let i = 0; i < 120; i++) {
      cam = stepFollowCam(cam, origin, 1.3, dt, OPTS);
      maxYawVel = Math.max(maxYawVel, Math.abs(cam.yawVel));
    }
    expect(maxYawVel).toBeLessThan(2.2);
  });

  it('settles to target after 240 steps', () => {
    let cam = createFollowCam(origin, 0, OPTS);
    for (let i = 0; i < 240; i++) {
      cam = stepFollowCam(cam, origin, 1.3, dt, OPTS);
    }
    const target = cameraTarget(origin, 1.3, OPTS.distance, OPTS.height);
    expect(cam.pos.x).toBeCloseTo(target.x, 2);
    expect(cam.pos.y).toBeCloseTo(target.y, 2);
    expect(cam.pos.z).toBeCloseTo(target.z, 2);
  });
});
