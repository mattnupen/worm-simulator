import { describe, it, expect } from 'vitest';
import {
  DigMarks, GAME_TESTS, MARK_BUDGET, MARK_FAR, MARK_GAP, MARK_NONE, MARK_OPENING, MARK_SPOT, MAX_MARKS, DROP_FAR,
  type DigTests, type MarkAsk, type MarkWorld,
} from '../../src/underground/digMarks';
import { canDigAt } from '../../src/underground/digSpot';
import { createOpenings } from '../../src/underground/openings';
import { createBurrows } from '../../src/underground/burrows';
import { createSlab } from '../../src/underground/slab';
import { Crawl } from '../../src/game/crawl';
import type { WormMotion } from '../../src/worm/locomotion';

const world = (): MarkWorld => ({ openings: createOpenings(), burrows: createBurrows() });
const motion = (x: number, z: number, heading: number): WormMotion => ({ head: { x, y: 0, z }, heading });

/** Dig tests that count their calls per step, and answer `spot` and `reuse` as given. */
function counting(spot: (a: MarkAsk) => boolean, reuse: DigTests['reuse'] = () => false) {
  const t = { n: 0, spot: (a: MarkAsk) => { t.n++; return spot(a); }, reuse: (w: MarkWorld, i: number, a: MarkAsk) => { t.n++; return reuse(w, i, a); } };
  return t;
}

const marked = (d: DigMarks): number => Array.from(d.kind).filter((k) => k !== MARK_NONE).length;
const snapshot = (d: DigMarks) => [Array.from(d.kind), Array.from(d.x), Array.from(d.z)];

/** An opening at (x, z) over burrow slot `k` (its slab through it along `heading`). */
function addOpeningAt(w: MarkWorld, x: number, z: number, k: number, heading = 0): void {
  const o = w.openings;
  const i = o.count++;
  o.data[i * 4] = x;
  o.data[i * 4 + 2] = z;
  o.burrow[i] = k;
  (w.burrows.slabs as unknown[])[k] = createSlab(x, z, heading, 1, 7);
  o.version++;
}

describe('dig markers: where the worm could dig (V4 spec 4.2)', () => {
  it('never makes more than MARK_BUDGET dig tests a step, crawling through the real forest', () => {
    const t = counting((a) => GAME_TESTS.spot(a));
    const d = new DigMarks(t);
    const c = new Crawl();
    const w = world();
    let most = 0;
    for (let i = 0; i < 2400; i++) {
      c.step(1 / 60, { x: 0.5 * Math.sin(i * 0.01), y: 1 });
      t.n = 0;
      d.step(c.motion, w);
      expect(d.calls).toBe(t.n);
      most = Math.max(most, t.n);
      expect(marked(d)).toBeLessThanOrEqual(MAX_MARKS);
    }
    expect(MARK_BUDGET).toBeLessThanOrEqual(4);
    expect(most).toBeLessThanOrEqual(MARK_BUDGET);
    expect(most).toBeGreaterThan(0);
  });

  it('with openings to check too, the budget holds (an opening takes 2 tests: reuse, then a new dig)', () => {
    const t = counting(() => false, () => false);
    const d = new DigMarks(t);
    const w = world();
    for (let i = 0; i < 5; i++) addOpeningAt(w, -4 + i * 2, 4, i);
    for (let s = 0; s < 300; s++) {
      t.n = 0;
      d.step(motion(0, 0, 0), w);
      expect(t.n).toBeLessThanOrEqual(MARK_BUDGET);
    }
    expect(marked(d)).toBe(0);
  });

  it('shows at most 3, spread out, within reach and in front of the worm', () => {
    const d = new DigMarks(counting(() => true));
    const w = world();
    const m = motion(0, 0, 0.4);
    for (let s = 0; s < 200; s++) d.step(m, w);
    expect(marked(d)).toBe(MAX_MARKS);
    for (let i = 0; i < MAX_MARKS; i++) {
      const dx = d.x[i];
      const dz = d.z[i];
      const r = Math.hypot(dx, dz);
      expect(r).toBeLessThanOrEqual(MARK_FAR);
      expect(dx * Math.sin(0.4) + dz * Math.cos(0.4)).toBeGreaterThan(0);
      for (let j = 0; j < i; j++) expect(Math.hypot(d.x[j] - dx, d.z[j] - dz)).toBeGreaterThanOrEqual(MARK_GAP);
    }
  });

  it('marks only spots where canDigAt passes for a worm arriving there', () => {
    const d = new DigMarks();
    const c = new Crawl();
    const w = world();
    let seen = 0;
    const was = new Float64Array(MAX_MARKS).fill(NaN);
    for (let i = 0; i < 1800; i++) {
      c.step(1 / 60, { x: 0.3 * Math.sin(i * 0.006), y: 1 });
      d.step(c.motion, w);
      // Each spot as it is marked (tested from where the head was then).
      for (let k = 0; k < MAX_MARKS; k++) {
        if (d.kind[k] !== MARK_SPOT || d.x[k] === was[k]) continue;
        was[k] = d.x[k];
        seen++;
        expect(canDigAt(d.x[k], d.z[k], Math.atan2(d.x[k] - c.motion.head.x, d.z[k] - c.motion.head.z))).toBe(true);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('is steady: the same steps give the same markers, and small moves of the head keep them', () => {
    const a = new DigMarks(counting(() => true));
    const b = new DigMarks(counting(() => true));
    const w = world();
    for (let s = 0; s < 120; s++) {
      a.step(motion(1, 2, 0.3), w);
      b.step(motion(1, 2, 0.3), w);
    }
    expect(snapshot(a)).toEqual(snapshot(b));
    const before = snapshot(a);
    const version = a.version;
    // The head creeps forward a little and wobbles its heading: nothing moves or swaps.
    for (let s = 0; s < 300; s++) {
      const t = s / 300;
      a.step(motion(1 + 0.3 * t * Math.sin(0.3), 2 + 0.3 * t * Math.cos(0.3), 0.3 + 0.08 * Math.sin(s * 0.2)), w);
    }
    expect(snapshot(a)).toEqual(before);
    expect(a.version).toBe(version);
  });

  it('drops a marker that no longer works, one too far, and one left behind', () => {
    const bad = new Set<string>();
    const key = (x: number, z: number) => `${x.toFixed(4)},${z.toFixed(4)}`;
    const d = new DigMarks(counting((a) => !bad.has(key(a.head.x, a.head.z))));
    const w = world();
    for (let s = 0; s < 120; s++) d.step(motion(0, 0, 0), w);
    expect(marked(d)).toBe(MAX_MARKS);
    // That spot stops working (bad is checked by its exact place): the recheck drops it.
    const k = 1;
    const x = d.x[k];
    const z = d.z[k];
    bad.add(key(x, z));
    for (let s = 0; s < 200 && d.kind[k] !== MARK_NONE && d.x[k] === x; s++) d.step(motion(0, 0, 0), w);
    for (let i = 0; i < MAX_MARKS; i++) expect(d.kind[i] !== MARK_NONE && d.x[i] === x && d.z[i] === z).toBe(false);
    // Turned right round, every marker is behind the worm: all go (new ones come up in front),
    // but one right beside the head (within 2 u: the worm may be turning to reach it).
    const kept = snapshot(d);
    d.step(motion(0, 0, Math.PI), w);
    for (let i = 0; i < MAX_MARKS; i++) {
      if (kept[0][i] !== MARK_NONE && Math.hypot(kept[1][i], kept[2][i]) > 2) expect(d.x[i] === kept[1][i] && d.z[i] === kept[2][i] && d.kind[i] !== MARK_NONE).toBe(false);
    }
    // Far away: everything left is dropped.
    for (let s = 0; s < 10; s++) d.step(motion(0, -30, Math.PI), w);
    for (let i = 0; i < MAX_MARKS; i++) if (d.kind[i] !== MARK_NONE) expect(Math.hypot(d.x[i], d.z[i] + 30)).toBeLessThanOrEqual(DROP_FAR);
  });

  it('prefers an old opening that leads to a burrow: it takes a slot even when all 3 are spots', () => {
    const d = new DigMarks(counting(() => true, () => true));
    const w = world();
    for (let s = 0; s < 120; s++) d.step(motion(0, 0, 0), w);
    expect(Array.from(d.kind)).toEqual([MARK_SPOT, MARK_SPOT, MARK_SPOT]);
    addOpeningAt(w, 0.5, 3.5, 0);
    for (let s = 0; s < 12; s++) d.step(motion(0, 0, 0), w);
    const k = Array.from(d.kind).indexOf(MARK_OPENING);
    expect(k).toBeGreaterThanOrEqual(0);
    expect(d.opening[k]).toBe(0);
    expect([d.x[k], d.z[k]]).toEqual([w.openings.data[0], w.openings.data[2]]);
    // No spot marker crowds the opening (its midden is its mound).
    for (let i = 0; i < MAX_MARKS; i++) if (i !== k) expect(Math.hypot(d.x[i] - 0.5, d.z[i] - 3.5)).toBeGreaterThan(1.25);
    // An opening without a burrow is not marked as one; one whose dig no longer works is dropped.
    const e = new DigMarks(counting(() => false, () => false));
    w.openings.burrow[0] = -1;
    for (let s = 0; s < 30; s++) e.step(motion(0, 0, 0), w);
    expect(marked(e)).toBe(0);
  });

  it('the game\'s own reuse test marks a real old burrow\'s opening', () => {
    // A spot where a dig works, in front of a worm at the spawn.
    let at: [number, number] | null = null;
    for (let z = 2; z <= 5 && !at; z += 0.5) for (let x = -2; x <= 2 && !at; x += 0.5) if (canDigAt(x, z, Math.atan2(x, z))) at = [x, z];
    expect(at).not.toBeNull();
    const w = world();
    addOpeningAt(w, at![0], at![1], 0, Math.atan2(at![0], at![1]));
    const d = new DigMarks();
    for (let s = 0; s < 12; s++) d.step(motion(0, 0, 0), w);
    expect(Array.from(d.kind)).toContain(MARK_OPENING);
  });
});
