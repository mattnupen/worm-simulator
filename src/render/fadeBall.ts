import { OCC_FRONT, OCC_REACH } from './occlusion';

/**
 * What the fade (occlusion.ts) sees this frame, for CPU tests of whole parts (leaves, ground cells):
 * the view matrix (column-major), occluderSegments' segments and count, and the body's farthest
 * kept view depth (uOccDepth). The world fills it once per rendered frame.
 */
export interface FadeFrame {
  view: ArrayLike<number>;
  seg: ArrayLike<number>;
  count: number;
  far: number;
}

/**
 * Whether the fade (occlusion()) may drop any pixel of the ball at world (x, y, z), radius r. A
 * pixel fades only where its nearest segment in occlusion()'s measure (tan-space miss over inverse
 * depth) lies within OCC_REACH of it and more than OCC_FRONT farther than the pixel; so this asks,
 * per segment, whether some point of the ball could be both (ballTest). Conservative: a ball it
 * rejects has no pixel the fade drops. Allocates nothing.
 */
export function ballMayFade(f: FadeFrame, x: number, y: number, z: number, r: number): boolean {
  return ballTest(f, x, y, z, r, true);
}

/**
 * Whether the ball at world (x, y, z), radius r, may show through the hole over the worm: some
 * point of it lies, on screen, within OCC_REACH of one of the body's segments in occlusion()'s
 * measure, where the top of the litter in front of it may fade, at any depth (ballMayFade without
 * its depth test). What lies under the top of the litter (the worm's pocket) and is rejected here
 * is hidden by it on every pixel. Conservative, as ballMayFade. Allocates nothing.
 */
export function ballInHole(f: FadeFrame, x: number, y: number, z: number, r: number): boolean {
  return ballTest(f, x, y, z, r, false);
}

/**
 * The tests above. Every point of the ball projects within rr = r * sqrt(1 + |t|^2) / (depth - r) of
 * its centre's tan-space point t, so its distance from a segment is at least the centre's, q, less
 * rr; and the point of the segment nearest it (the parameter occlusion() clamps) lies within rr
 * times 1 / |AB| of the centre's parameter, so its inverse depth lies between the segment's values
 * at those two ends. A pixel of the ball fades only if, for its nearest segment, (q - rr) over the
 * larger of them is under OCC_REACH and (`front`) the ball's nearest depth is OCC_FRONT short of the
 * segment's farthest depth there.
 */
function ballTest(f: FadeFrame, x: number, y: number, z: number, r: number, front: boolean): boolean {
  const { view, seg, count } = f;
  if (count === 0) return false;
  const d = -(view[2] * x + view[6] * y + view[10] * z + view[14]);
  // Wholly behind the camera, or (the fade's test) wholly behind the whole body.
  if (d + r < 0.05 || (front && d - r >= f.far - OCC_FRONT)) return false;
  const near = d - r;
  if (near < 0.05) return true;
  const tx = (view[0] * x + view[4] * y + view[8] * z + view[12]) / d;
  const ty = (view[1] * x + view[5] * y + view[9] * z + view[13]) / d;
  const rr = (r * Math.sqrt(1 + tx * tx + ty * ty)) / near;
  for (let i = 0; i < count; i++) {
    const o = i * 8;
    const abx = seg[o + 4] - seg[o];
    const aby = seg[o + 5] - seg[o + 1];
    const raw = ((tx - seg[o]) * abx + (ty - seg[o + 1]) * aby) * seg[o + 3];
    const u = Math.min(1, Math.max(0, raw));
    const q = Math.hypot(tx - seg[o] - abx * u, ty - seg[o + 1] - aby * u);
    const du = rr * Math.sqrt(seg[o + 3]);
    const ia = seg[o + 2];
    const ib = seg[o + 6];
    const i0 = ia + (ib - ia) * Math.min(1, Math.max(0, raw - du));
    const i1 = ia + (ib - ia) * Math.min(1, Math.max(0, raw + du));
    if ((q - rr) / Math.max(i0, i1) >= OCC_REACH) continue;
    if (front && near >= 1 / Math.min(i0, i1) - OCC_FRONT) continue;
    return true;
  }
  return false;
}
