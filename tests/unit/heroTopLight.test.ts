import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { HeroLeafMesh, heroLeafMatrix } from '../../src/surface/heroLeafMesh';
import { easeLit, topShare, TOP_EASE, TOP_FADE, TOP_FROM, TOP_HOLD, TOP_TO } from '../../src/surface/heroTopLight';
import { floorHeight, litterTopHeight } from '../../src/surface/litterDepth';
import { createHeroLeaves, setHeroCount, snapshotHeroLeaves } from '../../src/surface/heroLeaves';

describe('a hero leaf heaved up through the top of the litter brightens to a top leaf (V2 spec 8.2)', () => {
  it('topShare: 0 well under the top, 1 well over it, smooth between', () => {
    expect(topShare(TOP_FROM - 0.2)).toBe(0);
    expect(topShare(TOP_FROM)).toBe(0);
    expect(topShare(TOP_TO)).toBe(1);
    expect(topShare(TOP_TO + 1)).toBe(1);
    expect(topShare((TOP_FROM + TOP_TO) / 2)).toBeCloseTo(0.5, 9);
    for (let o = TOP_FROM; o < TOP_TO; o += 0.01) expect(topShare(o + 0.01)).toBeGreaterThanOrEqual(topShare(o));
  });

  it('a leaf on the floor stays dim, one high over the top turns bright, easing with no jump', () => {
    const pool = createHeroLeaves(2, 3);
    const hero = new HeroLeafMesh(pool);
    setHeroCount(pool, 2, 0, 0, 0, () => 0.05);
    // Leaf 0 lies on the floor (well under the top: the litter is 0.45 or more deep there); leaf
    // 1 is held 1 over the top. Grown in, flat, still.
    for (let i = 0; i < 2; i++) {
      pool.x[i] = 3 + i * 0.5;
      pool.z[i] = 2;
      pool.y[i] = i === 0 ? floorHeight(3, 2) : litterTopHeight(3.5, 2) + 1;
      pool.flip[i] = pool.pitch[i] = pool.lift[i] = 0;
      pool.grow[i] = 1;
    }
    snapshotHeroLeaves(pool);
    const colour = hero.mesh.instanceColor!;
    const dim = [colour.getX(0), colour.getY(0), colour.getZ(0)];
    const frame = 1 / 30;
    let worst = 0;
    let prev = hero.lit[1];
    let brightAt = Infinity;
    for (let f = 0; f <= 30; f++) {
      colour.needsUpdate = false;
      hero.update(pool, 1, f * frame);
      worst = Math.max(worst, Math.abs(hero.lit[1] - prev));
      prev = hero.lit[1];
      if (hero.lit[1] === 1) brightAt = Math.min(brightAt, f * frame);
    }
    // Heaved up, it turns bright almost at once.
    expect(brightAt).toBeLessThanOrEqual(0.2);
    expect(hero.lit[0]).toBe(0);
    expect([colour.getX(0), colour.getY(0), colour.getZ(0)]).toEqual(dim);
    expect(hero.lit[1]).toBe(1);
    // A top leaf's colour: grey (the V1 tint), brighter than the pocket's warm dim one.
    expect(colour.getX(1)).toBeCloseTo(colour.getZ(1), 6);
    expect(colour.getY(1)).toBeGreaterThan(colour.getY(0) * 1.4);
    // Eased: no frame moves it by more than a frame's share of TOP_EASE.
    expect(worst).toBeLessThanOrEqual(frame / TOP_EASE + 1e-6);
    expect(worst).toBeGreaterThan(0);
    // Nothing changed: the colours are not re-uploaded.
    colour.needsUpdate = false;
    const version = colour.version;
    hero.update(pool, 1, 31 * frame);
    expect(colour.version).toBe(version);
    // Back on the floor, paused (the clock stands still): nothing changes.
    pool.y[1] = pool.py[1] = floorHeight(3.5, 2);
    hero.update(pool, 1, 31 * frame);
    expect(hero.lit[1]).toBe(1);
    // Then it stays bright for TOP_HOLD, and dims over TOP_FADE, a frame's share at a time.
    let f = 31;
    for (let k = 1; k < Math.round(TOP_HOLD / frame); k++) {
      hero.update(pool, 1, ++f * frame);
      expect(hero.lit[1]).toBe(1);
    }
    for (let k = 0; k < 4; k++) hero.update(pool, 1, ++f * frame);
    expect(hero.lit[1]).toBeLessThan(1);
    expect(hero.lit[1]).toBeGreaterThanOrEqual(1 - 4 * frame / TOP_FADE - 1e-6);
    for (let k = 0; k < (TOP_FADE / frame) + 2; k++) hero.update(pool, 1, ++f * frame);
    expect(hero.lit[1]).toBe(0);
  });

  it('a leaf wholly under the top never brightens, wherever it lies', () => {
    expect(topShare(-0.001)).toBe(0);
    expect(TOP_FROM).toBe(0);
  });

  it('a leaf tilted or turned over, wholly under the top, stays dim (the box over its centre never reads it as out)', () => {
    const pool = createHeroLeaves(4, 5);
    const hero = new HeroLeafMesh(pool);
    setHeroCount(pool, 4, 0, 0, 0, () => 0.05);
    const g = hero.mesh.geometry;
    const pos = g.getAttribute('position');
    const kindA = g.getAttribute('aKind');
    const m = new THREE.Matrix4();
    const v = new THREE.Vector3();
    // In the deepest windblown pile (litter about 1.2 deep): flat, tilted, turned over, and both.
    const poses = [[0, 0], [0, 0.35], [Math.PI, 0], [Math.PI, 0.35]];
    for (let i = 0; i < 4; i++) {
      pool.x[i] = 2.2 + (i - 1.5) * 0.15;
      pool.z[i] = 6.5;
      pool.y[i] = floorHeight(pool.x[i], pool.z[i]);
      pool.flip[i] = poses[i][0];
      pool.pitch[i] = poses[i][1];
      pool.pitchDir[i] = 0.7 * i;
      pool.lift[i] = 0;
      pool.grow[i] = 1;
    }
    snapshotHeroLeaves(pool);
    for (let f = 0; f <= 30; f++) hero.update(pool, 1, f / 30);
    for (let i = 0; i < 4; i++) {
      // Every vertex of the leaf really is under the top.
      heroLeafMatrix(pool, i, 1, m);
      let over = -Infinity;
      for (let k = 0; k < pos.count; k++) {
        if (kindA.getX(k) !== pool.kind[i]) continue;
        v.fromBufferAttribute(pos, k).applyMatrix4(m);
        over = Math.max(over, v.y - litterTopHeight(v.x, v.z));
      }
      expect(over, `leaf ${i}`).toBeLessThan(-0.05);
      expect(hero.lit[i], `leaf ${i}`).toBe(0);
    }
  });

  it('a recycled slot starts dim: its new leaf does not inherit the old one\'s brightness', () => {
    const pool = createHeroLeaves(1, 3);
    const hero = new HeroLeafMesh(pool);
    setHeroCount(pool, 1, 0, 0, 0, () => 0.05);
    pool.x[0] = 3;
    pool.z[0] = 2;
    pool.y[0] = litterTopHeight(3, 2) + 1;
    pool.flip[0] = pool.pitch[0] = pool.lift[0] = 0;
    pool.grow[0] = 1;
    snapshotHeroLeaves(pool);
    for (let f = 0; f <= 30; f++) hero.update(pool, 1, f / 30);
    expect(hero.lit[0]).toBe(1);
    // Recycled: a new leaf appears on the floor, growing in from nothing (heroSpawn's respawn).
    pool.y[0] = pool.py[0] = floorHeight(3, 2);
    pool.grow[0] = pool.pgrow[0] = 0;
    const colour = hero.mesh.instanceColor!;
    colour.needsUpdate = false;
    const version = colour.version;
    hero.update(pool, 1, 31 / 30);
    expect(hero.lit[0]).toBe(0);
    expect(colour.version).toBeGreaterThan(version);
  });
});

/**
 * Swings of `lit` per second (turning back by 0.1 or more from its last peak or trough), with its target driven by a wave of `hz`: high (1) for the first half of
 * each period, at `under` (a leaf rocked back under the band) for the rest. 30 fps for 10 s.
 */
function swingsPerSecond(hz: number, under = 0): number {
  return swings(1 / (2 * hz), 1 / (2 * hz), under);
}

/** As swingsPerSecond, the target high for `high` s, then at `under` for `low` s, over and over. */
function swings(high: number, low: number, under = 0): number {
  const lit = new Float32Array(1);
  const held = new Float32Array(1);
  const frame = 1 / 30;
  const seconds = 10;
  // It starts at 0, so it can only rise first.
  let ext = 0;
  let dir = 1;
  let count = 0;
  for (let f = 1; f <= seconds * 30; f++) {
    const t = f * frame;
    easeLit(lit, held, 0, t % (high + low) < high ? 1 : under, frame);
    const v = lit[0];
    if (dir > 0 ? v > ext : v < ext) ext = v;
    else if (Math.abs(v - ext) >= 0.1) {
      count++;
      dir = -dir;
      ext = v;
    }
  }
  return count / seconds;
}

describe('a hero leaf rocked across the top of the litter never flashes (parent spec 7: 3 a second at most)', () => {
  for (const hz of [6, 3]) {
    it(`a ${hz} Hz rocking: fewer than 3 swings of lit a second`, () => {
      expect(swingsPerSecond(hz)).toBeLessThan(3);
      expect(swingsPerSecond(hz, 0.4)).toBeLessThan(3);
    });
  }

  it('nor does any other rhythm of rising through and sinking back under the top', () => {
    let worst = 0;
    for (let high = 1 / 30; high <= 1; high += 1 / 60) {
      for (let low = 1 / 30; low <= 2; low += 1 / 60) worst = Math.max(worst, swings(high, low));
    }
    expect(worst).toBeLessThan(3);
  });
});
