import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import { Crawl, WORM_SEGMENTS } from '../../src/game/crawl';
import { CAM_OPTS } from '../../src/game/cameraClearance';
import type { WormPose } from '../../src/worm/wormMesh';
import { footprints, insideTall, pushOutTall } from '../../src/surface/obstacles';
import { rocks } from '../../src/surface/propPlacement';
import { terrainHeight } from '../../src/surface/terrain';
import { treeSites, trunkFootOf } from '../../src/surface/treeSites';
import { DEFAULT_SCALE, SCALE_MODES, setScale } from '../../src/surface/worldScale';

const DT = 1 / 60;
const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

/** Steers toward (tx, tz) for `steps` steps; `each` sees the crawl after every step. */
function driveTo(c: Crawl, tx: number, tz: number, steps: number, each: (c: Crawl) => void): void {
  const move = { x: 0, y: 1 };
  for (let s = 0; s < steps; s++) {
    const h = c.motion.head;
    const err = wrap(Math.atan2(tx - h.x, tz - h.z) - c.motion.heading);
    move.x = Math.max(-1, Math.min(1, -err * 3));
    c.step(DT, move);
    each(c);
  }
}

/** Watches the camera step by step: the largest change in its step (a snap or shake shows here). */
function watcher(c: Crawl) {
  const last = { ...c.cam.pos };
  const step = { x: 0, y: 0, z: 0 };
  const w = {
    jerk: 0,
    inside: 0,
    see(cc: Crawl) {
      const p = cc.cam.pos;
      const sx = p.x - last.x;
      const sy = p.y - last.y;
      const sz = p.z - last.z;
      w.jerk = Math.max(w.jerk, Math.hypot(sx - step.x, sy - step.y, sz - step.z));
      if (insideTall(p.x, p.z, p.y)) w.inside++;
      step.x = sx;
      step.y = sy;
      step.z = sz;
      last.x = p.x;
      last.y = p.y;
      last.z = p.z;
    },
  };
  return w;
}

afterAll(() => { setScale(DEFAULT_SCALE); });

describe.each(SCALE_MODES)('%s: the camera never snaps or shakes against a prop', (mode) => {
  beforeAll(() => { setScale(mode); });

  it('pressing into every prop (straight or off-centre) and then turning on the spot', () => {
    const { round, log } = footprints();
    const targets = [];
    for (let o = 0; o < round.length; o += 4) targets.push({ x: round[o], z: round[o + 1] });
    targets.push({ x: log.x + log.dx * log.half * 0.3, z: log.z + log.dz * log.half * 0.3 });
    let jerk = 0;
    let inside = 0;
    for (const t of targets) {
      for (const off of [0, -0.6, -0.3, 0.3, 0.6]) {
        for (const turn of [1, -1]) {
          const c = new Crawl();
          const w = watcher(c);
          driveTo(c, t.x + off, t.z - off, 700, w.see);
          // Only left or right held: the worm turns where it is, against the prop.
          const move = { x: turn, y: 0 };
          for (let s = 0; s < 300; s++) {
            c.step(DT, move);
            w.see(c);
          }
          jerk = Math.max(jerk, w.jerk);
          inside += w.inside;
        }
      }
    }
    // A hard turn alone changes the camera's step by about 0.004; easing in past a trunk, a few
    // hundredths. Snapping along its line to the head reached 1.9 here.
    expect(jerk).toBeLessThan(0.06);
    expect(inside).toBe(0);
  }, 180_000);
});

describe('classic: sliding round trunk 4 at a slant', () => {
  beforeAll(() => { setScale('classic'); });

  it('the camera\'s distance from the head never flickers from step to step', () => {
    // Its line to the head grazed the trunk, blocked one step and clear the next: snapping along
    // that line made the distance alternate (0.19, 0.37, 0.19...).
    const { round } = footprints();
    const c = new Crawl();
    const dist: number[] = [];
    const see = (cc: Crawl) => {
      const h = cc.motion.head;
      const p = cc.cam.pos;
      dist.push(Math.hypot(p.x - h.x, p.z - h.z));
    };
    driveTo(c, round[16] + 0.3, round[17] - 0.3, 700, see);
    const move = { x: 1, y: 0 };
    for (let s = 0; s < 300; s++) {
      c.step(DT, move);
      see(c);
    }
    let flicker = 0;
    for (let i = 2; i < dist.length; i++) {
      const a = dist[i - 1] - dist[i - 2];
      const b = dist[i] - dist[i - 1];
      if (a * b < 0 && Math.min(Math.abs(a), Math.abs(b)) > 0.01) flicker++;
    }
    expect(flicker).toBe(0);
  });
});

describe('pushOutTall', () => {
  beforeAll(() => { setScale('classic'); });

  it('slides a point that has come within the pad of a trunk straight back out to it', () => {
    const t = treeSites()[0];
    const foot = trunkFootOf(t);
    const p = { x: t.x + foot + 0.05, y: 1, z: t.z };
    expect(pushOutTall(p, 0.15)).toBeCloseTo(0.1, 9);
    expect(p.x).toBeCloseTo(t.x + foot + 0.15, 9);
    expect(p.z).toBe(t.z);
    expect(pushOutTall(p, 0.15)).toBe(0);
  });

  it('leaves a point well above a rock alone, and pushes one below its top fully clear', () => {
    const { round } = footprints();
    const k = rocks()[0];
    const o = round.indexOf(k.x);
    const r = round[o + 2];
    const top = terrainHeight(k.x, k.z) + round[o + 3];
    const above = { x: k.x + r * 0.5, y: top + 0.6, z: k.z };
    expect(pushOutTall(above, 0.15)).toBe(0);
    const below = { x: k.x + r * 0.5, y: top - 0.01, z: k.z };
    pushOutTall(below, 0.15);
    expect(below.x).toBeCloseTo(k.x + r + 0.15, 9);
    expect(insideTall(below.x, below.z, below.y)).toBe(false);
  });

  it('eases its push in as a point sinks past a rock\'s top, never jumping', () => {
    const { round } = footprints();
    const k = rocks()[0];
    const o = round.indexOf(k.x);
    const top = terrainHeight(k.x, k.z) + round[o + 3];
    // Halfway in, the full push is half the rock's footprint plus the pad. The footprint it keeps
    // the point out of grows with the sinking (over half a metre above the top), never all at once.
    const full = round[o + 2] * 0.5 + 0.15;
    let last = 0;
    for (let y = top + 0.6; y > top - 0.1; y -= 0.01) {
      const p = { x: k.x + round[o + 2] * 0.5, y, z: k.z };
      const push = pushOutTall(p, 0.15);
      expect(Math.abs(push - last)).toBeLessThanOrEqual((round[o + 2] + 0.15) * (0.01 / 0.5) + 1e-9);
      last = push;
    }
    expect(last).toBeCloseTo(full, 9);
  });
});

describe('classic: a trunk right behind the worm', () => {
  beforeAll(() => { setScale('classic'); });

  it('the camera cranes up and looks down at the worm, its head and front half in frame', () => {
    // Pressed into trunk 12, then turned on the spot until the trunk is right behind the head:
    // no room behind at all (reach 0).
    const { round } = footprints();
    const c = new Crawl();
    driveTo(c, round[48], round[49], 700, () => {});
    for (let s = 0; s < 120; s++) c.step(DT, { x: 1, y: 0 });
    expect(c.cameraReach).toBeLessThan(0.01);
    const h = c.motion.head;
    expect(c.cam.pos.y - h.y).toBeGreaterThanOrEqual(CAM_OPTS.height);
    // What the player sees, on the classroom's 1366 x 768 screen.
    const camera = new THREE.PerspectiveCamera(60, 1366 / 768, 0.2, 120);
    const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
    c.interpolate(1, 0, pose, camera);
    camera.updateMatrixWorld();
    const v = new THREE.Vector3();
    for (let i = 0; i < WORM_SEGMENTS / 2; i++) {
      v.fromArray(pose.spine, i * 3).project(camera);
      expect(Math.abs(v.x)).toBeLessThan(1);
      expect(Math.abs(v.y)).toBeLessThan(1);
      expect(Math.abs(v.z)).toBeLessThan(1);
    }
  });
});
