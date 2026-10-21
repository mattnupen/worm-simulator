import type { Vec2 } from '../core/vec';
import type { Crawl } from '../game/crawl';
import type { WormMotion } from '../worm/locomotion';
import { digSignOf } from './burrowReuse';
import { startDig, type MoveState } from './burrowMoves';
import { canDigHere } from './digSpot';
import type { DigAsk } from './digAsk';
import type { Slab } from './slab';

/**
 * Digging back down into an old burrow from beside its cut (V4 spec 4.1). The sink (sinkPath.ts)
 * can slide a head that lies a little off the cut's plane into it, but only a little: farther, a
 * point of the body slides one way as the body turns the other, and stops and doubles back
 * (measured: clean within 0.03 u, whole reversals from 0.2 u). So where Dig down is pressed beside
 * an old burrow's cut, the worm first crawls itself onto it, as the crawl crawls (smooth by
 * construction), slanting in at no more than 45 degrees along the way it faces, and digs once its
 * head is in the plane. The stick takes the worm back at once (no dig), and so does running out of
 * time (round something in the way). On the cut, the dig is asked afresh, as for a press.
 * Allocates nothing.
 */

/** A head this close (u) to an old cut's plane is in it: the sink slides it the rest. */
export const ON_CUT = 0.03;
/** The crawl onto the cut gives up after this long (seconds). */
export const APPROACH_S = 4;
/** It slants in at most this steeply, easing in over about this distance (u) from the plane. */
const SLANT = Math.PI / 4;
const EASE_IN = 0.25;
/** How hard it steers toward the way it wants (turn per radian off it), and stick past this takes over. */
const STEER = 4;
const STICK = 0.5;

export interface Approach {
  /** The burrow (burrows.ts slot) being crawled onto, or -1: none. */
  burrow: number;
  /** Seconds so far, and the way along the cut it crawls (+1 along u, -1 against: the way it faced). */
  t: number;
  sign: number;
  /** The stick the crawl is given each step. */
  readonly move: Vec2;
}

export function createApproach(): Approach {
  return { burrow: -1, t: 0, sign: 1, move: { x: 0, y: 0 } };
}

/** The head's distance off the slab's plane (u, signed: + on the camera's side). */
export function acrossCut(s: Slab, head: { readonly x: number; readonly z: number }): number {
  return (head.x - s.ox) * s.nx + (head.z - s.oz) * s.nz;
}

/**
 * Begins the crawl onto burrow `k`'s cut (slab `s`) when the head (`m`) lies off it; false (and
 * nothing begun) when it is already on it: dig at once.
 */
export function startApproach(a: Approach, k: number, s: Slab, m: WormMotion): boolean {
  if (Math.abs(acrossCut(s, m.head)) <= ON_CUT) return false;
  a.burrow = k;
  a.t = 0;
  a.sign = digSignOf(s, m);
  return true;
}

/**
 * One step of the crawl onto the cut (slab `s`) with the player's stick `stick`: 1 once the head is
 * in the plane (dig now), 0 on the way, -1 given up (the stick moved, or APPROACH_S passed).
 */
export function stepApproach(a: Approach, c: Crawl, s: Slab, stick: Vec2, dt: number): number {
  if (Math.abs(stick.x) > STICK || Math.abs(stick.y) > STICK || a.t > APPROACH_S) return -1;
  a.t += dt;
  const m = c.motion;
  // The way it faces along the cut, slanted toward the plane (less as it nears it).
  const w = acrossCut(s, m.head);
  const f = a.sign;
  const b = Math.min(SLANT, Math.atan(Math.abs(w) / EASE_IN));
  const toward = w > 0 ? -1 : 1;
  const dx = Math.cos(b) * f * s.tx + Math.sin(b) * toward * s.nx;
  const dz = Math.cos(b) * f * s.tz + Math.sin(b) * toward * s.nz;
  const off = Math.atan2(dx, dz) - m.heading;
  const err = off - 2 * Math.PI * Math.round(off / (2 * Math.PI));
  // Turning right (x > 0) lowers the heading (locomotion.ts).
  a.move.x = Math.max(-1, Math.min(1, -STEER * err));
  a.move.y = 1;
  c.step(dt, a.move);
  return Math.abs(acrossCut(s, m.head)) <= ON_CUT ? 1 : 0;
}

/**
 * The dig-down started as a press would start it (the machine fed one press: its own edge then
 * reads Action as held, so a press still held does not act again). False if the machine would not
 * dig (not on the surface).
 */
export function pressDig(g: MoveState, reduced: boolean): boolean {
  const m = g.machine;
  m.hold(false);
  if (m.step(true, true, false, reduced, 0) !== 'startDig') return false;
  startDig(g);
  return true;
}

/**
 * A surface step while crawling onto an old burrow's cut (BurrowGame, `a.burrow` set): the crawl
 * steered (stepApproach), Action watched (a press meanwhile does nothing). On the cut, the dig is
 * asked afresh (`dig`) and starts as a press would: back into the burrow at hand if it works from
 * here and the head is in its plane, else into a new one if canDigAt allows; or nothing.
 */
export function approachStep(g: MoveState, a: Approach, dig: DigAsk, stick: Vec2, dt: number, action: boolean, reduced: boolean): void {
  g.machine.hold(action);
  const r = stepApproach(a, g.crawl, g.burrows.slabs[a.burrow]!, stick, dt);
  if (r === 0) return;
  a.burrow = -1;
  if (r < 0 || !dig.ask(g, true)) return;
  const c = g.crawl;
  if (g.reuse >= 0 && Math.abs(acrossCut(g.burrows.slabs[g.reuse]!, c.motion.head)) > ON_CUT) g.reuse = -1;
  if (g.reuse >= 0 || canDigHere(c.motion, c.body)) pressDig(g, reduced);
}
