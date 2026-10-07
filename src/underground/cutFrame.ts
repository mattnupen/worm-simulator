import type { Slab } from './slab';
import type { UndergroundView } from './modeMachine';

/**
 * Where the cut camera (cutCamera.ts) wants its frame (V2 spec 7): a rectangle of the cut's plane,
 * its centre (u along the cut, v height), its height there and the camera's pitch. Wide shows the
 * slab from just above the surface down to about the B layer; Close frames the worm closely,
 * with room ahead of its head. Pure; allocates nothing.
 */
export interface CutFrame { cu: number; cv: number; h: number; pitch: number }

/** The worm's body points, head first (u along the cut, v height): a Burrower will do. */
export interface BodyPoints {
  readonly u: ArrayLike<number>;
  readonly v: ArrayLike<number>;
}

/** Room beside each end of the playable slab for the layer names. */
export const LABEL_ROOM = 1.8;
/** Wide: from this far above the highest litter down to about the B layer (this tall)... */
const WIDE_ABOVE = 1.4;
const WIDE_H = 8.5;
/** ...but on a narrow (phone) screen at least this wide, up to this tall. */
const WIDE_MIN_W = 7;
const WIDE_MAX_H = 13;
/** Looking down, the cut's top is nearer than the frame's centre and shows less width: frame a bit more. */
const PITCH_ROOM = 1.15;
/** Close: the screen's shorter side spans this (about 1.7 worm lengths). */
const CLOSE_SPAN = 6;
/** Close keeps this share of the frame ahead of the head... */
const CLOSE_AHEAD = 0.18;
/**
 * ...but only as far as the whole body stays in, this far inside the frame's edges. Where the
 * body cannot fit, the room ahead wins more the less it fits (FIT_GIVE per unit it overflows).
 */
const BODY_ROOM = 0.5;
const FIT_GIVE = 4;
/** The head stays this share of the frame inside its edges. */
const KEEP_IN = 0.2;
/**
 * Near the slab's bottom the frame goes below it as far as it must to keep the head at most this
 * far down the screen (NDC), clear of the Action prompt on phones...
 */
const HEAD_LOW = 0.7;
/**
 * ...but never more than this below the bottom. The face must be drawn (fading dark) at least
 * this far down. The most any frame needs: 0.15 of its height less the 0.3 the head keeps off
 * the bottom (0.6 u for Close and 1 u for Wide on 1366 x 768; 1.65 u for a 13 u tall phone frame).
 */
export const BELOW_SLAB = 1.7;
/** Pitched down a little, so the surface reads above and behind the cut. */
const PITCH = { wide: 0.2, close: 0.12 } as const;

/** Keeps x so that `head` lies within [x - half + keep, x + half - keep]. */
function keepHead(x: number, head: number, half: number, keep: number): number {
  return Math.min(head + half - keep, Math.max(head - half + keep, x));
}

/**
 * The centre (on one axis) of a frame `size` across that keeps the room ahead (`want`) as far as
 * the body [lo, hi] stays in, BODY_ROOM inside its edges. Where the body is too long for that, it
 * gives way toward `want` the more it overflows (continuously), and keeps the head (`head`) in.
 */
function fitBody(want: number, head: number, lo: number, hi: number, size: number): number {
  const half = size / 2 - BODY_ROOM;
  const from = hi - half;
  const to = lo + half;
  let c: number;
  if (from <= to) c = Math.min(to, Math.max(from, want));
  else {
    const mid = (from + to) / 2;
    const give = (from - to) * FIT_GIVE;
    c = mid + Math.min(give, Math.max(-give, want - mid));
  }
  return keepHead(c, head, size / 2, BODY_ROOM);
}

/**
 * Where `view` wants the frame for the head at (hu, hv) facing (au, av) (eased: CutCam's), on a
 * screen of `aspect` (width / height). `now` is the frame's current centre (Wide holds still
 * while the head is well inside it); NaN when there is none yet (a new slab): Wide then starts
 * from its resting frame, so where an earlier visit left the camera never matters. With the
 * `body` (head first), Close keeps the whole worm in frame whenever it fits.
 */
export function frameTarget(
  view: UndergroundView, s: Slab, hu: number, hv: number, au: number, av: number, aspect: number,
  nowU: number, nowV: number, out: CutFrame, body?: BodyPoints,
): CutFrame {
  const lo = s.playLo - LABEL_ROOM;
  const hi = s.playHi + LABEL_ROOM;
  let h: number;
  let cu: number;
  let cv: number;
  if (view === 'wide') {
    h = Math.min(WIDE_MAX_H, Math.max(WIDE_H, WIDE_MIN_W / aspect));
    const top = s.topMax + WIDE_ABOVE;
    cu = (lo + hi) / 2;
    cv = top - h / 2;
    const w = (h * aspect) / PITCH_ROOM;
    const fromU = Number.isNaN(nowU) ? cu : nowU;
    const fromV = Number.isNaN(nowV) ? cv : nowV;
    if (w < hi - lo) cu = Math.min(hi - w / 2, Math.max(lo + w / 2, keepHead(fromU, hu, w / 2, w * 0.25)));
    // Deeper than the frame reaches: it follows the head down, gently.
    cv = Math.min(cv, keepHead(fromV, hv, h / 2, h * KEEP_IN));
  } else {
    h = aspect >= 1 ? CLOSE_SPAN : CLOSE_SPAN / aspect;
    const w = h * aspect;
    cu = hu + au * w * CLOSE_AHEAD;
    cv = hv + av * h * CLOSE_AHEAD;
    if (body) {
      let u0 = hu; let u1 = hu; let v0 = hv; let v1 = hv;
      for (let i = 1; i < body.u.length; i++) {
        u0 = Math.min(u0, body.u[i]); u1 = Math.max(u1, body.u[i]);
        v0 = Math.min(v0, body.v[i]); v1 = Math.max(v1, body.v[i]);
      }
      cu = fitBody(cu, hu, u0, u1, w);
      cv = fitBody(cv, hv, v0, v1, h);
    }
    cu = Math.min(s.faceHi - w / 2, Math.max(s.faceLo + w / 2, cu));
    cv = Math.min(s.topMax + 2 - h / 2, cv);
  }
  // Never below the slab's bottom, unless the head is near it: then only as far as keeps it clear
  // of the screen's bottom edge, and BELOW_SLAB at most.
  const floor = s.bottom + h / 2;
  cv = Math.max(cv, floor - BELOW_SLAB, Math.min(floor, hv + (HEAD_LOW * h) / 2));
  out.cu = cu;
  out.cv = cv;
  out.h = h;
  out.pitch = PITCH[view];
  return out;
}
