import type { LeafKind } from './leafLitter';

/**
 * World scale (Step 1b spec section 4): one ScaleSpec per mode, holding every size multiplier
 * and that mode's prop and tree layout. Every size and placement module reads the active spec
 * (scaleSpec()); nothing outside this file knows which mode is on. Picking the final mode after
 * the class vote means changing DEFAULT_SCALE; deleting a mode means deleting its entry.
 *
 * The worm, its speed and the camera are the same in every mode. The worm is 3.5 units long and
 * stands for a 15 cm earthworm, so 1 cm is about 0.23 units. The world stays 40 x 40 units.
 */
export type ScaleMode = 'classic' | 'hybrid' | 'true';
export const SCALE_MODES: readonly ScaleMode[] = ['classic', 'hybrid', 'true'];
/** What a fresh device gets (Matt's pick; the class vote may change it). */
export const DEFAULT_SCALE: ScaleMode = 'classic';

/** World units per real centimetre: the 3.5-unit worm is a 15 cm earthworm. */
export const UNITS_PER_CM = 3.5 / 15;

/** A near tree layout: `count` trunks, seeded, at least `clear` from the spawn. */
export interface TreeLayout { count: number; seed: number; clear: number }
/** A rock at Classic size; it is drawn `rock` times bigger in the mode. */
export interface RockSite { x: number; z: number; size: number }
/** The fallen log at Classic radius and length; `log` scales both. */
export interface LogSite { x: number; z: number; yaw: number; length: number; radius: number }

export interface ScaleSpec {
  readonly mode: ScaleMode;
  /** Size of every leaf (litter, detail, hero) per species, times Classic. */
  readonly leaf: Readonly<Record<LeafKind, number>>;
  /** Clutter sizes, times Classic. */
  readonly mushroom: number;
  readonly fern: number;
  readonly sedge: number;
  /** Rock size, times Classic. */
  readonly rock: number;
  /** The fallen log's radius and length, times Classic. */
  readonly log: number;
  /** Trunk girth and height, times Classic. */
  readonly birch: number;
  readonly maple: number;
  readonly trees: TreeLayout;
  readonly rocks: readonly RockSite[];
  readonly logSite: LogSite;
  /** Ground clutter items at full density, and their seed. */
  readonly clutter: number;
  readonly clutterSeed: number;
  /** The distant tree ring: size times Classic, and how many. */
  readonly distantScale: number;
  readonly distantCount: number;
}

const SAME_LEAVES: Readonly<Record<LeafKind, number>> = { ash: 1, basswood: 1, aspen: 1, maple: 1, oak: 1 };

/**
 * Real leaf lengths (cm) for True: aspen 5.5, a white ash leaflet 8, sugar maple 11, basswood 12,
 * red oak 15. Classic draws a leaf LEAF_SIZE[kind] times 0.6 to 1.2 long (0.9 on average), so each
 * multiplier is the real length in units over that average (tests/unit/worldScale.test.ts).
 */
export const REAL_LEAF_CM: Readonly<Record<LeafKind, number>> = { aspen: 5.5, ash: 8, maple: 11, basswood: 12, oak: 15 };
const TRUE_LEAVES: Readonly<Record<LeafKind, number>> = { aspen: 1.426, ash: 1.975, maple: 1.840, basswood: 1.944, oak: 2.431 };

/** Classic's hand-placed glacial erratics (Step 1a). */
const CLASSIC_ROCKS: readonly RockSite[] = [
  { x: -5.2, z: 7.4, size: 0.9 },
  { x: 7.2, z: -3.6, size: 1.2 },
  { x: -8.2, z: -5.2, size: 0.7 },
  { x: 9.8, z: 8.6, size: 1.0 },
  { x: -11.5, z: 5.5, size: 1.4 },
  { x: 3.2, z: -8.2, size: 0.6 },
  { x: 6.2, z: 2.2, size: 0.45 },
];

/**
 * Hybrid and True: fewer stones, four times bigger (10 to 40 cm), placed around each mode's
 * trees and log, well away from the worm's paths (tests/unit/propPlacement.test.ts).
 */
const HYBRID_ROCKS: readonly RockSite[] = [
  { x: 3.5, z: -11, size: 1.2 },
  { x: -7, z: 11, size: 0.8 },
  { x: 7.5, z: 0, size: 0.7 },
  { x: 13.5, z: -15, size: 0.6 },
  { x: -10, z: 3, size: 0.5 },
];
const TRUE_ROCKS: readonly RockSite[] = [
  { x: -9.5, z: -10, size: 1.2 },
  { x: 7, z: 5.5, size: 0.8 },
  { x: -7.5, z: 7, size: 0.7 },
  { x: 0, z: -15, size: 0.6 },
  { x: 0.5, z: -7, size: 0.5 },
];

export const SCALE_SPECS: Readonly<Record<ScaleMode, ScaleSpec>> = {
  classic: {
    mode: 'classic', leaf: SAME_LEAVES, mushroom: 1, fern: 1, sedge: 1, rock: 1, log: 1, birch: 1, maple: 1,
    trees: { count: 14, seed: 7, clear: 4 },
    rocks: CLASSIC_ROCKS,
    logSite: { x: 3.9, z: 4.7, yaw: -0.5, length: 4.4, radius: 0.32 },
    clutter: 64, clutterSeed: 5, distantScale: 1, distantCount: 72,
  },
  hybrid: {
    mode: 'hybrid', leaf: SAME_LEAVES, mushroom: 3, fern: 7, sedge: 7, rock: 4, log: 4.5, birch: 4.5, maple: 4.5,
    trees: { count: 5, seed: 15, clear: 12.5 },
    rocks: HYBRID_ROCKS,
    logSite: { x: 9, z: 9, yaw: -0.6, length: 4.4, radius: 0.32 },
    clutter: 24, clutterSeed: 5, distantScale: 4.5, distantCount: 24,
  },
  true: {
    mode: 'true', leaf: TRUE_LEAVES, mushroom: 3, fern: 7, sedge: 7, rock: 4, log: 9, birch: 9, maple: 11,
    trees: { count: 2, seed: 284, clear: 18 },
    rocks: TRUE_ROCKS,
    logSite: { x: 0, z: 15.5, yaw: 0, length: 4.4, radius: 0.32 },
    clutter: 24, clutterSeed: 5, distantScale: 9, distantCount: 14,
  },
};

export const SCALE_LABELS: Readonly<Record<ScaleMode, string>> = { classic: 'Classic', hybrid: 'Hybrid', true: 'True' };
export const SCALE_DESCRIPTIONS: Readonly<Record<ScaleMode, string>> = {
  classic: 'The forest as it is now.',
  hybrid: 'Small things real size, big things half.',
  true: 'Everything real size, next to a real worm.',
};

export function isScaleMode(v: unknown): v is ScaleMode {
  return typeof v === 'string' && (SCALE_MODES as readonly string[]).includes(v);
}

let active: ScaleSpec = SCALE_SPECS[DEFAULT_SCALE];

/** The active mode's spec. Modules read it when they build or place things. */
export function scaleSpec(): ScaleSpec {
  return active;
}

/**
 * Makes `mode` active. Everything built from the spec must then be rebuilt (src/game/world.ts);
 * caches keyed on the spec (treeSites, footprints, the height grid) refresh on their next read.
 */
export function setScale(mode: ScaleMode): ScaleSpec {
  active = SCALE_SPECS[mode];
  return active;
}
