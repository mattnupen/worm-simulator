import { leafShape, type LeafShape } from './leafShapes';
import type { LeafKind } from './leafLitter';

/** Outline points kept for a distant leaf (6 triangles). */
export const LOD_POINTS = 6;

/**
 * A low-detail silhouette for distant litter: LOD_POINTS outline points, always including the
 * base and the tip, fanned around the shape's centre (the fan centre for fan shapes, the middle
 * of the midrib for oak). At a distance it reads as the same leaf for a quarter of the
 * triangles. Same leaf-local frame as leafShape. Pure.
 */
function simplified(kind: LeafKind): LeafShape {
  const s = leafShape(kind);
  const n = s.outline;
  const picks: number[] = [];
  for (let m = 0; m < LOD_POINTS; m++) picks.push((s.base + Math.round((m * n) / LOD_POINTS)) % n);
  // Make sure the tip is one of them: replace the pick nearest to it along the outline.
  if (!picks.includes(s.tip)) {
    let best = 1;
    for (let m = 1; m < LOD_POINTS; m++) {
      const d = (k: number) => Math.min(Math.abs(picks[k] - s.tip), n - Math.abs(picks[k] - s.tip));
      if (d(m) < d(best)) best = m;
    }
    picks[best] = s.tip;
  }
  const fan = s.points.length / 2 === n + 1 && kind !== 'oak';
  const cx = fan ? s.points[n * 2] : 0;
  const cy = fan ? s.points[n * 2 + 1] : 0;
  const points = new Float32Array((LOD_POINTS + 1) * 2);
  const vein = new Float32Array(LOD_POINTS + 1);
  picks.forEach((p, m) => {
    points[m * 2] = s.points[p * 2];
    points[m * 2 + 1] = s.points[p * 2 + 1];
    vein[m] = s.vein[p];
  });
  points[LOD_POINTS * 2] = cx;
  points[LOD_POINTS * 2 + 1] = cy;
  vein[LOD_POINTS] = 1;
  const indices = new Uint16Array(LOD_POINTS * 3);
  for (let m = 0; m < LOD_POINTS; m++) indices.set([LOD_POINTS, m, (m + 1) % LOD_POINTS], m * 3);
  return { points, outline: LOD_POINTS, indices, vein, base: 0, tip: picks.indexOf(s.tip) };
}

const cache = new Map<LeafKind, LeafShape>();

/** The (cached, shared) low-detail silhouette for a species. Treat it as read-only. */
export function lodShape(kind: LeafKind): LeafShape {
  let s = cache.get(kind);
  if (!s) {
    s = simplified(kind);
    cache.set(kind, s);
  }
  return s;
}

/**
 * Farthest vertex of the low-detail shape from the leaf-local origin, in unit leaf size (multiply
 * by the leaf's size). Task 21's far chunks use it as the drape anchor radius: the low-detail leaf
 * is not the full leaf, so the full shape's radius would be wrong for it. Pure.
 */
export function lodRadius(kind: LeafKind): number {
  const p = lodShape(kind).points;
  let r = 0;
  for (let i = 0; i < p.length; i += 2) r = Math.max(r, Math.hypot(p[i], p[i + 1]));
  return r;
}
