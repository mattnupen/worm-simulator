import { SPACING, WORM_SEGMENTS } from '../game/crawl';
import { OCC_AXIS_UP } from '../render/occlusion';
import { bellyHeight, wormSurface, type WormSurface } from '../worm/surfaceHeight';
import { cruise, smootherstep } from './easing';
import type { Slab } from './slab';

/**
 * The worm's own moves in and out of the cut (V2 spec 4.1, 4.2). Poses are written in the slab's
 * frame: u along the cut, v the height of the body's axis, w off the plane toward the camera's
 * side (0 in the cut). Pure; the moves are built once each, and posing allocates nothing.
 *
 * Going down (sinkPath.ts builds it): the body on the surface swings round to lie along the cut
 * while the head turns down and sinks in the cut's plane. Coming up (emergePath.ts): a path in the
 * plane from the tail through the head, up to the floor and along it under the litter, that every
 * body point slides along. Each move's length (`seconds`) is fitted so that no point outruns
 * POINT_SPEED, the head its own cap, and no segment turns faster than TURN_RATE (`fitSeconds`).
 */
const N = WORM_SEGMENTS;
const MAX_POINTS = 320;
/** The axis rides this far above the belly line the crawl rests on the floor (the drawn tube's middle). */
export const AXIS_UP = OCC_AXIS_UP;
/** Bends of a path are arcs this wide where there is room (the digging worm turns about as tightly)... */
export const TURN_RADIUS = 0.45;
/** ...drawn as a polyline this fine, so a point sliding along it turns a few degrees at a vertex. */
const FINE = 0.02;
/** No body point moves faster than this (u/s; the crawl's top speed is 1.6)... */
export const POINT_SPEED = 3.2;
/** ...and no segment turns faster than this (radians a second: 6 degrees a frame at 60 fps). */
export const TURN_RATE = (6 * Math.PI) / 180 * 60;
/** Segments shorter than this (bunched up, within the tube's width) are not held to TURN_RATE. */
export const SHORT = 0.1;
/** Progress samples `fitSeconds` measures a move at (finer than its frames). */
const FIT_STEPS = 400;

/** Poses a built move at progress t (see poseAt). */
export type Posing = (p: BodyPath, t: number, outU: Float64Array, outV: Float64Array, outW: Float64Array) => void;

export interface BodyPath {
  /** The path in the plane (u, v) and the arc length at each point. */
  readonly u: Float64Array; readonly v: Float64Array; readonly s: Float64Array;
  count: number;
  /** Where the head starts and ends along the path. */
  headFrom: number; headTo: number;
  /** Coming up: the head's way along the cut at the end (+1 along u, -1 against), where it comes
   * out of the ground (u: the burrow opening) and that point's arc length. */
  exitSign: number; exitU: number; exitAt: number;
  /** How the move is posed: going down, sinkPath's; null, coming up (`slidePose`). */
  posing: Posing | null;
  /** The move's length in seconds, for the mode machine's `setMoveTime` (`fitSeconds`)... */
  seconds: number;
  /** ...and the fastest a segment turns in it (TURN_RATE, but for the rare move `fitSeconds` caps). */
  turnRate: number;
  /** Each body point's distance behind the head along the path at the start (head first). */
  readonly back: Float64Array;
  /**
   * Coming up: where each point really lay, less where the path puts it at the start, and whether
   * that matters (the head first turns where it lies, the front bending round onto the path).
   */
  readonly offU: Float64Array; readonly offV: Float64Array;
  turnFirst: boolean;
  /** Going down: the body as it lay (u, w); each point's distance from the hole and its angle there from straight back along -u. */
  readonly bu: Float64Array; readonly bw: Float64Array;
  readonly rad: Float64Array; readonly ang: Float64Array;
  /** Going down: each point's height over where the floor rests it (0 for a settled crawl), eased out. */
  readonly lift: Float64Array;
  /** Scratch: two poses for `fitSeconds`. */
  readonly fit: readonly Float64Array[];
  /** The slab's frame (world x, z of a plane point; posing needs the floor). */
  ox: number; oz: number; tx: number; tz: number; nx: number; nz: number;
}

export function createBodyPath(): BodyPath {
  const f = (n: number) => new Float64Array(n);
  return {
    u: f(MAX_POINTS), v: f(MAX_POINTS), s: f(MAX_POINTS), count: 0, headFrom: 0, headTo: 0,
    exitSign: 1, exitU: 0, exitAt: 0, posing: null, seconds: 0, turnRate: 0, back: f(N), offU: f(N), offV: f(N), turnFirst: false,
    bu: f(N), bw: f(N), rad: f(N), ang: f(N), lift: f(N), fit: [f(N), f(N), f(N), f(N), f(N), f(N)],
    ox: 0, oz: 0, tx: 0, tz: 1, nx: 1, nz: 0,
  };
}

export { cruise, smootherstep };

const surf: WormSurface = { y: 0 };
export const wrap = (a: number): number => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

/** The axis height where the crawl rests the body at (x, z): its belly on the floor, under the litter. */
export function restAxis(x: number, z: number): number {
  return bellyHeight(wormSurface(x, z, surf)) + AXIS_UP;
}
/** restAxis at the plane point (u, w) of the path's slab. */
export const restAt = (p: BodyPath, u: number, w: number): number => restAxis(p.ox + p.tx * u + p.nx * w, p.oz + p.tz * u + p.nz * w);

/** Takes the slab's frame (posing needs the floor's height at plane points). */
export function frame(p: BodyPath, s: Slab): void {
  p.ox = s.ox; p.oz = s.oz; p.tx = s.tx; p.tz = s.tz; p.nx = s.nx; p.nz = s.nz;
}

export function push(p: BodyPath, u: number, v: number): void {
  if (p.count >= MAX_POINTS) return;
  const i = p.count++;
  p.u[i] = u;
  p.v[i] = v;
  p.s[i] = i === 0 ? 0 : p.s[i - 1] + Math.hypot(u - p.u[i - 1], v - p.v[i - 1]);
}

/** Appends the arc of radius `r` from the path's end, facing a0, turning `rho` through `sweep`, finely enough to look round. */
export function arc(p: BodyPath, a0: number, rho: number, sweep: number, r = TURN_RADIUS): void {
  const pu = p.u[p.count - 1];
  const pv = p.v[p.count - 1];
  const n = Math.ceil((sweep * r) / FINE);
  for (let k = 1; k <= n; k++) {
    const a = a0 + (rho * sweep * k) / n;
    push(p, pu + r * rho * (Math.sin(a) - Math.sin(a0)), pv - r * rho * (Math.cos(a) - Math.cos(a0)));
  }
}

/** The point at arc length `at` along the path (held at its ends). */
export function sampleAt(p: BodyPath, at: number, outU: Float64Array, outV: Float64Array, i: number): void {
  let lo = 0;
  let hi = p.count - 1;
  if (at <= 0 || at >= p.s[hi]) {
    const k = at <= 0 ? 0 : hi;
    outU[i] = p.u[k];
    outV[i] = p.v[k];
    return;
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (p.s[mid] <= at) lo = mid;
    else hi = mid;
  }
  const f = (at - p.s[lo]) / Math.max(1e-12, p.s[hi] - p.s[lo]);
  outU[i] = p.u[lo] + (p.u[hi] - p.u[lo]) * f;
  outV[i] = p.v[lo] + (p.v[hi] - p.v[lo]) * f;
}

/** Coming up, the share of the move the head spends speeding up (and slowing down)... */
const SLIDE_EASE = 0.2;
/**
 * ...and, when the head first turns where it lies (`turnFirst`), the share over which the front
 * bends round onto the path; the slide starts SLIDE_FROM of the way through it (the offsets, fixed
 * where the body lay, all but gone, so sliding under them cannot stretch it).
 */
const TURN_SHARE = 0.3;
const SLIDE_FROM = 0.5;
/** Otherwise the front's small offsets (it lay not quite on the path's arc) ease out over this share. */
const SETTLE_SHARE = 0.12;

/**
 * Coming up at progress t: every point slides along the path with the head's easing; a body
 * bunched up in a turn stretches out to its full spacing over the whole move (never sliding back).
 */
function slidePose(p: BodyPath, t: number, outU: Float64Array, outV: Float64Array, outW: Float64Array): void {
  const pre = p.turnFirst ? TURN_SHARE : SETTLE_SHARE;
  const off = 1 - smootherstep(t / pre);
  const go = pre * SLIDE_FROM;
  const st = cruise((t - go) / (1 - go), SLIDE_EASE);
  const head = p.headFrom + (p.headTo - p.headFrom) * st;
  for (let i = 0; i < N; i++) {
    const at = head - p.back[i] - (i * SPACING - p.back[i]) * st;
    sampleAt(p, at, outU, outV, i);
    if (at >= p.exitAt) outV[i] = restAt(p, outU[i], 0);
    outU[i] += p.offU[i] * off;
    outV[i] += p.offV[i] * off;
    outW[i] = 0;
  }
}

/**
 * The body (head first) at linear progress `t` (0..1) of the move: u, v (axis height) and w (off
 * the plane; 0 in it). Exactly as it lay at 0; at rest at both ends. Allocates nothing.
 */
export function poseAt(p: BodyPath, t: number, outU: Float64Array, outV: Float64Array, outW: Float64Array): void {
  (p.posing ?? slidePose)(p, t, outU, outV, outW);
}

/** World position of point i of the scratch pose starting at fit[o] (u, v, w) into `pt`. */
const pt = { x: 0, y: 0, z: 0 };
function worldOf(p: BodyPath, o: number, i: number): void {
  const u = p.fit[o][i];
  const w = p.fit[o + 2][i];
  pt.x = p.ox + p.tx * u + p.nx * w;
  pt.y = p.fit[o + 1][i];
  pt.z = p.oz + p.tz * u + p.nz * w;
}

/** What fitOnce measured: the length the speed caps need, and the length TURN_RATE needs. */
const needs = { speed: 0, turn: 0 };

/**
 * The shortest the built move may last (at least `least` seconds) so that, played at linear progress,
 * no body point moves faster than POINT_SPEED, the head than `headSpeed`, and no segment turns
 * faster than TURN_RATE. Measured on samples at least twice a frame (a little margin over the
 * fastest). Once per move; allocates nothing.
 *
 * `longest`: the turn rate may not stretch the move past this (a lesson cannot wait): in the rare
 * move through a sharp bend of the body's own tunnel, segments then turn a little faster than
 * TURN_RATE, by the share written to `p.turnRate`. Speeds are always kept.
 */
export function fitSeconds(p: BodyPath, least: number, headSpeed: number, longest = Infinity): number {
  fitOnce(p, least, headSpeed, FIT_STEPS);
  const first = Math.max(needs.speed, needs.turn);
  if (first * 120 > FIT_STEPS) fitOnce(p, least, headSpeed, Math.ceil(first * 120));
  const seconds = Math.max(needs.speed, Math.min(needs.turn, longest));
  p.turnRate = TURN_RATE * Math.max(1, needs.turn / seconds);
  return seconds;
}

function fitOnce(p: BodyPath, least: number, headSpeed: number, steps: number): void {
  const f = p.fit;
  let speed = least;
  let turn = 0;
  let o = 0;
  poseAt(p, 0, f[0], f[1], f[2]);
  for (let k = 1; k <= steps; k++) {
    const n = 3 - o;
    poseAt(p, k / steps, f[n], f[n + 1], f[n + 2]);
    let px = 0;
    let py = 0;
    let pz = 0;
    let qx = 0;
    let qy = 0;
    let qz = 0;
    for (let i = 0; i < N; i++) {
      worldOf(p, o, i);
      const ax = pt.x;
      const ay = pt.y;
      const az = pt.z;
      worldOf(p, n, i);
      const d = Math.hypot(pt.x - ax, pt.y - ay, pt.z - az) * steps;
      speed = Math.max(speed, d / (i === 0 ? Math.min(headSpeed, POINT_SPEED) : POINT_SPEED));
      if (i > 0) {
        // The segment from point i - 1 to i, before and after: how far it turned.
        const ux = ax - px;
        const uy = ay - py;
        const uz = az - pz;
        const vx = pt.x - qx;
        const vy = pt.y - qy;
        const vz = pt.z - qz;
        const lu = Math.hypot(ux, uy, uz);
        const lv = Math.hypot(vx, vy, vz);
        // A segment bunched up shorter than SHORT turns within the tube's own width: it does not show.
        if (lu > SHORT && lv > SHORT) {
          const c = Math.max(-1, Math.min(1, (ux * vx + uy * vy + uz * vz) / (lu * lv)));
          turn = Math.max(turn, (Math.acos(c) * steps) / TURN_RATE);
        }
      }
      px = ax; py = ay; pz = az;
      qx = pt.x; qy = pt.y; qz = pt.z;
    }
    o = n;
  }
  needs.speed = speed * 1.03;
  needs.turn = turn * 1.03;
}
