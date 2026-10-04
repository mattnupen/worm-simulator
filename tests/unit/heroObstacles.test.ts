import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WEDGE_TIME } from '../../src/surface/heroObstacles';
import { obstacleDepth, ROCK_FOOT, LOG_FOOT } from '../../src/surface/obstacles';
import { createHeroLeaves, setHeroCount, stepHeroLeaves, HERO_MAX, HERO_RECYCLE } from '../../src/surface/heroLeaves';
import { LEAF_REACH } from '../../src/surface/heroClearance';
import { OBSTACLE_PAD } from '../../src/surface/heroSpawn';
import { treeSites, trunkFootOf } from '../../src/surface/treeSites';
import { heroLog, rocks } from '../../src/surface/propPlacement';
import { DEFAULT_SCALE, SCALE_MODES, setScale } from '../../src/surface/worldScale';
import { PLAY_HALF } from '../../src/surface/terrain';

const DT = 1 / 60;
const flat = () => 0.05;
const NONE = new Float32Array(0);
const hit = { nx: 0, nz: 0 };

/** One leaf at (x, z), at rest, with the head nearby (so it is not recycled for distance). */
function oneLeaf(x: number, z: number) {
  const p = createHeroLeaves(1, 3);
  setHeroCount(p, 1, x, z, 0, flat);
  p.x[0] = p.px[0] = x;
  p.z[0] = p.pz[0] = z;
  return p;
}
const pad = (p: ReturnType<typeof oneLeaf>) => OBSTACLE_PAD * p.size[0] * LEAF_REACH[p.kind[0]];

/** A spot in the play area 0.3 outside a footprint of radius `r` round (x, z), clear of the others. */
function besideOf(x: number, z: number, r: number): { x: number; z: number } {
  for (let a = 0; a < 2 * Math.PI; a += Math.PI / 8) {
    const p = { x: x + Math.cos(a) * (r + 0.3), z: z + Math.sin(a) * (r + 0.3) };
    if (Math.abs(p.x) < PLAY_HALF - 0.5 && Math.abs(p.z) < PLAY_HALF - 0.5 && obstacleDepth(p.x, p.z, 0.25, hit) <= 0) return p;
  }
  throw new Error(`no free spot beside (${x}, ${z})`);
}

/** Pairs of active hero leaves nearer than STACKED (heroSpawn.ts): stacked, not spread out. */
function coincidentPairs(p: { count: number; x: Float32Array; z: Float32Array }): number {
  let n = 0;
  for (let i = 0; i < p.count; i++) {
    for (let j = i + 1; j < p.count; j++) if (Math.hypot(p.x[i] - p.x[j], p.z[i] - p.z[j]) < 0.15) n++;
  }
  return n;
}

afterAll(() => { setScale(DEFAULT_SCALE); });

describe.each(SCALE_MODES)('%s: hero leaves and trunks, rocks and the log', (mode) => {
  beforeAll(() => { setScale(mode); });
  const tree = () => treeSites()[0];
  /** Just outside the first trunk's footprint, on its +x side. */
  const beside = (gap: number) => tree().x + trunkFootOf(tree()) + gap;

  it('finds the footprints of trunks, rocks and the log', () => {
    expect(obstacleDepth(tree().x, tree().z, 0, hit)).toBeCloseTo(trunkFootOf(tree()), 6);
    const r = rocks()[0];
    expect(obstacleDepth(r.x, r.z, 0, hit)).toBeCloseTo(r.size * ROCK_FOOT, 6);
    const log = heroLog();
    expect(obstacleDepth(log.x, log.z, 0, hit)).toBeCloseTo(log.radius * LOG_FOOT, 6);
    expect(obstacleDepth(0, 0, 0.1, hit)).toBeLessThan(0);
    // Just outside a trunk, the way out points away from it.
    obstacleDepth(beside(-0.1), tree().z, 0.2, hit);
    expect(hit.nx).toBeCloseTo(1, 6);
  });

  it('a leaf shoved into a trunk ends every step outside its footprint (plus half its reach)', () => {
    const p = oneLeaf(beside(0.8), tree().z + 0.05);
    p.vx[0] = -3;
    const spawned = p.spawned;
    for (let s = 0; s < 40; s++) {
      stepHeroLeaves(p, DT, NONE, 0, p.x[0], p.z[0], 0, flat);
      expect(obstacleDepth(p.x[0], p.z[0], pad(p), hit)).toBeLessThanOrEqual(1e-4);
    }
    // It slid in once and stopped against it: not wedged, not recycled.
    expect(p.spawned).toBe(spawned);
    expect(p.wedged[0]).toBe(0);
  });

  it('a leaf held against a trunk is recycled after about half a second', () => {
    const x = beside(0.6);
    const p = oneLeaf(x, tree().z);
    const spawned = p.spawned;
    let steps = 0;
    while (p.spawned === spawned && steps < 120) {
      // Something keeps driving it into the trunk.
      p.vx[0] = -2;
      p.vz[0] = 0;
      stepHeroLeaves(p, DT, NONE, 0, x, tree().z, 0, flat);
      steps++;
    }
    expect(p.spawned).toBe(spawned + 1);
    expect(steps * DT).toBeGreaterThan(WEDGE_TIME);
    expect(steps * DT).toBeLessThan(WEDGE_TIME + 0.4);
    // ...to a spot clear of every obstacle.
    expect(obstacleDepth(p.x[0], p.z[0], pad(p), hit)).toBeLessThanOrEqual(0);
  });

  it('new and recycled leaves land clear of trunks, rocks and the log, and not on one another', () => {
    const log = heroLog();
    const sites = [
      ...treeSites().map((t) => besideOf(t.x, t.z, trunkFootOf(t))),
      ...rocks().map((k) => besideOf(k.x, k.z, k.size * ROCK_FOOT)),
      besideOf(log.x, log.z, log.radius * LOG_FOOT),
      // Squeezed between big footprints in True (a rock and a maple's root flare): every spawn
      // spot tried can be inside one, so the leaves fall back to the ring search. Outside True
      // it is a deliberately bad head position (in Hybrid the head is 1.75 inside a rock, where
      // the worm cannot go): a stress test of the fallback.
      { x: 3.2, z: -7.0 },
      // At the world's edge: spots are clamped onto it, so few are free.
      { x: -18.8, z: 0 },
    ];
    let checked = 0;
    for (const { x, z } of sites) {
      const p = createHeroLeaves(HERO_MAX, 5);
      setHeroCount(p, HERO_MAX, x, z, 0, flat);
      for (let i = 0; i < p.count; i++) {
        const pd = OBSTACLE_PAD * p.size[i] * LEAF_REACH[p.kind[i]];
        expect(obstacleDepth(p.x[i], p.z[i], pd, hit)).toBeLessThanOrEqual(0);
      }
      expect(coincidentPairs(p), `stacked at (${x}, ${z}) after spawning`).toBe(0);
      // Every leaf left far behind: each is recycled ahead of the head, which faces the obstacle.
      for (let i = 0; i < p.count; i++) p.x[i] = x + 10;
      stepHeroLeaves(p, DT, NONE, 0, x, z, -Math.PI / 2, flat);
      for (let i = 0; i < p.count; i++) {
        const pd = OBSTACLE_PAD * p.size[i] * LEAF_REACH[p.kind[i]];
        expect(obstacleDepth(p.x[i], p.z[i], pd, hit)).toBeLessThanOrEqual(0);
        checked++;
      }
      expect(coincidentPairs(p), `stacked at (${x}, ${z}) after a recycle`).toBe(0);
      // Every leaf lands inside the recycle distance, so none is recycled again on the next step.
      for (let i = 0; i < p.count; i++) {
        expect(Math.hypot(p.x[i] - x, p.z[i] - z), `leaf ${i} at (${x}, ${z})`).toBeLessThanOrEqual(HERO_RECYCLE);
      }
      const spawned = p.spawned;
      stepHeroLeaves(p, DT, NONE, 0, x, z, -Math.PI / 2, flat);
      expect(p.spawned - spawned, `respawned again at (${x}, ${z})`).toBe(0);
    }
    // Every recycled leaf at every site was checked (Classic 768, Hybrid 416, True 320).
    expect(checked).toBe(sites.length * HERO_MAX);
  });
});
