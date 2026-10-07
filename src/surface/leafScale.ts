import { LEAF_KINDS, type LeafKind } from './leafLitter';
import { leafShape } from './leafShapes';
import { LEAF_SIZE } from './leafPalette';
import { REAL_SCALE } from './realScale';
import { DIST_CELL, DIST_REACH, DIST_SPAN } from './disturbance';

/**
 * The farthest any base-size litter leaf reaches from its centre (the largest placement scale of
 * the biggest species, petiole included; tests/unit/leafGlsl.test.ts checks it). Detail leaves are
 * smaller, and hero leaves do not read the disturbance map.
 */
export const BASE_LEAF_RADIUS = 1.26;
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
 * Bigger leaves, fewer of them (Step 1b spec 4.2): a leaf layer's count scales with 1 / leaf area,
 * so the floor stays about as covered as with the presets' base-size counts (randomly strewn
 * leaves cover a share that depends only on their total area) and overdraw and fill rate stay
 * about the same. Species are drawn equally often, so the area is summed over them, each with its
 * own silhouette.
 */
export function leafCountScale(): number {
  let base = 0;
  let scaled = 0;
  for (const k of LEAF_KINDS) {
    base += AREA[k] * LEAF_SIZE[k] ** 2;
    scaled += AREA[k] * (LEAF_SIZE[k] * REAL_SCALE.leaf[k]) ** 2;
  }
  return base / scaled;
}

/** A preset's leaf count (graphics.ts gives it at base size) at real size: at least 1 when n > 0. */
export function scaledLeafCount(n: number): number {
  return n > 0 ? Math.max(1, Math.round(n * leafCountScale())) : 0;
}

/** The farthest a litter leaf reaches from its centre. */
export function maxLeafRadius(): number {
  return BASE_LEAF_RADIUS * Math.max(...LEAF_KINDS.map((k) => REAL_SCALE.leaf[k]));
}

/** How far from the body the leaves react: the biggest leaf plus the drape's foot. */
export function leafReach(): number {
  return maxLeafRadius() + DRAPE_FOOT_M;
}

/**
 * A lookup reads cells this far from where it is taken: the bilinear filter's four cells (up to a
 * cell's diagonal away) at the gradient taps (one cell either side), at most (1 + sqrt 2) cells.
 */
const LOOKUP_SPREAD = DIST_CELL * (1 + Math.SQRT2);

/**
 * How far from the body the disturbance map is stamped (stampBody's limit): the leaves' reach plus
 * a lookup's spread, so every leaf that can react reads exactly what the full map holds (an empty
 * cell reads as the map's whole reach, and bilinear filtering beside it would jump). Never past
 * the map's reach.
 */
export function stampLimit(): number {
  return Math.min(DIST_REACH, leafReach() + LOOKUP_SPREAD);
}

/**
 * How much farther a segment riding on top of the litter counts as being (stampBody's onTop), so
 * it reaches only 0.2 m past the biggest leaf.
 */
export function onTopDistance(): number {
  return leafReach() - 0.2;
}

/**
 * The half width of the window the leaf shaders read the map in: Step 1a's 8 m map faded leaves
 * out from 85% to 97% of its 4 m half span, 2.5 times its 1.6 m reach; real size keeps that ratio,
 * up to the map's own half span.
 */
function windowHalf(): number {
  return Math.min(DIST_SPAN / 2, 2.5 * leafReach());
}

/** Everything the crawl and the renderer need about the disturbance map's reach. */
export interface DisturbReach {
  /** stampBody's limit (stampLimit). */
  stamp: number;
  /** stampBody's onTop (onTopDistance). */
  onTop: number;
  /** Where the leaf shaders fade the map out: from, to (metres from the map's centre along x or z). */
  fadeFrom: number;
  fadeTo: number;
}

/** The DisturbReach, written into `out` (allocates nothing when given one). */
export function disturbReach(
  out: DisturbReach = { stamp: 0, onTop: 0, fadeFrom: 0, fadeTo: 0 },
): DisturbReach {
  out.stamp = stampLimit();
  out.onTop = onTopDistance();
  const half = windowHalf();
  out.fadeFrom = 0.85 * half;
  out.fadeTo = 0.97 * half;
  return out;
}
