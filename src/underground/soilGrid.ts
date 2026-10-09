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
/** The hollow (spec 2026-10-08 section 4.2): 2^HOLLOW_SHIFT depth samples per cell across and up (a shift turns a sample's index into its cell's)... */
export const HOLLOW_SHIFT = 2;
export const HOLLOW_RES = 1 << HOLLOW_SHIFT;
export const HOLLOW_W = GRID_W * HOLLOW_RES;
export const HOLLOW_H = GRID_H * HOLLOW_RES;
/** ...0.025 u apart... */
export const HOLLOW_STEP = CELL / HOLLOW_RES;
/** ...each a byte, 0..255 for 0..HOLLOW_MAX (u) behind the face (just over TUNNEL_R). */
export const HOLLOW_MAX = 0.16;
/**
 * The tunnel radius (u) a casting's mound is measured against: burrowTrail.ts TUNNEL_R, repeated
 * here because castings.ts (which burrowTrail imports) cannot import it back without a cycle.
 */
export const HOLLOW_MOUND_R = 0.14;
/** A casting's mound is pellets: each cell's samples sink up to this (u) more toward its edges. */
export const HOLLOW_PELLET = 0.024;
/** A rectangle of hollow samples (c0 > c1: none). */
export interface HollowRect { c0: number; c1: number; r0: number; r1: number }

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
  /**
   * How deep the tunnels go behind the face, HOLLOW_RES x HOLLOW_RES samples a cell (byte: 0..HOLLOW_MAX).
   * Every tunnel is centred in the cut's plane, so their back halves are one surface over it: the
   * renderer pushes the hollow tiles back by it (hollowMesh.ts).
   */
  readonly hollow: Uint8Array;
  /**
   * Hollow samples digs changed since takeHollowDirty. Castings, laid at the tail some 3 u behind
   * the head, mark their own rectangle (hollowCastDirty, takeHollowCastDirty): one rectangle round
   * both would span every tile from head to tail.
   */
  readonly hollowDirty: HollowRect;
  /** Hollow samples castings changed since takeHollowCastDirty. */
  readonly hollowCastDirty: HollowRect;
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
    hollow: new Uint8Array(HOLLOW_W * HOLLOW_H),
    hollowDirty: { c0: 0, c1: HOLLOW_W - 1, r0: 0, r1: HOLLOW_H - 1 },
    hollowCastDirty: { c0: HOLLOW_W, c1: -1, r0: HOLLOW_H, r1: -1 },
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
  g.hollow.fill(0);
  markHollowWhole(g);
}

/**
 * Marks the whole hollow changed, for the next upload to look at every tile (a new slab). The dig
 * rectangle covers it all, so the castings' is cleared rather than scanned a second time.
 */
export function markHollowWhole(g: SoilGrid): void {
  const d = g.hollowDirty;
  d.c0 = 0; d.c1 = HOLLOW_W - 1; d.r0 = 0; d.r1 = HOLLOW_H - 1;
  clearRect(g.hollowCastDirty);
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

/** Grows rectangle `d` to take in sample (c, r). Integers only. */
function markHollow(d: HollowRect, c: number, r: number): void {
  if (c < d.c0) d.c0 = c;
  if (c > d.c1) d.c1 = c;
  if (r < d.r0) d.r0 = r;
  if (r > d.r1) d.r1 = r;
}

function clearRect(d: HollowRect): void {
  d.c0 = HOLLOW_W; d.c1 = -1; d.r0 = HOLLOW_H; d.r1 = -1;
}

function takeRect(d: HollowRect, out: HollowRect): void {
  out.c0 = d.c0; out.c1 = d.c1; out.r0 = d.r0; out.r1 = d.r1;
  clearRect(d);
}

/** The hollow rectangle digs changed into `out` (c0 > c1 when none), then clears it. */
export function takeHollowDirty(g: SoilGrid, out: HollowRect): void {
  takeRect(g.hollowDirty, out);
}

/** The hollow rectangle castings changed into `out` (c0 > c1 when none), then clears it. */
export function takeHollowCastDirty(g: SoilGrid, out: HollowRect): void {
  takeRect(g.hollowCastDirty, out);
}

/** The hollow's depth (u) at (u, v), the nearest sample (tests and later interactions). */
export function hollowAt(g: SoilGrid, u: number, v: number): number {
  const c = Math.floor((u + SLAB_HALF) / HOLLOW_STEP);
  const r = Math.floor((v - g.v0) / HOLLOW_STEP);
  if (c < 0 || c >= HOLLOW_W || r < 0 || r >= HOLLOW_H) return 0;
  return (g.hollow[r * HOLLOW_W + c] * HOLLOW_MAX) / 255;
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
  // Runs even when no cell opened (the head moving through its own tunnel); it marks dirty only
  // the samples that got deeper, so re-digging uploads nothing.
  carve(g, p, r);
}

/**
 * Carves the hollow for a dig of radius r at `p`: each sample within r goes at least sqrt(r^2 - d^2)
 * deep (the back half of a round tunnel), but not in air or a blocker's cell. Allocates nothing
 * (inline Math.sqrt: a non-inlined helper would box its doubles).
 */
function carve(g: SoilGrid, p: UV, r: number): void {
  const u = p.u;
  const v = p.v;
  const c0 = Math.max(0, Math.floor((u - r + SLAB_HALF) / HOLLOW_STEP));
  const c1 = Math.min(HOLLOW_W - 1, Math.floor((u + r + SLAB_HALF) / HOLLOW_STEP));
  const r0 = Math.max(0, Math.floor((v - r - g.v0) / HOLLOW_STEP));
  const r1 = Math.min(HOLLOW_H - 1, Math.floor((v + r - g.v0) / HOLLOW_STEP));
  const scale = 255 / HOLLOW_MAX;
  const rr = r * r;
  const dirty = g.hollowDirty;
  for (let row = r0; row <= r1; row++) {
    const dv = g.v0 + (row + 0.5) * HOLLOW_STEP - v;
    const cellRow = (row >> HOLLOW_SHIFT) * GRID_W;
    for (let c = c0; c <= c1; c++) {
      const du = -SLAB_HALF + (c + 0.5) * HOLLOW_STEP - u;
      const d2 = du * du + dv * dv;
      if (d2 >= rr) continue;
      const ci = cellRow + (c >> HOLLOW_SHIFT);
      if (g.layer[ci] === AIR || g.solid[ci] !== 0) continue;
      const depth = Math.min(255, Math.round(Math.sqrt(rr - d2) * scale));
      const i = row * HOLLOW_W + c;
      if (depth > g.hollow[i]) {
        g.hollow[i] = depth;
        markHollow(dirty, c, row);
      }
    }
  }
}

/** A cell's middle in samples, and its corner samples' squared distance from it. */
const PELLET_MID = (HOLLOW_RES - 1) / 2;
const PELLET_FAR = 2 * PELLET_MID * PELLET_MID;

/**
 * Lowers the hollow samples of cell i to a casting's mound (spec 4.2): HOLLOW_MOUND_R x 0.30 deep
 * (u behind the face) at the casting's middle (`edge255` 0) up to x 0.55 at its edge (255). Each
 * cell is a pellet, raised in its middle and up to HOLLOW_PELLET deeper at its edges, so the mound
 * reads as a granular lump (lit tops, shadowed gaps), plus a little grain. It only ever lowers, and
 * marks what it lowers in the castings' own dirty rectangle (hollowCastDirty).
 * `edge255` is an integer so no double is passed (boxed).
 */
export function fillHollowCell(g: SoilGrid, i: number, edge255: number): void {
  const cr = Math.floor(i / GRID_W);
  const cc = i - cr * GRID_W;
  const scale = 255 / HOLLOW_MAX;
  const base = HOLLOW_MOUND_R * (0.3 + (0.25 * edge255) / 255);
  const dirty = g.hollowCastDirty;
  for (let a = 0; a < HOLLOW_RES; a++) {
    const row = cr * HOLLOW_RES + a;
    for (let b = 0; b < HOLLOW_RES; b++) {
      const c = cc * HOLLOW_RES + b;
      const k = row * HOLLOW_W + c;
      // murmur3's finalizer: neighbouring samples get unrelated grain.
      let h = k ^ 0x9e3779b9;
      h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
      h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
      h ^= h >>> 16;
      const grain = ((h >>> 24) / 255 - 0.5) * 0.015;
      const pellet = (HOLLOW_PELLET * ((a - PELLET_MID) * (a - PELLET_MID) + (b - PELLET_MID) * (b - PELLET_MID))) / PELLET_FAR;
      const level = Math.max(0, Math.round((base + pellet + grain) * scale));
      if (g.hollow[k] > level) {
        g.hollow[k] = level;
        markHollow(dirty, c, row);
      }
    }
  }
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
