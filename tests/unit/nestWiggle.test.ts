import { describe, expect, it } from 'vitest';
import { NestWiggle, WIGGLE } from '../../src/predators/nestWiggle';
import { createPressEdge } from '../../src/input/actionEdge';
import { TEXT } from '../../src/content/text';

/** A small seeded random (mulberry32), so every run is the same. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DT = 1 / 60;

/**
 * One carry, a player pressing `rate` times a second (each gap jittered ±30%) from `start` for
 * `seconds`, the key held for half of each gap; the press reaches the meter through the edge, as
 * main.ts feeds it. True if the worm got free.
 */
function carry(rate: number, seconds: number, roll: () => number, jitter: () => number, start = 0.3): boolean {
  const w = new NestWiggle();
  w.reset(true);
  const edge = createPressEdge();
  let next = start;
  let up = -1;
  for (let t = 0; t < WIGGLE.until + 0.5; t += DT) {
    let down = false;
    if (rate > 0 && t >= next && t < start + seconds) {
      up = t + 0.5 / rate;
      next = t + (1 + (jitter() * 2 - 1) * 0.3) / rate;
    }
    if (t < up) down = true;
    if (edge.update(down) && w.press(t, roll)) return true;
    w.step(DT);
  }
  return false;
}

function rate(presses: number, seconds: number, trials = 2000, start = 0.3): number {
  const roll = seeded(7);
  const jitter = seeded(11);
  let n = 0;
  for (let i = 0; i < trials; i++) if (carry(presses, seconds, roll, jitter, start)) n++;
  return n / trials;
}

describe('wiggling free on the way to the nest', () => {
  it('lazy presses never get the worm free', () => {
    expect(rate(1, 4)).toBe(0);
    expect(rate(2, 4)).toBe(0);
    expect(rate(3, 4)).toBe(0);
  });

  it('mashing for 2 to 4 seconds gets it free about a third to a half of the time', () => {
    const two = rate(8, 2);
    const three = rate(8, 3);
    const all = rate(8, WIGGLE.until);
    expect(two).toBeGreaterThan(0.15);
    expect(three).toBeGreaterThan(0.3);
    expect(three).toBeLessThan(0.5);
    expect(all).toBeLessThan(0.6);
    // Faster is better, and steady medium tapping only sometimes.
    expect(rate(10, 3)).toBeGreaterThan(three);
    expect(rate(5, WIGGLE.until)).toBeLessThan(three);
  });

  it('a held key is one press, however long it is held', () => {
    const w = new NestWiggle();
    w.reset(true);
    const edge = createPressEdge();
    let presses = 0;
    for (let t = 0; t < 3; t += DT) {
      if (edge.update(true)) presses++;
      if (edge.update(true)) presses++;
    }
    expect(presses).toBe(1);
    // Held from before the scene (the grip's Space): primed with that level, no press at all.
    const primed = createPressEdge();
    primed.update(true);
    expect(primed.update(true)).toBe(false);
  });

  it('a forced roll (?nestEscape=1) frees it once the meter is high, never before', () => {
    const w = new NestWiggle();
    w.reset(true);
    const n = Math.ceil(WIGGLE.threshold / WIGGLE.add);
    for (let i = 1; i < n; i++) expect(w.press(1, () => 0)).toBe(false);
    expect(w.press(1, () => 0)).toBe(true);
    expect(w.escaped).toBe(true);
    // Once free, presses do nothing more.
    expect(w.press(1.1, () => 0)).toBe(false);
  });

  it('only while carried, only when on; each press thrashes, the other way each time', () => {
    const w = new NestWiggle();
    w.reset(false);
    expect(w.press(1, () => 0)).toBe(false);
    expect(w.thrash).toBe(0);
    w.reset(true);
    for (let i = 0; i < 10; i++) expect(w.press(WIGGLE.until + 0.01, () => 0)).toBe(false);
    expect(w.meter).toBe(0);
    expect(w.thrash).toBeGreaterThan(0.5);
    expect(w.open(WIGGLE.until + 0.01)).toBe(false);
    expect(w.open(1)).toBe(true);
    w.reset(true);
    w.press(1, () => 0.99);
    const s = w.side;
    w.press(1.1, () => 0.99);
    expect(w.side).toBe(-s);
    // The thrash and the meter die away.
    for (let i = 0; i < 120; i++) w.step(DT);
    expect(w.meter).toBe(0);
    expect(w.thrash).toBeLessThan(0.01);
  });

  it('allocates nothing per press or step', () => {
    const w = new NestWiggle();
    w.reset(true);
    const r = seeded(3);
    for (let i = 0; i < 1000; i++) { w.press(1, r); w.step(DT); }
    // The least growth over a few runs (another test's garbage or a collection can land in any one).
    let least = Infinity;
    for (let run = 0; run < 5 && least >= 1_000_000; run++) {
      const before = process.memoryUsage().heapUsed;
      for (let i = 0; i < 200_000; i++) {
        w.reset(true);
        w.press(1, r);
        w.step(DT);
      }
      least = Math.min(least, process.memoryUsage().heapUsed - before);
    }
    // 200 000 steps: under 5 bytes a step, i.e. none (a single object a step would be 3 MB+).
    expect(least).toBeLessThan(1_000_000);
  });

  it('records its game choice, which never says "Game choice"', () => {
    expect(TEXT.nestWiggleChoice.kind).toBe('gameChoice');
    expect(TEXT.nestWiggledFree.kind).toBe('ui');
  });
});

describe('escape rates (printed for the report)', () => {
  it('prints', () => {
    const rows: string[] = [];
    for (const [label, r] of [['lazy 2/s', 2], ['medium 5/s', 5], ['steady 6/s', 6], ['mashing 8/s', 8], ['hard 10/s', 10]] as const) {
      rows.push(`${label}: 2 s ${rate(r, 2).toFixed(2)}, 3 s ${rate(r, 3).toFixed(2)}, whole carry ${rate(r, WIGGLE.until).toFixed(2)}`);
    }
    console.log(rows.join('\n'));
  });
});
