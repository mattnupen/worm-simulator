import { describe, it, expect } from 'vitest';
import type * as THREE from 'three';
import { createCutFace } from '../../src/underground/cutFace';
import { createHollowMesh, TILE_U, TILES_W, TILES_H, VERTS_PER_TILE, INDICES_PER_TILE, BEHIND } from '../../src/underground/hollowMesh';
import { createSlab, slabX, slabZ, SLAB_HALF } from '../../src/underground/slab';
import { createSoilGrid, fillSoilGrid, digDisc } from '../../src/underground/soilGrid';

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
});
