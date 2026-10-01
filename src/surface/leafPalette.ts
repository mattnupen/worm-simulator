import * as THREE from 'three';
import { LEAF_COLORS, type LeafKind } from './leafLitter';

/** Leaf length relative to the placement scale, per species (aspen and ash run small). */
export const LEAF_SIZE: Record<LeafKind, number> = { maple: 1.55, oak: 1.6, aspen: 1, basswood: 1.6, ash: 1.05 };

/** How strongly the pinnate lateral veins show (palmate maple mostly shows its main veins). */
export const LATERAL_VEINS: Record<LeafKind, number> = { maple: 0.25, oak: 0.55, aspen: 0.5, basswood: 0.9, ash: 0.7 };

/** Fall colours per species (sRGB). Art only: meaning never depends on colour. */
const PALETTES: Record<LeafKind, readonly string[]> = {
  maple: [LEAF_COLORS.maple, '#cf3420', '#ee8a22', '#eab02c', '#d9481e'],
  oak: [LEAF_COLORS.oak, '#a3632f', '#7b4a2a', '#9c6b3c', '#8c4a28'],
  aspen: [LEAF_COLORS.aspen, '#e9b222', '#f4d24e', '#dca420'],
  basswood: [LEAF_COLORS.basswood, '#c99a36', '#b8903e', '#d9c050'],
  // White ash turns yellow or a purple-bronze.
  ash: [LEAF_COLORS.ash, '#cbb04a', '#6e4a48', '#a8863a'],
};
const EDGE: Record<LeafKind, string> = {
  maple: '#a8241a', oak: '#5a3820', aspen: '#c8862a', basswood: '#8a6a30', ash: '#6a4a3a',
};

const c = (hex: string) => new THREE.Color(hex);
const BROWN = c('#7a5232');
const DAMP = c('#3a2818');
const GREEN = c('#8f9a3c');
const STEM = c('#6a3a22');
const pal = Object.fromEntries(
  Object.entries(PALETTES).map(([k, list]) => [k, list.map(c)]),
) as Record<LeafKind, THREE.Color[]>;
const edges = Object.fromEntries(Object.entries(EDGE).map(([k, h]) => [k, c(h)])) as Record<LeafKind, THREE.Color>;
const tmp = new THREE.Color();

/**
 * Per-leaf colours (linear): `inner` for the blade centre, `edge` for the margin, and the
 * petiole. Leaves low in the litter (small `layerY`) are damper and darker; some are
 * browning; a few still hold a little green. Returns the leaf's wetness (0..1).
 */
export function leafTint(
  kind: LeafKind, layerY: number, rng: () => number,
  inner: THREE.Color, edge: THREE.Color, petiole: THREE.Color,
): number {
  const list = pal[kind];
  inner.copy(list[Math.floor(rng() * list.length)]).lerp(list[Math.floor(rng() * list.length)], rng() * 0.5);
  inner.multiplyScalar(0.88 + rng() * 0.24);
  edge.copy(inner).lerp(edges[kind], 0.25 + rng() * 0.3);
  // The blade centre stays a touch lighter and warmer than the margin.
  inner.lerp(tmp.setRGB(1, 0.8, 0.35), 0.06);

  const brown = rng() ** 2 * 0.65;
  inner.lerp(BROWN, brown * 0.7);
  edge.lerp(BROWN, Math.min(1, brown * 1.1));

  // Damp leaves at the bottom of the litter: darker, earthier, glistening.
  const damp = Math.max(0, 1 - layerY / 0.028) * (0.4 + 0.6 * rng());
  inner.lerp(DAMP, damp * 0.35).multiplyScalar(1 - damp * 0.35);
  edge.lerp(DAMP, damp * 0.45).multiplyScalar(1 - damp * 0.35);

  if (rng() < 0.06) inner.lerp(GREEN, 0.45);
  petiole.copy(inner).lerp(STEM, 0.55);
  return damp;
}
