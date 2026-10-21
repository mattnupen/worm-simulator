import { describe, it, expect } from 'vitest';
import { canReuseHere, digSignOf } from '../../src/underground/burrowReuse';
import { canDigAt, chooseSide, cutHeading, ENTRY_ROOM } from '../../src/underground/digSpot';
import { OPENING_MERGE } from '../../src/underground/openings';
import { ON_CUT } from '../../src/underground/burrowApproach';
import { createBodyPath, poseAt, restAxis } from '../../src/underground/bodyPath';
import { buildSink, SINK_DEPTH, SINK_SPEED } from '../../src/underground/sinkPath';
import { createSlab, boundaryAt, slabX, slabZ, B_F } from '../../src/underground/slab';
import { createBody } from '../../src/worm/body';
import { SPACING } from '../../src/game/crawl';
import { POINT_SPEED } from '../../src/underground/bodyPath';
import { N, DEG, crawled, world, play } from './pathPlay';

/** A straight body on the floor, head at (x, z) facing `heading`, as Crawl.motion and Crawl.body. */
function lying(x: number, z: number, heading: number) {
  const body = createBody(N, SPACING, { x, y: 0, z }, heading).map((p) => ({ ...p, y: restAxis(p.x, p.z) - 0.05 }));
  return { motion: { head: body[0], heading }, body };
}

describe('digging back down into an old burrow, along its own cut (V4 spec 4.1)', () => {
  it('mirrored, the sink is the usual one in the same plane cut the other way (u to -u), exactly', () => {
    const p = createBodyPath();
    const q = createBodyPath();
    const u = new Float64Array(N);
    const v = new Float64Array(N);
    const w = new Float64Array(N);
    for (let seed = 1; seed <= 4; seed++) {
      const c = crawled(seed);
      const h = c.motion.head;
      for (const turn of [-70, -20, 0, 35, 80]) {
        for (const side of [1, -1] as const) {
          // The worm faces against this slab's +u: it dives toward -u.
          const a = createSlab(h.x, h.z, c.motion.heading + Math.PI + turn * DEG, side, seed);
          expect(digSignOf(a, c.motion)).toBe(-1);
          const b = createSlab(h.x, h.z, c.motion.heading + turn * DEG, side === 1 ? -1 : 1, seed);
          expect(a.nx).toBeCloseTo(b.nx, 12);
          buildSink(p, a, c.body, -1);
          buildSink(q, b, c.body);
          expect(p.exitSign).toBe(-1);
          expect(p.seconds).toBeCloseTo(q.seconds, 9);
          for (let t = 0; t <= 1; t += 0.05) {
            const pa = world(a, p, t, u, v, w);
            const pb = world(b, q, t, u, v, w);
            for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) expect(pa[i][k]).toBeCloseTo(pb[i][k], 6);
          }
          // It ends in the plane, the head sunk below the F top, the body out along +u.
          poseAt(p, 1, u, v, w);
          expect(v[0]).toBeLessThanOrEqual(boundaryAt(a, B_F, u[0]) - SINK_DEPTH + 1e-6);
          for (let i = 0; i < N; i++) expect(Math.abs(w[i])).toBe(0);
          expect(u[N - 1]).toBeGreaterThan(u[0]);
        }
      }
    }
  });

  it('from a head anywhere along the old cut, up to ON_CUT across it, it sinks as smoothly as into a new one', () => {
    const p = createBodyPath();
    const s = createSlab(0, 0.7, 0.2, 1, 3);
    for (const [du, dw, flip] of [[2, ON_CUT, false], [-3, -ON_CUT, true], [4, 0, true], [-1, ON_CUT, false], [3, -ON_CUT, false]] as const) {
      const x = slabX(s, du) + s.nx * dw;
      const z = slabZ(s, du) + s.nz * dw;
      const heading = 0.2 + (flip ? Math.PI : 0) + 0.3;
      const { motion, body } = lying(x, z, heading);
      const sign = digSignOf(s, motion);
      expect(sign).toBe(flip ? -1 : 1);
      buildSink(p, s, body, sign);
      const r = play(s, p, p.seconds, SINK_SPEED);
      expect(r.topSpeed).toBeLessThanOrEqual(POINT_SPEED * 1.02);
      for (let i = 0; i < N; i++) {
        expect(r.first[i][0]).toBeCloseTo(body[i].x, 9);
        expect(r.first[i][2]).toBeCloseTo(body[i].z, 9);
      }
      const u = new Float64Array(N);
      const v = new Float64Array(N);
      const w = new Float64Array(N);
      poseAt(p, 1, u, v, w);
      expect(Math.abs(u[0] - du)).toBeLessThan(0.6);
      for (let i = 0; i < N; i++) expect(Math.abs(w[i])).toBe(0);
    }
  });

  it('allows the dig where the old cut works from here, either way along it; not off it or without room', () => {
    // The spawn's dig (the game's first: open ground, the play edge far).
    const at = lying(0, 0.7, 0);
    expect(canDigAt(0, 0.7, 0, at.body)).toBe(true);
    const h = cutHeading(0, 0.7, 0, at.body)!;
    const s = createSlab(0, 0.7, h, chooseSide(0, 0.7, 0, at.body), 4);
    expect(canReuseHere(s, at.motion, at.body)).toBe(true);
    // Back along the cut facing the other way, and a little off it.
    const back = lying(slabX(s, -1.5) + s.nx * 0.5, slabZ(s, -1.5) + s.nz * 0.5, h + Math.PI + 0.2);
    expect(digSignOf(s, back.motion)).toBe(-1);
    expect(canReuseHere(s, back.motion, back.body)).toBe(true);
    // Too far across the cut: not this burrow.
    const off = lying(slabX(s, 0.5) + s.nx * (OPENING_MERGE + 0.05), slabZ(s, 0.5) + s.nz * (OPENING_MERGE + 0.05), h);
    expect(canReuseHere(s, off.motion, off.body)).toBe(false);
    // Past the playable slab's end, less ENTRY_ROOM: no room to go in.
    const end = lying(slabX(s, s.playHi - ENTRY_ROOM + 0.1), slabZ(s, s.playHi - ENTRY_ROOM + 0.1), h);
    expect(canReuseHere(s, end.motion, end.body)).toBe(false);
    // A body curled round on itself cannot turn into it (as canDigAt: MAX_FAN).
    const curl = lying(0, 0.7, 0);
    for (let i = 1; i < N; i++) {
      const a = (i * 25 * Math.PI) / 180;
      curl.body[i].x = curl.body[i - 1].x - Math.sin(a) * SPACING;
      curl.body[i].z = curl.body[i - 1].z - Math.cos(a) * SPACING;
    }
    expect(canReuseHere(s, curl.motion, curl.body)).toBe(false);
  });
});
