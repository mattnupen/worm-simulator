import { describe, it, expect } from 'vitest';
import { MeshWriter } from '../../src/surface/meshWriter';
import { createSlab, slabU, type Slab } from '../../src/underground/slab';
import { createSolids, placeSolids, solidDepth, ROOT_STRIDE, STONE_STRIDE, type Solids } from '../../src/underground/solids';
import { createPen } from '../../src/underground/cutShapes';
import { writeRoots, writeStones } from '../../src/underground/cutSolids';
import { mulberry32 } from '../../src/core/random';

const hit = { nu: 0, nv: 0 };
/** How far a drawn outline may stray from the blocker the worm slides along (about 1.5 px at Close). */
const BOUND = 0.02;

function slabs(n: number, seed: number): { s: Slab; o: Solids }[] {
  const rand = mulberry32(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = createSlab(rand() * 30 - 15, rand() * 30 - 15, rand() * Math.PI * 2, rand() < 0.5 ? 1 : -1, Math.floor(rand() * 1e9));
    out.push({ s, o: placeSolids(s, createSolids()) });
  }
  return out;
}

/** Distance from point q to triangle abc (all xyz). */
function triDist(q: number[], a: number[], b: number[], c: number[]): number {
  // Closest point on a triangle (Ericson, Real-Time Collision Detection 5.1.5).
  const sub = (x: number[], y: number[]) => [x[0] - y[0], x[1] - y[1], x[2] - y[2]];
  const dt = (x: number[], y: number[]) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const at = (o: number[], e: number[], t: number) => [o[0] + e[0] * t, o[1] + e[1] * t, o[2] + e[2] * t];
  const ab = sub(b, a); const ac = sub(c, a); const ap = sub(q, a);
  const d1 = dt(ab, ap); const d2 = dt(ac, ap);
  let p: number[];
  if (d1 <= 0 && d2 <= 0) p = a;
  else {
    const bp = sub(q, b); const d3 = dt(ab, bp); const d4 = dt(ac, bp);
    const cp = sub(q, c); const d5 = dt(ab, cp); const d6 = dt(ac, cp);
    const vc = d1 * d4 - d3 * d2; const vb = d5 * d2 - d1 * d6; const va = d3 * d6 - d5 * d4;
    if (d3 >= 0 && d4 <= d3) p = b;
    else if (vc <= 0 && d1 >= 0 && d3 <= 0) p = at(a, ab, d1 / (d1 - d3));
    else if (d6 >= 0 && d5 <= d6) p = c;
    else if (vb <= 0 && d2 >= 0 && d6 <= 0) p = at(a, ac, d2 / (d2 - d6));
    else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) p = at(b, sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6)));
    else {
      const den = 1 / (va + vb + vc);
      p = [a[0] + ab[0] * vb * den + ac[0] * vc * den, a[1] + ab[1] * vb * den + ac[1] * vc * den, a[2] + ab[2] * vb * den + ac[2] * vc * den];
    }
  }
  return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
}

/** The drawn mesh's distance to point q (world), over triangles within 0.5 of it. */
function meshDist(w: MeshWriter, q: number[]): number {
  let best = Infinity;
  const P = (i: number) => [w.pos[i * 3], w.pos[i * 3 + 1], w.pos[i * 3 + 2]];
  for (let t = 0; t < w.idx.length; t += 3) {
    const a = P(w.idx[t]);
    if (Math.abs(a[1] - q[1]) > 0.8 || Math.abs(a[0] - q[0]) > 0.8 || Math.abs(a[2] - q[2]) > 0.8) continue;
    const d = triDist(q, a, P(w.idx[t + 1]), P(w.idx[t + 2]));
    // (Zero-area triangles where a tube's rings meet give NaN: their edges count through their neighbours.)
    if (d < best) best = d;
  }
  return best;
}

/**
 * Probes where a mesh meets the face (d = 0) against the blockers: every drawn vertex there lies
 * no more than BOUND outside them, and every point of a blocker's outline (sampled on capsules
 * `caps`, where it is not inside another blocker) is within BOUND of the drawn surface.
 */
function probe(s: Slab, o: Solids, w: MeshWriter, caps: number[][]): { out: number; gap: number; n: number } {
  let out = 0;
  let gap = 0;
  let n = 0;
  for (let i = 0; i < w.vertexCount; i++) {
    const x = w.pos[i * 3];
    const z = w.pos[i * 3 + 2];
    if (Math.abs((x - s.ox) * s.nx + (z - s.oz) * s.nz) > 1e-4) continue;
    const u = slabU(s, x, z);
    if (u < s.playLo || u > s.playHi) continue;
    out = Math.max(out, -solidDepth(o, u, w.pos[i * 3 + 1], 0, hit));
  }
  for (const c of caps) {
    const eu = c[3] - c[0];
    const ev = c[4] - c[1];
    const l = Math.hypot(eu, ev);
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      for (const t of l > 1e-6 ? [0, 0.2, 0.5, 0.8, 1] : [0]) {
        const r = c[2] + (c[5] - c[2]) * t;
        const u = c[0] + eu * t + Math.cos(a) * r;
        const v = c[1] + ev * t + Math.sin(a) * r;
        // A point of the outline, unless it is inside another blocker (or segment of the same root).
        if (u < s.playLo || u > s.playHi || solidDepth(o, u, v, -1e-4, hit) > 0) continue;
        n++;
        gap = Math.max(gap, meshDist(w, [s.ox + s.tx * u, v, s.oz + s.tz * u]));
      }
    }
  }
  return { out, gap, n };
}

describe('the drawn stones and roots are where they block', () => {
  const SLABS = slabs(10, 21);

  it('stones: their outline in the face is their capsule', () => {
    let worst = { out: 0, gap: 0, n: 0 };
    for (const { s, o } of SLABS) {
      const w = new MeshWriter('aProp', 4);
      writeStones(createPen(w, s), o);
      const caps: number[][] = [];
      for (let i = 0; i < o.stoneCount; i++) {
        const [u, v, r, sx, sy, rot] = o.stones.subarray(i * STONE_STRIDE, i * STONE_STRIDE + 6);
        const [au, av] = sx >= sy ? [Math.cos(rot), Math.sin(rot)] : [-Math.sin(rot), Math.cos(rot)];
        const half = r * Math.abs(sx - sy);
        const rr = r * Math.min(sx, sy);
        caps.push([u - au * half, v - av * half, rr, u + au * half, v + av * half, rr]);
      }
      const q = probe(s, o, w, caps);
      worst = { out: Math.max(worst.out, q.out), gap: Math.max(worst.gap, q.gap), n: worst.n + q.n };
    }
    expect(worst.n).toBeGreaterThan(500);
    expect(worst.out).toBeLessThan(BOUND);
    expect(worst.gap).toBeLessThan(BOUND);
  });

  it('roots: their outline in the face is their capsule chain, tips and bends included', () => {
    let worst = { out: 0, gap: 0, n: 0 };
    for (const { s, o } of SLABS) {
      const w = new MeshWriter('aProp', 4);
      writeRoots(createPen(w, s), o);
      const caps: number[][] = [];
      for (let i = 0; i < o.rootCount; i++) caps.push(Array.from(o.roots.subarray(i * ROOT_STRIDE, i * ROOT_STRIDE + 6)));
      const q = probe(s, o, w, caps);
      worst = { out: Math.max(worst.out, q.out), gap: Math.max(worst.gap, q.gap), n: worst.n + q.n };
    }
    expect(worst.n).toBeGreaterThan(500);
    expect(worst.out).toBeLessThan(BOUND);
    expect(worst.gap).toBeLessThan(BOUND);
  });
});
