import { advanceWave } from '../worm/wormShape';
import { wormBody } from '../worm/bodyLength';
import { boundaryOf, bound, B_TOP, type Slab } from './slab';
import { markTop } from './burrowTop';
import type { SoilGrid } from './soilGrid';
import { ahead, soilAhead } from './soilFeel';
import { castTail, digTunnel, CAST_EVERY, CAST_WINDOW, TUNNEL_R } from './burrowTrail';
import type { Burrower } from './burrower';
import type { Solids } from './solids';
import { TOP_KEEP } from './solidShapes';
import {
  decideBacking, keepOut, roomToTurn, spendBacking, stickNow, BACK_SPEED, BACK_STRAIGHT, BOTTOM_KEEP, END_KEEP, STICK_DEAD as DEAD,
  STUCK_REACH, STUCK_SHARE,
} from './burrowBack';
import { backAlong } from './bodyTrail';
import { hypot2 } from '../core/vec';

/**
 * The worm digging in the cut's plane (V2 spec 6): the same 16-point body as on the surface,
 * steered by pointing (the stick or arrows give the way the head should go, on screen), turning at
 * a limited rate. Fast in its own tunnel, slower eating new soil, slower still in A, E and B;
 * stones and big roots stop it and it slides along them. It leaves an open tunnel and, every few
 * body lengths, a casting. Pure; allocates nothing per step.
 */
/** Open tunnel radius, and a casting every this far (burrowTrail.ts). */
export { TUNNEL_R, CAST_EVERY };
/** The worm in the cut, made and placed (burrower.ts). */
export { createBurrower, placeBurrower, type Burrower } from './burrower';
/** Most the head turns per second toward the way pointed. */
export const DIG_TURN = 2.6;
/**
 * ...and its path turns no tighter than this radius (u) at the speed it goes: turning fast while
 * all but still, it dug corners sharper than this, which put an elbow in the body (it bends as its
 * tunnel does)...
 */
export const MIN_TURN_R = 0.35;
/** ...but it can still turn this fast (radians a second) when it hardly moves... */
export const TURN_FLOOR = 0.8;
/**
 * ...and it turns at DIG_TURN pressed against a stone, root, the top, the slab's ends or bottom,
 * easing back to the limit over this long once free again (turning away from them is how it gets
 * out; held there, it backed up in fits and starts).
 */
const FREE_S = 0.3;
/** The head never comes nearer than this to the litter's top (solidShapes.ts). */
export { TOP_KEEP };
/** Where the head is against the top: at it (Action = Come up), and near it (the climb out starts there): burrowTop.ts. */
export { NEAR_TOP_IN, NEAR_TOP_OUT } from './burrowTop';
/**
 * The head eases to a stop within this of the slab's ends, its bottom and the line TOP_KEEP under
 * the leaves' top: only its motion toward that limit slows (smoothly, from nothing at the band's
 * edge), so it still slides along it. A one-frame stop there read as a glass wall.
 */
const WALL_BAND = 0.35;
/** Head within this of its neck's way: farther, it turned back into its own neck. */
const MAX_NECK_BEND = 0.6;
/**
 * Past that limit the head is eased back (this share a step, but never left more than BEND_LAG past
 * it), not snapped: it follows the neck's small sway without a turn that flicks back for a frame.
 */
const BEND_EASE = 0.15;
const BEND_LAG = 0.05;

/** Keeps the head's facing within MAX_NECK_BEND of its neck's way, eased back as above. */
function holdBend(b: Burrower): void {
  const neck = Math.atan2(b.v[0] - b.v[1], b.u[0] - b.u[1]);
  const bend = wrap(b.dir - neck);
  const over = Math.abs(bend) - MAX_NECK_BEND;
  if (over > 0) b.dir -= Math.sign(bend) * Math.max(over * BEND_EASE, over - BEND_LAG);
}
/** Peristalsis runs this much faster per unit moved while eating (spec 6). */
const EAT_WAVES = 1.9;
/**
 * The resting breath (the moves in and out use it too: burrowGame.ts). The peristalsis waves per
 * unit moved are the worm's length's (wormBody.wavesPerUnit: more for a shorter worm, bodyLength.ts).
 */
export const BREATH_HZ = 0.22;
/** Rates (1/s) of the two smoothing stages from the soil's speed to the worm's (two stages: no kink). */
const WANT_RATE = 12;
const SPEED_RATE = 8;
const EAT_RATE = 10;

const wrap = (a: number): number => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
/** How much of a move toward a limit `room` away is kept: 1 from WALL_BAND out, easing to 0 at it. */
function roomFor(room: number): number {
  const t = Math.min(1, Math.max(0, room / WALL_BAND));
  return t * t * (3 - 2 * t);
}
/**
 * Scratch for the calls below: points and limits go in objects, never as loose numbers (a number
 * passed to a call V8 does not inline is boxed on the heap: solidShapes.ts).
 */
const pt = { u: 0, v: 0 };
/**
 * How far (u) backAlong goes this step. It starts as a fraction: a field that first held a whole
 * number had V8 box every fractional value written to it later (burrower.ts).
 */
const backBy = { step: 0.5 };

/**
 * This step's way pointed (du, dv), its strength, and the speed the soil and the stick allow
 * (`target`): shared by the parts of a step below, which each take only objects (a number passed
 * to or returned from a call V8 does not inline is boxed on the heap: solidShapes.ts).
 */
const way = { du: 0, dv: 0, mag: 0, target: 0 };

/**
 * One fixed step. (du, dv): the way pointed, in the plane (u right along the cut, v up), each
 * -1..1; the caller maps screen directions to these. No input: the worm stops and breathes.
 */
export function stepBurrower(b: Burrower, s: Slab, g: SoilGrid, o: Solids, du: number, dv: number, dt: number): void {
  pointed.du = du;
  pointed.dv = dv;
  stepBurrowing(b, s, g, o, pointed, dt);
}

/** The way pointed, (du, dv), as stepBurrowing takes it. */
export interface Pointing { du: number; dv: number }
const pointed: Pointing = { du: 0, dv: 0 };

/** stepBurrower with the way pointed in `p`: the per-step form (BurrowGame's), boxing no numbers. */
export function stepBurrowing(b: Burrower, s: Slab, g: SoilGrid, o: Solids, p: Pointing, dt: number): void {
  const du = p.du;
  const dv = p.dv;
  b.prevU.set(b.u);
  b.prevV.set(b.v);
  b.prevDir = b.dir;
  b.prevWave.phase = b.wave.phase;
  b.prevWave.activity = b.wave.activity;
  const mag = Math.min(1, hypot2(du, dv));
  way.du = du;
  way.dv = dv;
  way.mag = mag;
  // Pointing behind or across the body while stuck: back up (burrowBack.ts decideBacking).
  // (Off the neck's way: the head itself never turns more than MAX_NECK_BEND off it.)
  stickNow.way = Math.atan2(dv, du);
  stickNow.mag = mag;
  stickNow.off = Math.abs(wrap(stickNow.way - Math.atan2(b.v[0] - b.v[1], b.u[0] - b.u[1])));
  const was = b.backing;
  decideBacking(b);
  // Each way starts from rest (the head never flips from one way to the other at speed).
  if (b.backing !== was) b.want = b.speed = 0;
  if (b.backing) {
    backStep(b, s, o, dt);
    return;
  }
  steer(b, g, dt);
  moveHead(b, s, o, dt);
  digOn(b, s, g, dt);
}

/**
 * Backing up (burrowBack.ts): the head's arc moves back along its trail and the body follows behind
 * it (bodyTrail.ts). The head rides the trail too and is not kept out of the solids: on a corner
 * rounded round a stone it may graze the stone's margin by up to about 0.017 u (measured
 * 2026-10-08; the tests allow 0.025), as the body does.
 */
function backStep(b: Burrower, s: Slab, o: Solids, dt: number): void {
  const n = b.u.length;
  const mag = way.mag;
  b.want += (BACK_SPEED * mag - b.want) * (1 - Math.exp(-WANT_RATE * dt));
  b.speed += (b.want - b.speed) * (1 - Math.exp(-SPEED_RATE * dt));
  b.eat = 0;
  b.eating = false;
  backBy.step = b.speed * dt;
  backAlong(b.trail, b, backBy);
  const moved = hypot2(b.u[n - 1] - b.prevU[n - 1], b.v[n - 1] - b.prevV[n - 1]);
  // The head keeps its facing, within its bend off the neck as the body moves under it.
  holdBend(b);
  // The tail at the trail's start (its tunnel's end): stop backing, and stay stopped while the stick
  // still points back (pointing back again tries again, once stuck). Pointing across the body, it
  // stops as soon as the head has room to turn that way.
  if (b.speed > 0.5 * BACK_SPEED * mag && moved < STUCK_SHARE * b.speed * dt) {
    spendBacking(b, false);
    b.want = b.speed = 0;
  } else if (stickNow.off < BACK_STRAIGHT && roomToTurn(b, s, o)) {
    spendBacking(b, true);
    b.want = b.speed = 0;
  }
  advanceWave(b.wave, moved, dt, 0.3, wormBody.wavesPerUnit, BREATH_HZ);
  markTop(b, s);
}

/** Turns the head toward the way pointed, and eases the speed toward what the soil ahead allows. */
function steer(b: Burrower, g: SoilGrid, dt: number): void {
  let target = 0;
  let fresh = 0;
  if (way.mag > DEAD) {
    const err = wrap(Math.atan2(way.dv, way.du) - b.dir);
    // At most DIG_TURN, and while free no tighter than MIN_TURN_R for the speed it goes (but TURN_FLOOR at rest).
    const held = Math.min(DIG_TURN, Math.max(TURN_FLOOR, b.speed / MIN_TURN_R));
    const most = (DIG_TURN + (held - DIG_TURN) * b.free) * dt;
    b.dir += Math.max(-most, Math.min(most, err));
    soilAhead(g, b);
    fresh = ahead.fresh;
    // Slower in a sharp turn, never coiling back into the neck.
    target = ahead.speed * way.mag * Math.max(0.35, 0.5 + 0.5 * Math.cos(err));
  }
  way.target = target;
  holdBend(b);
  b.want += (target - b.want) * (1 - Math.exp(-WANT_RATE * dt));
  b.speed += (b.want - b.speed) * (1 - Math.exp(-SPEED_RATE * dt));
  b.eat += (fresh - b.eat) * (1 - Math.exp(-EAT_RATE * dt));
  b.eating = b.eat > 0.5;
}

/** Moves the head inside the slab and under the leaves' top, easing to a stop at them; out of stones and roots. */
function moveHead(b: Burrower, s: Slab, o: Solids, dt: number): void {
  const lo = s.playLo + END_KEEP;
  const hi = s.playHi - END_KEEP;
  const h0 = b.u[0];
  const v0 = b.v[0];
  let mu = Math.cos(b.dir) * b.speed * dt;
  let mv = Math.sin(b.dir) * b.speed * dt;
  mu *= roomFor(mu > 0 ? hi - h0 : h0 - lo);
  if (mv > 0) {
    pt.u = h0;
    boundaryOf(s, B_TOP, pt);
  }
  mv *= roomFor(mv > 0 ? bound.v - TOP_KEEP - v0 : v0 - s.bottom - BOTTOM_KEEP);
  b.u[0] = Math.max(lo, Math.min(hi, h0 + mu));
  b.v[0] = Math.max(s.bottom + BOTTOM_KEEP, v0 + mv);
  keepOut(s, o, b.u, b.v, b.prevU, b.prevV, 0);
  // Pressed against something (it did not get where it aimed): free 0; else easing back up to 1.
  const au = Math.cos(b.dir) * b.speed * dt;
  const av = Math.sin(b.dir) * b.speed * dt;
  const missed = hypot2(b.u[0] - h0 - au, b.v[0] - v0 - av);
  b.free = missed > 0.05 * hypot2(au, av) + 1e-7 ? 0 : Math.min(1, b.free + dt / FREE_S);
}

/** After the head moves: stuck or not, the tunnel dug, the body after it, a casting, the wave. */
function digOn(b: Burrower, s: Slab, g: SoilGrid, dt: number): void {
  const moved = hypot2(b.u[0] - b.prevU[0], b.v[0] - b.prevV[0]);
  // Trying to move and getting nowhere: stuck (pointing back then backs up).
  b.tried += b.speed * dt;
  if (way.mag > DEAD && hypot2(b.u[0] - b.stuckU, b.v[0] - b.stuckV) < Math.max(STUCK_REACH, STUCK_SHARE * b.tried)) b.stuck += dt;
  else {
    b.stuck = b.tried = 0;
    b.stuckU = b.u[0];
    b.stuckV = b.v[0];
  }
  digTunnel(b, g);
  b.sinceCast += moved;
  if (b.sinceCast >= CAST_EVERY) {
    b.sinceCast = 0;
    b.castLeft = CAST_WINDOW;
    castTail(b, g, false);
  } else if (b.castLeft > 0) castTail(b, g, true);
  const full = Math.max(0.3, way.target);
  advanceWave(b.wave, moved * (1 + (EAT_WAVES - 1) * b.eat), dt, full, wormBody.wavesPerUnit, BREATH_HZ);
  markTop(b, s);
}
