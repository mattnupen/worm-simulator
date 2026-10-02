import { describe, it, expect } from 'vitest';
import { placeLeaves } from '../../src/surface/leafLitter';
import { buildLeafLitter } from '../../src/surface/leafLitterMesh';
import { buildTerrainGeometry } from '../../src/surface/terrainMesh';
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
  const mound = (x: number, z: number) => terrainHeight(x, z) + litterMound(litterDepth(x, z));

  it('some clutter really stands where the mound is deep enough to bury it', () => {
    expect(items.filter((c) => mound(c.x, c.z) - terrainHeight(c.x, c.z) > 0.05).length).toBeGreaterThan(0);
  });

  it('sets every item on the mound: its base is never below soil plus mound', () => {
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
