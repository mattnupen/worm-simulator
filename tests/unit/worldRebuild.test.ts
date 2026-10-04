import { describe, it, expect, afterAll } from 'vitest';
import * as THREE from 'three';
import { buildWorld, disposeForest } from '../../src/game/world';
import { Crawl } from '../../src/game/crawl';
import { PRESETS } from '../../src/render/graphics';
import { getLitterTexture, litterTextureData } from '../../src/render/litterTexture';
import { getGroundTexture, groundTextureData } from '../../src/render/groundTexture';
import { disturbReach, scaledLeafCount, stampLimit } from '../../src/surface/leafScale';
import { DEFAULT_SCALE, SCALE_SPECS, setScale } from '../../src/surface/worldScale';
import { LEAF_KINDS } from '../../src/surface/leafLitter';

afterAll(() => { setScale(DEFAULT_SCALE); });

describe('switching the world scale rebuilds the forest in place', () => {
  it('swaps the forest, keeps the rest, and the old one can be freed', () => {
    setScale('classic');
    const crawl = new Crawl();
    const world = buildWorld(crawl);
    world.apply(PRESETS.high);
    const keep = [world.worm.group, world.hero.mesh, world.nearClutter.group, world.atmosphere.group];
    const litterTex = getLitterTexture();
    const groundTex = getGroundTexture();
    const before = world.litter;
    const detailBefore = world.detail;
    expect(before.max).toBe(PRESETS.ultra.litter);

    setScale('true');
    const old = world.rebuildForest();
    world.apply(PRESETS.high);
    expect(old.litter).toBe(before);
    expect(old.detail).toBe(detailBefore);
    expect(world.scene.children).not.toContain(old.group);
    expect(world.scene.children.filter((c) => c.name === 'forest')).toHaveLength(1);
    for (const o of keep) expect(world.scene.children).toContain(o);
    // The new forest is the mode's: fewer, bigger leaves; the detail layer was showing, so it is built.
    expect(world.litter).not.toBe(before);
    expect(world.litter.max).toBe(scaledLeafCount(PRESETS.ultra.litter, SCALE_SPECS.true));
    expect(world.litter.drawn).toBe(scaledLeafCount(PRESETS.high.litter, SCALE_SPECS.true));
    // A new detail layer, its count and its leaf sizes both from True.
    expect(world.detail).not.toBe(detailBefore);
    expect(world.detail.max).toBe(scaledLeafCount(PRESETS.ultra.detail, SCALE_SPECS.true));
    expect(world.detail.built).not.toBeNull();
    expect(world.detail.drawn).toBe(scaledLeafCount(PRESETS.high.detail, SCALE_SPECS.true));
    const radius = (d: typeof world.detail): number => {
      const a = d.built!.mesh.geometry.getAttribute('aDetail');
      let r = 0;
      for (let i = 0; i < a.count; i++) r = Math.max(r, a.getW(i));
      return r;
    };
    // Every True species is at least 1.43 times its Classic size.
    expect(radius(world.detail)).toBeGreaterThan(1.4 * radius(detailBefore));
    // The baked textures are the same objects, re-baked for True.
    expect(getLitterTexture()).toBe(litterTex);
    expect(getGroundTexture()).toBe(groundTex);
    expect(Array.from(litterTex.image.data as Uint8Array)).toEqual(Array.from(litterTextureData()));
    expect(Array.from(groundTex.image.data as Float32Array)).toEqual(Array.from(groundTextureData()));

    // Freeing the old forest disposes every geometry and material it drew with.
    let disposed = 0;
    const meshes: THREE.Mesh[] = [];
    old.group.traverse((o) => { if (o instanceof THREE.Mesh) meshes.push(o); });
    const mats = new Set<THREE.Material>([old.litter.materials.active, old.litter.materials.plain, old.litter.materials.far]);
    for (const m of meshes) {
      m.geometry.addEventListener('dispose', () => { disposed++; });
      mats.add(m.material as THREE.Material);
    }
    for (const m of mats) m.addEventListener('dispose', () => { disposed++; });
    disposeForest(old);
    expect(disposed).toBe(meshes.length + mats.size);
    // The baked textures are shared with the new forest: never freed with the old one.
    let texFreed = 0;
    litterTex.addEventListener('dispose', () => { texFreed++; });
    groundTex.addEventListener('dispose', () => { texFreed++; });
    disposeForest(world.rebuildForest());
    expect(texFreed).toBe(0);
  });

  it('the crawl takes the mode\'s hero leaf sizes and disturbance reach, and starts again clean', () => {
    setScale('classic');
    const crawl = new Crawl();
    const reach = crawl.reach;
    crawl.setHeroCount(scaledLeafCount(PRESETS.high.hero));
    const classic = Array.from(crawl.hero.size);
    // Mid-crawl: a trail in the map, the camera wherever it got to.
    for (let i = 0; i < 120; i++) crawl.step(1 / 30, { x: 0.4, y: 1 });
    expect(crawl.disturbance.data.some((v) => v > 0)).toBe(true);

    setScale('true');
    crawl.applyScale();
    const heroes = scaledLeafCount(PRESETS.high.hero);
    crawl.reset(heroes);
    for (let i = 0; i < classic.length; i++) {
      const kind = LEAF_KINDS[crawl.hero.kind[i]];
      expect(crawl.hero.size[i]).toBeCloseTo(classic[i] * SCALE_SPECS.true.leaf[kind], 5);
    }
    // The reach is refreshed in place (the renderer holds the same object).
    expect(crawl.reach).toBe(reach);
    expect(crawl.reach).toEqual(disturbReach(SCALE_SPECS.true));
    expect(crawl.reach.stamp).toBeGreaterThan(stampLimit(SCALE_SPECS.classic));
    // Nothing of the Classic trail is left; the worm and its camera are at the spawn.
    expect(crawl.disturbance.data.every((v) => v === 0)).toBe(true);
    expect(crawl.disturbed).toBe(true);
    expect(crawl.motion.head).toMatchObject({ x: 0, z: 0 });
    expect(crawl.cameraReach).toBe(1);
    // Exactly as a crawl built in True with the same hero count.
    expect(crawl.hero.count).toBe(heroes);
    const fresh = new Crawl();
    fresh.setHeroCount(heroes);
    expect(crawl.cam).toEqual(fresh.cam);
    expect(crawl.body).toEqual(fresh.body);
    for (const k of ['x', 'y', 'z', 'yaw', 'flip', 'size'] as const) {
      expect(Array.from(crawl.hero[k]), k).toEqual(Array.from(fresh.hero[k]));
    }
  });
});
