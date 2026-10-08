import { describe, it, expect } from 'vitest';
import {
  createCutCam, frameTarget, snapCutCam, stepCutCam, cutPose,
} from '../../src/underground/cutCamera';
import { createSlab, boundaryAt, B_H, B_B } from '../../src/underground/slab';
import { DT, SCREENS, frame, pose, project, screenOnCut, world, sweep } from './cutWorld';

describe('the camera facing the cut (spec 7)', () => {
  it('Wide frames from just above the surface down into B; a wider screen shows no more width than 16:9', () => {
    const s = createSlab(0, 0, 0.4, 1, 2);
    const a = 1366 / 768;
    frameTarget('wide', s, 0, -2, 1, 0, a, frame);
    cutPose(s, frame.cu, frame.cv, frame.h, frame.pitch, pose);
    expect(project(pose, a, ...world(s, 0, s.topMax + 0.3)).ny).toBeLessThan(1);
    expect(project(pose, a, ...world(s, 0, boundaryAt(s, B_H, 0) - 1.5)).ny).toBeGreaterThan(-1);
    // A wider screen (a maximised browser, a wide monitor) shows no more along the cut than
    // 16:9 (the face's ends are reckoned for it): the same width, a little less height.
    const width = (aspect: number, row: number) => {
      frameTarget('wide', s, 0, -2, 1, 0, aspect, frame);
      cutPose(s, frame.cu, frame.cv, frame.h, frame.pitch, pose);
      return Math.abs(screenOnCut(pose, s, aspect, 1, row).u - screenOnCut(pose, s, aspect, -1, row).u);
    };
    for (const aspect of [1366 / 600, 1600 / 500]) {
      for (const row of [-1, 1]) expect(width(aspect, row)).toBeCloseTo(width(a, row), 6);
      expect(frameTarget('wide', s, 0, -2, 1, 0, aspect, frame).h).toBeCloseTo((8.5 * 16) / 9 / aspect, 9);
      expect(frameTarget('close', s, 0, -2, 1, 0, aspect, frame).h).toBeCloseTo((6 * 16) / 9 / aspect, 9);
    }
  });

  it('on a portrait screen Wide holds the surface about a fifth of the way down (clear of Pause), still into B', () => {
    const s = createSlab(0, 0, 0.4, 1, 2);
    const hv = boundaryAt(s, B_H, 0);
    // How far down the screen (0 top, 1 bottom) the highest litter top shows, the head just under the surface.
    const topAt = (aspect: number) => {
      frameTarget('wide', s, 0, hv, 1, 0, aspect, frame);
      cutPose(s, frame.cu, frame.cv, frame.h, frame.pitch, pose);
      let best = -Infinity;
      for (let u = s.playLo; u <= s.playHi; u += 0.1) best = Math.max(best, project(pose, aspect, ...world(s, u, s.topMax)).ny);
      return (1 - best) / 2;
    };
    for (const aspect of [360 / 640, 390 / 844, 320 / 568, 3 / 4]) {
      expect(topAt(aspect)).toBeGreaterThanOrEqual(0.18);
      expect(topAt(aspect)).toBeLessThanOrEqual(0.22);
      // The frame still reaches 1.5 u into B.
      frameTarget('wide', s, 0, hv, 1, 0, aspect, frame);
      cutPose(s, frame.cu, frame.cv, frame.h, frame.pitch, pose);
      expect(project(pose, aspect, ...world(s, 0, boundaryAt(s, B_B, 0) - 1.5)).ny).toBeGreaterThan(-1);
    }
    // Landscape frames are as before: the surface about a seventh of the way down on 16:9.
    expect(topAt(16 / 9)).toBeLessThan(0.16);
    expect(topAt(1)).toBeCloseTo(topAt(16 / 9), 6);
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
            expect(head.d).toBeGreaterThan(1);
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
});
