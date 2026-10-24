import { B_H } from '../underground/slab';

/**
 * The robin hunt's tuning table (hunt.ts): every number in one place, so they can change after Matt
 * plays it.
 */
/** Seconds and centimetres. */
export const HUNT = {
  /** Time on the surface before a robin comes: from `waitMin` to `waitMin + waitSpread` seconds. */
  waitMin: 20,
  waitSpread: 20,
  /** It lands this far from the worm's head (on the surface)... */
  landCm: 100,
  /** ...or this far along the cut from the spot above the head (underground: on screen in the side view). */
  landUnderCm: 32,
  /** ...somewhere in front of the worm, within this angle either side, so the player sees it. */
  landSpread: 0.8,
  /** Flying in, then settling on its legs. */
  flyIn: 1.2,
  settle: 0.3,
  /** Each stare: from `stareMin` to `stareMin + stareSpread` seconds. */
  stareMin: 1.5,
  stareSpread: 1.0,
  /** Each run: up to `dashCm` closer (`runCm` after a worm crawling away), at `runSpeed` cm a second. */
  dashCm: 32,
  runCm: 60,
  runSpeed: 64,
  /** A run takes at least this long (a few quick steps). */
  dashTime: 0.25,
  /** A worm crawling away (this many cm further than when the stare began) cuts the stare short after `react` s. */
  creepCm: 2,
  react: 0.4,
  /** Its bill reaches the worm's head from this far (between its feet and the head). */
  reachCm: 12,
  /** It strikes from up to this many reaches away, stepping in as it pecks (the worm may have moved). */
  lunge: 1.6,
  /** The strike: leaning in to peck. */
  strike: 0.35,
  /**
   * Underground, before the grab: it scratches the leaf litter with its feet for `scratch` s, then
   * probes and stabs down with its bill for `probe` s (the worm can still dig deeper and get away).
   */
  scratch: 0.8,
  probe: 0.9,
  /**
   * How deep the worm must dig to be away for good: below the top of this soil layer (B_H, the
   * humus: above it are the leaf litter and the old leaves, the top two layers). The one escape
   * depth (burrowGrab.ts headCatchable reads it).
   */
  escapeLayer: B_H,
  /** After a miss: looks round, then goes. */
  missLook: 1.4,
  /** Flying off (and with the worm's tail end). */
  flyOff: 1.4,
} as const;
