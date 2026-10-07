import { SPINE_POINTS } from './groundUniforms';
import { OCC_AXIS_UP, OCC_NEAR, OCC_REACH, OCC_SIMPLIFY } from './occlusion';

/**
 * The CPU half of the leaf fade (occlusion.ts): the worm's body axis as this frame's camera sees
 * it, as a few projected segments and the screen box round them.
 */

/** The body axis in view space (x, y, depth), reused by occluderSegments. */
const viewAxis = new Float64Array(SPINE_POINTS * 3);
/** Which axis points the simplified polyline keeps (Douglas-Peucker), reused. */
const keep = new Uint8Array(SPINE_POINTS);

/** Douglas-Peucker on viewAxis between points i and j (both kept): marks the points to keep. */
function simplify(i: number, j: number): void {
  const ax = viewAxis[i * 3];
  const ay = viewAxis[i * 3 + 1];
  const ad = viewAxis[i * 3 + 2];
  const ex = viewAxis[j * 3] - ax;
  const ey = viewAxis[j * 3 + 1] - ay;
  const ed = viewAxis[j * 3 + 2] - ad;
  const e2 = Math.max(ex * ex + ey * ey + ed * ed, 1e-12);
  let worst = 0;
  let at = -1;
  for (let k = i + 1; k < j; k++) {
    const px = viewAxis[k * 3] - ax;
    const py = viewAxis[k * 3 + 1] - ay;
    const pd = viewAxis[k * 3 + 2] - ad;
    const u = Math.min(1, Math.max(0, (px * ex + py * ey + pd * ed) / e2));
    const d2 = (px - ex * u) ** 2 + (py - ey * u) ** 2 + (pd - ed * u) ** 2;
    if (d2 > worst) {
      worst = d2;
      at = k;
    }
  }
  if (at < 0 || worst <= OCC_SIMPLIFY * OCC_SIMPLIFY) return;
  keep[at] = 1;
  simplify(i, at);
  simplify(at, j);
}

/** Planes (a, b, c, e: a x + b y + c depth + e >= 0) each segment is clipped to. */
const planes = new Float64Array(5 * 4);

function plane(k: number, a: number, b: number, c: number, e: number): void {
  planes[k * 4] = a;
  planes[k * 4 + 1] = b;
  planes[k * 4 + 2] = c;
  planes[k * 4 + 3] = e;
}

/** Writes view point (x, y, d) into seg at o in tan space and widens the NDC box by its disk. */
function put(
  x: number, y: number, d: number, p00: number, p11: number, seg: Float32Array, o: number, box: Float32Array,
): void {
  const tx = x / d;
  const ty = y / d;
  seg[o] = tx;
  seg[o + 1] = ty;
  seg[o + 2] = 1 / d;
  // occlusion() is 0 past a miss of OCC_REACH: a disk of OCC_REACH / d in tan space.
  const r = OCC_REACH / d;
  box[0] = Math.min(box[0], (tx - r) * p00);
  box[1] = Math.min(box[1], (ty - r) * p11);
  box[2] = Math.max(box[2], (tx + r) * p00);
  box[3] = Math.max(box[3], (ty + r) * p11);
  box[4] = Math.max(box[4], d);
}

/**
 * Projects the body axis for this frame's camera (view: the view matrix, column-major as three's
 * elements; p00, p11: the projection matrix's [0] and [5], a symmetric perspective), first
 * simplified to within OCC_SIMPLIFY. Each segment is clipped to depth OCC_NEAR or more and to the
 * frustum's sides pushed out by OCC_REACH (an axis point beyond that is farther than OCC_REACH
 * from every on-screen ray, so it cannot fade a pixel); what remains goes into seg (the layout
 * OCC_SEGMENTS describes), compacted. Returns how many. box (NDC xmin, ymin, xmax, ymax) gets
 * every pixel occlusion() can fade: the hole round a segment lies in the hull of its two end
 * disks, as the disk's radius is linear in screen position. box[4] gets the farthest kept view
 * depth (uOccDepth): a leaf beyond it, less OCC_FRONT, cannot be in front of any of the body.
 * Empty (2, 2, -2, -2, 0) with no segment.
 * Allocates nothing.
 */
export function occluderSegments(
  spine: ArrayLike<number>, view: ArrayLike<number>, p00: number, p11: number, seg: Float32Array, box: Float32Array,
): number {
  box[0] = Infinity;
  box[1] = Infinity;
  box[2] = -Infinity;
  box[3] = -Infinity;
  box[4] = 0;
  for (let i = 0; i < SPINE_POINTS; i++) {
    const wx = spine[i * 3];
    const wy = spine[i * 3 + 1] + OCC_AXIS_UP;
    const wz = spine[i * 3 + 2];
    viewAxis[i * 3] = view[0] * wx + view[4] * wy + view[8] * wz + view[12];
    viewAxis[i * 3 + 1] = view[1] * wx + view[5] * wy + view[9] * wz + view[13];
    viewAxis[i * 3 + 2] = -(view[2] * wx + view[6] * wy + view[10] * wz + view[14]);
  }
  const kx = 1 / Math.hypot(1, 1 / p00);
  const ky = 1 / Math.hypot(1, 1 / p11);
  plane(0, 0, 0, 1, -OCC_NEAR);
  plane(1, kx, 0, kx / p00, OCC_REACH);
  plane(2, -kx, 0, kx / p00, OCC_REACH);
  plane(3, 0, ky, ky / p11, OCC_REACH);
  plane(4, 0, -ky, ky / p11, OCC_REACH);
  keep.fill(0);
  keep[0] = 1;
  keep[SPINE_POINTS - 1] = 1;
  simplify(0, SPINE_POINTS - 1);
  let n = 0;
  for (let i = 0, j = 1; j < SPINE_POINTS; j++) {
    if (!keep[j]) continue;
    const o = i * 3;
    const q = j * 3;
    i = j;
    const ax = viewAxis[o];
    const ay = viewAxis[o + 1];
    const ad = viewAxis[o + 2];
    const ex = viewAxis[q] - ax;
    const ey = viewAxis[q + 1] - ay;
    const ed = viewAxis[q + 2] - ad;
    // Liang-Barsky: the part [t0, t1] of the segment inside every plane.
    let t0 = 0;
    let t1 = 1;
    for (let k = 0; k < 20 && t0 <= t1; k += 4) {
      const fa = planes[k] * ax + planes[k + 1] * ay + planes[k + 2] * ad + planes[k + 3];
      const fe = planes[k] * ex + planes[k + 1] * ey + planes[k + 2] * ed;
      if (fe === 0) {
        if (fa < 0) t1 = -1;
      } else if (fe > 0) {
        t0 = Math.max(t0, -fa / fe);
      } else {
        t1 = Math.min(t1, -fa / fe);
      }
    }
    if (t0 > t1) continue;
    const s = n * 8;
    put(ax + ex * t0, ay + ey * t0, ad + ed * t0, p00, p11, seg, s, box);
    put(ax + ex * t1, ay + ey * t1, ad + ed * t1, p00, p11, seg, s + 4, box);
    const lx = seg[s + 4] - seg[s];
    const ly = seg[s + 5] - seg[s + 1];
    seg[s + 3] = 1 / Math.max(lx * lx + ly * ly, 1e-12);
    seg[s + 7] = 0;
    n++;
  }
  if (n === 0) {
    // A finite empty box (uniforms stay finite), so every pixel skips.
    box[0] = 2;
    box[1] = 2;
    box[2] = -2;
    box[3] = -2;
  }
  return n;
}
