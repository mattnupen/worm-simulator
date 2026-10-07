import type { Vec3 } from '../core/vec';
import { SPACING, WORM_SEGMENTS } from '../game/crawl';
import { OCC_AXIS_UP } from '../render/occlusion';
import { bellyHeight, wormSurface, type WormSurface } from '../worm/surfaceHeight';
import { boundaryAt, B_F, type Slab } from './slab';

/**
 * The worm's own moves in and out of the cut (V2 spec 4.1, 4.2). Poses are written in the slab's
 * frame: u along the cut, v the height of the body's axis, w off the plane toward the camera's
 * side (0 in the cut). Pure; the moves are built once each, and posing allocates nothing.
 *
 * Going down: the head turns down in a short arc and sinks below the F top, all in the cut's
 * plane, while the body still on the surface turns from the way the worm lay to lie along the cut
 * (the cut can be up to about 80 degrees off the worm's heading): each segment keeps its length and
 * turns smoothly, the neck first and the tail last, so the body swings round behind the head with
 * no snap. Frame 0 is the crawl's last frame exactly; the last frame lies wholly in the plane.
 *
 * Coming up (emergePath.ts builds it): a path in the plane from the tail through the head, up to
 * the floor and along it under the litter far enough that the whole body comes out, lying along
 * the cut. Every body point slides along it.
 */
const N = WORM_SEGMENTS;
const MAX_POINTS = 224;
/** The axis rides this far above the belly line the crawl rests on the floor (the drawn tube's middle). */
export const AXIS_UP = OCC_AXIS_UP;
/** Every bend of a path is an arc this wide (the digging worm turns about as tightly)... */
export const TURN_RADIUS = 0.45;
/** ...drawn as a polyline this fine, so a point sliding along it turns a few degrees at a vertex. */
const FINE = 0.02;
/** How far below the F top the head ends going down. */
export const SINK_DEPTH = 0.85;
/**
 * Going down, each segment of the body on the surface turns into the plane over up to TURN_S of
 * the move, neck first; it has finished by the time the hole reaches it, so the body bends into
 * the hole without a kink.
 */
const TURN_S = 0.65;

export interface BodyPath {
  /** The path in the plane (u, v) and the arc length at each point. */
  readonly u: Float64Array; readonly v: Float64Array; readonly s: Float64Array;
  count: number;
  /** Where the head starts and ends along the path. */
  headFrom: number;
  headTo: number;
  /** Coming up: the head's way along the cut at the end (+1 along u, -1 against)... */
  exitSign: number;
  /** ...where it comes out of the ground (u: the burrow opening), and that point's arc length. */
  exitU: number;
  exitAt: number;
  /** Going down (the body turns into the plane) or coming up (everything slides along the path). */
  sink: boolean;
  /** Each body point's distance behind the head along the body at the start (head first). */
  readonly back: Float64Array;
  /** Going down: the body as it lay (u, w); each segment's angle from straight back along -u, and length. */
  readonly bu: Float64Array; readonly bw: Float64Array;
  readonly beta: Float64Array; readonly len: Float64Array;
  /** Going down: each point's height over where the floor rests it (0 for a settled crawl), eased out. */
  readonly lift: Float64Array;
  /** Going down: when (0..1 of the move) each segment starts and ends its turn into the plane. */
  readonly turnOn: Float64Array; readonly turnOff: Float64Array;
  /** Scratch: the turning body's points at the current progress. */
  readonly cu: Float64Array; readonly cw: Float64Array;
  /** The slab's frame (world x, z of a plane point; posing needs the floor). */
  ox: number; oz: number; tx: number; tz: number; nx: number; nz: number;
}

export function createBodyPath(): BodyPath {
  const f = (n: number) => new Float64Array(n);
  return {
    u: f(MAX_POINTS), v: f(MAX_POINTS), s: f(MAX_POINTS), count: 0, headFrom: 0, headTo: 0,
    exitSign: 1, exitU: 0, exitAt: 0, sink: true, back: f(N),
    bu: f(N), bw: f(N), beta: f(N - 1), len: f(N - 1), lift: f(N),
    turnOn: f(N - 1), turnOff: f(N - 1), cu: f(N), cw: f(N),
    ox: 0, oz: 0, tx: 0, tz: 1, nx: 1, nz: 0,
  };
}

const surf: WormSurface = { y: 0 };
export const wrap = (a: number): number => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

/** The axis height where the crawl rests the body at (x, z): its belly on the floor, under the litter. */
export function restAxis(x: number, z: number): number {
  return bellyHeight(wormSurface(x, z, surf)) + AXIS_UP;
}
/** restAxis at the plane point (u, w) of the path's slab. */
export const restAt = (p: BodyPath, u: number, w: number): number => restAxis(p.ox + p.tx * u + p.nx * w, p.oz + p.tz * u + p.nz * w);

/** Smooth 0..1 easing with zero speed and acceleration at both ends. */
export function smootherstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

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

/**
 * Digging down from the crawl's body (head first, belly heights, as `Crawl.body`), into slab `s`
 * dug at the head: the dive is an arc turning the head down, then straight down to SINK_DEPTH below
 * the F top. The head ends facing straight down.
 */
export function buildSink(p: BodyPath, s: Slab, body: ArrayLike<Vec3>): void {
  frame(p, s);
  p.sink = true;
  for (let i = 0; i < N; i++) {
    const x = body[i].x - s.ox;
    const z = body[i].z - s.oz;
    p.bu[i] = x * s.tx + z * s.tz;
    p.bw[i] = x * s.nx + z * s.nz;
    p.lift[i] = body[i].y + AXIS_UP - restAxis(body[i].x, body[i].z);
  }
  // Each segment's angle from straight back along the cut, unwrapped down the body so the whole
  // body turns one way (a curled body never untwists through itself).
  p.back[0] = 0;
  for (let k = 0; k < N - 1; k++) {
    const du = p.bu[k + 1] - p.bu[k];
    const dw = p.bw[k + 1] - p.bw[k];
    const l = Math.hypot(du, dw);
    const prev = k > 0 ? p.beta[k - 1] : 0;
    const a = l > 1e-9 ? Math.atan2(dw, -du) : prev;
    p.beta[k] = k > 0 ? prev + wrap(a - prev) : a;
    p.len[k] = l;
    p.back[k + 1] = p.back[k] + l;
  }
  p.count = 0;
  const u0 = p.bu[0];
  const v0 = body[0].y + AXIS_UP;
  push(p, u0, v0);
  arc(p, 0, -1, Math.PI / 2);
  const ue = p.u[p.count - 1];
  push(p, ue, Math.min(p.v[p.count - 1] - 0.05, boundaryAt(s, B_F, ue) - SINK_DEPTH));
  p.headFrom = 0;
  p.headTo = p.exitAt = p.s[p.count - 1];
  p.exitSign = 1;
  p.exitU = u0;
  // Segment k must lie along the cut when its back end, point k + 1, reaches the hole (when the
  // head has dived back[k + 1]); before that the neck leads and the tail follows evenly.
  const first = reachAt(p.back[1] / p.headTo);
  for (let k = 0; k < N - 1; k++) {
    const off = Math.min(reachAt(p.back[k + 1] / p.headTo), first + ((1 - first) * k) / (N - 2));
    p.turnOff[k] = off;
    p.turnOn[k] = Math.max(0, off - TURN_S);
  }
}

/** The progress at which the head has dived share `f` of the dive (1 if never): smootherstep's inverse. */
function reachAt(f: number): number {
  if (f >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (smootherstep(mid) < f) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** How far segment k has turned into the plane at progress t (0..1). */
function turnShare(p: BodyPath, t: number, k: number): number {
  const on = p.turnOn[k];
  const off = p.turnOff[k];
  return off > on ? smootherstep((t - on) / (off - on)) : t >= off ? 1 : 0;
}

/** Appends the arc from the path's end, facing a0, turning `rho` through `sweep`, finely enough to look round. */
export function arc(p: BodyPath, a0: number, rho: number, sweep: number): void {
  const pu = p.u[p.count - 1];
  const pv = p.v[p.count - 1];
  const n = Math.ceil((sweep * TURN_RADIUS) / FINE);
  for (let k = 1; k <= n; k++) {
    const a = a0 + (rho * sweep * k) / n;
    push(p, pu + TURN_RADIUS * rho * (Math.sin(a) - Math.sin(a0)), pv - TURN_RADIUS * rho * (Math.cos(a) - Math.cos(a0)));
  }
}

/** The point at arc length `at` along the path (held at its ends). */
function sampleAt(p: BodyPath, at: number, outU: Float64Array, outV: Float64Array, i: number): void {
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

/** Going down at progress t: the dive in the plane, the rest on the surface turning into it. */
function sinkPose(p: BodyPath, t: number, outU: Float64Array, outV: Float64Array, outW: Float64Array): void {
  const st = smootherstep(t);
  const dived = (p.headTo - p.headFrom) * st;
  // The body still on the surface: each segment keeps its length and turns toward the cut.
  const shift = p.bw[0] * (1 - turnShare(p, t, 0));
  p.cu[0] = p.bu[0];
  p.cw[0] = shift;
  for (let k = 0; k < N - 1; k++) {
    const b = p.beta[k] * (1 - turnShare(p, t, k));
    p.cu[k + 1] = p.cu[k] - p.len[k] * Math.cos(b);
    p.cw[k + 1] = p.cw[k] + p.len[k] * Math.sin(b);
  }
  const ease = 1 - st;
  // The dive meets the surface part at the hole, so it rides with the hole's height.
  const hole = restAt(p, p.bu[0], shift) + p.lift[0] * ease - p.v[0];
  let k = 0;
  for (let i = 0; i < N; i++) {
    const d = p.back[i] - dived;
    if (d <= 0) {
      sampleAt(p, -d, outU, outV, i);
      outV[i] += hole;
      outW[i] = shift;
      continue;
    }
    while (k < N - 2 && p.back[k + 1] < d) k++;
    const f = p.len[k] > 1e-12 ? (d - p.back[k]) / p.len[k] : 0;
    const u = p.cu[k] + (p.cu[k + 1] - p.cu[k]) * f;
    const w = p.cw[k] + (p.cw[k + 1] - p.cw[k]) * f;
    outU[i] = u;
    outW[i] = w;
    outV[i] = restAt(p, u, w) + (p.lift[k] + (p.lift[k + 1] - p.lift[k]) * f) * ease;
  }
}

/**
 * The body (head first) at linear progress `t` (0..1) of the move: u, v (axis height) and w (off
 * the plane; 0 in it). Exactly as it lay at 0; at rest at both ends. Allocates nothing.
 */
export function poseAt(p: BodyPath, t: number, outU: Float64Array, outV: Float64Array, outW: Float64Array): void {
  if (p.sink) {
    sinkPose(p, t, outU, outV, outW);
    return;
  }
  // Coming up: every point slides along the path with the head's easing; a body bunched up in a
  // turn stretches out to its full spacing over the whole move (never sliding backward).
  const st = smootherstep(t);
  const head = p.headFrom + (p.headTo - p.headFrom) * st;
  for (let i = 0; i < N; i++) {
    const at = head - p.back[i] - (i * SPACING - p.back[i]) * st;
    sampleAt(p, at, outU, outV, i);
    if (at >= p.exitAt) outV[i] = restAt(p, outU[i], 0);
    outW[i] = 0;
  }
}
