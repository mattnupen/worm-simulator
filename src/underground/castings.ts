import { hypot2 } from '../core/vec';
import { CELL, GRID_H, GRID_W, cellU, cellV, colOf, rowOf, touch, type SoilGrid } from './soilGrid';
import type { UV } from './slab';

/** Castings in the soil grid (moved from soilGrid.ts). */
/** Castings use this shade when asked for a non-finite one. */
const DEFAULT_SHADE = 128;
/** Share of the fringe cells of a casting that fill (spec 6: "partly refills"). */
const CAST_FILL = 0.85;
/** Cells this far (u) below the open band's edge fill at random instead of solid (the grain). */
const CAST_FRINGE = 0.05;
/** Slack (u) kept on the open band: a cast may be a little wider than the tunnel, and cells are sampled at their centres. */
const CAST_SLACK = 0.01;

/** A fixed 0..1 value per cell (for granular fills); deterministic. */
function cellHash(i: number): number {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Leaves a casting of radius r at (u, v) (spec 6): a dark granular blob that partly refills the
 * tunnel. (dirU, dirV) is the tunnel's direction there (any length, either way along it; the
 * burrower passes the body's direction at the tail). Castings settle on the downhill wall. The
 * uphill band across the axis stays open, and it is one cell wide measured along the grid (L1), so
 * its cell centres always form a 4-connected path at any angle: a cast never seals a 2 to 3 cell
 * tunnel. Below the band the cells fill, with a grainy fringe at its edge: about 45 to 65% of the
 * tunnel's cells in the cast. A vertical tunnel keeps its -u side open. `shade` 1..255: how dark (organic food makes darker casts); NaN gives a default.
 * Returns how many cells it filled (0 where no open tunnel lies under it). Allocates nothing. The
 * burrower leaves each cast just past its tail's own dig (burrowTrail.ts CAST_BACK), so its body
 * never eats a new one.
 */
export function castBlob(g: SoilGrid, u: number, v: number, r: number, shade: number, dirU: number, dirV: number): number {
  spot.u = u;
  spot.v = v;
  spot.shade = shade;
  spot.dirU = dirU;
  spot.dirV = dirV;
  return castBlobAt(g, spot, r);
}

/** Where a casting goes (castBlob's arguments): the per-step form passes these in an object. */
export interface CastSpot extends UV { shade: number; dirU: number; dirV: number }
const spot: CastSpot = { u: 0, v: 0, shade: 0, dirU: 0, dirV: 0 };

/** castBlob at `c`: the per-step form (it boxes no numbers, as digDiscAt). */
export function castBlobAt(g: SoilGrid, c: CastSpot, r: number): number {
  const u = c.u;
  const v = c.v;
  const shade = c.shade;
  const dirU = c.dirU;
  const dirV = c.dirV;
  // Unit normal pointing UP off the tunnel's axis, so "up" is the open side: (mu, mv) with mv >= 0
  // (for a vertical tunnel, the -u side is open). The filled side is the opposite.
  // Only cells on the open side of `open` (distance across the axis) stay open.
  const len = hypot2(dirU, dirV);
  let mu = 0;
  let mv = 1;
  if (len > 1e-9) {
    mu = -dirV / len;
    mv = dirU / len;
    if (mv < 0 || (Math.abs(mv) < 1e-9 && mu > 0)) {
      mu = -mu;
      mv = -mv;
    }
  }
  const open = r - CELL * (Math.abs(mu) + Math.abs(mv)) - CAST_SLACK;
  const c0 = Math.max(0, colOf(u - r));
  const c1 = Math.min(GRID_W - 1, colOf(u + r));
  const r0 = Math.max(0, rowOf(g, v - r));
  const r1 = Math.min(GRID_H - 1, rowOf(g, v + r));
  let filled = 0;
  const s = Number.isFinite(shade) ? Math.max(1, Math.min(255, Math.round(shade))) : DEFAULT_SHADE;
  for (let row = r0; row <= r1; row++) {
    const dv = cellV(g, row) - v;
    let changed = false;
    for (let c = c0; c <= c1; c++) {
      const du = cellU(c) - u;
      if (du * du + dv * dv > r * r) continue;
      const d = du * mu + dv * mv;
      if (d >= open) continue;
      const i = row * GRID_W + c;
      if (!g.open[i] || g.cast[i]) continue;
      if (d >= open - CAST_FRINGE && cellHash(i) >= CAST_FILL) continue;
      g.cast[i] = s;
      filled++;
      changed = true;
    }
    if (changed) touch(g, row);
  }
  return filled;
}
