import { createPressEdge } from '../input/actionEdge';
import { createGrip, startGrip, stepGrip, type GripEvent } from './grip';
import type { GripLook } from './huntPose';

/**
 * The grip mini-game in play (V4, Matt 2026-10-22): the grip (grip.ts) fed with Action presses
 * (Space or the on-screen button: a press edge of the held level) and taps on the game itself, and
 * how the robin looks holding the worm (GripLook, for huntPose.ts): how far out the worm is, the
 * robin leaning back and yanking through each pull, and its bill opening as it regrips.
 * Allocates nothing per step.
 */

/** The worm follows its place this fast (1/s): a pull you can see, not a snap. */
const LEVEL_RATE = 9;
/** A pull's lean comes in and goes out over this long (s)... */
const LEAN_S = 0.15;
/** ...with a jerk this many times a second on top (under 3: a yank, never a flicker). */
const YANK_HZ = 2.5;

const ease = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const bump = (k: number): number => (k <= 0 || k >= 1 ? 0 : Math.sin(Math.PI * k));

export class HuntGrab {
  readonly grip = createGrip();
  // Starting as fractions (V8 boxes every fraction written to a field that first held a whole number).
  readonly look: GripLook = { level: 0.5, loosen: 0.5, tug: 0.5 };
  private readonly edge = createPressEdge();
  private tapped = false;

  /** A new grab. */
  start(): void {
    startGrip(this.grip);
    this.look.level = this.grip.pos;
    this.look.loosen = 0;
    this.look.tug = 0;
    this.tapped = false;
  }

  /** A tap on the game (the canvas, on a touch screen or with a mouse): this step's press. */
  tap(): void {
    this.tapped = true;
  }

  /**
   * Every game step, grabbing or not, with the held Action level, so Space held from before the grab
   * is not a press in it. `grabbing`: the robin holds the worm now. Returns what this step did.
   */
  step(dt: number, action: boolean, grabbing: boolean, rand: () => number): GripEvent {
    const pressed = this.edge.update(action) || this.tapped;
    this.tapped = false;
    if (!grabbing) return 'none';
    const g = this.grip;
    const ev = stepGrip(g, dt, pressed, rand);
    const l = this.look;
    l.level += (g.pos - l.level) * (1 - Math.exp(-LEVEL_RATE * dt));
    if (g.phase === 'pull') {
      // Leaning back hard through the pull, with a jerk now and then: the yank.
      const k = ease(g.t / LEAN_S) * ease((g.dur - g.t) / LEAN_S);
      l.tug = k * (0.75 + 0.25 * Math.sin(2 * Math.PI * YANK_HZ * g.t));
      l.loosen = 0;
    } else {
      // The bill opens a little and closes again for a new grip.
      l.tug = 0;
      l.loosen = g.pulls > 0 ? bump(g.t / g.dur) : 0;
    }
    return ev;
  }
}
