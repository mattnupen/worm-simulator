import { describe, it, expect } from 'vitest';
import { Crawl, BODY_RADIUS, WORM_SEGMENTS } from '../../src/game/crawl';
import { footprints, obstacleDepth } from '../../src/surface/obstacles';
import { climbAt, CLIMB_SLOPE, MAX_CLIMB } from '../../src/surface/climbSurface';
import { rocks } from '../../src/surface/propPlacement';
import { floorHeight } from '../../src/surface/litterDepth';
import { PLAY_HALF } from '../../src/surface/terrain';
import { LOCOMOTION } from '../../src/game/drive';
import { createBody } from '../../src/worm/body';
import { DT, driveTo } from './cameraPress';

/**
 * V4 hot fix (Matt): "allow worm to crawl over rocks and logs" and "going backwards doesn't always
 * work, players are reporting getting stuck". Before it, the crawl threw backward input away
 * (crawl.ts clamped move.y to 0), and every rock and the log were solid walls; turning on the spot
 * stops 1.3 rad off the neck, so a head pressed into a prop could only slide or turn so far.
 */
const hit = { nx: 0, nz: 0 };
const BACK = { x: 0, y: -1 };
const at = (x: number, z: number, heading: number): Crawl => {
  const c = new Crawl();
  c.reset(c.hero.count, createBody(WORM_SEGMENTS, 0.22, { x, y: 0, z }, heading), heading);
  return c;
};
const trunks = (): { x: number; z: number; r: number }[] => {
  const { round } = footprints();
  const out = [];
  for (let o = 0; o < round.length; o += 4) if (round[o + 3] > MAX_CLIMB) out.push({ x: round[o], z: round[o + 1], r: round[o + 2] });
  return out;
};

describe('the climb surface (climbSurface.ts)', () => {
  it('climbs everything but the trunks: the log and every rock are under MAX_CLIMB', () => {
    const { round, log } = footprints();
    expect(log.top).toBeLessThan(MAX_CLIMB);
    for (let o = 0; o < round.length; o += 4) expect(round[o + 3] === Infinity || round[o + 3] < MAX_CLIMB).toBe(true);
    expect(trunks().length).toBeGreaterThan(0);
  });

  it('never reaches past a footprint grown by the body: where the worm could lie before, it lies on the floor as before', () => {
    for (let x = -PLAY_HALF; x <= PLAY_HALF; x += 0.17) {
      for (let z = -PLAY_HALF; z <= PLAY_HALF; z += 0.17) {
        if (obstacleDepth(x, z, BODY_RADIUS, hit) <= 0) expect(climbAt(x, z)).toBeLessThanOrEqual(floorHeight(x, z));
      }
    }
  });

  it('stands over the top of every rock and the log, about as high as each is drawn', () => {
    const { log } = footprints();
    const onLog = climbAt(log.x, log.z) - floorHeight(log.x, log.z);
    expect(onLog).toBeGreaterThan(log.top * 0.85);
    expect(onLog).toBeLessThan(log.top * 1.05);
    for (const k of rocks()) {
      const up = climbAt(k.x, k.z) - floorHeight(k.x, k.z);
      expect(up).toBeGreaterThan(k.size * 0.3);
      expect(up).toBeLessThan(k.size * 0.6);
    }
  });

  it('is never steeper than CLIMB_SLOPE over a prop, away from its foot\'s last wall', () => {
    const { log } = footprints();
    // Across the log, from its top out to where the wall starts (well inside the footprint).
    let last = climbAt(0, log.z);
    for (let d = 0.05; d < log.r - 0.4; d += 0.05) {
      const y = climbAt(0, log.z - d);
      expect(last - y).toBeLessThanOrEqual(CLIMB_SLOPE * 0.05 + 1e-6);
      last = y;
    }
  });
});

describe('crawling over rocks and the log (V4 hot fix)', () => {
  it('crawls up the log, along its top, and down the far side, never faster than it crawls', () => {
    const { log } = footprints();
    const c = at(0, 9, 0);
    let top = -Infinity;
    let last = { ...c.motion.head };
    let fastest = 0;
    let dy = 0;
    for (let s = 0; s < 60 * 9; s++) {
      c.step(DT, { x: 0, y: 1 });
      const h = c.motion.head;
      top = Math.max(top, h.y - floorHeight(h.x, h.z));
      fastest = Math.max(fastest, Math.hypot(h.x - last.x, h.y - last.y, h.z - last.z));
      dy = Math.max(dy, Math.abs(h.y - last.y));
      last = { ...h };
    }
    expect(top).toBeGreaterThan(log.top * 0.85);
    // Over and down the far side, to the play edge beyond.
    expect(c.motion.head.z).toBeGreaterThan(log.z + 2);
    // keepPace: the head never moves faster in 3D than it crawls on the flat (a hair for the slide).
    expect(fastest).toBeLessThanOrEqual(LOCOMOTION.speed * DT * 1.05);
    expect(dy).toBeLessThanOrEqual(LOCOMOTION.speed * DT * 1.05);
    // Every body point rests on the surface (on the log where it is over it).
    for (const p of c.body) expect(p.y).toBeGreaterThanOrEqual(Math.max(floorHeight(p.x, p.z), climbAt(p.x, p.z)));
  });

  it('drives over every rock instead of stopping at its edge', () => {
    for (const k of rocks()) {
      const c = new Crawl();
      let top = -Infinity;
      driveTo(c, k.x, k.z, 1500, (cc) => {
        const h = cc.motion.head;
        top = Math.max(top, h.y - floorHeight(h.x, h.z));
      });
      expect(Math.hypot(c.motion.head.x - k.x, c.motion.head.z - k.z)).toBeLessThan(0.5);
      expect(top).toBeGreaterThan(k.size * 0.3);
    }
  }, 60_000);

  it('the camera follows up onto the log and never sinks into it or the rocks', () => {
    const c = at(0, 9, 0);
    let lastY = c.cam.pos.y;
    let jump = 0;
    for (let s = 0; s < 60 * 9; s++) {
      c.step(DT, { x: s > 300 ? 0.6 : 0, y: 1 });
      const p = c.cam.pos;
      expect(p.y).toBeGreaterThan(climbAt(p.x, p.z) + 0.4);
      jump = Math.max(jump, Math.abs(p.y - lastY));
      lastY = p.y;
    }
    expect(jump).toBeLessThan(0.08);
  });
});

describe('backing up and getting unstuck (V4 hot fix)', () => {
  it('backs up tail first, the body retracing its path, then crawls forward again', () => {
    const c = new Crawl();
    for (let s = 0; s < 60; s++) c.step(DT, { x: 0.5, y: 1 });
    const bent = c.body.map((p) => ({ ...p }));
    for (let s = 0; s < 60; s++) c.step(DT, BACK);
    // Half speed: about 0.8 back along the body's own path (the tail first).
    const t = c.body[WORM_SEGMENTS - 1];
    const t0 = bent[WORM_SEGMENTS - 1];
    expect(Math.hypot(t.x - t0.x, t.z - t0.z)).toBeGreaterThan(0.7);
    const h0 = bent[0];
    const h = c.motion.head;
    expect(Math.hypot(h.x - h0.x, h.z - h0.z)).toBeGreaterThan(0.5);
    // Heading points along the neck.
    expect(Math.abs(Math.atan2(c.body[0].x - c.body[1].x, c.body[0].z - c.body[1].z) - c.motion.heading)).toBeLessThan(1e-6);
    for (let s = 0; s < 30; s++) c.step(DT, { x: 0, y: 1 });
    expect(Math.hypot(c.motion.head.x - h.x, c.motion.head.z - h.z)).toBeGreaterThan(0.6);
  });

  it('steers while backing: the stick pulled down and left backs the tail off to the left (+x, seen from behind)', () => {
    for (const side of [1, -1]) {
      const c = new Crawl();
      for (let s = 0; s < 120; s++) c.step(DT, { x: -side, y: -1 });
      expect(Math.sign(c.body[WORM_SEGMENTS - 1].x)).toBe(side);
      expect(Math.abs(c.body[WORM_SEGMENTS - 1].x)).toBeGreaterThan(0.5);
    }
  });

  it('wedged nose first against every trunk, backing up frees it; the body never enters a trunk', () => {
    for (const t of trunks()) {
      const c = new Crawl();
      driveTo(c, t.x, t.z, 1500);
      const wedged = { ...c.motion.head };
      // Pressing on moves it little: it is against the trunk.
      expect(Math.hypot(wedged.x - t.x, wedged.z - t.z)).toBeLessThan(t.r + BODY_RADIUS + 0.05);
      for (let s = 0; s < 120; s++) {
        c.step(DT, BACK);
        for (const p of c.body) expect(obstacleDepth(p.x, p.z, BODY_RADIUS, hit, MAX_CLIMB)).toBeLessThanOrEqual(1e-6);
      }
      expect(Math.hypot(c.motion.head.x - t.x, c.motion.head.z - t.z)).toBeGreaterThan(t.r + BODY_RADIUS + 1);
    }
  }, 60_000);

  it('in the notch where a trunk crosses the play edge, backing out works where turning on the spot cannot', () => {
    // The birch reaching past the west edge: driven into the notch, the head can turn only 1.3 rad
    // off its neck on the spot, but backing frees it.
    const birch = trunks().find((t) => t.x - t.r < -PLAY_HALF)!;
    expect(birch).toBeDefined();
    const c = at(-17.5, -2, -0.45);
    for (let s = 0; s < 180; s++) c.step(DT, { x: 0, y: 1 });
    expect(c.motion.head.x).toBeCloseTo(-PLAY_HALF, 3);
    const wedged = { ...c.motion.head };
    for (let s = 0; s < 120; s++) c.step(DT, BACK);
    expect(Math.hypot(c.motion.head.x - wedged.x, c.motion.head.z - wedged.z)).toBeGreaterThan(0.7);
    for (const p of c.body) expect(Math.abs(p.x)).toBeLessThanOrEqual(PLAY_HALF + 1e-9);
  });

  it('backing into the play edge stops the tail at it, and never leaves the play area', () => {
    const c = at(0, -PLAY_HALF + 4, 0);
    for (let s = 0; s < 60 * 8; s++) {
      c.step(DT, BACK);
      for (const p of c.body) expect(Math.abs(p.z)).toBeLessThanOrEqual(PLAY_HALF + 1e-9);
    }
    expect(c.body[WORM_SEGMENTS - 1].z).toBeCloseTo(-PLAY_HALF, 2);
    // And it can still crawl away.
    const z = c.motion.head.z;
    for (let s = 0; s < 30; s++) c.step(DT, { x: 0, y: 1 });
    expect(c.motion.head.z).toBeGreaterThan(z + 0.6);
  });

  it('backs down off the log the way it came', () => {
    const c = at(0, 9, 0);
    for (let s = 0; s < 60 * 5; s++) c.step(DT, { x: 0, y: 1 });
    expect(c.motion.head.y - floorHeight(c.motion.head.x, c.motion.head.z)).toBeGreaterThan(2);
    for (let s = 0; s < 60 * 14; s++) c.step(DT, BACK);
    expect(c.motion.head.y - floorHeight(c.motion.head.x, c.motion.head.z)).toBeLessThan(0.2);
  });
});
