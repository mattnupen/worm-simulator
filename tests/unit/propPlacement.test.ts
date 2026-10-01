import { describe, it, expect } from 'vitest';
import {
  placeClutter, keepsClear, HERO_LOG, ROCKS, CLUTTER_KINDS, logSegmentDistance,
} from '../../src/surface/propPlacement';
import { treeSites } from '../../src/surface/treeSites';
import { stepWorm, type WormMotion } from '../../src/worm/locomotion';
import { PLAY_HALF } from '../../src/surface/terrain';
import { AUTO_DRIVE_MOVE, LOCOMOTION } from '../../src/spike/drive';

/** The speed test's auto-drive: the exact move and locomotion options src/spike/main.ts uses. */
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

function minDistToPath(x: number, z: number): number {
  return Math.min(...path.map((p) => Math.hypot(p.x - x, p.z - z)));
}

describe('keepsClear', () => {
  it('rejects the spawn point, the auto-drive loop and tree trunks', () => {
    expect(keepsClear(0, 0, 0.1)).toBe(false);
    expect(keepsClear(0, 5, 0.1)).toBe(false);
    for (const p of path.filter((_, i) => i % 30 === 0)) expect(keepsClear(p.x, p.z, 0.1)).toBe(false);
    for (const t of treeSites()) expect(keepsClear(t.x, t.z, 0.1)).toBe(false);
    expect(keepsClear(PLAY_HALF + 0.5, 0, 0.1)).toBe(false);
  });
  it('accepts open forest floor away from all of those', () => {
    expect(keepsClear(10, -6, 0.3)).toBe(true);
  });
});

describe('hero props', () => {
  it('keeps the fallen log near the spawn view but clear of the worm paths', () => {
    const ends = [-1, 1].map((s) => ({
      x: HERO_LOG.x + Math.cos(HERO_LOG.yaw) * (HERO_LOG.length / 2) * s,
      z: HERO_LOG.z + Math.sin(HERO_LOG.yaw) * (HERO_LOG.length / 2) * s,
    }));
    for (const p of path) expect(logSegmentDistance(p.x, p.z)).toBeGreaterThan(HERO_LOG.radius + PATH_CLEARANCE + 1);
    // Straight-ahead spawn corridor (+z) stays open.
    for (let z = -2; z <= 7; z += 0.5) expect(logSegmentDistance(0, z)).toBeGreaterThan(HERO_LOG.radius + 1.2);
    for (const e of ends) expect(Math.hypot(e.x, e.z)).toBeLessThan(9);
    for (const t of treeSites()) expect(logSegmentDistance(t.x, t.z)).toBeGreaterThan(HERO_LOG.radius + 0.8);
  });
  it('places rocks clear of everything and of each other', () => {
    for (const r of ROCKS) {
      expect(keepsClear(r.x, r.z, r.size)).toBe(true);
      expect(minDistToPath(r.x, r.z)).toBeGreaterThan(r.size + PATH_CLEARANCE);
      expect(logSegmentDistance(r.x, r.z)).toBeGreaterThan(r.size + HERO_LOG.radius);
    }
    for (let i = 0; i < ROCKS.length; i++) {
      for (let j = i + 1; j < ROCKS.length; j++) {
        expect(Math.hypot(ROCKS[i].x - ROCKS[j].x, ROCKS[i].z - ROCKS[j].z)).toBeGreaterThan(ROCKS[i].size + ROCKS[j].size);
      }
    }
  });
});

describe('placeClutter', () => {
  const items = placeClutter(60, 5);
  it('makes exactly count items, deterministic per seed', () => {
    expect(items).toHaveLength(60);
    expect(placeClutter(60, 5)).toEqual(items);
    expect(placeClutter(60, 6)).not.toEqual(items);
  });
  it('keeps every item clear of the worm paths, trunks, the log and rocks', () => {
    for (const c of items) {
      expect(CLUTTER_KINDS).toContain(c.kind);
      expect(Number.isFinite(c.x) && Number.isFinite(c.z) && Number.isFinite(c.rot)).toBe(true);
      expect(keepsClear(c.x, c.z, 0.2)).toBe(true);
      expect(minDistToPath(c.x, c.z)).toBeGreaterThan(PATH_CLEARANCE);
      expect(logSegmentDistance(c.x, c.z)).toBeGreaterThan(HERO_LOG.radius);
      for (const r of ROCKS) expect(Math.hypot(c.x - r.x, c.z - r.z)).toBeGreaterThan(r.size);
    }
  });
  it('mixes all kinds, with some mushrooms growing by the log', () => {
    for (const k of CLUTTER_KINDS) expect(items.some((c) => c.kind === k)).toBe(true);
    expect(items.slice(0, 4).every((c) => c.kind === 'mushrooms' && logSegmentDistance(c.x, c.z) < HERO_LOG.radius + 0.6)).toBe(true);
  });
});
