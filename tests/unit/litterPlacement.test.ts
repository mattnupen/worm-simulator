import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { placeLeaves, wetnessLayer } from '../../src/surface/leafLitter';
import { leafTint } from '../../src/surface/leafPalette';
import { mulberry32 } from '../../src/core/random';
import * as THREE from 'three';
import { buildLeafLitter, type LeafLitter } from '../../src/surface/leafLitterMesh';
import { obstacleDepth } from '../../src/surface/obstacles';
import { scaledLeafCount } from '../../src/surface/leafScale';
import { PRESETS } from '../../src/render/graphics';
import { buildTerrainGeometry, meshGroundHeight, meshGroundNormal } from '../../src/surface/terrainMesh';
import { groundHeight } from '../../src/surface/litterDepth';
import { WORLD_HALF } from '../../src/surface/terrain';
import { PILES, litterDepth, litterMound } from '../../src/surface/litterDepth';
import { terrainHeight } from '../../src/surface/terrain';
import { placeClutter } from '../../src/surface/propPlacement';
import { writeClutterItem } from '../../src/surface/groundProps';
import { CLUTTER_SINK } from '../../src/surface/propGeometry';
import { MeshWriter } from '../../src/surface/meshWriter';
import { clutterGrow } from '../../src/surface/propPlacement';
import { DEFAULT_SCALE, SCALE_MODES, setScale } from '../../src/surface/worldScale';

afterAll(() => { setScale(DEFAULT_SCALE); });

describe('placeLeaves with a depth field', () => {
  const field = (x: number) => (x > 0 ? 0.2 : 0.02);

  it('puts many more leaves where the litter is deeper', () => {
    const leaves = placeLeaves(3000, 10, 1, field);
    expect(leaves).toHaveLength(3000);
    const deep = leaves.filter((l) => l.x > 0).length;
    expect(deep).toBeGreaterThan((3000 - deep) * 2);
  });

  it('rests leaves on the mound, in a thin loose layer', () => {
    for (const l of placeLeaves(500, 10, 2, field)) {
      expect(l.mound).toBeCloseTo(litterMound(field(l.x)), 12);
      expect(l.y).toBeGreaterThanOrEqual(0);
      expect(l.y).toBeLessThan(0.05);
    }
  });

  it('is deterministic, and any prefix is the same leaves', () => {
    expect(placeLeaves(50, 10, 3, field)).toEqual(placeLeaves(50, 10, 3, field));
    expect(placeLeaves(20, 10, 3, field)).toEqual(placeLeaves(50, 10, 3, field).slice(0, 20));
  });
});

describe('litter and ground on a pile', () => {
  const pile = PILES[0];

  it('the ground mesh rises by the mound over a pile', () => {
    const g = buildTerrainGeometry();
    const pos = g.getAttribute('position').array as Float32Array;
    let best = 0;
    let bestD = Infinity;
    for (let v = 0; v < pos.length; v += 3) {
      const d = Math.hypot(pos[v] - pile.x, pos[v + 2] - pile.z);
      if (d < bestD) { bestD = d; best = v; }
    }
    const x = pos[best];
    const z = pos[best + 2];
    expect(pos[best + 1]).toBeCloseTo(terrainHeight(x, z) + litterMound(litterDepth(x, z)), 5);
    expect(pos[best + 1] - terrainHeight(x, z)).toBeGreaterThan(0.15);
  });
});

describe.each(SCALE_MODES)('%s: litter on the rendered ground', (mode) => {
  let litter: LeafLitter;
  beforeAll(() => {
    setScale(mode);
    litter = buildLeafLitter(scaledLeafCount(PRESETS.ultra.litter));
  });
  const hit = { nx: 0, nz: 0 };

  // Chunk geometry is relative to the chunk's centre (the mesh position).
  const eachVertex = (mesh: THREE.Mesh, f: (x: number, y: number, z: number) => void) => {
    const pos = mesh.geometry.getAttribute('position').array as Float32Array;
    for (let v = 0; v < pos.length; v += 3) f(pos[v] + mesh.position.x, pos[v + 1], pos[v + 2] + mesh.position.z);
  };

  it('no litter vertex on open ground is below the rendered ground (beyond 3 mm), full or low detail', () => {
    let open = 0;
    let worst = 0;
    for (const c of litter.chunks) {
      for (const mesh of [c.near, c.far]) {
        eachVertex(mesh, (x, y, z) => {
          // Under a trunk, rock or the log the prop hides it.
          if (obstacleDepth(x, z, 0, hit) > 0) return;
          open++;
          worst = Math.max(worst, meshGroundHeight(x, z) - y);
        });
      }
    }
    expect(open).toBeGreaterThan(4000);
    expect(worst).toBeLessThanOrEqual(0.003);
  });

  it('leaves near a pile centre lie on top of it', () => {
    const pile = PILES[0];
    let near = 0;
    for (const c of litter.chunks) {
      eachVertex(c.near, (x, y, z) => {
        if (Math.hypot(x - pile.x, z - pile.z) > pile.r * 0.4) return;
        near++;
        expect(y - terrainHeight(x, z)).toBeGreaterThan(0.12);
      });
    }
    expect(near).toBeGreaterThan(10);
  });
});

describe('clutter on the litter mound', () => {
  const mound = (x: number, z: number) => meshGroundHeight(x, z);

  it('some clutter really stands where the mound is deep enough to bury it', () => {
    setScale('classic');
    const items = placeClutter(150);
    expect(items.filter((c) => mound(c.x, c.z) - terrainHeight(c.x, c.z) > 0.05).length).toBeGreaterThan(0);
  });

  it.each(SCALE_MODES)('%s: sets every item on the rendered ground: its base is never below the mesh surface', (mode) => {
    setScale(mode);
    for (const c of placeClutter(150)) {
      const w = new MeshWriter('aProp', 4);
      writeClutterItem(w, c, () => 0.5);
      let low = Infinity;
      for (let v = 0; v < w.vertexCount; v++) low = Math.min(low, w.pos[v * 3 + 1]);
      const floor = mound(c.x, c.z);
      if (c.kind === 'mushrooms') {
        // Each mushroom stands on the ground under it; across a cluster the mound slopes a little
        // (the cluster spreads with the mode's mushroom size).
        expect(low).toBeGreaterThanOrEqual(floor - 0.06 * clutterGrow('mushrooms'));
      } else {
        // Sedge and fern roots sit CLUTTER_SINK below the ground at the item's centre.
        expect(low + CLUTTER_SINK).toBeGreaterThanOrEqual(floor - 1e-6);
      }
    }
  });
});

describe('leaf wetness', () => {
  it('matches the Step 0 distribution: about 35% damp, mean dampness about 0.12', () => {
    const leaves = placeLeaves(8000, WORLD_HALF, 4, litterDepth);
    const rng = mulberry32(77);
    const [a, b, c] = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
    let damp = 0;
    let sum = 0;
    for (const l of leaves) {
      const w = leafTint(l.kind, wetnessLayer(l), rng, a, b, c);
      if (w > 0) damp++;
      sum += w;
    }
    expect(damp / leaves.length).toBeGreaterThan(0.3);
    expect(damp / leaves.length).toBeLessThan(0.4);
    expect(sum / leaves.length).toBeGreaterThan(0.1);
    expect(sum / leaves.length).toBeLessThan(0.14);
  });
});

describe('meshGroundHeight', () => {
  const geo = buildTerrainGeometry();
  const pos = geo.getAttribute('position').array as Float32Array;
  const index = geo.getIndex()!.array as Uint32Array;

  it('equals the vertex heights at grid points', () => {
    for (let v = 0; v < pos.length; v += 3 * 97) {
      expect(meshGroundHeight(pos[v], pos[v + 2])).toBeCloseTo(pos[v + 1], 5);
    }
  });

  it('meshGroundNormal is the unit normal of the mesh slope across the span', () => {
    const r = mulberry32(6);
    const n = new THREE.Vector3();
    for (let i = 0; i < 200; i++) {
      const x = (r() * 2 - 1) * (WORLD_HALF - 2);
      const z = (r() * 2 - 1) * (WORLD_HALF - 2);
      const h = 0.2 + r();
      meshGroundNormal(x, z, h, n);
      expect(n.length()).toBeCloseTo(1, 9);
      expect(n.y).toBeGreaterThan(0);
      // Its plane through (x, z) meets the ground h either side along x and z (on average).
      const slopeX = -n.x / n.y;
      const slopeZ = -n.z / n.y;
      expect(slopeX * 2 * h).toBeCloseTo(meshGroundHeight(x + h, z) - meshGroundHeight(x - h, z), 9);
      expect(slopeZ * 2 * h).toBeCloseTo(meshGroundHeight(x, z + h) - meshGroundHeight(x, z - h), 9);
    }
  });

  it('is continuous', () => {
    const r = mulberry32(5);
    for (let i = 0; i < 2000; i++) {
      const x = (r() * 2 - 1) * WORLD_HALF;
      const z = (r() * 2 - 1) * WORLD_HALF;
      expect(Math.abs(meshGroundHeight(x + 1e-4, z) - meshGroundHeight(x, z))).toBeLessThan(1e-3);
      expect(Math.abs(meshGroundHeight(x, z + 1e-4) - meshGroundHeight(x, z))).toBeLessThan(1e-3);
    }
  });

  it('is exactly what the rendered triangle shows, and never above the true ground by more than the mesh error', () => {
    const r = mulberry32(9);
    let checked = 0;
    for (let i = 0; i < 400; i++) {
      const x = (r() * 2 - 1) * WORLD_HALF;
      const z = (r() * 2 - 1) * WORLD_HALF;
      // Find the mesh triangle that contains (x, z) and interpolate its vertex heights.
      let got: number | null = null;
      for (let t = 0; t < index.length && got === null; t += 3) {
        const [ia, ib, ic] = [index[t] * 3, index[t + 1] * 3, index[t + 2] * 3];
        const [ax, az, bx, bz, cx, cz] = [pos[ia], pos[ia + 2], pos[ib], pos[ib + 2], pos[ic], pos[ic + 2]];
        const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
        const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) got = l1 * pos[ia + 1] + l2 * pos[ib + 1] + l3 * pos[ic + 1];
      }
      expect(got).not.toBeNull();
      expect(meshGroundHeight(x, z)).toBeCloseTo(got!, 5);
      expect(Math.abs(meshGroundHeight(x, z) - groundHeight(x, z))).toBeLessThan(0.1);
      checked++;
    }
    expect(checked).toBe(400);
  });
});
