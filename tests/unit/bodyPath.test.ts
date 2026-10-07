import { describe, it, expect } from 'vitest';
import {
  createBodyPath, buildSink, poseAt, smootherstep, restAxis, SINK_DEPTH, AXIS_UP, type BodyPath,
} from '../../src/underground/bodyPath';
import { buildEmerge } from '../../src/underground/emergePath';
import { createSlab, boundaryAt, slabX, slabZ, B_F, B_TOP, type Slab } from '../../src/underground/slab';
import { Crawl, SPACING } from '../../src/game/crawl';
import { SINK_S, RISE_S, OUT_S } from '../../src/underground/modeMachine';
import { footprints, obstacleDepth } from '../../src/surface/obstacles';
import { OCC_AXIS_UP } from '../../src/render/occlusion';
import { mulberry32 } from '../../src/core/random';
import { floorHeight } from '../../src/surface/litterDepth';

const N = 16;
const DT = 1 / 60;
const DEG = Math.PI / 180;
/** A joint never bends more than this during a move, unless the body was already bent more. */
const KINK = 45 * DEG;
/**
 * The most a point's per-frame step may change between frames (u): a snap or a sudden stop shows as
 * far more. Sweeping the tail (3.3 u behind the head) through an 80 degree turn within the 1 s sink
 * needs about 0.023.
 */
const MAX_ACCEL = 0.03;
const hit = { nx: 0, nz: 0 };

type P3 = [number, number, number];

/** A crawl that has wandered a while (seeded turns), so its body has a natural curve. */
function crawled(seed: number): Crawl {
  const c = new Crawl();
  const steps = 50 + 25 * seed;
  for (let k = 0; k < steps; k++) c.step(DT, { x: 0.9 * Math.sin(k * 0.04 * seed + seed), y: 1 });
  return c;
}

/** World points (head first) of the pose at progress t: the axis (v is the axis height). */
function world(s: Slab, p: BodyPath, t: number, u: Float64Array, v: Float64Array, w: Float64Array): P3[] {
  poseAt(p, t, u, v, w);
  return Array.from({ length: N }, (_, i): P3 => [slabX(s, u[i]) + s.nx * w[i], v[i], slabZ(s, u[i]) + s.nz * w[i]]);
}

const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: P3): number => Math.hypot(a[0], a[1], a[2]);
function angle(a: P3, b: P3): number {
  const l = len(a) * len(b);
  if (l < 1e-18) return 0;
  return Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / l)));
}
/** The sharpest bend between neighbouring segments. */
function maxBend(b: P3[]): number {
  let m = 0;
  for (let i = 1; i < b.length - 1; i++) m = Math.max(m, angle(sub(b[i], b[i - 1]), sub(b[i + 1], b[i])));
  return m;
}

interface Played { first: P3[]; last: P3[]; frames: P3[][] }

/**
 * Plays the move at 60 Hz and checks it frame by frame: every point moves smoothly (its step and the
 * change in its step bounded, still at both ends), the head never doubles back, no joint kinks and
 * no segment stretches.
 */
function play(s: Slab, p: BodyPath, seconds: number, maxStep: number, maxHeadTurn: number): Played {
  const u = new Float64Array(N);
  const v = new Float64Array(N);
  const w = new Float64Array(N);
  const n = Math.round(seconds / DT);
  const frames: P3[][] = [];
  for (let k = 0; k <= n; k++) frames.push(world(s, p, k / n, u, v, w));
  const bend0 = maxBend(frames[0]);
  for (let k = 1; k <= n; k++) {
    const a = frames[k - 1];
    const b = frames[k];
    for (let i = 0; i < N; i++) {
      const d = sub(b[i], a[i]);
      expect(len(d)).toBeLessThanOrEqual(maxStep);
      // No snap: a point's step changes only a little from one frame to the next.
      if (k >= 2) expect(len(sub(d, sub(a[i], frames[k - 2][i])))).toBeLessThanOrEqual(MAX_ACCEL);
      if (i > 0) expect(len(sub(b[i], b[i - 1]))).toBeLessThanOrEqual(SPACING * 1.04);
    }
    expect(maxBend(b)).toBeLessThanOrEqual(Math.max(bend0, KINK) + 1e-9);
    if (k >= 2) {
      // The head never reverses or jerks sideways: its way changes a little from frame to frame.
      const h1 = sub(a[0], frames[k - 2][0]);
      const h2 = sub(b[0], a[0]);
      if (len(h1) > 1e-4 && len(h2) > 1e-4) expect(angle(h1, h2)).toBeLessThan(maxHeadTurn);
    }
  }
  // Starts and stops gently: no jump from or into a still worm.
  for (let i = 0; i < N; i++) {
    expect(len(sub(frames[1][i], frames[0][i]))).toBeLessThan(2e-3);
    expect(len(sub(frames[n][i], frames[n - 1][i]))).toBeLessThan(2e-3);
  }
  return { first: frames[0], last: frames[n], frames };
}

/** A burrower body in the plane: the head at (hu, hv) facing `dir`, the body trailing in a gentle curve. */
function burrowerBody(hu: number, hv: number, dir: number, curve: number): { us: Float64Array; vs: Float64Array } {
  const us = new Float64Array(N);
  const vs = new Float64Array(N);
  let a = dir + Math.PI;
  us[0] = hu;
  vs[0] = hv;
  for (let i = 1; i < N; i++) {
    us[i] = us[i - 1] + Math.cos(a) * SPACING;
    vs[i] = vs[i - 1] + Math.sin(a) * SPACING;
    a += curve;
  }
  return { us, vs };
}

describe('digging down and coming up: the worm\'s own move (spec 4.1, 4.2)', () => {
  it('rests the axis where the crawl rests the body: its belly on the floor, under the litter', () => {
    expect(AXIS_UP).toBe(OCC_AXIS_UP);
    const c = crawled(3);
    for (const b of c.body) expect(restAxis(b.x, b.z)).toBe(b.y + AXIS_UP);
  });

  it('sinks: frame 0 is the crawl\'s last frame exactly, whatever the cut\'s turn', () => {
    const c = crawled(2);
    const h = c.motion.head;
    const p = createBodyPath();
    const u = new Float64Array(N);
    const v = new Float64Array(N);
    const w = new Float64Array(N);
    for (const turn of [-80, -45, -20, 0, 20, 45, 80]) {
      for (const side of [1, -1] as const) {
        const s = createSlab(h.x, h.z, c.motion.heading + turn * DEG, side, 7);
        buildSink(p, s, c.body);
        const b = world(s, p, 0, u, v, w);
        for (let i = 0; i < N; i++) {
          expect(b[i][0]).toBeCloseTo(c.body[i].x, 9);
          expect(b[i][1]).toBeCloseTo(c.body[i].y + AXIS_UP, 9);
          expect(b[i][2]).toBeCloseTo(c.body[i].z, 9);
        }
      }
    }
  });

  it('sinks smoothly, turning to lie along the cut: a sweep of bodies and cut turns up to 80 degrees', () => {
    const p = createBodyPath();
    for (let seed = 1; seed <= 6; seed++) {
      const c = crawled(seed);
      const h = c.motion.head;
      for (const turn of [-80, -60, -35, -10, 0, 15, 40, 65, 80]) {
        const s = createSlab(h.x, h.z, c.motion.heading + turn * DEG, seed % 2 ? 1 : -1, seed);
        buildSink(p, s, c.body);
        const { last } = play(s, p, SINK_S, 0.2, 8 * DEG);
        const u = new Float64Array(N);
        const v = new Float64Array(N);
        const w = new Float64Array(N);
        poseAt(p, 1, u, v, w);
        // Wholly in the cut's plane, the head below the F top and facing straight down.
        for (let i = 0; i < N; i++) expect(w[i] === 0).toBe(true);
        expect(v[0]).toBeLessThanOrEqual(boundaryAt(s, B_F, u[0]) - SINK_DEPTH + 1e-9);
        expect(v[0] - v[1]).toBeLessThan(-0.9 * (Math.hypot(u[0] - u[1], v[0] - v[1])));
        // What is still on the surface lies along the cut, behind the hole, its belly on the floor.
        for (let i = 1; i < N; i++) {
          if (u[i] > -1e-9) continue; // the hole is at u = 0 (the slab is dug at the head)
          expect(u[i]).toBeLessThan(u[i - 1] + 1e-9);
          expect(v[i]).toBeCloseTo(restAxis(slabX(s, u[i]), slabZ(s, u[i])), 9);
        }
        expect(last[0][1]).toBeCloseTo(v[0], 9);
      }
    }
  });

  it('a body bunched up in a turn starts exactly where it lay, and keeps its own spacing', () => {
    // A tight curl, its points only 0.15 apart (the burrower's or a pushed body can bunch like this).
    const body = Array.from({ length: N }, () => ({ x: 0, y: 0, z: 0 }));
    let a = 0.4;
    body[0].x = 2;
    body[0].z = 3;
    for (let i = 0; i < N; i++) {
      if (i > 0) {
        body[i].x = body[i - 1].x - Math.sin(a) * 0.15;
        body[i].z = body[i - 1].z - Math.cos(a) * 0.15;
        a += 0.2;
      }
      body[i].y = floorHeight(body[i].x, body[i].z) + 0.01;
    }
    const c = { body };
    const s = createSlab(2, 3, 0.4 + 30 * DEG, 1, 9);
    const flat = (i: number) => Math.hypot(c.body[i].x - c.body[i - 1].x, c.body[i].z - c.body[i - 1].z);
    expect(Math.min(...Array.from({ length: N - 1 }, (_, i) => flat(i + 1)))).toBeLessThan(0.8 * SPACING);
    const p = createBodyPath();
    buildSink(p, s, c.body);
    // A curled body swings further as it uncurls into the plane.
    const { first } = play(s, p, SINK_S, 0.3, 8 * DEG);
    for (let i = 0; i < N; i++) {
      expect(first[i][0]).toBeCloseTo(c.body[i].x, 9);
      expect(first[i][1]).toBeCloseTo(c.body[i].y + AXIS_UP, 9);
      expect(first[i][2]).toBeCloseTo(c.body[i].z, 9);
    }
    const u = new Float64Array(N);
    const v = new Float64Array(N);
    const w = new Float64Array(N);
    poseAt(p, 1, u, v, w);
    // Laid out along the cut, each segment as long as it was on the floor: no stretch, no snap.
    for (let i = 2; i < N; i++) if (u[i - 1] < -1e-9) expect(u[i - 1] - u[i]).toBeCloseTo(flat(i), 9);
  });

  it('comes up smoothly from any facing, onto the floor along the cut, head first the way out', () => {
    const p = createBodyPath();
    const rand = mulberry32(11);
    for (const seed of [1, 2, 3]) {
      const s = createSlab(-3 + seed * 2.5, 4 - seed * 3, seed * 1.1, seed % 2 ? 1 : -1, seed);
      for (const hu of [-5, -1, 0.5, 4]) {
        for (let a = 0; a < 360; a += 20) {
          const dir = a * DEG;
          const floor = boundaryAt(s, B_F, hu);
          // Near the top: just under the F top, at it, or up in the litter.
          const hv = floor + [-0.18, 0.05, 0.6][Math.floor(rand() * 3)];
          if (hv > boundaryAt(s, B_TOP, hu) - 0.12) continue;
          const { us, vs } = burrowerBody(hu, hv, dir, (rand() - 0.5) * 0.3);
          buildEmerge(p, s, us, vs, dir);
          const { first, last } = play(s, p, RISE_S + OUT_S, 0.12, 15 * DEG);
          for (let i = 0; i < N; i++) {
            expect(first[i][0]).toBeCloseTo(slabX(s, us[i]), 9);
            expect(first[i][1]).toBeCloseTo(vs[i], 9);
            expect(first[i][2]).toBeCloseTo(slabZ(s, us[i]), 9);
          }
          const u = new Float64Array(N);
          const v = new Float64Array(N);
          const w = new Float64Array(N);
          poseAt(p, 1, u, v, w);
          for (let i = 0; i < N; i++) {
            // Out on the floor under the litter, exactly where the crawl rests, lying straight along the cut.
            expect(w[i] === 0).toBe(true);
            expect(v[i]).toBeCloseTo(restAxis(slabX(s, u[i]), slabZ(s, u[i])), 9);
            if (i > 0) {
              expect(Math.sign(u[i - 1] - u[i])).toBe(p.exitSign);
              expect(Math.hypot(u[i - 1] - u[i], v[i - 1] - v[i])).toBeGreaterThan(SPACING * 0.97);
            }
          }
          // The tail is past the burrow opening.
          expect((u[N - 1] - p.exitU) * p.exitSign).toBeGreaterThanOrEqual(0);
          expect(last[0][1]).toBeCloseTo(v[0], 9);
        }
      }
    }
  });

  it('comes out toward the slab\'s middle when the surface run would leave it', () => {
    const s = createSlab(0, 0, 0, 1, 5);
    const floor = boundaryAt(s, B_F, 7);
    const { us, vs } = burrowerBody(7, floor - 0.1, 0.1, 0);
    const p = createBodyPath();
    buildEmerge(p, s, us, vs, 0.1); // facing +u, but the slab ends at 8
    expect(p.exitSign).toBe(-1);
    play(s, p, RISE_S + OUT_S, 0.12, 15 * DEG);
  });

  it('never comes out into a rock: it turns the other way along the cut', () => {
    const { round } = footprints();
    let tested = 0;
    for (let k = 0; k < round.length && tested < 4; k += 4) {
      if (round[k + 3] === Infinity) continue;
      // A cut along x through the rock's centre; the head 1.2 u before its footprint, facing it.
      const r = round[k + 2];
      const x = round[k] - r - 1.2;
      const z = round[k + 1];
      if (Math.abs(x) > 13 || Math.abs(z) > 13) continue;
      const s = createSlab(x, z, Math.PI / 2, 1, 3);
      const clear = (from: number, sign: number) => {
        for (let d = 0; d <= 4.5; d += 0.1) if (obstacleDepth(slabX(s, from + sign * d), slabZ(s, from + sign * d), 0.134, hit) > 0) return false;
        return true;
      };
      if (!clear(-0.6, -1)) continue;
      const floor = boundaryAt(s, B_F, 0);
      const { us, vs } = burrowerBody(0, floor - 0.1, 0.2, 0);
      const p = createBodyPath();
      buildEmerge(p, s, us, vs, 0.2);
      expect(p.exitSign).toBe(-1);
      tested++;
    }
    expect(tested).toBeGreaterThan(0);
  });

  it('smootherstep eases in and out', () => {
    expect(smootherstep(0)).toBe(0);
    expect(smootherstep(1)).toBe(1);
    expect(smootherstep(0.5)).toBeCloseTo(0.5, 9);
    expect(smootherstep(0.01)).toBeLessThan(0.0001);
  });
});
