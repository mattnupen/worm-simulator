import { UNITS_PER_CM } from '../surface/realScale';

/**
 * The soil layers of a worm-free Minnesota hardwood forest floor (moder humus), top to bottom
 * (V2 spec 5.1; docs/codev/research/mn-forest-floor.md). The index is the soil grid's layer byte.
 */
export const LAYER = { L: 0, F: 1, H: 2, A: 3, E: 4, B: 5 } as const;
export type LayerId = (typeof LAYER)[keyof typeof LAYER];
export const LAYER_COUNT = 6;

/**
 * Thickness ranges (cm, real) of the layers under the litter. L is not here: its thickness is the
 * surface litter's depth at each point (litterTopHeight - floorHeight, spec 8.2). B is the rest,
 * down to the slab's bottom. E (the pale band of many northern soils) has no number in the
 * research notes: 2-4 cm is a planning choice, recorded in the as-built record.
 */
export const THICKNESS_CM = {
  F: [4, 5],
  H: [1, 2],
  A: [3, 5],
  E: [2, 4],
} as const satisfies Record<string, readonly [number, number]>;

/** The same ranges in world units (min, max), in boundary order F, H, A, E. */
export const THICKNESS_U: readonly (readonly [number, number])[] = [
  THICKNESS_CM.F, THICKNESS_CM.H, THICKNESS_CM.A, THICKNESS_CM.E,
].map(([lo, hi]) => [lo * UNITS_PER_CM, hi * UNITS_PER_CM] as const);

/** Speed (units per second) eating into fresh soil of each layer (spec 6): easy L, F, H; A slower; E and B slowest. */
export const EAT_SPEED: Readonly<Record<LayerId, number>> = {
  [LAYER.L]: 1.0, [LAYER.F]: 0.9, [LAYER.H]: 0.85, [LAYER.A]: 0.6, [LAYER.E]: 0.45, [LAYER.B]: 0.42,
};
/** Speed through the worm's own open tunnel: the fastest way to move. */
export const TUNNEL_SPEED = 1.4;
/** Speed eating back through castings (loose, soft). */
export const CAST_SPEED = 0.9;

/** Litter, fermentation and humus are leaves at different stages: eating them fills the gut with organic matter. */
export function isOrganic(layer: LayerId): boolean {
  return layer <= LAYER.H;
}

/** The TEXT key that names each layer on the slab's end labels (E and B share "Subsoil"). */
export const LAYER_LABEL_KEYS = ['layerLitter', 'layerOld', 'layerHumus', 'layerTopsoil', 'layerSubsoil'] as const;
export type LayerLabelKey = (typeof LAYER_LABEL_KEYS)[number];
