import type { Vec3 } from '../core/vec';

/** Shape of a standing trunk. Pure helpers; the mesh builder samples them. */
export interface TrunkParams {
  /** Trunk length above the ground (m). */
  height: number;
  /** Radius just above the root flare. */
  radius: number;
  /** Fraction of the radius lost by the top (0 = cylinder). */
  taper: number;
  /** How far the root collar swells at the ground, as a fraction of the radius. */
  flare: number;
  /** 0..1: how much of the flare gathers into root buttresses. */
  buttress: number;
  /** Number of buttress roots around the base. */
  lobes: number;
  phase: number;
  /** Height (m) over which the root collar fades; 0.4 when absent (a Classic trunk). */
  collar?: number;
}

/**
 * Ring heights as fractions of the trunk height; the first is buried (so slopes never show
 * a floating base). Dense near the ground where the flare curves, sparse above.
 */
export const RING_HEIGHTS: readonly number[] = [
  -0.03, 0, 0.006, 0.015, 0.028, 0.045, 0.068, 0.1, 0.15, 0.22, 0.31, 0.42, 0.55, 0.7, 0.85, 1,
];

/** Radius at height h (m above the ground; buried parts keep the collar radius), angle a. */
export function trunkRadius(h: number, a: number, p: TrunkParams): number {
  const hh = Math.max(0, h);
  const taper = 1 - p.taper * Math.min(1, hh / p.height);
  const collar = Math.exp(-hh / (p.collar ?? 0.4));
  const lobe = Math.max(0, Math.cos(p.lobes * a + p.phase)) ** 2;
  return p.radius * taper * (1 + p.flare * collar * (1 - p.buttress + 2 * p.buttress * lobe));
}

/** Trunk axis point at height h: a gentle lean that grows with the square of the height. */
export function trunkAxis(h: number, height: number, leanX: number, leanZ: number, out: Vec3): Vec3 {
  const t = Math.max(0, h) / height;
  out.x = leanX * t * t;
  out.y = h;
  out.z = leanZ * t * t;
  return out;
}
