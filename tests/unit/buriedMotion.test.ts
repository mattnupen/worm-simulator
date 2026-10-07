import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Crawl, WORM_SEGMENTS } from '../../src/game/crawl';
import { advance, createStepper } from '../../src/core/stepper';
import { mulberry32 } from '../../src/core/random';
import { PILES } from '../../src/surface/litterDepth';
import { rocks, heroLog } from '../../src/surface/propPlacement';
import type { WormPose } from '../../src/worm/wormMesh';

/**
 * The worm buried in deep, uneven litter (V2 spec 8.2) must move as smoothly as V1's: Matt is very
 * sensitive to jitter. Each seed drives a different course over the windblown piles, along the
 * fallen log's drift and round the rocks' banks (where the litter's top climbs and falls most),
 * on a 60 Hz display with uneven frames (about one in seven late) and the 30 fps cap, and measures
 * every rendered frame, as interpolated between steps (handoff lessons).
 *
 * cameraMotion.test.ts checks the camera's height (accel, jerk, nods) and its turn step by step, at
 * alpha 1. This checks what shows on the drawn, interpolated frames and on the worm itself: the
 * camera's whole motion, its turn and its height bobbing across uneven frames, the worm's height,
 * and its body turning back.
 */
/** One seed's course: per drawn frame and per step, how far the head went and how many targets it reached. */
interface Track { cam: number[][]; dir: number[][]; head: number[]; steps: number[]; body: Float32Array[]; path: number; reached: number }

function drive(seed: number, seconds: number): Track {
  const rng = mulberry32(seed);
  const log = heroLog();
  const spots = [
    ...PILES.map((p) => [p.x, p.z]),
    ...rocks().map((k) => [k.x + k.size * 1.4, k.z + k.size * 1.4]),
    [log.x - 6, log.z - log.radius * 1.4], [log.x + 6, log.z - log.radius * 1.4],
  ];
  const crawl = new Crawl();
  crawl.setHeroCount(8);
  const st = createStepper();
  const camera = new THREE.PerspectiveCamera(60, 1366 / 768, 0.2, 120);
  const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
  const t: Track = { cam: [], dir: [], head: [], steps: [], body: [], path: 0, reached: 0 };
  const v = new THREE.Vector3();
  let target = spots[Math.floor(rng() * spots.length)];
  let wall = 0;
  const move = { x: 0, y: 1 };
  while (wall < seconds * 1000) {
    const dt = (1000 / 60) * (rng() < 0.15 ? 2 : 1) + (rng() - 0.5) * 3;
    wall += dt;
    const r = advance(st, dt, 1000 / 60, 1000 / 30);
    for (let i = 0; i < r.steps; i++) {
      const h = crawl.motion.head;
      if (Math.hypot(target[0] - h.x, target[1] - h.z) < 1) {
        target = spots[Math.floor(rng() * spots.length)];
        t.reached++;
      }
      const err = Math.atan2(target[0] - h.x, target[1] - h.z) - crawl.motion.heading;
      const e = err - 2 * Math.PI * Math.round(err / (2 * Math.PI));
      move.x = Math.max(-1, Math.min(1, -e * 2));
      crawl.step(1 / 60, move);
      t.path += Math.hypot(crawl.motion.head.x - h.x, crawl.motion.head.z - h.z);
      t.steps.push(h.y);
    }
    if (!r.render || wall < 1500) continue;
    crawl.interpolate(r.alpha, wall / 1000, pose, camera);
    camera.updateMatrixWorld();
    t.cam.push(camera.position.toArray());
    t.dir.push(camera.getWorldDirection(v).toArray());
    t.head.push(pose.spine[1]);
    t.body.push(Float32Array.from(pose.spine));
  }
  return t;
}

const SEEDS = [1, 2, 3, 4, 5, 6];
/**
 * Body point coordinates turning back by over a millimetre between frames, per seed: V1 7 to 232
 * (its height bounced on the drawn grid), V2 5 to 26 (only in the tightest turns).
 */
const BODY_BACK_MAX = 40;
const tracks = SEEDS.map((s) => drive(s, 40));

/** Every per-frame and per-step measure, for one seed's course. */
function measure(t: Track) {
  let camJerk = 0;
  let rot = 0;
  let rotJerk = 0;
  let camYBack = 0;
  let headJerk = 0;
  let stepJerk = 0;
  let bodyBack = 0;
  for (let k = 2; k < t.cam.length; k++) {
    const [a, b, c] = [t.cam[k - 2], t.cam[k - 1], t.cam[k]];
    camJerk = Math.max(camJerk, Math.hypot(c[0] - 2 * b[0] + a[0], c[1] - 2 * b[1] + a[1], c[2] - 2 * b[2] + a[2]));
    // The camera bobbing: its height turning back by more than a millimetre between frames.
    const [y1, y2] = [b[1] - a[1], c[1] - b[1]];
    if (y1 * y2 < 0 && Math.min(Math.abs(y1), Math.abs(y2)) > 0.001) camYBack++;
    const [da, db, dc] = [t.dir[k - 2], t.dir[k - 1], t.dir[k]];
    const r1 = Math.acos(Math.min(1, da[0] * db[0] + da[1] * db[1] + da[2] * db[2]));
    const r2 = Math.acos(Math.min(1, db[0] * dc[0] + db[1] * dc[1] + db[2] * dc[2]));
    rot = Math.max(rot, r2);
    rotJerk = Math.max(rotJerk, Math.abs(r2 - r1));
    headJerk = Math.max(headJerk, Math.abs(t.head[k] - 2 * t.head[k - 1] + t.head[k - 2]));
    // Any body point stepping back (along x, z or y) by more than a millimetre between frames.
    for (let i = 0; i < WORM_SEGMENTS * 3; i++) {
      const d1 = t.body[k - 1][i] - t.body[k - 2][i];
      const d2 = t.body[k][i] - t.body[k - 1][i];
      if (d1 * d2 < 0 && Math.min(Math.abs(d1), Math.abs(d2)) > 0.001) bodyBack++;
    }
  }
  for (let k = 2; k < t.steps.length; k++) stepJerk = Math.max(stepJerk, Math.abs(t.steps[k] - 2 * t.steps[k - 1] + t.steps[k - 2]));
  return { frames: t.cam.length, path: t.path, reached: t.reached, camJerk, rot, rotJerk, camYBack, headJerk, stepJerk, bodyBack };
}

const results = tracks.map(measure);

describe('the buried worm and its camera move smoothly over deep, uneven litter (frame to frame, seeds 1 to 6)', () => {
  // Each course really crawls: 1 to 6 targets reached (18 in all) and 23 to 64 units, of the 64
  // a free run covers in 40 s. Seeds 2 and 3 slide along the maple's root flare after their first
  // target and end wedged where it meets the play edge (still measured: a pressed worm must not
  // shake).
  it('every course crawls to its targets', () => {
    for (const [i, r] of results.entries()) {
      expect(r.reached, `seed ${SEEDS[i]}`).toBeGreaterThanOrEqual(1);
      expect(r.path, `seed ${SEEDS[i]}`).toBeGreaterThan(20);
    }
    expect(results.reduce((n, r) => n + r.reached, 0)).toBeGreaterThanOrEqual(15);
  });

  // V1 (the worm on the soil under thin litter, riding piles), the same courses and frames:
  // camera jerk up to 0.099 a frame, turn 0.113 rad a frame, turn jerk 0.045, camera height
  // turning back 0 to 4 times a seed, head height jerk 0.030 (0.0099 a step), body turning back
  // 7 to 232 times. V2 measured 0.099, 0.105, 0.043, 0 to 3, 0.0035 (0.0016), 5 to 26.
  it('the camera, as drawn on uneven frames: no snap, no shake, no spin, no bob (as V1 or better)', () => {
    for (const [i, r] of results.entries()) {
      expect(r.frames, `seed ${SEEDS[i]}`).toBeGreaterThan(1000);
      expect(r.camJerk, `seed ${SEEDS[i]}`).toBeLessThan(0.11);
      expect(r.rot, `seed ${SEEDS[i]}`).toBeLessThan(0.12);
      expect(r.rotJerk, `seed ${SEEDS[i]}`).toBeLessThan(0.05);
      expect(r.camYBack, `seed ${SEEDS[i]}`).toBeLessThanOrEqual(6);
    }
  });

  it('the worm rides the smooth floor: its height never kinks (smoother than V1\'s worm on the drawn grid)', () => {
    for (const [i, r] of results.entries()) {
      expect(r.headJerk, `seed ${SEEDS[i]}`).toBeLessThan(0.005);
      expect(r.stepJerk, `seed ${SEEDS[i]}`).toBeLessThan(0.002);
    }
  });

  it('the body never steps back between frames', () => {
    for (const [i, r] of results.entries()) expect(r.bodyBack, `seed ${SEEDS[i]}`).toBeLessThanOrEqual(BODY_BACK_MAX);
  });
});
