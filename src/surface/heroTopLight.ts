/**
 * How bright a hero leaf is drawn (V2 spec 8.2): the leaves in the worm's pocket are older and
 * dimmer than this fall's on the top of the litter, but one the worm heaves up through the top
 * reads as a top leaf. Pure; allocates nothing.
 */

/**
 * A hero leaf whose highest point rises from TOP_FROM (the top of the litter, at its centre) to
 * TOP_TO over it brightens from the pocket's dim tint to a top leaf's colour: one the worm heaves
 * up through the top reads as a disturbed top leaf, not a dark leaf standing on it. A leaf wholly
 * under the top never brightens, however the wave rocks it.
 */
export const TOP_FROM = 0;
export const TOP_TO = 0.1;
/** It brightens over this long (s): a heaved leaf turns bright almost at once. */
export const TOP_EASE = 0.15;
/**
 * It dims only once its target has stayed lower for TOP_HOLD (s), then over TOP_FADE (s). A leaf
 * rocked back and forth across the top stays bright, and no brightening and dimming can repeat
 * 3 times a second (parent spec 7: nothing flashes more than 3 times a second).
 */
export const TOP_HOLD = 0.6;
export const TOP_FADE = 0.6;

/** 0 (the pocket's dim tint) to 1 (a top leaf's colour) for a leaf whose highest point is `over` the top. */
export function topShare(over: number): number {
  const t = Math.min(1, Math.max(0, (over - TOP_FROM) / (TOP_TO - TOP_FROM)));
  return t * t * (3 - 2 * t);
}

/**
 * Eases leaf `i`'s `lit` toward `target` over `dt` seconds: up at once over TOP_EASE; down only
 * after the target has stayed lower for TOP_HOLD (`held`: how long it has, per leaf), then over
 * TOP_FADE. True if `lit` changed. Allocates nothing.
 */
export function easeLit(lit: Float32Array, held: Float32Array, i: number, target: number, dt: number): boolean {
  const was = lit[i];
  if (target >= was) {
    held[i] = 0;
    lit[i] = Math.min(target, was + dt / TOP_EASE);
  } else {
    held[i] += dt;
    if (held[i] > TOP_HOLD) lit[i] = Math.max(target, was - dt / TOP_FADE);
  }
  return lit[i] !== was;
}
