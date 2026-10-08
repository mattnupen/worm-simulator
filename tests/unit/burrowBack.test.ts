import { describe, it, expect } from 'vitest';
import { SPACING, WORM_SEGMENTS } from '../../src/game/crawl';
import { createBody } from '../../src/worm/body';
import { canDigAt } from '../../src/underground/digSpot';
import { mulberry32 } from '../../src/core/random';
import { B_A } from '../../src/underground/slab';
import { cellAt } from '../../src/underground/soilGrid';
import { STUCK_S, STUCK_TRIED } from '../../src/underground/burrowBack';
import { makeGame, press, run, until } from './burrowPlay';
import { midOf, run as runWorm, setup, tunnel, strayOf } from './burrowWorld';

/**
 * Steps it backed up in, those with the tail farther than backing allows from its tunnel
 * (canGetOut), and the most times backing started or stopped while one way was held.
 */
let backed = 0;
let undug = 0;
let mostFlips = 0;

/** Holds each of 8 ways for 1.5 s in turn until the head gets 0.25 u from where it was; false when none does. */
function canGetOut(game: ReturnType<typeof makeGame>['game']): boolean {
  const w = game.worm;
  const g = game.grid;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const u0 = w.u[0];
    const v0 = w.v[0];
    let flips = 0;
    let was = w.backing;
    run(game, 1.5, { x: Math.cos(a), y: Math.sin(a) }, () => {
      if (w.backing !== was) flips++;
      was = w.backing;
      if (!w.backing) return;
      backed++;
      // The tail beside its tunnel by more than backing allows (burrowBack.ts NEAR_OPEN).
      if (strayOf(g, w.u[15], w.v[15]) > 0.45) undug++;
    });
    mostFlips = Math.max(mostFlips, flips);
    if (Math.hypot(w.u[0] - u0, w.v[0] - v0) > 0.25) return true;
  }
  return false;
}

describe('the worm is never trapped underground (it backs up out of dead ends)', () => {
  it('wandering into the top, the ends, rocks and roots, some way always gets it out', () => {
    let checks = 0;
    for (const seed of [7, 31]) {
      const rand = mulberry32(seed);
      let visits = 0;
      for (let tries = 0; visits < 12 && tries < 300; tries++) {
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
        for (let leg = 0; leg < 12; leg++) {
          // Wander a random way for 2-4 s, often pressing up into the top.
          const a = rand() * 6.28;
          run(game, 2 + rand() * 2, { x: Math.cos(a), y: Math.sin(a) * 0.6 + (rand() < 0.4 ? 0.6 : 0) });
          checks++;
          expect(canGetOut(game), `seed ${seed} visit ${visits} at u ${game.worm.u[0].toFixed(2)} v ${game.worm.v[0].toFixed(2)}`).toBe(true);
        }
      }
      expect(visits).toBe(12);
    }
    expect(checks).toBe(288);
    // Some ways out were backing up (a dead end the head could not turn round in)...
    expect(backed).toBeGreaterThan(0);
    // ...back through its own tunnel or the soil just beside it (the tail, a chain cutting the
    // bends' insides, may lie up to about 0.4 u beside it), never off away from it...
    expect(undug / backed).toBeLessThan(0.01);
    // ...and backing settles: on once and off once while a way is held, never flicking on and off.
    expect(mostFlips).toBeLessThanOrEqual(2);
  });

  it('backs through its own tunnel and stops at its end, not starting again while the stick points back', () => {
    const w = setup(0, midOf(B_A));
    const tail0 = w.b.u[15];
    tunnel(w, tail0, 0);
    // Stuck with its head in fresh soil (as if pressed into a dead end).
    w.b.stuck = STUCK_S;
    w.b.tried = STUCK_TRIED;
    let starts = 0;
    let ends = 0;
    let was = false;
    let back = Infinity;
    runWorm(w, -1, 0, 60 * 3, () => {
      if (w.b.backing !== was) (w.b.backing ? starts++ : ends++);
      was = w.b.backing;
      back = Math.min(back, w.b.u[15]);
      // Never into soil it has not dug.
      expect(w.g.open[cellAt(w.g, w.b.u[15], w.b.v[15])]).toBe(1);
    });
    // It backed to the tunnel's end (within its width), stopped there once and did not start again
    // (it turns round instead: its head is free in open soil).
    expect(starts).toBe(1);
    expect(ends).toBe(1);
    expect(back).toBeLessThan(tail0 - 0.05);
    expect(back).toBeGreaterThan(tail0 - 0.2);
  });

  it('a U-turn in open soil turns round as before: it never backs up when it can move', () => {
    const w = setup(0, midOf(B_A));
    let backed = 0;
    for (let k = 0; k < 60 * 4; k++) {
      runWorm(w, -1, 0, 1);
      if (w.b.backing) backed++;
    }
    expect(backed).toBe(0);
    // It turned round and went the way pointed.
    expect(Math.cos(w.b.dir)).toBeLessThan(-0.9);
  });
});
