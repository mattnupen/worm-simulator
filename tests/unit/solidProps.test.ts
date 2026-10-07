import { describe, it, expect } from 'vitest';
import { Crawl, BODY_RADIUS } from '../../src/game/crawl';
import { obstacleDepth, footprints, insideTall, sightReach, ROCK_FOOT } from '../../src/surface/obstacles';
import { treeSites, trunkFootOf } from '../../src/surface/treeSites';
import { rocks } from '../../src/surface/propPlacement';
import { terrainHeight } from '../../src/surface/terrain';
import { stepWorm, type WormMotion } from '../../src/worm/locomotion';
import { AUTO_DRIVE_MOVE, LOCOMOTION } from '../../src/game/drive';

const DT = 1 / 60;
const hit = { nx: 0, nz: 0 };
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

/** Fails if any body point lies inside a footprint grown by the body's radius. */
function outside(c: Crawl): void {
  for (const p of c.body) expect(obstacleDepth(p.x, p.z, BODY_RADIUS, hit)).toBeLessThanOrEqual(1e-9);
}

describe('trunks, rocks and the log are solid', () => {

  it('a worm driven at every one of them stops at its edge and never cuts through', () => {
    const { round, log } = footprints();
    const targets = [];
    for (let o = 0; o < round.length; o += 4) targets.push({ x: round[o], z: round[o + 1] });
    targets.push({ x: log.x, z: log.z }, { x: log.x + log.dx * log.half * 0.6, z: log.z + log.dz * log.half * 0.6 });
    for (const t of targets) {
      const c = new Crawl();
      driveTo(c, t.x, t.z, 900, outside);
    }
  }, 60_000);

  it('slides along an edge instead of stopping dead', () => {
    // Head for a point just past the log's far side, at a slant: the worm meets the log and slides
    // along it, staying on its own side.
    const { log } = footprints();
    const c = new Crawl();
    const tx = log.x - log.dz * (log.r + 3) + log.dx * 2;
    const tz = log.z + log.dx * (log.r + 3) + log.dz * 2;
    /** Where (x, z) lies along the log's axis, and across it (negative: the spawn's side). */
    const along = (x: number, z: number) => (x - log.x) * log.dx + (z - log.z) * log.dz;
    const across = (x: number, z: number) => -(x - log.x) * log.dz + (z - log.z) * log.dx;
    let side = across(c.motion.head.x, c.motion.head.z);
    expect(side).toBeLessThan(0);
    let touching = 0;
    let slid = 0;
    let lastAlong = along(c.motion.head.x, c.motion.head.z);
    driveTo(c, tx, tz, 1500, (cc) => {
      const h = cc.motion.head;
      const t = along(h.x, h.z);
      // The head only gets to the log's far side around one of its ends, never across it.
      const now = across(h.x, h.z);
      if ((now < 0) !== (side < 0)) expect(Math.abs(t)).toBeGreaterThan(log.half);
      side = now;
      const tc = Math.max(-log.half, Math.min(log.half, t));
      const gap = Math.hypot(h.x - (log.x + log.dx * tc), h.z - (log.z + log.dz * tc)) - log.r - BODY_RADIUS;
      if (gap < 0.01) {
        // Against the log: never in it, and still moving along it.
        expect(obstacleDepth(h.x, h.z, BODY_RADIUS, hit)).toBeLessThanOrEqual(1e-9);
        touching++;
        slid += t - lastAlong;
      }
      lastAlong = t;
    });
    expect(touching).toBeGreaterThan(10);
    // While against the log it still moves along it (it steers into it, so it slides slower than it crawls).
    expect(slid / (touching * DT)).toBeGreaterThan(0.15 * LOCOMOTION.speed);
  });

  it('the speed test\'s drive never touches one: the head follows the free path exactly', () => {
    const c = new Crawl();
    let m: WormMotion = { head: { x: 0, y: 0, z: 0 }, heading: 0 };
    for (let s = 0; s < 30 * 60; s++) {
      c.step(DT, AUTO_DRIVE_MOVE.move);
      m = stepWorm(m, AUTO_DRIVE_MOVE.move, DT, LOCOMOTION);
      expect(c.motion.head.x).toBeCloseTo(m.head.x, 9);
      expect(c.motion.head.z).toBeCloseTo(m.head.z, 9);
    }
  });
});
describe('sightReach', () => {

  it('is 1 for a clear line', () => {
    expect(sightReach(0, 0.05, 0, 0, 1.15, -2.6, 0.35)).toBe(1);
  });

  it('stops short of a trunk in the way, by the margin', () => {
    const t = treeSites()[0];
    const foot = trunkFootOf(t);
    // From 1 m beside the trunk, looking back through it.
    const hx = t.x + foot + 1;
    const r = sightReach(hx, 0.1, t.z, hx - 4, 1.2, t.z, 0.35);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(1);
    // The stop point is the margin short of the trunk's edge.
    expect(hx - 4 * r - (t.x + foot)).toBeCloseTo(0.35, 2);
  });

  it('passes over a rock lower than the line, not one taller', () => {
    const k = rocks()[0];
    const top = terrainHeight(k.x, k.z) + k.size * 0.6;
    const foot = k.size * ROCK_FOOT;
    const hx = k.x + foot + 0.5;
    expect(sightReach(hx, top + 0.2, k.z, hx - 2 * foot - 1, top + 0.5, k.z, 0.35)).toBe(1);
    expect(sightReach(hx, top - 0.3, k.z, hx - 2 * foot - 1, top - 0.1, k.z, 0.35)).toBeLessThan(1);
  });
});

describe('the camera stays out of props', () => {

  it('driving at and around every tall prop, the camera never enters one, and moves smoothly', () => {
    const { round, log } = footprints();
    const targets = [];
    for (let o = 0; o < round.length; o += 4) targets.push({ x: round[o], z: round[o + 1] });
    targets.push({ x: log.x + log.dx * log.half * 0.3, z: log.z + log.dz * log.half * 0.3 });
    let pulled = 0;
    let fastest = 0;
    let jerk = 0;
    for (const t of targets) {
      const c = new Crawl();
      let last = { ...c.cam.pos };
      let lastStep = { x: 0, y: 0, z: 0 };
      const check = (cc: Crawl) => {
        const p = cc.cam.pos;
        expect(insideTall(p.x, p.z, p.y)).toBe(false);
        const step = { x: p.x - last.x, y: p.y - last.y, z: p.z - last.z };
        fastest = Math.max(fastest, Math.hypot(step.x, step.y, step.z));
        jerk = Math.max(jerk, Math.hypot(step.x - lastStep.x, step.y - lastStep.y, step.z - lastStep.z));
        last = { ...p };
        lastStep = step;
        if (cc.cameraReach < 0.99) pulled++;
      };
      driveTo(c, t.x, t.z, 700, check);
      // Then turn hard on the spot against it, swinging the camera round behind.
      const move = { x: 1, y: 0.2 };
      for (let s = 0; s < 400; s++) {
        c.step(DT, move);
        check(c);
      }
    }
    // The test is real: the camera did have to pull in.
    expect(pulled).toBeGreaterThan(50);
    // It eases: at most about 10 m/s while pulling in past a trunk (its hard turns alone reach
    // about 5), and its speed changes gradually from step to step (no snap).
    expect(fastest).toBeLessThan(0.18);
    expect(jerk).toBeLessThan(0.06);
  }, 60_000);

  it('the speed test\'s drive never pulls the camera in', () => {
    const c = new Crawl();
    for (let s = 0; s < 30 * 60; s++) {
      c.step(DT, AUTO_DRIVE_MOVE.move);
      expect(c.cameraReach).toBe(1);
    }
  });
});

describe('the camera eases in gently past a trunk', () => {
  /** A slanted pass by trunk `n`: aimed 3 m past it, half its footprint to one side. */
  const pastTrunk = (n: number) => {
    const { round } = footprints();
    const [x, z, r] = [round[4 * n], round[4 * n + 1], round[4 * n + 2]];
    const a = Math.atan2(x, z);
    return { x: x + Math.sin(a) * 3 + Math.cos(a) * r * 0.5, z: z + Math.cos(a) * 3 - Math.sin(a) * r * 0.5 };
  };

  it('a pull-in starts gently, and never snaps', () => {
    // Slanted passes by both trunks (the birch and the maple).
    let onset = 0;
    let fastest = 0;
    let pulled = 0;
    for (const n of [0, 1]) {
      const t = pastTrunk(n);
      const c = new Crawl();
      let last = { ...c.cam.pos };
      let lastStep = { x: 0, y: 0, z: 0 };
      let lastReach = 1;
      let since = Infinity;
      driveTo(c, t.x, t.z, 2400, (cc) => {
        const p = cc.cam.pos;
        const step = { x: p.x - last.x, y: p.y - last.y, z: p.z - last.z };
        const jerk = Math.hypot(step.x - lastStep.x, step.y - lastStep.y, step.z - lastStep.z);
        since = lastReach >= 0.999 && cc.cameraReach < 0.999 ? 0 : since + 1;
        if (since < 10) onset = Math.max(onset, jerk);
        fastest = Math.max(fastest, jerk);
        if (cc.cameraReach < 0.99) pulled++;
        last = { ...p };
        lastStep = step;
        lastReach = cc.cameraReach;
      });
    }
    expect(pulled).toBeGreaterThan(30);
    expect(onset).toBeLessThan(0.012);
    expect(fastest).toBeLessThan(0.03);
  }, 60_000);
});
