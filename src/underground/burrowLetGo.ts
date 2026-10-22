import { WORM_SEGMENTS } from '../game/crawl';
import type { UV } from './slab';
import { digDiscAt, type Eaten } from './soilGrid';
import { placeBurrower, TUNNEL_R } from './burrowMotion';
import type { MoveState } from './burrowMoves';
import { saveBurrow } from './burrows';

/**
 * The two ends of a robin's grab in the side view (V4 spec revision 1; burrowGrab.ts holds the
 * worm until then): the worm let go back into its hole, or taken away whole. Allocates nothing.
 */

// Fields start as fractions: a field that first held a whole number had V8 box every fraction written later.
const pt: UV = { u: 0.5, v: 0.5 };
const ate: Eaten = { cells: 0.5, organic: 0.5 };

/** Let go: the burrower takes the worm over where it lies in its hole, facing the way its head points. */
export function releaseHold(g: MoveState): void {
  const w = g.worm;
  placeBurrower(w, w.u, w.v, w.dir, w.wave);
  g.offW.fill(0);
  g.prevW.fill(0);
  for (let i = 0; i < WORM_SEGMENTS; i++) {
    pt.u = w.u[i];
    pt.v = w.v[i];
    digDiscAt(g.grid, pt, TUNNEL_R, ate);
  }
  g.nearTop = false;
}

/**
 * Back to the surface view at once, the burrow's tunnels kept (the robin flies off with the whole
 * worm: the nest scene plays over the forest, then the new life starts in "your burrow").
 */
export function leaveBelow(g: MoveState): void {
  if (g.mode.mode !== 'surface' && !g.stage) saveBurrow(g.burrows, g.burrow, g.grid);
  g.machine.reset();
  g.stage = 0;
  g.nearTop = false;
}
