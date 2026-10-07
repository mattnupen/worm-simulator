import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildLeafLitter, type LeafLitter } from '../../src/surface/leafLitterMesh';
import {
  CHUNKS, CHUNK_SIZE, LOD_NEAR, LOD_GAP, chunkIndex, chunkDistance,
} from '../../src/surface/litterChunks';
import { LOD_POINTS } from '../../src/surface/leafLod';
import { buildGroundProps } from '../../src/surface/groundProps';
import { buildFallingLeaves, FALLING_COUNT, FALLING_MAX } from '../../src/surface/fallingLeaves';
import { buildDustMotes, MOTE_COUNT, MOTE_MAX } from '../../src/render/atmosphere';
import { buildWorld } from '../../src/game/world';
import { Crawl } from '../../src/game/crawl';
import { PRESETS } from '../../src/render/graphics';
import { scaledLeafCount } from '../../src/surface/leafScale';
import { sharedLighting } from '../../src/render/paintedMaterial';


/** Index counts drawn by every chunk's full-leaf mesh, and their totals. */
const drawn = (l: LeafLitter) => l.chunks.reduce((a, c) => a + c.near.geometry.drawRange.count, 0);
const total = (l: LeafLitter) => l.chunks.reduce((a, c) => a + c.near.geometry.index!.count, 0);
/** A straight worm along -z from (x, z) (head first), the camera 2.6 behind its head. */
function straightWorm(x: number, z: number): { spine: Float32Array; camX: number; camZ: number } {
  const spine = new Float32Array(16 * 3);
  for (let i = 0; i < 16; i++) {
    spine[i * 3] = x;
    spine[i * 3 + 2] = z - i * 0.22;
  }
  return { spine, camX: x, camZ: z - 2.6 };
}

/** A crawl and the world built for it, with its atmosphere's two effects. */
function makeWorld() {
  const crawl = new Crawl();
  const world = buildWorld(crawl);
  const motes = world.atmosphere.group.getObjectByName('dustMotes') as THREE.Points;
  const falling = world.atmosphere.group.getObjectByName('fallingLeaves') as THREE.Mesh;
  return { crawl, world, motes, falling };
}

describe('scene tiers', () => {


  describe('leaf litter (chunked)', () => {
    let litter: LeafLitter;
    beforeAll(() => { litter = buildLeafLitter(2000); });

    it('is cut into CHUNKS x CHUNKS chunks, each a full and a low-detail mesh', () => {
      expect(litter.chunks).toHaveLength(CHUNKS * CHUNKS);
      expect(litter.group.children).toHaveLength(2 * CHUNKS * CHUNKS);
      expect(litter.chunks.reduce((a, c) => a + c.leaves.length, 0)).toBe(2000);
      const verts = litter.chunks.reduce((a, c) => a + c.near.geometry.getAttribute('position').count, 0);
      expect(verts).toBeLessThanOrEqual(60000);
      expect(total(litter) / 3).toBeLessThanOrEqual(60000);
      for (const c of litter.chunks) {
        // Low detail: 6 triangles a leaf, no petiole.
        expect(c.far.geometry.index!.count).toBe(c.leaves.length * LOD_POINTS * 3);
        // Both carry the drape's attributes.
        for (const m of [c.near, c.far]) {
          const n = m.geometry.getAttribute('position').count;
          expect(m.geometry.getAttribute('aAnchor').count).toBe(n);
          expect(m.geometry.getAttribute('aDip').count).toBe(n);
        }
      }
    });

    it('draws a whole-leaf prefix of any count, in every chunk', () => {
      expect(litter.max).toBe(2000);
      litter.setCount(2000);
      expect(drawn(litter)).toBe(total(litter));
      litter.setCount(1000);
      expect(drawn(litter)).toBeGreaterThan(total(litter) * 0.35);
      expect(drawn(litter)).toBeLessThan(total(litter) * 0.65);
      expect(litter.chunks.reduce((a, c) => a + c.count, 0)).toBe(1000);
      for (const c of litter.chunks) {
        expect(c.near.geometry.drawRange.count % 3).toBe(0);
        expect(c.far.geometry.drawRange.count).toBe(c.count * LOD_POINTS * 3);
      }
      litter.setCount(0);
      expect(drawn(litter)).toBe(0);
      expect(litter.drawn).toBe(0);
      expect(litter.chunks.every((c) => !c.near.visible && !c.far.visible)).toBe(true);
      litter.setCount(99_999);
      expect(drawn(litter)).toBe(total(litter));
      expect(litter.drawn).toBe(2000);
      litter.setCount(1234.7);
      expect(litter.drawn).toBe(1234);
      expect(litter.chunks.reduce((a, c) => a + c.count, 0)).toBe(1234);
      litter.setCount(2000);
    });

    it('shows full leaves near the camera and low-detail ones far away', () => {
      const w = straightWorm(0, 0);
      litter.update(w.camX, w.camZ, w.spine);
      const here = litter.chunks[chunkIndex(0, 0)];
      const corner = litter.chunks[chunkIndex(19, 19)];
      expect(here.near.visible).toBe(true);
      expect(here.far.visible).toBe(false);
      expect(corner.near.visible).toBe(false);
      expect(corner.far.visible).toBe(true);
      for (let c = 0; c < litter.chunks.length; c++) {
        const ch = litter.chunks[c];
        if (chunkDistance(c, w.camX, w.camZ) < LOD_NEAR) expect(ch.near.visible).toBe(true);
        if (chunkDistance(c, w.camX, w.camZ) > LOD_NEAR + 2) expect(ch.far.visible).toBe(true);
      }
    });

    it('uses the reacting material only where leaves can fade, and the three are precompiled variants', () => {
      const { active, plain, far } = litter.materials;
      // The top leaves lie over the buried worm: they fade over it, but never move (V2 spec 8.2).
      expect(active.defines).not.toHaveProperty('DISTURB');
      expect(active.defines).toHaveProperty('OCCLUDE');
      for (const m of [plain, far]) {
        expect(m.defines).not.toHaveProperty('DISTURB');
        expect(m.defines).not.toHaveProperty('OCCLUDE');
      }
      expect(far.defines).toHaveProperty('LOD');
      const w = straightWorm(-3, -3);
      // An empty map (Low, or a still worm before its first step): only the fade's hull reacts.
      litter.update(w.camX, w.camZ, w.spine);
      const here = litter.chunks[chunkIndex(-3, -3)];
      expect(here.near.material).toBe(active);
      expect(litter.chunks[chunkIndex(-15, 15)].near.material).toBe(plain);
      expect(litter.chunks[chunkIndex(15, 15)].far.material).toBe(far);
      // Only the fade's hull reacts: chunks far from the camera and the worm do not.
      expect(litter.chunks[chunkIndex(15, -15)].active).toBe(false);
      expect(litter.chunks[chunkIndex(15, -15)].near.material).toBe(plain);
      // Swapping never makes a new material.
      const used = new Set(litter.chunks.flatMap((c) => [c.near.material, c.far.material]));
      for (const m of used) expect([active, plain, far]).toContain(m);
    });

    it('a reacting chunk always shows its full leaves', () => {
      const w = straightWorm(-3, -3);
      litter.update(w.camX, w.camZ, w.spine);
      for (const ch of litter.chunks) {
        if (!ch.active) continue;
        expect(ch.near.visible).toBe(true);
        expect(ch.far.visible).toBe(false);
      }
    });

    it('keeps all positions finite, with tight bounds per chunk', () => {
      for (const c of litter.chunks) {
        for (const v of c.near.geometry.getAttribute('position').array as Float32Array) expect(Number.isFinite(v)).toBe(true);
        expect(c.near.geometry.boundingSphere!.radius).toBeLessThan(CHUNK_SIZE * 1.3);
        expect(c.far.geometry.boundingSphere!.radius).toBeLessThan(CHUNK_SIZE * 1.3);
      }
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
            if (!ch.near.visible || ch.far.visible || ch.near.material !== world.litter.materials.active) lowDetail++;
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
