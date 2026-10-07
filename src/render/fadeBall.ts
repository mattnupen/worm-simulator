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
 * Whether the fade (occlusion()) may drop any pixel of the ball at world (x, y, z), radius r: some
 * point of it lies, on screen, within OCC_REACH of one of the body's segments in occlusion()'s
 * measure (tan-space miss over inverse depth), and nearer than the body's farthest kept depth less
 * OCC_FRONT. Conservative: a ball it rejects has no pixel the fade drops (every point of the ball
 * projects within r * sqrt(1 + |t|^2) / (depth - r) of its centre's tan-space point t). Allocates
 * nothing.
 */
export function ballMayFade(f: FadeFrame, x: number, y: number, z: number, r: number): boolean {
  const { view, seg, count } = f;
  if (count === 0) return false;
  const d = -(view[2] * x + view[6] * y + view[10] * z + view[14]);
  // Wholly behind the camera, or wholly behind the whole body: nothing to fade.
  if (d + r < 0.05 || d - r >= f.far - OCC_FRONT) return false;
  const near = d - r;
  if (near < 0.05) return true;
  const tx = (view[0] * x + view[4] * y + view[8] * z + view[12]) / d;
  const ty = (view[1] * x + view[5] * y + view[9] * z + view[13]) / d;
  const rr = (r * Math.sqrt(1 + tx * tx + ty * ty)) / near;
  for (let i = 0; i < count; i++) {
    const o = i * 8;
    const abx = seg[o + 4] - seg[o];
    const aby = seg[o + 5] - seg[o + 1];
    const u = Math.min(1, Math.max(0, ((tx - seg[o]) * abx + (ty - seg[o + 1]) * aby) * seg[o + 3]));
    const q = Math.hypot(tx - seg[o] - abx * u, ty - seg[o + 1] - aby * u);
    if ((q - rr) / Math.max(seg[o + 2], seg[o + 6]) < OCC_REACH) return true;
  }
  return false;
}
