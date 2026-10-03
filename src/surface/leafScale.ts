import { LEAF_KINDS, type LeafKind } from './leafLitter';
import { leafShape } from './leafShapes';
import { LEAF_SIZE } from './leafPalette';
import { scaleSpec, type ScaleSpec } from './worldScale';

/** A species' silhouette area at length 1 (its outline, leaf units). */
function shapeArea(kind: LeafKind): number {
  const s = leafShape(kind);
  let a = 0;
  for (let j = 0; j < s.outline; j++) {
    const k = (j + 1) % s.outline;
    a += s.points[j * 2] * s.points[k * 2 + 1] - s.points[k * 2] * s.points[j * 2 + 1];
  }
  return Math.abs(a) / 2;
}
const AREA = Object.fromEntries(LEAF_KINDS.map((k) => [k, shapeArea(k)])) as Record<LeafKind, number>;

/**
 * Bigger leaves, fewer of them (spec 4.2): a leaf layer's count scales with 1 / leaf area, so the
 * floor stays about as covered (randomly strewn leaves cover a share that depends only on their
 * total area) and overdraw and fill rate stay about the same. Species are drawn equally often, so
 * the area is summed over them, each with its own silhouette. 1 for Classic and Hybrid.
 */
export function leafCountScale(spec: ScaleSpec = scaleSpec()): number {
  let base = 0;
  let scaled = 0;
  for (const k of LEAF_KINDS) {
    base += AREA[k] * LEAF_SIZE[k] ** 2;
    scaled += AREA[k] * (LEAF_SIZE[k] * spec.leaf[k]) ** 2;
  }
  return base / scaled;
}

/** A preset's leaf count (graphics.ts gives Classic's) for the mode: at least 1 when n > 0. */
export function scaledLeafCount(n: number, spec: ScaleSpec = scaleSpec()): number {
  return n > 0 ? Math.max(1, Math.round(n * leafCountScale(spec))) : 0;
}
