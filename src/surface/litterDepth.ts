import { valueNoise2 } from '../core/noise';
import type { Vec3 } from '../core/vec';
import { terrainHeight } from './terrain';
import { treeSites } from './treeSites';
import { HERO_LOG, ROCKS } from './propPlacement';

/**
 * How deep the leaf litter lies at (x, z), in metres (world units), from LITTER_MIN to
 * LITTER_MAX (spec 5.1). Pure, deterministic, bounded and continuous:
 * - about one leaf (0.02) in the open and on rises;
 * - deeper in terrain hollows (positive curvature of terrainHeight);
 * - drifts against trunks, rocks and the fallen log, deeper on their downwind side;
 * - a few windblown piles.
 */
export const LITTER_MIN = 0.01;
export const LITTER_MAX = 0.25;
/** One leaf. */
export const LITTER_OPEN = 0.02;
/** Litter thinner than this: the worm slips under it. */
export const UNDER_THIN = 0.06;
/** Litter deeper than this: the worm rides on top. */
export const UNDER_DEEP = 0.12;

/** The fall wind blows toward +x, +z (unit vector). */
export const WIND = { x: 0.8, z: 0.6 };

/** Windblown piles: centre, radius (m) and peak depth (m). */
export const PILES: readonly { x: number; z: number; r: number; depth: number }[] = [
  { x: 2.2, z: 6.5, r: 1.3, depth: 0.23 },
  { x: -4.0, z: 3.0, r: 1.0, depth: 0.2 },
  { x: 5.5, z: -2.5, r: 1.2, depth: 0.22 },
  { x: -7.5, z: -8.0, r: 1.5, depth: 0.24 },
  { x: 9.0, z: 11.0, r: 1.4, depth: 0.22 },
];

const smoothstep = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The deepest drift against a trunk. */
const TRUNK_DRIFT = 0.17;

/**
 * A rock stands about 0.44 of its size above the soil, and the mound rises right up to it, so
 * a small rock's drift is capped (about half its height): litter banks against a rock, it does
 * not bury it.
 */
const rockDrift = (size: number): number => Math.min(TRUNK_DRIFT, Math.max(0.1, 0.22 * size));

/** Round obstacles that leaves drift against: trunks (with their root flare) and rocks. */
const ROUND: readonly { x: number; z: number; r: number; peak: number }[] = [
  ...treeSites().map((t) => ({ x: t.x, z: t.z, r: (t.birch ? 0.32 : 0.48) * 1.3, peak: TRUNK_DRIFT })),
  ...ROCKS.map((k) => ({ x: k.x, z: k.z, r: k.size * 1.05, peak: rockDrift(k.size) })),
];

const LOG_DX = Math.cos(HERO_LOG.yaw);
const LOG_DZ = Math.sin(HERO_LOG.yaw);

/** A drift against an obstacle surface `gap` metres away, in direction (nx, nz) from it. */
function drift(gap: number, nx: number, nz: number, peak: number): number {
  const downwind = nx * WIND.x + nz * WIND.z;
  const side = 0.55 + 0.45 * downwind;
  const reach = 0.45 + 0.6 * Math.max(0, downwind);
  return peak * side * (1 - smoothstep(0, reach, gap));
}

/** The deepest drift at (x, z) from trunks, rocks and the log. */
export function driftDepth(x: number, z: number): number {
  let best = 0;
  for (const o of ROUND) {
    const dx = x - o.x;
    const dz = z - o.z;
    const d = Math.hypot(dx, dz);
    if (d > o.r + 1.2) continue;
    const inv = d > 1e-9 ? 1 / d : 0;
    best = Math.max(best, drift(d - o.r, dx * inv, dz * inv, o.peak));
  }
  const t = Math.max(-HERO_LOG.length / 2, Math.min(HERO_LOG.length / 2,
    (x - HERO_LOG.x) * LOG_DX + (z - HERO_LOG.z) * LOG_DZ));
  const lx = x - (HERO_LOG.x + LOG_DX * t);
  const lz = z - (HERO_LOG.z + LOG_DZ * t);
  const ld = Math.hypot(lx, lz);
  if (ld < HERO_LOG.radius + 1.2) {
    const inv = ld > 1e-9 ? 1 / ld : 0;
    best = Math.max(best, drift(ld - HERO_LOG.radius, lx * inv, lz * inv, 0.2));
  }
  return best;
}

/** The deepest windblown pile at (x, z): an oval dome stretched along the wind. */
export function pileDepth(x: number, z: number): number {
  let best = 0;
  for (const p of PILES) {
    const dx = x - p.x;
    const dz = z - p.z;
    const along = (dx * WIND.x + dz * WIND.z) / 1.35;
    const across = dx * WIND.z - dz * WIND.x;
    const d = Math.hypot(along, across);
    best = Math.max(best, p.depth * (1 - smoothstep(p.r * 0.25, p.r, d)));
  }
  return best;
}

const CURVE_STEP = 0.6;

/** 0..1: how much of a hollow (x, z) sits in, from the terrain's curvature. */
export function hollowAmount(x: number, z: number): number {
  const h = terrainHeight(x, z);
  const e = CURVE_STEP;
  const lap = (terrainHeight(x + e, z) + terrainHeight(x - e, z) + terrainHeight(x, z + e)
    + terrainHeight(x, z - e) - 4 * h) / (e * e);
  return smoothstep(0.01, 0.08, lap);
}

export function litterDepth(x: number, z: number): number {
  const open = LITTER_OPEN + 0.008 * (valueNoise2(x * 0.6, z * 0.6, 91) - 0.5);
  const d = open + 0.05 * hollowAmount(x, z) + Math.max(driftDepth(x, z), pileDepth(x, z));
  return Math.min(LITTER_MAX, Math.max(LITTER_MIN, d));
}

/** 1 where the worm crawls under the litter (thin), 0 where it rides on top (deep), smooth between. */
export function underAmount(depth: number): number {
  return 1 - smoothstep(UNDER_THIN, UNDER_DEEP, depth);
}

/**
 * Height of the solid litter mound above the soil: 0 where litter is thin (the worm slips
 * under single leaves), the full depth where it is deep (the worm rides on the pile). The
 * ground mesh rises by this, so deep piles read as solid mounds with leaves on top.
 */
export function litterMound(depth: number): number {
  return depth * (1 - underAmount(depth));
}

/** The visible ground: the soil plus the solid litter mound. */
export function groundHeight(x: number, z: number): number {
  return terrainHeight(x, z) + litterMound(litterDepth(x, z));
}

const N_EPS = 0.05;

/** Unit normal of groundHeight, from central differences. */
export function groundNormal(x: number, z: number): Vec3 {
  const dx = (groundHeight(x + N_EPS, z) - groundHeight(x - N_EPS, z)) / (2 * N_EPS);
  const dz = (groundHeight(x, z + N_EPS) - groundHeight(x, z - N_EPS)) / (2 * N_EPS);
  const len = Math.hypot(dx, 1, dz);
  return { x: -dx / len, y: 1 / len, z: -dz / len };
}
