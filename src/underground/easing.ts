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
  const ramp = (y: number): number => r * y * y * y * (1 - y / 2);
  const g = x < r ? ramp(x / r) : x > 1 - r ? 1 - r - ramp((1 - x) / r) : r / 2 + (x - r);
  return g / (1 - r);
}
