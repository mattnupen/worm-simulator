import { describe, it, expect } from 'vitest';
import { createBodyPath, poseAt, restAxis } from '../../src/underground/bodyPath';
import { buildEmerge, HEAD_SPEED } from '../../src/underground/emergePath';
import {
  canEmergeAt, canEmergeNearEntry, createEmergeMap, emergeSides, mapEmerge, type EmergeMap,
} from '../../src/underground/emergeMap';
import { createSlab, boundaryAt, slabX, slabZ, B_F, B_TOP, type Slab } from '../../src/underground/slab';
import { canDigAt, chooseSide, cutHeading } from '../../src/underground/digSpot';
import { BODY_RADIUS, SPACING } from '../../src/game/crawl';
import { RISE_S, OUT_S } from '../../src/underground/modeMachine';
import { footprints, obstacleDepth } from '../../src/surface/obstacles';
import { PLAY_HALF } from '../../src/surface/terrain';
import { mulberry32 } from '../../src/core/random';
import { N, DEG, burrowerBody, play } from './pathPlay';

const hit = { nx: 0, nz: 0 };

function mapped(s: Slab): EmergeMap {
  const m = createEmergeMap();
  mapEmerge(m, s);
  return m;
}

/** The end pose: where the crawl will start, on the surface. */
function endPose(p: ReturnType<typeof createBodyPath>) {
  const u = new Float64Array(N);
  const v = new Float64Array(N);
  const w = new Float64Array(N);
  poseAt(p, 1, u, v, w);
  return { u, v, w };
}

describe('coming up out of the cut (spec 4.2)', () => {
  it('comes up smoothly from any facing, no faster than HEAD_SPEED, onto the floor along the cut', () => {
    const p = createBodyPath();
    const rand = mulberry32(11);
    for (const seed of [1, 2, 3]) {
      const s = createSlab(-3 + seed * 2.5, 4 - seed * 3, seed * 1.1, seed % 2 ? 1 : -1, seed);
      const m = mapped(s);
      for (const hu of [-5, -1, 0.5, 4]) {
        for (let a = 0; a < 360; a += 20) {
          const dir = a * DEG;
          const floor = boundaryAt(s, B_F, hu);
          // Near the top: just under the F top, at it, or up in the litter.
          const hv = floor + [-0.18, 0.05, 0.6][Math.floor(rand() * 3)];
          if (hv > boundaryAt(s, B_TOP, hu) - 0.12) continue;
          const { us, vs } = burrowerBody(hu, hv, dir, (rand() - 0.5) * 0.3);
          buildEmerge(p, s, m, us, vs, dir);
          // Long enough that the head never outruns HEAD_SPEED (a frame's step, give or take the frame count's
          // rounding), never shorter than spec.
          expect(p.seconds).toBeGreaterThanOrEqual(RISE_S + OUT_S);
          const { first, last } = play(s, p, p.seconds, (HEAD_SPEED / 60) * 1.01, 8 * DEG);
          for (let i = 0; i < N; i++) {
            expect(first[i][0]).toBeCloseTo(slabX(s, us[i]), 9);
            expect(first[i][1]).toBeCloseTo(vs[i], 9);
            expect(first[i][2]).toBeCloseTo(slabZ(s, us[i]), 9);
          }
          const { u, v, w } = endPose(p);
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

  it('takes as long as its path needs at HEAD_SPEED, speeding up and slowing down smoothly', () => {
    const s = createSlab(1, -2, 0.7, 1, 4);
    const m = mapped(s);
    const p = createBodyPath();
    for (const a of [0, 90, 180, 270]) {
      const { us, vs } = burrowerBody(0, boundaryAt(s, B_F, 0) - 0.1, a * DEG, 0);
      buildEmerge(p, s, m, us, vs, a * DEG);
      const length = p.headTo - p.headFrom;
      expect(p.seconds).toBeCloseTo(Math.max(RISE_S + OUT_S, length / HEAD_SPEED + 0.6), 9);
      expect(p.ramp).toBeCloseTo(0.6 / p.seconds, 9);
    }
  });

  it('comes out toward the slab\'s middle when both ways are clear but one would leave the slab', () => {
    let tested = 0;
    for (let h = 0; h < 2 * Math.PI && tested < 3; h += 0.15) {
      const s = createSlab(0, 0, h, 1, 5);
      const m = mapped(s);
      const hu = s.playHi - 1;
      if (emergeSides(m, hu) !== 3) continue;
      const { us, vs } = burrowerBody(hu, boundaryAt(s, B_F, hu) - 0.1, 0.1, 0);
      const p = createBodyPath();
      buildEmerge(p, s, m, us, vs, 0.1); // facing +u, but the slab ends 1 u ahead
      expect(p.exitSign).toBe(-1);
      tested++;
    }
    expect(tested).toBeGreaterThan(0);
  });

  it('is offered only where it can come out (always near the entry): then it never lies on a footprint, and stays in play', () => {
    const rand = mulberry32(3);
    const p = createBodyPath();
    let digs = 0;
    let came = 0;
    let blocked = 0;
    while (digs < 60) {
      const x = (rand() - 0.5) * 30;
      const z = (rand() - 0.5) * 30;
      const h = rand() * 2 * Math.PI;
      if (!canDigAt(x, z, h)) continue;
      digs++;
      const c = cutHeading(x, z, h)!;
      const s = createSlab(x, z, c, chooseSide(x, z, h), digs);
      const m = mapped(s);
      // No dig leaves the worm with nowhere to come up: at least where it went in.
      expect(canEmergeNearEntry(x, z, c)).toBe(true);
      expect(canEmergeAt(m, 0)).toBe(true);
      expect(canEmergeAt(m, 0.03)).toBe(true);
      for (let k = 0; k < 12; k++) {
        const hu = s.playLo + 0.2 + rand() * (s.playHi - s.playLo - 0.4);
        if (!canEmergeAt(m, hu)) {
          blocked++;
          continue;
        }
        const dir = rand() * 2 * Math.PI;
        const { us, vs } = burrowerBody(hu, boundaryAt(s, B_F, hu) - 0.1 - 0.1 * rand(), dir, (rand() - 0.5) * 0.2);
        buildEmerge(p, s, m, us, vs, dir);
        expect(emergeSides(m, hu) & (p.exitSign > 0 ? 1 : 2)).not.toBe(0);
        const { u } = endPose(p);
        for (let i = 0; i < N; i++) {
          const wx = slabX(s, u[i]);
          const wz = slabZ(s, u[i]);
          expect(obstacleDepth(wx, wz, BODY_RADIUS, hit)).toBeLessThanOrEqual(0);
          expect(Math.max(Math.abs(wx), Math.abs(wz))).toBeLessThanOrEqual(PLAY_HALF - 0.5);
        }
        came++;
      }
    }
    expect(came).toBeGreaterThan(100);
    expect(blocked).toBeGreaterThan(10);
  });

  it('turns the other way along the cut rather than come out into a rock', () => {
    const { round } = footprints();
    let tested = 0;
    for (let k = 0; k < round.length; k += 4) {
      if (round[k + 3] === Infinity) continue;
      // A cut along x through the rock's centre; the head 1.2 u before its footprint, facing it.
      const x = round[k] - round[k + 2] - 1.2;
      const z = round[k + 1];
      if (Math.abs(x) > 13 || Math.abs(z) > 13) continue;
      const s = createSlab(x, z, Math.PI / 2, 1, 3);
      const m = mapped(s);
      expect(emergeSides(m, 0) & 1).toBe(0);
      if (!canEmergeAt(m, 0)) continue;
      const { us, vs } = burrowerBody(0, boundaryAt(s, B_F, 0) - 0.1, 0.2, 0);
      const p = createBodyPath();
      buildEmerge(p, s, m, us, vs, 0.2);
      expect(p.exitSign).toBe(-1);
      tested++;
    }
    expect(tested).toBeGreaterThan(0);
  });

  it('has nothing to offer from an empty map or a bad position', () => {
    const m = createEmergeMap();
    expect(canEmergeAt(m, 0)).toBe(false);
    mapEmerge(m, createSlab(0, 0, 0, 1, 1));
    expect(canEmergeAt(m, NaN)).toBe(false);
  });
});
