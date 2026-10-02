import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildLeafLitter } from '../../src/surface/leafLitterMesh';
import { buildGroundProps } from '../../src/surface/groundProps';
import { buildFallingLeaves, FALLING_COUNT, FALLING_MAX } from '../../src/surface/fallingLeaves';
import { buildDustMotes, MOTE_COUNT, MOTE_MAX } from '../../src/render/atmosphere';
import { buildWorld } from '../../src/game/world';
import { Crawl } from '../../src/game/crawl';
import { PRESETS } from '../../src/render/graphics';
import { sharedLighting } from '../../src/render/paintedMaterial';

describe('leaf litter (merged)', () => {
  const litter = buildLeafLitter(2000);
  const g = litter.mesh.geometry;
  const full = g.index!.count;

  it('is one mesh with a sane vertex budget', () => {
    expect(g.getAttribute('position').count).toBeLessThanOrEqual(60000);
    expect(full / 3).toBeLessThanOrEqual(60000);
  });
  it('draws a whole-leaf prefix of any count', () => {
    expect(litter.max).toBe(2000);
    litter.setCount(2000);
    expect(g.drawRange.count).toBe(full);
    litter.setCount(1000);
    expect(g.drawRange.count).toBeGreaterThan(full * 0.35);
    expect(g.drawRange.count).toBeLessThan(full * 0.65);
    expect(g.drawRange.count % 3).toBe(0);
    litter.setCount(0);
    expect(g.drawRange.count).toBe(0);
    litter.setCount(99_999);
    expect(g.drawRange.count).toBe(full);
  });
  it('keeps all positions finite', () => {
    for (const v of g.getAttribute('position').array as Float32Array) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('ground props', () => {
  it('keeps the rocks and thins the clutter with density', () => {
    const p = buildGroundProps();
    const g = p.mesh.geometry;
    p.setDensity(1);
    const full = g.drawRange.count;
    expect(full).toBe(g.index!.count);
    p.setDensity(0.5);
    const half = g.drawRange.count;
    p.setDensity(0);
    const rocks = g.drawRange.count;
    expect(rocks).toBeGreaterThan(0);
    expect(half).toBeGreaterThan(rocks);
    expect(half).toBeLessThan(full);
  });
});

describe('falling leaves and dust motes', () => {
  it('falling leaves are one small mesh, animated in the shader, built at Ultra size', () => {
    const f = buildFallingLeaves();
    expect(f.mesh.frustumCulled).toBe(false);
    const g = f.mesh.geometry;
    expect(g.getAttribute('aFall').count).toBe(g.getAttribute('position').count);
    expect(FALLING_COUNT).toBeGreaterThanOrEqual(12);
    expect(FALLING_COUNT).toBeLessThanOrEqual(24);
    expect(FALLING_MAX).toBe(Math.round(FALLING_COUNT * 1.5));
    f.setCount(FALLING_MAX);
    const all = g.drawRange.count;
    expect(all).toBe(g.index!.count);
    f.setCount(FALLING_COUNT);
    expect(g.drawRange.count).toBeLessThan(all);
    expect(g.drawRange.count).toBeGreaterThan(0);
  });
  it('dust motes are built at Ultra size', () => {
    expect(MOTE_MAX).toBe(Math.round(MOTE_COUNT * 1.5));
    expect(buildDustMotes().geometry.getAttribute('position').count).toBe(MOTE_MAX);
  });
});

describe('world.apply', () => {
  const crawl = new Crawl();
  const world = buildWorld(crawl);
  const litterG = world.litter.mesh.geometry;
  const motes = world.atmosphere.group.getObjectByName('dustMotes') as THREE.Points;
  const falling = world.atmosphere.group.getObjectByName('fallingLeaves') as THREE.Mesh;

  it('builds the litter at Ultra size, and the detail layer only once a preset draws it', () => {
    expect(world.litter.max).toBe(PRESETS.ultra.litter);
    expect(world.detail.max).toBe(PRESETS.ultra.detail);
    expect(world.detail.built).toBeNull();
    world.apply(PRESETS.low);
    expect(world.detail.built).toBeNull();
  });

  it('trims counts and switches effects and rim per preset, live', () => {
    world.apply(PRESETS.ultra);
    const detail = world.detail.built!;
    expect(detail.mesh.visible).toBe(true);
    expect(detail.mesh.geometry.drawRange.count).toBe(detail.mesh.geometry.index!.count);
    const ultraLeaves = litterG.drawRange.count;
    expect(ultraLeaves).toBe(litterG.index!.count);
    expect(world.atmosphere.group.visible).toBe(true);
    expect(motes.geometry.drawRange.count).toBe(MOTE_MAX);
    const ultraFalling = falling.geometry.drawRange.count;
    expect(sharedLighting.uRim.value).toBe(1);

    world.apply(PRESETS.high);
    expect(litterG.drawRange.count).toBeLessThan(ultraLeaves);
    expect(motes.geometry.drawRange.count).toBe(MOTE_COUNT);
    expect(falling.geometry.drawRange.count).toBeLessThan(ultraFalling);

    world.apply(PRESETS.low);
    expect(detail.mesh.visible).toBe(false);
    expect(world.atmosphere.group.visible).toBe(false);
    expect(sharedLighting.uRim.value).toBe(0);
    expect(litterG.drawRange.count).toBeLessThan(ultraLeaves / 4);
  });

  it('draws each preset\'s hero leaves as the instance count, live (Low none)', () => {
    const camera = new THREE.PerspectiveCamera();
    const mesh = world.hero.mesh;
    const matrices = mesh.instanceMatrix;
    for (const id of ['ultra', 'low', 'medium', 'high', 'ultra', 'low'] as const) {
      // As main.ts applies a preset: the world, then the crawl's pool; the next frame shows it.
      world.apply(PRESETS[id]);
      crawl.setHeroCount(PRESETS[id].hero);
      world.sync(crawl, 1, 0, camera);
      expect(mesh.count).toBe(PRESETS[id].hero);
      expect(mesh.visible).toBe(PRESETS[id].hero > 0);
      expect(mesh.instanceMatrix).toBe(matrices);
    }
    expect([PRESETS.low.hero, PRESETS.medium.hero, PRESETS.high.hero, PRESETS.ultra.hero]).toEqual([0, 12, 24, 32]);
  });

  it('switching presets does not touch the geometry buffers', () => {
    const pos = litterG.getAttribute('position');
    world.apply(PRESETS.medium);
    world.apply(PRESETS.ultra);
    expect(litterG.getAttribute('position')).toBe(pos);
  });
});
