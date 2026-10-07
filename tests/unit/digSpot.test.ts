import { describe, it, expect } from 'vitest';
import {
  canDigAt, chooseSide, cutHeading, trunkInPath, CAM_REACH, CUT_MARGIN, DIG_EDGE, DIG_PAD, ENTRY_ROOM,
} from '../../src/underground/digSpot';
import { footprints, obstacleDepth } from '../../src/surface/obstacles';
import { BODY_RADIUS, Crawl, SPACING } from '../../src/game/crawl';
import { canEmergeNearEntry } from '../../src/underground/emergeMap';
import { createBodyPath, poseAt } from '../../src/underground/bodyPath';
import { buildSink } from '../../src/underground/sinkPath';
import { floorHeight } from '../../src/surface/litterDepth';
import { mulberry32 } from '../../src/core/random';
import { rocks } from '../../src/surface/propPlacement';
import { PLAY_HALF } from '../../src/surface/terrain';
import { rockReach } from '../../src/underground/sections';
import { createSlab, slabX, slabZ } from '../../src/underground/slab';

const LIM = PLAY_HALF - DIG_EDGE;
const hit = { nx: 0, nz: 0 };
/** Wide on a desktop screen puts the camera about 7.4 u from the cut; a portrait phone, up to CAM_REACH. */
const WIDE_REACH = 8;
/** The follow camera starts this far behind the head. */
const CAM_BEHIND = 2.6;

/** Every dig spot on a 1 u grid with 16 headings: [x, z, worm heading]. */
function* digCases(): Generator<[number, number, number]> {
  for (let x = -LIM; x <= LIM; x += 1) {
    for (let z = -LIM; z <= LIM; z += 1) {
      for (let h = 0; h < 16; h++) {
        const w = (h + 0.37) * (Math.PI / 8);
        if (canDigAt(x, z, w)) yield [x, z, w];
      }
    }
  }
}

/** Whether the segment a to b passes through any trunk footprint grown by `pad`. */
function hitsTrunk(ax: number, az: number, bx: number, bz: number, pad = 0): boolean {
  const { round } = footprints();
  for (let k = 0; k < round.length; k += 4) {
    if (round[k + 3] !== Infinity) continue;
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((round[k] - ax) * dx + (round[k + 1] - az) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(round[k] - ax - dx * t, round[k + 1] - az - dz * t) < round[k + 2] + pad) return true;
  }
  return false;
}

/** Whether the slab a dig makes along `heading` crosses a trunk, over its playable range or its drawn face. */
function slabHitsTrunk(x: number, z: number, heading: number, face: boolean, pad = 0): boolean {
  const s = createSlab(x, z, heading, 1, 1);
  const lo = face ? s.faceLo : s.playLo;
  const hi = face ? s.faceHi : s.playHi;
  return hitsTrunk(x + s.tx * lo, z + s.tz * lo, x + s.tx * hi, z + s.tz * hi, pad);
}

/** The camera's swing for the side `side`: from the follow camera behind the head to `reach` out. */
function swingHitsTrunk(x: number, z: number, heading: number, side: 1 | -1, reach: number): boolean {
  const tx = Math.sin(heading);
  const tz = Math.cos(heading);
  return hitsTrunk(x - tx * CAM_BEHIND, z - tz * CAM_BEHIND, x + side * tz * reach, z - side * tx * reach);
}

/**
 * No footprint within a body's length (and its radius) of (x, z): the body's turn into the cut
 * cannot matter there, so the answers depend on the place alone.
 */
function farFromFootprints(x: number, z: number): boolean {
  return obstacleDepth(x, z, 15 * SPACING + 0.2, hit) <= 0;
}

/** Whether two headings give the same cut plane. */
function samePlane(a: number, b: number): boolean {
  return Math.abs(Math.sin(a - b)) < 1e-9;
}

describe('where the worm may dig down (spec 4.1)', () => {
  it('on open ground, such as the spawn', () => {
    expect(canDigAt(0, 0, 0)).toBe(true);
    expect(canDigAt(0, 3, 1)).toBe(true);
  });

  it('never on a trunk, rock or log footprint, or just beside one', () => {
    const { round, log } = footprints();
    for (let k = 0; k < round.length; k += 4) {
      expect(canDigAt(round[k], round[k + 1], 0)).toBe(false);
      expect(canDigAt(round[k] + round[k + 2] + 0.3, round[k + 1], 0)).toBe(false);
    }
    for (const a of [-0.9, -0.3, 0, 0.4]) {
      const x = log.x + log.dx * log.half * a;
      const z = log.z + log.dz * log.half * a;
      if (Math.abs(x) < PLAY_HALF - DIG_EDGE && Math.abs(z) < PLAY_HALF - DIG_EDGE) expect(canDigAt(x, z, 0)).toBe(false);
    }
  });

  it('keeps off a rock as far as it reaches underground, all the way round', () => {
    const rs = rocks();
    for (let i = 0; i < rs.length; i++) {
      for (let a = 0; a < 24; a++) {
        const d = rockReach(i) + DIG_PAD - 0.05;
        expect(canDigAt(rs[i].x + Math.cos(a) * d, rs[i].z + Math.sin(a) * d, 0)).toBe(false);
      }
    }
  });

  it('keeps off a trunk, all the way round, so the sink path at the entry is clear', () => {
    const { round } = footprints();
    for (let k = 0; k < round.length; k += 4) {
      if (round[k + 3] !== Infinity) continue;
      for (let a = 0; a < 24; a++) {
        const d = round[k + 2] + DIG_PAD - 0.05;
        expect(canDigAt(round[k] + Math.cos(a) * d, round[k + 1] + Math.sin(a) * d, a)).toBe(false);
      }
    }
  });

  it('not at the play edge', () => {
    expect(canDigAt(PLAY_HALF - 1, 0, 0)).toBe(false);
    expect(canDigAt(0, -(PLAY_HALF - 0.5), 0)).toBe(false);
  });

  it('away from footprints it does not depend on the heading: turning in place never changes the answer', () => {
    for (let x = -LIM; x <= LIM; x += 0.5) {
      for (let z = -LIM; z <= LIM; z += 0.5) {
        if (!farFromFootprints(x, z)) continue;
        const first = canDigAt(x, z, 0.1);
        for (let h = 1; h < 24; h++) expect(canDigAt(x, z, 0.1 + h * 0.2731)).toBe(first);
      }
    }
  });

  it('refuses anything that is not a number', () => {
    expect(canDigAt(NaN, 0, 0)).toBe(false);
    expect(canDigAt(0, Infinity, 0)).toBe(false);
    expect(canDigAt(0, 0, NaN)).toBe(false);
    expect(cutHeading(NaN, 0, 0)).toBeNull();
    expect(cutHeading(0, -Infinity, 0)).toBeNull();
    expect(cutHeading(0, 0, NaN)).toBeNull();
  });

  it('leaves about a third of the play area open', () => {
    let open = 0;
    let all = 0;
    for (let x = -LIM; x <= LIM; x += 1) {
      for (let z = -LIM; z <= LIM; z += 1) {
        all++;
        if (canDigAt(x, z, 0.2)) open++;
      }
    }
    // Measured 26%. It was 36% before the body's turn into the cut had to be clear too; nearly all of
    // the drop is spots where a body lying straight behind the head would sit in a footprint.
    expect(open / all).toBeGreaterThan(0.22);
  });
});

describe('the cut never crosses a trunk (there is no trunk section)', () => {
  it('whatever the worm faces, over the playable slab and the drawn face', () => {
    let cases = 0;
    for (const [x, z, w] of digCases()) {
      cases++;
      const c = cutHeading(x, z, w)!;
      expect(slabHitsTrunk(x, z, c, false, CUT_MARGIN - 1e-6)).toBe(false);
      expect(slabHitsTrunk(x, z, c, true)).toBe(false);
    }
    expect(cases).toBeGreaterThan(1000);
  });

  it('returns the worm\'s heading when its cut is already clear and it has a way back up', () => {
    let kept = 0;
    let turned = 0;
    for (const [x, z, w] of digCases()) {
      // A body lying straight behind the head, well clear of footprints: no turn of it is needed.
      let bodyClear = true;
      for (let d = 0; d <= 15 * SPACING; d += 0.05) {
        if (obstacleDepth(x - Math.sin(w) * d, z - Math.cos(w) * d, BODY_RADIUS + 0.01, hit) > 0) bodyClear = false;
      }
      // ...and room either side of the entry (near the world's edge a cut running out is too short).
      const s = createSlab(x, z, w, 1, 1);
      const room = s.playLo <= -ENTRY_ROOM && s.playHi >= ENTRY_ROOM;
      if (!slabHitsTrunk(x, z, w, true, CUT_MARGIN + 1e-6) && bodyClear && room && canEmergeNearEntry(x, z, w)) {
        expect(cutHeading(x, z, w)).toBe(w);
        kept++;
      } else turned++;
    }
    expect(kept).toBeGreaterThan(100);
    expect(turned).toBeGreaterThan(100);
  });

  it('turns the worm as little as it can, and never by more than a right angle', () => {
    const turns: number[] = [];
    let cases = 0;
    for (const [x, z, w] of digCases()) {
      cases++;
      const turn = Math.abs(cutHeading(x, z, w)! - w);
      expect(turn).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
      if (turn > 0) turns.push(turn);
    }
    turns.sort((a, b) => a - b);
    // Measured: a turn in about 42% of cuts (median 20 degrees, 90th percentile 46, largest 80).
    expect(turns.length).toBeGreaterThan(0);
    expect(turns.length / cases).toBeLessThan(0.6);
    expect(turns[Math.floor(turns.length * 0.5)]).toBeLessThan((30 * Math.PI) / 180);
    expect(turns[Math.floor(turns.length * 0.9)]).toBeLessThan((60 * Math.PI) / 180);
  });

  it('agrees with canDigAt', () => {
    for (let x = -LIM; x <= LIM; x += 1) {
      for (let z = -LIM; z <= LIM; z += 1) {
        for (const w of [0.2, 1.9, 4.4]) {
          if (canDigAt(x, z, w)) expect(cutHeading(x, z, w)).not.toBeNull();
        }
      }
    }
    // Enclosed in a trunk's own footprint: no cut at all.
    const { round } = footprints();
    expect(cutHeading(round[0], round[1], 0.3)).toBeNull();
    expect(canDigAt(round[0], round[1], 0.3)).toBe(false);
  });

  it('away from footprints, is the same cut whichever way along it the worm faces', () => {
    for (const [x, z, w] of digCases()) {
      if (!farFromFootprints(x, z)) continue;
      expect(canDigAt(x, z, w + Math.PI)).toBe(true);
      expect(samePlane(cutHeading(x, z, w + Math.PI)!, cutHeading(x, z, w)!)).toBe(true);
    }
  });
});

describe('the camera side', () => {
  it('looks from the side with no trunk in the way', () => {
    const { round } = footprints();
    let tested = 0;
    for (let k = 0; k < round.length; k += 4) {
      if (round[k + 3] !== Infinity) continue;
      const r = round[k + 2];
      for (const heading of [0, Math.PI / 2, 2, 4]) {
        const tx = Math.sin(heading);
        const tz = Math.cos(heading);
        // Beside the trunk, with it straight out on the +1 side.
        const x = round[k] - tz * (r + 3);
        const z = round[k + 1] + tx * (r + 3);
        if (!canDigAt(x, z, heading) || cutHeading(x, z, heading) !== heading || trunkInPath(x, z, -tz, tx) > 0) continue;
        expect(trunkInPath(x, z, tz, -tx)).toBeGreaterThan(0);
        expect(chooseSide(x, z, heading)).toBe(-1);
        tested++;
      }
    }
    expect(tested).toBeGreaterThan(0);
  });

  it('away from footprints, picks the same world side whichever way along the cut the worm faces', () => {
    let cases = 0;
    for (const [x, z, h] of digCases()) {
      if (!farFromFootprints(x, z)) continue;
      cases++;
      expect(chooseSide(x, z, h + Math.PI)).toBe(-chooseSide(x, z, h));
    }
    expect(cases).toBeGreaterThan(100);
  });

  it('never swings through a trunk on a desktop Wide view, from any dig spot and heading', () => {
    let cases = 0;
    for (const [x, z, w] of digCases()) {
      cases++;
      const c = cutHeading(x, z, w)!;
      expect(swingHitsTrunk(x, z, c, chooseSide(x, z, w), WIDE_REACH)).toBe(false);
    }
    expect(cases).toBeGreaterThan(1000);
  });

  it('swings clear of the trunks at the farthest reach whenever either side can', () => {
    let both = 0;
    let cases = 0;
    for (const [x, z, w] of digCases()) {
      cases++;
      const c = cutHeading(x, z, w)!;
      const side = chooseSide(x, z, w);
      if (!swingHitsTrunk(x, z, c, side, CAM_REACH)) continue;
      // Chosen side blocked: the other side must be blocked too.
      expect(swingHitsTrunk(x, z, c, side === 1 ? -1 : 1, CAM_REACH)).toBe(true);
      both++;
    }
    // A portrait phone's camera, 11.5 u out, can find a trunk on both sides in a small share of cases.
    expect(both / cases).toBeLessThan(0.01); // measured 0.5%
  });
});

describe('the body turns into the cut clear of every footprint (bodyPath.ts buildSink)', () => {
  it('wherever canDigAt allows it, for curved crawl bodies at any place and turn', () => {
    // Crawl bodies with natural curves, carried to random places and turned any way.
    const shapes = [0, 1, 2, 3].map((seed) => {
      const c = new Crawl();
      for (let k = 0; k < 60 + 30 * seed; k++) c.step(1 / 60, { x: 0.9 * Math.sin(k * 0.05 * seed + seed), y: 1 });
      const h = c.motion.head;
      return { heading: c.motion.heading, rel: c.body.map((b) => ({ x: b.x - h.x, z: b.z - h.z })) };
    });
    const rand = mulberry32(5);
    const p = createBodyPath();
    const u = new Float64Array(16);
    const v = new Float64Array(16);
    const w = new Float64Array(16);
    let digs = 0;
    let turned = 0;
    while (digs < 400) {
      const x = (rand() - 0.5) * 2 * LIM;
      const z = (rand() - 0.5) * 2 * LIM;
      const shape = shapes[digs % 4];
      const rot = rand() * 2 * Math.PI;
      const cs = Math.cos(rot);
      const sn = Math.sin(rot);
      const body = shape.rel.map((q) => {
        const bx = x + q.x * cs + q.z * sn;
        const bz = z - q.x * sn + q.z * cs;
        return { x: bx, y: floorHeight(bx, bz) + 0.01, z: bz };
      });
      const h = shape.heading - rot;
      // Only bodies the crawl could hold there (it keeps them off every footprint).
      if (body.some((b) => obstacleDepth(b.x, b.z, 0.12, hit) > 0) || !canDigAt(x, z, h, body)) continue;
      digs++;
      const c = cutHeading(x, z, h, body)!;
      if (Math.abs(c - h) > 0.2) turned++;
      const s = createSlab(x, z, c, chooseSide(x, z, h, body), 1);
      buildSink(p, s, body);
      for (let k = 0; k <= 40; k++) {
        poseAt(p, k / 40, u, v, w);
        for (let i = 0; i < 16; i++) {
          if (u[i] >= 0 && w[i] === 0) continue; // the dive, under the ground
          expect(obstacleDepth(slabX(s, u[i]) + s.nx * w[i], slabZ(s, u[i]) + s.nz * w[i], 0, hit)).toBeLessThanOrEqual(0);
        }
      }
    }
    expect(turned).toBeGreaterThan(20);
  });
});
