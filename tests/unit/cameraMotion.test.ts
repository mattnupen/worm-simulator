import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Crawl, WORM_SEGMENTS } from '../../src/game/crawl';
import type { WormPose } from '../../src/worm/wormMesh';
import { rocks } from '../../src/surface/propPlacement';
import { ROCK_FOOT } from '../../src/surface/obstacles';
import { mulberry32 } from '../../src/core/random';
import { DT, driveTo } from './cameraPress';

/**
 * The camera's height and turn, step by step, must be smooth (Matt is very sensitive to jitter):
 * no nod where the litter's depth changes shape, as it did at every rock (a crest, then a dip).
 */
const MAX_ACCEL = 2.5e-3;
const MAX_JERK = 2.5e-3;
/**
 * A nod: within NOD_STEPS (half a second) the camera rises and falls back, or falls and rises back,
 * by more than NOD (about 4 mm). A rock's crest-and-dip made 0.11 to 0.13; crawling the honest ups
 * and downs of the litter at full speed makes up to 0.088 on a waypoint drive (V1's camera: up to
 * 0.08), so 0.1 leaves that a margin and still catches a rock's bump. A plain velocity reversal is
 * no test: crossing any hollow at full speed reverses a velocity of 5e-3 a step.
 */
const NOD = 0.1;
const NOD_STEPS = 30;
const MAX_TURN = 0.045;
/**
 * 0.016, not 0.015: stopping dead mid-turn with the camera pulled in near a rock turns the view
 * 0.0151 rad a step more at once (seed 5). V1's camera does exactly the same there: the litter
 * plays no part in it.
 */
const MAX_TURN_CHANGE = 0.016;

interface Motion { accel: number; jerk: number; nod: number; turn: number; turnChange: number }

/** Watches a crawl's camera: second and third differences of its height, nods, and its turn per step. */
function motionWatcher(c: Crawl) {
  const camera = new THREE.PerspectiveCamera(60, 1366 / 768, 0.2, 120);
  const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
  const last = new THREE.Quaternion();
  const ys: number[] = [];
  const m: Motion = { accel: 0, jerk: 0, nod: 0, turn: 0, turnChange: 0 };
  let lastTurn = NaN;
  const see = (cc: Crawl) => {
    cc.interpolate(1, 0, pose, camera);
    if (ys.length > 0) {
      const turn = camera.quaternion.angleTo(last);
      m.turn = Math.max(m.turn, turn);
      if (!Number.isNaN(lastTurn)) m.turnChange = Math.max(m.turnChange, Math.abs(turn - lastTurn));
      lastTurn = turn;
    }
    last.copy(camera.quaternion);
    ys.push(cc.cam.pos.y);
  };
  see(c);
  const done = (): Motion => {
    const v: number[] = [];
    for (let i = 1; i < ys.length; i++) v.push(ys[i] - ys[i - 1]);
    let lastA = NaN;
    for (let i = 1; i < v.length; i++) {
      const a = v[i] - v[i - 1];
      m.accel = Math.max(m.accel, Math.abs(a));
      if (!Number.isNaN(lastA)) m.jerk = Math.max(m.jerk, Math.abs(a - lastA));
      lastA = a;
    }
    // The highest peak (or lowest trough) inside each window, over both of its ends.
    for (let i = 0; i + NOD_STEPS < ys.length; i++) {
      let hi = -Infinity;
      let lo = Infinity;
      for (let k = i + 1; k < i + NOD_STEPS; k++) {
        hi = Math.max(hi, ys[k]);
        lo = Math.min(lo, ys[k]);
      }
      const a = ys[i];
      const b = ys[i + NOD_STEPS];
      m.nod = Math.max(m.nod, Math.min(hi - a, hi - b), Math.min(a - lo, b - lo));
    }
    return m;
  };
  return { see, done };
}

const expectSmooth = (m: Motion, label: string) => {
  expect(m.accel, `${label}: camera height, second difference`).toBeLessThanOrEqual(MAX_ACCEL);
  expect(m.jerk, `${label}: camera height, third difference`).toBeLessThanOrEqual(MAX_JERK);
  expect(m.nod, `${label}: vertical nod`).toBeLessThanOrEqual(NOD);
  expect(m.turn, `${label}: turn per step`).toBeLessThanOrEqual(MAX_TURN);
  expect(m.turnChange, `${label}: change in turn per step`).toBeLessThanOrEqual(MAX_TURN_CHANGE);
};

describe('the follow camera moves smoothly over the litter', () => {
  it('on 8 seeded random drives, its height never nods and its turn never jerks', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const rng = mulberry32(seed);
      const c = new Crawl();
      const w = motionWatcher(c);
      const move = { x: 0, y: 1 };
      let hold = 0;
      for (let s = 0; s < 4000; s++) {
        if (hold-- <= 0) {
          move.x = rng() * 2 - 1;
          move.y = rng() < 0.85 ? 1 : 0;
          hold = 60 + Math.floor(rng() * 120);
        }
        c.step(DT, move);
        w.see(c);
      }
      expectSmooth(w.done(), `seed ${seed}`);
    }
  }, 60_000);

  it('pressing into every rock and sliding round it, its height never nods', () => {
    rocks().forEach((k, i) => {
      const c = new Crawl();
      const w = motionWatcher(c);
      let nearest = Infinity;
      const near = (cc: Crawl) => {
        w.see(cc);
        nearest = Math.min(nearest, Math.hypot(cc.motion.head.x - k.x, cc.motion.head.z - k.z) - k.size * ROCK_FOOT);
      };
      driveTo(c, k.x, k.z, 1400, near);
      // Round it: steer for points just inside its footprint, a quarter turn at a time.
      const a0 = Math.atan2(c.motion.head.z - k.z, c.motion.head.x - k.x);
      for (let q = 1; q <= 6; q++) {
        const a = a0 + (q * Math.PI) / 2;
        const r = k.size * ROCK_FOOT * 0.9;
        driveTo(c, k.x + Math.cos(a) * r, k.z + Math.sin(a) * r, 150, near);
      }
      // The case is real: the worm reached the rock and pressed against it.
      expect(nearest, `rock ${i}`).toBeLessThan(0.3);
      expectSmooth(w.done(), `rock ${i}`);
    });
  }, 60_000);
});
