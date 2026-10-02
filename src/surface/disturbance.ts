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
 * Stamps one body point at (x, z): nearer cells get its body nearness (the drape) and, where it is
 * the nearest path yet, its path nearness and a fresh trail. A cell nearer an older path keeps that
 * path and its fading trail. `under` 1 is a segment under the leaves; on top (0) it reaches less
 * far, as if ON_TOP_DISTANCE away. Values only rise, so stamping twice is the same as once.
 */
export function stamp(m: DisturbanceMap, x: number, z: number, under: number): void {
  const d = m.data;
  const off = (1 - under) * ON_TOP_DISTANCE;
  const range = DIST_REACH - off;
  if (range <= 0) return;
  const reach = Math.ceil(range / DIST_CELL);
  const i0 = Math.floor(x / DIST_CELL) - m.ci;
  const j0 = Math.floor(z / DIST_CELL) - m.cj;
  for (let j = Math.max(0, j0 - reach); j <= Math.min(DIST_N - 1, j0 + reach); j++) {
    const cz = (m.cj + j + 0.5) * DIST_CELL - z;
    for (let i = Math.max(0, i0 - reach); i <= Math.min(DIST_N - 1, i0 + reach); i++) {
      const cx = (m.ci + i + 0.5) * DIST_CELL - x;
      const d2 = cx * cx + cz * cz;
      if (d2 >= range * range) continue;
      const near = 1 - (Math.sqrt(d2) + off) / DIST_REACH;
      const k = (j * DIST_N + i) * K;
      if (near > d[k + 2]) d[k + 2] = near;
      if (near >= d[k]) {
        d[k] = near;
        d[k + 3] = 1;
      }
    }
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

/** Packs the map into RGBA bytes for the leaf shaders: R path, G 0, B body, A trail (0..255). */
export function packDisturbance(m: DisturbanceMap, out: Uint8Array): void {
  const d = m.data;
  for (let k = 0; k < d.length; k += K) {
    out[k] = byte(d[k]);
    out[k + 1] = 0;
    out[k + 2] = byte(d[k + 2]);
    out[k + 3] = byte(d[k + 3]);
  }
}
