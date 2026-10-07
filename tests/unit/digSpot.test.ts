import { describe, it, expect } from 'vitest';
import {
  canDigAt, chooseSide, trunkInPath, CAM_REACH, DIG_EDGE, DIG_PAD, TRUNK_PAD,
} from '../../src/underground/digSpot';
import { footprints } from '../../src/surface/obstacles';
import { rocks } from '../../src/surface/propPlacement';
import { PLAY_HALF } from '../../src/surface/terrain';
import { rockReach } from '../../src/underground/sections';

const LIM = PLAY_HALF - DIG_EDGE;
/** Wide on a desktop screen puts the camera about 7.4 u from the cut; a portrait phone, up to CAM_REACH. */
const WIDE_REACH = 8;
/** The follow camera starts this far behind the head. */
const CAM_BEHIND = 2.6;

/** Every dig spot on a 1 u grid with 16 headings: [x, z, heading]. */
function* digCases(): Generator<[number, number, number]> {
  for (let x = -LIM; x <= LIM; x += 1) {
    for (let z = -LIM; z <= LIM; z += 1) {
      if (!canDigAt(x, z)) continue;
      for (let h = 0; h < 16; h++) yield [x, z, (h + 0.37) * (Math.PI / 8)];
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

/** The camera's swing for the side `side`: from the follow camera behind the head to `reach` out. */
function swingHitsTrunk(x: number, z: number, heading: number, side: 1 | -1, reach: number): boolean {
  const tx = Math.sin(heading);
  const tz = Math.cos(heading);
  return hitsTrunk(x - tx * CAM_BEHIND, z - tz * CAM_BEHIND, x + side * tz * reach, z - side * tx * reach);
}

describe('where the worm may dig down (spec 4.1)', () => {
  it('on open ground, such as the spawn', () => {
    expect(canDigAt(0, 0)).toBe(true);
    expect(canDigAt(0, 3)).toBe(true);
  });

  it('never on a trunk, rock or log footprint, or just beside one', () => {
    const { round, log } = footprints();
    for (let k = 0; k < round.length; k += 4) {
      expect(canDigAt(round[k], round[k + 1])).toBe(false);
      expect(canDigAt(round[k] + round[k + 2] + 0.3, round[k + 1])).toBe(false);
    }
    for (const a of [-0.9, -0.3, 0, 0.4]) {
      const x = log.x + log.dx * log.half * a;
      const z = log.z + log.dz * log.half * a;
      if (Math.abs(x) < PLAY_HALF - DIG_EDGE && Math.abs(z) < PLAY_HALF - DIG_EDGE) expect(canDigAt(x, z)).toBe(false);
    }
  });

  it('keeps off a rock as far as it reaches underground, all the way round', () => {
    const rs = rocks();
    for (let i = 0; i < rs.length; i++) {
      for (let a = 0; a < 24; a++) {
        const d = rockReach(i) + DIG_PAD - 0.05;
        expect(canDigAt(rs[i].x + Math.cos(a) * d, rs[i].z + Math.sin(a) * d)).toBe(false);
      }
    }
  });

  it('keeps a worm length off a trunk, so no heading cuts through it near the entry', () => {
    const { round } = footprints();
    for (let k = 0; k < round.length; k += 4) {
      if (round[k + 3] !== Infinity) continue;
      for (let a = 0; a < 24; a++) {
        const d = round[k + 2] + TRUNK_PAD - 0.05;
        expect(canDigAt(round[k] + Math.cos(a) * d, round[k + 1] + Math.sin(a) * d)).toBe(false);
      }
    }
    let cases = 0;
    for (const [x, z, h] of digCases()) {
      cases++;
      const half = TRUNK_PAD; // the worm is 3.5 u long
      expect(hitsTrunk(x - Math.sin(h) * half, z - Math.cos(h) * half, x + Math.sin(h) * half, z + Math.cos(h) * half)).toBe(false);
    }
    expect(cases).toBeGreaterThan(500);
  });

  it('not at the play edge', () => {
    expect(canDigAt(PLAY_HALF - 1, 0)).toBe(false);
    expect(canDigAt(0, -(PLAY_HALF - 0.5))).toBe(false);
  });

  it('leaves a good share of the play area open', () => {
    let open = 0;
    let all = 0;
    for (let x = -LIM; x <= LIM; x += 1) {
      for (let z = -LIM; z <= LIM; z += 1) {
        all++;
        if (canDigAt(x, z)) open++;
      }
    }
    expect(open / all).toBeGreaterThan(0.2);
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
        const x = round[k] - tz * (r + TRUNK_PAD + 0.5);
        const z = round[k + 1] + tx * (r + TRUNK_PAD + 0.5);
        if (!canDigAt(x, z) || trunkInPath(x, z, -tz, tx) > 0) continue;
        expect(trunkInPath(x, z, tz, -tx)).toBeGreaterThan(0);
        expect(chooseSide(x, z, heading)).toBe(-1);
        tested++;
      }
    }
    expect(tested).toBeGreaterThan(0);
  });

  it('picks the same world side whichever way along the cut the worm faces', () => {
    for (const [x, z, h] of [[0, 0, 0], [5, -4, 1], [-8, 6, 2.5]]) {
      const a = chooseSide(x, z, h);
      expect(chooseSide(x, z, h + Math.PI)).toBe(-a);
    }
    for (const [x, z, h] of digCases()) {
      expect(chooseSide(x, z, h + Math.PI)).toBe(-chooseSide(x, z, h));
    }
  });

  it('never swings through a trunk on a desktop Wide view, from any dig spot and heading', () => {
    let cases = 0;
    for (const [x, z, h] of digCases()) {
      cases++;
      expect(swingHitsTrunk(x, z, h, chooseSide(x, z, h), WIDE_REACH)).toBe(false);
    }
    expect(cases).toBeGreaterThan(500);
  });

  it('swings clear of the trunks at the farthest reach whenever either side can', () => {
    let both = 0;
    let cases = 0;
    for (const [x, z, h] of digCases()) {
      cases++;
      const side = chooseSide(x, z, h);
      if (!swingHitsTrunk(x, z, h, side, CAM_REACH)) continue;
      // Chosen side blocked: the other side must be blocked too.
      expect(swingHitsTrunk(x, z, h, side === 1 ? -1 : 1, CAM_REACH)).toBe(true);
      both++;
    }
    // A portrait phone's camera, 11.5 u out, can find a trunk on both sides in a small share of cases.
    expect(both / cases).toBeLessThan(0.02);
  });
});

describe('a 16 u slab and the trunks (no trunk section is drawn)', () => {
  it('crosses a trunk footprint in a minority of cuts, never within the worm length of the entry', () => {
    let crossing = 0;
    let cases = 0;
    for (const [x, z, h] of digCases()) {
      cases++;
      if (hitsTrunk(x - Math.sin(h) * 8, z - Math.cos(h) * 8, x + Math.sin(h) * 8, z + Math.cos(h) * 8)) crossing++;
    }
    // Measured on the real layout: about 14%. The trunks are huge at real size.
    expect(crossing / cases).toBeLessThan(0.2);
  });
});
