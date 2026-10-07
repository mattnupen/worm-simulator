import { describe, it, expect } from 'vitest';
import {
  placeClutter, keepsClear, heroLog, rocks, CLUTTER_KINDS, logSegmentDistance, clutterRadius, clutterBase,
  clutterBaseClear,
} from '../../src/surface/propPlacement';
import { treeSites, trunkFootOf } from '../../src/surface/treeSites';
import { obstacleDepth, footprints, LOG_FOOT, ROCK_FOOT } from '../../src/surface/obstacles';
import { CORRIDOR } from '../../src/surface/wormPaths';
import { stepWorm, type WormMotion } from '../../src/worm/locomotion';
import { PLAY_HALF, WORLD_HALF } from '../../src/surface/terrain';
import { AUTO_DRIVE_MOVE, LOCOMOTION } from '../../src/game/drive';
import { REAL_SCALE } from '../../src/surface/realScale';

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

/** How many mushroom clusters grow beside the log: they are wide, so only two of four fit apart. */
const BY_LOG = 2;

describe('real-size layout', () => {

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

  it('places the clutter clear of the worm paths, trunks, the log and rocks', () => {
    const items = placeClutter();
    expect(items).toHaveLength(REAL_SCALE.clutter);
    const log = heroLog();
    for (const c of items) {
      expect(CLUTTER_KINDS).toContain(c.kind);
      expect(Number.isFinite(c.x) && Number.isFinite(c.z) && Number.isFinite(c.rot)).toBe(true);
      if (items.indexOf(c) < BY_LOG) continue; // the mushrooms by the log, checked below
      const r = clutterRadius(c.kind, c.scale);
      expect(keepsClear(c.x, c.z, r)).toBe(true);
      expect(minDistToPath(c.x, c.z)).toBeGreaterThan(PATH_CLEARANCE);
      expect(logSegmentDistance(c.x, c.z)).toBeGreaterThan(log.radius);
      for (const k of rocks()) expect(Math.hypot(c.x - k.x, c.z - k.z)).toBeGreaterThan(k.size);
    }
    // Mushrooms grow right beside the log (the whole cluster stands just off the drawn log, and
    // only as many as fit apart: the rest are skipped).
    const mushroom = REAL_SCALE.mushroom;
    expect(items.slice(0, BY_LOG).every((c) => c.kind === 'mushrooms'
      && logSegmentDistance(c.x, c.z) > log.radius
      && logSegmentDistance(c.x, c.z) < log.radius * LOG_FOOT + clutterBase(c.kind, c.scale) + 0.6 * mushroom + 1e-9)).toBe(true);
    const byLog = items.slice(0, BY_LOG);
    for (const a of byLog) {
      for (const b of byLog) {
        if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(clutterBase(a.kind, a.scale) + clutterBase(b.kind, b.scale));
      }
    }
    for (const k of CLUTTER_KINDS) expect(items.some((c) => c.kind === k)).toBe(true);
  });

  it('has as many footprints as trunks and rocks', () => {
    expect(footprints().round.length).toBe((treeSites().length + rocks().length) * 4);
  });
});

describe('clutter: fronds may lean over a prop, the base may not', () => {
  it('every clutter item\'s base stays off the drawn rocks and log, inside the world', () => {
    const items = placeClutter();
    for (const c of items) {
      expect(clutterBaseClear(c), `${c.kind} at ${c.x}, ${c.z}`).toBe(true);
      expect(Math.abs(c.x)).toBeLessThan(PLAY_HALF);
      expect(Math.abs(c.z)).toBeLessThan(PLAY_HALF);
      expect(Math.max(Math.abs(c.x), Math.abs(c.z)) + clutterBase(c.kind, c.scale)).toBeLessThan(WORLD_HALF);
      for (const k of rocks()) {
        expect(Math.hypot(c.x - k.x, c.z - k.z)).toBeGreaterThan(k.size * ROCK_FOOT + clutterBase(c.kind, c.scale));
      }
      expect(logSegmentDistance(c.x, c.z)).toBeGreaterThan(heroLog().radius * LOG_FOOT + clutterBase(c.kind, c.scale));
    }
    for (const k of CLUTTER_KINDS) expect(items.some((c) => c.kind === k)).toBe(true);
  });
});

describe('the spawn\'s straight run stays clear of trunks and other footprints', () => {
  it('the whole corridor clears every trunk', () => {
    for (const t of treeSites()) {
      const nx = Math.max(CORRIDOR.x0, Math.min(CORRIDOR.x1, t.x));
      const nz = Math.max(CORRIDOR.z0, Math.min(CORRIDOR.z1, t.z));
      expect(Math.hypot(t.x - nx, t.z - nz)).toBeGreaterThan(trunkFootOf(t) + PATH_CLEARANCE);
    }
  });

  it('no footprint reaches the straight line the worm runs', () => {
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
    const items = placeClutter(60, 5);
    expect(items).toHaveLength(60);
    expect(placeClutter(60, 5)).toEqual(items);
    expect(placeClutter(60, 6)).not.toEqual(items);
  });
});
