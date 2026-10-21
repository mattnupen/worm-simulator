import type { Vec3 } from '../core/vec';
import type { WormMotion } from '../worm/locomotion';
import { chooseSide, cutHeading, digSpotOpen, ENTRY_ROOM } from './digSpot';
import { bodyFanOf, sweepClearOf } from './sinkSweep';
import { OPENING_MERGE } from './openings';
import { createSlab, slabSeed, type Slab } from './slab';
import { claimBurrow, useBurrow } from './burrows';
import type { MoveState } from './burrowMoves';

/**
 * Digging back down into an old burrow (V4 spec 4.1): into its own slab, so its tunnels come back
 * (burrows.ts), not a new one. The cut is the burrow's, never searched (digSpot.ts findCut), so the
 * dig test is its own, with the same rules: open ground at the head, room along the cut each side
 * of where the head goes in, and the body's turn into the cut clear of every footprint.
 *
 * The head goes in where it lies along the old cut (anywhere in it, not only at the old entry):
 * the sink (sinkPath.ts) slides it into the plane as the body turns, up to OPENING_MERGE across.
 * A worm facing against the cut's +u sinks mirrored (`digSignOf` -1: it dives toward -u and its
 * body lies out along +u), so the body never turns more than 90 degrees, whichever way it came.
 *
 * Where the old cut does not work from here (no room along it, or the turn would cross a
 * footprint), the dig is not a reuse: the worm digs a new burrow, as anywhere else, if canDigAt
 * allows. The old burrow stays kept, and its other openings still lead to it.
 * Pure; allocates nothing (canDigAt's cadence: every few steps for the prompt).
 */

/** The cut tried (through x, z along h), in an object: a number passed to a call V8 does not inline is boxed. */
const q = { x: 0, z: 0, h: 0 };

/** +1 when the worm (`m`, as Crawl.motion) faces along the slab's +u (or square to it), -1 against. */
export function digSignOf(s: Slab, m: WormMotion): number {
  return Math.sin(m.heading) * s.tx + Math.cos(m.heading) * s.tz >= 0 ? 1 : -1;
}

/**
 * Whether the worm (`m` and `body`, as Crawl.motion and Crawl.body) may dig down into the old slab
 * `s` from where it lies: open ground (digSpotOpen), its head within OPENING_MERGE of the cut's
 * plane and ENTRY_ROOM inside the playable slab along it, and the body's turn to lie back along
 * the cut clear of every footprint, both about the head and about where the hole ends in the plane.
 */
export function canReuseHere(s: Slab, m: WormMotion, body?: ArrayLike<Vec3>): boolean {
  if (!digSpotOpen(m)) return false;
  const dx = m.head.x - s.ox;
  const dz = m.head.z - s.oz;
  const u = dx * s.tx + dz * s.tz;
  const w = dx * s.nx + dz * s.nz;
  if (!(u >= s.playLo + ENTRY_ROOM && u <= s.playHi - ENTRY_ROOM) || Math.abs(w) > OPENING_MERGE) return false;
  // The cut's heading the way the head will dive (its body lies out the other way: sinkSweep.ts).
  const h = Math.atan2(s.tx, s.tz);
  q.h = digSignOf(s, m) > 0 ? h : h + Math.PI;
  bodyFanOf(m, body);
  q.x = m.head.x;
  q.z = m.head.z;
  if (!sweepClearOf(q)) return false;
  q.x = s.ox + s.tx * u;
  q.z = s.oz + s.tz * u;
  return sweepClearOf(q);
}

/**
 * The slab a dig-down at the head goes into (startDig, once per dig): the old burrow `g.reuse`
 * when the dig spot found one (its tunnels are put back as the soil is laid: buildStage), else a
 * new slab through the head along `cutHeading` (never the raw heading), the camera on
 * `chooseSide`'s side, seeded by the spot, in a burrow slot of its own. Either is now the burrow
 * the worm is in and "your burrow" (`home`); `digSign` is the way its head dives.
 */
export function slabForDig(g: MoveState): Slab {
  const c = g.crawl;
  const old = g.reuse >= 0 ? g.burrows.slabs[g.reuse] : null;
  if (old) {
    g.burrow = g.home = g.reuse;
    useBurrow(g.burrows, g.burrow);
    g.digSign = digSignOf(old, c.motion);
    return old;
  }
  const h = c.motion.head;
  const heading = c.motion.heading;
  const cut = cutHeading(h.x, h.z, heading, c.body) ?? heading;
  const s = createSlab(h.x, h.z, cut, chooseSide(h.x, h.z, heading, c.body), slabSeed(h.x, h.z));
  g.burrow = g.home = claimBurrow(g.burrows, s, g.openings);
  g.digSign = 1;
  return s;
}
