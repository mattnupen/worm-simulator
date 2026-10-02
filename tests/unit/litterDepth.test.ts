import { describe, it, expect } from 'vitest';
import {
  litterDepth, driftDepth, pileDepth, hollowAmount, underAmount, litterMound,
  LITTER_MIN, LITTER_MAX, LITTER_OPEN, UNDER_THIN, UNDER_DEEP, WIND, PILES,
} from '../../src/surface/litterDepth';
import { treeSites } from '../../src/surface/treeSites';
import { HERO_LOG, ROCKS } from '../../src/surface/propPlacement';
import { PLAY_HALF, WORLD_HALF } from '../../src/surface/terrain';

const grid = (half: number, step: number): [number, number][] => {
  const pts: [number, number][] = [];
  for (let x = -half; x <= half; x += step) for (let z = -half; z <= half; z += step) pts.push([x, z]);
  return pts;
};
const awayFromEverything = (x: number, z: number) => driftDepth(x, z) === 0 && pileDepth(x, z) === 0;

describe('litterDepth', () => {
  it('is deterministic', () => {
    for (const [x, z] of grid(20, 3.1)) expect(litterDepth(x, z)).toBe(litterDepth(x, z));
  });

  it('stays within [0.01, 0.25] everywhere, including beyond the world edge', () => {
    for (const [x, z] of grid(WORLD_HALF + 6, 0.37)) {
      const d = litterDepth(x, z);
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(LITTER_MIN);
      expect(d).toBeLessThanOrEqual(LITTER_MAX);
    }
  });

  it('is about one leaf deep in the open (the flat spawn)', () => {
    expect(awayFromEverything(0, 0)).toBe(true);
    expect(litterDepth(0, 0)).toBeGreaterThan(LITTER_OPEN - 0.006);
    expect(litterDepth(0, 0)).toBeLessThan(LITTER_OPEN + 0.006);
  });

  it('is continuous: a 1 mm step never changes it by more than 2 mm', () => {
    for (const [x, z] of grid(PLAY_HALF, 0.29)) {
      const d = litterDepth(x, z);
      expect(Math.abs(litterDepth(x + 0.001, z) - d)).toBeLessThan(0.002);
      expect(Math.abs(litterDepth(x, z + 0.001) - d)).toBeLessThan(0.002);
    }
  });

  it('is deeper in hollows than on rises (away from drifts and piles)', () => {
    let hollow: [number, number] | null = null;
    let rise: [number, number] | null = null;
    for (const [x, z] of grid(PLAY_HALF, 0.5)) {
      if (Math.hypot(x, z) < 8 || !awayFromEverything(x, z)) continue;
      const h = hollowAmount(x, z);
      if (h > 0.9 && !hollow) hollow = [x, z];
      if (h === 0 && !rise) rise = [x, z];
    }
    expect(hollow).not.toBeNull();
    expect(rise).not.toBeNull();
    expect(litterDepth(...hollow!)).toBeGreaterThan(litterDepth(...rise!) + 0.04);
  });

  it('drifts against every trunk and rock, deeper downwind than upwind', () => {
    const round = [
      ...treeSites().map((t) => ({ x: t.x, z: t.z, r: (t.birch ? 0.32 : 0.48) * 1.3 })),
      ...ROCKS.map((k) => ({ x: k.x, z: k.z, r: k.size * 1.05 })),
    ];
    for (const o of round) {
      const gap = o.r + 0.15;
      const down = litterDepth(o.x + WIND.x * gap, o.z + WIND.z * gap);
      const up = litterDepth(o.x - WIND.x * gap, o.z - WIND.z * gap);
      expect(down).toBeGreaterThan(0.1);
      expect(down).toBeGreaterThan(up);
      expect(down).toBeGreaterThan(litterDepth(0, 0) + 0.05);
    }
  });

  it('drifts against the fallen log', () => {
    const nx = -Math.sin(HERO_LOG.yaw);
    const nz = Math.cos(HERO_LOG.yaw);
    const side = nx * WIND.x + nz * WIND.z > 0 ? 1 : -1;
    const gap = HERO_LOG.radius + 0.15;
    expect(litterDepth(HERO_LOG.x + nx * gap * side, HERO_LOG.z + nz * gap * side)).toBeGreaterThan(0.12);
  });

  it('has 4 to 6 windblown piles, deep in the middle', () => {
    expect(PILES.length).toBeGreaterThanOrEqual(4);
    expect(PILES.length).toBeLessThanOrEqual(6);
    for (const p of PILES) expect(litterDepth(p.x, p.z)).toBeGreaterThan(UNDER_DEEP + 0.05);
  });
});

describe('underAmount and litterMound', () => {
  it('under is 1 on thin litter, 0 on deep, smooth and monotonic between', () => {
    expect(underAmount(0.02)).toBe(1);
    expect(underAmount(UNDER_THIN)).toBe(1);
    expect(underAmount(UNDER_DEEP)).toBe(0);
    expect(underAmount(0.25)).toBe(0);
    let prev = 1;
    for (let d = UNDER_THIN; d <= UNDER_DEEP; d += 0.001) {
      const u = underAmount(d);
      expect(u).toBeLessThanOrEqual(prev + 1e-12);
      expect(prev - u).toBeLessThan(0.03);
      prev = u;
    }
  });
  it('the mound is flat under thin litter and the full depth on deep piles', () => {
    expect(litterMound(0.03)).toBe(0);
    expect(litterMound(0.2)).toBeCloseTo(0.2, 12);
    for (let d = 0.01; d <= 0.25; d += 0.005) {
      expect(litterMound(d)).toBeGreaterThanOrEqual(0);
      expect(litterMound(d)).toBeLessThanOrEqual(d);
    }
  });
});
