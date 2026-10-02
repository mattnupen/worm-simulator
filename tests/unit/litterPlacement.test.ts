import { describe, it, expect } from 'vitest';
import { placeLeaves, wetnessLayer } from '../../src/surface/leafLitter';
import { leafTint } from '../../src/surface/leafPalette';
import { mulberry32 } from '../../src/core/random';
import * as THREE from 'three';
import { buildLeafLitter } from '../../src/surface/leafLitterMesh';
import { buildTerrainGeometry, meshGroundHeight } from '../../src/surface/terrainMesh';
import { groundHeight } from '../../src/surface/litterDepth';
import { WORLD_HALF } from '../../src/surface/terrain';
import { PILES, litterDepth, litterMound } from '../../src/surface/litterDepth';
import { terrainHeight } from '../../src/surface/terrain';
import { placeClutter } from '../../src/surface/propPlacement';
import { writeClutterItem } from '../../src/surface/groundProps';
import { CLUTTER_SINK } from '../../src/surface/propGeometry';
import { MeshWriter } from '../../src/surface/meshWriter';

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

  it('leaves near a pile centre lie on top of it', () => {
    const litter = buildLeafLitter(6000);
    const pos = litter.mesh.geometry.getAttribute('position').array as Float32Array;
    let near = 0;
    for (let v = 0; v < pos.length; v += 3) {
      const x = pos[v];
      const z = pos[v + 2];
      if (Math.hypot(x - pile.x, z - pile.z) > pile.r * 0.2) continue;
      near++;
      expect(pos[v + 1] - terrainHeight(x, z)).toBeGreaterThan(0.12);
    }
    expect(near).toBeGreaterThan(20);
  });
});

describe('clutter on the litter mound', () => {
  const items = placeClutter(150);
  const mound = (x: number, z: number) => meshGroundHeight(x, z);

  it('some clutter really stands where the mound is deep enough to bury it', () => {
    expect(items.filter((c) => mound(c.x, c.z) - terrainHeight(c.x, c.z) > 0.05).length).toBeGreaterThan(0);
  });

  it('sets every item on the rendered ground: its base is never below the mesh surface', () => {
    for (const c of items) {
      const w = new MeshWriter('aProp', 4);
      writeClutterItem(w, c, () => 0.5);
      let low = Infinity;
      for (let v = 0; v < w.vertexCount; v++) low = Math.min(low, w.pos[v * 3 + 1]);
      const floor = mound(c.x, c.z);
      if (c.kind === 'mushrooms') {
        // Each mushroom stands on the ground under it; across a cluster the mound slopes a little.
        expect(low).toBeGreaterThanOrEqual(floor - 0.06);
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
