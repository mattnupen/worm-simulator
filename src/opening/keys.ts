/**
 * Keyframes for the opening scene (src/opening/script.ts), pure and allocation-free. A track is a
 * list of keys `[t, v0, v1, ...]` in time order; between two keys each value eases in and out
 * (smoothstep), and before the first or after the last key it holds. Walkers' feet step along a
 * path track (walkFeet).
 */
export type Key = readonly number[];

const smooth = (u: number): number => u * u * (3 - 2 * u);

/** The key index whose segment holds `t` (the last key at or before it), clamped to the track. */
function segment(keys: readonly Key[], t: number): number {
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1][0] <= t) i++;
  return i;
}

/**
 * Writes the track's values at time `t` into `out` (one per value column) and returns it. `linear`
 * blends straight (a constant speed: walking, running); otherwise each segment eases in and out.
 */
export function sample(keys: readonly Key[], t: number, out: number[], linear = false): number[] {
  const n = keys[0].length - 1;
  const i = segment(keys, t);
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  const span = b[0] - a[0];
  const raw = span > 0 ? Math.min(1, Math.max(0, (t - a[0]) / span)) : 0;
  const u = t < a[0] ? 0 : linear ? raw : smooth(raw);
  for (let k = 0; k < n; k++) out[k] = a[k + 1] + (b[k + 1] - a[k + 1]) * u;
  return out;
}

/** One value of a one-column track. */
export function sample1(keys: readonly Key[], t: number): number {
  const i = segment(keys, t);
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  const span = b[0] - a[0];
  const raw = span > 0 ? Math.min(1, Math.max(0, (t - a[0]) / span)) : 0;
  return a[1] + (b[1] - a[1]) * (t < a[0] ? 0 : smooth(raw));
}

/**
 * How far along a path track `[t, x, y, z]` a walker has gone by time `t`, walking it at a
 * constant speed between keys (sample with `linear`): the sum of the finished segments' lengths
 * plus the share of the current one. Its feet step by this distance.
 */
export function pathDistance(keys: readonly Key[], t: number): number {
  let d = 0;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    const len = Math.hypot(b[1] - a[1], b[2] - a[2], b[3] - a[3]);
    if (t >= b[0]) {
      d += len;
      continue;
    }
    if (t > a[0]) d += len * ((t - a[0]) / (b[0] - a[0]));
    break;
  }
  return d;
}

/** Where one foot is, from the walker's middle: `ahead` along its facing, `lift` up. */
export interface FootPose { ahead: number; lift: number }

/**
 * A two-legged walk: each foot's place along the facing, as the walker covers `distance`. A foot
 * stands still on the ground for half its cycle (the body passes over it) and swings forward through
 * the air for the other half, so a planted foot never slides. `stride` is how far the body moves in
 * one foot's whole cycle; foot 1 is half a cycle behind foot 0. `moving` (0..1) scales the lift, so a
 * foot caught mid-swing when the walker stops comes down instead of hanging in the air.
 */
export function walkFoot(distance: number, stride: number, foot: 0 | 1, liftHeight: number, moving: number, out: FootPose): FootPose {
  const cycle = distance / stride + foot * 0.5;
  const p = cycle - Math.floor(cycle);
  const q = stride / 4;
  if (p < 0.5) {
    // Planted: from a quarter stride ahead of the middle to a quarter behind it.
    out.ahead = q - (p / 0.5) * 2 * q;
    out.lift = 0;
  } else {
    const s = (p - 0.5) / 0.5;
    out.ahead = -q + s * 2 * q;
    out.lift = Math.sin(Math.PI * s) * liftHeight * moving;
  }
  return out;
}
