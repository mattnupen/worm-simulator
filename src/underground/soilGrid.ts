import { LAYER, isOrganic, type LayerId } from './layers';
import { layerAt, SLAB_HALF, type Slab, type UV } from './slab';

/**
 * The soil of one slab as a grid of 0.1 u cells (V2 spec 10): 160 across the playable 16 u and
 * 136 up from the slab's bottom (the 12 u slab plus room for rising ground). Typed arrays only: built once, refilled for each new slab, never resized.
 * Rows that change are tracked so the renderer uploads only those (cutFace.ts).
 */
export const CELL = 0.1;
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

/**
 * Eats a disc of radius r at (u, v): every soil cell inside (not air, not a blocker) opens, and
 * castings there are eaten too. Where it eats F or H the walls around (out to MIX_RING) are
 * mixed. Writes what it ate into `out`. Allocates nothing.
 */
export function digDisc(g: SoilGrid, u: number, v: number, r: number, out: Eaten): Eaten {
  at.u = u;
  at.v = v;
  digDiscAt(g, at, r, out);
  return out;
}

const at: UV = { u: 0, v: 0 };

/**
 * digDisc at the point `p`: the per-step form (the burrower's), which boxes no numbers (a number
 * passed to a call V8 does not inline is boxed on the heap: solidShapes.ts).
 */
export function digDiscAt(g: SoilGrid, p: UV, r: number, out: Eaten): void {
  const u = p.u;
  const v = p.v;
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
  if (mixing) mixRing(g, p, r);
}

/** Marks the not-yet-open soil around a disc at `p` as mixed (darker, crumbly walls). */
function mixRing(g: SoilGrid, p: UV, r: number): void {
  const u = p.u;
  const v = p.v;
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
