import { fbm2, valueNoise2 } from '../core/noise';
import { mulberry32 } from '../core/random';
import { floorHeight, litterTopHeight } from '../surface/litterDepth';
import { PLAY_HALF, WORLD_HALF } from '../surface/terrain';
import { THICKNESS_U, LAYER, type LayerId } from './layers';
import { faceEndRoom } from './cutFrame';

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
/** The playable slab stays this far inside the worm's play area... */
export const PLAY_MARGIN = 0.5;
/**
 * ...and this far inside the drawn face's ends (where the world's edge clips the face), so the
 * Wide camera can show the head at the playable end with the layer names beyond it, on screens
 * from 9:16 to 16:9 (cutFrame.ts; 3.6 u at 16:9).
 */
export const FACE_END_ROOM = Math.max(faceEndRoom(16 / 9), faceEndRoom(9 / 16));
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

/** murmur3's 32-bit finalizer: a bijection that spreads every input bit over the result. */
function mix32(v: number): number {
  let h = v >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * A seed for the slab dug at (x, z): the same spot always gives the same slab. Spots are taken on a
 * 0.5 u grid (digs closer than that share a slab); distinct cells get well-mixed, distinct seeds
 * (each cell number is mixed in turn, so neighbouring cells share no bits).
 */
export function slabSeed(x: number, z: number): number {
  return mix32(mix32(Math.round(x * 2) + 0x9e3779b9) + Math.round(z * 2));
}

/**
 * The u interval where the line ox + tx u, oz + tz u stays within |x|, |z| <= half, written to
 * `out` (allocates nothing, so digSpot.ts can call it every step).
 */
export function clipLine(ox: number, oz: number, tx: number, tz: number, half: number, out: [number, number]): void {
  let lo = -Infinity;
  let hi = Infinity;
  if (Math.abs(tx) >= 1e-9) {
    const a = (-half - ox) / tx;
    const b = (half - ox) / tx;
    lo = Math.min(a, b);
    hi = Math.max(a, b);
  }
  if (Math.abs(tz) >= 1e-9) {
    const a = (-half - oz) / tz;
    const b = (half - oz) / tz;
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
  }
  out[0] = lo;
  out[1] = hi;
}

/**
 * The playable and drawn u ranges of a cut through (x, z) along (tx, tz), into `out`: playLo,
 * playHi, faceLo, faceHi. The face is clipped to the world and its ends snapped inward to the
 * column grid (so u = 0, the entry, is always a column, and the cut along h and h + PI has the
 * same ends); the playable range to the play area and FACE_END_ROOM inside the face. Allocates nothing (digSpot.ts calls it every step).
 */
export function cutSpans(x: number, z: number, tx: number, tz: number, out: [number, number, number, number]): void {
  const span = clipSpan;
  clipLine(x, z, tx, tz, WORLD_HALF - 0.05, span);
  const faceLo = Math.ceil(Math.max(-SLAB_HALF - FACE_EXTRA, span[0]) / COLUMN_STEP) * COLUMN_STEP;
  const faceHi = Math.floor(Math.min(SLAB_HALF + FACE_EXTRA, span[1]) / COLUMN_STEP) * COLUMN_STEP;
  clipLine(x, z, tx, tz, PLAY_HALF - PLAY_MARGIN, span);
  out[0] = Math.max(-SLAB_HALF, span[0], faceLo + FACE_END_ROOM);
  out[1] = Math.min(SLAB_HALF, span[1], faceHi - FACE_END_ROOM);
  out[2] = faceLo;
  out[3] = faceHi;
}
const clipSpan: [number, number] = [0, 0];

/**
 * The slab for a dig at (x, z) with the worm heading `heading` (0 = +z), the camera on the side
 * `side` (+1: the normal (tz, -tx), -1: the other). Layer thicknesses vary along the cut within the
 * spec 5.1 ranges (THICKNESS_U), smoothly and irregularly, and differ from slab to slab. At u = 0
 * the F top is floorHeight and the L band is exactly litterTopHeight - floorHeight (spec 8.2).
 */
export function createSlab(x: number, z: number, heading: number, side: 1 | -1, seed: number): Slab {
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(heading)) {
    throw new Error(`createSlab needs a finite entry and heading, got (${x}, ${z}) heading ${heading}`);
  }
  const tx = Math.sin(heading);
  const tz = Math.cos(heading);
  const nx = side * tz;
  const nz = side * -tx;
  const spans: [number, number, number, number] = [0, 0, 0, 0];
  cutSpans(x, z, tx, tz, spans);
  const [playLo, playHi, faceLo, faceHi] = spans;
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
