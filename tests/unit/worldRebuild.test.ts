import { describe, it, expect, afterAll } from 'vitest';
import * as THREE from 'three';
import { buildWorld, disposeForest, type Forest, type World } from '../../src/game/world';
import { Crawl } from '../../src/game/crawl';
import { PRESETS } from '../../src/render/graphics';
import { getLitterTexture, litterTextureData } from '../../src/render/litterTexture';
import { getGroundTexture, groundTextureData } from '../../src/render/groundTexture';
import { disturbReach, scaledLeafCount, stampLimit } from '../../src/surface/leafScale';
import { DEFAULT_SCALE, SCALE_SPECS, setScale } from '../../src/surface/worldScale';
import { LEAF_KINDS } from '../../src/surface/leafLitter';
import { RING_COUNT } from '../../src/surface/distantTrees';

const CAMERA = new THREE.PerspectiveCamera();

/** The forest's distant ring (its one instanced mesh). */
function ring(group: THREE.Object3D): THREE.InstancedMesh {
  const found = group.children.filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh);
  expect(found).toHaveLength(1);
  return found[0];
}

/** Every material the world's current forest draws with. */
function forestMaterials(world: World): Set<THREE.Material> {
  const mats = new Set<THREE.Material>([world.litter.materials.active, world.litter.materials.plain, world.litter.materials.far]);
  const forest = world.scene.children.find((c) => c.name === 'forest')!;
  forest.traverse((o) => { if (o instanceof THREE.Mesh) mats.add(o.material as THREE.Material); });
  return mats;
}

/** Counts dispose events on `targets`. */
function disposals(targets: Iterable<THREE.EventDispatcher<{ dispose: object }>>): { n: number } {
  const c = { n: 0 };
  for (const t of targets) t.addEventListener('dispose', () => { c.n++; });
  return c;
}

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
    // The rest of the forest is True's too: the distant ring has True's (fewer, bigger) trees.
    const newForest = world.scene.children.find((c) => c.name === 'forest')!;
    expect(ring(old.group).count).toBe(Math.min(RING_COUNT, SCALE_SPECS.classic.distantCount));
    expect(ring(newForest).count).toBe(Math.min(RING_COUNT, SCALE_SPECS.true.distantCount));
    expect(ring(newForest).count).not.toBe(ring(old.group).count);
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
    // The distant ring's instance buffers are freed with it.
    const ringFreed = disposals([ring(old.group)]);
    // Nothing of the new forest is touched.
    const newFreed = disposals(forestMaterials(world));
    disposeForest(old);
    expect(disposed).toBe(meshes.length + mats.size);
    expect(ringFreed.n).toBe(1);
    expect(newFreed.n).toBe(0);
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

  it('compileForest lends the litter\'s reacting material to a chunk while it compiles, then puts it back', () => {
    setScale('classic');
    const world = buildWorld(new Crawl());
    world.apply(PRESETS.high);
    const near = world.litter.chunks[0].near;
    const was = near.material;
    expect(was).not.toBe(world.litter.materials.active);
    let seen: THREE.Material | THREE.Material[] | null = null;
    let compiled: THREE.Object3D | null = null;
    world.compileForest({ compile(o) { seen = near.material; compiled = o; return new Set(); } }, CAMERA);
    expect(seen).toBe(world.litter.materials.active);
    expect(compiled).toBe(world.scene.children.find((c) => c.name === 'forest'));
    expect(near.material).toBe(was);
  });

  it('switchForest does the whole switch, in order, exactly as the steps by hand', () => {
    const crawl = (): Crawl => {
      const c = new Crawl();
      c.setHeroCount(scaledLeafCount(PRESETS.high.hero));
      for (let i = 0; i < 60; i++) c.step(1 / 30, { x: 0.3, y: 1 });
      return c;
    };
    setScale('classic');
    const byHandCrawl = crawl();
    const byHand = buildWorld(byHandCrawl);
    byHand.apply(PRESETS.high);
    const oneCrawl = crawl();
    const one = buildWorld(oneCrawl);
    expect(() => one.switchForest({ compile: () => new Set() }, CAMERA)).toThrow(/apply a preset first/);
    one.apply(PRESETS.medium);
    one.apply(PRESETS.high);

    setScale('true');
    const old: Forest = byHand.rebuildForest();
    byHandCrawl.applyScale();
    byHandCrawl.reset(scaledLeafCount(PRESETS.high.hero));
    byHand.apply(PRESETS.high);
    byHand.compileForest({ compile: () => new Set() }, CAMERA);
    disposeForest(old);

    const oldGroup = one.scene.children.find((c) => c.name === 'forest')!;
    const oldFreed = disposals(forestMaterials(one));
    let freedAtCompile = -1;
    let compiled: THREE.Object3D | null = null;
    one.switchForest({ compile(o) { freedAtCompile = oldFreed.n; compiled = o; return new Set(); } }, CAMERA);
    const newGroup = one.scene.children.find((c) => c.name === 'forest')!;
    // The new forest compiled while the old one still held its programs; the old one is freed after.
    expect(compiled).toBe(newGroup);
    expect(freedAtCompile).toBe(0);
    expect(oldFreed.n).toBeGreaterThan(0);
    expect(one.scene.children).not.toContain(oldGroup);
    // The same world and crawl as by hand.
    expect(one.litter.max).toBe(byHand.litter.max);
    expect(one.litter.drawn).toBe(byHand.litter.drawn);
    expect(one.detail.max).toBe(byHand.detail.max);
    expect(one.detail.drawn).toBe(byHand.detail.drawn);
    expect(ring(newGroup).count).toBe(Math.min(RING_COUNT, SCALE_SPECS.true.distantCount));
    expect(oneCrawl.reach).toEqual(byHandCrawl.reach);
    expect(oneCrawl.hero.count).toBe(scaledLeafCount(PRESETS.high.hero, SCALE_SPECS.true));
    expect(oneCrawl.body).toEqual(byHandCrawl.body);
    expect(oneCrawl.cam).toEqual(byHandCrawl.cam);
    expect(oneCrawl.disturbance.data.every((v) => v === 0)).toBe(true);
    for (const k of ['x', 'y', 'z', 'yaw', 'flip', 'size'] as const) {
      expect(Array.from(oneCrawl.hero[k]), k).toEqual(Array.from(byHandCrawl.hero[k]));
    }
  });
});
