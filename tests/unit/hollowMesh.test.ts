import { describe, it, expect } from 'vitest';
import type * as THREE from 'three';
import { createCutFace } from '../../src/underground/cutFace';
import { createHollowMesh, TILE_U, TILE_QUADS, TILES_W, TILES_H, VERTS_PER_TILE, INDICES_PER_TILE, BEHIND } from '../../src/underground/hollowMesh';
import { createSlab, slabX, slabZ, SLAB_HALF, boundaryAt, B_TOP } from '../../src/underground/slab';
import { createSoilGrid, fillSoilGrid, digDisc, CELL, GRID_W, HOLLOW_STEP, HOLLOW_W, type SoilGrid } from '../../src/underground/soilGrid';

const ate = { cells: 0, organic: 0 };
function setUp() {
  const face = createCutFace();
  const hollow = createHollowMesh(face.uniforms);
  const s = createSlab(0, 0, 0, 1, 4);
  const g = createSoilGrid();
  fillSoilGrid(g, s);
  face.setSlab(s, g);
  hollow.setSlab(s, g);
  hollow.upload(g);
  return { hollow, s, g };
}
const tileOf = (g: { v0: number }, u: number, v: number) =>
  Math.floor((v - g.v0) / TILE_U) * TILES_W + Math.floor((u + SLAB_HALF) / TILE_U);

describe('the hollow tiles (spec 4.3: one draw, tiles claimed where tunnels are)', () => {
  it('a fresh slab claims no tile and draws nothing', () => {
    const { hollow } = setUp();
    expect(hollow.used()).toBe(0);
    expect(hollow.mesh.geometry.drawRange.count).toBe(0);
    expect(TILES_W * TILES_H).toBe(32 * 28);
  });

  it('a dig claims the tiles round it; the draw range covers exactly the claimed slots', () => {
    const { hollow, g } = setUp();
    digDisc(g, 1.25, -3.25, 0.14, ate);
    hollow.upload(g);
    expect(hollow.used()).toBeGreaterThanOrEqual(1);
    expect(hollow.used()).toBeLessThanOrEqual(4);
    expect(hollow.slotOf[tileOf(g, 1.25, -3.25)]).toBeGreaterThanOrEqual(0);
    expect(hollow.mesh.geometry.drawRange.count).toBe(hollow.used() * INDICES_PER_TILE);
  });

  it('pushes the surface back by the hollow\'s depth along the slab\'s normal, BEHIND where there is none', () => {
    const { hollow, s, g } = setUp();
    digDisc(g, 1.25, -3.25, 0.14, ate);
    hollow.upload(g);
    const geo = hollow.mesh.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const plane = geo.getAttribute('aPlane') as THREE.BufferAttribute;
    const depth = geo.getAttribute('aDepth') as THREE.BufferAttribute;
    let deepest = 0;
    for (let k = 0; k < hollow.used() * VERTS_PER_TILE; k++) {
      const u = plane.getX(k);
      const v = plane.getY(k);
      const d = Math.max(BEHIND, depth.getX(k));
      expect(pos.getX(k)).toBeCloseTo(slabX(s, u) - s.nx * d, 5);
      expect(pos.getY(k)).toBeCloseTo(v, 5);
      expect(pos.getZ(k)).toBeCloseTo(slabZ(s, u) - s.nz * d, 5);
      deepest = Math.max(deepest, depth.getX(k));
    }
    expect(deepest).toBeGreaterThan(0.12);
    expect(deepest).toBeLessThan(0.16);
  });

  it('normals face the camera\'s side on flat ground and tilt up on a tunnel\'s floor', () => {
    const { hollow, g } = setUp();
    digDisc(g, 1.25, -3.25, 0.14, ate);
    hollow.upload(g);
    const geo = hollow.mesh.geometry;
    const nrm = geo.getAttribute('aSlabNormal') as THREE.BufferAttribute;
    const plane = geo.getAttribute('aPlane') as THREE.BufferAttribute;
    let flat = 0;
    let floor = 0;
    for (let k = 0; k < hollow.used() * VERTS_PER_TILE; k++) {
      const du = plane.getX(k) - 1.25;
      const dv = plane.getY(k) + 3.25;
      if (Math.hypot(du, dv) > 0.25) { expect(nrm.getZ(k)).toBeCloseTo(1, 3); flat++; }
      // On the floor (below the axis), the wall faces up (+v).
      if (Math.abs(du) < 0.03 && dv < -0.06 && dv > -0.12) { expect(nrm.getY(k)).toBeGreaterThan(0.3); floor++; }
    }
    expect(flat).toBeGreaterThan(0);
    expect(floor).toBeGreaterThan(0);
  });

  it('a new slab frees every slot', () => {
    const { hollow, s, g } = setUp();
    digDisc(g, 1.25, -3.25, 0.14, ate);
    hollow.upload(g);
    fillSoilGrid(g, s);
    hollow.setSlab(s, g);
    hollow.upload(g);
    expect(hollow.used()).toBe(0);
    expect(hollow.slotOf.every((x) => x === -1)).toBe(true);
  });

  it('queues one update range per changed tile and attribute, never the whole buffer', () => {
    const { hollow, g } = setUp();
    digDisc(g, 1.25, -3.25, 0.14, ate);
    hollow.upload(g);
    const pos = hollow.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(pos.updateRanges.length).toBe(hollow.used());
    for (const r of pos.updateRanges) expect(r.count).toBe(VERTS_PER_TILE * 3);
  });

  // Below, digs are centred in tile column 18 (u 1.0..1.5) and tile row 17 (from the grid's bottom),
  // on a vertex and between hollow samples: (1.25, vC) is that tile's vertex (6, 6).
  const TV = TILE_QUADS + 1;
  const QUAD = TILE_U / TILE_QUADS;
  const attrsOf = (hollow: ReturnType<typeof setUp>['hollow']) => {
    const geo = hollow.mesh.geometry;
    return ['position', 'aSlabNormal', 'aDepth', 'aPlane', 'aBoundsA', 'aBoundsB']
      .map((n) => geo.getAttribute(n) as THREE.BufferAttribute);
  };
  /** What three r186's renderer does with a queued attribute (WebGLAttributes.updateBuffer). */
  function renderUpload(a: THREE.BufferAttribute): void {
    const R = a.updateRanges;
    R.sort((x, y) => x.start - y.start);
    let m = 0;
    for (let i = 1; i < R.length; i++) {
      const prev = R[m];
      const r = R[i];
      if (r.start <= prev.start + prev.count + 1) prev.count = Math.max(prev.count, r.start + r.count - prev.start);
      else R[++m] = r;
    }
    R.length = m + 1;
    a.clearUpdateRanges();
    a.onUploadCallback();
  }

  it('the deepest point is the dig\'s centre, and the depth is symmetric about it', () => {
    const { hollow, g } = setUp();
    const vC = g.v0 + 8.75;
    digDisc(g, 1.25, vC, 0.14, ate);
    hollow.upload(g);
    const geo = hollow.mesh.geometry;
    const plane = geo.getAttribute('aPlane') as THREE.BufferAttribute;
    const depth = geo.getAttribute('aDepth') as THREE.BufferAttribute;
    let best = 0;
    for (let k = 1; k < hollow.used() * VERTS_PER_TILE; k++) if (depth.getX(k) > depth.getX(best)) best = k;
    expect(Math.abs(plane.getX(best) - 1.25)).toBeLessThanOrEqual(QUAD);
    expect(Math.abs(plane.getY(best) - vC)).toBeLessThanOrEqual(QUAD);
    const slot = hollow.slotOf[tileOf(g, 1.25, vC)];
    const at = (x: number, y: number) => depth.getX(slot * VERTS_PER_TILE + y * TV + x);
    expect(plane.getX(slot * VERTS_PER_TILE + 6 * TV + 6)).toBeCloseTo(1.25, 5);
    expect(plane.getY(slot * VERTS_PER_TILE + 6 * TV + 6)).toBeCloseTo(vC, 5);
    for (let j = 1; j <= 3; j++) {
      // Within one byte of the hollow (HOLLOW_MAX / 255).
      expect(Math.abs(at(6 + j, 6) - at(6 - j, 6))).toBeLessThan(1e-3);
      expect(Math.abs(at(6, 6 + j) - at(6, 6 - j))).toBeLessThan(1e-3);
      expect(at(6 + j, 6)).toBeLessThan(at(6, 6));
    }
  });

  it('no vertex rises above its column\'s soil top (rows above it lie on the top line)', () => {
    const { hollow, s, g } = setUp();
    const top = boundaryAt(s, B_TOP, 1.25);
    digDisc(g, 1.25, top - 0.15, 0.14, ate);
    hollow.upload(g);
    expect(hollow.used()).toBeGreaterThanOrEqual(1);
    const geo = hollow.mesh.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const plane = geo.getAttribute('aPlane') as THREE.BufferAttribute;
    let onTop = 0;
    for (let k = 0; k < hollow.used() * VERTS_PER_TILE; k++) {
      const t = boundaryAt(s, B_TOP, plane.getX(k));
      expect(plane.getY(k)).toBeLessThanOrEqual(t + 1e-6);
      expect(pos.getY(k)).toBeCloseTo(plane.getY(k), 6);
      if (Math.abs(plane.getY(k) - t) < 1e-5) onTop++;
    }
    // The dig's tile straddles the top: some of its rows were clamped onto it.
    expect(onTop).toBeGreaterThan(TV);
  });

  it('a re-dig in a claimed tile queues only its positions, normals and depths', () => {
    const { hollow, g } = setUp();
    const vC = g.v0 + 8.75;
    digDisc(g, 1.25, vC, 0.14, ate);
    hollow.upload(g);
    const attrs = attrsOf(hollow);
    for (const a of attrs) renderUpload(a);
    const used = hollow.used();
    digDisc(g, 1.255, vC, 0.14, ate);
    hollow.upload(g);
    expect(hollow.used()).toBe(used);
    expect(attrs.map((a) => a.updateRanges.length)).toEqual([used, used, used, 0, 0, 0]);
  });

  it('ranges three merged in place are reset when queued again, and an upload clears the queue', () => {
    const { hollow, g } = setUp();
    // At a tile corner: four neighbouring slots, whose ranges three merges into one.
    const vK = g.v0 + 9;
    digDisc(g, 1.0, vK, 0.14, ate);
    hollow.upload(g);
    expect(hollow.used()).toBe(4);
    const attrs = attrsOf(hollow);
    const grown = attrs.map((a) => a.updateRanges[0]);
    for (const a of attrs) renderUpload(a);
    attrs.forEach((a, j) => expect(grown[j].count).toBe(4 * VERTS_PER_TILE * a.itemSize));
    digDisc(g, 1.02, vK + 0.02, 0.14, ate);
    hollow.upload(g);
    const pos = attrs[0];
    // Queued again (so the upload cleared the queue), each range one tile long.
    expect(pos.updateRanges.length).toBe(4);
    expect(pos.updateRanges).toContain(grown[0]);
    for (const a of attrs) for (const r of a.updateRanges) expect(r.count).toBe(VERTS_PER_TILE * a.itemSize);
  });

  it('a dig at the grid\'s left edge and bottom row claims only the corner tile, all of it finite', () => {
    const { hollow, s, g } = setUp();
    digDisc(g, -7.9, g.v0 + 0.05, 0.14, ate);
    hollow.upload(g);
    expect(hollow.used()).toBe(1);
    expect(hollow.slotOf[0]).toBe(0);
    const geo = hollow.mesh.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const nrm = geo.getAttribute('aSlabNormal') as THREE.BufferAttribute;
    const plane = geo.getAttribute('aPlane') as THREE.BufferAttribute;
    const depth = geo.getAttribute('aDepth') as THREE.BufferAttribute;
    let deepest = 0;
    for (let k = 0; k < VERTS_PER_TILE; k++) {
      for (const v of [pos.getX(k), pos.getY(k), pos.getZ(k), nrm.getX(k), nrm.getY(k), nrm.getZ(k), depth.getX(k)]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      expect(plane.getX(k)).toBeGreaterThanOrEqual(-SLAB_HALF - 1e-6);
      expect(plane.getY(k)).toBeGreaterThanOrEqual(g.v0 - 1e-6);
      expect(nrm.getZ(k)).toBeGreaterThan(0);
      expect(pos.getX(k)).toBeCloseTo(slabX(s, plane.getX(k)) - s.nx * Math.max(BEHIND, depth.getX(k)), 5);
      deepest = Math.max(deepest, depth.getX(k));
    }
    expect(deepest).toBeGreaterThan(0.1);
  });

  it('an open cell claims its tile even with no hollow sample in it (the face cuts its hole there)', () => {
    const { hollow, s, g } = setUp();
    // A fresh slab marks the whole hollow dirty, so the next upload looks at every tile.
    fillSoilGrid(g, s);
    hollow.setSlab(s, g);
    const vC = g.v0 + 8.75;
    g.open[Math.floor((vC - g.v0) / CELL) * GRID_W + Math.floor((1.25 + SLAB_HALF) / CELL)] = 1;
    expect(g.hollow.every((x) => x === 0)).toBe(true);
    hollow.upload(g);
    expect(hollow.used()).toBe(1);
    expect(hollow.slotOf[tileOf(g, 1.25, vC)]).toBeGreaterThanOrEqual(0);
  });

  it('a neighbour tile is claimed through the 0.1 u margin, and only through it', () => {
    const noHollow = (g: SoilGrid, tile: number) => {
      const per = Math.round(TILE_U / HOLLOW_STEP);
      const c0 = (tile % TILES_W) * per;
      const r0 = Math.floor(tile / TILES_W) * per;
      for (let r = r0; r < r0 + per; r++) for (let c = c0; c < c0 + per; c++) if (g.hollow[r * HOLLOW_W + c]) return false;
      return true;
    };
    // 0.11 u from every edge of its tile: just outside the margin, nothing else claimed.
    const far = setUp();
    const vC = far.g.v0 + 8.75;
    digDisc(far.g, 1.25, vC, 0.14, ate);
    far.hollow.upload(far.g);
    expect(far.hollow.used()).toBe(1);
    expect(far.hollow.slotOf[tileOf(far.g, 0.75, vC)]).toBe(-1);
    // 0.05 u from its tile's left edge: the left neighbour, with no hollow of its own, is claimed.
    const near = setUp();
    digDisc(near.g, 1.19, vC, 0.14, ate);
    near.hollow.upload(near.g);
    expect(near.hollow.used()).toBe(2);
    const left = tileOf(near.g, 0.75, vC);
    expect(near.hollow.slotOf[left]).toBeGreaterThanOrEqual(0);
    expect(noHollow(near.g, left)).toBe(true);
  });
});
