import { hypot2 } from '../core/vec';
import { canDigHere } from './digSpot';
import { findBurrow } from './burrows';
import { canReuseHere } from './burrowReuse';
import type { MoveState } from './burrowMoves';

/**
 * canDigAt (up to about 160 us) is asked again only once the head has moved this far or turned
 * this much since it was last asked, or as Action goes down (a press acts on a fresh answer).
 */
export const DIG_RECHECK = 0.05;
export const DIG_RETURN = (2 * Math.PI) / 180;
const wrap = (a: number): number => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

/**
 * The game's dig spot (BurrowGame): whether the worm may dig down where it lies, and into what.
 * Beside an old burrow (an opening of it, or where it was dug: burrows.ts findBurrow) the dig goes
 * back into it along its own cut where that works from here (burrowReuse.ts canReuseHere; the
 * game's `reuse` names it), else into a new burrow where canDigAt allows one. The answer is kept
 * until the head has moved or turned enough (DIG_RECHECK, DIG_RETURN). Allocates nothing.
 */
export class DigAsk {
  /** The last answer. */
  canDig = false;
  private x = NaN;
  private z = NaN;
  private h = NaN;

  /** The next ask is a fresh one. */
  forget(): void {
    this.x = NaN;
  }

  /** Whether the worm in `g` may dig here (sets `g.reuse`), asked afresh when `force`. */
  ask(g: MoveState, force: boolean): boolean {
    const c = g.crawl;
    const h = c.motion.head;
    const a = c.motion.heading;
    if (force || !(hypot2(h.x - this.x, h.z - this.z) <= DIG_RECHECK) || Math.abs(wrap(a - this.h)) > DIG_RETURN) {
      const k = findBurrow(g.burrows, g.openings, h);
      g.reuse = k >= 0 && canReuseHere(g.burrows.slabs[k]!, c.motion, c.body) ? k : -1;
      this.canDig = g.reuse >= 0 || canDigHere(c.motion, c.body);
      this.x = h.x;
      this.z = h.z;
      this.h = a;
    }
    return this.canDig;
  }
}
