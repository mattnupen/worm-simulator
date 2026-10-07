import type { Vec3 } from '../core/vec';
import { WORM_SEGMENTS } from '../game/crawl';
import {
  arc, cruise, fitSeconds, frame, push, restAt, restAxis, sampleAt, wrap, AXIS_UP, type BodyPath,
} from './bodyPath';
import { FADE_S, SINK_S } from './modeMachine';
import { boundaryAt, B_F, type Slab } from './slab';

/**
 * Digging down (V2 spec 4.1): the body on the surface swings round from the way the worm lay to lie
 * along the cut (up to 90 degrees off; digSpot.ts makes sure the swing misses every footprint). As it
 * comes into line the head turns down in an arc and sinks below the F top in the cut's plane, the
 * body sliding in after it. Each surface point moves in polar terms about the hole: its angle turns
 * steadily to straight back along the cut, and its distance from the hole changes steadily from
 * where it lay to where it will lie (pulled into the hole as the head dives). Both only ever go one
 * way, so no point stalls and doubles back, even for a curled body. Frame 0 is the crawl's last frame
 * exactly; the last frame lies wholly in the plane. The move runs through the whole dig-down (the
 * camera's swing included), lasting longer for a big turn (`p.seconds`, fitted to the speed caps).
 */
const N = WORM_SEGMENTS;
/** How far below the F top the head ends. */
export const SINK_DEPTH = 0.85;
/** The surface part comes into line over this share of the move (all of it: the slowest swing)... */
const TURN_END = 1;
/** ...and the head sinks from this share on: late enough that a segment is all but in line when it reaches the hole. */
const DIVE_FROM = 0.65;
/** Share of each of those spent speeding up, and again slowing down (`cruise`). */
const EASE = 0.25;
/** Digging down never takes longer than this for the sake of TURN_RATE (see fitSeconds). */
const LONGEST = 4.8;
/** The head sinks no faster than this (u/s; the crawl's top speed is 1.6). */
export const SINK_SPEED = 2.0;

/**
 * Digging down from the crawl's body (head first, belly heights, as `Crawl.body`), into slab `s`
 * dug at the head: the dive is an arc turning the head down, then straight down to SINK_DEPTH below
 * the F top. The head ends facing straight down. Sets `p.seconds` (at least SINK_S + FADE_S).
 */
export function buildSink(p: BodyPath, s: Slab, body: ArrayLike<Vec3>): void {
  frame(p, s);
  p.posing = sinkPose;
  for (let i = 0; i < N; i++) {
    const x = body[i].x - s.ox;
    const z = body[i].z - s.oz;
    p.bu[i] = x * s.tx + z * s.tz;
    p.bw[i] = x * s.nx + z * s.nz;
    p.lift[i] = body[i].y + AXIS_UP - restAxis(body[i].x, body[i].z);
  }
  // Each point's distance from the hole and its angle there, unwrapped down the body (so a curled
  // body uncurls the way it lies), and its distance behind the head along the body.
  p.back[0] = 0;
  p.rad[0] = 0;
  p.ang[0] = 0;
  for (let i = 1; i < N; i++) {
    const du = p.bu[i] - p.bu[0];
    const dw = p.bw[i] - p.bw[0];
    p.rad[i] = Math.hypot(du, dw);
    const prev = p.ang[i - 1];
    const a = p.rad[i] > 1e-9 ? Math.atan2(dw, -du) : prev;
    p.ang[i] = i > 1 ? prev + wrap(a - prev) : a;
    p.back[i] = p.back[i - 1] + Math.hypot(p.bu[i] - p.bu[i - 1], p.bw[i] - p.bw[i - 1]);
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
  p.seconds = fitSeconds(p, SINK_S + FADE_S, SINK_SPEED, LONGEST);
}

/** Going down at progress t: the dive in the plane, the rest on the surface turning into it. */
function sinkPose(p: BodyPath, t: number, outU: Float64Array, outV: Float64Array, outW: Float64Array): void {
  const left = 1 - cruise(t / TURN_END, EASE);
  const depth = p.headTo - p.headFrom;
  const dived = depth * cruise((t - DIVE_FROM) / (1 - DIVE_FROM), EASE);
  const shift = p.bw[0] * left;
  // The dive meets the surface part at the hole, so it rides with the hole's height.
  const hole = restAt(p, p.bu[0], shift) + p.lift[0] * left - p.v[0];
  for (let i = 0; i < N; i++) {
    const back = p.back[i];
    if (back <= dived) {
      sampleAt(p, dived - back, outU, outV, i);
      outV[i] += hole;
      outW[i] = shift;
      continue;
    }
    // A point that will go down the hole closes on it as the head dives, reaching it on cue; one
    // that stays on the surface moves from where it lay to `back - depth` behind the hole.
    const r0 = p.rad[i];
    const r = back <= depth ? r0 * (1 - dived / back) : r0 + (back - depth - r0) * (dived / depth);
    const a = p.ang[i] * left;
    const u = p.bu[0] - r * Math.cos(a);
    const w = shift + r * Math.sin(a);
    outU[i] = u;
    outW[i] = w;
    outV[i] = restAt(p, u, w) + p.lift[i] * left;
  }
}
