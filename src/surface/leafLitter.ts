import { mulberry32 } from '../core/random';
import { LITTER_MAX, LITTER_OPEN, litterMound } from './litterDepth';

export type LeafKind = 'ash' | 'basswood' | 'aspen' | 'maple' | 'oak';
export const LEAF_KINDS: readonly LeafKind[] = ['ash', 'basswood', 'aspen', 'maple', 'oak'];

/** Fall colors, for art only. Meaning never depends on these. */
export const LEAF_COLORS: Record<LeafKind, string> = {
  ash: '#b8a03a',
  basswood: '#d9b23a',
  aspen: '#f2c230',
  maple: '#e0582a',
  oak: '#8a5a2b',
};

export interface LeafPlacement {
  x: number; z: number;
  /** Height of the solid litter mound under the leaf, above the soil. */
  mound: number;
  /** The leaf's layer in the loose litter above the mound; the lowest leaves are the dampest. */
  y: number;
  /** The thickness `y` is drawn from (0 to `span`): the loose layer above the mound. */
  span: number;
  rotY: number; tilt: number; scale: number;
  kind: LeafKind;
}

/** Litter depth (m) at (x, z). */
export type DepthField = (x: number, z: number) => number;

/** One leaf deep everywhere. */
const ONE_LEAF: DepthField = () => LITTER_OPEN;

/**
 * Seeded leaf placement over a square. Deeper litter holds more leaves (a deep pile keeps about
 * three times as many as open ground) and stacks them higher: each leaf rests on the litter mound,
 * somewhere in the loose layer above it. Placement order is random, so any prefix is an even
 * thinning (the presets draw a prefix).
 */
export function placeLeaves(count: number, halfSize: number, seed = 1, depthAt: DepthField = ONE_LEAF): LeafPlacement[] {
  const r = mulberry32(seed);
  const out: LeafPlacement[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 400) {
    const x = (r() * 2 - 1) * halfSize;
    const z = (r() * 2 - 1) * halfSize;
    const depth = depthAt(x, z);
    if (r() > 0.3 + 0.7 * (depth / LITTER_MAX)) continue;
    const mound = litterMound(depth);
    const span = Math.max(LITTER_OPEN, depth - mound) * 0.8;
    out.push({
      x, z, mound, span,
      y: r() * span,
      rotY: r() * Math.PI * 2,
      tilt: (r() - 0.5) * 0.5,
      scale: 0.6 + r() * 0.6,
      kind: LEAF_KINDS[Math.floor(r() * LEAF_KINDS.length)],
    });
  }
  return out;
}

/** Step 0's leaf layer range: `leafTint` was tuned for layers drawn from 0 to this. */
export const WETNESS_LAYER_RANGE = 0.079;

/**
 * The layer to hand `leafTint`: the leaf's place in its loose layer (0 bottom, 1 top), scaled to
 * Step 0's range, so the share of damp leaves and their mean dampness stay as tuned however
 * thick the litter is (about 35% damp, mean about 0.12).
 */
export function wetnessLayer(l: LeafPlacement): number {
  return (l.y / l.span) * WETNESS_LAYER_RANGE;
}
