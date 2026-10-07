import { describe, it, expect } from 'vitest';
import {
  createBurrower, placeBurrower, stepBurrower, DIG_TURN, TOP_KEEP, CAST_EVERY, TUNNEL_R, type Burrower,
} from '../../src/underground/burrowMotion';
import { createSlab, boundaryAt, B_TOP, B_F, B_H, B_A, B_E, type Slab } from '../../src/underground/slab';
import { createSoilGrid, fillSoilGrid, digDisc, type SoilGrid } from '../../src/underground/soilGrid';
import { createSolids, placeSolids, markSolids, solidDepth, STONE_STRIDE, type Solids } from '../../src/underground/solids';
import { BODY_RADIUS, SPACING } from '../../src/game/crawl';
import { mulberry32 } from '../../src/core/random';

const DT = 1 / 60;
const N = 16;
const hit = { nu: 0, nv: 0 };

interface World { s: Slab; g: SoilGrid; o: Solids; b: Burrower }

/**
 * A slab with no blockers (unless `solids`), the worm lying straight with its head at (u, v) facing
 * +u; with blockers, moved along the cut (by up to 4 u) until no body point is in one.
 */
function setup(u: number, v: (s: Slab) => number, solids = false, seed = 3): World {
  const s = createSlab(0, 0, 0, 1, seed);
  const g = createSoilGrid();
  fillSoilGrid(g, s);
  const o = createSolids();
  if (solids) { placeSolids(s, o); markSolids(g, o); }
  const b = createBurrower();
  const vv = v(s);
  const clear = (at: number) => Array.from({ length: N }, (_, i) => at - SPACING * i)
    .every((x) => solidDepth(o, x, vv, BODY_RADIUS, hit) <= 0);
  for (let k = 0; solids && k < 80 && !clear(u); k++) u += k % 2 ? 0.1 * k : -0.1 * k;
  const us = Array.from({ length: N }, (_, i) => u - SPACING * i);
  placeBurrower(b, us, us.map(() => vv), 0, { phase: 0, activity: 0 });
  return { s, g, o, b };
}

const run = (w: World, du: number, dv: number, steps: number, each?: () => void) => {
  for (let k = 0; k < steps; k++) { stepBurrower(w.b, w.s, w.g, w.o, du, dv, DT); each?.(); }
};
/** Digs a straight open tunnel along the worm's depth from u0 to u1. */
function tunnel(w: World, u0: number, u1: number): void {
  const ate = { cells: 0, organic: 0 };
  for (let u = u0; u <= u1; u += 0.05) digDisc(w.g, u, w.b.v[0], TUNNEL_R, ate);
}
const midOf = (k: number) => (s: Slab) => (boundaryAt(s, k, 0) + boundaryAt(s, k + 1, 0)) / 2;

/** Mean speed over the last second of a 2 s straight run through one layer. */
function speedIn(k: number): number {
  const w = setup(-4, midOf(k));
  run(w, 1, 0, 60);
  const from = w.b.u[0];
  run(w, 1, 0, 60);
  return w.b.u[0] - from;
}

/**
 * Frame-to-frame watcher of the head (Matt notices jitter): its steps, the turn of its facing, and
 * the oscillations a viewer would see: a step that reverses the last one, or a turn that flips
 * one way, back and forth again within a few frames. Steps under SEEN (about a tenth of a pixel
 * in the Close view, 6 u across 768 px) are too small to see: a head pressed into a stone or the
 * top creeps along it by less than that, and turns the way the stick turns.
 */
const SEEN = 1e-3;
function watch(b: Burrower) {
  const st = { pu: 0, pv: 0, lastU: b.u[0], lastV: b.v[0], lastDir: b.dir, turn: 0, flips: [] as number[], k: 0,
    reversals: 0, wobbles: 0, maxStep: 0, maxTurn: 0, maxAccel: 0 };
  return Object.assign(st, {
    step(): void {
      const su = b.u[0] - st.lastU;
      const sv = b.v[0] - st.lastV;
      const len = Math.hypot(su, sv);
      const pl = Math.hypot(st.pu, st.pv);
      if (len > SEEN && pl > SEEN && su * st.pu + sv * st.pv < 0) st.reversals++;
      st.maxAccel = Math.max(st.maxAccel, Math.hypot(su - st.pu, sv - st.pv));
      st.maxStep = Math.max(st.maxStep, len);
      const turn = b.dir - st.lastDir;
      st.maxTurn = Math.max(st.maxTurn, Math.abs(turn));
      if (Math.abs(turn) > 1e-4) {
        if (st.turn !== 0 && Math.sign(turn) !== st.turn) {
          // A flip back within 4 frames of the last flip is a wobble.
          if (st.flips.length && st.k - st.flips[st.flips.length - 1] <= 4) st.wobbles++;
          st.flips.push(st.k);
        }
        st.turn = Math.sign(turn);
      }
      st.pu = su; st.pv = sv;
      st.lastU = b.u[0]; st.lastV = b.v[0]; st.lastDir = b.dir;
      st.k++;
    },
  });
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

describe('no jitter (frame to frame)', () => {
  it('moves smoothly over a seed sweep: no jumps, no reversals, no wobble, bounded turning', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rand = mulberry32(seed);
      const w = setup(rand() * 4 - 2, midOf(B_H), true, seed);
      const h = watch(w.b);
      let du = 0;
      let dv = -1;
      for (let k = 0; k < 60 * 20; k++) {
        if (k % 30 === 0) { const a = rand() * Math.PI * 2; du = Math.cos(a); dv = Math.sin(a); }
        stepBurrower(w.b, w.s, w.g, w.o, du, dv, DT);
        h.step();
        for (let i = 0; i < N; i++) {
          expect(Math.hypot(w.b.u[i] - w.b.prevU[i], w.b.v[i] - w.b.prevV[i])).toBeLessThanOrEqual(1.4 * DT + 0.005);
          // The whole body stays out of stones, roots and the sections, and under the top.
          expect(solidDepth(w.o, w.b.u[i], w.b.v[i], BODY_RADIUS, hit)).toBeLessThanOrEqual(1e-5);
          expect(w.b.v[i]).toBeLessThanOrEqual(boundaryAt(w.s, B_TOP, w.b.u[i]) - TOP_KEEP + 1e-5);
        }
        expect(w.b.u[0]).toBeGreaterThanOrEqual(w.s.playLo);
        expect(w.b.u[0]).toBeLessThanOrEqual(w.s.playHi);
      }
      expect(h.maxStep).toBeLessThanOrEqual(1.4 * DT + 1e-6);
      expect(h.maxTurn).toBeLessThanOrEqual(DIG_TURN * DT * 1.6);
      // The step changes by at most a full step (a stop at a stone), never more (a bounce).
      expect(h.maxAccel).toBeLessThanOrEqual(1.4 * DT * 1.05);
      expect(h.reversals).toBe(0);
      expect(h.wobbles).toBe(0);
    }
  });

  it('speed never surges or ripples frame to frame, even through castings and layer lines', () => {
    let ripples = 0;
    let worst = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const w = setup(-7, midOf(B_F), false, seed);
      // Out along F, back through its own tunnel and castings, out again, then down through every layer.
      const legs = [[1, 0, 600], [-1, -0.05, 720], [1, 0.05, 720], [0.2, -1, 480]] as const;
      for (const [du, dv, steps] of legs) {
        let prev = -1;
        let pd = 0;
        for (let k = 0; k < steps; k++) {
          stepBurrower(w.b, w.s, w.g, w.o, du, dv, DT);
          const len = Math.hypot(w.b.u[0] - w.b.prevU[0], w.b.v[0] - w.b.prevV[0]);
          const d = prev < 0 ? 0 : len - prev;
          worst = Math.max(worst, Math.abs(d));
          // Once it is going (after its turn): speeding up and slowing down by turns is a ripple.
          if (k > 90 && Math.abs(d) > 2e-5 && Math.abs(pd) > 2e-5 && Math.sign(d) !== Math.sign(pd)) ripples++;
          if (k > 90) pd = d;
          prev = len;
        }
      }
    }
    // The speed eases (in two stages): at most about 4% of top speed per frame, even when the stick
    // turns right round, and it settles instead of flickering as the head crosses cells of open
    // tunnel, castings and fresh soil (one cell felt, eased once: over 1000 ripples here).
    expect(worst).toBeLessThan(1.4 * DT * 0.04);
    expect(ripples).toBeLessThanOrEqual(10);
  });

  it('pushing into a stone or a big root: it stops or slides, never bounces or buzzes', () => {
    let tested = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const base = setup(0, midOf(B_A), true, seed);
      const { s, o } = base;
      for (let i = 0; i < o.capCount; i++) {
        const k = i * 6;
        const cu = (o.caps[k] + o.caps[k + 3]) / 2;
        const cv = (o.caps[k + 1] + o.caps[k + 4]) / 2;
        const r = Math.max(o.caps[k + 2], o.caps[k + 5]);
        if (cu < s.playLo + 2 || cu > s.playHi - 2) continue;
        for (const side of [-1, 1]) {
          const u0 = cu - side * (r + 0.8);
          if (solidDepth(o, u0, cv, BODY_RADIUS + 0.05, hit) > 0) continue;
          if (cv > boundaryAt(s, B_TOP, u0) - 0.5) continue;
          const g = createSoilGrid();
          fillSoilGrid(g, s);
          markSolids(g, o);
          const b = createBurrower();
          const us = Array.from({ length: N }, (_, j) => u0 - side * SPACING * j);
          placeBurrower(b, us, us.map(() => cv), side > 0 ? 0 : Math.PI, { phase: 0, activity: 0 });
          const h = watch(b);
          // Straight at its middle, held for 4 s.
          for (let st = 0; st < 240; st++) {
            stepBurrower(b, s, g, o, side * (cu - b.u[0]), cv - b.v[0], DT);
            h.step();
          }
          expect(h.reversals).toBe(0);
          expect(h.wobbles).toBe(0);
          expect(h.maxAccel).toBeLessThanOrEqual(1.4 * DT * 1.05);
          tested++;
        }
      }
    }
    expect(tested).toBeGreaterThan(20);
  });

  it('pushing into the top: it slides under the leaves, never bounces', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rand = mulberry32(seed);
      const w = setup(rand() * 6 - 3, midOf(B_F), true, seed);
      const h = watch(w.b);
      const du = rand() * 1.2 - 0.6;
      run(w, du, 1, 60 * 6, () => {
        h.step();
        expect(w.b.v[0]).toBeLessThanOrEqual(boundaryAt(w.s, B_TOP, w.b.u[0]) - TOP_KEEP + 1e-9);
      });
      expect(h.reversals).toBe(0);
      expect(h.wobbles).toBe(0);
    }
  });

  it('pushing into the slab\'s ends and bottom: it stops or slides along them, never bounces', () => {
    for (const [du, dv] of [[1, 0], [-1, 0.1], [0.3, -1], [-1, -1]] as const) {
      const w = setup(0, midOf(B_A), false, 5);
      const h = watch(w.b);
      run(w, du, dv, 60 * 20, () => {
        h.step();
        expect(w.b.u[0]).toBeGreaterThanOrEqual(w.s.playLo);
        expect(w.b.u[0]).toBeLessThanOrEqual(w.s.playHi);
        expect(w.b.v[0]).toBeGreaterThanOrEqual(w.s.bottom);
      });
      expect(h.reversals).toBe(0);
      expect(h.wobbles).toBe(0);
    }
  });

  it('Come up does not flicker at the near-the-top line (hysteresis), and the motion is the same there', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rand = mulberry32(seed);
      const w = setup(rand() * 4 - 2, (s) => boundaryAt(s, B_F, 0) - 0.27, false, seed);
      const h = watch(w.b);
      let toggles = 0;
      let last = w.b.nearTop;
      let lastFlipDepth = NaN;
      // Wiggling about the line: a little up, a little down, along the cut.
      for (let k = 0; k < 60 * 8; k++) {
        const dv = 0.25 * Math.sin(k * 0.21) + 0.1 * Math.sin(k * 0.05 + seed);
        stepBurrower(w.b, w.s, w.g, w.o, 1, dv, DT);
        h.step();
        const depth = boundaryAt(w.s, B_F, w.b.u[0]) - w.b.v[0];
        if (w.b.nearTop !== last) {
          toggles++;
          // On only within 0.2 of the F top; off only below 0.35.
          if (w.b.nearTop) expect(depth).toBeLessThanOrEqual(0.2 + 1e-9);
          else expect(depth).toBeGreaterThan(0.35);
          if (lastFlipDepth === lastFlipDepth) expect(Math.abs(depth - lastFlipDepth)).toBeGreaterThan(0.149);
          lastFlipDepth = depth;
          last = w.b.nearTop;
        }
      }
      expect(toggles).toBeLessThanOrEqual(4);
      expect(h.reversals).toBe(0);
      expect(h.wobbles).toBe(0);
    }
  });
});
