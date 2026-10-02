/**
 * The leaf disturbance map (spec 5.3): a 64 x 64 grid covering 8 x 8 m, centred on the worm and
 * scrolled in whole cells as it moves. Each cell holds an outward push (x, z), a lift (the
 * drape over a body under the leaves) and a trail (how recently it was disturbed). Pure data
 * and math, no WebGL; the renderer packs it into a small texture once per frame.
 */
export const DIST_N = 64;
export const DIST_SPAN = 8;
export const DIST_CELL = DIST_SPAN / DIST_N;
/** Push and trail halve every 6 s, so a trail settles back in about 20 s. */
export const TRAIL_HALF_LIFE = 6;
/** The drape falls back fast behind the body, so it follows the worm instead of leaving a hump. */
export const LIFT_HALF_LIFE = 0.3;
/** Cells within this of a body point are under the body. */
export const BODY_R = 0.12;
/** Leaves beside the body are pushed out to this distance. */
export const PUSH_R = 0.32;

/** Floats per cell: push x, push z, lift, trail. */
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

const smoothstep = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Stamps one body point at (x, z), its spine running along unit (tx, tz). Cells under the body
 * get lift (more when `under` is high: the leaves drape over it) and every nearby cell gets a
 * push away from the spine and a fresh trail. `strength` 1 is the head (it stamps hardest).
 * Values only ever rise to the new stamp (max), so stamping twice is the same as once.
 */
export function stamp(
  m: DisturbanceMap, x: number, z: number, tx: number, tz: number, strength: number, under: number,
): void {
  const d = m.data;
  const reach = Math.ceil(PUSH_R / DIST_CELL);
  const i0 = Math.floor(x / DIST_CELL) - m.ci;
  const j0 = Math.floor(z / DIST_CELL) - m.cj;
  const lift = strength * (0.15 + 0.85 * under);
  for (let j = Math.max(0, j0 - reach); j <= Math.min(DIST_N - 1, j0 + reach); j++) {
    for (let i = Math.max(0, i0 - reach); i <= Math.min(DIST_N - 1, i0 + reach); i++) {
      const cx = (m.ci + i + 0.5) * DIST_CELL - x;
      const cz = (m.cj + j + 0.5) * DIST_CELL - z;
      const dist = Math.hypot(cx, cz);
      if (dist >= PUSH_R) continue;
      const k = (j * DIST_N + i) * K;
      // Signed distance across the spine (which side of the body the cell is on).
      const side = cx * tz - cz * tx;
      const push = strength * (1 - smoothstep(BODY_R * 0.5, PUSH_R, dist)) * Math.min(1, Math.abs(side) / BODY_R);
      if (push > Math.hypot(d[k], d[k + 1])) {
        const s = side >= 0 ? 1 : -1;
        d[k] = tz * s * push;
        d[k + 1] = -tx * s * push;
      }
      d[k + 2] = Math.max(d[k + 2], lift * (1 - smoothstep(BODY_R * 0.6, BODY_R * 1.4, dist)));
      d[k + 3] = Math.max(d[k + 3], strength * (1 - smoothstep(BODY_R, PUSH_R, dist)));
    }
  }
}

/** Every cell eases back toward zero: push and trail with TRAIL_HALF_LIFE, lift with LIFT_HALF_LIFE. */
export function decay(m: DisturbanceMap, dt: number): void {
  const slow = Math.pow(0.5, dt / TRAIL_HALF_LIFE);
  const fast = Math.pow(0.5, dt / LIFT_HALF_LIFE);
  const d = m.data;
  for (let k = 0; k < d.length; k += K) {
    d[k] *= slow;
    d[k + 1] *= slow;
    d[k + 2] *= fast;
    d[k + 3] *= slow;
  }
}

export function clearDisturbance(m: DisturbanceMap): void {
  m.data.fill(0);
}

/**
 * Packs the map into RGBA bytes for the leaf shaders: R, G = push x, z as 128 + 127 * v (so 0
 * is exactly 128), B = lift, A = trail (0..255).
 */
export function packDisturbance(m: DisturbanceMap, out: Uint8Array): void {
  const d = m.data;
  for (let k = 0; k < d.length; k += K) {
    out[k] = Math.round(128 + 127 * Math.max(-1, Math.min(1, d[k])));
    out[k + 1] = Math.round(128 + 127 * Math.max(-1, Math.min(1, d[k + 1])));
    out[k + 2] = Math.round(255 * Math.max(0, Math.min(1, d[k + 2])));
    out[k + 3] = Math.round(255 * Math.max(0, Math.min(1, d[k + 3])));
  }
}
