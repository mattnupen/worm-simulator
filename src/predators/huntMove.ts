import { UNITS_PER_CM } from '../surface/realScale';
import type { HuntInput, HuntState } from './hunt';

/**
 * How the hunting robin moves on the ground (hunt.ts): where a run or a lunge ends, sliding along
 * it, and facing the worm. On the surface it closes in straight at the head; for a worm underground
 * it ends on the cut's line (HuntInput's ax, az), on the side it is already on, so the side view
 * shows it side on and its bill over the worm (V4 revision 4: a robin that saw the worm dig down
 * walks over to the spot rather than being placed there). Allocates nothing.
 */

const CM = UNITS_PER_CM;

/** How far (cm) the robin is from where its bill must reach. */
export function distCm(s: HuntState, w: HuntInput): number {
  return Math.hypot(w.hx - s.x, w.hz - s.z) / CM;
}

/** Underground, how far (cm) the robin stands off the cut's line (0 on the surface). */
export function offLineCm(s: HuntState, w: HuntInput): number {
  if (!w.under) return 0;
  return Math.abs((s.x - w.hx) * w.az - (s.z - w.hz) * w.ax) / CM;
}

/** Turns the robin to face where its bill must reach. */
export function face(s: HuntState, w: HuntInput): void {
  s.yaw = Math.atan2(w.hx - s.x, w.hz - s.z);
}

/**
 * Sets a move toward the worm from where the robin is: it would end `stopCm` from the spot (on the
 * surface, on the straight line to it; underground, on the cut's line), but goes at most `maxCm`.
 * Returns the move's length (cm).
 */
export function aimAt(s: HuntState, w: HuntInput, stopCm: number, maxCm: number): number {
  let ex: number;
  let ez: number;
  const d = Math.max(distCm(s, w), 1e-6);
  if (w.under && (w.ax !== 0 || w.az !== 0)) {
    const side = Math.sign((s.x - w.hx) * w.ax + (s.z - w.hz) * w.az) || 1;
    ex = w.hx + w.ax * side * stopCm * CM;
    ez = w.hz + w.az * side * stopCm * CM;
  } else {
    const k = (d - stopCm) / d;
    ex = s.x + (w.hx - s.x) * k;
    ez = s.z + (w.hz - s.z) * k;
  }
  const len = Math.hypot(ex - s.x, ez - s.z) / CM;
  const k = len > maxCm ? maxCm / len : 1;
  s.fromX = s.x;
  s.fromZ = s.z;
  s.toX = s.x + (ex - s.x) * k;
  s.toZ = s.z + (ez - s.z) * k;
  return len * k;
}

/** Moves along the run or lunge over `time` seconds; true once it's there. */
export function slide(s: HuntState, time: number): boolean {
  const k = Math.min(1, s.t / time);
  s.x = s.fromX + (s.toX - s.fromX) * k;
  s.z = s.fromZ + (s.toZ - s.fromZ) * k;
  return k >= 1;
}
