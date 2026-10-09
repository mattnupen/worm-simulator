import { describe, it, expect } from 'vitest';
import type * as THREE from 'three';
import { createCutFace } from '../../src/underground/cutFace';
import { createSlab, slabU } from '../../src/underground/slab';
import { createSoilGrid, fillSoilGrid, digDisc, cellU, cellV, colOf, rowOf, GRID_W } from '../../src/underground/soilGrid';
import { castBlob } from '../../src/underground/castings';
import { FACE_BELOW, FACE_PAST } from '../../src/underground/cutFrame';

const eaten = { cells: 0, organic: 0 };
/** What the renderer does once it has uploaded the texture. */
const rendered = (t: THREE.DataTexture): void => {
  t.onUpdate?.(t);
  t.updateRanges.length = 0;
};

function setUp() {
  const face = createCutFace();
  const s = createSlab(0, 0, 0, 1, 4);
  const g = createSoilGrid();
  fillSoilGrid(g, s);
  face.setSlab(s, g);
  const tex = (face.mesh.material as THREE.ShaderMaterial).uniforms.uSoil.value as THREE.DataTexture;
  return { face, s, g, tex };
}

describe('the cut face\'s soil texture (spec 10: only changed rows are uploaded)', () => {
  it('uploads in full after a new slab, then only the rows that changed, one range per row', () => {
    const { face, g, tex } = setUp();
    const v0 = tex.version;
    face.upload(g);
    expect(tex.version).toBe(v0 + 1);
    expect(tex.updateRanges.length).toBe(0); // the whole texture
    rendered(tex);
    face.upload(g);
    expect(tex.version).toBe(v0 + 1); // nothing changed: nothing uploaded
    digDisc(g, 1, -3, 0.14, eaten);
    face.upload(g);
    expect(tex.version).toBe(v0 + 2);
    expect(tex.updateRanges.length).toBeGreaterThan(1);
    for (const r of tex.updateRanges) {
      expect(r.count).toBe(GRID_W * 4);
      expect(r.start % (GRID_W * 4)).toBe(0);
    }
  });

  it('keeps a full upload whole until the renderer has made it, and queues each row once', () => {
    const { face, g, tex } = setUp();
    face.upload(g);
    // The face was off screen this frame (nothing uploaded); the worm digs on.
    digDisc(g, 1, -3, 0.14, eaten);
    face.upload(g);
    expect(tex.updateRanges.length).toBe(0); // still the whole texture
    rendered(tex);
    digDisc(g, 1, -3.05, 0.14, eaten);
    face.upload(g);
    const rows = tex.updateRanges.length;
    expect(rows).toBeGreaterThan(1);
    digDisc(g, 1.1, -3.05, 0.14, eaten); // the same rows again before the next render
    face.upload(g);
    const starts = tex.updateRanges.map((r) => r.start);
    expect(starts.length).toBeGreaterThanOrEqual(rows);
    expect(new Set(starts).size).toBe(starts.length);
    // A new slab before the renderer caught up: the next upload is whole again.
    const next = createSlab(3, 2, 1, -1, 9);
    fillSoilGrid(g, next);
    face.setSlab(next, g);
    face.upload(g);
    expect(tex.updateRanges.length).toBe(0);
  });
});

describe('the cut face\'s tunnel channel (soft round bores)', () => {
  it('blurs a tunnel\'s edge: full inside, part-way at its rim, none beyond', () => {
    const { face, g, tex } = setUp();
    // A disc 3.5 cells round a cell's centre: open out to 3 cells along its row.
    const c = colOf(1);
    const row = rowOf(g, -3);
    digDisc(g, cellU(c), cellV(g, row), 0.35, eaten);
    face.upload(g);
    const bytes = tex.image.data as Uint8Array;
    const at = (dc: number): number => bytes[(row * GRID_W + c + dc) * 4];
    expect(at(0)).toBe(255);
    // The last open cell and the first closed one are both part-way: the edge is softened.
    expect(at(3)).toBeLessThan(255);
    expect(at(3)).toBeGreaterThan(127);
    expect(at(4)).toBeGreaterThan(0);
    expect(at(4)).toBeLessThan(128);
    expect(at(5)).toBe(0);
  });

  it('counts castings as tunnel: the hole is the whole tunnel, the casting drawn in it by the hollow', () => {
    const { face, g, tex } = setUp();
    digDisc(g, 1, -3, 0.35, eaten);
    const before = new Uint8Array(tex.image.data as Uint8Array);
    face.upload(g);
    const dug = new Uint8Array(tex.image.data as Uint8Array);
    castBlob(g, 1, -3, 0.3, 200, 1, 0);
    face.upload(g);
    const bytes = tex.image.data as Uint8Array;
    let checked = 0;
    for (let i = 0; i < g.cast.length; i++) {
      if (!g.cast[i]) continue;
      // The tunnel byte is what the dig alone gave (the cast takes nothing from the hole)...
      expect(bytes[i * 4]).toBe(dug[i * 4]);
      expect(bytes[i * 4]).toBeGreaterThan(before[i * 4]);
      // ...and the casting is in G.
      expect(bytes[i * 4 + 1]).toBe(200);
      checked++;
    }
    expect(checked).toBeGreaterThan(3);
  });
});

describe('the cut face\'s strip (what the cut camera may show)', () => {
  it('reaches FACE_BELOW under the slab and FACE_PAST beyond both ends of the face', () => {
    const { face, s } = setUp();
    const geo = face.mesh.geometry;
    const pos = geo.getAttribute('position');
    const plane = geo.getAttribute('aPlane');
    const used = geo.drawRange.count / 6 + 1; // columns drawn
    let uLo = Infinity;
    let uHi = -Infinity;
    let yLo = Infinity;
    for (let i = 0; i < used * 2; i++) {
      const u = plane.getX(i);
      expect(slabU(s, pos.getX(i), pos.getZ(i))).toBeCloseTo(u, 4);
      expect(pos.getY(i)).toBeCloseTo(plane.getY(i), 5);
      uLo = Math.min(uLo, u);
      uHi = Math.max(uHi, u);
      yLo = Math.min(yLo, pos.getY(i));
    }
    // (float32 attributes: within 1e-4)
    expect(uLo).toBeLessThanOrEqual(s.faceLo - FACE_PAST + 1e-4);
    expect(uHi).toBeGreaterThanOrEqual(s.faceHi + FACE_PAST - 1e-4);
    expect(yLo).toBeLessThanOrEqual(s.bottom - FACE_BELOW + 1e-4);
    expect(geo.boundingSphere!.radius).toBeGreaterThan((s.faceHi - s.faceLo) / 2);
  });
});
