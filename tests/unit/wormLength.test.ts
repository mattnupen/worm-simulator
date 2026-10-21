import { afterEach, describe, it, expect } from 'vitest';
import { Crawl, SPACING, WORM_SEGMENTS } from '../../src/game/crawl';
import { createPushers, fitPushers } from '../../src/game/pushers';
import { setBodyLength, wormBody, FULL_SPACING } from '../../src/worm/bodyLength';
import { WAVES, wormLength } from '../../src/worm/wormMesh';
import type { BurrowGame } from '../../src/underground/burrowGame';
import { DT, N, STILL, UP, RIGHT, makeGame, press, run, until, digDown, steerToTop } from './burrowPlay';

// V4 spec 3: the robin's tug breaks the worm, and it goes on shorter (full, about 80%, about 60%).
// The 16 points stay; the gap between them changes at any moment, and nothing pops.

const links = (b: readonly { x: number; y: number; z: number }[]) =>
  Array.from({ length: b.length - 1 }, (_, i) => Math.hypot(b[i + 1].x - b[i].x, b[i + 1].y - b[i].y, b[i + 1].z - b[i].z));
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
/** The worm in the cut: each link's chord (u, v, off the plane). */
function cutLinks(g: BurrowGame): number[] {
  const w = g.worm;
  return Array.from({ length: N - 1 }, (_, i) => Math.hypot(w.u[i + 1] - w.u[i], w.v[i + 1] - w.v[i], g.offW[i + 1] - g.offW[i]));
}
/** Every point of the game's worm is a number, and none moved further than `most` since the last step. */
function steady(g: BurrowGame, most: number): number {
  const w = g.worm;
  let jump = 0;
  for (let i = 0; i < N; i++) {
    expect(Number.isFinite(w.u[i]) && Number.isFinite(w.v[i]) && Number.isFinite(g.offW[i])).toBe(true);
    jump = Math.max(jump, Math.hypot(w.u[i] - w.prevU[i], w.v[i] - w.prevV[i], g.offW[i] - g.prevW[i]));
  }
  expect(jump).toBeLessThan(most);
  return jump;
}

afterEach(() => setBodyLength(1));

describe('the worm\'s length (V4 spec 3)', () => {
  it('holds one length: its share, the gap, and waves per unit for a body that long', () => {
    for (const f of [1, 0.8, 0.6]) {
      setBodyLength(f);
      expect(wormBody.factor).toBe(f);
      expect(wormBody.spacing).toBeCloseTo(FULL_SPACING * f, 12);
      // The drawn body always holds WAVES waves, so each unit moved runs the wave as far as the ground goes.
      expect(wormBody.wavesPerUnit * wormLength(WORM_SEGMENTS, wormBody.spacing)).toBeCloseTo(WAVES, 12);
    }
    expect(FULL_SPACING).toBe(SPACING);
    setBodyLength(Number.NaN);
    expect(wormBody.factor).toBe(1);
    setBodyLength(0.01);
    expect(wormBody.factor).toBeGreaterThan(0.2);
  });

  it('a fresh start is at the length now, at once (a new life at 1)', () => {
    setBodyLength(0.8);
    const c = new Crawl();
    for (const l of links(c.body)) expect(l).toBeLessThanOrEqual(0.8 * SPACING + 1e-9);
    expect(sum(links(c.body))).toBeCloseTo(15 * 0.8 * SPACING, 2);
    setBodyLength(1);
    c.reset();
    expect(sum(links(c.body))).toBeCloseTo(15 * SPACING, 2);
  });

  it('on the surface the tail draws in smoothly to the new length, still or crawling', () => {
    for (const move of [STILL, UP, { x: 0.6, y: 1 }]) {
      setBodyLength(1);
      const c = new Crawl();
      for (let k = 0; k < 60; k++) c.step(DT, UP);
      setBodyLength(0.6);
      let most = 0;
      for (let k = 0; k < 60; k++) {
        const tail = { ...c.body[N - 1] };
        c.step(DT, move);
        for (const p of c.body) expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
        most = Math.max(most, Math.hypot(c.body[N - 1].x - tail.x, c.body[N - 1].z - tail.z));
      }
      // Eased over 0.4 s: the tail never jumps (1.3 u drawn in at once would).
      expect(most).toBeLessThan(0.12);
      for (const l of links(c.body)) expect(l).toBeLessThanOrEqual(0.6 * SPACING * 1.001);
      // Moving, every link is taut at the new gap.
      if (move !== STILL) expect(sum(links(c.body))).toBeCloseTo(15 * 0.6 * SPACING, 1);
    }
  });

  it('back to full on the surface: the body lengthens as the worm crawls on', () => {
    setBodyLength(0.6);
    const c = new Crawl();
    setBodyLength(1);
    for (let k = 0; k < 240; k++) c.step(DT, UP);
    expect(sum(links(c.body))).toBeCloseTo(15 * SPACING, 2);
  });

  it('placed from a longer body (shortened while coming up), it starts as laid and eases in', () => {
    setBodyLength(0.6);
    const c = new Crawl();
    const at = Array.from({ length: N }, (_, i) => ({ x: 0, y: 0, z: -SPACING * i }));
    c.reset(c.hero.count, at, 0);
    expect(c.body[N - 1].z).toBeCloseTo(-15 * SPACING, 2);
    for (let k = 0; k < 40; k++) c.step(DT, STILL);
    expect(sum(links(c.body))).toBeCloseTo(15 * 0.6 * SPACING, 2);
  });

  it('the hero leaves feel the body at its length (fitted once per change)', () => {
    const a = createPushers(WORM_SEGMENTS, 0.6 * SPACING);
    const b = createPushers(WORM_SEGMENTS, SPACING);
    fitPushers(b, 0.6 * SPACING);
    expect(Array.from(b.m)).toEqual(Array.from(a.m));
    expect(Array.from(b.half)).toEqual(Array.from(a.half));
    expect(b.ask.reach).toBe(a.ask.reach);
  });

  it('underground the links ease to the new length, still or digging, and never pop', () => {
    for (const move of [STILL, RIGHT, UP]) {
      setBodyLength(1);
      const { game } = makeGame();
      run(game, 0.5, UP);
      digDown(game);
      run(game, 0.5, RIGHT);
      setBodyLength(0.6);
      run(game, 2, move, () => steady(game, 0.12));
      const l = cutLinks(game);
      for (const x of l) expect(x).toBeLessThanOrEqual(0.6 * SPACING * 1.02);
      // Along the trail the links are exact; their chords are shorter only across a bend.
      const arcs = game.worm.trail.len;
      for (let i = 1; i < N; i++) expect(arcs[i]).toBeCloseTo(0.6 * SPACING, 2);
      expect(sum(l)).toBeGreaterThan(15 * 0.6 * SPACING * 0.85);
    }
  });

  it('no NaN or jump when the length changes mid-move: digging down, then coming up', () => {
    const { crawl, game } = makeGame();
    run(game, 0.5, UP);
    expect(game.prompt).toBe('digDown');
    press(game);
    expect(game.mode.mode).toBe('diggingDown');
    run(game, 0.6, STILL, () => steady(game, 0.2));
    setBodyLength(0.8);
    until(game, 'underground', 8, STILL, () => steady(game, 0.2));
    run(game, 1.5, RIGHT, () => steady(game, 0.12));
    for (let i = 1; i < N; i++) expect(game.worm.trail.len[i]).toBeCloseTo(0.8 * SPACING, 2);
    steerToTop(game, () => steady(game, 0.12));
    press(game);
    expect(game.mode.mode).toBe('comingUp');
    run(game, 0.5, STILL, () => steady(game, 0.2));
    setBodyLength(0.6);
    until(game, 'surface', 8, STILL, () => steady(game, 0.2));
    // Out at the length it came up at; then the crawl draws in to the new one.
    for (let k = 0; k < 60; k++) {
      game.step(DT, UP, false);
      for (const p of crawl.body) expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
    }
    expect(sum(links(crawl.body))).toBeCloseTo(15 * 0.6 * SPACING, 1);
  });
});
