import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildWorld, type World } from '../../src/game/world';
import { Crawl, SPACING, WORM_SEGMENTS } from '../../src/game/crawl';
import { PRESETS, type PresetId } from '../../src/render/graphics';
import { scaledLeafCount } from '../../src/surface/leafScale';
import { createBody } from '../../src/worm/body';
import { rocks, ROCK_FOOT } from '../../src/surface/propPlacement';

/**
 * The draw-call budget (visual-quality-brief.md: up to 40 per frame on every preset), counted
 * headlessly: the world is built and synced exactly as the game does each frame, and the draws
 * three r186's WebGLRenderer would issue are counted by its own rules (below). Checked at the
 * spawn, round every rock, and from near each corner looking inward across the whole floor (the
 * worst views measured in the browser with renderer.info.render.calls, which this count matched).
 */
const BUDGET = 40;

const frustum = new THREE.Frustum();
const viewProj = new THREE.Matrix4();

/** Draws one render item issues (renderBufferDirect): none for an empty range or no instances. */
function itemDraws(o: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, group: { start: number; count: number } | null): number {
  let start = g.drawRange.start;
  let end = start + g.drawRange.count;
  if (group) {
    start = Math.max(start, group.start);
    end = Math.min(end, group.start + group.count);
  }
  const pos = g.getAttribute('position');
  if (g.index || pos) {
    start = Math.max(start, 0);
    end = Math.min(end, g.index ? g.index.count : pos.count);
  }
  const count = end - start;
  if (!(count > 0) || count === Infinity) return 0;
  if ((o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).count === 0) return 0;
  const ig = g as THREE.InstancedBufferGeometry & { _maxInstanceCount?: number };
  if (ig.isInstancedBufferGeometry && Math.min(ig.instanceCount, ig._maxInstanceCount ?? Infinity) === 0) return 0;
  // A transparent double-sided material draws its back faces, then its front faces.
  return m.transparent && m.side === THREE.DoubleSide && !m.forceSinglePass ? 2 : 1;
}

/** The draw calls renderer.render(scene, camera) makes: three r186's projectObject, then each item. */
function countDraws(scene: THREE.Scene, camera: THREE.Camera): number {
  scene.updateMatrixWorld();
  camera.updateMatrixWorld();
  frustum.setFromProjectionMatrix(viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  let n = 0;
  scene.traverseVisible((o) => {
    const r = o as THREE.Mesh;
    if (!o.layers.test(camera.layers) || !(r.isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine)) return;
    if (r.frustumCulled && !frustum.intersectsObject(r)) return;
    if (Array.isArray(r.material)) {
      for (const group of r.geometry.groups) {
        const m = r.material[group.materialIndex ?? 0];
        if (m && m.visible) n += itemDraws(o, r.geometry, m, group);
      }
    } else if (r.material.visible) {
      n += itemDraws(o, r.geometry, r.material, null);
    }
  });
  return n;
}

/**
 * Resets the crawl as the game does, but with the worm at (x, z) heading h (0 is +z), straight
 * and still with its camera settled behind it: the spawn, moved (reset's given points, as the
 * worm coming up out of the cut uses them).
 */
function spawnAt(crawl: Crawl, x: number, z: number, h: number): void {
  crawl.reset(crawl.hero.count, createBody(WORM_SEGMENTS, SPACING, { x, y: 0, z }, h), h);
  expect(Math.hypot(crawl.motion.head.x - x, crawl.motion.head.z - z), 'head at the view').toBeLessThan(1e-9);
  expect(crawl.motion.heading).toBe(h);
  expect(crawl.cam.yaw, 'camera yaw').toBeCloseTo(h, 9);
}

/**
 * The spawn; 8 headings round each rock, 2.5 and 6 m from its edge, facing it; and from 16 and
 * 18.5 m out along each diagonal, looking inward and 0.35 rad either side.
 */
const VIEWS: [string, number, number, number][] = [['spawn', 0, 0, 0]];
rocks().forEach((rock, n) => {
  for (const d of [2.5, 6]) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const r = rock.size * ROCK_FOOT + d;
      VIEWS.push([`rock ${n} ${d} ${k}`, rock.x + Math.sin(a) * r, rock.z + Math.cos(a) * r, a + Math.PI]);
    }
  }
});
for (const [name, sx, sz] of [['SW', -1, -1], ['SE', 1, -1], ['NW', -1, 1], ['NE', 1, 1]] as const) {
  for (const d of [16, 18.5]) {
    for (const turn of [-0.35, 0, 0.35]) VIEWS.push([`${name} ${d} ${turn}`, sx * d, sz * d, Math.atan2(-sx, -sz) + turn]);
  }
}

/** The worst views measured after the merge (a corner, and beside a rock), for a wide window. */
const WIDE_VIEWS = new Set(['SW 16 0', 'rock 1 2.5 6']);

describe('draw-call budget', () => {
  let crawl: Crawl;
  let world: World;
  // As main.ts: 60 degrees vertical, the window's aspect (the bench's 1366 x 768; and 21:9).
  const camera = new THREE.PerspectiveCamera(60, 1366 / 768, 0.2, 120);
  const wide = new THREE.PerspectiveCamera(60, 21 / 9, 0.2, 120);
  beforeAll(() => {
    crawl = new Crawl();
    world = buildWorld(crawl);
  });

  /** The most draws over `frames` idle frames at a view, as the game steps and syncs them. */
  function worstFrame(x: number, z: number, h: number, frames: number, cam = camera): number {
    spawnAt(crawl, x, z, h);
    let most = 0;
    for (let f = 0; f < frames; f++) {
      crawl.step(1 / 60, { x: 0, y: 0 });
      world.sync(crawl, 1, f / 60, cam);
      most = Math.max(most, countDraws(world.scene, cam));
    }
    return most;
  }

  for (const id of ['low', 'medium', 'high', 'ultra'] as PresetId[]) {
    it(`${id}: at most ${BUDGET} draws at the spawn, round every rock and from every corner (and wide)`, () => {
      const spec = PRESETS[id];
      // As main.ts applies a preset.
      expect(VIEWS.filter(([name]) => WIDE_VIEWS.has(name))).toHaveLength(WIDE_VIEWS.size);
      world.apply(spec);
      crawl.setReaction(spec.reaction);
      crawl.setHeroCount(scaledLeafCount(spec.hero));
      for (const [name, x, z, h] of VIEWS) {
        expect(worstFrame(x, z, h, 20), name).toBeLessThanOrEqual(BUDGET);
        // Not vacuous: from a corner most of the litter lies ahead, low detail in its one draw.
        if (/^[NS][EW] /.test(name)) expect(world.litter.far.drawn).toBeGreaterThan(world.litter.drawn / 2);
        if (WIDE_VIEWS.has(name)) expect(worstFrame(x, z, h, 20, wide), `${name} at 21:9`).toBeLessThanOrEqual(BUDGET);
      }
    });
  }

  it('counts as the renderer does: a hidden or empty-range mesh draws nothing, a culled one is skipped', () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    mesh.position.set(0, 0, -5);
    scene.add(mesh);
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    expect(countDraws(scene, cam)).toBe(1);
    mesh.geometry.setDrawRange(0, 0);
    expect(countDraws(scene, cam)).toBe(0);
    mesh.geometry.setDrawRange(0, Infinity);
    mesh.position.set(0, 0, 5);
    expect(countDraws(scene, cam)).toBe(0);
    mesh.position.set(0, 0, -5);
    mesh.visible = false;
    expect(countDraws(scene, cam)).toBe(0);
  });
});
