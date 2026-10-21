import { hypot2, type Vec3 } from '../core/vec';
import { FULL_SPACING, wormBody } from './bodyLength';

/** A change of length eases in over this long (s): the tail pulls in toward the head, nothing pops. */
export const LENGTH_EASE_S = 0.4;

/**
 * The surface body's gap between points, eased toward the worm's length (bodyLength.ts) whenever
 * it changes: the crawl's follow-the-leader only ever pulls, so a shrinking gap draws the tail in
 * toward the head over LENGTH_EASE_S, and a growing one lets the body lengthen as the worm moves.
 * Allocates nothing. The fields start as fractions (bodyLength.ts).
 */
export class EasedGap {
  /** The gap now. */
  value = 0.5;
  /** Easing from `from` to `to` (wormBody.spacing when the length last changed) as `t` runs 0..1. */
  private from = 0.5;
  to = 0.5;
  private t = 0.5;

  /**
   * At the length now, at once. Laid out at `at` longer than that (the length changed while the worm
   * came up), it starts as long as `at` (nothing pops) and eases in as a step would.
   */
  place(at: readonly Vec3[] | null): void {
    const to = wormBody.spacing;
    let from = to;
    for (let i = 1; at && i < at.length; i++) from = Math.max(from, hypot2(at[i].x - at[i - 1].x, at[i].z - at[i - 1].z));
    this.from = this.value = Math.min(from, Math.max(to, FULL_SPACING));
    this.to = to;
    this.t = this.value > to ? 0 : 1;
  }

  /** One step: eases toward the length now, restarting from where it is if that changed. */
  step(dt: number): void {
    const to = wormBody.spacing;
    if (to !== this.to) {
      this.from = this.value;
      this.to = to;
      this.t = 0;
    }
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / LENGTH_EASE_S);
    const t = this.t;
    this.value = this.from + (this.to - this.from) * t * t * (3 - 2 * t);
  }
}
