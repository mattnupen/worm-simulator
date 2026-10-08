import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../src/core/random';
import type { Vec2 } from '../../src/core/vec';
import { DT, makeGame, until } from './burrowPlay';

const DEG = Math.PI / 180;

interface Rise { dip: number; turn: number; seconds: number }

/**
 * A real come-up: the real game and burrower. Crawl a little, dig down, dig about (seeded), steer
 * toward the top along `way` until Action would bring the worm out, then press it once and follow
 * the move: how far the head dips below the lower of where it started and where it lands, how far
 * the head turns in all, and how long the move takes.
 */
function comeUp(seed: number, way: number): Rise | null {
  const rand = mulberry32(seed * 7919 + Math.round(way * 100));
  const { game } = makeGame();
  for (let k = 0; k < 60 * 20 && game.prompt !== 'digDown'; k++) game.step(DT, { x: Math.sin(k * 0.02 * seed) * 0.6, y: 1 }, false);
  if (game.prompt !== 'digDown') return null;
  game.step(DT, { x: 0, y: 0 }, true);
  game.step(DT, { x: 0, y: 0 }, false);
  until(game, 'underground', 8);
  // Dig about a while, then head for the top the given way.
  let move: Vec2 = { x: 0, y: -1 };
  for (let k = 0; k < 60 * (1 + 3 * rand()); k++) {
    if (k % 40 === 0) move = { x: rand() * 2 - 1, y: rand() * 2 - 1 };
    game.step(DT, move, false);
  }
  const toward: Vec2 = { x: Math.cos(way), y: Math.sin(way) };
  for (let k = 0; k < 60 * 30 && !game.nearTop; k++) game.step(DT, k < 60 * 15 ? toward : { x: 0, y: 1 }, false);
  if (!game.nearTop) return null;
  const v0 = game.worm.v[0];
  let low = v0;
  let end = v0;
  let turn = 0;
  let last = game.worm.dir;
  let steps = 0;
  game.step(DT, { x: 0, y: 0 }, true);
  expect(game.mode.mode).toBe('comingUp');
  for (; steps < 60 * 10 && game.mode.mode === 'comingUp'; steps++) {
    turn += Math.abs(game.worm.dir - last);
    last = game.worm.dir;
    low = Math.min(low, game.worm.v[0]);
    end = game.worm.v[0];
    game.step(DT, { x: 0, y: 0 }, false);
  }
  expect(game.mode.mode).toBe('surface');
  const res = { dip: Math.min(v0, end) - low, turn: turn / DEG, seconds: (steps + 1) * DT };
  if (res.dip > 0.15 || res.turn > 180) console.log(`OUT seed ${seed} way ${(way / DEG).toFixed(0)} dip ${res.dip.toFixed(2)} turn ${res.turn.toFixed(0)} s ${res.seconds.toFixed(2)} ${(globalThis as any).LASTPLAN}`);
  return res;
}

describe('coming up from where the real burrower reaches the top (spec 4.2)', () => {
  it('crawls up and out: no dip, little turning, quick', () => {
    const rises: Rise[] = [];
    for (let seed = 1; seed <= 16; seed++) {
      for (const way of [30, 60, 90, 120, 150]) {
        const r = comeUp(seed, way * DEG);
        if (r) rises.push(r);
      }
    }
    const sorted = (f: (r: Rise) => number) => rises.map(f).sort((a, b) => a - b);
    const dips = sorted((r) => r.dip);
    const turns = sorted((r) => r.turn);
    const secs = sorted((r) => r.seconds);
    const at = (a: number[], q: number) => a[Math.floor((a.length - 1) * q)];
    if (process.env.RISESTATS) {
      console.log(`RISE n ${rises.length} dip med ${at(dips, 0.5).toFixed(3)} max ${at(dips, 1).toFixed(3)}; turn med ${at(turns, 0.5).toFixed(0)} p90 ${at(turns, 0.9).toFixed(0)} max ${at(turns, 1).toFixed(0)}; seconds med ${at(secs, 0.5).toFixed(2)} p90 ${at(secs, 0.9).toFixed(2)} max ${at(secs, 1).toFixed(2)}`);
    }
    expect(rises.length).toBeGreaterThan(50);
    expect(at(dips, 1)).toBeLessThanOrEqual(0.15);
    expect(at(turns, 1)).toBeLessThanOrEqual(200);
    expect(at(turns, 0.5)).toBeLessThanOrEqual(120);
    expect(at(secs, 0.5)).toBeLessThanOrEqual(3.5);
  }, 300000);
});
