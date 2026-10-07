import { valueNoise2 } from '../core/noise';
import type { Vec3 } from '../core/vec';
import { terrainHeight } from './terrain';
import { treeSites, trunkRadiusOf } from './treeSites';
import { heroLog, rocks } from './propPlacement';
import type { LogSite } from './realScale';
import { gridLines, sampleGrid } from './meshGrid';
import { rockRise, rockSeed } from './propGeometry';

/**
 * The forest floor's loose leaves (the L layer) over the matted old leaves (the F layer), V2 spec
 * 8.2: the worm travels buried in the L layer, its belly on the F layer's top (floorHeight); the
 * drawn ground is the top of the leaves (litterTopHeight), and the top leaves lie on it.
 *
 * litterDepth is how deep the L layer is at (x, z), in world units (1 cm is 0.23 units), from
 * LITTER_MIN to LITTER_MAX (2 to 5 cm real). Pure, deterministic, bounded and continuous:
 * - about 2.4 cm in the open, a little less on rises;
 * - deeper in terrain hollows (positive curvature of terrainHeight);
 * - drifts against trunks, rocks and the fallen log, deeper on their downwind side;
 * - against a rock it banks, never burying it: its top stays under the level that leaves more than
 *   half the drawn rock showing (rockCap), so against a small rock it may be thinner than
 *   LITTER_MIN, down to ROCK_BANK_MIN;
 * - a few windblown piles.
 */
/** The thinnest the litter is, except banked against a small rock (ROCK_BANK_MIN). */
export const LITTER_MIN = 0.45;
export const LITTER_MAX = 1.2;
/** Open ground. */
export const LITTER_OPEN = 0.55;
/** The top leaves lie loose within this of the drawn top (one leaf: V1's open ground). */
export const TOP_LAYER = 0.02;
/** Drifts and piles are shaped in V1's metres (peaks 0.17 to 0.24); this deepens them for V2. */
const DEEPEN = 2.6;

/** The fall wind blows toward +x, +z (unit vector). */
export const WIND = { x: 0.8, z: 0.6 };

/** Windblown piles: centre, radius (m) and peak (V1's metres, times DEEPEN). */
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

/** The deepest drift against a trunk (V1's metres). */
const TRUNK_DRIFT = 0.17;
/**
 * Against a rock the litter's top stays under this share of the drawn rock's height over the soil
 * at its centre (rockRise), so more than half of it shows. The margin covers a lumpy rock's edge
 * reaching a little past its 1.05-size footprint, where the bank starts to relax.
 */
const ROCK_BANK = 0.45;
/** The thinnest the litter gets banked against a rock (about 9 mm: the worm is 1 cm thick). */
export const ROCK_BANK_MIN = 0.2;

interface Drifts {
  /** Round obstacles that leaves drift against: trunks (with their root flare) and rocks. */
  round: readonly { x: number; z: number; r: number; peak: number }[];
  /** Rocks: centre, footprint radius and the highest the litter's top may reach against it. */
  banks: readonly { x: number; z: number; r: number; level: number }[];
  log: LogSite;
  logDx: number;
  logDz: number;
}
let drifts: Drifts | null = null;

/** What the leaves drift against (built once). */
function driftSources(): Drifts {
  if (drifts) return drifts;
  const log = heroLog();
  drifts = {
    round: [
      ...treeSites().map((t) => ({ x: t.x, z: t.z, r: trunkRadiusOf(t) * 1.3, peak: TRUNK_DRIFT })),
      ...rocks().map((k) => ({ x: k.x, z: k.z, r: k.size * 1.05, peak: TRUNK_DRIFT })),
    ],
    banks: rocks().map((k, i) => ({
      x: k.x, z: k.z, r: k.size * 1.05, level: terrainHeight(k.x, k.z) + ROCK_BANK * rockRise(k.size, rockSeed(i)),
    })),
    log,
    logDx: Math.cos(log.yaw),
    logDz: Math.sin(log.yaw),
  };
  return drifts;
}

/**
 * A drift against an obstacle of radius `r` whose surface is `gap` metres away, at offset
 * (dx, dz) (length d) from the obstacle's centre or axis. Outside the radius the direction is
 * the unit offset. Inside it, the direction shrinks linearly to zero at the centre (the mean of
 * the upwind and downwind sides), so the depth is continuous there.
 */
function drift(gap: number, dx: number, dz: number, d: number, r: number, peak: number): number {
  const downwind = (dx * WIND.x + dz * WIND.z) / Math.max(d, r);
  const side = 0.55 + 0.45 * downwind;
  const reach = 0.45 + 0.6 * Math.max(0, downwind);
  return peak * side * (1 - smoothstep(0, reach, gap));
}

/** The deepest drift at (x, z) from trunks, rocks and the log (V1's metres). */
export function driftDepth(x: number, z: number): number {
  const { round, log, logDx: LOG_DX, logDz: LOG_DZ } = driftSources();
  let best = 0;
  for (const o of round) {
    const dx = x - o.x;
    const dz = z - o.z;
    const d = Math.hypot(dx, dz);
    if (d > o.r + 1.2) continue;
    best = Math.max(best, drift(d - o.r, dx, dz, d, o.r, o.peak));
  }
  const t = Math.max(-log.length / 2, Math.min(log.length / 2, (x - log.x) * LOG_DX + (z - log.z) * LOG_DZ));
  const lx = x - (log.x + LOG_DX * t);
  const lz = z - (log.z + LOG_DZ * t);
  const ld = Math.hypot(lx, lz);
  if (ld < log.radius + 1.2) {
    best = Math.max(best, drift(ld - log.radius, lx, lz, ld, log.radius, 0.2));
  }
  return best;
}

/** The deepest windblown pile at (x, z): an oval dome stretched along the wind (V1's metres). */
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

/** The terrain's curvature at (x, z): positive in hollows, negative on rises. */
function curvature(x: number, z: number): number {
  const h = terrainHeight(x, z);
  const e = CURVE_STEP;
  return (terrainHeight(x + e, z) + terrainHeight(x - e, z) + terrainHeight(x, z + e)
    + terrainHeight(x, z - e) - 4 * h) / (e * e);
}

/** 0..1: how much of a hollow (x, z) sits in, from the terrain's curvature. */
export function hollowAmount(x: number, z: number): number {
  return smoothstep(0.01, 0.08, curvature(x, z));
}

/**
 * The deepest the litter may be at (x, z): against a rock, up to its bank level (less than half the
 * drawn rock's height) over the floor right here, so a floor that rises toward the rock's edge
 * lowers it. From the rock's edge it relaxes to no limit 1.5 away, so where the worm can reach
 * (the rock's footprint is wider) the leaves still cover it.
 */
function rockCap(x: number, z: number): number {
  let cap = LITTER_MAX;
  let floor = NaN;
  for (const b of driftSources().banks) {
    const gap = Math.hypot(x - b.x, z - b.z) - b.r;
    if (gap >= 1.5) continue;
    if (Number.isNaN(floor)) floor = terrainHeight(x, z);
    const bank = Math.max(ROCK_BANK_MIN, b.level - floor);
    cap = Math.min(cap, bank + (LITTER_MAX - bank) * smoothstep(0, 1.5, gap));
  }
  return cap;
}

export function litterDepth(x: number, z: number): number {
  const lap = curvature(x, z);
  const open = LITTER_OPEN + 0.1 * (valueNoise2(x * 0.6, z * 0.6, 91) - 0.5);
  const shape = 0.18 * smoothstep(0.01, 0.08, lap) - 0.06 * smoothstep(0.01, 0.08, -lap);
  const d = open + shape + DEEPEN * Math.max(driftDepth(x, z), pileDepth(x, z));
  return Math.min(rockCap(x, z), LITTER_MAX, Math.max(LITTER_MIN, d));
}

/**
 * The top of the F layer at (x, z): the matted old leaves under the loose ones, where a buried
 * worm's belly rests. It is the soil's shape (terrainHeight), so it is smooth everywhere.
 */
export function floorHeight(x: number, z: number): number {
  return terrainHeight(x, z);
}

/** The top of the loose leaves, analytically: the floor plus the litter (the drawn top is litterTopHeight). */
export function groundHeight(x: number, z: number): number {
  return floorHeight(x, z) + litterDepth(x, z);
}

let topGrid: { lines: number[]; heights: Float64Array } | null = null;

/** The drawn top's height grid (meshGrid.ts): groundHeight at every vertex, built once. Read-only. */
export function litterTopGrid(): { lines: number[]; heights: Float64Array } {
  if (topGrid) return topGrid;
  const lines = gridLines();
  const n = lines.length;
  const heights = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) heights[j * n + i] = groundHeight(lines[i], lines[j]);
  topGrid = { lines, heights };
  return topGrid;
}

/**
 * The top of the loose leaves at (x, z), exactly as the ground is drawn (the terrain mesh, 0.5 m
 * cells): about floorHeight + litterDepth, within a few cm where the grid cuts a drift. The top
 * leaves lie on it and the camera keeps above it.
 */
export function litterTopHeight(x: number, z: number): number {
  const g = litterTopGrid();
  return sampleGrid(g.lines, g.heights, x, z);
}

const N_EPS = 0.05;

/** Unit normal of groundHeight, from central differences. */
export function groundNormal(x: number, z: number): Vec3 {
  const dx = (groundHeight(x + N_EPS, z) - groundHeight(x - N_EPS, z)) / (2 * N_EPS);
  const dz = (groundHeight(x, z + N_EPS) - groundHeight(x, z - N_EPS)) / (2 * N_EPS);
  const len = Math.hypot(dx, 1, dz);
  return { x: -dx / len, y: 1 / len, z: -dz / len };
}
