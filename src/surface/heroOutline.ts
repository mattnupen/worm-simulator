import { detailShape } from './detailShape';
import { LEAF_KINDS } from './leafLitter';
import { leafLift, type LeafForm } from './leafForm';

/** The hero leaves' outlines and 3D form, per species (pure, computed once). */

/** The longest leaf outline (points). */
export const MAX_OUTLINE = 64;

/** Leaf-local outline (u, v) of every species, and its farthest point from the centre. */
export const OUTLINE = LEAF_KINDS.map((k) => {
  const s = detailShape(k);
  if (s.outline > MAX_OUTLINE) throw new Error(`heroOutline: ${k} outline exceeds ${MAX_OUTLINE} points`);
  return s.points.slice(0, s.outline * 2);
});
export const LEAF_REACH = Float32Array.from(OUTLINE, (o) => {
  let r = 0;
  for (let j = 0; j < o.length; j += 2) r = Math.max(r, Math.hypot(o[j], o[j + 1]));
  return r;
});
/** Half the leaf's width across its midrib: how far a leaf turning over swings below its centre. */
export const LEAF_HALF_WIDTH = Float32Array.from(OUTLINE, (o) => {
  let r = 0;
  for (let j = 0; j < o.length; j += 2) r = Math.max(r, Math.abs(o[j]));
  return r;
});

/** The hero leaves' 3D form (leaf units): every point lies on or above the leaf's base plane. */
export const HERO_FORM: LeafForm = { fold: 0.16, cup: 0.3, curl: 0.24 };
/** Per species, the form's highest point above the base plane (leaf units). */
export const LEAF_RIM = Float32Array.from(LEAF_KINDS, (k) => {
  const pts = detailShape(k).points;
  let h = 0;
  for (let j = 0; j < pts.length; j += 2) h = Math.max(h, leafLift(pts[j], pts[j + 1], HERO_FORM));
  return h;
});

/**
 * How far the leaf (species `kind`, length `size`, as it lies: yaw and flip) reaches from its
 * centre in the ground direction (ux, uz): the most any outline point lies along it.
 */
export function reachToward(kind: number, size: number, yaw: number, flip: number, ux: number, uz: number): number {
  const o = OUTLINE[kind];
  const cf = Math.cos(flip);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  let r = 0;
  for (let j = 0; j < o.length; j += 2) {
    const xl = o[j] * cf;
    const zl = -o[j + 1];
    const proj = (xl * cy + zl * sy) * ux + (zl * cy - xl * sy) * uz;
    if (proj > r) r = proj;
  }
  return r * size;
}
