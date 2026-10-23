import { boundaryOf, bound, B_F, B_TOP, type Slab } from './slab';
import { canEmergeAt, type EmergeMap } from './emergeMap';
import { TOP_KEEP } from './solidShapes';
import { END_KEEP, STICK_DEAD } from './burrowBack';
import type { Burrower } from './burrower';
import type { Pointing } from './burrowMotion';
import { hypot2 } from '../core/vec';
import { startUp, type MoveState } from './burrowMoves';

/**
 * Heading out (V4 hot fix: "if worm is at the top, then space bar allows them to exit"). At the top
 * (burrowTop.ts `atTop`) Action always comes up. Where the climb out can start at once (`nearTop`
 * and the emerge map allows it: the whole body could lie out on the floor, clear of the trunks,
 * rocks and the log) it does. Elsewhere the worm first crawls, under the leaves, to the nearest
 * place along the cut where it can, then comes up there: the burrower digs its own way (it slides
 * along stones and roots as ever), pointed at that place. It was refused before: the map is often
 * blocked near a rock, a trunk or the log, and at the slab's ends, which sit by the play area's
 * edge or a prop (about one sample in six), and there Action only switched the view.
 *
 * The player's stick, pushed afresh, takes the worm back (heading out ends). Pressed into something
 * (no nearer for HEAD_STUCK_S), it tries the nearest place the other way, once; after that it comes
 * up where it is if it can start the climb there (the body may then lie over a prop's edge), or it
 * gives the worm back. Allocates nothing.
 */

/** A place to come up is this far inside the playable slab's ends (the head keeps END_KEEP inside them). */
const END_ROOM = END_KEEP + 0.1;
/** The map is searched this finely (its own samples are 0.05 apart). */
const SEARCH_STEP = 0.05;
/** A place with this much room either side that still allows coming up is preferred (it is not missed by a hair). */
const SPARE = 0.1;
/** Aimed at this far above the litter's bottom (nearTop starts NEAR_TOP_IN below it), under the top's keep. */
const AIM_UP = 0.08;
/** Getting no nearer than BETTER for this long is stuck... */
const HEAD_STUCK_S = 1.5;
const BETTER = 0.04;
/** ...and heading out gives up after this long all told. */
const MOST_S = 14;

/** How heading out is going (BurrowGame keeps one; meaningful while the burrower's `outTo` is a number). */
export interface HeadOut {
  /** Seconds since it began, and since it last got BETTER nearer. */
  t: number;
  since: number;
  /** The nearest it has been to the place it heads for. */
  best: number;
  /** Places tried. */
  tries: number;
  /** The stick has been let go since heading out began (a push after that takes the worm back). */
  free: boolean;
  /** The way it points the burrower, as stepBurrowing takes it. */
  readonly way: Pointing;
  /** What headOut did this step: took care of Action (the caller leaves the mode machine be); started coming up. */
  handled: boolean;
  cameUp: boolean;
}

export function createHeadOut(): HeadOut {
  return { t: 0.5, since: 0.5, best: 0.5, tries: 0, free: false, way: { du: 0, dv: 0 }, handled: false, cameUp: false };
}

/**
 * BurrowGame's step underground, as far as heading out goes, before the burrower's step: a fresh
 * press at the top where the climb out cannot start at once starts heading out; heading out, the
 * worm is pointed by it (presses do nothing), and comes up once there. Returns the way to point the
 * burrower (the player's `stick`, or heading out's way). Sets `o.handled` when it took care of
 * Action (the caller does not step the mode machine), and `o.cameUp` when the worm started coming
 * up (startUp done: nothing more to step).
 */
export function headOut(g: MoveState, o: HeadOut, action: boolean, fresh: boolean, reduced: boolean, stick: Pointing, dt: number): Pointing {
  const w = g.worm;
  const s = g.slab!;
  o.handled = o.cameUp = false;
  const going = w.outTo === w.outTo;
  if (!going) {
    if (!fresh || !w.atTop || g.nearTop) return stick;
    startOut(o, w, s, g.emerge, hypot2(stick.du, stick.dv) > STICK_DEAD);
  }
  o.handled = true;
  g.machine.hold(action);
  const got = outStep(o, w, s, g.emerge, stick, o.way, dt);
  if (got === 'ready' || (got === 'stuck' && w.nearTop)) {
    w.outTo = NaN;
    g.machine.comeUpNow(reduced);
    startUp(g);
    o.cameUp = true;
    return stick;
  }
  if (got === 'stuck') w.outTo = NaN;
  return got === 'going' ? o.way : stick;
}

/** What a step of heading out came to. */
export type OutStep = 'going' | 'ready' | 'stuck' | 'cancelled';

/** The way to the place found, and where it is (scratch: no number crosses a call). */
const find = { u: 0.5, side: 0 };

/** Whether the worm could come up with its head at `u`, with SPARE either side if `spare`. */
function goodAt(m: EmergeMap, u: number, spare: boolean): boolean {
  return canEmergeAt(m, u) && (!spare || (canEmergeAt(m, u - SPARE) && canEmergeAt(m, u + SPARE)));
}

/**
 * The nearest place to the head's u where it could come up (into `find.u`; NaN: none), on the side
 * `find.side` (+1 along +u, -1 along -u, 0 either), inside the playable slab.
 */
function nearestPlace(m: EmergeMap, s: Slab, from: number): void {
  const side = find.side;
  const lo = s.playLo + END_ROOM;
  const hi = s.playHi - END_ROOM;
  find.u = NaN;
  for (let pass = 0; pass < 2 && find.u !== find.u; pass++) {
    const spare = pass === 0;
    for (let k = 0; k * SEARCH_STEP <= hi - lo + Math.abs(from); k++) {
      const d = k * SEARCH_STEP;
      if (side >= 0 && from + d >= lo && from + d <= hi && goodAt(m, from + d, spare)) {
        find.u = from + d;
        break;
      }
      if (side <= 0 && from - d >= lo && from - d <= hi && goodAt(m, from - d, spare)) {
        find.u = from - d;
        break;
      }
    }
  }
}

/**
 * Starts heading out from where the head is: `w.outTo` set to the nearest place to come up, or
 * straight up where the map has none (it then comes up where it is, once at the top: outStep).
 * `stickHeld`: the player's stick is pushed now.
 */
export function startOut(o: HeadOut, w: Burrower, s: Slab, m: EmergeMap, stickHeld: boolean): void {
  find.side = 0;
  nearestPlace(m, s, w.u[0]);
  w.outTo = find.u === find.u ? find.u : w.u[0];
  o.t = o.since = o.tries = 0;
  o.best = Infinity;
  o.free = !stickHeld;
}

/** Where the head aims while heading out (scratch). */
const aim = { u: 0.5, v: 0.5 };

/**
 * One step of heading out, before the burrower's step: fills `way` with the way to point (toward
 * the place, up to just above the litter's bottom). `stick`: the player's stick, as pointed. Returns
 * 'cancelled' (the player took over: `way` is theirs), 'ready' (the climb out can start: come up
 * now), 'stuck' (no way there: see BurrowGame) or 'going'.
 */
export function outStep(o: HeadOut, w: Burrower, s: Slab, m: EmergeMap, stick: Pointing, way: Pointing, dt: number): OutStep {
  // Math.sqrt, not hypot2: a number returned from a call V8 does not inline is boxed (every step).
  const held = Math.sqrt(stick.du * stick.du + stick.dv * stick.dv) > STICK_DEAD;
  if (!held) o.free = true;
  else if (o.free) {
    w.outTo = NaN;
    return 'cancelled';
  }
  if (w.nearTop && canEmergeAt(m, w.u[0])) return 'ready';
  aim.u = w.outTo;
  boundaryOf(s, B_TOP, aim);
  const top = bound.v - TOP_KEEP - 0.02;
  boundaryOf(s, B_F, aim);
  aim.v = Math.min(top, bound.v + AIM_UP);
  const du = aim.u - w.u[0];
  const dv = aim.v - w.v[0];
  const d = Math.sqrt(du * du + dv * dv);
  o.t += dt;
  o.since += dt;
  if (d < o.best - BETTER) {
    o.best = d;
    o.since = 0;
  }
  if (o.since >= HEAD_STUCK_S || o.t >= MOST_S) {
    // The nearest place the other way, once (away from what it is pressed into).
    if (o.tries > 0 || o.t >= MOST_S) return 'stuck';
    o.tries++;
    find.side = du >= 0 ? -1 : 1;
    nearestPlace(m, s, w.u[0]);
    if (find.u !== find.u) return 'stuck';
    w.outTo = find.u;
    o.since = 0;
    o.best = Infinity;
  }
  way.du = d > 1e-6 ? du / d : 0;
  way.dv = d > 1e-6 ? dv / d : 1;
  return 'going';
}
