import type { Vec3 } from '../core/vec';
import { WORM_SEGMENTS } from '../game/crawl';
import { AXIS_UP } from './bodyPath';
import { wormBody } from '../worm/bodyLength';
import { advanceWave } from '../worm/wormShape';
import { B_H, B_TOP, bound, boundaryOf, type Slab, type UV } from './slab';
import { digDiscAt, type Eaten } from './soilGrid';
import { BREATH_HZ, TUNNEL_R } from './burrowMotion';
import { buildStage, type MoveState } from './burrowMoves';
import { pressDig } from './burrowApproach';

/**
 * The worm in the robin's bill, seen in the side view (V4 spec revision 1): its front end up to the
 * bill above the ground, the rest down a hole into the soil. The body lies along a path from the
 * bill: the bill, the top of the hole, then down a tunnel. As the robin leans back the bill rises
 * and more of the worm comes out (the body slides up its tunnel); as the worm pulls down, the robin
 * is drawn down after it. At the end the worm can slide down its hole (`slide`) and the burrower
 * takes over (burrowLetGo.ts).
 *
 * Two ways in:
 * - from the surface (holdFromSurface): the crawl lies on the litter, so a new burrow is dug at once
 *   where its head is (the speed test's sinkAtOnce, without the sink), and a straight tunnel goes
 *   down from the hole: the worm pulls its tail in there as the robin grabs its front end (the
 *   honest version: a worm on the surface has no burrow to hold, so the game gives it one);
 * - underground with its head in the top two layers (holdFromBelow): the robin pecks down through
 *   the litter above the head, and the tunnel is the worm's own body, then on past its tail.
 * Allocates nothing per step (once per grab: nothing either; the arrays are made at load).
 */
const N = WORM_SEGMENTS;
/** The path's points at most: the bill, the hole, and the tunnel. */
const PATH_MAX = 64;
/** The surface grab's tunnel: this long, with a point every TUNNEL_STEP, leaning away from the robin. */
const TUNNEL_LEN = 7;
const TUNNEL_STEP = 0.25;
const TUNNEL_LEAN = 0.35;
/** Past the tail of a worm grabbed underground the path goes on this far (it may be pulled deeper). */
const PAST_TAIL = 3;
/** Points stay this far below the litter's top (the path never comes out of the ground twice). */
const UNDER_TOP = 0.3;
/**
 * The robin stands this far behind the cut (its body's half width plus a little), so the cut view's
 * clip (cutClip.ts, CUT_MARGIN in front of the cut) never slices it, and the ground hides nothing.
 */
export const ROBIN_BEHIND = 0.75;
/** Sliding down the hole at the end: the head goes this far below the ground (axis), at this speed. */
const SLIDE_IN = 0.7;
export const SLIDE_SPEED = 6;

export interface Hold {
  /** The path (u along the cut, v height, w off it toward the camera), from the bill. */
  readonly pu: Float64Array;
  readonly pv: Float64Array;
  readonly pw: Float64Array;
  /** Arc length to each point. */
  readonly cum: Float64Array;
  n: number;
  /** The hole's place along the cut (the path's second point). */
  holeU: number;
  /** How far along the path the head is (0 at the bill); slid on at the end. */
  slide: number;
  /** The tunnel is dug this far along the path past the hole (a tail pushed past it digs on). */
  dug: number;
}

export function createHold(): Hold {
  return {
    pu: new Float64Array(PATH_MAX), pv: new Float64Array(PATH_MAX), pw: new Float64Array(PATH_MAX),
    cum: new Float64Array(PATH_MAX), n: 0, holeU: 0.5, slide: 0.5, dug: 0.5,
  };
}

// Fields start as fractions: a field that first held a whole number had V8 box every fraction written later.
const pt: UV = { u: 0.5, v: 0.5 };
const ate: Eaten = { cells: 0, organic: 0 };

function topAt(s: Slab, u: number): number {
  pt.u = u;
  boundaryOf(s, B_TOP, pt);
  return bound.v;
}

/** The head is in reach of a robin: in the leaf litter or the old leaves, above the humus (revision 1). */
export function headCatchable(s: Slab, u: number, v: number): boolean {
  pt.u = u;
  boundaryOf(s, B_H, pt);
  return v > bound.v;
}

function push(h: Hold, u: number, v: number): void {
  if (h.n >= PATH_MAX) return;
  h.pu[h.n] = u;
  h.pv[h.n] = v;
  h.pw[h.n] = 0;
  h.n++;
}

/** The path's start: the bill (set each step), then the hole's top. */
function begin(h: Hold, s: Slab, u: number): void {
  h.n = 0;
  h.holeU = u;
  h.slide = 0;
  push(h, u, topAt(s, u) + 0.4);
  push(h, u, topAt(s, u));
}

/** Pushes points from (u, v) along (du, dv) (a unit way) for `len`, kept in the ground and the slab. */
function line(h: Hold, s: Slab, u: number, v: number, du: number, dv: number, len: number): void {
  for (let d = TUNNEL_STEP; d <= len + 1e-6; d += TUNNEL_STEP) {
    const pu = Math.min(s.playHi - 0.3, Math.max(s.playLo + 0.3, u + du * d));
    push(h, pu, Math.max(s.bottom + 0.5, Math.min(topAt(s, pu) - UNDER_TOP, v + dv * d)));
  }
}

/** Opens the tunnel along the path from its arc length `from` to `to` (every 0.1). */
function digAlong(g: MoveState, h: Hold, from: number, to: number): void {
  measure(h);
  for (let d = from; d <= to; d += 0.1) {
    along.d = d;
    at(h);
    digDiscAt(g.grid, pt, TUNNEL_R, ate);
  }
}

/**
 * The robin grabs the worm on the surface: a new burrow at once where the head is (a new slab,
 * built in this step; nothing to watch), the worm's tail end down a fresh hole, the robin's side
 * of it `side` (+1: the robin is toward +u). False when it can't (not on the surface).
 */
export function holdFromSurface(g: MoveState, h: Hold, side: number): boolean {
  g.reuse = -1;
  if (!pressDig(g, true)) return false;
  // Not the player's own visit: the first-visit hint waits for their own dig.
  g.visits--;
  while (g.stage) buildStage(g);
  g.machine.step(false, false, false, true, 1e6);
  const s = g.slab!;
  const u = Math.min(s.playHi - 1, Math.max(s.playLo + 1, 0));
  begin(h, s, u);
  const k = 1 / Math.hypot(TUNNEL_LEAN, 1);
  line(h, s, u, topAt(s, u), -side * TUNNEL_LEAN * k, -k, TUNNEL_LEN);
  measure(h);
  digAlong(g, h, 0.3, h.cum[h.n - 1]);
  h.dug = h.cum[h.n - 1] - h.cum[1];
  return true;
}

/** The robin grabs the worm underground: up through the litter above its head, then its own tunnel. */
export function holdFromBelow(g: MoveState, h: Hold): void {
  const s = g.slab!;
  const w = g.worm;
  begin(h, s, w.u[0]);
  for (let i = 0; i < N; i++) push(h, w.u[i], w.v[i]);
  // On past the tail, the way the tail points.
  const du = w.u[N - 1] - w.u[N - 2];
  const dv = w.v[N - 1] - w.v[N - 2];
  const l = Math.hypot(du, dv) || 1;
  line(h, s, w.u[N - 1], w.v[N - 1], du / l, dv / l, PAST_TAIL);
  // The peck's hole: from the litter's top down to the head.
  measure(h);
  digAlong(g, h, 0.3, h.cum[2]);
  h.dug = h.cum[2 + N - 1] - h.cum[1];
}

/**
 * The bill's tip `p` (world) as the path's start: the worm's axis there, AXIS_UP above it (as the
 * cut draws the body: cutScene.ts). The point comes in an object: a number passed to a call V8 does
 * not inline is boxed (garbage every step).
 */
export function setBill(h: Hold, s: Slab, p: Readonly<Vec3>): void {
  const dx = p.x - s.ox;
  const dz = p.z - s.oz;
  h.pu[0] = dx * s.tx + dz * s.tz;
  h.pv[0] = p.y + AXIS_UP;
  h.pw[0] = dx * s.nx + dz * s.nz;
}

/** The arc length where the head is in its hole, SLIDE_IN below the ground: the slide's end. */
export function slideEnd(h: Hold): number {
  measure(h);
  return h.cum[1] + SLIDE_IN;
}

function measure(h: Hold): void {
  h.cum[0] = 0;
  for (let k = 1; k < h.n; k++) {
    const du = h.pu[k] - h.pu[k - 1];
    const dv = h.pv[k] - h.pv[k - 1];
    const dw = h.pw[k] - h.pw[k - 1];
    h.cum[k] = h.cum[k - 1] + Math.sqrt(du * du + dv * dv + dw * dw);
  }
}

/**
 * The path's point at arc length `along.d` into `pt` (and its w into `atW`); past the end, along the
 * last piece. (The length comes in an object, so no number is boxed per point.)
 */
let seg = 1;
let atW = 0.5;
const along = { d: 0.5 };
function at(h: Hold): void {
  const d = along.d;
  if (seg < 1 || seg >= h.n || h.cum[seg - 1] > d) seg = 1;
  while (seg < h.n - 1 && h.cum[seg] < d) seg++;
  const a = seg - 1;
  const span = h.cum[seg] - h.cum[a];
  const t = span > 1e-9 ? (d - h.cum[a]) / span : 0;
  pt.u = h.pu[a] + (h.pu[seg] - h.pu[a]) * t;
  pt.v = h.pv[a] + (h.pv[seg] - h.pv[a]) * t;
  atW = h.pw[a] + (h.pw[seg] - h.pw[a]) * t;
}

/**
 * One step held: the body laid along the path from `h.slide` (the last step kept for the renderer
 * to interpolate from), squirming, and a tail pushed past the dug tunnel digging on.
 */
export function poseHeld(g: MoveState, h: Hold, dt: number): void {
  const w = g.worm;
  w.prevU.set(w.u);
  w.prevV.set(w.v);
  g.prevW.set(g.offW);
  w.prevDir = w.dir;
  w.prevWave.phase = w.wave.phase;
  w.prevWave.activity = w.wave.activity;
  measure(h);
  seg = 1;
  const gap = wormBody.spacing;
  const hu = w.u[0];
  const hv = w.v[0];
  for (let i = 0; i < N; i++) {
    along.d = h.slide + i * gap;
    at(h);
    w.u[i] = pt.u;
    w.v[i] = pt.v;
    g.offW[i] = atW;
  }
  w.dir = Math.atan2(w.v[0] - w.v[1], w.u[0] - w.u[1]);
  // It squirms in the bill (a Game choice of how much), and the wave runs on with any slide.
  w.wave.activity += (0.7 - w.wave.activity) * Math.min(1, 3 * dt);
  advanceWave(w.wave, Math.abs(w.u[0] - hu) + Math.abs(w.v[0] - hv) + 0.4 * dt, dt, 1, wormBody.wavesPerUnit, BREATH_HZ);
  const tail = h.slide + (N - 1) * gap - h.cum[1];
  if (tail > h.dug) {
    digAlong(g, h, h.cum[1] + h.dug, h.cum[1] + tail + 0.1);
    h.dug = tail + 0.1;
  }
}

/** poseHeld with nothing to interpolate from (the grab's first step: a cut to the side view). */
export function snapHeld(g: MoveState, h: Hold): void {
  poseHeld(g, h, 0);
  const w = g.worm;
  w.prevU.set(w.u);
  w.prevV.set(w.v);
  g.prevW.set(g.offW);
  w.prevDir = w.dir;
}
