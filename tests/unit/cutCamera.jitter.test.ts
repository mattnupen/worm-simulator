import { describe, it, expect } from 'vitest';
import { FACE_PAST, SWITCH_S, type CutPose } from '../../src/underground/cutCamera';
import { settle, smootherstep } from '../../src/underground/easing';
import type { UndergroundView } from '../../src/underground/modeMachine';
import { SCREENS, project, screenOnCut, world, sweep, turnBetween, type ViewAt } from './cutWorld';

// Matt notices camera jitter. These watch the cut camera frame to frame while the real burrower
// digs: its position (step, change of step, and the third difference: a jolt shows there), its
// rotation, the worm on screen and in front of the near plane.

interface Watch { step: number; d3: number; turn: number; turnD: number; rest: number; lurch: number; reversals: number; past: number }

/** Sweeps and checks every frame; returns the worst values seen. */
function watchSweep(view: ViewAt, w: number, h: number, seed: number, steer?: (k: number) => [number, number], seconds = 25): Watch {
  const m: Watch = { step: 0, d3: 0, turn: 0, turnD: 0, rest: 0, lurch: 0, reversals: 0, past: 0 };
  const hist: number[] = [];
  let lastTurn = 0;
  let lastStep = 0;
  let still = 0;
  const side = [0, 0, 0];
  sweep(view, w, h, seed, (p: CutPose, q: CutPose, s, hu, hv, b, cam) => {
    const head = project(p, w / h, ...world(s, hu, hv));
    expect(Math.abs(head.nx)).toBeLessThan(0.95);
    expect(Math.abs(head.ny)).toBeLessThan(0.95);
    // The whole body is well in front of the camera (the cut-away keeps the cut: cutClip.test.ts).
    for (let i = 0; i < b.u.length; i++) expect(project(p, w / h, ...world(s, b.u[i], b.v[i])).d).toBeGreaterThan(1);
    // How far the screen's corners show past the face's ends.
    for (const x of [-1, 1]) {
      for (const y of [-1, 1]) {
        const c = screenOnCut(p, s, w / h, x, y);
        m.past = Math.max(m.past, c.u - s.faceHi, s.faceLo - c.u);
      }
    }
    const step = Math.hypot(p.px - q.px, p.py - q.py, p.pz - q.pz);
    m.step = Math.max(m.step, step);
    hist.push(p.px, p.py, p.pz);
    if (hist.length > 12) hist.splice(0, 3);
    if (hist.length === 12) {
      let s2 = 0;
      for (let j = 0; j < 3; j++) { const d = hist[9 + j] - 3 * hist[6 + j] + 3 * hist[3 + j] - hist[j]; s2 += d * d; }
      m.d3 = Math.max(m.d3, Math.sqrt(s2));
    }
    const turn = turnBetween(p, q);
    m.turn = Math.max(m.turn, turn);
    m.turnD = Math.max(m.turnD, Math.abs(turn - lastTurn));
    lastTurn = turn;
    // Once the head has (all but) stopped, under a tenth of a pixel a frame in Close (it may still
    // creep along a stone it is pushed into), the camera only settles: it never speeds up (beyond
    // following that creep), and once the head has quite stopped it never comes back. (Close
    // keeps room ahead of the head: when a turn ends against a stone, that room still swings
    // round, eased. That is no stop to watch.)
    const headStep = Math.hypot(b.u[0] - b.prevU[0], b.v[0] - b.prevV[0]);
    const facing = Math.abs(cam.au.value - Math.cos(b.dir)) + Math.abs(cam.av.value - Math.sin(b.dir));
    still = headStep < 1e-3 && facing < 0.01 ? still + 1 : 0;
    if (still > 2) {
      m.rest++;
      // In pixels a frame per frame: the screen's height spans the frame's height.
      m.lurch = Math.max(m.lurch, ((step - lastStep) * h) / cam.h.value);
      const dx = p.px - q.px; const dy = p.py - q.py; const dz = p.pz - q.pz;
      if (headStep < 1e-5 && step > 1e-6 && lastStep > 1e-6 && dx * side[0] + dy * side[1] + dz * side[2] < 0) m.reversals++;
      side[0] = dx; side[1] = dy; side[2] = dz;
    } else side.fill(0);
    lastStep = step;
  }, steer, seconds);
  return m;
}

describe('the cut camera frame to frame (Matt notices jitter)', () => {
  for (const [w, h] of SCREENS) {
    it(`in one view it never turns, and moves without a jolt, at ${w}x${h} (seed sweep)`, () => {
      for (const view of ['wide', 'close'] as const) {
        for (let seed = 1; seed <= 6; seed++) {
          const m = watchSweep(view, w, h, seed);
          expect(m.turn).toBeLessThan(1e-7);
          expect(m.step).toBeLessThan(0.08);
          expect(m.d3).toBeLessThan(5e-4);
          expect(m.past).toBeLessThan(1e-6);
        }
      }
    });

    it(`switching view mid-dig hands over smoothly at ${w}x${h}, even switching back mid-switch (seed sweep)`, () => {
      const worst = { step: 0, d3: 0, turn: 0, turnD: 0, past: 0 };
      // Every 2.5 s; and mashed: every 0.6 s, back before the last switch has finished.
      for (const every of [150, 37]) {
        const viewAt = (k: number): UndergroundView => (Math.floor(k / every) % 2 ? 'close' : 'wide');
        for (let seed = 1; seed <= 6; seed++) {
          const m = watchSweep(viewAt, w, h, seed);
          worst.step = Math.max(worst.step, m.step);
          worst.d3 = Math.max(worst.d3, m.d3);
          worst.turn = Math.max(worst.turn, m.turn);
          worst.turnD = Math.max(worst.turnD, m.turnD);
          worst.past = Math.max(worst.past, m.past);
          // Switched every 2.5 s, the frame never shows past the face; mashed, a little (FACE_PAST).
          if (every > 60) expect(m.past).toBeLessThan(1e-6);
        }
      }
      // A spring set off at full pull from a standing start jolted: third difference up to 0.016.
      expect(worst.d3).toBeLessThan(0.003);
      expect(worst.step).toBeLessThan(0.25);
      // The pitch eases between the views' (0.2 and 0.12 rad): a slow, even turn.
      expect(worst.turn).toBeLessThan(0.004);
      expect(worst.turnD).toBeLessThan(5e-4);
      expect(worst.past).toBeLessThan(FACE_PAST);
      console.log(`switching ${w}x${h}: worst step ${worst.step.toFixed(4)}, third difference ${worst.d3.toFixed(5)}, turn ${worst.turn.toFixed(5)}, past the face ${worst.past.toFixed(3)}`);
    });

    it(`the worm easing to a stop at the slab's ends, bottom and top: the camera settles, no lurch, at ${w}x${h}`, () => {
      const legs: Array<[string, (k: number) => [number, number], number]> = [
        ['+u end', (k) => (k < 120 ? [0, -1] : [1, 0]), 30],
        ['-u end', (k) => (k < 120 ? [0, -1] : [-1, 0]), 30],
        ['bottom', () => [0, -1], 40],
        ['top', (k) => (k < 60 ? [0, -1] : k < 240 ? [1, 0] : [0, 1]), 20],
      ];
      for (const view of ['wide', 'close'] as const) {
        for (const [name, steer, seconds] of legs) {
          let stopped = 0;
          let worst = 0;
          for (let seed = 1; seed <= 4; seed++) {
            const m = watchSweep(view, w, h, seed, steer, seconds);
            // It came to rest (a stone may stop it first: still a stop; or it slides along one).
            if (m.rest > 60) stopped++;
            worst = Math.max(worst, m.lurch);
            // A hundredth of a pixel per frame per frame: following a creep, never a lurch.
            expect(m.lurch, `${view} ${name} seed ${seed}`).toBeLessThan(0.01);
            expect(m.reversals, `${view} ${name} seed ${seed}`).toBe(0);
            expect(m.d3).toBeLessThan(5e-4);
            expect(m.past).toBeLessThan(1e-6);
          }
          expect(stopped, `${view} ${name}`).toBeGreaterThanOrEqual(3);
        }
      }
    });
  }

  it('after any switch history, Wide settles exactly where it would never having left (seed sweep)', () => {
    for (const [w, h] of SCREENS) {
      for (let seed = 1; seed <= 6; seed++) {
        // Shallow along the cut, then down and back up: Close and back, several times, ending in Wide.
        const steer = (k: number): [number, number] => (k < 300 ? [1, -0.1] : k < 600 ? [0, -1] : k < 900 ? [-1, 0.2] : [0.3, 1]);
        const schedule = (k: number): UndergroundView => (k < 1200 && Math.floor(k / 110) % 2 ? 'close' : 'wide');
        const end: number[][] = [];
        for (const view of [schedule, 'wide' as const]) {
          let last: number[] = [];
          sweep(view, w, h, seed, (_p, _q, _s, _hu, _hv, _b, cam) => {
            last = [cam.cu.value, cam.cv.value, cam.h.value, cam.pitch.value];
          }, steer, 26);
          end.push(last);
        }
        for (let i = 0; i < 4; i++) expect(Math.abs(end[0][i] - end[1][i]), `${w}x${h} seed ${seed}`).toBeLessThan(1e-3);
      }
    }
  });
});

describe("the switch's hand-over curve", () => {
  it('starts at the value, slope and curvature given and comes to rest at 0 with none', () => {
    const [p, v, a] = [2, -3, 5];
    const e = 1e-5;
    expect(settle(p, v, a, 0, 0)).toBeCloseTo(p, 9);
    expect(settle(p, v, a, 0, 1)).toBeCloseTo(v, 9);
    expect(settle(p, v, a, 0, 2)).toBeCloseTo(a, 9);
    for (const d of [0, 1, 2] as const) expect(Math.abs(settle(p, v, a, 1 - 1e-9, d))).toBeLessThan(1e-6);
    expect(settle(p, v, a, 1.2, 0)).toBe(0);
    // Its slope and curvature are its derivatives...
    for (const s of [0.1, 0.4, 0.8]) {
      expect((settle(p, v, a, s + e, 0) - settle(p, v, a, s - e, 0)) / (2 * e)).toBeCloseTo(settle(p, v, a, s, 1), 4);
      expect((settle(p, v, a, s + e, 1) - settle(p, v, a, s - e, 1)) / (2 * e)).toBeCloseTo(settle(p, v, a, s, 2), 4);
      // ...and from rest it is smootherstep's ease.
      expect(settle(p, 0, 0, s, 0)).toBeCloseTo(p * (1 - smootherstep(s)), 9);
    }
    expect(SWITCH_S).toBeGreaterThan(0.5);
  });
});
