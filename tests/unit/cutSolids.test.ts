import { describe, it, expect } from 'vitest';
import { MeshWriter } from '../../src/surface/meshWriter';
import { createSlab, slabU, type Slab } from '../../src/underground/slab';
import { createSolids, placeSolids, solidDepth, BURIED_STRIDE, ROOT_STRIDE, STONE_STRIDE, type Solids } from '../../src/underground/solids';
import { buriedCap } from '../../src/underground/rootEnds';
import { createPen } from '../../src/underground/cutShapes';
import { writeRoots, writeStones } from '../../src/underground/cutSolids';
import { writeBeetleBody, writeSnail } from '../../src/underground/cutLife';
import { BODY_RADIUS } from '../../src/game/crawl';
import { mulberry32 } from '../../src/core/random';

const hit = { nu: 0, nv: 0 };
/** How far a drawn outline may stray from the blocker the worm slides along (about 3 px at Close). */
const BOUND = 0.025;

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
 * Probes where a mesh meets the face (d = 0) against the blockers: every drawn vertex there, and
 * every point where a drawn edge crosses it (a root sinking into the wall), lies no more than
 * BOUND outside them, and every point of a blocker's outline (sampled on capsules `caps`, where it
 * is not inside another blocker) is within BOUND of the drawn surface.
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
  const off = (i: number) => (w.pos[i * 3] - s.ox) * s.nx + (w.pos[i * 3 + 2] - s.oz) * s.nz;
  for (let t = 0; t < w.idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = w.idx[t + e];
      const b = w.idx[t + ((e + 1) % 3)];
      const da = off(a);
      const db = off(b);
      if (!(da < -1e-4 && db > 1e-4) && !(da > 1e-4 && db < -1e-4)) continue;
      const k = da / (da - db);
      const x = w.pos[a * 3] + (w.pos[b * 3] - w.pos[a * 3]) * k;
      const z = w.pos[a * 3 + 2] + (w.pos[b * 3 + 2] - w.pos[a * 3 + 2]) * k;
      const u = slabU(s, x, z);
      if (u < s.playLo || u > s.playHi) continue;
      out = Math.max(out, -solidDepth(o, u, w.pos[a * 3 + 1] + (w.pos[b * 3 + 1] - w.pos[a * 3 + 1]) * k, 0, hit));
    }
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
  const SLABS = slabs(30, 21);

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

  it('roots: their outline in the face is their capsule chain, tips, bends and buried ends included', () => {
    let worst = { out: 0, gap: 0, n: 0 };
    let buried = 0;
    for (const { s, o } of SLABS) {
      const w = new MeshWriter('aProp', 4);
      writeRoots(createPen(w, s), o);
      const caps: number[][] = [];
      for (let i = 0; i < o.rootCount; i++) caps.push(Array.from(o.roots.subarray(i * ROOT_STRIDE, i * ROOT_STRIDE + 6)));
      // The buried ends' capsules, where each sinks into the wall.
      const far = [0, 0];
      for (let i = 0; i < o.buriedCount; i++) {
        const [u, v, r, du, dv, run] = o.buried.subarray(i * BURIED_STRIDE, i * BURIED_STRIDE + 6);
        buriedCap(r, run, far);
        caps.push([u, v, r, u + du * far[0], v + dv * far[0], far[1]]);
        buried++;
      }
      const q = probe(s, o, w, caps);
      worst = { out: Math.max(worst.out, q.out), gap: Math.max(worst.gap, q.gap), n: worst.n + q.n };
    }
    expect(worst.n).toBeGreaterThan(500);
    expect(buried).toBeGreaterThan(3);
    expect(worst.out).toBeLessThan(BOUND);
    expect(worst.gap).toBeLessThan(BOUND);
  });
});

/** Distance from (u, v) to the triangle (a, b, c) in the plane: 0 inside it. */
function triDist2(u: number, v: number, a: number[], b: number[], c: number[]): number {
  const side = (p: number[], q: number[]) => (q[0] - p[0]) * (v - p[1]) - (q[1] - p[1]) * (u - p[0]);
  const s1 = side(a, b); const s2 = side(b, c); const s3 = side(c, a);
  if ((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)) return 0;
  const seg = (p: number[], q: number[]) => {
    const eu = q[0] - p[0]; const ev = q[1] - p[1];
    const t = Math.max(0, Math.min(1, ((u - p[0]) * eu + (v - p[1]) * ev) / (eu * eu + ev * ev || 1)));
    return Math.hypot(u - p[0] - eu * t, v - p[1] - ev * t);
  };
  return Math.min(seg(a, b), seg(b, c), seg(c, a));
}

/**
 * A hint (drawn standing a little out of the face) against its capsule, seen square on: how far its
 * drawn outline lies outside the capsule (the worm would overlap it), and how far short of the
 * outline the worm's centre stops all round it (BODY_RADIUS off the capsule): an invisible stop.
 */
function hintFit(s: Slab, w: MeshWriter, c: ArrayLike<number>): { over: number; stop: number } {
  const uv: number[][] = [];
  let over = 0;
  for (let i = 0; i < w.vertexCount; i++) {
    const q = [slabU(s, w.pos[i * 3], w.pos[i * 3 + 2]), w.pos[i * 3 + 1]];
    uv.push(q);
    const eu = c[3] - c[0]; const ev = c[4] - c[1];
    const t = Math.max(0, Math.min(1, ((q[0] - c[0]) * eu + (q[1] - c[1]) * ev) / (eu * eu + ev * ev || 1)));
    over = Math.max(over, Math.hypot(q[0] - c[0] - eu * t, q[1] - c[1] - ev * t) - (c[2] + (c[5] - c[2]) * t));
  }
  let stop = 0;
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const r = c[2] + (c[5] - c[2]) * t + BODY_RADIUS;
      const u = c[0] + (c[3] - c[0]) * t + Math.cos(a) * r;
      const v = c[1] + (c[4] - c[1]) * t + Math.sin(a) * r;
      let near = Infinity;
      for (let i = 0; i < w.idx.length && near > 0; i += 3) near = Math.min(near, triDist2(u, v, uv[w.idx[i]], uv[w.idx[i + 1]], uv[w.idx[i + 2]]));
      // Only where the worm's centre can be (on the grown capsule's outline, not inside it).
      const eu = c[3] - c[0]; const ev = c[4] - c[1];
      const tt = Math.max(0, Math.min(1, ((u - c[0]) * eu + (v - c[1]) * ev) / (eu * eu + ev * ev || 1)));
      if (Math.hypot(u - c[0] - eu * tt, v - c[1] - ev * tt) < c[2] + (c[5] - c[2]) * tt + BODY_RADIUS - 1e-6) continue;
      stop = Math.max(stop, near - BODY_RADIUS);
    }
  }
  return { over, stop };
}

describe('the snail shell and the beetle block where they are drawn', () => {
  it('the worm neither overlaps them nor stops short of them (once 0.14 u off the shell, 0.09 u off the beetle)', () => {
    const worst = { snail: { over: 0, stop: 0, n: 0 }, beetle: { over: 0, stop: 0, n: 0 } };
    for (const { s, o } of slabs(40, 33)) {
      const h = o.hints;
      // placeHints adds their capsules first: the snail's, then the beetle's.
      let k = 0;
      for (const kind of ['snail', 'beetle'] as const) {
        const there = kind === 'snail' ? !Number.isNaN(h.snailU) : !Number.isNaN(h.beetleU);
        if (!there) continue;
        const w = new MeshWriter('aProp', 4);
        if (kind === 'snail') writeSnail(createPen(w, s), h.snailU, h.snailV, h.snailSize, h.snailTurn);
        else writeBeetleBody(createPen(w, s), h.beetleU, h.beetleV, h.beetleLen, h.beetleDir);
        const f = hintFit(s, w, o.caps.subarray(k * 6, k * 6 + 6));
        k++;
        const q = worst[kind];
        q.over = Math.max(q.over, f.over); q.stop = Math.max(q.stop, f.stop); q.n++;
      }
    }
    expect(worst.snail.n).toBeGreaterThan(25);
    expect(worst.beetle.n).toBeGreaterThan(25);
    for (const q of [worst.snail, worst.beetle]) {
      expect(q.over).toBeLessThan(0.02);
      expect(q.stop).toBeLessThan(0.04);
    }
    // The beetle's body is near enough a capsule to fit closer.
    expect(worst.beetle.stop).toBeLessThan(0.02);
  });
});
