import { describe, it, expect } from 'vitest';
import {
  createSolids, placeSolids, pushOutSolids, solidDepth, markSolids, BLOCKER_GAP, ENTRY_DEPTH, ENTRY_HI, ENTRY_LO,
  ROOT_REACH, ROOT_STRIDE, ROOT_TIP, STONE_STRIDE, type Solids,
} from '../../src/underground/solids';
import { createSlab, boundaryAt, slabU, B_TOP, B_F, B_H, B_A, B_B, type Slab } from '../../src/underground/slab';
import { createSoilGrid, fillSoilGrid, digDisc, cellU, cellV, GRID_H, GRID_W, SOLID_ROOT, SOLID_STONE, AIR } from '../../src/underground/soilGrid';
import { LAYER } from '../../src/underground/layers';
import { footprints, obstacleDepth } from '../../src/surface/obstacles';
import { PLAY_HALF } from '../../src/surface/terrain';
import { rocks } from '../../src/surface/propPlacement';
import { rockReach } from '../../src/underground/sections';
import { BODY_RADIUS } from '../../src/game/crawl';
import { mulberry32 } from '../../src/core/random';

const hit = { nu: 0, nv: 0 };
const DT = 1 / 60;
/** Task 5's room under the leaves' top. */
const TOP_KEEP = 0.12;

/** A seeded sweep of slabs anywhere in the world (both camera sides). */
function sweep(n: number, seed: number): { s: Slab; o: Solids; x: number; z: number }[] {
  const rand = mulberry32(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = rand() * 34 - 17;
    const z = rand() * 34 - 17;
    const s = createSlab(x, z, rand() * Math.PI * 2, rand() < 0.5 ? 1 : -1, Math.floor(rand() * 1e9));
    out.push({ s, o: placeSolids(s, createSolids()), x, z });
  }
  return out;
}
const SLABS = sweep(240, 3);

/** Where Task 4 lets the worm dig: off every footprint by 0.5 u, 2.5 u inside the play edge. */
const diggable = (x: number, z: number) =>
  obstacleDepth(x, z, 0.5, { nx: 0, nz: 0 }) <= 0 && Math.abs(x) < PLAY_HALF - 2.5 && Math.abs(z) < PLAY_HALF - 2.5;

/** Each blocker as capsules [u0, v0, r0, u1, v1, r1] with an id: every capsule its own, except a
 *  root chain's segments and its branch (which starts on it) share one. */
function capsules(o: Solids): { id: number; c: number[] }[] {
  const out: { id: number; c: number[] }[] = [];
  for (let i = 0; i < o.capCount; i++) {
    const c = Array.from(o.caps.subarray(i * 6, i * 6 + 6));
    let id = i;
    if (o.capKind[i] === SOLID_ROOT) {
      const prev = out[i - 1];
      if (prev && o.capKind[i - 1] === SOLID_ROOT && Math.hypot(c[0] - prev.c[3], c[1] - prev.c[4]) < 1e-6) id = prev.id;
      else {
        const on = out.find((q, j) => o.capKind[j] === SOLID_ROOT && capGap([c[0], c[1], 0, c[0], c[1], 0], q.c) < -1e-3);
        if (on) id = on.id;
      }
    }
    out.push({ id, c });
  }
  return out;
}

/** Root chains: [first segment, last segment + 1), and whether it branches off an earlier one. */
function chains(o: Solids): [number, number, boolean][] {
  const out: [number, number, boolean][] = [];
  for (let i = 0; i < o.rootCount; i++) {
    const k = i * ROOT_STRIDE;
    if (i === 0 || Math.hypot(o.roots[k] - o.roots[k - 3], o.roots[k + 1] - o.roots[k - 2]) > 1e-6) {
      let branch = false;
      for (let j = 0; j < i; j++) {
        const c = Array.from(o.roots.subarray(j * ROOT_STRIDE, j * ROOT_STRIDE + 6));
        if (capGap([o.roots[k], o.roots[k + 1], 0, o.roots[k], o.roots[k + 1], 0], c) < -1e-3) branch = true;
      }
      out.push([i, i + 1, branch]);
    } else out[out.length - 1][1] = i + 1;
  }
  return out;
}

/** Roots as the spec counts them: a chain thickest inside (it runs both ways from a trunk) is two. */
function rootCount(o: Solids): number {
  let n = 0;
  for (const [a, b, branch] of chains(o)) {
    if (branch) continue;
    let thick = a;
    for (let i = a; i < b; i++) if (o.roots[i * ROOT_STRIDE + 2] > o.roots[thick * ROOT_STRIDE + 2]) thick = i;
    n += thick > a ? 2 : 1;
  }
  return n;
}

/** Distance between two (tapering) capsules' surfaces, sampled along the first. */
function capGap(a: number[], b: number[]): number {
  let best = Infinity;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const u = a[0] + (a[3] - a[0]) * t;
    const v = a[1] + (a[4] - a[1]) * t;
    const r = a[2] + (a[5] - a[2]) * t;
    const eu = b[3] - b[0];
    const ev = b[4] - b[1];
    const l2 = eu * eu + ev * ev;
    const s = l2 > 0 ? Math.max(0, Math.min(1, ((u - b[0]) * eu + (v - b[1]) * ev) / l2)) : 0;
    best = Math.min(best, Math.hypot(u - b[0] - eu * s, v - b[1] - ev * s) - r - (b[2] + (b[5] - b[2]) * s));
  }
  return best;
}

describe('stones and big roots in the slab (spec 5.2)', () => {
  it('6-10 stones lie in the mineral soil (A, E, B), inside the playable slab, the same every time', () => {
    for (const { s, o } of SLABS) {
      expect(Array.from(placeSolids(s, createSolids()).stones)).toEqual(Array.from(o.stones));
      expect(o.stoneCount).toBeGreaterThanOrEqual(6);
      expect(o.stoneCount).toBeLessThanOrEqual(10);
      for (let i = 0; i < o.stoneCount; i++) {
        const [u, v, r] = o.stones.subarray(i * STONE_STRIDE, i * STONE_STRIDE + 3);
        expect(r).toBeGreaterThanOrEqual(0.12);
        expect(r).toBeLessThanOrEqual(0.55);
        for (const du of [-r, 0, r]) expect(v + r).toBeLessThan(boundaryAt(s, B_A, u + du));
        expect(v - r).toBeGreaterThan(s.bottom);
        expect(u - r).toBeGreaterThan(s.playLo);
        expect(u + r).toBeLessThan(s.playHi);
      }
    }
  });

  it('big roots run through H, A and E, below the fine-root mat of F, and taper to a tip', () => {
    for (const { s, o } of SLABS) {
      for (let i = 0; i < o.rootCount; i++) {
        const [u0, v0, r0, u1, v1, r1] = o.roots.subarray(i * ROOT_STRIDE, i * ROOT_STRIDE + 6);
        for (let t = 0; t <= 1; t += 0.25) {
          const u = u0 + (u1 - u0) * t;
          const v = v0 + (v1 - v0) * t;
          const r = r0 + (r1 - r0) * t;
          expect(v + r).toBeLessThan(boundaryAt(s, B_H, u));
          expect(v).toBeGreaterThan(boundaryAt(s, B_B, u) - 0.3);
        }
        expect(Math.min(r0, r1)).toBeGreaterThan(ROOT_TIP - 1e-6);
        expect(Math.max(r0, r1)).toBeLessThanOrEqual(0.3);
        expect(Math.abs(r1 - r0)).toBeLessThanOrEqual(0.18 * Math.max(r0, r1) + 1e-6);
      }
    }
  });

  it('2-3 big roots come from the nearest trunk, from its side; one from a slab end when none is near', () => {
    const { round } = footprints();
    let near = 0;
    let none = 0;
    let off = 0;
    for (const { s, o } of SLABS) {
      let best = Infinity;
      let ut = 0;
      for (let k = 0; k < round.length; k += 4) {
        if (round[k + 3] !== Infinity) continue;
        const u = slabU(s, round[k], round[k + 1]);
        const across = (round[k] - s.ox) * s.nx + (round[k + 1] - s.oz) * s.nz;
        const d = Math.hypot(across, Math.max(0, s.playLo - u, u - s.playHi)) - round[k + 2];
        if (d < best) { best = d; ut = u; }
      }
      const n = rootCount(o);
      if (best < ROOT_REACH) {
        near++;
        if (n < 2 || n > 3) off++;
        // A trunk past an end: the first root enters from that end, unless a rock or the log fills it.
        if ((ut < s.playLo || ut > s.playHi) && Math.sign(o.roots[0]) !== Math.sign(ut)) expect(o.sectionCount).toBeGreaterThan(0);
      } else {
        none++;
        if (n !== 1) off++;
      }
    }
    expect(near).toBeGreaterThan(100);
    expect(none).toBeGreaterThan(10);
    // Rarely a rock or the log fills both ends.
    expect(off).toBeLessThanOrEqual(2);
  });

  it('no two blockers come closer than the worm is thick, so it never wedges between them', () => {
    expect(BLOCKER_GAP).toBeGreaterThan(2 * BODY_RADIUS + 0.04);
    for (const { o } of SLABS) {
      const caps = capsules(o);
      const sectionsOnly = { ...o, capCount: 0 };
      for (let i = 0; i < caps.length; i++) {
        for (let j = i + 1; j < caps.length; j++) {
          if (caps[i].id !== caps[j].id) expect(capGap(caps[i].c, caps[j].c)).toBeGreaterThan(BLOCKER_GAP - 0.01);
        }
        // ...nor a rock or the log in section.
        const c = caps[i].c;
        for (let t = 0; t <= 1; t += 0.1) {
          const r = c[2] + (c[5] - c[2]) * t;
          expect(solidDepth(sectionsOnly, c[0] + (c[3] - c[0]) * t, c[1] + (c[4] - c[1]) * t, r + BLOCKER_GAP - 0.01, hit)).toBeLessThanOrEqual(0);
        }
      }
    }
  });

  it('no stone or root comes near the entry\'s sink', () => {
    let most = -Infinity;
    for (const { s, o } of SLABS) {
      const buried = { ...o, sectionCount: 0 };
      for (let u = ENTRY_LO; u <= ENTRY_HI + 1e-9; u += 0.05) {
        for (let v = boundaryAt(s, B_F, u) - ENTRY_DEPTH; v <= boundaryAt(s, B_TOP, u); v += 0.05) {
          most = Math.max(most, solidDepth(buried, u, v, 0, hit));
        }
      }
    }
    expect(most).toBeLessThanOrEqual(0);
  });

  it('nothing blocks the way down where the worm may dig (off rocks by their buried reach)', () => {
    let tested = 0;
    for (const { s, o, x, z } of SLABS) {
      if (!diggable(x, z) || !rocks().every((k, i) => Math.hypot(x - k.x, z - k.z) > rockReach(i) + 0.5)) continue;
      tested++;
      // The head's own path down (bodyPath.ts: an arc 0.45 u ahead, to 0.85 u below the F top).
      const v0 = boundaryAt(s, B_F, 0) + BODY_RADIUS;
      for (let a = 0; a <= Math.PI / 2 + 1e-9; a += Math.PI / 40) {
        expect(solidDepth(o, 0.45 * Math.sin(a), v0 - 0.45 + 0.45 * Math.cos(a), BODY_RADIUS, hit)).toBeLessThanOrEqual(0);
      }
      for (let d = 0; d <= 0.85; d += 0.05) expect(solidDepth(o, 0.45, boundaryAt(s, B_F, 0.45) - d, BODY_RADIUS, hit)).toBeLessThanOrEqual(0);
    }
    expect(tested).toBeGreaterThan(60);
  });
});

describe('the worm collides and slides (as V1\'s props)', () => {
  it('is pushed straight out of a stone', () => {
    const { o } = SLABS[0];
    const [u, v, r] = o.stones.subarray(0, 3);
    const p = { u: u + 0.05, v: v + 0.02 };
    pushOutSolids(o, p, BODY_RADIUS);
    expect(solidDepth(o, p.u, p.v, BODY_RADIUS, hit)).toBeLessThanOrEqual(1e-9);
    expect(Math.hypot(p.u - u, p.v - v)).toBeGreaterThan(r * Math.min(o.stones[3], o.stones[4]));
  });

  it('in a corner it cannot settle, it goes back to where it came from (if given)', () => {
    // A slab through a rock: wedge the head between the rock's flank and the leaves' top.
    const k = rocks()[1];
    const s = createSlab(k.x, k.z - (rockReach(1) + 1.5), 0, 1, 4);
    const o = placeSolids(s, createSolids());
    const rock = o.sections.slice(0, o.sectionCount).find((q) => q.rock === 1)!;
    const from = { u: rock.uLo - 0.6, v: boundaryAt(s, B_TOP, rock.uLo - 0.6) - 0.3 };
    for (let du = 0; du < 1.2; du += 0.02) {
      const p = { u: from.u + du, v: boundaryAt(s, B_TOP, from.u + du) - TOP_KEEP };
      pushOutSolids(o, p, BODY_RADIUS, TOP_KEEP, from.u, from.v);
      expect(solidDepth(o, p.u, p.v, BODY_RADIUS, hit)).toBeLessThanOrEqual(1e-6);
      expect(p.v).toBeLessThanOrEqual(boundaryAt(s, B_TOP, p.u) - TOP_KEEP + 1e-6);
      const q = { u: from.u + du, v: boundaryAt(s, B_TOP, from.u + du) - TOP_KEEP };
      // Without where it came from, it stays as far out as the pushes got it.
      pushOutSolids(o, q, BODY_RADIUS, TOP_KEEP);
      expect(solidDepth(o, q.u, q.v, BODY_RADIUS, hit)).toBeLessThan(1e-3);
    }
  });

  it('frame to frame: never inside, never through, never back and forth', () => {
    const rand = mulberry32(17);
    let runs = 0;
    let slid = 0;
    let inside = 0;
    let over = 0;
    let through = 0;
    let jitter = 0;
    for (const { s, o } of SLABS.slice(0, 40)) {
      // Aim at every blocker: stones, root segments, and the rocks' and log's sections.
      const aims: number[][] = [];
      for (const { c } of capsules(o)) aims.push([(c[0] + c[3]) / 2, (c[1] + c[4]) / 2, Math.max(c[2], c[5]) + Math.hypot(c[3] - c[0], c[4] - c[1]) / 2]);
      for (let i = 0; i < o.sectionCount; i++) {
        const q = o.sections[i];
        aims.push([(q.uLo + q.uHi) / 2, q.vLo, 0.3], [q.uLo, (q.vLo + q.vHi) / 2, 0.3], [q.uHi, (q.vLo + q.vHi) / 2, 0.3]);
      }
      for (const [tu, tv, tr] of aims) {
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2 + rand();
          const p = { u: tu + Math.cos(ang) * (tr + 0.8), v: tv + Math.sin(ang) * (tr + 0.8) };
          const top = (u: number) => boundaryAt(s, B_TOP, u) - TOP_KEEP;
          if (p.u < s.playLo + 0.2 || p.u > s.playHi - 0.2 || p.v < s.bottom + 0.3 || p.v > top(p.u)) continue;
          if (solidDepth(o, p.u, p.v, BODY_RADIUS, hit) > 0) continue;
          runs++;
          const dir = Math.atan2(tv - p.v, tu - p.u) + (rand() - 0.5) * 1.2;
          const speed = 0.4 + rand();
          let pdu = 0;
          let pdv = 0;
          let lastBack = -10;
          for (let f = 0; f < 150; f++) {
            const bu = p.u;
            const bv = p.v;
            // As the burrower steps its head: move, keep inside the slab, slide.
            p.u = Math.max(s.playLo + 0.2, Math.min(s.playHi - 0.2, p.u + Math.cos(dir) * speed * DT));
            p.v = Math.max(s.bottom + 0.3, Math.min(top(p.u), p.v + Math.sin(dir) * speed * DT));
            pushOutSolids(o, p, BODY_RADIUS, TOP_KEEP, bu, bv);
            inside = Math.max(inside, solidDepth(o, p.u, p.v, BODY_RADIUS, hit));
            over = Math.max(over, p.v - top(p.u));
            for (let q = 1; q < 4; q++) through = Math.max(through, solidDepth(o, bu + ((p.u - bu) * q) / 4, bv + ((p.v - bv) * q) / 4, 0, hit));
            const du = p.u - bu;
            const dv = p.v - bv;
            if (Math.hypot(du, dv) > 1e-4 && Math.hypot(pdu, pdv) > 1e-4 && du * pdu + dv * pdv < 0) {
              // A blocker met head-on may knock it back once; never twice running (a jitter).
              if (f - lastBack <= 3) jitter++;
              lastBack = f;
            }
            if (solidDepth(o, p.u, p.v, BODY_RADIUS + 1e-3, hit) > 0) slid += Math.hypot(du, dv);
            pdu = du;
            pdv = dv;
          }
        }
      }
    }
    expect(runs).toBeGreaterThan(1000);
    expect(inside).toBeLessThanOrEqual(1e-6);
    expect(over).toBeLessThanOrEqual(1e-6);
    expect(through).toBeLessThanOrEqual(0);
    expect(jitter).toBe(0);
    // Pressed against blockers at a slant, it keeps moving along them.
    expect(slid / runs).toBeGreaterThan(0.2);
  });
});

describe('blockers in the soil grid', () => {
  it('are marked where they lie and never dug; fine roots never block', () => {
    let wrong = 0;
    let fineBlocks = 0;
    for (const { s, o } of SLABS.slice(0, 40)) {
      const g = createSoilGrid();
      fillSoilGrid(g, s);
      markSolids(g, o);
      // The snail shell and beetle (placed first) block in the litter, as the rocks and the log do.
      const hints = (Number.isNaN(o.hints.snailU) ? 0 : 1) + (Number.isNaN(o.hints.beetleU) ? 0 : 1);
      const sectionsOnly = { ...o, capCount: hints };
      for (let r = 0; r < GRID_H; r++) {
        for (let c = 0; c < GRID_W; c++) {
          const i = r * GRID_W + c;
          const d = solidDepth(o, cellU(c), cellV(g, r), 0, hit);
          if ((d > 0.01 && !g.solid[i]) || (d < -0.01 && g.solid[i])) wrong++;
          // The litter and F (dense fine roots) block only where a rock, the log or a hint lies in them.
          if (g.layer[i] !== AIR && g.layer[i] <= LAYER.F && g.solid[i] && !(solidDepth(sectionsOnly, cellU(c), cellV(g, r), 0.01, hit) > 0)) fineBlocks++;
        }
      }
      if (o.stoneCount) {
        const eaten = { cells: 0, organic: 0 };
        digDisc(g, o.stones[0], o.stones[1], 0.1, eaten);
        expect(eaten.cells).toBe(0);
        expect(g.solid[Math.floor((o.stones[1] - g.v0) / 0.1) * GRID_W + Math.floor((o.stones[0] + 8) / 0.1)]).toBe(SOLID_STONE);
      }
      if (o.rootCount) expect(g.solid.some((x) => x === SOLID_ROOT)).toBe(true);
    }
    expect(wrong).toBe(0);
    expect(fineBlocks).toBe(0);
  });

  it('the soil under a stone is damper', () => {
    const { s, o } = SLABS[1];
    const g = createSoilGrid();
    fillSoilGrid(g, s);
    const before = Uint8Array.from(g.damp);
    markSolids(g, o);
    const [u, v, r] = o.stones.subarray(0, 3);
    const i = Math.floor((v - r - 0.15 - g.v0) / 0.1) * GRID_W + Math.floor((u + 8) / 0.1);
    expect(g.damp[i]).toBeGreaterThan(before[i]);
  });
});
