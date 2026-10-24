import { describe, expect, it } from 'vitest';
import { createHunt, endGrab, HUNT, robinIn, stepHunt, type HuntEvent, type HuntInput, type HuntState } from '../../src/predators/hunt';
import { UNITS_PER_CM } from '../../src/surface/realScale';

const DT = 1 / 60;
const half = (): number => 0.5;

/** Steps until an event (or the limit), collecting events. */
function run(s: HuntState, w: HuntInput, seconds: number, until?: HuntEvent): HuntEvent[] {
  const seen: HuntEvent[] = [];
  for (let t = 0; t < seconds; t += DT) {
    const e = stepHunt(s, DT, w, half);
    if (e !== 'none') seen.push(e);
    if (until && e === until) break;
  }
  return seen;
}

const worm = (over: Partial<HuntInput> = {}): HuntInput => ({ catchable: true, wait: false, under: false, hx: 0, hz: 0, heading: 0, ax: 0, az: 0, ...over });

describe('robin hunt', () => {
  it('waits only while the worm is on the surface, then warns and lands about a metre off, in front', () => {
    const s = createHunt(half);
    expect(s.wait).toBeCloseTo(HUNT.waitMin + HUNT.waitSpread / 2);
    expect(run(s, worm({ catchable: false }), 60)).toEqual([]);
    expect(run(s, worm(), 40, 'warn')).toEqual(['warn']);
    expect(Math.hypot(s.x, s.z) / UNITS_PER_CM).toBeCloseTo(HUNT.landCm, 3);
    expect(s.z).toBeGreaterThan(0);
  });

  it('closes in with runs and stares, then strikes and grabs a worm that stays up top', () => {
    const s = createHunt(half);
    robinIn(s, 0);
    const w = worm();
    const seen = run(s, w, 30, 'grab');
    expect(seen).toEqual(['warn', 'grab']);
    expect(Math.hypot(s.x, s.z) / UNITS_PER_CM).toBeLessThanOrEqual(HUNT.reachCm + 0.01);
    expect(s.phase).toBe('grab');
  });

  it('gives the player several seconds of stares before it can strike', () => {
    const s = createHunt(half);
    robinIn(s, 0);
    let t = 0;
    for (; t < 30 && s.phase !== 'strike'; t += DT) stepHunt(s, DT, worm(), half);
    expect(t).toBeGreaterThan(6);
  });

  it('misses a worm that gets out of reach for good (below the escape layer), then leaves and comes back later', () => {
    const s = createHunt(half);
    robinIn(s, 0);
    run(s, worm(), 3);
    expect(run(s, worm({ catchable: false }), 1)).toEqual(['miss']);
    expect(run(s, worm({ catchable: false }), 5)).toEqual(['gone']);
    expect(s.phase).toBe('away');
    expect(s.wait).toBeGreaterThan(HUNT.waitMin - 0.01);
  });

  it('after the grab, goes the right way for each ending', () => {
    for (const [end, phase, tail] of [['escaped', 'miss', false], ['broke', 'leave', true], ['taken', 'carry', false]] as const) {
      const s = createHunt(half);
      robinIn(s, 0);
      run(s, worm(), 30, 'grab');
      endGrab(s, end);
      expect(s.phase).toBe(phase);
      expect(s.withTail).toBe(tail);
      expect(run(s, worm(), 5)).toEqual(['gone']);
    }
  });

  it('follows a worm that crawls away, and never runs past it', () => {
    const s = createHunt(half);
    robinIn(s, 0);
    const w = worm();
    for (let t = 0; t < 30 && s.phase !== 'grab'; t += DT) {
      w.hz -= 0.3 * DT;
      stepHunt(s, DT, w, half);
      if (s.phase === 'dash') expect(Math.hypot(w.hx - s.toX, w.hz - s.toZ) / UNITS_PER_CM).toBeGreaterThan(HUNT.reachCm * 0.7);
    }
    expect(s.phase).toBe('grab');
  });
});

describe('robin hunt pose', async () => {
  const { huntPose } = await import('../../src/predators/huntPose');
  const { HuntGrab } = await import('../../src/predators/huntGrab');
  const { Robin } = await import('../../src/predators/robin');

  it('poses cleanly through a whole hunt and grab: no NaN, never below the ground', () => {
    const r = new Robin();
    const s = createHunt(half);
    const grab = new HuntGrab();
    robinIn(s, 0);
    let grabbing = false;
    for (let t = 0; t < 40; t += DT) {
      if (s.phase === 'grab' && !grabbing) {
        grabbing = true;
        grab.start();
      }
      // No taps: the robin wins.
      grab.step(DT, false, s.phase === 'grab', half);
      if (s.phase === 'grab' && grab.grip.result !== 'none') endGrab(s, 'broke');
      stepHunt(s, DT, worm(), half);
      huntPose(s, grab.look, () => 0, r.pose);
      r.update();
      if (!r.pose.visible) continue;
      const pos = r.mesh.geometry.getAttribute('position').array as Float32Array;
      expect(pos.every(Number.isFinite), `at ${t} (${s.phase})`).toBe(true);
      let minY = Infinity;
      for (let i = 1; i < pos.length; i += 3) if (pos[i] !== 0 || pos[i - 1] !== 0) minY = Math.min(minY, pos[i]);
      expect(minY, `ground at ${t} (${s.phase})`).toBeGreaterThan(-0.6 * UNITS_PER_CM);
    }
    expect(grab.grip.result).toBe('pulledOut');
  });

  it('in the grab, the bill rises as the robin pulls the worm out and dips as the worm pulls back in', () => {
    const r = new Robin();
    const s = createHunt(half);
    s.phase = 'grab';
    const tip = { x: 0, y: 0, z: 0 };
    const heights = [0, 0.5, 1].map((level) => {
      huntPose(s, { level, loosen: 0, tug: 0 }, () => 0, r.pose);
      r.billTip(tip);
      return tip.y;
    });
    expect(heights[0]).toBeLessThan(0.3);
    expect(heights[1]).toBeGreaterThan(heights[0] + 0.5);
    expect(heights[2]).toBeGreaterThan(heights[1] + 0.5);
  });
});

describe('the robin hunts a worm underground along the cut (revision 1)', () => {
  it('lands along the cut, as close as landUnderCm, with no sideways spread', () => {
    const s = createHunt(() => 0.9);
    robinIn(s, 0);
    const w = worm({ under: true, heading: Math.PI / 2 });
    expect(run(s, w, 2, 'warn')).toEqual(['warn']);
    expect(s.under).toBe(true);
    expect(s.x / UNITS_PER_CM).toBeCloseTo(HUNT.landUnderCm, 3);
    expect(Math.abs(s.z)).toBeLessThan(1e-9);
    // And it closes in along that line.
    run(s, w, 30, 'grab');
    expect(s.phase).toBe('grab');
    expect(Math.abs(s.z)).toBeLessThan(1e-9);
  });

  it('counts down only while the worm is catchable (surface or shallow)', () => {
    const s = createHunt(half);
    const wait = s.wait;
    run(s, worm({ catchable: false, under: true }), 10);
    expect(s.wait).toBe(wait);
    run(s, worm({ under: true }), 5);
    expect(s.wait).toBeLessThan(wait - 4.9);
  });
});

describe('revision 4: the robin keeps after the worm (Matt, 2026-10-24)', () => {
  /** The crawl's top speed (world units a second: drive.ts LOCOMOTION). */
  const CRAWL = 1.6;

  it('catches a worm crawling straight away from it at full speed', () => {
    const s = createHunt(half);
    robinIn(s, 0);
    const w = worm();
    let t = 0;
    for (; t < 30 && s.phase !== 'grab'; t += DT) {
      // Away from where the robin lands (it lands in front: +z), at the crawl's top speed.
      if (s.phase !== 'away' && s.phase !== 'arrive') w.hz -= CRAWL * DT;
      stepHunt(s, DT, w, half);
    }
    expect(s.phase).toBe('grab');
    expect(t).toBeLessThan(12);
    // It got there by running, never faster than its run.
    expect(HUNT.runSpeed).toBeLessThan(100);
  });

  it('a still worm still gets the full stares (time to dig)', () => {
    const s = createHunt(half);
    robinIn(s, 0);
    let t = 0;
    for (; t < 30 && s.phase !== 'strike'; t += DT) stepHunt(s, DT, worm(), half);
    expect(t).toBeGreaterThan(6);
  });

  it('waits where it stands while the worm digs down, then walks over (never jumps) and digs for it', () => {
    const s = createHunt(half);
    robinIn(s, 0);
    run(s, worm(), 4);
    expect(['stare', 'dash']).toContain(s.phase);
    // Digging down at the head: out of reach for now.
    let px = s.x, pz = s.z;
    const step = (w: HuntInput, seconds: number): HuntEvent[] => {
      const seen: HuntEvent[] = [];
      for (let t = 0; t < seconds; t += DT) {
        const e = stepHunt(s, DT, w, half);
        if (e !== 'none') seen.push(e);
        // Never more than a run's step at a time.
        expect(Math.hypot(s.x - px, s.z - pz) / UNITS_PER_CM).toBeLessThan(HUNT.runSpeed * DT * 1.05);
        px = s.x; pz = s.z;
        if (e === 'grab') break;
      }
      return seen;
    };
    expect(step(worm({ catchable: false, wait: true }), 2.5)).toEqual([]);
    expect(s.phase).not.toBe('miss');
    // Underground in the old leaves: the cut runs along x, its line 0.75 behind the head (z = -0.75).
    const under = worm({ under: true, hz: -0.75, ax: 1, az: 0 });
    const seen = step(under, 20);
    expect(seen).toEqual(['grab']);
    expect(s.under).toBe(true);
    // It ends on the cut's line, its reach off the spot.
    expect(s.z).toBeCloseTo(-0.75, 5);
    expect(Math.abs(s.x) / UNITS_PER_CM).toBeCloseTo(HUNT.reachCm, 1);
  });

  it('scratches and probes before the grab underground; a worm that digs deeper then gets away', () => {
    const s = createHunt(half);
    robinIn(s, 0);
    const w = worm({ under: true, heading: Math.PI / 2, ax: 1, az: 0 });
    for (let t = 0; t < 30 && s.phase !== 'dig'; t += DT) stepHunt(s, DT, w, half);
    expect(s.phase).toBe('dig');
    expect(run(s, w, HUNT.scratch)).toEqual([]);
    // Below the escape layer: away for good.
    expect(run(s, worm({ under: true, catchable: false }), 0.1)).toEqual(['miss']);
    expect(s.struck).toBe(true);
  });

  it('the escape depth is the one entry in the table: below the top two layers', async () => {
    const { B_H } = await import('../../src/underground/slab');
    expect(HUNT.escapeLayer).toBe(B_H);
  });
});

