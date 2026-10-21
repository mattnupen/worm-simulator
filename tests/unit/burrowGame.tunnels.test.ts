import { describe, it, expect } from 'vitest';
import { createBody } from '../../src/worm/body';
import { SPACING, WORM_SEGMENTS } from '../../src/game/crawl';
import { slabU, slabX, slabZ, type Slab } from '../../src/underground/slab';
import { acrossCut, APPROACH_S, ON_CUT } from '../../src/underground/burrowApproach';
import type { BurrowGame } from '../../src/underground/burrowGame';
import type { Crawl } from '../../src/game/crawl';
import { DT, STILL, UP, RIGHT, makeGame, press, run, until, digDown, steerToTop } from './burrowPlay';

const count = (a: Uint8Array) => a.reduce((n, x) => n + x, 0);

/** Dig down from the spawn, dig a tunnel along the cut, come up: the burrow's slab and its tunnels as kept. */
function firstVisit(game: BurrowGame) {
  run(game, 0.5, UP);
  digDown(game);
  run(game, 2.5, RIGHT);
  const s = game.slab!;
  steerToTop(game);
  press(game);
  until(game, 'surface');
  return { s, open: game.grid.open.slice(), hollow: game.grid.hollow.slice(), k: game.burrow };
}

/** The crawl lying still with its head at slab u `u`, `w` across, facing `heading`. */
function lay(crawl: Crawl, s: Slab, u: number, w: number, heading: number): void {
  const head = { x: slabX(s, u) + s.nx * w, y: 0, z: slabZ(s, u) + s.nz * w };
  crawl.reset(crawl.hero.count, createBody(WORM_SEGMENTS, SPACING, head, heading), heading);
}

/** Every cell open in `kept` is open in `now`. */
function keeps(now: Uint8Array, kept: Uint8Array): boolean {
  for (let i = 0; i < kept.length; i++) if (kept[i] && !now[i]) return false;
  return true;
}

describe('tunnels stay: digging back down into an old burrow (V4 spec 4.1)', () => {
  it('back down where it was dug, the same slab comes back with its tunnels, redrawn', () => {
    const { crawl, game } = makeGame();
    const first = firstVisit(game);
    expect(count(first.open)).toBeGreaterThan(300);
    expect(game.burrows.saved[first.k]).toBe(1);
    // Crawl away, then lie down again where it went in, facing along the cut.
    run(game, 1, UP);
    lay(crawl, first.s, 0, 0, Math.atan2(first.s.tx, first.s.tz));
    run(game, DT);
    expect(game.prompt).toBe('digDown');
    expect(game.reuse).toBe(first.k);
    const version = game.slabVersion;
    digDown(game);
    expect(game.slab).toBe(first.s);
    expect(game.burrow).toBe(first.k);
    expect(game.home).toBe(first.k);
    expect(game.slabVersion).toBe(version + 1);
    expect(keeps(game.grid.open, first.open)).toBe(true);
    for (let i = 0; i < first.hollow.length; i++) if (game.grid.hollow[i] < first.hollow[i]) throw new Error(`hollow ${i} lost`);
    // The face and the hollow redraw it all (the renderer reads these as the slab is rebuilt).
    expect(game.grid.dirtyLo).toBeLessThanOrEqual(game.grid.dirtyHi);
  });

  it('back down by the way it came out, facing either way along the cut', () => {
    for (const back of [false, true]) {
      const { crawl, game } = makeGame();
      const first = firstVisit(game);
      const o = game.openings;
      expect(o.burrow[0]).toBe(first.k);
      const u = slabU(first.s, o.data[0], o.data[2]);
      const h = Math.atan2(first.s.tx, first.s.tz) + (back ? Math.PI : 0) + 0.3;
      lay(crawl, first.s, u, 0, h);
      run(game, DT);
      expect(game.reuse).toBe(first.k);
      digDown(game);
      expect(game.slab).toBe(first.s);
      expect(game.digSign).toBe(back ? -1 : 1);
      expect(keeps(game.grid.open, first.open)).toBe(true);
    }
  });

  it('pressed beside the cut, the worm first crawls onto it, then digs back in; the stick takes it back', () => {
    const { crawl, game } = makeGame();
    const first = firstVisit(game);
    const h = Math.atan2(first.s.tx, first.s.tz);
    // Off the cut's plane by 0.6 (inside the old entry's reach), facing along it.
    lay(crawl, first.s, 0.4, 0.6, h);
    run(game, DT);
    expect(game.prompt).toBe('digDown');
    expect(game.reuse).toBe(first.k);
    press(game);
    expect(game.mode.mode).toBe('surface');
    expect(game.approach.burrow).toBe(first.k);
    expect(game.prompt).toBeNull();
    let t = 0;
    while (game.mode.mode === 'surface' && t < APPROACH_S + 1) {
      game.step(DT, STILL, false);
      t += DT;
    }
    expect(game.mode.mode).toBe('diggingDown');
    expect(game.slab).toBe(first.s);
    expect(Math.abs(acrossCut(first.s, crawl.motion.head))).toBeLessThanOrEqual(ON_CUT);
    until(game, 'underground');
    expect(keeps(game.grid.open, first.open)).toBe(true);
    // Once more, but the stick moves: no dig, the worm crawls as the player says.
    steerToTop(game);
    press(game);
    until(game, 'surface');
    lay(crawl, first.s, 0.4, -0.6, h);
    run(game, DT);
    press(game);
    expect(game.approach.burrow).toBe(first.k);
    game.step(DT, UP, false);
    expect(game.approach.burrow).toBe(-1);
    run(game, 1, UP);
    expect(game.mode.mode).toBe('surface');
  });

  it('somewhere new makes a new burrow; the old one is kept for later', () => {
    const { crawl, game } = makeGame();
    const first = firstVisit(game);
    // Across the cut, well away from it and its openings.
    lay(crawl, first.s, 0, 3, Math.atan2(first.s.tx, first.s.tz));
    run(game, DT);
    expect(game.reuse).toBe(-1);
    digDown(game);
    expect(game.slab).not.toBe(first.s);
    expect(game.burrow).not.toBe(first.k);
    expect(count(game.grid.open)).toBeLessThan(400);
    expect(game.burrows.slabs[first.k]).toBe(first.s);
    expect(game.burrows.saved[first.k]).toBe(1);
  });

  it('enterBurrow starts again in "your burrow", its tunnels back, not as a visit; a press held through it stays spent', () => {
    const { game, saved } = makeGame({ view: 'close' });
    const first = firstVisit(game);
    const visits = game.visits;
    run(game, 2, UP);
    game.enterBurrow(true);
    expect(game.mode.mode).toBe('underground');
    expect(game.slab).toBe(first.s);
    expect(game.view).toBe('close');
    expect(game.visits).toBe(visits);
    expect(keeps(game.grid.open, first.open)).toBe(true);
    // Under where the burrow was dug.
    expect(Math.abs(game.worm.u[0])).toBeLessThan(1);
    // Space still held from before (the grip): no view switch until it is pressed again.
    game.step(DT, STILL, true);
    expect(game.view).toBe('close');
    game.step(DT, STILL, false);
    press(game);
    expect(game.view).toBe('wide');
    expect(saved).toEqual(['wide']);
  });

  it('enterBurrow from below keeps what was dug this visit; with no burrow yet it digs one where the worm is', () => {
    const { game } = makeGame();
    run(game, 0.5, UP);
    game.enterBurrow();
    expect(game.mode.mode).toBe('underground');
    expect(game.home).toBeGreaterThanOrEqual(0);
    expect(game.visits).toBe(0);
    expect(game.hintShowing).toBe(false);
    const s = game.slab!;
    run(game, 2.5, RIGHT);
    const dug = game.grid.open.slice();
    game.enterBurrow();
    expect(game.slab).toBe(s);
    expect(keeps(game.grid.open, dug)).toBe(true);
    // The player's own first dig still shows the hint card.
    steerToTop(game);
    press(game);
    until(game, 'surface');
    run(game, 1.5, UP);
    for (let k = 0; k < 30 && game.prompt !== 'digDown'; k++) run(game, 0.1, UP);
    digDown(game);
    expect(game.visits).toBe(1);
    expect(game.hintShowing).toBe(true);
  });
});
