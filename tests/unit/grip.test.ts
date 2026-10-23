import { describe, it, expect } from 'vitest';
import { GRIP, createGrip, startGrip, stepGrip, type GripEvent, type GripState } from '../../src/predators/grip';

// The grip mini-game (V4, Matt 2026-10-22): tap while the robin pulls, rest while it regrips, and
// keep some energy. Players are modelled as they would play it, across many seeds.

const DT = 1 / 60;
const SEEDS = 300;

/** A small seeded random (mulberry32), so every run is the same. */
function seeded(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A player: told the time, and when a pull or a regrip has just begun (as the screen shows it); says whether it taps now. */
type Player = (r: () => number) => (t: number, began: 'pull' | 'regrip' | null) => boolean;

const never: Player = () => () => false;

/** Taps as fast as it can (`hz` a second), from the moment it is grabbed (or from `from` seconds). */
const spam = (hz: number, from = 0): Player => (r) => {
  let next = r() / hz;
  return (t) => {
    if (t < next) return false;
    next += 1 / hz;
    return t >= from;
  };
};

/**
 * Sees each pull begin (after a reaction of 0.2 to 0.35 s) and taps `n` times about 6 a second;
 * rests in regrips, except for `sloppy` stray taps at random in each regrip.
 */
const timed = (n: number, sloppy = 0): Player => (r) => {
  const due: number[] = [];
  return (t, began) => {
    if (began === 'pull') {
      let at = t + 0.2 + 0.15 * r();
      for (let i = 0; i < n; i++, at += 0.14 + 0.07 * r()) due.push(at);
    } else if (began === 'regrip' && sloppy > 0) {
      for (let i = 0; i < sloppy; i++) due.push(t + 0.05 + 0.5 * r());
    }
    const k = due.findIndex((at) => at <= t);
    if (k < 0) return false;
    due.splice(k, 1);
    return true;
  };
};

function play(player: Player, seed: number): GripState {
  const rand = seeded(seed);
  const s = createGrip();
  const tap = player(seeded(seed * 31 + 7));
  let phase = s.phase;
  for (let i = 0; i < 60 * 120 && s.result === 'none'; i++) {
    const began = s.phase !== phase ? s.phase : null;
    phase = s.phase;
    stepGrip(s, DT, tap(i * DT, began), rand);
  }
  return s;
}

interface Tally { escaped: number; tired: number; pulls: number; seconds: number }
function tally(player: Player): Tally {
  const t: Tally = { escaped: 0, tired: 0, pulls: 0, seconds: 0 };
  for (let seed = 1; seed <= SEEDS; seed++) {
    const s = play(player, seed);
    expect(s.result, `seed ${seed}`).not.toBe('none');
    if (s.tired) t.tired++;
    if (s.result !== 'escaped') continue;
    t.escaped++;
    t.pulls += s.pulls;
    t.seconds += s.elapsed;
  }
  if (t.escaped) {
    t.pulls /= t.escaped;
    t.seconds /= t.escaped;
  }
  return t;
}

describe('the grip mini-game: tap while the robin pulls, with energy to spend', () => {
  it('starts full, partway out, the robin settling first', () => {
    const s = createGrip();
    expect(s).toMatchObject({ phase: 'regrip', pulls: 0, pos: GRIP.start, energy: 1, result: 'none', tired: false });
    expect(s.dur).toBe(GRIP.lead);
  });

  it('pulls and regrips take turns, each within its range, and a pull begins with "pull"', () => {
    const s = createGrip();
    const rand = seeded(3);
    let pulls = 0;
    let last = s.phase;
    for (let i = 0; i < 600 && s.result === 'none'; i++) {
      const ev = stepGrip(s, DT, false, rand);
      if (ev === 'pull') pulls++;
      if (s.phase !== last) {
        if (s.phase === 'pull') expect(ev).toBe('pull');
        const [lo, hi] = s.phase === 'pull' ? [GRIP.pullMin, GRIP.pullMax] : [GRIP.regripMin, GRIP.regripMax];
        expect(s.dur).toBeGreaterThanOrEqual(lo);
        expect(s.dur).toBeLessThanOrEqual(hi);
        last = s.phase;
      }
    }
    expect(pulls).toBe(s.pulls);
    expect(pulls).toBeGreaterThan(0);
  });

  it('a tap in a pull grips and pulls down a step; one in a regrip is wasted; both cost energy', () => {
    const s = createGrip();
    const rand = () => 0.5;
    expect(stepGrip(s, DT, true, rand)).toBe('waste');
    expect(s.pos).toBe(GRIP.start);
    expect(s.energy).toBeCloseTo(1 - GRIP.cost, 9);
    while (s.phase !== 'pull') stepGrip(s, DT, false, rand);
    const before = s.pos;
    const e = s.energy;
    expect(stepGrip(s, DT, true, rand)).toBe('grip');
    expect(s.pos).toBeCloseTo(before - GRIP.step + GRIP.slide * DT, 9);
    expect(s.energy).toBeCloseTo(e - GRIP.cost, 9);
  });

  it('energy comes back only after a short rest, and never past full', () => {
    const s = createGrip();
    const rand = () => 0.5;
    stepGrip(s, DT, true, rand);
    const after = s.energy;
    stepGrip(s, GRIP.rest / 2, false, rand);
    expect(s.energy).toBe(after);
    for (let i = 0; i < 120; i++) stepGrip(s, DT, false, rand);
    expect(s.energy).toBe(1);
  });

  it('never tapping: the robin pulls the worm out, every time, with energy to spare', () => {
    const t = tally(never);
    expect(t.escaped).toBe(0);
    expect(t.tired).toBe(0);
  });

  it.each([4, 5, 6, 8, 10, 12, 16])('tapping as fast as you can (%i a second) runs the energy out: the robin wins', (hz) => {
    const t = tally(spam(hz));
    expect(t.escaped).toBe(0);
    expect(t.tired).toBe(SEEDS);
  });

  it.each([8, 12, 16])('mashing (%i a second) from the moment the first pull starts runs out too', (hz) => {
    expect(tally(spam(hz, GRIP.lead)).escaped).toBe(0);
  });

  it('a tap too soon after the last grip slips (costs energy, no pull)', () => {
    const s = createGrip();
    const rand = () => 0.5;
    while (s.phase !== 'pull') stepGrip(s, DT, false, rand);
    expect(stepGrip(s, DT, true, rand)).toBe('grip');
    const pos = s.pos;
    const e = s.energy;
    expect(stepGrip(s, DT, true, rand)).toBe('waste');
    expect(s.pos).toBeCloseTo(pos + GRIP.slide * DT, 9);
    expect(s.energy).toBeCloseTo(e - GRIP.cost, 9);
  });

  it('4 taps in each pull and resting in regrips escapes in about 4 to 6 pulls (5 to 9 s)', () => {
    const t = tally(timed(4));
    expect(t.escaped).toBe(SEEDS);
    expect(t.pulls).toBeGreaterThanOrEqual(4);
    expect(t.pulls).toBeLessThanOrEqual(6);
    expect(t.seconds).toBeGreaterThanOrEqual(5);
    expect(t.seconds).toBeLessThanOrEqual(9);
  });

  it('5 taps a pull escapes a little faster; 3 escapes too, more slowly', () => {
    const five = tally(timed(5));
    expect(five.escaped).toBe(SEEDS);
    expect(five.pulls).toBeLessThanOrEqual(6);
    const three = tally(timed(3));
    expect(three.escaped).toBe(SEEDS);
    expect(three.pulls).toBeLessThanOrEqual(10);
  });

  it('a slightly sloppy player (a stray tap or two in each regrip) can still escape', () => {
    expect(tally(timed(4, 1)).escaped).toBeGreaterThan(SEEDS * 0.95);
    expect(tally(timed(4, 2)).escaped).toBeGreaterThan(SEEDS * 0.6);
  });

  it('stops changing once it has a result', () => {
    for (const player of [never, spam(10), timed(4)]) {
      const s = play(player, 11);
      const was = { ...s };
      const rand = seeded(1);
      for (let i = 0; i < 100; i++) expect(stepGrip(s, DT, i % 2 === 0, rand)).toBe<GripEvent>('none');
      expect(s).toEqual(was);
    }
  });

  it('a new grab starts over', () => {
    const s = play(spam(10), 2);
    startGrip(s);
    expect(s).toEqual(createGrip());
  });
});
