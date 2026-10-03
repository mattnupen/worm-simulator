import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  placeClutter, keepsClear, heroLog, rocks, CLUTTER_KINDS, logSegmentDistance, clutterRadius,
} from '../../src/surface/propPlacement';
import { treeSites, trunkFootOf } from '../../src/surface/treeSites';
import { obstacleDepth, footprints, LOG_FOOT, ROCK_FOOT } from '../../src/surface/obstacles';
import { CORRIDOR } from '../../src/surface/wormPaths';
import { stepWorm, type WormMotion } from '../../src/worm/locomotion';
import { PLAY_HALF } from '../../src/surface/terrain';
import { AUTO_DRIVE_MOVE, LOCOMOTION } from '../../src/game/drive';
import { DEFAULT_SCALE, SCALE_MODES, SCALE_SPECS, setScale } from '../../src/surface/worldScale';
import { litterDepth } from '../../src/surface/litterDepth';

/** The speed test's auto-drive: the exact move and locomotion options the game uses. */
function autoDrivePath(seconds: number): { x: number; z: number }[] {
  let m: WormMotion = { head: { x: 0, y: 0, z: 0 }, heading: 0 };
  const out = [];
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    m = stepWorm(m, AUTO_DRIVE_MOVE.move, dt, LOCOMOTION);
    out.push({ x: m.head.x, z: m.head.z });
  }
  return out;
}

const path = autoDrivePath(30);
/** Worm half-width plus slack, and the trailing camera (2.6 back, 1.1 up). */
const PATH_CLEARANCE = 1.0;
const hit = { nx: 0, nz: 0 };

function minDistToPath(x: number, z: number): number {
  return Math.min(...path.map((p) => Math.hypot(p.x - x, p.z - z)));
}

afterAll(() => { setScale(DEFAULT_SCALE); });

describe.each(SCALE_MODES)('%s layout', (mode) => {
  beforeAll(() => { setScale(mode); });

  it('keepsClear rejects the spawn point, the auto-drive loop and tree trunks', () => {
    expect(keepsClear(0, 0, 0.1)).toBe(false);
    expect(keepsClear(0, 5, 0.1)).toBe(false);
    for (const p of path.filter((_, i) => i % 30 === 0)) expect(keepsClear(p.x, p.z, 0.1)).toBe(false);
    for (const t of treeSites()) expect(keepsClear(t.x, t.z, 0.1)).toBe(false);
    expect(keepsClear(PLAY_HALF + 0.5, 0, 0.1)).toBe(false);
  });

  it('keeps every solid footprint off the speed test\'s loop, with room for the body and camera', () => {
    for (const p of path) expect(obstacleDepth(p.x, p.z, PATH_CLEARANCE, hit)).toBeLessThanOrEqual(0);
  });

  it('keeps the spawn and the camera behind it clear', () => {
    expect(obstacleDepth(0, 0, 3, hit)).toBeLessThanOrEqual(0);
    expect(obstacleDepth(0, -2.6, 1, hit)).toBeLessThanOrEqual(0);
  });

  it('keeps the fallen log clear of the worm paths and the trunks', () => {
    const log = heroLog();
    for (const p of path) expect(logSegmentDistance(p.x, p.z)).toBeGreaterThan(log.radius * LOG_FOOT + PATH_CLEARANCE + 1);
    // Straight-ahead spawn corridor (+z) stays open.
    for (let z = -2; z <= 7; z += 0.5) expect(logSegmentDistance(0, z)).toBeGreaterThan(log.radius * LOG_FOOT + 1.2);
    for (const t of treeSites()) expect(logSegmentDistance(t.x, t.z)).toBeGreaterThan(log.radius * LOG_FOOT + trunkFootOf(t));
  });

  it('places rocks clear of everything and of each other', () => {
    const log = heroLog();
    const rs = rocks();
    for (const r of rs) {
      const foot = r.size * ROCK_FOOT;
      expect(keepsClear(r.x, r.z, foot)).toBe(true);
      expect(minDistToPath(r.x, r.z)).toBeGreaterThan(foot + PATH_CLEARANCE);
      expect(logSegmentDistance(r.x, r.z)).toBeGreaterThan(foot + log.radius * LOG_FOOT);
    }
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        expect(Math.hypot(rs[i].x - rs[j].x, rs[i].z - rs[j].z)).toBeGreaterThan((rs[i].size + rs[j].size) * ROCK_FOOT);
      }
    }
  });

  it('places the mode\'s clutter clear of the worm paths, trunks, the log and rocks', () => {
    const items = placeClutter();
    expect(items).toHaveLength(SCALE_SPECS[mode].clutter);
    const log = heroLog();
    for (const c of items) {
      expect(CLUTTER_KINDS).toContain(c.kind);
      expect(Number.isFinite(c.x) && Number.isFinite(c.z) && Number.isFinite(c.rot)).toBe(true);
      if (items.indexOf(c) < 4) continue; // the mushrooms by the log, checked below
      const r = clutterRadius(c.kind, c.scale);
      expect(keepsClear(c.x, c.z, r)).toBe(true);
      expect(minDistToPath(c.x, c.z)).toBeGreaterThan(PATH_CLEARANCE);
      expect(logSegmentDistance(c.x, c.z)).toBeGreaterThan(log.radius);
      for (const k of rocks()) expect(Math.hypot(c.x - k.x, c.z - k.z)).toBeGreaterThan(k.size);
    }
    // Mushrooms grow right beside the log.
    expect(items.slice(0, 4).every((c) => c.kind === 'mushrooms'
      && logSegmentDistance(c.x, c.z) > log.radius && logSegmentDistance(c.x, c.z) < log.radius + 0.6 * SCALE_SPECS[mode].mushroom)).toBe(true);
    for (const k of CLUTTER_KINDS) expect(items.some((c) => c.kind === k)).toBe(true);
  });

  it('has as many footprints as trunks and rocks', () => {
    expect(footprints().round.length).toBe((treeSites().length + rocks().length) * 4);
  });
});

describe('the bigger modes keep the spawn\'s straight run clear of trunks', () => {
  it.each(['hybrid', 'true'] as const)('%s', (mode) => {
    setScale(mode);
    for (const t of treeSites()) {
      const nx = Math.max(CORRIDOR.x0, Math.min(CORRIDOR.x1, t.x));
      const nz = Math.max(CORRIDOR.z0, Math.min(CORRIDOR.z1, t.z));
      expect(Math.hypot(t.x - nx, t.z - nz)).toBeGreaterThan(trunkFootOf(t) + PATH_CLEARANCE);
    }
  });

  // Classic gets a narrower check: its Step 1a maple at (1.92, 8.27) reaches about 0.28 into the
  // corridor's far corner, and Classic must stay byte-for-byte Step 1a, so the tree cannot move.
  // What matters is the line the worm actually runs (x near 0, the whole corridor's length):
  // no footprint, grown by the body's half-width plus slack, reaches it.
  it('classic: no footprint reaches the straight line the worm runs', () => {
    setScale('classic');
    const BODY_PAD = 0.5;
    for (let x = -0.5; x <= 0.5; x += 0.1) {
      for (let z = CORRIDOR.z0; z <= CORRIDOR.z1; z += 0.1) {
        expect(obstacleDepth(x, z, BODY_PAD, hit)).toBeLessThanOrEqual(0);
      }
    }
  });
});

describe('placeClutter', () => {
  it('is deterministic per seed', () => {
    setScale('classic');
    const items = placeClutter(60, 5);
    expect(items).toHaveLength(60);
    expect(placeClutter(60, 5)).toEqual(items);
    expect(placeClutter(60, 6)).not.toEqual(items);
  });
});

describe('Classic is exactly the Step 1a world (checksums taken before the scale modes)', () => {
  it('trees, clutter and litter depth', () => {
    setScale('classic');
    const t = treeSites();
    expect(t).toHaveLength(14);
    expect(t.reduce((s, c) => s + c.x, 0)).toBeCloseTo(-70.84152821917087, 10);
    expect(t.reduce((s, c) => s + c.z, 0)).toBeCloseTo(9.825550918467343, 10);
    const c = placeClutter(64);
    expect(c.reduce((s, i) => s + i.x, 0)).toBeCloseTo(-35.457261321132044, 10);
    expect(c.reduce((s, i) => s + i.z, 0)).toBeCloseTo(-23.469567911623017, 10);
    expect(c.reduce((s, i) => s + i.scale, 0)).toBeCloseTo(65.08443361632527, 10);
    let depth = 0;
    let n = 0;
    for (let x = -20; x <= 20; x += 0.37) for (let z = -20; z <= 20; z += 0.41) { depth += litterDepth(x, z); n++; }
    expect(n).toBe(10682);
    expect(depth).toBeCloseTo(425.16354611935066, 8);
  });

  it('rocks and the log', () => {
    setScale('classic');
    expect(rocks()).toEqual([
      { x: -5.2, z: 7.4, size: 0.9 },
      { x: 7.2, z: -3.6, size: 1.2 },
      { x: -8.2, z: -5.2, size: 0.7 },
      { x: 9.8, z: 8.6, size: 1.0 },
      { x: -11.5, z: 5.5, size: 1.4 },
      { x: 3.2, z: -8.2, size: 0.6 },
      { x: 6.2, z: 2.2, size: 0.45 },
    ]);
    expect(heroLog()).toEqual({ x: 3.9, z: 4.7, yaw: -0.5, length: 4.4, radius: 0.32 });
  });
});
