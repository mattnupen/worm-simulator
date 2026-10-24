import type { BurrowGame } from '../underground/burrowGame';
import {
  createHold, holdFromBelow, holdFromSurface, poseHeld, setBill, slideEnd, snapHeld, SLIDE_SPEED,
} from '../underground/burrowGrab';
import { releaseHold } from '../underground/burrowLetGo';
import { sagHeld } from '../underground/holdSag';
import { createPeck, digPeck, startPeck } from '../underground/burrowPeck';
import { frameHunt } from '../underground/huntFrame';
import { slabU } from '../underground/slab';
import { litterTopHeight } from '../surface/litterDepth';
import { HUNT, type HuntState } from './hunt';
import { huntPose, type GripLook } from './huntPose';
import { placeOnCut } from './huntPlace';
import type { Robin } from './robin';

/** The span's slack follows the robin's pull this fast (1/s). */
const SAG_RATE = 8;

/**
 * The worm in the robin's bill, in the side view (V4 spec revision 1): the grab's start (into the
 * cut at once, the robin onto the cut's line), each step its head following the bill and the rest
 * along its hole (burrowGrab.ts), and after it, the slide back down the hole before the burrower
 * has it again. HuntGame drives it. Allocates nothing per step.
 */
export class HeldWorm {
  private readonly hold = createHold();
  // Fields start as fractions: a field that first held a whole number had V8 box every fraction written later.
  private readonly bill = { x: 0.5, y: 0.5, z: 0.5 };
  /** After the grab: sliding down its hole until `slideTo` (then the burrower has it). */
  sliding = false;
  private slideTo = 0.5;
  /** How slack the span out of the ground is (0 taut .. 1), eased (holdSag.ts). */
  private sag = 0.5;
  /** The hole the robin digs above a worm underground before it grabs (revision 4). */
  private readonly peck = createPeck();

  constructor(private readonly game: BurrowGame, private readonly robin: Robin) {}

  /**
   * The robin has the worm (hunt `h` just entered its grab, looking as `look`). On the surface the
   * worm gets a burrow where it lies, its tail end down a new hole leaning away from the robin;
   * underground the robin pulls its front up through the litter. True from the surface (a cut).
   */
  grab(h: HuntState, look: GripLook): boolean {
    const g = this.game;
    const surface = g.mode.mode === 'surface';
    if (surface) {
      const c = g.crawl.motion;
      const ahead = (h.x - c.head.x) * Math.sin(c.heading) + (h.z - c.head.z) * Math.cos(c.heading);
      holdFromSurface(g, this.hold, ahead >= 0 ? 1 : -1);
    } else holdFromBelow(g, this.hold);
    // From now on this robin is on the cut's line, as one that came for a worm underground.
    h.under = true;
    placeOnCut(g, h, this.hold, this.robin);
    huntPose(h, look, litterTopHeight, this.robin.pose);
    this.robin.billTip(this.bill);
    setBill(this.hold, g.slab!, this.bill);
    snapHeld(g, this.hold);
    this.sag = 0;
    g.robinU = slabU(g.slab!, h.x, h.z);
    frameHunt(g, 0, surface);
    this.sliding = false;
    return surface;
  }

  /**
   * A step of the robin digging for the worm underground (hunt `h` in its dig): the hole above the
   * head opens as it scratches through the leaf litter, then probes down to the head.
   */
  dig(h: HuntState): void {
    const g = this.game;
    if (g.mode.mode !== 'underground') return;
    const u = g.worm.u[0];
    // A new hole for a new dig, or where the head has moved on to.
    if (h.t <= 0.05 || Math.abs(u - this.peck.u) > 0.3) startPeck(this.peck, u);
    const scratch = Math.min(1, h.t / HUNT.scratch);
    const probe = Math.min(1, Math.max(0, (h.t - HUNT.scratch) / HUNT.probe));
    digPeck(g, this.peck, scratch, probe, g.worm.v[0]);
  }

  /**
   * A step held: the head where the robin's bill is now (its pose set this step), `pulledUp` (0..1)
   * of the way up from where it was underground, and the side view's frame.
   */
  follow(dt: number, pulledUp: number, look: GripLook): void {
    const g = this.game;
    this.hold.pull = pulledUp;
    this.robin.billTip(this.bill);
    setBill(this.hold, g.slab!, this.bill);
    poseHeld(g, this.hold, dt);
    // Taut through a pull, slack as the robin eases off and regrips.
    this.sag += (1 - look.tug - this.sag) * Math.min(1, SAG_RATE * dt);
    sagHeld(g, this.hold, this.sag);
    if (Number.isFinite(g.robinU)) frameHunt(g, dt, false);
  }

  /** The robin lets go (or keeps only the tail end): the worm slides down its hole. */
  letGo(): void {
    this.sliding = true;
    this.slideTo = slideEnd(this.hold);
  }

  /** A step of the slide; at its end the burrower takes over (underground play goes on). */
  slide(dt: number): void {
    const hold = this.hold;
    const g = this.game;
    hold.slide = Math.min(this.slideTo, hold.slide + SLIDE_SPEED * dt);
    poseHeld(g, hold, dt);
    sagHeld(g, hold, this.sag);
    if (Number.isFinite(g.robinU)) frameHunt(g, dt, false);
    if (hold.slide < this.slideTo) return;
    this.sliding = false;
    releaseHold(g);
  }
}
