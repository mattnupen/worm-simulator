import { describe, it, expect } from 'vitest';
import {
  createCutCam, frameTarget, snapCutCam, stepCutCam, cutPose, LABEL_ROOM,
} from '../../src/underground/cutCamera';
import { createSlab, boundaryAt, B_H } from '../../src/underground/slab';
import { DT, SCREENS, frame, pose, project, world, sweep } from './cutWorld';

describe('the camera facing the cut (spec 7)', () => {
  it('Wide frames from just above the surface down into B; on a wide screen, the whole slab and its names', () => {
    const s = createSlab(0, 0, 0.4, 1, 2);
    const a = 1366 / 768;
    frameTarget('wide', s, 0, -2, 1, 0, a, frame);
    cutPose(s, frame.cu, frame.cv, frame.h, frame.pitch, pose);
    expect(project(pose, a, ...world(s, 0, s.topMax + 0.3)).ny).toBeLessThan(1);
    expect(project(pose, a, ...world(s, 0, boundaryAt(s, B_H, 0) - 1.5)).ny).toBeGreaterThan(-1);
    const wide = 1600 / 500;
    frameTarget('wide', s, 0, -2, 1, 0, wide, frame);
    cutPose(s, frame.cu, frame.cv, frame.h, frame.pitch, pose);
    for (const u of [s.playLo - LABEL_ROOM + 0.1, s.playHi + LABEL_ROOM - 0.1]) {
      expect(Math.abs(project(pose, wide, ...world(s, u, s.topMax)).nx)).toBeLessThanOrEqual(1);
    }
  });

  it('Wide holds still while the worm digs near the middle, and follows it toward an end', () => {
    let moved = 0;
    // Down and round in the middle of the screen: still.
    sweep('wide', 1366, 768, 4, (p, q) => { moved += Math.abs(p.px - q.px) + Math.abs(p.pz - q.pz); }, (k) => (k < 200 ? [0, -1] : [Math.cos(k / 40), Math.sin(k / 40)]));
    expect(moved).toBeLessThan(0.5);
    moved = 0;
    // Down, then across the slab: the phone's narrower view follows.
    sweep('wide', 360, 640, 4, (p, q) => { moved += Math.abs(p.px - q.px) + Math.abs(p.pz - q.pz); }, (k) => (k < 60 ? [0, -1] : [1, 0]));
    expect(moved).toBeGreaterThan(2);
  });

  for (const view of ['wide', 'close'] as const) {
    for (const [w, h] of SCREENS) {
      it(`${view} at ${w}x${h}: the worm stays on screen, the near plane never cuts it, no shake (seed sweep)`, () => {
        const worst = { step: 0, jerk: 0, flips: 0 };
        for (let seed = 1; seed <= 8; seed++) {
          let lastV = 0;
          let flips = 0;
          let lastSign = 0;
          sweep(view, w, h, seed, (p, q, s, hu, hv) => {
            const head = project(p, w / h, ...world(s, hu, hv));
            expect(Math.abs(head.nx)).toBeLessThan(0.95);
            expect(Math.abs(head.ny)).toBeLessThan(0.95);
            expect(head.d - 0.2).toBeGreaterThan(p.near);
            const step = Math.hypot(p.px - q.px, p.py - q.py, p.pz - q.pz);
            expect(step).toBeLessThan(0.08);
            // Smooth: the camera's speed changes only a little from frame to frame.
            expect(Math.abs(step - lastV)).toBeLessThan(0.003);
            worst.jerk = Math.max(worst.jerk, Math.abs(step - lastV));
            worst.step = Math.max(worst.step, step);
            lastV = step;
            // No back-and-forth: the sideways motion seldom reverses.
            const sx = Math.sign(Math.round((p.px - q.px) * 1e5));
            if (sx !== 0 && lastSign !== 0 && sx !== lastSign) flips++;
            if (sx !== 0) lastSign = sx;
          });
          expect(flips).toBeLessThan(30);
          worst.flips = Math.max(worst.flips, flips);
        }
        console.log(`${view} ${w}x${h}: worst step ${worst.step.toFixed(4)}, jerk ${worst.jerk.toFixed(4)}, flips ${worst.flips}`);
      });
    }
  }

  it('switching view eases the zoom with no overshoot', () => {
    const s = createSlab(0, 0, 0, 1, 2);
    const cam = createCutCam();
    snapCutCam(cam, frameTarget('wide', s, 0, -2, 1, 0, 1366 / 768, frame), 0, 'wide');
    const from = cam.h.value;
    frameTarget('close', s, 0, -2, 1, 0, 1366 / 768, frame);
    let last = from;
    let lastStep = 0;
    for (let k = 0; k < 180; k++) {
      stepCutCam(cam, frame, 'close', DT);
      expect(cam.h.value).toBeLessThanOrEqual(last + 1e-9);
      expect(cam.h.value).toBeGreaterThanOrEqual(frame.h - 1e-9);
      expect(Math.abs((last - cam.h.value) - lastStep)).toBeLessThan(0.02);
      lastStep = last - cam.h.value;
      last = cam.h.value;
    }
    expect(cam.h.value).toBeCloseTo(frame.h, 1);
  });

  it('the near plane stands just in front of the cut: the forest in front is cut away, the cut is not', () => {
    const s = createSlab(0, 0, 0, 1, 2);
    for (const view of ['wide', 'close'] as const) {
      frameTarget(view, s, 0, -2, 0, -1, 1.5, frame);
      cutPose(s, frame.cu, frame.cv, frame.h, frame.pitch, pose);
      // The cut's top just in front of the plane is beyond the near plane...
      const top = project(pose, 1.5, s.ox + s.nx * 0.2, s.topMax, s.oz + s.nz * 0.2);
      expect(top.d).toBeGreaterThan(pose.near);
      // ...while anything a body length in front of the cut is nearer than it (not drawn).
      for (const y of [s.topMax, s.topMax + 1, s.topMax + 4]) {
        const front = project(pose, 1.5, s.ox + s.nx * 1.5, y, s.oz + s.nz * 1.5);
        expect(front.d).toBeLessThan(pose.near);
      }
    }
  });
});
