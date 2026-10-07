import { describe, it, expect } from 'vitest';
import {
  createBodyPath, buildSink, poseAt, smootherstep, cruise, restAxis, SINK_DEPTH, AXIS_UP,
} from '../../src/underground/bodyPath';
import { createSlab, boundaryAt, slabX, slabZ, B_F } from '../../src/underground/slab';
import { SPACING } from '../../src/game/crawl';
import { SINK_S } from '../../src/underground/modeMachine';
import { OCC_AXIS_UP } from '../../src/render/occlusion';
import { floorHeight } from '../../src/surface/litterDepth';
import { N, DEG, crawled, world, play } from './pathPlay';

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

  it('sinks smoothly, turning to lie along the cut: a sweep of bodies and cut turns up to 90 degrees', () => {
    const p = createBodyPath();
    for (let seed = 1; seed <= 6; seed++) {
      const c = crawled(seed);
      const h = c.motion.head;
      for (const turn of [-90, -80, -60, -35, -10, 0, 15, 40, 65, 80, 90]) {
        const s = createSlab(h.x, h.z, c.motion.heading + turn * DEG, seed % 2 ? 1 : -1, seed);
        buildSink(p, s, c.body);
        const { last } = play(s, p, SINK_S, 0.22, 8 * DEG);
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

  it('cruise speeds up, cruises at 1 / (1 - r) and slows down, smoothly', () => {
    for (const r of [0.1, 0.25, 0.5]) {
      expect(cruise(0, r)).toBe(0);
      expect(cruise(1, r)).toBeCloseTo(1, 12);
      expect(cruise(0.5, r)).toBeCloseTo(0.5, 12);
      const h = 1e-4;
      expect((cruise(h, r) - cruise(0, r)) / h).toBeLessThan(1e-5);
      expect((cruise(1, r) - cruise(1 - h, r)) / h).toBeLessThan(1e-5);
      let top = 0;
      for (let k = 0; k < 1000; k++) {
        const d = (cruise((k + 1) / 1000, r) - cruise(k / 1000, r)) * 1000;
        expect(d).toBeGreaterThanOrEqual(0);
        top = Math.max(top, d);
      }
      expect(top).toBeCloseTo(1 / (1 - r), 2);
    }
  });

  it('smootherstep eases in and out', () => {
    expect(smootherstep(0)).toBe(0);
    expect(smootherstep(1)).toBe(1);
    expect(smootherstep(0.5)).toBeCloseTo(0.5, 9);
    expect(smootherstep(0.01)).toBeLessThan(0.0001);
  });
});
