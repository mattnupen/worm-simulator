/**
 * The leaf disturbance map (spec 5.3): a 96 x 96 grid covering 12 x 12 m around the worm, scrolled
 * in whole cells as it moves. It is sized for the biggest real-size leaves (Step 1b spec 4.3), and
 * stamps only as far as the leaves need (stampBody's `limit`). Each cell holds:
 * - path: nearness to the worm's path (1 on it, falling linearly to 0 DIST_REACH away), kept
 *   until the trail there has settled;
 * - (unused, 0);
 * - body: nearness to the body as it is now, re-stamped every step (the drape);
 * - trail: how fresh the path is (1 when made, halving every TRAIL_HALF_LIFE).
 * Nearness is linear in distance, so a leaf shader reads back how far a leaf is from the worm,
 * and from the next cells which way. Pure data and math, no WebGL; the renderer packs it into two
 * small textures once per frame.
 */
import type { Vec3 } from '../core/vec';

export const DIST_N = 96;
export const DIST_SPAN = 12;
export const DIST_CELL = DIST_SPAN / DIST_N;
/** The trail halves every 6 s, so it settles back in about 20 s. */
export const TRAIL_HALF_LIFE = 6;
/**
 * Nearness reaches this far (m): past the biggest leaf's radius (real size, about 3.1) plus the drape's
 * foot, with room for ON_TOP_DISTANCE (tests/unit/disturbance.test.ts). The map's span holds the body plus this on every side.
 */
export const DIST_REACH = 3.65;
/**
 * A segment riding on top of the litter counts as this much farther away, so leaves stay put: on
 * top, the body reaches only 0.2 m. This is the default for the whole map; the game passes its own
 * (leafScale.ts onTopDistance: 0.2 m past the biggest leaf), so a body partly under the litter
 * lifts the leaves as far as it should.
 */
export const ON_TOP_DISTANCE = DIST_REACH - 0.2;
/** A trail fresher than this is still settling; below it the cell is cleared. */
const TRAIL_GONE = 0.01;

/** Floats per cell: path, unused, body, trail. */
const K = 4;

export interface DisturbanceMap {
  /** DIST_N * DIST_N cells, row-major (z rows of x cells), K floats each. */
  readonly data: Float32Array;
  /** World cell index of the grid's first column (x) and first row (z). */
  ci: number;
  cj: number;
}

export function createDisturbance(): DisturbanceMap {
  return { data: new Float32Array(DIST_N * DIST_N * K), ci: -DIST_N / 2, cj: -DIST_N / 2 };
}

/** World x, z of the grid's corner (where cell 0, 0 starts). */
export function originX(m: DisturbanceMap): number {
  return m.ci * DIST_CELL;
}
export function originZ(m: DisturbanceMap): number {
  return m.cj * DIST_CELL;
}

/** Index of the first float of the cell holding world point (x, z), or -1 outside the grid. */
export function cellAt(m: DisturbanceMap, x: number, z: number): number {
  const i = Math.floor(x / DIST_CELL) - m.ci;
  const j = Math.floor(z / DIST_CELL) - m.cj;
  if (i < 0 || j < 0 || i >= DIST_N || j >= DIST_N) return -1;
  return (j * DIST_N + i) * K;
}

/**
 * Scrolls the grid in whole cells so (x, z) lies in its centre cell. Data moves with the grid
 * (each cell keeps its world place); newly exposed edge cells are cleared. Nothing doubles.
 */
export function recentre(m: DisturbanceMap, x: number, z: number): void {
  const ci = Math.floor(x / DIST_CELL) - DIST_N / 2;
  const cj = Math.floor(z / DIST_CELL) - DIST_N / 2;
  const dx = ci - m.ci;
  const dz = cj - m.cj;
  if (dx === 0 && dz === 0) return;
  m.ci = ci;
  m.cj = cj;
  const d = m.data;
  if (Math.abs(dx) >= DIST_N || Math.abs(dz) >= DIST_N) {
    d.fill(0);
    return;
  }
  const row = DIST_N * K;
  if (dz > 0) {
    d.copyWithin(0, dz * row);
    d.fill(0, (DIST_N - dz) * row);
  } else if (dz < 0) {
    d.copyWithin(-dz * row, 0, (DIST_N + dz) * row);
    d.fill(0, 0, -dz * row);
  }
  if (dx !== 0) {
    for (let j = 0; j < DIST_N; j++) {
      const r0 = j * row;
      if (dx > 0) {
        d.copyWithin(r0, r0 + dx * K, r0 + row);
        d.fill(0, r0 + (DIST_N - dx) * K, r0 + row);
      } else {
        d.copyWithin(r0 - dx * K, r0, r0 + (DIST_N + dx) * K);
        d.fill(0, r0, r0 - dx * K);
      }
    }
  }
}

/**
 * Stamps one stretch of body, the segment from (ax, az) to (bx, bz): every cell gets its nearness
 * to the nearest point of that segment (the drape) and, where it is the nearest path yet, that as
 * its path nearness and a fresh trail. A cell nearer an older path keeps that path and its fading
 * trail. `ua`, `ub`: how far under the leaves each end is (1 under, 0 on top), blended along the
 * segment; on top it reaches less far, as if `onTop` farther away. A cell is left alone when this
 * segment would read `limit` or more there even at its least offset (stampBody). Measured to the
 * segment, not to points along it, so a body gliding along its own line leaves the nearness beside
 * it level (points 11 cm apart scalloped it, and the leaves over it jittered). Values only rise, so
 * stamping twice is the same as once.
 */
export function stampSegment(
  m: DisturbanceMap, ax: number, az: number, bx: number, bz: number, ua: number, ub: number,
  limit = DIST_REACH, onTop = ON_TOP_DISTANCE,
): void {
  const d = m.data;
  // Past this, the segment reads `limit` or more (distance plus its least on-top offset): a cell
  // there could differ from the full map only where the full map reads that far too.
  const range = Math.min(limit, DIST_REACH) - (1 - Math.max(ua, ub)) * onTop;
  if (range <= 0) return;
  const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - range) / DIST_CELL) - m.ci);
  const i1 = Math.min(DIST_N - 1, Math.floor((Math.max(ax, bx) + range) / DIST_CELL) - m.ci);
  const j0 = Math.max(0, Math.floor((Math.min(az, bz) - range) / DIST_CELL) - m.cj);
  const j1 = Math.min(DIST_N - 1, Math.floor((Math.max(az, bz) + range) / DIST_CELL) - m.cj);
  const ex = bx - ax;
  const ez = bz - az;
  const len2 = ex * ex + ez * ez;
  for (let j = j0; j <= j1; j++) {
    const cz = (m.cj + j + 0.5) * DIST_CELL - az;
    for (let i = i0; i <= i1; i++) {
      const cx = (m.ci + i + 0.5) * DIST_CELL - ax;
      const t = len2 > 0 ? Math.min(1, Math.max(0, (cx * ex + cz * ez) / len2)) : 0;
      const px = cx - ex * t;
      const pz = cz - ez * t;
      const dist = Math.sqrt(px * px + pz * pz);
      if (dist >= range) continue;
      const off = (1 - (ua + (ub - ua) * t)) * onTop;
      const near = 1 - (dist + off) / DIST_REACH;
      if (near <= 0) continue;
      const k = (j * DIST_N + i) * K;
      if (near > d[k + 2]) d[k + 2] = near;
      if (near >= d[k]) {
        d[k] = near;
        d[k + 3] = 1;
      }
    }
  }
}

/** Stamps one body point at (x, z): a segment of no length (see stampSegment). */
export function stamp(
  m: DisturbanceMap, x: number, z: number, under: number, limit = DIST_REACH, onTop = ON_TOP_DISTANCE,
): void {
  stampSegment(m, x, z, x, z, under, under, limit, onTop);
}

/**
 * Stamps the whole body: the segments joining consecutive body points (x, z of each, in order),
 * each end as far under the leaves as `under` says for that point. Cells `limit` or more from the
 * body stay empty: the game passes how far its leaves need it (leafScale.ts stampLimit:
 * their reach plus a lookup's spread, so every lookup a reacting leaf takes reads only stamped
 * cells), which saves most of the work. `onTop`: how much farther a segment on top counts as
 * (leafScale.ts onTopDistance).
 */
export function stampBody(
  m: DisturbanceMap, body: readonly Vec3[], under: ArrayLike<number>, limit = DIST_REACH, onTop = ON_TOP_DISTANCE,
): void {
  for (let i = 0; i + 1 < body.length; i++) {
    stampSegment(m, body[i].x, body[i].z, body[i + 1].x, body[i + 1].z, under[i], under[i + 1], limit, onTop);
  }
}

/**
 * Advances time: trails fade (halving every TRAIL_HALF_LIFE; a settled one is cleared, path and
 * all) and the body nearness empties, ready for this step's stamps.
 */
export function decay(m: DisturbanceMap, dt: number): void {
  const slow = Math.pow(0.5, dt / TRAIL_HALF_LIFE);
  const d = m.data;
  for (let k = 0; k < d.length; k += K) {
    d[k + 2] = 0;
    const t = d[k + 3] * slow;
    if (t < TRAIL_GONE) {
      d[k] = 0;
      d[k + 3] = 0;
    } else {
      d[k + 3] = t;
    }
  }
}

export function clearDisturbance(m: DisturbanceMap): void {
  m.data.fill(0);
}

const byte = (v: number): number => Math.round(255 * Math.max(0, Math.min(1, v)));

/** Packs v (0..1) as two bytes at out[k] (high) and out[k + 1] (low): v = (hi + lo / 255) / 255. */
function twoBytes(v: number, out: Uint8Array, k: number): void {
  const b = 255 * Math.max(0, Math.min(1, v));
  const hi = Math.floor(b);
  out[k] = hi;
  out[k + 1] = Math.round((b - hi) * 255);
}

/**
 * Packs the map for the leaf shaders into two byte textures:
 * - `near` (RGBA, 4 bytes a cell): path and body nearness, two bytes each (R + G / 255 and
 *   B + A / 255, as 0..1 values), to within 1/65000. One byte each rounded them in 6 mm steps
 *   that the leaves stepped with. Filtering is linear, so the two bytes filter as one value.
 * - `trail` (RG, 2 bytes a cell): the trail, and the path again in one byte (for the ground).
 * (Half floats would hold all three in one texture, but cost 4% fps in the software-rendered gates.)
 */
export function packDisturbance(m: DisturbanceMap, near: Uint8Array, trail: Uint8Array): void {
  const d = m.data;
  for (let k = 0, c = 0; k < d.length; k += K, c += 2) {
    twoBytes(d[k], near, k);
    twoBytes(d[k + 2], near, k + 2);
    trail[c] = byte(d[k + 3]);
    trail[c + 1] = byte(d[k]);
  }
}
