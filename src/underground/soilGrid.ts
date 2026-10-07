import { LAYER, isOrganic, type LayerId } from './layers';
import { layerAt, SLAB_HALF, type Slab } from './slab';

/**
 * The soil of one slab as a grid of 0.1 u cells (V2 spec 10): 160 across the playable 16 u and
 * 136 up from the slab's bottom (the 12 u slab plus room for rising ground). Typed arrays only: built once, refilled for each new slab, never resized.
 * Rows that change are tracked so the renderer uploads only those (cutFace.ts).
 */
export const CELL = 0.1;
/** Castings use this shade when asked for a non-finite one. */
const DEFAULT_SHADE = 128;
export const GRID_W = Math.round((2 * SLAB_HALF) / CELL);
/**
 * 136 rows = 13.6 u: the slab's 12 u below the litter top at the entry, plus 1.6 u above it, for
 * ground that rises along the cut (measured over 600 slabs: at most about 0.94 u). The grid's
 * bottom row is the slab's bottom (v0); litter cells must never fall above the top row.
 */
export const GRID_H = 136;
/** Layer byte of a cell above the litter top: nothing to dig. */
export const AIR = 255;
/** solid byte: a stone, a big root (both block the worm). */
export const SOLID_STONE = 1;
export const SOLID_ROOT = 2;
/** Moisture (0..255) by layer at the start (spec 5.1: F damp; drier mineral soil below). */
const DAMP: Readonly<Record<LayerId, number>> = { 0: 90, 1: 210, 2: 180, 3: 130, 4: 100, 5: 90 };
/** Walls this far beyond an eaten F or H cell turn darker and crumbly (spec 6, mixing). */
export const MIX_RING = 0.12;
/** Share of the fringe cells of a casting that fill (spec 6: "partly refills"). */
const CAST_FILL = 0.85;
/** Cells this far (u) below the open band's edge fill at random instead of solid (the grain). */
const CAST_FRINGE = 0.05;
/** Slack (u) kept on the open band: a cast may be a little wider than the tunnel, and cells are sampled at their centres. */
const CAST_SLACK = 0.01;

export interface SoilGrid {
  /** Layer per cell (LAYER ids), AIR above the litter. */
  readonly layer: Uint8Array;
  /** 1 where the worm has eaten an open tunnel. */
  readonly open: Uint8Array;
  /** Castings: 0 none, else how dark (more organic food, darker). */
  readonly cast: Uint8Array;
  /** 1 where tunnel walls were mixed (eaten through F or H): darker, crumbly. */
  readonly mixed: Uint8Array;
  /** SOLID_STONE or SOLID_ROOT where a blocker lies, else 0. */
  readonly solid: Uint8Array;
  /** Moisture 0..255. */
  readonly damp: Uint8Array;
  /** World height of the bottom row's lower edge (the slab's bottom). */
  v0: number;
  /** Rows changed since takeDirty (dirtyLo > dirtyHi: none). */
  dirtyLo: number;
  dirtyHi: number;
}

/** What digDisc ate. */
export interface Eaten {
  /** Cells newly opened. */
  cells: number;
  /** Of those, cells of litter, F or H (leaves at some stage). */
  organic: number;
}

export function createSoilGrid(): SoilGrid {
  const n = GRID_W * GRID_H;
  return {
    layer: new Uint8Array(n), open: new Uint8Array(n), cast: new Uint8Array(n),
    mixed: new Uint8Array(n), solid: new Uint8Array(n), damp: new Uint8Array(n),
    v0: 0, dirtyLo: 0, dirtyHi: GRID_H - 1,
  };
}

/** Column and row of (u, v), unclamped. */
export const colOf = (u: number): number => Math.floor((u + SLAB_HALF) / CELL);
export const rowOf = (g: SoilGrid, v: number): number => Math.floor((v - g.v0) / CELL);
/** Centre of a cell. */
export const cellU = (c: number): number => -SLAB_HALF + (c + 0.5) * CELL;
export const cellV = (g: SoilGrid, r: number): number => g.v0 + (r + 0.5) * CELL;

/** A fresh slab: layers from the slab, nothing dug, no castings or blockers, every row dirty. */
export function fillSoilGrid(g: SoilGrid, s: Slab): void {
  g.v0 = s.bottom;
  g.open.fill(0);
  g.cast.fill(0);
  g.mixed.fill(0);
  g.solid.fill(0);
  for (let r = 0; r < GRID_H; r++) {
    const v = cellV(g, r);
    for (let c = 0; c < GRID_W; c++) {
      const i = r * GRID_W + c;
      const l = layerAt(s, cellU(c), v);
      if (l === -1) {
        g.layer[i] = AIR;
        g.damp[i] = 0;
      } else {
        g.layer[i] = l;
        g.damp[i] = DAMP[l];
      }
    }
  }
  g.dirtyLo = 0;
  g.dirtyHi = GRID_H - 1;
}

export function touch(g: SoilGrid, r: number): void {
  if (r < g.dirtyLo) g.dirtyLo = r;
  if (r > g.dirtyHi) g.dirtyHi = r;
}

/** The dirty row range [lo, hi] into out (lo > hi when none), then clears it. */
export function takeDirty(g: SoilGrid, out: { lo: number; hi: number }): { lo: number; hi: number } {
  out.lo = g.dirtyLo;
  out.hi = g.dirtyHi;
  g.dirtyLo = GRID_H;
  g.dirtyHi = -1;
  return out;
}

/** The cell index at (u, v), or -1 outside the grid. */
export function cellAt(g: SoilGrid, u: number, v: number): number {
  const c = colOf(u);
  const r = rowOf(g, v);
  return c < 0 || c >= GRID_W || r < 0 || r >= GRID_H ? -1 : r * GRID_W + c;
}

/** A fixed 0..1 value per cell (for granular fills); deterministic. */
function cellHash(i: number): number {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Eats a disc of radius r at (u, v): every soil cell inside (not air, not a blocker) opens, and
 * castings there are eaten too. Where it eats F or H the walls around (out to MIX_RING) are
 * mixed. Writes what it ate into `out`. Allocates nothing.
 */
export function digDisc(g: SoilGrid, u: number, v: number, r: number, out: Eaten): Eaten {
  out.cells = 0;
  out.organic = 0;
  let mixing = false;
  const c0 = Math.max(0, colOf(u - r));
  const c1 = Math.min(GRID_W - 1, colOf(u + r));
  const r0 = Math.max(0, rowOf(g, v - r));
  const r1 = Math.min(GRID_H - 1, rowOf(g, v + r));
  for (let row = r0; row <= r1; row++) {
    const dv = cellV(g, row) - v;
    let changed = false;
    for (let c = c0; c <= c1; c++) {
      const du = cellU(c) - u;
      if (du * du + dv * dv > r * r) continue;
      const i = row * GRID_W + c;
      const l = g.layer[i];
      if (l === AIR || g.solid[i] !== 0 || (g.open[i] && !g.cast[i])) continue;
      if (!g.open[i]) {
        out.cells++;
        if (isOrganic(l as LayerId)) out.organic++;
        if (l === LAYER.F || l === LAYER.H) mixing = true;
      }
      g.open[i] = 1;
      g.cast[i] = 0;
      changed = true;
    }
    if (changed) touch(g, row);
  }
  if (mixing) mixRing(g, u, v, r);
  return out;
}

/** Marks the not-yet-open soil around a disc as mixed (darker, crumbly walls). */
function mixRing(g: SoilGrid, u: number, v: number, r: number): void {
  const R = r + MIX_RING;
  const c0 = Math.max(0, colOf(u - R));
  const c1 = Math.min(GRID_W - 1, colOf(u + R));
  const r0 = Math.max(0, rowOf(g, v - R));
  const r1 = Math.min(GRID_H - 1, rowOf(g, v + R));
  for (let row = r0; row <= r1; row++) {
    const dv = cellV(g, row) - v;
    let changed = false;
    for (let c = c0; c <= c1; c++) {
      const du = cellU(c) - u;
      const d2 = du * du + dv * dv;
      if (d2 > R * R) continue;
      const i = row * GRID_W + c;
      if (g.open[i] || g.mixed[i] || g.layer[i] === AIR || g.solid[i]) continue;
      g.mixed[i] = 1;
      changed = true;
    }
    if (changed) touch(g, row);
  }
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
 * burrower leaves each cast just past its tail's own dig (burrowMotion.ts CAST_BACK), so its body
 * never eats a new one.
 */
export function castBlob(g: SoilGrid, u: number, v: number, r: number, shade: number, dirU: number, dirV: number): number {
  // Unit normal pointing UP off the tunnel's axis, so "up" is the open side: (mu, mv) with mv >= 0
  // (for a vertical tunnel, the -u side is open). The filled side is the opposite.
  // Only cells on the open side of `open` (distance across the axis) stay open.
  const len = Math.hypot(dirU, dirV);
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
