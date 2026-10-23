import { NEST_TIMES } from './nestScript';

/**
 * Wiggling free on the way to the nest (V4 hot fix, Matt 2026-10-23): while the robin carries the
 * worm, each press of Space (or a tap on a touch screen) makes the worm thrash in the bill and adds
 * to a hidden meter that drains. Mashing fast keeps the meter high, and every press while it is
 * high rolls a small chance that the worm wriggles out and drops to the forest floor. Nothing on
 * screen tells the player about it (Matt: no text or button). Pure; allocates nothing.
 *
 * Game choice (src/content/text.ts nestWiggleChoice): real worms carried off by a bird rarely get
 * away like this; the escape chance is the game's.
 */
export const WIGGLE = {
  /** The worm can wiggle free from the catch until just before the robin lands on its nest (s). */
  from: 0,
  until: NEST_TIMES.land - 0.25,
  /** It thrashes on presses until shortly before it is fed (s). */
  thrashUntil: NEST_TIMES.fed - 1.5,
  /** Each press adds this much to the meter (0..1), which drains by `drain` a second. */
  add: 0.22,
  drain: 0.9,
  /** Presses with the meter at or above this roll `chance` each to break free. */
  threshold: 0.6,
  chance: 0.026,
  /** Each press kicks the thrash up by this much (0..1); it dies away at `thrashFade` a second. */
  kick: 0.65,
  thrashFade: 3,
  /** Reduced motion: the thrash this much smaller. */
  reducedScale: 0.35,
  /** After the drop: seconds of the fall and a moment on the floor before play goes on there. */
  fallHold: 1.7,
} as const;

export class NestWiggle {
  /** The hidden meter (0..1). */
  meter = 0;
  /** How hard the worm is thrashing now (0..1): the carried worm's motion reads it. */
  thrash = 0;
  /** The way the last press flung it (1 or -1): each press whips the other way. */
  side = 1;
  /** It broke free. */
  escaped = false;
  /** Wiggling counts in this scene (a hunt's catch; the Start preview only behind ?nestEscape=1). */
  on = false;

  reset(on: boolean): void {
    this.meter = 0;
    this.thrash = 0;
    this.side = 1;
    this.escaped = false;
    this.on = on;
  }

  /**
   * One press at scene time `t` (an edge: the caller feeds only key-down or tap moments, never a
   * held key). Returns true when this press breaks the worm free. `rand` in [0, 1).
   */
  press(t: number, rand: () => number): boolean {
    if (!this.on || this.escaped || t >= WIGGLE.thrashUntil) return false;
    this.thrash = Math.min(1, this.thrash + WIGGLE.kick);
    this.side = -this.side;
    if (t < WIGGLE.from || t >= WIGGLE.until) return false;
    this.meter = Math.min(1, this.meter + WIGGLE.add);
    if (this.meter >= WIGGLE.threshold && rand() < WIGGLE.chance) this.escaped = true;
    return this.escaped;
  }

  /** Can a press or tap wiggle now (the tap then wiggles instead of skipping)? */
  open(t: number): boolean {
    return this.on && !this.escaped && t < WIGGLE.until;
  }

  /** One simulation step: the meter drains, the thrash dies away. */
  step(dt: number): void {
    this.meter = Math.max(0, this.meter - WIGGLE.drain * dt);
    this.thrash *= Math.exp(-WIGGLE.thrashFade * dt);
  }
}
