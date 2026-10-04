import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { HeroLeafMesh, heroLeafMatrix } from '../../src/surface/heroLeafMesh';
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
    hero.update(pool, 1);
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
    hero.update(pool, 0);
    hero.mesh.getMatrixAt(0, m);
    expect(p.setFromMatrixPosition(m).x).toBeCloseTo(pool.px[0], 5);
    hero.update(pool, 0.5);
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
    hero.update(pool, 1);
    expect(hero.mesh.visible).toBe(false);
  });
});
