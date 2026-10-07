/** Easings for the worm's moves in and out of the cut (bodyPath.ts) and the camera's. Pure. */

/** Smooth 0..1 easing with zero speed and acceleration at both ends. */
export function smootherstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * 0..1 easing that speeds up smoothly over the first share `r` (0 < r <= 0.5), cruises, and slows
 * down over the last `r`: its speed rises as smoothstep, so it starts and stops with zero speed
 * and acceleration. Its top speed is 1 / (1 - r).
 */
export function cruise(t: number, r: number): number {
  const x = Math.min(1, Math.max(0, t));
  const g = x < r ? cruiseRamp(x / r, r) : x > 1 - r ? 1 - r - cruiseRamp((1 - x) / r, r) : r / 2 + (x - r);
  return g / (1 - r);
}

/** Distance covered over a ramp of length r whose speed rises as smoothstep, at y (0..1) of it. */
function cruiseRamp(y: number, r: number): number {
  return r * y * y * y * (1 - y / 2);
}

/**
 * A quintic in s (0..1) that starts at `p` with slope `v` and curvature `a` (per unit of s) and
 * comes to rest at 0 when s = 1, with no slope or curvature there: an eased hand-over that keeps
 * whatever motion it starts from. `d` = 0, 1 or 2 gives the value, slope or curvature. With
 * v = a = 0 it is p (1 - smootherstep(s)).
 */
export function settle(p: number, v: number, a: number, s: number, d: 0 | 1 | 2): number {
  if (s >= 1) return 0;
  const x = Math.max(0, s);
  const x2 = x * x;
  const x3 = x2 * x;
  if (d === 0) {
    return p * (1 - 10 * x3 + 15 * x3 * x - 6 * x3 * x2)
      + v * (x - 6 * x3 + 8 * x3 * x - 3 * x3 * x2)
      + a * 0.5 * (x2 - 3 * x3 + 3 * x3 * x - x3 * x2);
  }
  if (d === 1) {
    return p * (-30 * x2 + 60 * x3 - 30 * x2 * x2)
      + v * (1 - 18 * x2 + 32 * x3 - 15 * x2 * x2)
      + a * 0.5 * (2 * x - 9 * x2 + 12 * x3 - 5 * x2 * x2);
  }
  return p * (-60 * x + 180 * x2 - 120 * x3)
    + v * (-36 * x + 96 * x2 - 60 * x3)
    + a * 0.5 * (2 - 18 * x + 36 * x2 - 20 * x3);
}
