/** Integer lattice hash -> [0, 1). Deterministic for a given seed. */
function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const wrap = (i: number, period: number): number => ((i % period) + period) % period;

/**
 * Smooth 2D value noise in [0, 1]. With `period` (an integer lattice period) it tiles,
 * which is what the shared noise DataTexture needs. `periodY` lets the two axes tile at
 * different lattice periods (for stretched brush strokes).
 */
export function valueNoise2(x: number, y: number, seed: number, period = 0, periodY = period): number {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const tx = x - fx;
  const ty = y - fy;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const x0 = period ? wrap(fx, period) : fx;
  const y0 = periodY ? wrap(fy, periodY) : fy;
  const x1 = period ? wrap(fx + 1, period) : fx + 1;
  const y1 = periodY ? wrap(fy + 1, periodY) : fy + 1;
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Fractal sum of `octaves` value-noise layers, normalised to [0, 1]. Tiles if period > 0. */
export function fbm2(x: number, y: number, octaves: number, seed: number, period = 0): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise2(x * f, y * f, seed + o * 101, period ? period * f : 0);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}
