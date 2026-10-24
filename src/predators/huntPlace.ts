import type { BurrowGame } from '../underground/burrowGame';
import { headCatchable, ROBIN_BEHIND, type Hold } from '../underground/burrowGrab';
import { slabU, slabX, slabZ } from '../underground/slab';
import { litterTopHeight } from '../surface/litterDepth';
import { crawlSurface, wormSurface, type WormSurface } from '../worm/surfaceHeight';
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
 * in the top two layers. Revision 4: a worm digging down or coming up, or up on a rock or the log,
 * is out of reach only for now (`wait`): the robin keeps after it from where it stands, and walks
 * over to the spot above a worm that dug down.
 */
export function readWorm(g: BurrowGame, w: HuntInput): void {
  const m = g.mode.mode;
  const s = g.slab;
  w.wait = false;
  w.ax = 0;
  w.az = 0;
  if (m === 'surface') {
    const c = g.crawl.motion;
    w.under = false;
    // Not while up on a rock or the log (V4 hot fix, 2026-10-23): the grab's side view cuts the
    // ground under the worm, so a raised worm would hang over it. The robin waits for it to come down.
    const up = onProp(c.head.x, c.head.z);
    w.catchable = g.approach.burrow < 0 && !up;
    w.wait = up;
    w.hx = c.head.x;
    w.hz = c.head.z;
    w.heading = c.heading;
  } else if ((m === 'underground' || m === 'diggingDown') && s) {
    // Digging down, the head goes in at the hole (the slab's origin, u = 0).
    const dig = m === 'diggingDown';
    const hu = dig ? 0 : g.worm.u[0];
    w.under = true;
    w.catchable = !dig && headCatchable(s, hu, g.worm.v[0]);
    w.wait = dig;
    w.hx = slabX(s, hu) - s.nx * ROBIN_BEHIND;
    w.hz = slabZ(s, hu) - s.nz * ROBIN_BEHIND;
    w.ax = s.tx;
    w.az = s.tz;
    // It lands toward the slab's middle, where there's room on screen.
    const side = hu > (s.playLo + s.playHi) / 2 ? -1 : 1;
    w.heading = Math.atan2(side * s.tx, side * s.tz);
  } else {
    // Coming up: where it was last (the robin waits for it to come out).
    w.catchable = false;
    w.wait = true;
  }
}

const floor: WormSurface = { y: 0 };
const ride: WormSurface = { y: 0 };
/** The worm's head is up on a rock or the log: the crawl's surface is above the plain floor (and mounds). */
function onProp(x: number, z: number): boolean {
  return crawlSurface(x, z, ride).y - wormSurface(x, z, floor).y > 0.2;
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
