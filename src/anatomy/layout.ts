/**
 * Where everything sits in an adult nightcrawler (Lumbricus terrestris), in millimetres. Plain
 * data and pure functions, shared by every part of the anatomy model (src/anatomy/) and its tests.
 * Segment numbers count the mouth segment (peristomium) as 1, as the keys and dissection guides do
 * (docs/codev/research/anatomy.md has the sources for each number).
 *
 * Axes: x runs from the head (x = 0 at the front of segment 1) to the tail; y is up (dorsal);
 * z is the worm's left side, toward the camera in the cutaway (the half with z > 0 is cut away).
 */

/** Segments in the model (adults have about 110 to 180). */
export const SEGMENTS = 150;
/** How far the prostomium reaches forward of segment 1. */
export const PROSTOMIUM = 1.25;

/** Length of segment n (1-based): longer at the front, crowded toward the tail. */
export function segmentLength(n: number): number {
  if (n <= 40) return 1.55 - 0.15 * Math.max(0, (8 - n) / 7);
  return 1.55 - 0.5 * Math.min(1, (n - 40) / 110);
}

const STARTS = (() => {
  const out = new Float64Array(SEGMENTS + 2);
  let x = 0;
  for (let n = 1; n <= SEGMENTS + 1; n++) {
    out[n] = x;
    x += segmentLength(n);
  }
  return out;
})();

/** x of the front edge of segment n; segStart(n + 1) is its back edge (the n/n+1 furrow). */
export function segStart(n: number): number {
  return STARTS[Math.max(1, Math.min(SEGMENTS + 1, Math.round(n)))];
}
/** x of the middle of segment n. */
export const segMid = (n: number): number => (segStart(n) + segStart(n + 1)) / 2;
/** x at a fraction f through segment n (f may run past 1 for a part spanning segments). */
export const segAt = (n: number, f: number): number => segStart(n) + f * segmentLength(n);
/** Body length, prostomium to anus. */
export const LENGTH = segStart(SEGMENTS + 1);

/** The segment number at x (fractional: 3.5 is the middle of segment 3). */
export function segmentAt(x: number): number {
  if (x <= 0) return 1 + x / segmentLength(1);
  let lo = 1;
  let hi = SEGMENTS + 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (STARTS[mid] <= x) lo = mid;
    else hi = mid;
  }
  if (lo > SEGMENTS) return SEGMENTS + 1;
  return lo + (x - STARTS[lo]) / segmentLength(lo);
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
export const smooth = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Segments of the clitellum and of the tubercula pubertatis ridges under it. */
export const CLITELLUM: readonly [number, number] = [32, 37];
/** The clitellum's orange-brown, shared by the model's skin (body.ts) and the game worm (src/worm). */
export const CLITELLUM_COLOR = '#b9725a';
export const TUBERCULA: readonly [number, number] = [33, 36];

/**
 * Half-width of the body at segment position s (fractional segment number), before the furrows.
 * Narrow at the mouth, widest from about segment 10 to the clitellum, a slow taper behind it and
 * a rounded tail.
 */
export function halfWidth(s: number): number {
  let r = 1.55 + 2.35 * smooth(0.3, 10, s);
  r *= 1 - 0.13 * smooth(40, 110, s) + 0.18 * smooth(115, SEGMENTS - 5, s);
  // The tail rounds off over its last few segments.
  const tail = clamp01((SEGMENTS + 1 - s) / 5);
  r *= Math.sqrt(1 - (1 - tail) * (1 - tail));
  return r;
}

/**
 * Height over width of the cross-section: round at the front, flattened top to bottom behind the
 * clitellum into the nightcrawler's paddle-shaped tail.
 */
export function flatten(s: number): number {
  return 1 - 0.22 * smooth(40, 100, s) - 0.3 * smooth(100, SEGMENTS - 6, s);
}

/** Wall layer thicknesses as fractions of the local half-width (outer to inner). */
export const WALL = {
  epidermis: 0.04,
  circular: 0.05,
  longitudinal: 0.12,
} as const;
export const wallThickness = (): number => WALL.epidermis + WALL.circular + WALL.longitudinal;

/** Every organ's place, by segment (anatomy.md). [first, last] are inclusive segment numbers. */
export const ORGANS = {
  brain: 3,
  subpharyngeal: 4,
  pharynx: [2, 5] as const,
  esophagus: [6, 14] as const,
  calciferous: [10, 12] as const,
  crop: [15, 16] as const,
  gizzard: [17, 18] as const,
  intestineFrom: 19,
  hearts: [7, 11] as const,
  testes: [10, 11] as const,
  seminalVesicles: [9, 11, 12] as const,
  spermathecae: [9, 10] as const,
  ovaries: 13,
  femalePores: 14,
  malePores: 15,
  firstSeptum: 5,
  firstNephridia: 4,
  firstDorsalPore: 8,
} as const;

/**
 * The muscle view's "staircase": the skin is peeled back over SKIN_WINDOW (segments, angles from the
 * dorsal midline) to show the circular muscle, which is peeled back again over the back part of it
 * to show the longitudinal muscle.
 */
export const PEEL = { skin: [44, 58] as const, circular: [50, 58] as const, th: [-0.35, 1.95] as const };
export function inPeel(which: 'skin' | 'circular', s: number, th: number): boolean {
  const a = ((th + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  const [s0, s1] = PEEL[which];
  return s >= s0 && s < s1 && a >= PEEL.th[0] && a <= PEEL.th[1];
}

/** Angles round the body, measured from the dorsal midline toward the worm's left (+z). */
export const DORSAL = 0;
export const VENTRAL = Math.PI;

/**
 * The four pairs of setae on each side, as angles from the ventral midline: a and b close
 * together on the belly, c and d close together on the side (closely paired, as in all lumbricids).
 */
export const SETAE = [0.2, 0.36, 1.12, 1.28] as const;
