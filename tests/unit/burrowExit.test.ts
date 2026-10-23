import { describe, it, expect } from 'vitest';
import { SPACING, WORM_SEGMENTS } from '../../src/game/crawl';
import { createBody } from '../../src/worm/body';
import { canDigAt } from '../../src/underground/digSpot';
import { canEmergeAt } from '../../src/underground/emergeMap';
import { mulberry32 } from '../../src/core/random';
import { boundaryAt, B_F } from '../../src/underground/slab';
import { AT_TOP_IN } from '../../src/underground/burrowTop';
import type { BurrowGame } from '../../src/underground/burrowGame';
import { DT, STILL, UP, RIGHT, makeGame, press, run, until, digDown, steerToTop } from './burrowPlay';

// V4 hot fix (Matt): "if worm is at the top, then space bar allows them to exit." At the top
// (burrowTop.ts atTop: in the litter, or within AT_TOP_IN under it) Action always comes up; where
// the body could not lie out on the floor, the worm heads out to the nearest place where it can.

/** Clears the emerge map within `r` of u (as if a rock or trunk blocked every way out there). */
function blockAround(game: BurrowGame, u: number, r: number): void {
  const m = game.emerge;
  for (let j = 0; j < m.count; j++) if (Math.abs((m.first + j) * 0.05 - u) <= r) m.sides[j] = 0;
}

/** Steps with the stick let go until the worm starts coming up (at most `seconds`); where its head was then. */
function untilUp(game: BurrowGame, seconds: number): { u: number; views: number } {
  const view = game.view;
  let views = 0;
  let u = NaN;
  for (let k = 0; k < seconds / DT && game.mode.mode === 'underground'; k++) {
    u = game.worm.u[0];
    game.step(DT, STILL, false);
    if (game.view !== view) views++;
  }
  expect(game.mode.mode).toBe('comingUp');
  return { u, views };
}

describe('at the top, Action always comes up (V4 hot fix)', () => {
  it('where there is no way out at the head, it heads out to the nearest place and comes up there', () => {
    const { game } = makeGame();
    run(game, 0.5, UP);
    digDown(game);
    steerToTop(game);
    blockAround(game, game.worm.u[0], 1.2);
    game.step(DT, STILL, false);
    expect(game.nearTop).toBe(false);
    expect(game.prompt).toBe('comeUp');
    press(game);
    // Heading out: no prompt (a press does nothing), and the view is never switched.
    expect(game.heading).toBe(true);
    expect(game.prompt).toBeNull();
    const { u, views } = untilUp(game, 8);
    expect(views).toBe(0);
    expect(canEmergeAt(game.emerge, u)).toBe(true);
    until(game, 'surface');
  });

  it('just under the litter (at the top, not yet near it), it climbs the rest of the way and comes up', () => {
    const { game } = makeGame();
    run(game, 0.5, UP);
    digDown(game);
    // A fresh dig-down ends deeper than the top: there Action is still the view switch.
    expect(game.worm.atTop).toBe(false);
    expect(game.prompt).toBe('viewClose');
    for (let k = 0; k < 600 && !game.worm.atTop; k++) game.step(DT, UP, false);
    expect(game.worm.atTop).toBe(true);
    expect(game.worm.nearTop).toBe(false);
    const w = game.worm;
    expect(boundaryAt(game.slab!, B_F, w.u[0]) - w.v[0]).toBeLessThanOrEqual(AT_TOP_IN + 1e-9);
    game.step(DT, STILL, false);
    expect(game.prompt).toBe('comeUp');
    press(game);
    untilUp(game, 5);
    until(game, 'surface');
  });

  it('deeper, Action switches the view as before', () => {
    const { game } = makeGame();
    run(game, 0.5, UP);
    digDown(game);
    run(game, 1, { x: 0, y: -1 });
    expect(game.prompt).toBe('viewClose');
    press(game);
    expect(game.view).toBe('close');
    expect(game.mode.mode).toBe('underground');
    expect(game.heading).toBe(false);
  });

  it('a fresh push of the stick while heading out gives the worm back; Come up shows again', () => {
    const { game } = makeGame();
    run(game, 0.5, UP);
    digDown(game);
    steerToTop(game);
    blockAround(game, game.worm.u[0], 2.5);
    game.step(DT, STILL, false);
    // Action pressed with the stick still held up: heading out ignores the held stick...
    press(game, UP);
    expect(game.heading).toBe(true);
    run(game, 0.3, UP);
    expect(game.heading).toBe(true);
    // ...let go, then pushed again: the player takes over.
    run(game, 0.1);
    run(game, 0.1, RIGHT);
    expect(game.heading).toBe(false);
    expect(game.mode.mode).toBe('underground');
    if (game.worm.atTop) expect(game.prompt).toBe('comeUp');
  });

  it('from many places at the top, blocked or not, one press always ends on the surface', () => {
    const rand = mulberry32(11);
    let visits = 0;
    let blocked = 0;
    for (let tries = 0; visits < 24 && tries < 2000; tries++) {
      const x = (rand() - 0.5) * 34;
      const z = (rand() - 0.5) * 34;
      const h = rand() * 6.28;
      if (!canDigAt(x, z, h, createBody(WORM_SEGMENTS, SPACING, { x, y: 0, z }, h))) continue;
      const { crawl, game } = makeGame();
      crawl.reset(crawl.hero.count, createBody(WORM_SEGMENTS, SPACING, { x, y: 0, z }, h), h);
      run(game, 0.2);
      press(game);
      until(game, 'underground');
      const side = rand() < 0.5 ? -1 : 1;
      run(game, 1 + rand() * 8, { x: side, y: -0.2 });
      for (let k = 0; k < 600 && !game.worm.atTop; k++) game.step(DT, { x: side * 0.3, y: 1 }, false);
      // A head pressed up under a rock at a slab's end never gets to the top: not this test's case.
      if (!game.worm.atTop) continue;
      visits++;
      if (visits % 2) blockAround(game, game.worm.u[0], 1.5);
      game.step(DT, STILL, false);
      if (!canEmergeAt(game.emerge, game.worm.u[0])) blocked++;
      expect(game.prompt, `visit ${visits}`).toBe('comeUp');
      press(game);
      untilUp(game, 16);
      until(game, 'surface');
    }
    expect(visits).toBe(24);
    expect(blocked).toBeGreaterThanOrEqual(12);
  });
});
