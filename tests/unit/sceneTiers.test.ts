import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { LOD_NEAR, LOD_GAP, chunkDistance } from '../../src/surface/litterChunks';
import { farLeaves } from './farLeaves';
import { buildGroundProps } from '../../src/surface/groundProps';
import { buildFallingLeaves, FALLING_COUNT, FALLING_MAX } from '../../src/surface/fallingLeaves';
import { buildDustMotes, MOTE_COUNT, MOTE_MAX } from '../../src/render/atmosphere';
import { buildWorld } from '../../src/game/world';
import { Crawl } from '../../src/game/crawl';
import { PRESETS } from '../../src/render/graphics';
import { scaledLeafCount } from '../../src/surface/leafScale';
import { sharedLighting } from '../../src/render/paintedMaterial';
import type { LeafLitter } from '../../src/surface/leafLitterMesh';

/** Index counts drawn by every chunk's full-leaf mesh, and their totals. */
const drawn = (l: LeafLitter) => l.chunks.reduce((a, c) => a + c.near.geometry.drawRange.count, 0);
const total = (l: LeafLitter) => l.chunks.reduce((a, c) => a + c.near.geometry.index!.count, 0);
/** A crawl and the world built for it, with its atmosphere's two effects. */
function makeWorld() {
  const crawl = new Crawl();
  const world = buildWorld(crawl);
  const motes = world.atmosphere.group.getObjectByName('dustMotes') as THREE.Points;
  const falling = world.atmosphere.group.getObjectByName('fallingLeaves') as THREE.Mesh;
  return { crawl, world, motes, falling };
}

describe('scene tiers', () => {
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
    let crawl: Crawl;
    let world: ReturnType<typeof buildWorld>;
    beforeAll(() => { ({ crawl, world } = makeWorld()); });

    it('draws more detail leaves at each step up from Medium (Low none)', () => {
      world.apply(PRESETS.ultra); // builds the detail layer, if no test has yet
      const counts = (['low', 'medium', 'high', 'ultra'] as const).map((id) => {
        world.apply(PRESETS[id]);
        const mesh = world.detail.built!.mesh;
        return { drawn: world.detail.drawn, indices: mesh.visible ? mesh.geometry.drawRange.count : 0 };
      });
      expect(counts[0]).toEqual({ drawn: 0, indices: 0 });
      for (let k = 1; k < counts.length; k++) {
        expect(counts[k].drawn).toBeGreaterThan(counts[k - 1].drawn);
        expect(counts[k].indices).toBeGreaterThan(counts[k - 1].indices);
      }
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

    it('through a long crawl, every reacting litter chunk shows full leaves and is within LOD_NEAR + LOD_GAP anyway', () => {
      world.apply(PRESETS.high);
      const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.2, 200);
      // Straight, gentle and tight turns both ways, a U-turn: the trail curls round the map.
      const course: [number, number, number][] = [[0, 1, 240], [0.4, 1, 240], [1, 1, 420], [-1, 1, 420], [1, 0.2, 120], [0, 1, 240]];
      let frames = 0;
      let reacting = 0;
      let lowDetail = 0;
      let farthest = 0;
      for (const [x, y, n] of course) {
        for (let i = 0; i < n; i++) {
          crawl.step(1 / 60, { x, y });
          world.sync(crawl, 1, frames / 60, camera);
          frames++;
          world.litter.chunks.forEach((ch, c) => {
            if (!ch.active) return;
            reacting++;
            if (!ch.near.visible || farLeaves(world.litter, c) > 0 || ch.near.material !== world.litter.materials.active) lowDetail++;
            farthest = Math.max(farthest, chunkDistance(c, camera.position.x, camera.position.z));
          });
        }
      }
      expect(reacting).toBeGreaterThan(frames);
      expect(lowDetail).toBe(0);
      // Not only by the update's rule: the reacting chunks lie inside the full-leaf ring and its
      // hysteresis band (a camera pulled in by a prop stands nearer the head, farther from the trail).
      expect(farthest).toBeLessThan(LOD_NEAR + LOD_GAP);
    });

    it('switching presets does not touch the geometry buffers', () => {
      const g = world.litter.chunks[0].near.geometry;
      const pos = g.getAttribute('position');
      world.apply(PRESETS.medium);
      world.apply(PRESETS.ultra);
      expect(g.getAttribute('position')).toBe(pos);
    });
  });
});

// The preset counts are at base leaf size (Step 1a); scaledLeafCount gives real size's.
describe('world.apply preset counts', () => {
  let world: ReturnType<typeof buildWorld>;
  let motes: THREE.Points;
  let falling: THREE.Mesh;
  beforeAll(() => {
    ({ world, motes, falling } = makeWorld());
  });

  it('builds the litter at Ultra size, and the detail layer only once a preset draws it', () => {
    expect(world.litter.max).toBe(scaledLeafCount(PRESETS.ultra.litter));
    expect(world.detail.max).toBe(scaledLeafCount(PRESETS.ultra.detail));
    expect(world.detail.built).toBeNull();
    world.apply(PRESETS.low);
    expect(world.detail.built).toBeNull();
  });

  it('trims counts and switches effects and rim per preset, live', () => {
    world.apply(PRESETS.ultra);
    const detail = world.detail.built!;
    expect(detail.mesh.visible).toBe(true);
    expect(detail.mesh.geometry.drawRange.count).toBe(detail.mesh.geometry.index!.count);
    const ultraLeaves = drawn(world.litter);
    expect(ultraLeaves).toBe(total(world.litter));
    expect(world.atmosphere.group.visible).toBe(true);
    expect(motes.geometry.drawRange.count).toBe(MOTE_MAX);
    const ultraFalling = falling.geometry.drawRange.count;
    expect(sharedLighting.uRim.value).toBe(1);

    world.apply(PRESETS.high);
    // Every preset draws the same litter (Task 23): they differ in their detail leaves.
    expect(world.litter.drawn).toBe(scaledLeafCount(PRESETS.high.litter));
    expect(drawn(world.litter)).toBe(ultraLeaves);
    expect(detail.mesh.geometry.drawRange.count).toBeLessThan(detail.mesh.geometry.index!.count);
    expect(motes.geometry.drawRange.count).toBe(MOTE_COUNT);
    expect(falling.geometry.drawRange.count).toBeLessThan(ultraFalling);

    world.apply(PRESETS.low);
    expect(detail.mesh.visible).toBe(false);
    expect(world.atmosphere.group.visible).toBe(false);
    expect(sharedLighting.uRim.value).toBe(0);
    expect(world.litter.drawn).toBe(scaledLeafCount(PRESETS.low.litter));
    expect(drawn(world.litter)).toBe(ultraLeaves);
  });

  it('reports the leaves it draws for each preset (Low: litter only, no detail)', () => {
    for (const id of ['low', 'medium', 'high', 'ultra', 'low'] as const) {
      world.apply(PRESETS[id]);
      expect(world.litter.drawn, `${id} litter`).toBe(scaledLeafCount(PRESETS[id].litter));
      expect(world.detail.drawn, `${id} detail`).toBe(scaledLeafCount(PRESETS[id].detail));
    }
    expect(PRESETS.low).toMatchObject({ litter: 1500, detail: 0 });
  });
});
