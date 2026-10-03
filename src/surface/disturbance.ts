/**
 * The leaf disturbance map (spec 5.3): a 64 x 64 grid covering 8 x 8 m around the worm, scrolled
 * in whole cells as it moves. Each cell holds:
 * - path: nearness to the worm's path (1 on it, falling linearly to 0 DIST_REACH away), kept
 *   until the trail there has settled;
 * - (unused, 0);
 * - body: nearness to the body as it is now, re-stamped every step (the drape);
 * - trail: how fresh the path is (1 when made, halving every TRAIL_HALF_LIFE).
 * Nearness is linear in distance, so a leaf shader reads back how far a leaf is from the worm,
 * and from the next cells which way. Pure data and math, no WebGL; the renderer packs it into a
 * small texture once per frame.
 */
import { DataUtils } from 'three';
import type { Vec3 } from '../core/vec';

export const DIST_N = 64;
export const DIST_SPAN = 8;
export const DIST_CELL = DIST_SPAN / DIST_N;
/** The trail halves every 6 s, so it settles back in about 20 s. */
export const TRAIL_HALF_LIFE = 6;
/** Nearness reaches this far (m): past the biggest leaf's radius plus the drape's foot. */
export const DIST_REACH = 1.6;
/** A segment riding on top of the litter counts as this much farther away, so leaves stay put. */
export const ON_TOP_DISTANCE = 1.4;
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
 * segment; on top it reaches less far, as if ON_TOP_DISTANCE away. Measured to the segment, not to
 * points along it, so a body gliding along its own line leaves the nearness beside it level
 * (points 11 cm apart scalloped it, and the leaves over it jittered). Values only rise, so
 * stamping twice is the same as once.
 */
export function stampSegment(
  m: DisturbanceMap, ax: number, az: number, bx: number, bz: number, ua: number, ub: number,
): void {
  const d = m.data;
  const range = DIST_REACH - (1 - Math.max(ua, ub)) * ON_TOP_DISTANCE;
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
      const off = (1 - (ua + (ub - ua) * t)) * ON_TOP_DISTANCE;
      const near = 1 - (Math.sqrt(px * px + pz * pz) + off) / DIST_REACH;
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
export function stamp(m: DisturbanceMap, x: number, z: number, under: number): void {
  stampSegment(m, x, z, x, z, under, under);
}

/**
 * Stamps the whole body: the segments joining consecutive body points (x, z of each, in order),
 * each end as far under the leaves as `under` says for that point.
 */
export function stampBody(m: DisturbanceMap, body: readonly Vec3[], under: ArrayLike<number>): void {
  for (let i = 0; i + 1 < body.length; i++) {
    stampSegment(m, body[i].x, body[i].z, body[i + 1].x, body[i + 1].z, under[i], under[i + 1]);
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

const half = (v: number): number => DataUtils.toHalfFloat(Math.max(0, Math.min(1, v)));

/**
 * Packs the map into RGBA half floats for the leaf shaders: R path, G 0, B body, A trail (0..1).
 * Half floats keep nearness to within 1/2048 (under 1 mm of distance); bytes rounded it to 6 mm,
 * and the leaves stepped with it. They filter linearly in WebGL2 core.
 */
export function packDisturbance(m: DisturbanceMap, out: Uint16Array): void {
  const d = m.data;
  for (let k = 0; k < d.length; k += K) {
    out[k] = half(d[k]);
    out[k + 1] = 0;
    out[k + 2] = half(d[k + 2]);
    out[k + 3] = half(d[k + 3]);
  }
}

/**
 * The world x, z box (min x, min z, max x, max z) outside which the map moves no leaf: every cell
 * holding anything, grown by one cell. A leaf moves only where the lookup at its anchor reads a
 * fresh trail (A) or the body (B), and a bilinear lookup reads only cells whose centres are within
 * a cell of it. Empty (Infinity, Infinity, -Infinity, -Infinity) when the map is clear. Allocates
 * nothing.
 */
export function disturbedBox(m: DisturbanceMap, out: number[] | Float32Array): void {
  const d = m.data;
  let i0 = DIST_N;
  let j0 = DIST_N;
  let i1 = -1;
  let j1 = -1;
  for (let j = 0; j < DIST_N; j++) {
    for (let i = 0; i < DIST_N; i++) {
      const k = (j * DIST_N + i) * K;
      if (d[k] === 0 && d[k + 2] === 0 && d[k + 3] === 0) continue;
      if (i < i0) i0 = i;
      if (i > i1) i1 = i;
      if (j < j0) j0 = j;
      if (j > j1) j1 = j;
    }
  }
  if (i1 < 0) {
    out[0] = Infinity;
    out[1] = Infinity;
    out[2] = -Infinity;
    out[3] = -Infinity;
    return;
  }
  out[0] = (m.ci + i0 - 1) * DIST_CELL;
  out[1] = (m.cj + j0 - 1) * DIST_CELL;
  out[2] = (m.ci + i1 + 2) * DIST_CELL;
  out[3] = (m.cj + j1 + 2) * DIST_CELL;
}
