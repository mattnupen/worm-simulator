import { describe, it, expect } from 'vitest';
import {
  litterDepth, driftDepth, pileDepth, hollowAmount, underAmount, litterMound,
  LITTER_MIN, LITTER_MAX, LITTER_OPEN, UNDER_THIN, UNDER_DEEP, WIND, PILES,
} from '../../src/surface/litterDepth';
import { treeSites } from '../../src/surface/treeSites';
import { HERO_LOG, ROCKS } from '../../src/surface/propPlacement';
import { PLAY_HALF, WORLD_HALF } from '../../src/surface/terrain';
import { stepWorm, type WormMotion } from '../../src/worm/locomotion';
import { AUTO_DRIVE_MOVE, LOCOMOTION } from '../../src/game/drive';

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
    const hollow: number[] = [];
    const rise: number[] = [];
    for (const [x, z] of grid(PLAY_HALF, 0.5)) {
      if (Math.hypot(x, z) < 8 || !awayFromEverything(x, z)) continue;
      const h = hollowAmount(x, z);
      if (h > 0.9) hollow.push(litterDepth(x, z));
      else if (h === 0) rise.push(litterDepth(x, z));
    }
    expect(hollow.length).toBeGreaterThan(5);
    expect(rise.length).toBeGreaterThan(5);
    // Aggregates over every sampled point, not the first pair found: the shallowest hollow
    // is still clearly deeper than the deepest rise.
    expect(Math.min(...hollow) - Math.max(...rise)).toBeGreaterThanOrEqual(0.03);
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

describe('litterDepth at obstacle centres', () => {
  const round = [
    ...treeSites().map((t) => ({ x: t.x, z: t.z, r: (t.birch ? 0.32 : 0.48) * 1.3 })),
    ...ROCKS.map((k) => ({ x: k.x, z: k.z, r: k.size * 1.05 })),
  ];
  const STEP = 0.001;
  /** Largest depth change between neighbouring 1 mm samples along a line through (cx, cz). */
  const worstStep = (cx: number, cz: number, angle: number, half: number): number => {
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const n = Math.round(half / STEP);
    let worst = 0;
    let prev = litterDepth(cx - dx * n * STEP, cz - dz * n * STEP);
    for (let i = -n + 1; i <= n; i++) {
      const d = litterDepth(cx + dx * i * STEP, cz + dz * i * STEP);
      worst = Math.max(worst, Math.abs(d - prev));
      prev = d;
    }
    return worst;
  };

  it('is continuous across every trunk and rock, straight through the centre', () => {
    for (const o of round) {
      for (const angle of [0, Math.PI / 4, Math.atan2(WIND.z, WIND.x), Math.PI / 2 + 0.3]) {
        expect(worstStep(o.x, o.z, angle, Math.min(o.r, 0.6))).toBeLessThan(0.002);
      }
    }
  });

  it('is continuous across the log, through its axis, and round its end caps', () => {
    const ax = Math.cos(HERO_LOG.yaw);
    const az = Math.sin(HERO_LOG.yaw);
    const half = HERO_LOG.length / 2;
    // Across the log at several points along it.
    for (const t of [-half, -half + 0.01, -1.3, 0, 0.9, half - 0.01, half]) {
      const cx = HERO_LOG.x + ax * t;
      const cz = HERO_LOG.z + az * t;
      expect(worstStep(cx, cz, HERO_LOG.yaw + Math.PI / 2, 0.6)).toBeLessThan(0.002);
    }
    // Along the axis itself, and straight through an end cap.
    expect(worstStep(HERO_LOG.x, HERO_LOG.z, HERO_LOG.yaw, 1.2)).toBeLessThan(0.002);
    expect(worstStep(HERO_LOG.x + ax * half, HERO_LOG.z + az * half, HERO_LOG.yaw, 0.6)).toBeLessThan(0.002);
  });

  it('the hero log axis is within 2 mm of a point 1 mm beside it', () => {
    // The known failure: on the axis the drift direction was undefined and the depth jumped by 16 cm.
    const nx = -Math.sin(HERO_LOG.yaw);
    const nz = Math.cos(HERO_LOG.yaw);
    for (const side of [-1, 1]) {
      const here = litterDepth(HERO_LOG.x, HERO_LOG.z);
      const near = litterDepth(HERO_LOG.x + nx * side * 0.001, HERO_LOG.z + nz * side * 0.001);
      expect(Math.abs(here - near)).toBeLessThan(0.002);
    }
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

describe('the speed test path', () => {
  it('stays on thin litter (the worm slips under it) for the whole auto-drive loop', () => {
    // The exact move and locomotion options the speed test drives, from the spawn.
    let m: WormMotion = { head: { x: 0, y: 0, z: 0 }, heading: 0 };
    let max = 0;
    for (let i = 0; i < 4000; i++) {
      m = stepWorm(m, AUTO_DRIVE_MOVE.move, 1 / 60, LOCOMOTION);
      max = Math.max(max, litterDepth(m.head.x, m.head.z));
    }
    expect(max).toBeLessThan(UNDER_THIN);
    // And with margin, so tuning the litter never makes the benchmark's worm start riding piles.
    expect(max).toBeLessThanOrEqual(0.05);
  });
});
