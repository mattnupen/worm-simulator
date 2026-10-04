import { LEAF_KINDS, type LeafKind } from './leafLitter';
import { leafShape } from './leafShapes';
import { LEAF_SIZE } from './leafPalette';
import { scaleSpec, type ScaleSpec } from './worldScale';
import { DIST_REACH } from './disturbance';

/**
 * The farthest any Classic litter leaf reaches from its centre (the largest placement scale of the
 * biggest species, petiole included; tests/unit/leafGlsl.test.ts checks it). Detail leaves are
 * smaller, and hero leaves do not read the disturbance map.
 */
export const CLASSIC_LEAF_RADIUS = 1.26;
/** The drape's foot (leafGlsl.ts DRAPE_FOOT; tests/unit/disturbance.test.ts checks they agree). */
const DRAPE_FOOT_M = 0.34;

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

/** The farthest a litter leaf of the mode reaches from its centre. */
export function maxLeafRadius(spec: ScaleSpec = scaleSpec()): number {
  return CLASSIC_LEAF_RADIUS * Math.max(...LEAF_KINDS.map((k) => spec.leaf[k]));
}

/**
 * How far from the body the mode's leaves need the disturbance map stamped (stampBody's limit):
 * the biggest leaf plus the drape's foot (Classic: 1.6 m, the map's reach before Part A). Never
 * past the map's reach.
 */
export function stampLimit(spec: ScaleSpec = scaleSpec()): number {
  return Math.min(DIST_REACH, maxLeafRadius(spec) + DRAPE_FOOT_M);
}
