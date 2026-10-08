import { describe, it, expect } from 'vitest';
import { createBurrower, placeBurrower, stepBurrower, TUNNEL_R, type Burrower } from '../../src/underground/burrowMotion';

const ate = { cells: 0, organic: 0 };
import { createSoilGrid, fillSoilGrid, digDisc, type SoilGrid } from '../../src/underground/soilGrid';
import { markSolids, solidDepth } from '../../src/underground/solids';
import { boundaryAt, B_TOP, B_H, B_A } from '../../src/underground/slab';
import { BODY_RADIUS, SPACING, WORM_SEGMENTS } from '../../src/game/crawl';
import { createBody } from '../../src/worm/body';
import { canDigAt } from '../../src/underground/digSpot';
import { mulberry32 } from '../../src/core/random';
import { DT, N, hit, setup, midOf, tunnel, strayOf } from './burrowWorld';
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
  /** The shortest the body was (sum of its segments) and its shortest segment, over all frames. */
  minLength = Infinity;
  minSegment = Infinity;
  /** How far each body point (past the head) sat outside open tunnel, every frame. */
  stray: number[] = [];
  private last: number[] | null = null;
  private now: number[] = new Array(N - 2).fill(0);
  private p1: number[] | null = null;
  private p2: number[] | null = null;
  frame(b: Burrower, g: SoilGrid, fresh = false): void {
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
    for (let i = 1; i < N; i++) this.stray.push(strayOf(g, b.u[i], b.v[i]));
    let len = 0;
    for (let i = 1; i < N; i++) {
      const d = Math.hypot(b.u[i] - b.u[i - 1], b.v[i] - b.v[i - 1]);
      len += d;
      this.minSegment = Math.min(this.minSegment, d);
    }
    this.minLength = Math.min(this.minLength, len);
  }
}

/**
 * The body keeps its length in every frame: 15 x SPACING within 5%, no segment under `segment` x
 * SPACING (0.9: a link may go 5% slack before it is pushed out, burrowBack.ts drawLink).
 */
const NOMINAL = (N - 1) * SPACING;
function keepsLength(w: BodyWatch, segment = 0.9): void {
  expect(w.minLength).toBeGreaterThanOrEqual(0.95 * NOMINAL);
  expect(w.minSegment).toBeGreaterThanOrEqual(segment * SPACING);
}
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
function report(name: string, w: BodyWatch): { sharp99: number; elbowShare: number; ch99: number; acc99: number; stray99: number } {
  const r = { sharp99: q(w.sharpest, 0.99), elbowShare: w.elbows / w.frames, ch99: q(w.change, 0.99), acc99: q(w.accel, 0.99), stray99: q(w.stray, 0.99) };
  if (process.env.BODY_REPORT) {
    process.stderr.write(`\n${name}: frames ${w.frames}; neck p99 ${q(w.neck, 0.99).toFixed(2)}; sharpest p50 ${q(w.sharpest, 0.5).toFixed(2)} p99 ${r.sharp99.toFixed(2)} max ${q(w.sharpest, 1).toFixed(2)}; isolated elbows ${(100 * r.elbowShare).toFixed(2)}%; change p99 ${r.ch99.toFixed(3)} p999 ${q(w.change, 0.999).toFixed(3)}; second difference p99 ${r.acc99.toFixed(4)} max ${q(w.accel, 1).toFixed(4)}; length min ${w.minLength.toFixed(2)} segment min ${w.minSegment.toFixed(3)}; stray p99 ${q(w.stray, 0.99).toFixed(3)} max ${q(w.stray, 1).toFixed(3)}`);
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
          // The whole body starts in the slab, clear of blockers and under the top (a body laid through a stone
          // is pushed out of it point by point: a bent start, not a bend the trail made).
          if (us.some((x) => x < s.playLo || x > s.playHi || solidDepth(o, x, v0, BODY_RADIUS + 0.05, hit) > 0 || v0 > boundaryAt(s, B_TOP, x) - 0.5)) continue;
          const g = createSoilGrid();
          fillSoilGrid(g, s);
          markSolids(g, o);
          const b = createBurrower();
          placeBurrower(b, us, us.map(() => v0), side > 0 ? 0 : Math.PI, { phase: 0, activity: 0 });
          // The tunnel it lies in (as digging down leaves it).
          for (let j = 0; j < N; j++) digDisc(g, us[j], v0, TUNNEL_R, ate);
          for (let st = 0; st < 240; st++) {
            stepBurrower(b, s, g, o, cu - b.u[0], cv - b.v[0], DT);
            w.frame(b, g, st === 0);
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
    tunnel(x, x.b.u[N - 1], x.b.u[0]);
    let du = 1;
    let dv = 0;
    for (let k = 0; k < 60 * 20; k++) {
      if (k % 60 === 0) { const a = rand() * Math.PI * 2; du = Math.cos(a); dv = Math.sin(a); }
      stepBurrower(x.b, x.s, x.g, x.o, du, dv, DT);
      w.frame(x.b, x.g, k === 0);
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
    for (const [m, sec] of plan) run(game, sec, m, () => { w.frame(game.worm, game.grid, first); first = false; });
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
          if (after > 0) { w.frame(b, game.grid, after === 60 && !was); after--; }
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

/** Dug down in the real game at `spot` (0..): the game, ready underground. */
function dugAt(spot: number) {
  const { game } = makeGame();
  run(game, 0.3 + spot * 0.7, { x: 0.5 * ((spot % 3) - 1), y: 1 });
  for (let k = 0; k < 100 && game.prompt !== 'digDown'; k++) run(game, 0.1, { x: 0.4, y: 1 });
  if (game.prompt !== 'digDown') return null;
  digDown(game);
  return game;
}

/** The stick turned slowly round and round (0.02 rad a step) for 10 s: the worm digs a coil. */
function slowRotation(w: BodyWatch): number {
  let tested = 0;
  for (let spot = 0; spot < 4; spot++) {
    const game = dugAt(spot);
    if (!game) continue;
    tested++;
    let a = 0;
    let first = true;
    for (let k = 0; k < 600; k++) {
      a += 0.02;
      game.step(DT, { x: Math.cos(a), y: Math.sin(a) }, false);
      w.frame(game.worm, game.grid, first);
      first = false;
    }
  }
  return tested;
}

/** An analog stick wandering smoothly (its way and how far it is pushed), let go now and then, 40 s. */
function wandering(w: BodyWatch): number {
  let tested = 0;
  for (let spot = 0; spot < 6; spot++) {
    const game = dugAt(spot);
    if (!game) continue;
    tested++;
    const rand = mulberry32(spot + 11);
    const f1 = 0.2 + rand() * 0.5;
    const f2 = 0.5 + rand() * 0.9;
    const ph = rand() * 6.28;
    let first = true;
    for (let k = 0; k < 60 * 40; k++) {
      const t = k * DT;
      const a = ph + 2.2 * Math.sin(f1 * t) + 1.3 * Math.sin(f2 * t + 1);
      const m = Math.sin(0.31 * t + ph) > 0.85 ? 0 : 0.35 + 0.65 * Math.abs(Math.sin(0.23 * t + 2 * ph));
      game.step(DT, { x: m * Math.cos(a), y: m * Math.sin(a) }, false);
      w.frame(game.worm, game.grid, first);
      first = false;
    }
  }
  return tested;
}

// Bounds from measured values (follow the leader, the body digging nothing): sharpest bend p99,
// frames with an isolated elbow, bend change p99, each point's second difference p99, and how far
// body points sit outside open tunnel (stray) p99. The neck's bend is the head's own turning
// (MAX_NECK_BEND) and left out. In a coil or a U-turn the chain folds, as it always did
// (follow-the-leader before 65f4d89: sharpest p99 3.09 in tight turns): those have no sharpest bound.
describe('the body frame to frame: smooth, no elbows, its length kept (Matt notices jitter)', () => {
  it('sliding along stones and roots', () => {
    const w = new BodyWatch();
    slides(w);
    const r = report('stone and root slides', w);
    expect(w.frames).toBeGreaterThan(100000);
    // 0.13 (at most 0.34) / 0% / 0.001 / 0.0005 / 0.
    expect(r.sharp99).toBeLessThanOrEqual(0.2);
    expect(q(w.sharpest, 1)).toBeLessThanOrEqual(0.45);
    expect(r.elbowShare).toBeLessThan(0.001);
    expect(r.ch99).toBeLessThanOrEqual(0.005);
    expect(r.acc99).toBeLessThanOrEqual(0.001);
    expect(r.stray99).toBeLessThanOrEqual(0.01);
    keepsLength(w);
  });

  it('tight turns and U-turns', () => {
    const w = new BodyWatch();
    tightTurns(w);
    const r = report('tight turns', w);
    // 0.48% / 0.025 / 0.0007 / 0.19.
    expect(r.elbowShare).toBeLessThan(0.01);
    expect(r.ch99).toBeLessThanOrEqual(0.04);
    expect(r.acc99).toBeLessThanOrEqual(0.002);
    expect(r.stray99).toBeLessThanOrEqual(0.25);
    keepsLength(w);
  });

  it('the arrow keys, eight ways, in the game', () => {
    const w = new BodyWatch();
    keys(w);
    const r = report('keys', w);
    expect(w.frames).toBeGreaterThan(8000);
    // 0.89 / 0.43% / 0.012 / 0.0006 / 0.19.
    expect(r.sharp99).toBeLessThanOrEqual(1.0);
    expect(r.elbowShare).toBeLessThan(0.01);
    expect(r.ch99).toBeLessThanOrEqual(0.02);
    expect(r.acc99).toBeLessThanOrEqual(0.001);
    expect(r.stray99).toBeLessThanOrEqual(0.25);
    keepsLength(w);
  });

  it('backing up, and as it ends no point jumps', () => {
    const w = new BodyWatch();
    const pops = { worst: 0, ends: 0 };
    backing(w, pops);
    const r = report('backing', w);
    if (process.env.BODY_REPORT) process.stderr.write(`\nbacking ends ${pops.ends}, worst extra step at the end ${pops.worst.toFixed(4)}`);
    // As backing ends no point steps much more than the head does (0.0025 u; a tail pop was 0.022).
    expect(pops.ends).toBeGreaterThan(5);
    expect(pops.worst).toBeLessThan(0.005);
    // 1.05% / 0.056 / 0.0023 / 0.16 (follow-the-leader before 65f4d89: 5.5% / 0.053 / 0.0025).
    expect(r.elbowShare).toBeLessThan(0.02);
    expect(r.ch99).toBeLessThanOrEqual(0.07);
    expect(r.acc99).toBeLessThanOrEqual(0.004);
    expect(r.stray99).toBeLessThanOrEqual(0.22);
    // Backed into a dead end, a link the stones or the top push in on may close up to 0.78 x SPACING.
    keepsLength(w, 0.75);
  });

  it('the stick turned slowly round and round: it keeps its length', () => {
    const w = new BodyWatch();
    expect(slowRotation(w)).toBeGreaterThanOrEqual(3);
    const r = report('slow rotation', w);
    // 0.13% / 0.047 / 0.0007 / 0.08.
    expect(r.elbowShare).toBeLessThan(0.005);
    expect(r.ch99).toBeLessThanOrEqual(0.06);
    expect(r.acc99).toBeLessThanOrEqual(0.001);
    expect(r.stray99).toBeLessThanOrEqual(0.12);
    keepsLength(w);
  });

  it('an analog stick wandering smoothly, let go now and then: the body keeps its length, at rest too', () => {
    const w = new BodyWatch();
    expect(wandering(w)).toBeGreaterThanOrEqual(4);
    const r = report('wandering stick', w);
    // 0.80% / 0.024 / 0.0006 / 0.23.
    expect(r.elbowShare).toBeLessThan(0.01);
    expect(r.ch99).toBeLessThanOrEqual(0.04);
    expect(r.acc99).toBeLessThanOrEqual(0.001);
    expect(r.stray99).toBeLessThanOrEqual(0.3);
    keepsLength(w);
  });

  it('just arrived and idle: no body point moves after the first step', () => {
    let tested = 0;
    for (let seed = 0; seed < 4; seed++) {
      const game = dugAt(seed);
      if (!game) continue;
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
      // The step it arrives on draws the links out to their length (under a hundredth of a unit), then nothing moves.
      expect(first, `seed ${seed}`).toBeLessThan(0.01);
      expect(later, `seed ${seed}`).toBe(0);
    }
    expect(tested).toBeGreaterThanOrEqual(3);
  });
});
