import type { BurrowGame } from '../underground/burrowGame';
import { headCatchable, ROBIN_BEHIND, type Hold } from '../underground/burrowGrab';
import { slabU, slabX, slabZ } from '../underground/slab';
import { litterTopHeight } from '../surface/litterDepth';
import type { HuntInput, HuntState } from './hunt';
import { huntPose, type GripLook } from './huntPose';
import type { Robin } from './robin';

/**
 * Where the hunt plays (V4 spec revision 1): what the robin can reach of the worm each step, and
 * where it stands to hold it in the side view. Allocates nothing.
 */

/**
 * Fills `w` from the game: on the surface the head; underground the spot on the ground above the
 * head, just behind the cut (the robin hunts along it, seen side on), catchable only with the head
 * in the top two layers; mid-move, out of reach. A robin hunting one way (surface or underground)
 * can't carry on the other: it misses and goes.
 */
export function readWorm(g: BurrowGame, h: HuntState, w: HuntInput): void {
  const m = g.mode.mode;
  const s = g.slab;
  if (m === 'surface') {
    const c = g.crawl.motion;
    w.under = false;
    w.catchable = g.approach.burrow < 0;
    w.hx = c.head.x;
    w.hz = c.head.z;
    w.heading = c.heading;
  } else if (m === 'underground' && s) {
    const hu = g.worm.u[0];
    w.under = true;
    w.catchable = headCatchable(s, hu, g.worm.v[0]);
    w.hx = slabX(s, hu) - s.nx * ROBIN_BEHIND;
    w.hz = slabZ(s, hu) - s.nz * ROBIN_BEHIND;
    // It lands toward the slab's middle, where there's room on screen.
    const side = hu > (s.playLo + s.playHi) / 2 ? -1 : 1;
    w.heading = Math.atan2(side * s.tx, side * s.tz);
  } else w.catchable = false;
  if (h.phase !== 'away' && h.under !== w.under) w.catchable = false;
}

const bent: GripLook = { level: 0, loosen: 0, tug: 0 };
const tip = { x: 0.5, y: 0.5, z: 0.5 };

/**
 * The robin onto the cut's line, just behind it (ROBIN_BEHIND), on the side of the hole it was
 * already on, facing the hole, and as far off as puts its bill over the hole when it bends right
 * down (level 0). Then the side view shows it side on, holding the worm straight up out of its hole.
 */
export function placeOnCut(g: BurrowGame, h: HuntState, hold: Hold, robin: Robin): void {
  const s = g.slab!;
  const side = Math.sign(slabU(s, h.x, h.z) - hold.holeU) || 1;
  h.yaw = Math.atan2(-side * s.tx, -side * s.tz);
  h.x = slabX(s, hold.holeU) - s.nx * ROBIN_BEHIND;
  h.z = slabZ(s, hold.holeU) - s.nz * ROBIN_BEHIND;
  huntPose(h, bent, litterTopHeight, robin.pose);
  robin.billTip(tip);
  const reach = slabU(s, tip.x, tip.z) - hold.holeU;
  h.x -= s.tx * reach;
  h.z -= s.tz * reach;
}
