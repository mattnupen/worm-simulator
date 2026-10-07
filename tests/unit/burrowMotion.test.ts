import { describe, it, expect } from 'vitest';
import { stepBurrower, createBurrower, placeBurrower, DIG_TURN, TOP_KEEP, CAST_EVERY, TUNNEL_R } from '../../src/underground/burrowMotion';
import { boundaryAt, B_TOP, B_F, B_H, B_A, B_E } from '../../src/underground/slab';
import { createSoilGrid, fillSoilGrid } from '../../src/underground/soilGrid';
import { markSolids, solidDepth, STONE_STRIDE } from '../../src/underground/solids';
import { BODY_RADIUS, SPACING } from '../../src/game/crawl';
import { mulberry32 } from '../../src/core/random';
import { DT, N, hit, setup, run, tunnel, midOf } from './burrowWorld';

/** Mean speed over the last second of a 2 s straight run through one layer. */
function speedIn(k: number): number {
  const w = setup(-4, midOf(k));
  run(w, 1, 0, 60);
  const from = w.b.u[0];
  run(w, 1, 0, 60);
  return w.b.u[0] - from;
}

describe('digging in the plane (spec 6)', () => {
  it('is fast in its own tunnel, slower in new soil, slower still in A, then E and B', () => {
    const f = speedIn(B_F);
    const h = speedIn(B_H);
    const a = speedIn(B_A);
    const e = speedIn(B_E);
    expect(a).toBeLessThan(Math.min(f, h) * 0.8);
    expect(e).toBeLessThan(a * 0.85);
    // Along an open tunnel: faster than any fresh soil.
    const w = setup(-4, midOf(B_F));
    tunnel(w, -7, 4);
    run(w, 1, 0, 60);
    const from = w.b.u[0];
    run(w, 1, 0, 60);
    expect(w.b.u[0] - from).toBeGreaterThan(f * 1.3);
  });

  it('turns toward the way pointed at a limited rate', () => {
    const w = setup(0, midOf(B_A));
    let last = w.b.dir;
    run(w, 0, -1, 120, () => {
      expect(Math.abs(w.b.dir - last)).toBeLessThanOrEqual(DIG_TURN * DT + 1e-9);
      last = w.b.dir;
    });
    expect(Math.cos(w.b.dir + Math.PI / 2)).toBeGreaterThan(0.99);
  });

  it('steering into the top keeps it under the leaves: it never pops out, and Come up shows there', () => {
    const w = setup(0, midOf(B_F));
    run(w, 0.3, 1, 360, () => {
      expect(w.b.v[0]).toBeLessThanOrEqual(boundaryAt(w.s, B_TOP, w.b.u[0]) - TOP_KEEP + 1e-9);
    });
    expect(w.b.nearTop).toBe(true);
    run(w, 0, -1, 120);
    expect(w.b.nearTop).toBe(false);
    expect(w.b.v[0]).toBeLessThan(boundaryAt(w.s, B_F, w.b.u[0]) - 0.35);
  });

  it('stones and big roots stop it, and it slides along them', () => {
    const w = setup(0, midOf(B_A), true);
    const { o } = w;
    let tested = 0;
    for (let i = 0; i < o.stoneCount; i++) {
      const k = i * STONE_STRIDE;
      if (o.stones[k + 2] < 0.2) continue;
      const g = createSoilGrid();
      fillSoilGrid(g, w.s);
      markSolids(g, o);
      const b = createBurrower();
      const v = o.stones[k + 1] + 0.1;
      const u0 = o.stones[k] - o.stones[k + 2] - 1;
      const us = Array.from({ length: N }, (_, j) => u0 - SPACING * j);
      placeBurrower(b, us, us.map(() => v), 0, { phase: 0, activity: 0 });
      let slid = 0;
      for (let st = 0; st < 600; st++) {
        const bu = b.u[0];
        const bv = b.v[0];
        stepBurrower(b, w.s, g, o, 1, -0.05, DT);
        expect(solidDepth(o, b.u[0], b.v[0], BODY_RADIUS, hit)).toBeLessThanOrEqual(1e-6);
        if (Math.abs(b.u[0] - o.stones[k]) < o.stones[k + 2]) slid += Math.hypot(b.u[0] - bu, b.v[0] - bv);
      }
      expect(slid).toBeGreaterThan(0.1);
      tested++;
    }
    expect(tested).toBeGreaterThan(0);
  });

  it('leaves an open tunnel and a casting every few body lengths', () => {
    const w = setup(-7, midOf(B_A));
    run(w, 1, 0, 60 * 14);
    expect(w.b.u[0]).toBeGreaterThan(-7 + CAST_EVERY * 1.5);
    let casts = 0;
    for (let i = 0; i < w.g.cast.length; i++) if (w.g.cast[i]) casts++;
    expect(casts).toBeGreaterThan(3);
    // Mineral food makes paler castings than leaves would.
    expect(Math.max(...w.g.cast)).toBeLessThan(200);
    let open = 0;
    for (let i = 0; i < w.g.open.length; i++) if (w.g.open[i] && !w.g.cast[i]) open++;
    expect(open * 0.01).toBeGreaterThan((w.b.u[0] + 7) * 2 * TUNNEL_R * 0.7);
  });

  it('castings stay behind the worm: its own body never eats a new one', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const rand = mulberry32(seed);
      const w = setup(-7, midOf(B_H), false, seed);
      const before = new Uint8Array(w.g.cast.length);
      let made = 0;
      let kept = 0;
      let du = 1;
      let dv = 0;
      for (let k = 0; k < 60 * 20; k++) {
        if (k % 45 === 0) { const a = (rand() - 0.5) * 1.6; du = Math.cos(a); dv = Math.sin(a) * 0.5; }
        const since = w.b.sinceCast;
        before.set(w.g.cast);
        stepBurrower(w.b, w.s, w.g, w.o, du, dv, DT);
        if (w.b.sinceCast >= since) continue;
        // A new casting: its cells, then how many are left 1.5 s later (the body passing).
        const cells: number[] = [];
        for (let i = 0; i < before.length; i++) if (w.g.cast[i] && !before[i]) cells.push(i);
        expect(cells.length).toBeGreaterThanOrEqual(2);
        for (let j = 0; j < 90; j++) stepBurrower(w.b, w.s, w.g, w.o, du, dv, DT);
        made += cells.length;
        kept += cells.filter((i) => w.g.cast[i]).length;
      }
      expect(made).toBeGreaterThan(0);
      expect(kept / made).toBeGreaterThan(0.95);
    }
  });

  it('castings land even when the steering jumps about: almost never empty, 3 cells or more on average', () => {
    const sizes: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const rand = mulberry32(seed);
      const w = setup(0, midOf(B_H), true, seed);
      const before = new Uint8Array(w.g.cast.length);
      let du = 1;
      let dv = 0;
      let size = -1;
      for (let k = 0; k < 60 * 60; k++) {
        // A new way every second, anywhere round the clock.
        if (k % 60 === 0) { const a = rand() * Math.PI * 2; du = Math.cos(a); dv = Math.sin(a); }
        const since = w.b.sinceCast;
        before.set(w.g.cast);
        stepBurrower(w.b, w.s, w.g, w.o, du, dv, DT);
        if (w.b.sinceCast < since) {
          if (size >= 0) sizes.push(size);
          size = 0;
        }
        if (size >= 0) for (let i = 0; i < before.length; i++) if (w.g.cast[i] && !before[i]) size++;
      }
      if (size >= 0 && w.b.castLeft === 0) sizes.push(size);
    }
    expect(sizes.length).toBeGreaterThan(60);
    expect(sizes.filter((n) => n === 0).length / sizes.length).toBeLessThanOrEqual(0.03);
    expect(sizes.reduce((a, n) => a + n, 0) / sizes.length).toBeGreaterThanOrEqual(3);
  });

  it('peristalsis runs faster per unit moved while eating (spec 6)', () => {
    const rate = (dug: boolean) => {
      const w = setup(-4, midOf(B_F));
      if (dug) tunnel(w, -7, 4);
      run(w, 1, 0, 60);
      const p0 = w.b.wave.phase;
      const u0 = w.b.u[0];
      run(w, 1, 0, 60);
      expect(w.b.eating).toBe(!dug);
      return (w.b.wave.phase - p0) / (w.b.u[0] - u0);
    };
    expect(rate(false)).toBeGreaterThan(rate(true) * 1.4);
  });
});
