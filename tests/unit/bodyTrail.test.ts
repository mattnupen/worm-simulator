import { describe, it, expect } from 'vitest';
import {
  createTrail, seedTrail, followHead, poseBehind, backAlong, TRAIL_CAP, TRAIL_LAG, TRAIL_STEP,
  type BodyTrail, type TrailBody,
} from '../../src/underground/bodyTrail';
import { SPACING, WORM_SEGMENTS } from '../../src/game/crawl';

const N = WORM_SEGMENTS;
/** The head's step (u) in these tests. */
const STEP = 0.02;

function straightBody(): TrailBody {
  const u = new Float64Array(N);
  const v = new Float64Array(N);
  for (let i = 0; i < N; i++) { u[i] = -SPACING * i; v[i] = 0; }
  return { u, v, prevU: Float64Array.from(u), prevV: Float64Array.from(v) };
}
/** Moves the head by (du, dv), then follows and poses the body, as a burrow step does. */
function stepHead(t: BodyTrail, b: TrailBody, du: number, dv: number): void {
  b.prevU.set(b.u);
  b.prevV.set(b.v);
  b.u[0] += du;
  b.v[0] += dv;
  followHead(t, b);
  poseBehind(t, b);
}
/** One backing step, as a burrow step does. */
function stepBack(t: BodyTrail, b: TrailBody, step: number): void {
  b.prevU.set(b.u);
  b.prevV.set(b.v);
  backAlong(t, b, { step });
}
/** Distance from (u, v) to the polyline of the head's own positions. */
function distToPath(path: number[][], u: number, v: number): number {
  let best = Infinity;
  for (let k = 1; k < path.length; k++) {
    const [au, av] = path[k - 1];
    const [bu, bv] = path[k];
    const du = bu - au, dv = bv - av;
    const l2 = du * du + dv * dv;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((u - au) * du + (v - av) * dv) / l2)) : 0;
    best = Math.min(best, Math.hypot(au + t * du - u, av + t * dv - v));
  }
  return best;
}
/** Each link's straight-line length (its chord). */
const links = (b: TrailBody) => Array.from({ length: N - 1 }, (_, i) => Math.hypot(b.u[i + 1] - b.u[i], b.v[i + 1] - b.v[i]));
/** The trail's arc length at place s. */
function arcAt(t: BodyTrail, s: number): number {
  const k = Math.min(t.n - 2, Math.floor(s));
  return t.arc[k] + (t.arc[k + 1] - t.arc[k]) * (s - k);
}
/**
 * Each link's arc length along the trail. Moving forward the head is just past the live point, on
 * the straight on to it; backed, it is on the trail at at[0].
 */
function arcLinks(t: BodyTrail, b: TrailBody): number[] {
  const k = t.n - 1;
  const a = [t.backed ? arcAt(t, t.at[0]) : t.arc[k] + Math.hypot(b.u[0] - t.u[k], b.v[0] - t.v[k])];
  for (let i = 1; i < N; i++) a.push(arcAt(t, t.at[i]));
  return Array.from({ length: N - 1 }, (_, i) => a[i] - a[i + 1]);
}
/**
 * The links are exact: each is SPACING of arc along the trail, and its chord is never longer
 * (shorter only where the trail bends), nor shorter than minShare of SPACING.
 */
function expectLinks(t: BodyTrail, b: TrailBody, minShare: number): void {
  for (const l of arcLinks(t, b)) expect(l).toBeCloseTo(SPACING, 9);
  for (const l of links(b)) {
    expect(l).toBeLessThanOrEqual(SPACING + 1e-9);
    expect(l).toBeGreaterThanOrEqual(minShare * SPACING);
  }
}
/** On a straight leg every chord is SPACING. */
function expectStraightLinks(b: TrailBody): void {
  for (const l of links(b)) expect(l).toBeCloseTo(SPACING, 6);
}
/** The farthest any body point moved this step. */
function mostMoved(b: TrailBody): number {
  let m = 0;
  for (let i = 0; i < N; i++) m = Math.max(m, Math.hypot(b.u[i] - b.prevU[i], b.v[i] - b.prevV[i]));
  return m;
}

describe('the body rides the head\'s trail (a chain on a rail)', () => {
  it('a seeded straight body keeps its pose, and every link is exactly SPACING as it moves', () => {
    const t = createTrail();
    const b = straightBody();
    seedTrail(t, b);
    poseBehind(t, b);
    for (let i = 0; i < N; i++) expect(b.u[i]).toBeCloseTo(-SPACING * i, 9);
    for (let k = 0; k < 120; k++) stepHead(t, b, STEP, 0);
    expectStraightLinks(b);
    expectLinks(t, b, 1 - 1e-9);
  });

  it('a 90 degree corner then straight (Matt\'s report): every body point stays within TRAIL_LAG of the head\'s path', () => {
    const t = createTrail();
    const b = straightBody();
    seedTrail(t, b);
    const path: number[][] = [];
    for (let i = N - 1; i >= 0; i--) path.push([b.u[i], b.v[i]]);
    const go = (du: number, dv: number, steps: number) => {
      for (let k = 0; k < steps; k++) {
        stepHead(t, b, du, dv);
        path.push([b.u[0], b.v[0]]);
        for (let i = 1; i < N; i++) expect(distToPath(path, b.u[i], b.v[i])).toBeLessThan(TRAIL_LAG + 0.01);
        // Measured 0.866: a link's chord across the corner, rounded to about TRAIL_LAG.
        expectLinks(t, b, 0.85);
      }
    };
    go(STEP, 0, 60);
    go(0, -STEP, 200); // a sharp turn, then straight on (4 u, past the body's 3.3): the old chain cut this corner
    // The tail has passed the corner: the body lies straight down the new leg (the pursuit point
    // closes on the head's line exponentially, so to within a millimetre-ish 1e-3 u).
    for (let i = 0; i < N; i++) expect(Math.abs(b.u[i] - b.u[0])).toBeLessThan(1e-3);
    expectStraightLinks(b);
  });

  it('a hairpin (out and straight back beside itself) keeps every point on the path', () => {
    const t = createTrail();
    const b = straightBody();
    seedTrail(t, b);
    const path: number[][] = [];
    for (let i = N - 1; i >= 0; i--) path.push([b.u[i], b.v[i]]);
    const go = (du: number, dv: number, steps: number) => {
      for (let k = 0; k < steps; k++) {
        stepHead(t, b, du, dv);
        path.push([b.u[0], b.v[0]]);
        for (let i = 1; i < N; i++) expect(distToPath(path, b.u[i], b.v[i])).toBeLessThan(TRAIL_LAG + 0.01);
        // Measured 0.704: across the bend a link's chord is short, as the tunnel is narrow there.
        expectLinks(t, b, 0.65);
      }
    };
    go(STEP, 0, 100);
    go(0, STEP, 10);
    go(-STEP, 0, 150);
  });

  it('nothing pops on hairpins: no body point moves more than the head\'s step, forward or backing', () => {
    // Legs closer than a link: placing points by chord jumped up to 0.4 u in a step here.
    // Measured shortest chords: 0.336 of SPACING with legs 0.1 apart (the bend's radius is about
    // 0.04 there), 0.704 at 0.2 and 0.710 at 0.3.
    const minShare: Record<number, number> = { 0.1: 0.3, 0.2: 0.65, 0.3: 0.65 };
    const most = 1.5 * STEP + 1e-9;
    for (const gap of [0.1, 0.2, 0.3]) {
      const t = createTrail();
      const b = straightBody();
      seedTrail(t, b);
      for (let k = 0; k < 100; k++) stepHead(t, b, STEP, 0);
      const forward = (du: number, dv: number, steps: number) => {
        for (let k = 0; k < steps; k++) {
          stepHead(t, b, du, dv);
          expect(mostMoved(b)).toBeLessThanOrEqual(most);
          expectLinks(t, b, minShare[gap]);
        }
      };
      forward(0, STEP, Math.round(gap / STEP));
      forward(-STEP, 0, 100); // the body now lies round the bend
      stepBack(t, b, 0);
      expect(mostMoved(b)).toBeLessThan(1e-9); // backing starts where the body is
      for (let k = 0; k < 60; k++) {
        stepBack(t, b, STEP); // back round the bend
        expect(mostMoved(b)).toBeLessThanOrEqual(most);
        expectLinks(t, b, minShare[gap]);
      }
      forward(0, -STEP, 60); // and forward again a new way
    }
  });

  it('backing slides the whole body back along its trail and stops at the trail\'s start', () => {
    const t = createTrail();
    const b = straightBody();
    seedTrail(t, b);
    for (let k = 0; k < 60; k++) stepHead(t, b, STEP, 0);
    for (let k = 0; k < 80; k++) stepHead(t, b, 0, STEP);
    const start = { u: -SPACING * (N - 1), v: 0 };
    for (let k = 0; k < 2000; k++) {
      stepBack(t, b, STEP);
      expectLinks(t, b, 0.85);
    }
    // The tail is at the trail's start: the tunnel's end.
    expect(b.u[N - 1]).toBeCloseTo(start.u, 6);
    expect(b.v[N - 1]).toBeCloseTo(start.v, 6);
    expectStraightLinks(b);
  });

  it('backing starts without a jump (the head is pinned where it is)', () => {
    const t = createTrail();
    const b = straightBody();
    seedTrail(t, b);
    for (let k = 0; k < 60; k++) stepHead(t, b, STEP, 0.005);
    const head = [b.u[0], b.v[0]];
    stepBack(t, b, 0);
    expect(b.u[0]).toBeCloseTo(head[0], 9);
    expect(b.v[0]).toBeCloseTo(head[1], 9);
    expect(mostMoved(b)).toBeLessThan(1e-9);
  });

  it('going forward after backing cuts the old trail there and records the new way', () => {
    const t = createTrail();
    const b = straightBody();
    seedTrail(t, b);
    for (let k = 0; k < 100; k++) stepHead(t, b, STEP, 0);
    for (let k = 0; k < 50; k++) stepBack(t, b, STEP);
    const nAfterBack = t.n;
    for (let k = 0; k < 200; k++) stepHead(t, b, 0, -STEP);
    // The old branch beyond the head (about 50 points) was cut before the new way was appended.
    expect(t.n).toBeLessThan(nAfterBack + 160);
    expect(t.backed).toBe(false);
    // The body lies on the new leg, straight down from the cut.
    expect(Math.abs(b.u[N - 1] - b.u[0])).toBeLessThan(1e-3);
    expectStraightLinks(b);
    expectLinks(t, b, 1 - 1e-6);
  });

  it('when full it drops its oldest half and the body does not move', () => {
    const t = createTrail();
    const b = straightBody();
    seedTrail(t, b);
    let k = 0;
    // Fill it: every step commits a point (each is a little over TRAIL_STEP).
    while (t.n < TRAIL_CAP && k < 100000) { stepHead(t, b, TRAIL_STEP * 1.01 * Math.cos(k * 0.01), TRAIL_STEP * 1.01 * Math.sin(k * 0.01)); k++; }
    expect(t.n).toBe(TRAIL_CAP);
    const before = [b.u[N - 1], b.v[N - 1]];
    stepHead(t, b, 0, 0); // no commit: still full
    stepHead(t, b, 0.03, 0); // the next commit drops the oldest half
    expect(t.n).toBeLessThan(TRAIL_CAP / 2 + 10);
    // On a circle of radius 2 u a link's chord is 1e-4 u short of its arc.
    expectLinks(t, b, 1 - 1e-3);
    expect(Math.hypot(b.u[N - 1] - before[0], b.v[N - 1] - before[1])).toBeLessThan(0.05);
  });

  it('a seed with uneven links eases them to SPACING as it moves, with no jump at the start', () => {
    const t = createTrail();
    const b = straightBody();
    for (let i = 0; i < N; i++) b.u[i] = -0.2 * i; // links 0.2, not SPACING
    seedTrail(t, b);
    const before = Array.from(b.u);
    poseBehind(t, b);
    for (let i = 0; i < N; i++) expect(b.u[i]).toBeCloseTo(before[i], 9);
    for (let k = 0; k < 400; k++) stepHead(t, b, STEP, 0);
    for (const l of links(b)) expect(l).toBeCloseTo(SPACING, 3);
  });
});
