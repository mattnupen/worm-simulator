import { describe, it, expect } from 'vitest';
import { SPACING, WORM_SEGMENTS } from '../../src/game/crawl';
import { createBody } from '../../src/worm/body';
import { canDigAt } from '../../src/underground/digSpot';
import { mulberry32 } from '../../src/core/random';
import type { Vec2 } from '../../src/core/vec';
import type { BurrowGame } from '../../src/underground/burrowGame';
import { makeGame, press, run, until } from './burrowPlay';

// V4 hot fix (Matt): "Going backwards doesn't always work. Players are reporting getting stuck."
// Underground, a stuck worm backed up only while the stick pointed within about 37 degrees of
// straight back along its body. Pressed into the crease under the top beside a stone, pointing
// down (or with the arrow keys' 45-degree steps a little off straight back), it did nothing at all.
// Now pointing more than about 86 degrees off its neck backs it up (burrowBack.ts BACK_ANGLE); across
// the body it backs only until the head has room to turn that way (roomToTurn), then turns.

/** The `index`th dig (0..) of the seeded spots, ready underground. */
function dig(seed: number, index: number): BurrowGame {
  const rand = mulberry32(seed);
  for (let tries = 0, n = 0; tries < 500; tries++) {
    const x = (rand() - 0.5) * 30;
    const z = (rand() - 0.5) * 30;
    const h = rand() * 6.28;
    if (!canDigAt(x, z, h, createBody(WORM_SEGMENTS, SPACING, { x, y: 0, z }, h))) continue;
    if (n++ < index) continue;
    const { crawl, game } = makeGame();
    crawl.reset(crawl.hero.count, createBody(WORM_SEGMENTS, SPACING, { x, y: 0, z }, h), h);
    run(game, 0.2);
    press(game);
    until(game, 'underground');
    return game;
  }
  throw new Error('no dig');
}

/** Holds `move` for `seconds`: how far the head went (along its path), and whether it backed up. */
function hold(game: BurrowGame, move: Vec2, seconds: number): { moved: number; backed: boolean; v0: number } {
  const w = game.worm;
  let moved = 0;
  let backed = false;
  let pu = w.u[0];
  let pv = w.v[0];
  const v0 = w.v[0];
  run(game, seconds, move, () => {
    moved += Math.hypot(w.u[0] - pu, w.v[0] - pv);
    pu = w.u[0];
    pv = w.v[0];
    backed ||= w.backing;
  });
  return { moved, backed, v0 };
}

describe('a stuck worm underground gets out by pointing away (V4 hot fix)', () => {
  it('pressed up into the crease under the top beside a stone, pointing down backs it out, then it turns down', () => {
    // Found by playing: seed 4's first and third digs, steered up into the top for 8 s.
    for (const index of [0, 2]) {
      const game = dig(4, index);
      run(game, 8, { x: 0.3, y: 1 });
      const w = game.worm;
      const r = hold(game, { x: 0, y: -1 }, 3);
      expect(r.backed, `dig ${index}`).toBe(true);
      expect(r.moved, `dig ${index}`).toBeGreaterThan(0.4);
      // Out of the crease, it turned and went down the way pointed.
      const more = hold(game, { x: 0, y: -1 }, 2);
      expect(w.v[0], `dig ${index}`).toBeLessThan(more.v0 - 0.3);
    }
  });

  it('pointing about 140 degrees off its neck (an arrow key, not straight back) backs it out of a dead end', () => {
    // Seed 4's fourth dig, driven right and down into a stone for 12 s, then Left.
    const game = dig(4, 3);
    run(game, 12, { x: 1, y: -0.3 });
    const r = hold(game, { x: -1, y: 0 }, 3);
    expect(r.backed).toBe(true);
    expect(r.moved).toBeGreaterThan(0.4);
  });

  it('wandering into the top, the ends, stones and roots, the way away from the head always moves it', () => {
    const rand = mulberry32(2);
    let checks = 0;
    for (let visit = 0; visit < 6; visit++) {
      const game = dig(1 + visit, 0);
      for (let leg = 0; leg < 8; leg++) {
        const a = rand() * 6.28;
        run(game, 1 + rand() * 4, { x: Math.cos(a), y: Math.sin(a) * 0.6 + (rand() < 0.4 ? 0.6 : 0) });
        const w = game.worm;
        // Straight away from the head's facing, on screen, as a player would point.
        const away = { x: -Math.cos(w.dir) * game.rightSign, y: -Math.sin(w.dir) };
        const r = hold(game, away, 3);
        checks++;
        expect(r.moved, `visit ${visit} leg ${leg} at u ${w.u[0].toFixed(2)} v ${w.v[0].toFixed(2)}`).toBeGreaterThan(0.25);
      }
    }
    expect(checks).toBe(48);
  });
});
