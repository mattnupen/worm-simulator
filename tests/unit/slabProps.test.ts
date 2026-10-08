import { describe, it, expect } from 'vitest';
import { createSlabProps, writeSlabProps, BUILD_STEPS, MAX_VERTS, MAX_INDEX } from '../../src/underground/slabProps';
import { createSlab } from '../../src/underground/slab';
import { createSolids, placeSolids } from '../../src/underground/solids';
import { footprints } from '../../src/surface/obstacles';
import { mulberry32 } from '../../src/core/random';

describe('the slab\'s stones, roots and life fit their one mesh', () => {
  it('for a sweep of slabs, including ones through a rock and through the log', () => {
    const rand = mulberry32(5);
    const spots: [number, number, number][] = [];
    for (let i = 0; i < 30; i++) spots.push([rand() * 30 - 15, rand() * 30 - 15, rand() * 6.3]);
    const { log, round } = footprints();
    // Along the log's axis 2 u past its side, and square across it; then square through the last rock.
    spots.push([log.x - log.dz * (log.r + 2), log.z + log.dx * (log.r + 2), Math.atan2(log.dx, log.dz)]);
    spots.push([log.x - log.dz * 3, log.z + log.dx * 3, Math.atan2(log.dz, -log.dx)]);
    spots.push([round[round.length - 4] + 3, round[round.length - 3], -Math.PI / 2]);
    let most = 0;
    let rocks = 0;
    let logs = 0;
    for (const [x, z, h] of spots) {
      const s = createSlab(x, z, h, 1, Math.floor(rand() * 1e6));
      const o = placeSolids(s, createSolids());
      for (let i = 0; i < o.sectionCount; i++) {
        if (o.sections[i].rock >= 0) rocks++;
        else logs++;
      }
      const w = writeSlabProps(s, o);
      expect(w.vertexCount).toBeLessThan(MAX_VERTS);
      expect(w.idx.length).toBeLessThan(MAX_INDEX);
      expect(w.pos.every(Number.isFinite) && w.nor.every(Number.isFinite) && w.extra.every(Number.isFinite)).toBe(true);
      most = Math.max(most, w.vertexCount);
    }
    expect(rocks).toBeGreaterThan(0);
    expect(logs).toBeGreaterThan(0);
    expect(most).toBeGreaterThan(1000);
  });

  it('turns every shape\'s faces the way its normals point, so lighting never flips, on either side of the cut', () => {
    for (const side of [1, -1] as const) {
    const s = createSlab(4, 6, 0.4, side, 12345);
    const w = writeSlabProps(s, placeSolids(s, createSolids()));
    const p = w.pos;
    const n = w.nor;
    let wrong = 0;
    let tris = 0;
    for (let t = 0; t < w.idx.length; t += 3) {
      const [a, b, c] = [w.idx[t] * 3, w.idx[t + 1] * 3, w.idx[t + 2] * 3];
      const ux = p[b] - p[a]; const uy = p[b + 1] - p[a + 1]; const uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a]; const vy = p[c + 1] - p[a + 1]; const vz = p[c + 2] - p[a + 2];
      const fx = uy * vz - uz * vy;
      const fy = uz * vx - ux * vz;
      const fz = ux * vy - uy * vx;
      // Only the triangles facing the camera's side of the cut show (the leaned backs never do).
      if (Math.hypot(fx, fy, fz) < 1e-9 || fx * s.nx + fz * s.nz <= 0) continue;
      tris++;
      const mx = n[a] + n[b] + n[c];
      const my = n[a + 1] + n[b + 1] + n[c + 1];
      const mz = n[a + 2] + n[b + 2] + n[c + 2];
      if (fx * mx + fy * my + fz * mz < 0) wrong++;
    }
    // A shape wound inside out would show its back faces, whose normals the material flips: every
    // lit side dark. Only a few creases may disagree: of lumpy, leaned shapes, and inside a root's
    // bends, where its three rings fold over each other inside the root (hidden).
    expect(tris).toBeGreaterThan(1000);
    expect(wrong / tris).toBeLessThan(0.02);
    }
  });

  it('a staged rewrite (one part a frame) ends exactly as the one-shot one, the last slab shown until then', () => {
    const a = createSlab(4, 6, 0.4, 1, 12345);
    const b = createSlab(-3, 2, 1.1, -1, 777);
    const oa = placeSolids(a, createSolids());
    const ob = placeSolids(b, createSolids());
    const once = createSlabProps();
    once.setSlab(b, ob);
    const staged = createSlabProps();
    staged.setSlab(a, oa);
    const before = staged.mesh.geometry.drawRange.count;
    staged.startSlab(b, ob);
    let steps = 0;
    while (!staged.buildStep()) {
      steps++;
      expect(staged.mesh.geometry.drawRange.count).toBe(before);
    }
    expect(steps + 1).toBe(BUILD_STEPS);
    expect(BUILD_STEPS).toBeGreaterThanOrEqual(2);
    expect(staged.buildStep()).toBe(true);
    const ga = once.mesh.geometry;
    const gb = staged.mesh.geometry;
    expect(gb.drawRange.count).toBe(ga.drawRange.count);
    const n = ga.drawRange.count;
    expect(Array.from((gb.index!.array as Uint16Array).subarray(0, n))).toEqual(Array.from((ga.index!.array as Uint16Array).subarray(0, n)));
    const nv = writeSlabProps(b, ob).vertexCount;
    for (const name of ['position', 'normal', 'aProp']) {
      const k = nv * ga.getAttribute(name).itemSize;
      expect(gb.getAttribute(name).array.subarray(0, k)).toEqual(ga.getAttribute(name).array.subarray(0, k));
    }
  });
});
