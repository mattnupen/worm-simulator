import { describe, it, expect } from 'vitest';
import { createBurrower, placeBurrower, stepBurrower, type Burrower } from '../../src/underground/burrowMotion';
import { createSoilGrid, fillSoilGrid, cellAt } from '../../src/underground/soilGrid';
import { markSolids, solidDepth } from '../../src/underground/solids';
import { boundaryAt, B_TOP, B_H, B_A } from '../../src/underground/slab';
import { BODY_RADIUS, SPACING, WORM_SEGMENTS } from '../../src/game/crawl';
import { createBody } from '../../src/worm/body';
import { canDigAt } from '../../src/underground/digSpot';
import { mulberry32 } from '../../src/core/random';
import { DT, N, hit, setup, midOf } from './burrowWorld';
import { makeGame, digDown, press, run, until } from './burrowPlay';
import type { Vec2 } from '../../src/core/vec';

// The body frame to frame (Matt notices jitter; the head's own tests are burrowMotion.jitter.test.ts).
// The body follows the head through its tunnel (bodyTrail.ts), rounded where the head's path has a
// corner (a stone or root it slid round, a turn on the spot), so the worm never shows an elbow, and
// the bend at a point changes smoothly as the body flows past such a corner.

/** Bend (radians, signed) at each body point 1..N-2 between its segments either side. */
function bends(b: Burrower, out: number[]): number[] {
  for (let i = 1; i < N - 1; i++) {
    const a1 = Math.atan2(b.v[i] - b.v[i - 1], b.u[i] - b.u[i - 1]);
    const a2 = Math.atan2(b.v[i + 1] - b.v[i], b.u[i + 1] - b.u[i]);
    let d = a2 - a1;
    d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
    out[i - 1] = d;
  }
  return out;
}

/**
 * Per frame: the sharpest bend (the neck's apart); whether an isolated elbow shows (> 0.6, both
 * neighbours < 0.2); each bend's change; each point's second difference (a jolt shows there).
 */
class BodyWatch {
  sharpest: number[] = [];
  neck: number[] = [];
  elbows = 0;
  frames = 0;
  change: number[] = [];
  accel: number[] = [];
  private last: number[] | null = null;
  private now: number[] = new Array(N - 2).fill(0);
  private p1: number[] | null = null;
  private p2: number[] | null = null;
  frame(b: Burrower, fresh = false): void {
    const c = bends(b, this.now);
    let most = 0;
    let elbow = false;
    this.neck.push(Math.abs(c[0]));
    // From the point after the neck back (the bend at the neck is the head's own turning: the head
    // turns at most MAX_NECK_BEND off its neck, burrowMotion.ts).
    for (let j = 1; j < c.length; j++) {
      most = Math.max(most, Math.abs(c[j]));
      if (Math.abs(c[j]) > 0.6 && Math.abs(c[j - 1]) < 0.2 && (j === c.length - 1 || Math.abs(c[j + 1]) < 0.2)) elbow = true;
      if (this.last && !fresh) this.change.push(Math.abs(c[j] - this.last[j]));
    }
    this.sharpest.push(most);
    if (elbow) this.elbows++;
    this.frames++;
    this.last = c.slice();
    const pos = [...b.u, ...b.v];
    if (fresh) this.p1 = this.p2 = null;
    if (this.p1 && this.p2) {
      for (let i = 0; i < N; i++) this.accel.push(Math.hypot(pos[i] - 2 * this.p1[i] + this.p2[i], pos[N + i] - 2 * this.p1[N + i] + this.p2[N + i]));
    }
    this.p2 = this.p1;
    this.p1 = pos;
  }
}
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
function report(name: string, w: BodyWatch): { sharp99: number; elbowShare: number; ch99: number; acc99: number } {
  const r = { sharp99: q(w.sharpest, 0.99), elbowShare: w.elbows / w.frames, ch99: q(w.change, 0.99), acc99: q(w.accel, 0.99) };
  if (process.env.BODY_REPORT) {
    process.stderr.write(`\n${name}: frames ${w.frames}; neck p99 ${q(w.neck, 0.99).toFixed(2)}; sharpest p50 ${q(w.sharpest, 0.5).toFixed(2)} p99 ${r.sharp99.toFixed(2)} max ${q(w.sharpest, 1).toFixed(2)}; isolated elbows ${(100 * r.elbowShare).toFixed(2)}%; change p99 ${r.ch99.toFixed(3)} p999 ${q(w.change, 0.999).toFixed(3)}; second difference p99 ${r.acc99.toFixed(4)} max ${q(w.accel, 1).toFixed(4)}`);
  }
  return r;
}

/** Steers at each stone and root from both sides for 4 s (it slides along it or stops). */
function slides(w: BodyWatch): void {
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
        for (const slant of [-0.5, 0, 0.5]) {
          const u0 = cu - side * (r + 0.8);
          const v0 = cv + slant * 0.4;
          const us = Array.from({ length: N }, (_, j) => u0 - side * SPACING * j);
          // The whole body starts clear of blockers and under the top (a body laid through a stone
          // is pushed out of it point by point: a bent start, not a bend the trail made).
          if (us.some((x) => solidDepth(o, x, v0, BODY_RADIUS + 0.05, hit) > 0 || v0 > boundaryAt(s, B_TOP, x) - 0.5)) continue;
          const g = createSoilGrid();
          fillSoilGrid(g, s);
          markSolids(g, o);
          const b = createBurrower();
          placeBurrower(b, us, us.map(() => v0), side > 0 ? 0 : Math.PI, { phase: 0, activity: 0 });
          for (let st = 0; st < 240; st++) {
            stepBurrower(b, s, g, o, cu - b.u[0], cv - b.v[0], DT);
            w.frame(b, st === 0);
          }
        }
      }
    }
  }
}

/** A new way every second, anywhere round the clock: turns on the spot and U-turns. */
function tightTurns(w: BodyWatch): void {
  for (let seed = 1; seed <= 8; seed++) {
    const rand = mulberry32(seed);
    const x = setup(0, midOf(B_H), true, seed);
    let du = 1;
    let dv = 0;
    for (let k = 0; k < 60 * 20; k++) {
      if (k % 60 === 0) { const a = rand() * Math.PI * 2; du = Math.cos(a); dv = Math.sin(a); }
      stepBurrower(x.b, x.s, x.g, x.o, du, dv, DT);
      w.frame(x.b, k === 0);
    }
  }
}

/** The arrow keys held a few seconds each, eight ways, in the real game from its dig down. */
function keys(w: BodyWatch): void {
  const plan: [Vec2, number][] = [[{ x: 0, y: -1 }, 1.5], [{ x: 1, y: -1 }, 3], [{ x: 1, y: 0 }, 3], [{ x: 1, y: 1 }, 2.5], [{ x: 0, y: 1 }, 1.2],
    [{ x: -1, y: 1 }, 2], [{ x: -1, y: 0 }, 4], [{ x: -1, y: -1 }, 3.5], [{ x: 0, y: -1 }, 1.5], [{ x: 1, y: -1 }, 2.5], [{ x: 1, y: 0 }, 3],
    [{ x: 0, y: 0 }, 0.6], [{ x: 0, y: -1 }, 2.5], [{ x: -1, y: -1 }, 3], [{ x: -1, y: 0 }, 2]];
  for (let seed = 0; seed < 4; seed++) {
    const { game } = makeGame();
    run(game, 0.3 + seed * 0.7, { x: 0.5 * ((seed % 3) - 1), y: 1 });
    for (let k = 0; k < 100 && game.prompt !== 'digDown'; k++) run(game, 0.1, { x: 0.4, y: 1 });
    if (game.prompt !== 'digDown') continue;
    digDown(game);
    let first = true;
    for (const [m, sec] of plan) run(game, sec, m, () => { w.frame(game.worm, first); first = false; });
  }
}

/**
 * Backing up out of dead ends in the real game (as burrowBack.test.ts): wandering, often up into the
 * top, then each of 8 ways in turn; watched only on steps it backed up and the second after.
 */
function backing(w: BodyWatch, pops: { worst: number; ends: number }): void {
  const rand = mulberry32(7);
  let visits = 0;
  for (let tries = 0; visits < 6 && tries < 300; tries++) {
    const x = (rand() - 0.5) * 30;
    const z = (rand() - 0.5) * 30;
    const h = rand() * 6.28;
    if (!canDigAt(x, z, h, createBody(WORM_SEGMENTS, SPACING, { x, y: 0, z }, h))) continue;
    visits++;
    const { crawl, game } = makeGame();
    crawl.reset(crawl.hero.count, createBody(WORM_SEGMENTS, SPACING, { x, y: 0, z }, h), h);
    run(game, 0.2);
    press(game);
    until(game, 'underground');
    const b = game.worm;
    let after = 0;
    let was = false;
    for (let leg = 0; leg < 12; leg++) {
      const a = rand() * 6.28;
      run(game, 2 + rand() * 2, { x: Math.cos(a), y: Math.sin(a) * 0.6 + (rand() < 0.4 ? 0.6 : 0) });
      for (let k = 0; k < 8; k++) {
        const way = (k / 8) * Math.PI * 2;
        run(game, 1.5, { x: Math.cos(way), y: Math.sin(way) }, () => {
          if (b.backing) after = 60;
          if (after > 0) { w.frame(b, after === 60 && !was); after--; }
          // The step backing ends: no body point jumps back along the tunnel.
          if (was && !b.backing) {
            pops.ends++;
            for (let i = 0; i < N; i++) pops.worst = Math.max(pops.worst, Math.hypot(b.u[i] - b.prevU[i], b.v[i] - b.prevV[i]) - Math.hypot(b.u[0] - b.prevU[0], b.v[0] - b.prevV[0]));
          }
          was = b.backing;
        });
      }
    }
  }
}

// Bounds from measured values: sharpest bend p99 / frames with an isolated elbow / bend change p99
// (in brackets, follow-the-leader's, before the body followed its tunnel). Neck excluded: its bend is
// the head's own turning (MAX_NECK_BEND).
describe('the body frame to frame: no elbows, smooth bends (Matt notices jitter)', () => {
  it('sliding along stones and roots', () => {
    const w = new BodyWatch();
    slides(w);
    const r = report('stone and root slides', w);
    expect(w.frames).toBeGreaterThan(100000);
    // 0.27 (at most 0.55) / 0% / 0.002 [0.12 / 0% / 0.001].
    expect(r.sharp99).toBeLessThanOrEqual(0.35);
    expect(q(w.sharpest, 1)).toBeLessThanOrEqual(0.6);
    expect(r.elbowShare).toBeLessThan(0.001);
    expect(r.ch99).toBeLessThanOrEqual(0.01);
    expect(r.acc99).toBeLessThanOrEqual(0.001);
  });

  it('tight turns and U-turns', () => {
    const w = new BodyWatch();
    tightTurns(w);
    const r = report('tight turns', w);
    // 0.94 / 0.18% / 0.047 [3.09 / 6.13% / 0.059].
    expect(r.sharp99).toBeLessThanOrEqual(1.05);
    expect(r.elbowShare).toBeLessThan(0.005);
    expect(r.ch99).toBeLessThanOrEqual(0.06);
    expect(r.acc99).toBeLessThanOrEqual(0.003);
  });

  it('the arrow keys, eight ways, in the game', () => {
    const w = new BodyWatch();
    keys(w);
    const r = report('keys', w);
    expect(w.frames).toBeGreaterThan(8000);
    // 0.57 / 0% / 0.030 [0.66 / 1.42% / 0.011].
    expect(r.sharp99).toBeLessThanOrEqual(0.65);
    expect(r.elbowShare).toBeLessThan(0.001);
    expect(r.ch99).toBeLessThanOrEqual(0.04);
    expect(r.acc99).toBeLessThanOrEqual(0.002);
  });

  it('backing up, and as it ends no point jumps', () => {
    const w = new BodyWatch();
    const pops = { worst: 0, ends: 0 };
    backing(w, pops);
    const r = report('backing', w);
    if (process.env.BODY_REPORT) process.stderr.write(`\nbacking ends ${pops.ends}, worst extra step at the end ${pops.worst.toFixed(4)}`);
    // Every time backing ends, no point steps more than the head does (a tail pop was 0.022 u).
    expect(pops.ends).toBeGreaterThan(5);
    expect(pops.worst).toBeLessThan(0.003);
    // 1.13 / 0% / 0.057 [3.08 / 5.48% / 0.053].
    expect(r.sharp99).toBeLessThanOrEqual(1.25);
    expect(r.elbowShare).toBeLessThan(0.005);
    expect(r.ch99).toBeLessThanOrEqual(0.065);
    expect(r.acc99).toBeLessThanOrEqual(0.008);
  });

  it('just arrived and idle: no body point moves (the tail popped about 0.022 u on the first step)', () => {
    let tested = 0;
    for (let seed = 0; seed < 4; seed++) {
      const { game } = makeGame();
      run(game, 0.3 + seed * 0.7, { x: 0.5 * ((seed % 3) - 1), y: 1 });
      for (let k = 0; k < 100 && game.prompt !== 'digDown'; k++) run(game, 0.1, { x: 0.4, y: 1 });
      if (game.prompt !== 'digDown') continue;
      digDown(game);
      tested++;
      const b = game.worm;
      let first = 0;
      let later = 0;
      let k = 0;
      run(game, 1, { x: 0, y: 0 }, () => {
        for (let i = 0; i < N; i++) {
          const d = Math.hypot(b.u[i] - b.prevU[i], b.v[i] - b.prevV[i]);
          if (k === 0) first = Math.max(first, d);
          else later = Math.max(later, d);
        }
        k++;
      });
      // The step it arrives on settles by under a thousandth of a unit, then nothing moves.
      expect(first, `seed ${seed}`).toBeLessThan(1e-3);
      expect(later, `seed ${seed}`).toBe(0);
      // ...and the whole body lies in its open tunnel.
      for (let i = 0; i < N; i++) expect(game.grid.open[cellAt(game.grid, b.u[i], b.v[i])], `seed ${seed} point ${i}`).toBe(1);
    }
    expect(tested).toBeGreaterThanOrEqual(3);
  });
});
