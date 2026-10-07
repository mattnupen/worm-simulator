import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { HeroLeafMesh, heroLeafMatrix } from '../../src/surface/heroLeafMesh';
import { easeLit, topShare, TOP_EASE, TOP_FADE, TOP_FROM, TOP_HOLD, TOP_TO } from '../../src/surface/heroTopLight';
import { floorHeight, litterTopHeight } from '../../src/surface/litterDepth';
import {
  createHeroLeaves, setHeroCount, snapshotHeroLeaves, stepHeroLeaves, HERO_GROW_IN, HERO_MAX,
} from '../../src/surface/heroLeaves';

describe('HeroLeafMesh', () => {
  const pool = createHeroLeaves(HERO_MAX, 2);
  const hero = new HeroLeafMesh(pool);
  const g = hero.mesh.geometry;

  it('is one instanced draw of every species, each instance keeping its own', () => {
    expect(hero.mesh.material).toHaveProperty('defines.HERO');
    const kinds = new Set(Array.from(g.getAttribute('aKind').array as Float32Array));
    expect(kinds.size).toBe(5);
    const perInstance = g.getAttribute('aHeroKind') as THREE.InstancedBufferAttribute;
    expect(perInstance.count).toBe(HERO_MAX);
    for (let i = 0; i < HERO_MAX; i++) expect(perInstance.getX(i)).toBe(pool.kind[i]);
    expect(hero.mesh.instanceColor).not.toBeNull();
  });

  it('starts hidden and shows exactly the active leaves', () => {
    expect(hero.mesh.visible).toBe(false);
    setHeroCount(pool, 12, 0, 0, 0, () => 0.05);
    hero.update(pool, 1, 0);
    expect(hero.mesh.count).toBe(12);
    expect(hero.mesh.visible).toBe(true);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 12; i++) {
      hero.mesh.getMatrixAt(i, m);
      expect(m.elements.every(Number.isFinite)).toBe(true);
    }
  });

  it('interpolates between the last two physics steps', () => {
    snapshotHeroLeaves(pool);
    pool.x[0] += 1;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    hero.update(pool, 0, 0);
    hero.mesh.getMatrixAt(0, m);
    expect(p.setFromMatrixPosition(m).x).toBeCloseTo(pool.px[0], 5);
    hero.update(pool, 0.5, 0);
    hero.mesh.getMatrixAt(0, m);
    expect(p.setFromMatrixPosition(m).x).toBeCloseTo(pool.px[0] + 0.5, 5);
  });

  it('pitch tips the far edge (toward pitchDir) down and the near edge up', () => {
    const p = createHeroLeaves(1, 2);
    setHeroCount(p, 1, 0, 0, 0, () => 0);
    p.flip[0] = p.pflip[0] = 0;
    p.pitch[0] = p.ppitch[0] = 0.3;
    for (const dir of [0, 1, -2.5]) {
      p.pitchDir[0] = dir;
      const m = heroLeafMatrix(p, 0, 1, new THREE.Matrix4());
      const centre = new THREE.Vector3().setFromMatrixPosition(m);
      // A point half a leaf out toward pitchDir, and one the other way, in the leaf's own frame.
      const inv = m.clone().invert();
      const far = new THREE.Vector3(Math.sin(dir), 0, Math.cos(dir)).multiplyScalar(0.3).add(centre);
      const local = far.clone().applyMatrix4(inv);
      local.y = 0;
      const farW = local.applyMatrix4(m);
      expect(farW.y).toBeLessThan(centre.y - 0.05);
      const near = new THREE.Vector3(-Math.sin(dir), 0, -Math.cos(dir)).multiplyScalar(0.3).add(centre)
        .applyMatrix4(inv).setY(0).applyMatrix4(m);
      expect(near.y).toBeGreaterThan(centre.y + 0.05);
    }
  });

  it('a leaf that appears grows in from nothing over HERO_GROW_IN, smoothly, and again when recycled', () => {
    const p = createHeroLeaves(1, 2);
    const flat = () => 0.05;
    setHeroCount(p, 1, 0, 0, 0, flat);
    const m = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    const sizeAt = (alpha: number) => {
      heroLeafMatrix(p, 0, alpha, m).decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      return scale.x / p.size[0];
    };
    expect(sizeAt(1)).toBeLessThan(0.02);
    const DT = 1 / 60;
    let last = sizeAt(1);
    const steps = Math.ceil(HERO_GROW_IN / DT);
    expect(HERO_GROW_IN).toBeGreaterThanOrEqual(0.3);
    for (let t = 0; t < steps; t++) {
      snapshotHeroLeaves(p);
      stepHeroLeaves(p, DT, new Float32Array(0), 0, 0, 0, 0, flat);
      for (const alpha of [0.25, 0.5, 1]) {
        // Never shrinking, and never more than a tenth of its size from one quarter step to the next.
        const s = sizeAt(alpha);
        expect(s).toBeGreaterThanOrEqual(last - 1e-9);
        expect(s - last).toBeLessThan(0.1);
        last = s;
      }
      // Halfway through, about half grown (eased in and out).
      if (t === Math.floor(steps / 2) - 1) expect(last).toBeGreaterThan(0.3);
      if (t === Math.floor(steps / 2) - 1) expect(last).toBeLessThan(0.7);
    }
    expect(last).toBeCloseTo(1, 9);
    // Recycled (the head is now far away): small again where it lands.
    snapshotHeroLeaves(p);
    stepHeroLeaves(p, DT, new Float32Array(0), 0, 10, 0, 0, flat);
    expect(p.spawned).toBe(2);
    expect(sizeAt(1)).toBeLessThan(0.02);
  });

  it('hides itself at zero leaves (Low)', () => {
    setHeroCount(pool, 0, 0, 0, 0, () => 0.05);
    hero.update(pool, 1, 0);
    expect(hero.mesh.visible).toBe(false);
  });
});

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
