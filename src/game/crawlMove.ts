import { hypot2, copy3, type Vec2, type Vec3 } from '../core/vec';
import type { LocomotionOptions } from '../worm/locomotion';
import { followHead, followTail } from '../worm/body';
import { MAX_CLIMB } from '../surface/climbSurface';
import { pushOut, slideMove } from '../surface/obstacles';

/**
 * How the crawl's body moves over the forest floor (crawl.ts steps it): the head leading, or the
 * tail leading when the worm backs up (V4 hot fix: backing up on the surface, as underground). Only
 * the trunks are solid; the rocks and the log are crawled over (MAX_CLIMB, climbSurface.ts).
 * Allocates nothing.
 */

/** What gives the surface height (the belly's) at (x, z), and whether that is up on a rock or the log: the crawl. */
export interface RestAt {
  restAt(x: number, z: number): number;
  onProp(x: number, z: number): boolean;
}

/** keepPace halves its search this many times (the move to within 1/1000 of it). */
const PACE_HALVINGS = 10;

/** Backing up goes at this share of the crawl's speed (as stepWorm backs up). */
export const BACK_SHARE = 0.5;

/**
 * Keeps the pace up and down a rock or the log: the ground move from `from` (resting at from.y) to `to` is
 * shortened so that, with the rise or fall it makes, it is no longer than it was flat. So the worm
 * crawls up a rock or the log's flank at its own pace instead of shooting up it.
 */
export function keepPace(from: Vec3, to: Vec3, rest: RestAt): void {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const run = hypot2(dx, dz);
  // Only on a prop: the floor's own gentle slopes keep the crawl's plain pace (and the speed test's path).
  if (!(run > 1e-9) || (!rest.onProp(from.x, from.z) && !rest.onProp(to.x, to.z))) return;
  const rise = rest.restAt(to.x, to.z) - from.y;
  if (rise * rise < 1e-12) return;
  // The share of the move whose 3D length is the flat one: found by halving, since a steep wall at
  // a prop's foot can change the rise sharply within one step.
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < PACE_HALVINGS; k++) {
    const m = (lo + hi) / 2;
    const r = rest.restAt(from.x + dx * m, from.z + dz * m) - from.y;
    if ((run * m) * (run * m) + r * r <= run * run) lo = m;
    else hi = m;
  }
  to.x = from.x + dx * lo;
  to.z = from.z + dz * lo;
}

/**
 * Moves the ground point `p` from `from` toward where it is now: kept to the pace on slopes,
 * sliding along the trunks and inside the play area (half), then rested on the surface.
 */
export function moveOnFloor(from: Vec3, p: Vec3, radius: number, half: number, rest: RestAt): void {
  keepPace(from, p, rest);
  // Trunks are solid: the point slides along their edge, and stops in a notch where one crosses the
  // play area's edge (slideMove). pushOut is the safety net (a hair inside by rounding).
  slideMove(from, p, radius, half, MAX_CLIMB);
  pushOut(p, radius, MAX_CLIMB);
  p.y = rest.restAt(p.x, p.z);
}

/** The body follows `head`, each trailing segment kept out of trunks and on its own surface (head first up a pile). */
export function trailHead(body: Vec3[], head: Vec3, gap: number, radius: number, rest: RestAt): void {
  followHead(body, head, gap);
  for (let i = 1; i < body.length; i++) {
    pushOut(body[i], radius, MAX_CLIMB);
    body[i].y = rest.restAt(body[i].x, body[i].z);
  }
}

const from: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * The way the tail is backing (radians, as a heading), kept from step to step while the worm backs
 * up: steering turns it, and the tail's last segment only follows it gradually. A class keeps the
 * numbers plain fields (see followCamera's Spring).
 */
export class BackState {
  declare dir: number;
  declare on: boolean;
  /** How far the tail moved backing up in the last step. */
  declare moved: number;
  constructor() {
    this.dir = 0;
    this.on = false;
    this.moved = 0;
  }
}

/** The tail's way never bends more than this from its last segment (as the head's from its neck). */
const TAIL_BEND = 1.0;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Backs the worm up, tail first, for one step: `move.y` below 0 (how hard back), `move.x` steering.
 * The tail goes straight back along its own last segment, swinging toward the side pressed (the
 * stick pulled down and left backs the tail off to the left, as a car reverses), no tighter than
 * the crawl's turning circle; the rest of the body follows it, and the head follows the body.
 * Writes the new head into `head` and returns the new heading (along the neck); how far the tail
 * moved goes in `st.moved`. Set `st.on` false whenever the worm is not backing, so the next back
 * starts straight along the tail.
 */
export function backUp(
  body: Vec3[], head: Vec3, heading: number, move: Vec2, dt: number, o: LocomotionOptions,
  gap: number, radius: number, rest: RestAt, st: BackState,
): number {
  const n = body.length;
  const tail = body[n - 1];
  const pre = body[n - 2];
  const tx = tail.x - pre.x;
  const tz = tail.z - pre.z;
  const along = hypot2(tx, tz) > 1e-6 ? Math.atan2(tx, tz) : heading + Math.PI;
  if (!st.on) st.dir = along;
  st.on = true;
  const dist = Math.min(1, -move.y) * BACK_SHARE * o.speed * dt;
  const maxTurn = o.minTurnRadius ? dist / o.minTurnRadius : Infinity;
  // Kept within TAIL_BEND of the tail's last segment, in the same turn as it (no wrapping jumps).
  let bend = st.dir + clamp(move.x * o.turnRate * dt, -maxTurn, maxTurn) - along;
  bend -= 2 * Math.PI * Math.round(bend / (2 * Math.PI));
  const dir = along + clamp(bend, -TAIL_BEND, TAIL_BEND);
  st.dir = dir;
  copy3(from, tail);
  tail.x = clamp(tail.x + Math.sin(dir) * dist, -o.halfSize, o.halfSize);
  tail.z = clamp(tail.z + Math.cos(dir) * dist, -o.halfSize, o.halfSize);
  moveOnFloor(from, tail, radius, o.halfSize, rest);
  st.moved = hypot2(tail.x - from.x, tail.z - from.z);
  followTail(body, tail, gap);
  for (let i = n - 2; i >= 0; i--) {
    pushOut(body[i], radius, MAX_CLIMB);
    body[i].y = rest.restAt(body[i].x, body[i].z);
  }
  copy3(head, body[0]);
  const nx = body[0].x - body[1].x;
  const nz = body[0].z - body[1].z;
  if (!(hypot2(nx, nz) > 1e-6)) return heading;
  // The same angle as before, give or take whole turns (the camera's yaw is never wrapped).
  const a = Math.atan2(nx, nz);
  return heading + (a - heading - 2 * Math.PI * Math.round((a - heading) / (2 * Math.PI)));
}
