import { describe, it, expect } from 'vitest';
import { obstacleDepth, WEDGE_TIME } from '../../src/surface/heroObstacles';
import { createHeroLeaves, setHeroCount, stepHeroLeaves, HERO_MAX } from '../../src/surface/heroLeaves';
import { LEAF_REACH } from '../../src/surface/heroClearance';
import { OBSTACLE_PAD } from '../../src/surface/heroSpawn';
import { treeSites } from '../../src/surface/treeSites';
import { HERO_LOG, ROCKS } from '../../src/surface/propPlacement';

const DT = 1 / 60;
const flat = () => 0.05;
const NONE = new Float32Array(0);
const hit = { nx: 0, nz: 0 };
const TREE = treeSites()[0];

/** One leaf at (x, z), at rest, with the head nearby (so it is not recycled for distance). */
function oneLeaf(x: number, z: number) {
  const p = createHeroLeaves(1, 3);
  setHeroCount(p, 1, x, z, 0, flat);
  p.x[0] = p.px[0] = x;
  p.z[0] = p.pz[0] = z;
  return p;
}
const pad = (p: ReturnType<typeof oneLeaf>) => OBSTACLE_PAD * p.size[0] * LEAF_REACH[p.kind[0]];

describe('hero leaves and trunks, rocks and the log', () => {
  it('finds the footprints of trunks, rocks and the log', () => {
    expect(obstacleDepth(TREE.x, TREE.z, 0, hit)).toBeGreaterThan(0.3);
    expect(obstacleDepth(ROCKS[0].x, ROCKS[0].z, 0, hit)).toBeCloseTo(ROCKS[0].size, 6);
    expect(obstacleDepth(HERO_LOG.x, HERO_LOG.z, 0, hit)).toBeCloseTo(HERO_LOG.radius, 6);
    expect(obstacleDepth(0, 0, 0.1, hit)).toBeLessThan(0);
    // Just outside a trunk, the way out points away from it.
    obstacleDepth(TREE.x + 0.4, TREE.z, 0.2, hit);
    expect(hit.nx).toBeCloseTo(1, 6);
  });

  it('a leaf shoved into a trunk ends every step outside its footprint (plus half its reach)', () => {
    const p = oneLeaf(TREE.x + 1.2, TREE.z + 0.05);
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
    const p = oneLeaf(TREE.x + 1, TREE.z);
    const spawned = p.spawned;
    let steps = 0;
    while (p.spawned === spawned && steps < 120) {
      // Something keeps driving it into the trunk.
      p.vx[0] = -2;
      p.vz[0] = 0;
      stepHeroLeaves(p, DT, NONE, 0, TREE.x + 1, TREE.z, 0, flat);
      steps++;
    }
    expect(p.spawned).toBe(spawned + 1);
    expect(steps * DT).toBeGreaterThan(WEDGE_TIME);
    expect(steps * DT).toBeLessThan(WEDGE_TIME + 0.4);
    // ...to a spot clear of every obstacle.
    expect(obstacleDepth(p.x[0], p.z[0], pad(p), hit)).toBeLessThanOrEqual(0);
  });

  it('new and recycled leaves land clear of trunks, rocks and the log', () => {
    const sites = [
      ...treeSites().map((t) => ({ x: t.x + 0.6, z: t.z })),
      ...ROCKS.map((k) => ({ x: k.x + k.size + 0.3, z: k.z })),
      { x: HERO_LOG.x, z: HERO_LOG.z + 0.6 },
    ];
    let checked = 0;
    for (const { x, z } of sites) {
      const p = createHeroLeaves(HERO_MAX, 5);
      setHeroCount(p, HERO_MAX, x, z, 0, flat);
      for (let i = 0; i < p.count; i++) {
        const pd = OBSTACLE_PAD * p.size[i] * LEAF_REACH[p.kind[i]];
        expect(obstacleDepth(p.x[i], p.z[i], pd, hit)).toBeLessThanOrEqual(0);
      }
      // Every leaf left far behind: each is recycled ahead of the head, which faces the obstacle.
      for (let i = 0; i < p.count; i++) p.x[i] = x + 10;
      stepHeroLeaves(p, DT, NONE, 0, x, z, -Math.PI / 2, flat);
      for (let i = 0; i < p.count; i++) {
        const pd = OBSTACLE_PAD * p.size[i] * LEAF_REACH[p.kind[i]];
        expect(obstacleDepth(p.x[i], p.z[i], pd, hit)).toBeLessThanOrEqual(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });
});
