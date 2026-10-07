import { describe, it, expect } from 'vitest';
import { createBurrower, placeBurrower, stepBurrower, DIG_TURN, TOP_KEEP, TUNNEL_R } from '../../src/underground/burrowMotion';
import { boundaryAt, B_TOP, B_F, B_H, B_A } from '../../src/underground/slab';
import { createSoilGrid, fillSoilGrid, digDisc } from '../../src/underground/soilGrid';
import { markSolids, solidDepth } from '../../src/underground/solids';
import { BODY_RADIUS, SPACING } from '../../src/game/crawl';
import { mulberry32 } from '../../src/core/random';
import { DT, N, SEEN, hit, setup, run, midOf, watch } from './burrowWorld';

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
            stepBurrower(b, s, g, o, cu - b.u[0], cv - b.v[0], DT);
            h.step();
          }
          // It got there: pressed against the blocker it was steered at.
          expect(solidDepth(o, b.u[0], b.v[0], BODY_RADIUS + 0.03, hit)).toBeGreaterThan(0);
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

  it('eases to a stop at the slab\'s ends, its bottom and the top: no glass wall, even at full speed', () => {
    /** The worst change of step length from one frame to the next, and how far it went, at top speed in its own tunnel. */
    const stop = (vertical: number, du: number, dv: number) => {
      const w = setup(4, midOf(B_A), false, 5);
      const ate = { cells: 0, organic: 0 };
      if (vertical) {
        // Lying straight up or down a tunnel dug the whole height of the slab.
        const v0 = midOf(B_A)(w.s);
        const us = Array.from({ length: N }, () => 4);
        placeBurrower(w.b, us, us.map((_, i) => v0 - vertical * SPACING * i), (vertical * Math.PI) / 2, { phase: 0, activity: 0 });
        for (let v = w.s.bottom; v < boundaryAt(w.s, B_TOP, 4); v += 0.05) digDisc(w.g, 4, v, TUNNEL_R, ate);
      } else {
        for (let u = w.s.playLo; u <= w.s.playHi; u += 0.05) digDisc(w.g, u, w.b.v[0], TUNNEL_R, ate);
      }
      let prev = 0;
      let worst = 0;
      let top = 0;
      run(w, du, dv, 60 * 12, () => {
        const len = Math.hypot(w.b.u[0] - w.b.prevU[0], w.b.v[0] - w.b.prevV[0]);
        worst = Math.max(worst, Math.abs(len - prev));
        top = Math.max(top, len);
        prev = len;
      });
      return { worst, top, w };
    };
    for (const [vertical, du, dv] of [[0, 1, 0], [1, 0, 1], [-1, 0, -1]] as const) {
      const { worst, top, w } = stop(vertical, du, dv);
      // It was going at tunnel speed, and it came to rest at the limit...
      expect(top).toBeGreaterThan(1.3 * DT);
      expect(Math.hypot(w.b.u[0] - w.b.prevU[0], w.b.v[0] - w.b.prevV[0])).toBeLessThan(SEEN / 10);
      if (du) expect(w.b.u[0]).toBeGreaterThan(w.s.playHi - 0.3);
      else if (dv > 0) expect(w.b.v[0]).toBeGreaterThan(boundaryAt(w.s, B_TOP, w.b.u[0]) - TOP_KEEP - 0.1);
      else expect(w.b.v[0]).toBeLessThan(w.s.bottom + 0.4);
      // ...slowing by under 8% of tunnel speed a frame, over about half a second (a one-frame
      // stop is 100%).
      expect(worst).toBeLessThan(1.4 * DT * 0.08);
    }
  });

  it('steered slantwise into the top, it slides along under the leaves instead of stopping', () => {
    const w = setup(-4, midOf(B_F), false, 5);
    run(w, 0, 1, 60 * 3);
    const from = w.b.u[0];
    run(w, 1, 0.3, 60 * 2);
    expect(w.b.u[0] - from).toBeGreaterThan(0.8);
    expect(w.b.v[0]).toBeGreaterThan(boundaryAt(w.s, B_TOP, w.b.u[0]) - TOP_KEEP - 0.15);
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
