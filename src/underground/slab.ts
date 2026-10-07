import { fbm2, valueNoise2 } from '../core/noise';
import { mulberry32 } from '../core/random';
import { floorHeight, litterTopHeight } from '../surface/litterDepth';
import { PLAY_HALF, WORLD_HALF } from '../surface/terrain';
import { THICKNESS_U, LAYER, type LayerId } from './layers';

/**
 * The cutaway (V2 spec 4.1, 5.1): a vertical plane through the dig-down point along the worm's
 * heading, fixed for the visit. Points in it are (u, v): u along the cut from the entry, v the
 * world height. Pure and deterministic per seed.
 */

/** The playable slab: 16 u wide (about 70 cm), centred on the entry... */
export const SLAB_HALF = 8;
/** ...and 12 u deep (about 50 cm) below the litter top at the entry. */
export const SLAB_DEPTH = 12;
/** The drawn face runs this much farther along the cut than the playable slab, so no view shows its end. */
export const FACE_EXTRA = 6;
/** Spacing (u) of the face's columns: boundary depths are sampled here and drawn linearly between. */
export const COLUMN_STEP = 0.125;
/** The playable slab stays this far inside the worm's play area. */
const PLAY_MARGIN = 0.5;
/** Boundaries stored per column: litter top, then the tops of F, H, A, E and B. */
export const BOUNDS = 6;
export const B_TOP = 0;
export const B_F = 1;
export const B_H = 2;
export const B_A = 3;
export const B_E = 4;
export const B_B = 5;

export interface Slab {
  readonly seed: number;
  /** The entry point on the ground (world x, z). */
  readonly ox: number;
  readonly oz: number;
  /** Unit vector along the cut (the heading at the dig), and the unit normal toward the camera's side. */
  readonly tx: number;
  readonly tz: number;
  readonly nx: number;
  readonly nz: number;
  /** u range the worm may dig in, and the drawn face's u range (both clipped to the world). */
  readonly playLo: number;
  readonly playHi: number;
  readonly faceLo: number;
  readonly faceHi: number;
  /** World height of the slab's bottom. */
  readonly bottom: number;
  /** Highest litter top along the drawn face. */
  readonly topMax: number;
  /** Columns from faceLo every COLUMN_STEP; BOUNDS heights each (world y). */
  readonly cols: number;
  readonly bounds: Float32Array;
}

/** A seed for the slab dug at (x, z): the same spot always gives the same slab. */
export function slabSeed(x: number, z: number): number {
  return (Math.imul(Math.round(x * 2), 73856093) ^ Math.imul(Math.round(z * 2), 19349663)) >>> 0;
}

/** The u interval where the line ox + tx u, oz + tz u stays within |x|, |z| <= half. */
function clipLine(ox: number, oz: number, tx: number, tz: number, half: number, out: [number, number]): void {
  let lo = -Infinity;
  let hi = Infinity;
  for (const [o, t] of [[ox, tx], [oz, tz]] as const) {
    if (Math.abs(t) < 1e-9) continue;
    const a = (-half - o) / t;
    const b = (half - o) / t;
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
  }
  out[0] = lo;
  out[1] = hi;
}

/**
 * The slab for a dig at (x, z) with the worm heading `heading` (0 = +z), the camera on the side
 * `side` (+1: the normal (tz, -tx), -1: the other). Layer thicknesses vary along the cut within the
 * spec 5.1 ranges (THICKNESS_U), smoothly and irregularly, and differ from slab to slab. At u = 0
 * the F top is floorHeight and the L band is exactly litterTopHeight - floorHeight (spec 8.2).
 */
export function createSlab(x: number, z: number, heading: number, side: 1 | -1, seed: number): Slab {
  const tx = Math.sin(heading);
  const tz = Math.cos(heading);
  const nx = side * tz;
  const nz = side * -tx;
  const span: [number, number] = [0, 0];
  clipLine(x, z, tx, tz, PLAY_HALF - PLAY_MARGIN, span);
  const playLo = Math.max(-SLAB_HALF, span[0]);
  const playHi = Math.min(SLAB_HALF, span[1]);
  clipLine(x, z, tx, tz, WORLD_HALF - 0.05, span);
  const faceLo = Math.max(-SLAB_HALF - FACE_EXTRA, span[0]);
  const faceHi = Math.min(SLAB_HALF + FACE_EXTRA, span[1]);
  const cols = Math.floor((faceHi - faceLo) / COLUMN_STEP) + 1;
  const bounds = new Float32Array(cols * BOUNDS);
  const rand = mulberry32(seed);
  // Each boundary keeps a slab-wide bias (this hole is a bit thicker or thinner overall)...
  const bias = THICKNESS_U.map(() => rand());
  const offs = THICKNESS_U.map(() => rand() * 100);
  let topMax = -Infinity;
  for (let c = 0; c < cols; c++) {
    const u = faceLo + c * COLUMN_STEP;
    const wx = x + tx * u;
    const wz = z + tz * u;
    const o = c * BOUNDS;
    const top = litterTopHeight(wx, wz);
    bounds[o + B_TOP] = top;
    let y = floorHeight(wx, wz);
    bounds[o + B_F] = y;
    for (let k = 0; k < THICKNESS_U.length; k++) {
      // ...plus slow swells and a little wobble along the cut, never outside the layer's range.
      const n = 0.45 * bias[k] + 0.4 * fbm2(u * 0.45 + offs[k], k * 7.3, 3, seed + k) + 0.15 * valueNoise2(u * 2.5, offs[k], seed + 31 * k);
      const [lo, hi] = THICKNESS_U[k];
      y -= lo + (hi - lo) * Math.min(1, Math.max(0, n));
      bounds[o + B_F + 1 + k] = y;
    }
    if (top > topMax) topMax = top;
  }
  const bottom = litterTopHeight(x, z) - SLAB_DEPTH;
  return { seed, ox: x, oz: z, tx, tz, nx, nz, playLo, playHi, faceLo, faceHi, bottom, topMax, cols, bounds };
}

/** Boundary `k` (B_TOP .. B_B) at u, linear between columns (as the face draws it). */
export function boundaryAt(s: Slab, k: number, u: number): number {
  const f = Math.min(s.cols - 1, Math.max(0, (u - s.faceLo) / COLUMN_STEP));
  const c = Math.min(s.cols - 2, Math.floor(f));
  const t = f - c;
  const a = s.bounds[c * BOUNDS + k];
  const b = s.bounds[(c + 1) * BOUNDS + k];
  return a + (b - a) * t;
}

/** The layer at (u, v), or -1 above the litter top. */
export function layerAt(s: Slab, u: number, v: number): LayerId | -1 {
  if (v > boundaryAt(s, B_TOP, u)) return -1;
  // The boundary indices B_F .. B_B are the layer ids F .. B (the top of each layer).
  for (let k = B_B; k >= B_F; k--) {
    if (v <= boundaryAt(s, k, u)) return k as LayerId;
  }
  return LAYER.L;
}

/** World x, z of the slab point at u (y is v itself). */
export function slabX(s: Slab, u: number): number {
  return s.ox + s.tx * u;
}
export function slabZ(s: Slab, u: number): number {
  return s.oz + s.tz * u;
}

/** u of the world point (x, z) projected onto the cut. */
export function slabU(s: Slab, x: number, z: number): number {
  return (x - s.ox) * s.tx + (z - s.oz) * s.tz;
}
