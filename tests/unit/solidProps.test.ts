import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Crawl, BODY_RADIUS } from '../../src/game/crawl';
import { obstacleDepth, footprints } from '../../src/surface/obstacles';
import { stepWorm, type WormMotion } from '../../src/worm/locomotion';
import { AUTO_DRIVE_MOVE, LOCOMOTION } from '../../src/game/drive';
import { DEFAULT_SCALE, SCALE_MODES, setScale } from '../../src/surface/worldScale';

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

afterAll(() => { setScale(DEFAULT_SCALE); });

describe.each(SCALE_MODES)('%s: trunks, rocks and the log are solid', (mode) => {
  beforeAll(() => { setScale(mode); });

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
describe('classic: a notch between two props', () => {
  beforeAll(() => { setScale('classic'); });

  it('the worm stops cleanly in it: the head stays put and the wave settles to its breath', () => {
    // Trunks 3 and 12 overlap: their grown footprints meet in a V-shaped notch facing the spawn.
    const { round } = footprints();
    const [ax, az, ar] = [round[12], round[13], round[14]];
    const [bx, bz, br] = [round[48], round[49], round[50]];
    expect(Math.hypot(ax - bx, az - bz)).toBeLessThan(ar + br);
    const c = new Crawl();
    driveTo(c, (ax + bx) / 2, (az + bz) / 2, 1200, () => {});
    const forward = { x: 0, y: 1 };
    for (let s = 0; s < 300; s++) c.step(DT, forward);
    // Wedged in the notch: within a step of both trunks (it stops where its next step would meet them).
    const h = c.motion.head;
    const stride = LOCOMOTION.speed * DT;
    expect(Math.hypot(h.x - ax, h.z - az) - ar - BODY_RADIUS).toBeLessThan(stride);
    expect(Math.hypot(h.x - bx, h.z - bz) - br - BODY_RADIUS).toBeLessThan(stride);

    // Pushing on into it moves the head nowhere, and the wave advances as it does standing still.
    const still = new Crawl();
    const rest = { x: 0, y: 0 };
    for (let s = 0; s < 300; s++) still.step(DT, rest);
    const phase0 = c.wave.phase;
    const stillPhase0 = still.wave.phase;
    let last = { x: h.x, z: h.z };
    for (let s = 0; s < 300; s++) {
      c.step(DT, forward);
      still.step(DT, rest);
      const p = c.motion.head;
      expect(Math.hypot(p.x - last.x, p.z - last.z)).toBeLessThan(1e-4);
      expect(obstacleDepth(p.x, p.z, BODY_RADIUS, hit)).toBeLessThanOrEqual(1e-9);
      last = { x: p.x, z: p.z };
    }
    expect(c.wave.phase - phase0).toBeCloseTo(still.wave.phase - stillPhase0, 3);
  });
});
