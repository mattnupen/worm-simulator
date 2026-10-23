import { icosphere } from './meshWriter';
import { terrainHeight } from './terrain';
import { heroLog, LOG_FOOT, ROCK_FOOT, rocks } from './propPlacement';
import { rockPoint, rockSeed } from './rockShape';
import { LOG_SEED } from './trunkGeometry';

/**
 * What the worm crawls up and over (V4 hot fix, Matt: "allow worm to crawl over rocks and logs"):
 * the rocks and the fallen log, as a height the worm's belly rides on, built once from the props'
 * own drawn shapes. Real earthworms crawl over logs and stones, so this is no game choice.
 *
 * - Rocks: each drawn rock's triangles are rasterised into a height grid (its top as drawn).
 * - The log: its round cross-section, at each point along it the radius the bark mesh has there.
 *
 * Over both, the ride keeps RIDE_PAD clear of the drawn surface where it is steep (the tube's axis
 * sits straight above its belly line, so on a slope it would cut into the prop), and it never gets
 * steeper than CLIMB_SLOPE where it has room: around each prop's foot it falls away at that slope to
 * the floor. It never reaches past the prop's footprint (obstacles.ts) grown by EDGE_IN, though: the
 * last stretch before that is a steep wall (WALL_SLOPE) down to the floor, hidden in the litter at
 * the prop's foot. So everywhere the worm could lie before (coming up out of the cut, digging down)
 * it still lies on the floor, exactly as the cut hands it over. Trunks are not here: they stay
 * solid. Every lookup allocates nothing.
 */

/**
 * The tallest prop the worm climbs (m above the soil): the log (about 4.9, a 25 cm birch) and every
 * rock (0.8 to 1.7) are below it; the tree trunks (infinitely tall in obstacles.ts) are not, so they
 * still block. It is about 1.7 worm lengths (26 cm at real size).
 */
export const MAX_CLIMB = 6;
/** The steepest the ride gets (rise per run, about 68 degrees). */
export const CLIMB_SLOPE = 2.5;
/** How far the ride keeps off a steep drawn surface (m), about the worm's vertical radius. */
export const RIDE_PAD = 0.1;
/** The log's drawn radius is matched with this much to spare (its 12-sided rings, bark texture). */
const LOG_SPARE = 0.04;
/** The ride meets the floor this far out past a prop's footprint: a hair inside the worm's half width (crawl's BODY_RADIUS). */
export const EDGE_IN = 0.13;
/** How steep the ride may get in the last stretch before EDGE_IN (rise per run). */
const WALL_SLOPE = 12;
/** The wall starts this far under the soil at EDGE_IN, so it is under the floor there however the floor lies. */
const WALL_SINK = 0.6;
/** Rock grid cell (m). */
const CELL = 0.1;
/** Below any real height: a grid cell nothing covers yet. */
const NONE = -1e9;

const SIN_T = CLIMB_SLOPE / Math.hypot(1, CLIMB_SLOPE);
const COS_T = 1 / Math.hypot(1, CLIMB_SLOPE);

interface RockGrid { x0: number; z0: number; n: number; h: Float32Array }
interface LogRide {
  x: number; z: number; dx: number; dz: number; half: number;
  /** Per table step along the log (from -half): its ride radius and its axis height. */
  step: number; r: Float32Array; cy: Float32Array;
  /** Its footprint's radius grown by EDGE_IN (the wall), and how far its axis stands over the soil. */
  edge: number; rise: number;
}

let grids: RockGrid[] | null = null;
let log: LogRide | null = null;

/** Rasterises a rock's drawn triangles into a grid of top heights, then pads and slopes it (see above). */
function buildRock(x: number, z: number, size: number, seed: number): RockGrid {
  const { pos, index } = icosphere();
  const g = terrainHeight(x, z);
  const reach = size * 1.15 * 1.25 + RIDE_PAD + 2.5 / CLIMB_SLOPE;
  const n = Math.ceil((2 * reach) / CELL) + 1;
  const x0 = x - reach;
  const z0 = z - reach;
  const v = new Float64Array(pos.length);
  const p = new Float64Array(3);
  for (let i = 0; i < pos.length; i += 3) {
    rockPoint(pos[i], pos[i + 1], pos[i + 2], x, z, g, size, seed, p);
    v[i] = p[0]; v[i + 1] = p[1]; v[i + 2] = p[2];
  }
  const top = new Float32Array(n * n).fill(NONE);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
    const det = (v[b + 2] - v[c + 2]) * (v[a] - v[c]) + (v[c] - v[b]) * (v[a + 2] - v[c + 2]);
    if (Math.abs(det) < 1e-12) continue;
    const i0 = Math.max(0, Math.floor((Math.min(v[a], v[b], v[c]) - x0) / CELL));
    const i1 = Math.min(n - 1, Math.ceil((Math.max(v[a], v[b], v[c]) - x0) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(v[a + 2], v[b + 2], v[c + 2]) - z0) / CELL));
    const j1 = Math.min(n - 1, Math.ceil((Math.max(v[a + 2], v[b + 2], v[c + 2]) - z0) / CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const px = x0 + i * CELL, pz = z0 + j * CELL;
        const l1 = ((v[b + 2] - v[c + 2]) * (px - v[c]) + (v[c] - v[b]) * (pz - v[c + 2])) / det;
        const l2 = ((v[c + 2] - v[a + 2]) * (px - v[c]) + (v[a] - v[c]) * (pz - v[c + 2])) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        const y = l1 * v[a + 1] + l2 * v[b + 1] + l3 * v[c + 1];
        if (y > top[j * n + i]) top[j * n + i] = y;
      }
    }
  }
  // Padded: a ball of RIDE_PAD rolled over the top, its bottom (the belly) at the ride.
  const k = Math.ceil(RIDE_PAD / CELL);
  const h = new Float32Array(n * n).fill(NONE);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let best = NONE;
      for (let b = Math.max(0, j - k); b <= Math.min(n - 1, j + k); b++) {
        for (let a = Math.max(0, i - k); a <= Math.min(n - 1, i + k); a++) {
          const y = top[b * n + a];
          if (y <= NONE) continue;
          const d2 = ((a - i) * (a - i) + (b - j) * (b - j)) * CELL * CELL;
          if (d2 > RIDE_PAD * RIDE_PAD) continue;
          best = Math.max(best, y + Math.sqrt(RIDE_PAD * RIDE_PAD - d2) - RIDE_PAD);
        }
      }
      h[j * n + i] = best;
    }
  }
  // Never steeper than CLIMB_SLOPE: two sweeps carry each height out to its neighbours, falling.
  const fall = CLIMB_SLOPE * CELL;
  const diag = fall * Math.SQRT2;
  for (let pass = 0; pass < 2; pass++) {
    for (let s = 0; s < n * n; s++) {
      const q = pass === 0 ? s : n * n - 1 - s;
      const i = q % n, j = (q - i) / n;
      const di = pass === 0 ? -1 : 1;
      let y = h[q];
      if (i + di >= 0 && i + di < n) y = Math.max(y, h[q + di] - fall);
      if (j + di >= 0 && j + di < n) {
        y = Math.max(y, h[q + di * n] - fall);
        if (i - 1 >= 0) y = Math.max(y, h[q + di * n - 1] - diag);
        if (i + 1 < n) y = Math.max(y, h[q + di * n + 1] - diag);
      }
      h[q] = y;
    }
  }
  // The wall: never past the footprint grown by EDGE_IN.
  const edge = size * ROCK_FOOT + EDGE_IN;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(x0 + i * CELL - x, z0 + j * CELL - z);
      h[j * n + i] = Math.min(h[j * n + i], g - WALL_SINK + WALL_SLOPE * (edge - d));
    }
  }
  return { x0, z0, n, h };
}

/** The log's ride: its drawn ring radius (trunkGeometry's writeLog) and axis height along it, tabled. */
function buildLog(): LogRide {
  const l = heroLog();
  const dx = Math.cos(l.yaw);
  const dz = Math.sin(l.yaw);
  const half = l.length / 2;
  const step = 0.25;
  const count = Math.ceil((2 * half) / step) + 1;
  const r = new Float32Array(count);
  const cy = new Float32Array(count);
  for (let k = 0; k < count; k++) {
    const s = -half + k * step;
    const f = Math.min(1, Math.max(0, s / l.length + 0.5));
    r[k] = l.radius * (1.06 - 0.12 * f) * (1 + 0.08 * Math.sin(f * 9 + LOG_SEED * 5)) + LOG_SPARE + RIDE_PAD;
    cy[k] = terrainHeight(l.x + dx * s, l.z + dz * s) + l.radius * 0.55;
  }
  return { x: l.x, z: l.z, dx, dz, half, step, r, cy, edge: l.radius * LOG_FOOT + EDGE_IN, rise: l.radius * 0.55 };
}

function build(): void {
  grids = rocks().map((k, i) => buildRock(k.x, k.z, k.size, rockSeed(i)));
  log = buildLog();
}

/** The rock and log heights over the floor's own: what climbInto lifts the belly to. */
function rockAt(gr: RockGrid, x: number, z: number): number {
  const fx = (x - gr.x0) / CELL;
  const fz = (z - gr.z0) / CELL;
  const n = gr.n;
  if (!(fx >= 0 && fz >= 0 && fx < n - 1 && fz < n - 1)) return NONE;
  const i = Math.floor(fx), j = Math.floor(fz);
  const u = fx - i, w = fz - j;
  const h = gr.h;
  const o = j * n + i;
  return (h[o] * (1 - u) + h[o + 1] * u) * (1 - w) + (h[o + n] * (1 - u) + h[o + n + 1] * u) * w;
}

function logAt(g: LogRide, x: number, z: number): number {
  const ox = x - g.x;
  const oz = z - g.z;
  const s = ox * g.dx + oz * g.dz;
  if (s < -g.half || s > g.half) return NONE;
  const px = ox - g.dx * s;
  const pz = oz - g.dz * s;
  const d = Math.sqrt(px * px + pz * pz);
  const fk = (s + g.half) / g.step;
  const k = Math.min(g.r.length - 2, Math.floor(fk));
  const t = fk - k;
  const r = g.r[k] + (g.r[k + 1] - g.r[k]) * t;
  if (d >= g.edge) return NONE;
  const cy = g.cy[k] + (g.cy[k + 1] - g.cy[k]) * t;
  // The padded circle's top, then (past the tangent point) the CLIMB_SLOPE fillet down from it,
  // then the wall.
  const ride = (d <= r * SIN_T ? cy + Math.sqrt(r * r - d * d) : cy + r / COS_T - CLIMB_SLOPE * d) - RIDE_PAD;
  return Math.min(ride, cy - g.rise - WALL_SINK + WALL_SLOPE * (g.edge - d));
}

/** Where the climb surface is asked about, [x, z]; and what it answers, in [2] (see surfaceHeight's `ask`). */
export const climbAsk = new Float64Array(3);

/**
 * The ride over the rocks and the log at (climbAsk[0], climbAsk[1]), into climbAsk[2]: an absolute
 * height, or far below anything (-1e9) off them. Numbers cross this call in the array only, so the
 * per-step calls allocate nothing (stepAllocation.test.ts).
 */
export function climbHeight(): void {
  if (!grids) build();
  const x = climbAsk[0];
  const z = climbAsk[1];
  let best = logAt(log!, x, z);
  const gs = grids!;
  for (let i = 0; i < gs.length; i++) {
    const y = rockAt(gs[i], x, z);
    if (y > best) best = y;
  }
  climbAsk[2] = best;
}

/** The ride over the rocks and the log at (x, z) (for tests and the camera; not per body point). */
export function climbAt(x: number, z: number): number {
  climbAsk[0] = x;
  climbAsk[1] = z;
  climbHeight();
  return climbAsk[2];
}
