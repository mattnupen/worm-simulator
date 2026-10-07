import { describe, it, expect } from 'vitest';
import {
  canDigAt, chooseSide, cutHeading, trunkInPath, CAM_REACH, CUT_MARGIN, DIG_EDGE, DIG_PAD, TRUNK_PAD,
} from '../../src/underground/digSpot';
import { footprints } from '../../src/surface/obstacles';
import { rocks } from '../../src/surface/propPlacement';
import { PLAY_HALF } from '../../src/surface/terrain';
import { rockReach } from '../../src/underground/sections';
import { createSlab } from '../../src/underground/slab';

const LIM = PLAY_HALF - DIG_EDGE;
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
        const d = round[k + 2] + TRUNK_PAD - 0.05;
        expect(canDigAt(round[k] + Math.cos(a) * d, round[k + 1] + Math.sin(a) * d, a)).toBe(false);
      }
    }
  });

  it('not at the play edge', () => {
    expect(canDigAt(PLAY_HALF - 1, 0, 0)).toBe(false);
    expect(canDigAt(0, -(PLAY_HALF - 0.5), 0)).toBe(false);
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
    expect(open / all).toBeGreaterThan(0.3); // measured 36%
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

  it('returns the worm\'s heading when its cut is already clear', () => {
    let kept = 0;
    let turned = 0;
    for (const [x, z, w] of digCases()) {
      if (!slabHitsTrunk(x, z, w, true, CUT_MARGIN + 1e-6)) {
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

  it('is the same cut whichever way along it the worm faces', () => {
    for (const [x, z, w] of digCases()) {
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
    expect(both / cases).toBeLessThan(0.02);
  });
});
