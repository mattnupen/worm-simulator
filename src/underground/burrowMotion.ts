import { advanceWave, type WaveState } from '../worm/wormShape';
import { WAVES, wormLength } from '../worm/wormMesh';
import { WORM_SEGMENTS, SPACING } from '../game/crawl';
import { boundaryAt, B_F, B_TOP, type Slab } from './slab';
import { cellAt, digDisc, castBlob, AIR, type Eaten, type SoilGrid } from './soilGrid';
import type { Solids } from './solids';
import { TOP_KEEP } from './solidShapes';
import { backUp, keepOut, BACK_ANGLE, BACK_SPEED, STUCK_REACH, STUCK_S, STUCK_SHARE, STUCK_TRIED } from './burrowBack';
import { CAST_SPEED, EAT_SPEED, TUNNEL_SPEED, type LayerId } from './layers';

/**
 * The worm digging in the cut's plane (V2 spec 6): the same 16-point body as on the surface,
 * steered by pointing (the stick or arrows give the way the head should go, on screen), turning at
 * a limited rate. Fast in its own tunnel, slower eating new soil, slower still in A, E and B;
 * stones and big roots stop it and it slides along them. It leaves an open tunnel and, every few
 * body lengths, a casting. Pure; allocates nothing per step.
 */
/** Open tunnel radius: about the body's half-width. */
export const TUNNEL_R = 0.14;
/** Most the head turns per second toward the way pointed. */
export const DIG_TURN = 2.6;
/** The head never comes nearer than this to the litter's top (solidShapes.ts). */
export { TOP_KEEP };
/** The head is "near the top" (Action = Come up) within this of the F top... */
export const NEAR_TOP_IN = 0.2;
/** ...and stops being near it below this (hysteresis: the prompt does not flicker at the line). */
export const NEAR_TOP_OUT = 0.35;
/** A casting every this far (about 1.3 body lengths). */
export const CAST_EVERY = 4.5;
const CAST_R = 0.15;
/** The body's points dig this wide (the body cuts corners, so every point keeps a tunnel). */
const BODY_DIG = TUNNEL_R * 0.85;
/**
 * A casting is left this far behind the tail: just out of the tail's own dig, so the body never
 * eats it (at the tail itself the next step's dig ate about 44% of each one).
 */
const CAST_BACK = BODY_DIG + CAST_R + 0.02;
/**
 * Where a casting finds no open tunnel to settle in (the tail swinging round a sharp turn, or an
 * earlier casting already there), it is tried again as the tail moves on, for up to this far,
 * until at least CAST_MIN cells fill.
 */
const CAST_WINDOW = 0.8;
const CAST_MIN = 2;
/**
 * The head eases to a stop within this of the slab's ends, its bottom and the line TOP_KEEP under
 * the leaves' top: only its motion toward that limit slows (smoothly, from nothing at the band's
 * edge), so it still slides along it. A one-frame stop there read as a glass wall.
 */
const WALL_BAND = 0.35;
/** The head's limits: this far inside the playable slab's ends, and above the slab's bottom. */
const END_KEEP = 0.2;
const BOTTOM_KEEP = 0.3;
const MAX_NECK_BEND = 1.3;
/**
 * Past that limit the head is eased back (this share a step, but never left more than BEND_LAG past
 * it), not snapped: it follows the neck's small sway without a turn that flicks back for a frame.
 */
const BEND_EASE = 0.15;
const BEND_LAG = 0.05;

/** Keeps the head's facing within MAX_NECK_BEND of its neck's way (`neck`), eased back as above. */
function holdBend(b: Burrower, neck: number): void {
  const bend = wrap(b.dir - neck);
  const over = Math.abs(bend) - MAX_NECK_BEND;
  if (over > 0) b.dir -= Math.sign(bend) * Math.max(over * BEND_EASE, over - BEND_LAG);
}
/** Peristalsis runs this much faster per unit moved while eating (spec 6). */
const EAT_WAVES = 1.9;
/** The resting breath, and the peristalsis waves per unit moved (the moves in and out use them too: burrowGame.ts). */
export const BREATH_HZ = 0.22;
export const WAVES_PER_UNIT = WAVES / wormLength(WORM_SEGMENTS, SPACING);
/** Stick input below this is no input. */
const DEAD = 0.15;
/**
 * The soil is felt this far ahead of the head, past its own dig (TUNNEL_R plus a cell's half
 * diagonal), and over a small spread: one cell would flick between open and fresh as the head
 * crosses the grid, and the speed with it.
 */
const FEEL_AHEAD = 0.24;
const FEEL = [[0, 0], [0, 0.08], [0, -0.08], [0.1, 0]] as const;
/** Rates (1/s) of the two smoothing stages from the soil's speed to the worm's (two stages: no kink). */
const WANT_RATE = 12;
const SPEED_RATE = 8;
const EAT_RATE = 10;

export interface Burrower {
  /** Body points head first: u along the cut, v world height. */
  readonly u: Float64Array;
  readonly v: Float64Array;
  readonly prevU: Float64Array;
  readonly prevV: Float64Array;
  /** The way the head faces, as an angle in the plane (0 = +u, pi / 2 = up). Unwrapped. */
  dir: number;
  prevDir: number;
  /** Current speed (eased toward `want`, itself eased toward what the soil and the stick allow). */
  speed: number;
  want: number;
  readonly wave: WaveState;
  readonly prevWave: WaveState;
  /** It is eating its way into fresh soil (not moving along an open tunnel). */
  eating: boolean;
  /** How much of the soil just ahead is fresh, eased (0..1): the peristalsis speeds up with it. */
  eat: number;
  /** Distance moved since the last casting. */
  sinceCast: number;
  /** How much farther the latest casting may still be tried (0: it landed, or none is due). */
  castLeft: number;
  /** How much of what it ate lately was leaves (0..1): darker castings. */
  gut: number;
  /** The head is near the litter (Action = Come up). */
  nearTop: boolean;
  /**
   * Seconds the head has tried to move (`tried`: how far its speed would have taken it) and stayed
   * near `stuckU`, `stuckV`, getting nowhere; and whether it is backing up (burrowBack.ts).
   */
  stuck: number;
  tried: number;
  stuckU: number;
  stuckV: number;
  backing: boolean;
}

export function createBurrower(): Burrower {
  const n = WORM_SEGMENTS;
  return {
    u: new Float64Array(n), v: new Float64Array(n), prevU: new Float64Array(n), prevV: new Float64Array(n),
    dir: -Math.PI / 2, prevDir: -Math.PI / 2, speed: 0, want: 0,
    wave: { phase: 0, activity: 0 }, prevWave: { phase: 0, activity: 0 },
    eating: false, eat: 0, sinceCast: 0, castLeft: 0, gut: 0.5, nearTop: false, stuck: 0, tried: 0, stuckU: 0, stuckV: 0, backing: false,
  };
}

/** Puts the body at the given points (head first), facing `dir`, still, with nothing to interpolate. */
export function placeBurrower(b: Burrower, us: ArrayLike<number>, vs: ArrayLike<number>, dir: number, wave: WaveState): void {
  for (let i = 0; i < b.u.length; i++) {
    b.u[i] = b.prevU[i] = us[i];
    b.v[i] = b.prevV[i] = vs[i];
  }
  b.dir = b.prevDir = dir;
  b.speed = b.want = 0;
  b.wave.phase = b.prevWave.phase = wave.phase;
  b.wave.activity = b.prevWave.activity = wave.activity;
  b.eating = false;
  b.eat = 0;
  b.sinceCast = 0;
  b.castLeft = 0;
  b.nearTop = false;
  b.stuck = b.tried = 0;
  b.stuckU = us[0];
  b.stuckV = vs[0];
  b.backing = false;
}

const wrap = (a: number): number => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
/** How much of a move toward a limit `room` away is kept: 1 from WALL_BAND out, easing to 0 at it. */
function roomFor(room: number): number {
  const t = Math.min(1, Math.max(0, room / WALL_BAND));
  return t * t * (3 - 2 * t);
}
const ate: Eaten = { cells: 0, organic: 0 };
/** What soilAhead felt: the speed it allows, and the share of it that is fresh soil. */
const ahead = { speed: 0, fresh: 0 };

/** The speed the soil just ahead of the head allows (into `ahead`), averaged over the FEEL points. */
function soilAhead(g: SoilGrid, u: number, v: number, dir: number): void {
  const cu = Math.cos(dir);
  const cv = Math.sin(dir);
  let sum = 0;
  let fresh = 0;
  let n = 0;
  for (let k = 0; k < FEEL.length; k++) {
    const along = FEEL_AHEAD + FEEL[k][0];
    const across = FEEL[k][1];
    const i = cellAt(g, u + cu * along - cv * across, v + cv * along + cu * across);
    if (i < 0) continue;
    n++;
    if (g.open[i]) sum += g.cast[i] ? CAST_SPEED : TUNNEL_SPEED;
    else if (g.layer[i] === AIR) sum += TUNNEL_SPEED * 0.5;
    else {
      sum += EAT_SPEED[g.layer[i] as LayerId];
      fresh++;
    }
  }
  ahead.speed = n ? sum / n : 0;
  ahead.fresh = n ? fresh / n : 0;
}

/**
 * One fixed step. (du, dv): the way pointed, in the plane (u right along the cut, v up), each
 * -1..1; the caller maps screen directions to these. No input: the worm stops and breathes.
 */
export function stepBurrower(b: Burrower, s: Slab, g: SoilGrid, o: Solids, du: number, dv: number, dt: number): void {
  const n = b.u.length;
  b.prevU.set(b.u);
  b.prevV.set(b.v);
  b.prevDir = b.dir;
  b.prevWave.phase = b.wave.phase;
  b.prevWave.activity = b.wave.activity;
  const mag = Math.min(1, Math.hypot(du, dv));
  const lo = s.playLo + END_KEEP;
  const hi = s.playHi - END_KEEP;
  // Pointing back against the body while stuck: back up (and on while it points back).
  // (Back is measured from the neck: the head itself never turns more than MAX_NECK_BEND off it.)
  const back = Math.abs(wrap(Math.atan2(dv, du) - Math.atan2(b.v[0] - b.v[1], b.u[0] - b.u[1]))) > BACK_ANGLE;
  const was = b.backing;
  b.backing = mag > DEAD && back && (b.backing || (b.stuck >= STUCK_S && b.tried >= STUCK_TRIED));
  // Each way starts from rest (the head never flips from one way to the other at speed).
  if (b.backing !== was) b.want = b.speed = 0;
  if (b.backing) {
    b.want += (BACK_SPEED * mag - b.want) * (1 - Math.exp(-WANT_RATE * dt));
    b.speed += (b.want - b.speed) * (1 - Math.exp(-SPEED_RATE * dt));
    b.eat = 0;
    b.eating = false;
    const moved = backUp(s, o, b.u, b.v, b.prevU, b.prevV, b.speed * dt, lo, hi, s.bottom + BOTTOM_KEEP);
    // The head keeps its facing, within its bend off the neck as the body moves under it.
    holdBend(b, Math.atan2(b.v[0] - b.v[1], b.u[0] - b.u[1]));
    // The tail blocked too: stop backing (pointing back again tries again once stuck).
    if (b.speed > 0.5 * BACK_SPEED * mag && moved < STUCK_SHARE * b.speed * dt) {
      b.backing = false;
      b.want = b.speed = 0;
    }
    advanceWave(b.wave, moved, dt, 0.3, WAVES_PER_UNIT, BREATH_HZ);
    b.nearTop = b.v[0] >= boundaryAt(s, B_F, b.u[0]) - (b.nearTop ? NEAR_TOP_OUT : NEAR_TOP_IN);
    return;
  }
  let target = 0;
  let fresh = 0;
  if (mag > DEAD) {
    const err = wrap(Math.atan2(dv, du) - b.dir);
    b.dir += Math.max(-DIG_TURN * dt, Math.min(DIG_TURN * dt, err));
    soilAhead(g, b.u[0], b.v[0], b.dir);
    fresh = ahead.fresh;
    // Slower in a sharp turn, never coiling back into the neck.
    target = ahead.speed * mag * Math.max(0.35, 0.5 + 0.5 * Math.cos(err));
  }
  const neck = Math.atan2(b.v[0] - b.v[1], b.u[0] - b.u[1]);
  holdBend(b, neck);
  b.want += (target - b.want) * (1 - Math.exp(-WANT_RATE * dt));
  b.speed += (b.want - b.speed) * (1 - Math.exp(-SPEED_RATE * dt));
  b.eat += (fresh - b.eat) * (1 - Math.exp(-EAT_RATE * dt));
  b.eating = b.eat > 0.5;
  // Inside the slab and under the leaves' top, easing to a stop at them; out of stones and roots.
  const h0 = b.u[0];
  const v0 = b.v[0];
  let mu = Math.cos(b.dir) * b.speed * dt;
  let mv = Math.sin(b.dir) * b.speed * dt;
  mu *= roomFor(mu > 0 ? hi - h0 : h0 - lo);
  mv *= roomFor(mv > 0 ? boundaryAt(s, B_TOP, h0) - TOP_KEEP - v0 : v0 - s.bottom - BOTTOM_KEEP);
  b.u[0] = Math.max(lo, Math.min(hi, h0 + mu));
  b.v[0] = Math.max(s.bottom + BOTTOM_KEEP, v0 + mv);
  keepOut(s, o, b.u, b.v, b.prevU, b.prevV, 0);
  const moved = Math.hypot(b.u[0] - b.prevU[0], b.v[0] - b.prevV[0]);
  // Trying to move and getting nowhere: stuck (pointing back then backs up).
  b.tried += b.speed * dt;
  if (mag > DEAD && Math.hypot(b.u[0] - b.stuckU, b.v[0] - b.stuckV) < Math.max(STUCK_REACH, STUCK_SHARE * b.tried)) b.stuck += dt;
  else {
    b.stuck = b.tried = 0;
    b.stuckU = b.u[0];
    b.stuckV = b.v[0];
  }
  digDisc(g, b.u[0], b.v[0], TUNNEL_R, ate);
  if (ate.cells > 0) b.gut += (ate.organic / ate.cells - b.gut) * 0.15;
  // Follow the leader, then keep every body point in an open tunnel (the body cuts corners).
  for (let i = 1; i < n; i++) {
    const eu = b.u[i] - b.u[i - 1];
    const ev = b.v[i] - b.v[i - 1];
    const d = Math.hypot(eu, ev);
    if (d > SPACING) {
      b.u[i] = b.u[i - 1] + (eu * SPACING) / d;
      b.v[i] = b.v[i - 1] + (ev * SPACING) / d;
      keepOut(s, o, b.u, b.v, b.prevU, b.prevV, i);
    }
    digDisc(g, b.u[i], b.v[i], BODY_DIG, ate);
  }
  b.sinceCast += moved;
  if (b.sinceCast >= CAST_EVERY) {
    b.sinceCast = 0;
    b.castLeft = CAST_WINDOW;
  } else if (b.castLeft > 0) {
    // The window is measured by the tail: a head turning back moves without pulling it along.
    b.castLeft = Math.max(0, b.castLeft - Math.hypot(b.u[n - 1] - b.prevU[n - 1], b.v[n - 1] - b.prevV[n - 1]));
  }
  if (b.castLeft > 0) {
    const tu = b.u[n - 1] - b.u[n - 2];
    const tv = b.v[n - 1] - b.v[n - 2];
    const tl = Math.hypot(tu, tv) || 1;
    const filled = castBlob(g, b.u[n - 1] + (tu / tl) * CAST_BACK, b.v[n - 1] + (tv / tl) * CAST_BACK, CAST_R, 90 + 160 * b.gut, tu, tv);
    if (filled >= CAST_MIN) b.castLeft = 0;
  }
  const full = Math.max(0.3, target);
  advanceWave(b.wave, moved * (1 + (EAT_WAVES - 1) * b.eat), dt, full, WAVES_PER_UNIT, BREATH_HZ);
  const floor = boundaryAt(s, B_F, b.u[0]);
  b.nearTop = b.v[0] >= floor - (b.nearTop ? NEAR_TOP_OUT : NEAR_TOP_IN);
}
