import type { LeafKind } from './leafLitter';

/**
 * Real size (V2 spec section 10; Matt, 2026-10-06): every size multiplier and the prop and tree
 * layout of the one world, the forest at real size next to a 15 cm earthworm. These are V1's True
 * numbers; V2 removed World scale (Classic and Hybrid live on only in V1, frozen at /v1/). The
 * multipliers are relative to the base sizes the prop and leaf writers draw at 1 (Step 1a's).
 *
 * The worm is 3.5 units long and stands for a 15 cm earthworm, so 1 cm is about 0.23 units. The
 * world stays 40 x 40 units.
 */

/** World units per real centimetre: the 3.5-unit worm is a 15 cm earthworm. */
export const UNITS_PER_CM = 3.5 / 15;

/** A near tree layout: `count` trunks, seeded, at least `clear` from the spawn. */
export interface TreeLayout { count: number; seed: number; clear: number }
/** A rock at base size; it is drawn `rock` times bigger. */
export interface RockSite { x: number; z: number; size: number }
/** The fallen log at base radius and length; `log` scales both. */
export interface LogSite { x: number; z: number; yaw: number; length: number; radius: number }

export interface RealScale {
  /** Size of every leaf (litter, detail, hero) per species, times its base size (LEAF_SIZE). */
  readonly leaf: Readonly<Record<LeafKind, number>>;
  /** Clutter sizes, times base. */
  readonly mushroom: number;
  readonly fern: number;
  readonly sedge: number;
  /** Rock size (about a rock's radius; it is twice that across), times base. */
  readonly rock: number;
  /** The fallen log's radius and length, times base. */
  readonly log: number;
  /** Trunk girth and height, times base. */
  readonly birch: number;
  readonly maple: number;
  readonly trees: TreeLayout;
  readonly rocks: readonly RockSite[];
  readonly logSite: LogSite;
  /** Ground clutter items at full density, and their seed. */
  readonly clutter: number;
  readonly clutterSeed: number;
  /** The distant tree ring: size times base, and how many. */
  readonly distantScale: number;
  readonly distantCount: number;
}

/**
 * Real leaf lengths (cm): aspen 5.5, a white ash leaflet 8, sugar maple 11, basswood 12, red oak
 * 15. A leaf is drawn LEAF_SIZE[kind] times 0.6 to 1.2 long (0.9 on average) at base size, so each
 * multiplier in REAL_SCALE.leaf is the real length in units over that average
 * (tests/unit/realScale.test.ts).
 */
export const REAL_LEAF_CM: Readonly<Record<LeafKind, number>> = { aspen: 5.5, ash: 8, maple: 11, basswood: 12, oak: 15 };

export const REAL_SCALE: RealScale = {
  leaf: { aspen: 1.426, ash: 1.975, maple: 1.840, basswood: 1.944, oak: 2.431 },
  mushroom: 3, fern: 7, sedge: 7, rock: 4, log: 9, birch: 9, maple: 11,
  trees: { count: 2, seed: 284, clear: 18 },
  // Glacial erratics, 17 to 41 cm across, placed around the trees and log, well away from the
  // worm's paths (tests/unit/propPlacement.test.ts).
  rocks: [
    { x: -9.5, z: -10, size: 1.2 },
    { x: 7, z: 5.5, size: 0.8 },
    { x: -7.5, z: 7, size: 0.7 },
    { x: 0, z: -15, size: 0.6 },
    { x: 0.5, z: -7, size: 0.5 },
  ],
  // A 40-unit fallen birch across the view, running off both edges.
  logSite: { x: 0, z: 15.5, yaw: 0, length: 4.4, radius: 0.32 },
  clutter: 24, clutterSeed: 5, distantScale: 9, distantCount: 14,
};
