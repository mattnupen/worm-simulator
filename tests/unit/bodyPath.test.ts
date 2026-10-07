import { describe, it, expect } from 'vitest';
import {
  createBodyPath, poseAt, smootherstep, cruise, restAxis, AXIS_UP, POINT_SPEED, TURN_RATE,
} from '../../src/underground/bodyPath';
import { buildSink, SINK_DEPTH, SINK_SPEED } from '../../src/underground/sinkPath';
import { bodyFan, fanWidth, MAX_FAN } from '../../src/underground/sinkSweep';
import { Crawl } from '../../src/game/crawl';
import { mulberry32 } from '../../src/core/random';
import { canDigAt, chooseSide, cutHeading } from '../../src/underground/digSpot';
import { obstacleDepth } from '../../src/surface/obstacles';

import { createSlab, boundaryAt, slabX, slabZ, B_F } from '../../src/underground/slab';
import { SPACING } from '../../src/game/crawl';
import { SINK_S, SWING_S, FADE_S } from '../../src/underground/modeMachine';
import { OCC_AXIS_UP } from '../../src/render/occlusion';
import { floorHeight } from '../../src/surface/litterDepth';
import { N, DEG, crawled, world, play } from './pathPlay';

const hit = { nx: 0, nz: 0 };

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
        // It runs at least the whole dig-down; longer only when the turn needs it.
        expect(p.seconds).toBeGreaterThanOrEqual(SINK_S + FADE_S);
        if (Math.abs(turn) <= 10) expect(p.seconds).toBeLessThanOrEqual(SINK_S + SWING_S);
        const { last } = play(s, p, p.seconds, SINK_SPEED);
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

  it('never whips, stalls or doubles back: random bodies, bent ones too, at any turn digSpot allows', () => {
    // Bodies from wandering, and from a run then a tight turn of varying length (bent, nearly curled).
    const shapes: { heading: number; rel: { x: number; z: number }[] }[] = [];
    for (let seed = 0; seed < 12; seed++) {
      const c = new Crawl();
      for (let k = 0; k < 120; k++) c.step(1 / 60, { x: 0, y: 1 });
      const curl = seed >= 4 ? 10 + (seed - 4) * 8 : 0;
      for (let k = 0; k < 60 + 25 * (seed % 4); k++) {
        if (seed < 4) c.step(1 / 60, { x: 0.9 * Math.sin(k * 0.05 * seed + seed), y: 1 });
        else c.step(1 / 60, { x: k < curl ? (seed % 2 ? 1 : -1) : 0, y: k < curl ? 1 : 0 });
      }
      const hd = c.motion.head;
      shapes.push({ heading: c.motion.heading, rel: c.body.map((b) => ({ x: b.x - hd.x, z: b.z - hd.z })) });
    }
    const rand = mulberry32(17);
    const p = createBodyPath();
    let topSpeed = 0;
    let topTurn = 0;
    let longest = 0;
    let played = 0;
    for (let k = 0; k < 240; k++) {
      const shape = shapes[k % shapes.length];
      const x = (rand() - 0.5) * 20;
      const z = (rand() - 0.5) * 20;
      const body = shape.rel.map((q) => ({ x: x + q.x, y: floorHeight(x + q.x, z + q.z) + 0.01, z: z + q.z }));
      const cut = shape.heading + (rand() * 2 - 1) * 90 * DEG;
      // Only what canDigAt can offer: a body (with the turn) curled no further than MAX_FAN.
      bodyFan(shape.heading, body);
      if (fanWidth(cut) > MAX_FAN) continue;
      const s = createSlab(x, z, cut, rand() < 0.5 ? 1 : -1, k);
      buildSink(p, s, body);
      const r = play(s, p, p.seconds, SINK_SPEED);
      // Spacing never collapses (a bent body closes up a little mid-swing, never by a fifth).
      for (const f of r.frames) for (let i = 1; i < N; i++) expect(Math.hypot(f[i][0] - f[i - 1][0], f[i][1] - f[i - 1][1], f[i][2] - f[i - 1][2])).toBeGreaterThan(0.8 * SPACING);
      topSpeed = Math.max(topSpeed, r.topSpeed);
      topTurn = Math.max(topTurn, r.topTurn);
      longest = Math.max(longest, p.seconds);
      played++;
    }
    expect(played).toBeGreaterThan(200);
    expect(topSpeed).toBeLessThanOrEqual(POINT_SPEED * 1.02);
    expect(topTurn).toBeLessThanOrEqual(TURN_RATE * 1.02);
    expect(longest).toBeLessThan(5); // the target: a dig-down never longer than 5 s
  });

  it('digs down quickly enough for a lesson: median 2.8 s or less, 90% within 4 s, never over 5 s', () => {
    // Realistic digs: crawl bodies (wandering, or just after a tight turn) anywhere canDigAt allows.
    const shapes: { heading: number; rel: { x: number; z: number }[] }[] = [];
    for (let seed = 0; seed < 12; seed++) {
      const c = new Crawl();
      for (let k = 0; k < 120; k++) c.step(1 / 60, { x: 0, y: 1 });
      const curl = seed >= 4 ? 10 + (seed - 4) * 8 : 0;
      for (let k = 0; k < 60 + 25 * (seed % 4); k++) {
        if (seed < 4) c.step(1 / 60, { x: 0.9 * Math.sin(k * 0.05 * seed + seed), y: 1 });
        else c.step(1 / 60, { x: k < curl ? (seed % 2 ? 1 : -1) : 0, y: k < curl ? 1 : 0 });
      }
      const hd = c.motion.head;
      shapes.push({ heading: c.motion.heading, rel: c.body.map((b) => ({ x: b.x - hd.x, z: b.z - hd.z })) });
    }
    const r = mulberry32(3);
    const p = createBodyPath();
    const secs: number[] = [];
    while (secs.length < 300) {
      const shape = shapes[secs.length % shapes.length];
      const x = (r() - 0.5) * 30;
      const z = (r() - 0.5) * 30;
      const rot = r() * 2 * Math.PI;
      const cs = Math.cos(rot);
      const sn = Math.sin(rot);
      const body = shape.rel.map((o) => {
        const bx = x + o.x * cs + o.z * sn;
        const bz = z - o.x * sn + o.z * cs;
        return { x: bx, y: floorHeight(bx, bz) + 0.01, z: bz };
      });
      const h = shape.heading - rot;
      if (body.some((b) => obstacleDepth(b.x, b.z, 0.12, hit) > 0) || !canDigAt(x, z, h, body)) continue;
      const s = createSlab(x, z, cutHeading(x, z, h, body)!, chooseSide(x, z, h, body), secs.length);
      buildSink(p, s, body);
      secs.push(Math.max(SINK_S + SWING_S, p.seconds)); // as the mode machine plays it
    }
    secs.sort((a, b) => a - b);
    expect(secs[Math.floor(secs.length / 2)]).toBeLessThanOrEqual(2.8);
    expect(secs[Math.floor(secs.length * 0.9)]).toBeLessThanOrEqual(4);
    expect(secs[secs.length - 1]).toBeLessThanOrEqual(5);
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
    const { first } = play(s, p, p.seconds, SINK_SPEED);
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
