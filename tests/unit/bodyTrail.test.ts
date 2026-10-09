import { describe, it, expect } from 'vitest';
import {
  createTrail, seedTrail, followHead, poseBehind, backAlong, TRAIL_CAP, TRAIL_LAG, TRAIL_STEP,
  type BodyTrail, type TrailBody,
} from '../../src/underground/bodyTrail';
import { SPACING, WORM_SEGMENTS } from '../../src/game/crawl';

const N = WORM_SEGMENTS;

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
const links = (b: TrailBody) => Array.from({ length: N - 1 }, (_, i) => Math.hypot(b.u[i + 1] - b.u[i], b.v[i + 1] - b.v[i]));

describe('the body rides the head\'s trail (a chain on a rail)', () => {
  it('a seeded straight body keeps its pose, and every link is exactly SPACING as it moves', () => {
    const t = createTrail();
    const b = straightBody();
    seedTrail(t, b);
    poseBehind(t, b);
    for (let i = 0; i < N; i++) expect(b.u[i]).toBeCloseTo(-SPACING * i, 9);
    for (let k = 0; k < 120; k++) stepHead(t, b, 0.02, 0);
    for (const l of links(b)) expect(l).toBeCloseTo(SPACING, 6);
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
        for (const l of links(b)) expect(l).toBeCloseTo(SPACING, 6);
      }
    };
    go(0.02, 0, 60);
    go(0, -0.02, 200); // a sharp turn, then straight on (4 u, past the body's 3.3): the old chain cut this corner
    // The tail has passed the corner: the body lies straight down the new leg (the pursuit point
    // closes on the head's line exponentially, so to within a millimetre-ish 1e-3 u).
    for (let i = 0; i < N; i++) expect(Math.abs(b.u[i] - b.u[0])).toBeLessThan(1e-3);
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
      }
    };
    go(0.02, 0, 100);
    go(0, 0.02, 10);
    go(-0.02, 0, 150);
    for (const l of links(b)) expect(l).toBeCloseTo(SPACING, 6);
  });

  it('backing slides the whole body back along its trail and stops at the trail\'s start', () => {
    const t = createTrail();
    const b = straightBody();
    seedTrail(t, b);
    for (let k = 0; k < 60; k++) stepHead(t, b, 0.02, 0);
    for (let k = 0; k < 80; k++) stepHead(t, b, 0, 0.02);
    const start = { u: -SPACING * (N - 1), v: 0 };
    const step = { step: 0.02 };
    for (let k = 0; k < 2000; k++) {
      b.prevU.set(b.u); b.prevV.set(b.v);
      backAlong(t, b, step);
      for (const l of links(b)) expect(l).toBeCloseTo(SPACING, 6);
    }
    // The tail is at the trail's start: the tunnel's end.
    expect(b.u[N - 1]).toBeCloseTo(start.u, 6);
    expect(b.v[N - 1]).toBeCloseTo(start.v, 6);
  });

  it('backing starts without a jump (the head is pinned where it is)', () => {
    const t = createTrail();
    const b = straightBody();
    seedTrail(t, b);
    for (let k = 0; k < 60; k++) stepHead(t, b, 0.02, 0.005);
    const head = [b.u[0], b.v[0]];
    b.prevU.set(b.u); b.prevV.set(b.v);
    backAlong(t, b, { step: 0 });
    expect(b.u[0]).toBeCloseTo(head[0], 9);
    expect(b.v[0]).toBeCloseTo(head[1], 9);
  });

  it('going forward after backing cuts the old trail there and records the new way', () => {
    const t = createTrail();
    const b = straightBody();
    seedTrail(t, b);
    for (let k = 0; k < 100; k++) stepHead(t, b, 0.02, 0);
    for (let k = 0; k < 50; k++) { b.prevU.set(b.u); b.prevV.set(b.v); backAlong(t, b, { step: 0.02 }); }
    const nAfterBack = t.n;
    for (let k = 0; k < 200; k++) stepHead(t, b, 0, -0.02);
    // The old branch beyond the head (about 50 points) was cut before the new way was appended.
    expect(t.n).toBeLessThan(nAfterBack + 160);
    expect(t.backed).toBe(false);
    for (const l of links(b)) expect(l).toBeCloseTo(SPACING, 6);
    // The body lies on the new leg, straight down from the cut.
    expect(Math.abs(b.u[N - 1] - b.u[0])).toBeLessThan(1e-3);
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
    for (const l of links(b)) expect(l).toBeCloseTo(SPACING, 6);
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
    for (let k = 0; k < 400; k++) stepHead(t, b, 0.02, 0);
    for (const l of links(b)) expect(l).toBeCloseTo(SPACING, 3);
  });
});
