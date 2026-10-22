import { createPressEdge } from '../input/actionEdge';
import { createRhythm, RHYTHM, startRhythm, stepRhythm, toTarget, type BeatCall } from './rhythm';
import type { GripLook } from './huntPose';

/**
 * The grip mini-game in play (V4 spec revision 1): the rhythm (rhythm.ts) fed with Action presses
 * (Space or the on-screen button: a press edge of the held level) and taps on the game itself, and
 * how the robin looks holding the worm (GripLook, for huntPose.ts): how far out it has pulled the
 * worm, its bill loosening as each ring meets the dot, and a tug after each miss.
 * Allocates nothing per step.
 */

/** How far out the worm starts (0 in, 1 out): the robin has its front end up. */
export const START_LEVEL = 0.45;
/** Each good tap pulls the worm this much back down (5 from the start: all the way in)... */
const GOOD_STEP = START_LEVEL / RHYTHM.goods;
/** ...and each miss lets the robin pull it this much out (3 from the start: out). */
const MISS_STEP = (1 - START_LEVEL) / RHYTHM.misses;
/** The worm moves to its new place this fast (1/s): a pull you can see, not a snap. */
const LEVEL_RATE = 7;
/** The bill loosens over this long either side of the ring meeting the dot. */
const LOOSEN_S = 0.3;
/** A miss's tug: the robin leans back hard for this long. */
const TUG_S = 0.45;

const ease = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const bump = (k: number): number => (k <= 0 || k >= 1 ? 0 : Math.sin(Math.PI * k));

export class HuntGrab {
  readonly rhythm = createRhythm();
  // Starting as fractions (V8 boxes every fraction written to a field that first held a whole number).
  readonly look: GripLook = { level: START_LEVEL, loosen: 0.5, tug: 0.5 };
  private readonly edge = createPressEdge();
  private tapped = false;

  /** A new grab. */
  start(): void {
    startRhythm(this.rhythm);
    this.look.level = START_LEVEL;
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
   * is not a press in it. `grabbing`: the robin holds the worm now. Returns this step's call.
   */
  step(dt: number, action: boolean, grabbing: boolean): BeatCall {
    const pressed = this.edge.update(action) || this.tapped;
    this.tapped = false;
    if (!grabbing) return 'none';
    const r = this.rhythm;
    const call = stepRhythm(r, dt, pressed);
    const l = this.look;
    const want = Math.min(1, Math.max(0, START_LEVEL - r.goods * GOOD_STEP + r.misses * MISS_STEP));
    l.level += (want - l.level) * (1 - Math.exp(-LEVEL_RATE * dt));
    const to = toTarget(r);
    if (r.phase === 'ring') l.loosen = ease(1 - Math.abs(to) / LOOSEN_S);
    else l.loosen *= Math.exp(-10 * dt);
    l.tug = r.phase === 'regrip' && r.call !== 'good' ? bump(r.t / TUG_S) : 0;
    return call;
  }
}
