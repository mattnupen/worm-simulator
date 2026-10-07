import { OCC_REACH, OCC_SEGMENTS } from './occlusion';
import { OCC_TILES } from './groundUniforms';

/**
 * The fade's segment search, narrowed per screen tile (occlusion.ts).
 *
 * occlusion() looks for the body segment nearest a pixel, in its miss (tan-space distance over
 * inverse depth), among all of them, at every pixel of a fading surface in the fade's screen box:
 * with the buried worm's funnel that box covers much of the screen, and the search was the fade's
 * main cost. So each frame the CPU cuts the box into OCC_TILES x OCC_TILES tiles and works out, per
 * tile, which segments can be the nearest for any of its pixels:
 * - every pixel of the tile lies within its half-diagonal hd of the tile's centre c, so its distance
 *   from a segment is the centre's, q, give or take hd; over the segment's inverse depths, its miss
 *   lies between (q - hd) / max and (q + hd) / min;
 * - a segment whose lower bound exceeds another's upper bound is never the nearest, and one whose
 *   lower bound reaches OCC_REACH cannot fade a pixel even if it is (occlusion() is 0 past it).
 * The lowest to highest index left is packed into the tile's byte of the ivec4 uniform array
 * uOccTiles (lo, hi; lo > hi: none; occlusion.ts occTileRange unpacks it), and the pixel searches
 * only those: the same nearest segment wherever the fade is not 0, so the fade is
 * unchanged, pixel for pixel. A tile far from the body searches nothing.
 */

/** A pixel lies at most this far (NDC) outside the tile the shader's lookup picks (rounding). */
const PAD = 1e-4;

/**
 * Writes each tile's segment range for the `count` segments in seg (occluderSegments' output) over
 * the NDC box (xmin, ymin, xmax, ymax), with the projection's p00 and p11: tile k = j * OCC_TILES + i
 * (row j holding NDC y from box[1] up) as the byte lo | hi << 4 (15, 0 for none) at bits 8 (k % 4)
 * of out[k / 4] (groundUniforms.ts occTileWords). Allocates nothing.
 */
export function occlusionTiles(
  seg: ArrayLike<number>, count: number, box: ArrayLike<number>, p00: number, p11: number, out: Int32Array,
): void {
  out.fill(0);
  const w = (box[2] - box[0]) / OCC_TILES;
  const h = (box[3] - box[1]) / OCC_TILES;
  // Half the tile's diagonal in tan space, padded for the lookup's rounding (and far above any
  // rounding in the distances below).
  const hw = (w / 2 + PAD) / p00;
  const hh = (h / 2 + PAD) / p11;
  const hd = Math.sqrt(hw * hw + hh * hh);
  for (let j = 0; j < OCC_TILES; j++) {
    for (let i = 0; i < OCC_TILES; i++) {
      const cx = (box[0] + (i + 0.5) * w) / p00;
      const cy = (box[1] + (j + 0.5) * h) / p11;
      let up = 1e9;
      for (let s = 0; s < count; s++) {
        const o = s * 8;
        miss[s] = centreMiss(cx, cy, seg, o);
        up = Math.min(up, (miss[s] + hd) / Math.min(seg[o + 2], seg[o + 6]));
      }
      let lo = 15;
      let hi = 0;
      for (let s = 0; s < count; s++) {
        const o = s * 8;
        const low = (miss[s] - hd) / Math.max(seg[o + 2], seg[o + 6]);
        if (low <= up && low < OCC_REACH) {
          lo = Math.min(lo, s);
          hi = s;
        }
      }
      const k = j * OCC_TILES + i;
      out[k >> 2] |= (lo | (hi << 4)) << ((k & 3) * 8);
    }
  }
}

/** Per segment, the tile centre's distance from it (reused). */
const miss = new Float64Array(OCC_SEGMENTS);

/** Tan-space distance from (tx, ty) to segment o of seg. */
function centreMiss(tx: number, ty: number, seg: ArrayLike<number>, o: number): number {
  const abx = seg[o + 4] - seg[o];
  const aby = seg[o + 5] - seg[o + 1];
  const u = Math.min(1, Math.max(0, ((tx - seg[o]) * abx + (ty - seg[o + 1]) * aby) * seg[o + 3]));
  const qx = tx - seg[o] - abx * u;
  const qy = ty - seg[o + 1] - aby * u;
  return Math.sqrt(qx * qx + qy * qy);
}

/**
 * TS twin of the shader's tile fetch (occlusion.ts OCC_TILE_GLSL): the range (lo, hi) the pixel at NDC (x, y)
 * searches, into `out`; lo > hi for none.
 */
export function tileRange(x: number, y: number, box: ArrayLike<number>, tiles: Int32Array, out: number[]): void {
  const i = Math.min(OCC_TILES - 1, Math.max(0, Math.floor(((x - box[0]) / (box[2] - box[0])) * OCC_TILES)));
  const j = Math.min(OCC_TILES - 1, Math.max(0, Math.floor(((y - box[1]) / (box[3] - box[1])) * OCC_TILES)));
  const k = j * OCC_TILES + i;
  const b = (tiles[k >> 2] >> ((k & 3) * 8)) & 255;
  out[0] = b & 15;
  out[1] = b >> 4;
}
