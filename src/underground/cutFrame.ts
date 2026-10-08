import type { Slab } from './slab';
import type { UndergroundView } from './modeMachine';

/**
 * Where the cut camera (cutCamera.ts) wants its frame (V2 spec 7): a rectangle of the cut's plane,
 * its centre (u along the cut, v height), its height there and the camera's pitch. Wide shows the
 * slab from just above the surface down to about the B layer; Close frames the worm closely,
 * with room ahead of its head. The frame depends only on the worm and the screen, never on where
 * the camera was, so after any switch Wide settles exactly where it would never having left. The
 * camera looks down a little, so the screen's edges meet the plane in a trapezoid, wider and
 * farther down at the bottom: every limit below (the face's ends and depth, the head's place on
 * screen) is kept on those projected edges. Pure; allocates nothing.
 */
export interface CutFrame { cu: number; cv: number; h: number; pitch: number }

/** The worm's body points, head first (u along the cut, v height): a Burrower will do. */
export interface BodyPoints {
  readonly u: ArrayLike<number>;
  readonly v: ArrayLike<number>;
}

/** The vertical field of view (main.ts's camera). */
export const FOV_DEG = 60;
const TAN = Math.tan((FOV_DEG * Math.PI) / 360);
/** Room beside each end of the playable slab for the layer names. */
export const LABEL_ROOM = 1.8;
/** Wide frames the names' room with this to spare, so a frame still settling never clips it. */
const NAME_PAD = 0.1;
/** Wide: from this far above the highest litter down to about the B layer (this tall)... */
const WIDE_ABOVE = 1.4;
const WIDE_H = 8.5;
/** ...but on a narrow (phone) screen at least this wide. */
const WIDE_MIN_W = 7;
/**
 * A portrait screen's Wide frame is taller (WIDE_MIN_W), so it holds the highest litter top this
 * share of the screen down from its top instead (clear of the Pause button, and the frame still
 * reaches into B), from a 3:4 screen (PORTRAIT_FULL) on, blending in from a square one.
 */
const PORTRAIT_TOP = 0.19;
const PORTRAIT_FULL = 0.75;
/** No frame is taller than this (the narrowest phones). */
const MAX_H = 13;
/**
 * Neither view shows more along the cut than on a 16:9 screen (the face's ends are reckoned for
 * it: slab.ts FACE_END_ROOM). A wider screen, such as a maximised browser on a 1366 x 768
 * Chromebook (about 2.1:1), frames the same width and a little less height: Wide 7.0 u tall at
 * 2.17:1, Close 4.9 u. Continuous in the aspect, so a resize eases like any change of target.
 */
const WIDEST = 16 / 9;
/**
 * Wide keeps the head at least this far inside the screen's sides, so the layer names beyond the
 * playable end (LABEL_ROOM) stay on screen when the head is at the end: it stops 0.2 short of
 * the end, easing over the last 0.35 (burrowMotion), so it can come to rest up to 0.55 short...
 */
const WIDE_KEEP = LABEL_ROOM + NAME_PAD + 0.6;
/** ...or this share of its width, if more (it holds still while the head is in the middle). */
const WIDE_KEEP_SHARE = 0.25;
/** Close: the screen's shorter side spans this (about 1.7 worm lengths), up to 16:9 (WIDEST). */
const CLOSE_SPAN = 6;
/** Close keeps this share of the frame ahead of the head... */
const CLOSE_AHEAD = 0.18;
/**
 * ...but only as far as the whole body stays in, this far inside the frame's edges. Where the
 * body cannot fit, the room ahead wins more the less it fits (FIT_GIVE per unit it overflows).
 */
const BODY_ROOM = 0.5;
const FIT_GIVE = 4;
/** Wide follows the head down so it stays this share of the frame above its bottom. */
const KEEP_IN = 0.2;
/**
 * Near the slab's bottom the frame goes below it as far as it must to keep the head at most this
 * far down the screen (NDC), clear of the Action prompt on phones (Wide's follow lags the head
 * by up to 0.1 more while it digs down)...
 */
const HEAD_LOW = 0.62;
/**
 * ...but the screen's bottom edge never shows more than this below the slab's bottom: the face
 * must be drawn (fading dark) at least this deep. What each frame needs at most (the head stops
 * 0.3 above the bottom): Wide 1.71 u on 1366 x 768 (less on wider screens, whose frames are
 * shorter), 2.78 u on a 13 u tall frame (the narrowest phones); Close 0.98 u and 2.50 u.
 */
export const FACE_BELOW = 2.8;
/**
 * Every frame keeps its projected corners within the face's ends. Only a view switched back
 * mid-switch (faster than once a second), carried on by its own speed, can show past them, by up
 * to about this much (0.25 u measured): the face should reach this far past them, fading.
 */
export const FACE_PAST = 0.4;
/** Pitched down a little, so the surface reads above and behind the cut. */
const PITCH = { wide: 0.2, close: 0.12 } as const;

/** x kept so that `head` lies within [x - half + keep, x + half - keep]. */
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
 * How far above the frame's centre a point of the plane shows at screen height `ny` (NDC), per
 * half frame height, pitched down by `pitch`. -below(1, p) is the screen's bottom edge.
 */
function below(ny: number, pitch: number): number {
  return ny / (Math.cos(pitch) + ny * TAN * Math.sin(pitch));
}

/**
 * Half the width along the cut a frame `h` tall shows at screen height `ny` (NDC) on a screen of
 * `aspect`, pitched down by `pitch`: the top row (1) shows less than the bottom row (-1).
 */
function halfAt(ny: number, h: number, aspect: number, pitch: number): number {
  const c = Math.cos(pitch);
  return ((h / 2) * aspect * c) / (c + ny * TAN * Math.sin(pitch));
}

function wideHeight(aspect: number): number {
  return Math.min(MAX_H, Math.max(WIDE_H, WIDE_MIN_W / aspect), (WIDE_H * WIDEST) / aspect);
}

/**
 * How far the drawn face must reach past the playable slab's end for Wide on a screen of `aspect`
 * to show the head at the end with the layer names beyond it: the frame stops where its bottom
 * corners reach the face's end, and its top row shows that much less.
 */
export function faceEndRoom(aspect: number): number {
  const h = wideHeight(aspect);
  return halfAt(-1, h, aspect, PITCH.wide) - halfAt(1, h, aspect, PITCH.wide) + LABEL_ROOM + NAME_PAD;
}

/**
 * Where `view` wants the frame for the head at (hu, hv) facing (au, av) (eased: CutCam's), on a
 * screen of `aspect` (width / height). With the `body` (head first), Close keeps the whole worm in
 * frame whenever it fits. Wide holds still while the head is in the middle of the slab and near
 * the surface, and follows it toward an end or down. Every view keeps its four projected corners
 * on the drawn face (its ends, and FACE_BELOW under the slab).
 */
export function frameTarget(
  view: UndergroundView, s: Slab, hu: number, hv: number, au: number, av: number, aspect: number,
  out: CutFrame, body?: BodyPoints,
): CutFrame {
  ask.hu = hu;
  ask.hv = hv;
  ask.au = au;
  ask.av = av;
  ask.aspect = aspect;
  return frameAsked(view, s, ask, out, body);
}

/**
 * frameTarget's numbers in one object: the per-step form (frameAsked) takes them so, as a number
 * passed to a call V8 does not inline is boxed on the heap (garbage every step).
 */
export interface FrameAsk { hu: number; hv: number; au: number; av: number; aspect: number }
const ask: FrameAsk = { hu: 0, hv: 0, au: 0, av: 0, aspect: 0 };

/** frameTarget, asked with `q`. */
export function frameAsked(view: UndergroundView, s: Slab, q: FrameAsk, out: CutFrame, body?: BodyPoints): CutFrame {
  const hu = q.hu;
  const hv = q.hv;
  const au = q.au;
  const av = q.av;
  const aspect = q.aspect;
  // A screen with no height (or no width) yet: frame as for 16:9.
  const a = Number.isFinite(aspect) && aspect > 0 ? Math.min(4, Math.max(0.25, aspect)) : 16 / 9;
  const pitch = PITCH[view];
  let h: number;
  let cu: number;
  let cv: number;
  if (view === 'wide') {
    const lo = s.playLo - LABEL_ROOM - NAME_PAD;
    const hi = s.playHi + LABEL_ROOM + NAME_PAD;
    h = wideHeight(a);
    cu = (lo + hi) / 2;
    // The top row, the narrowest, shows the slab and its names whole, or follows the head.
    const half = halfAt(1, h, a, pitch);
    if (2 * half < hi - lo) {
      const keep = Math.min(half, Math.max(WIDE_KEEP, 2 * half * WIDE_KEEP_SHARE));
      cu = Math.min(hi - half, Math.max(lo + half, keepHead(cu, hu, half, keep)));
    }
    // From just above the highest litter (lower on a portrait screen: continuous in the aspect);
    // deeper than that reaches, it follows the head down.
    const land = h / 2 - WIDE_ABOVE;
    const tall = Math.min(1, Math.max(0, (1 - a) / (1 - PORTRAIT_FULL)));
    const drop = land + (below(1 - 2 * PORTRAIT_TOP, pitch) * (h / 2) - land) * tall;
    cv = Math.min(s.topMax - drop, hv + h / 2 - h * KEEP_IN);
  } else {
    h = Math.min(MAX_H, a >= 1 ? CLOSE_SPAN : CLOSE_SPAN / a, (CLOSE_SPAN * WIDEST) / a);
    const w = h * a;
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
    cv = Math.min(s.topMax + 2 - h / 2, cv);
  }
  // The head is never lower on screen than HEAD_LOW, even to fit the body (a short Close frame on
  // a wide screen, the worm digging straight down), so the Action prompt never covers it.
  const headTop = hv - below(-HEAD_LOW, pitch) * (h / 2);
  cv = Math.min(cv, headTop);
  // The bottom edge stays on the slab, unless the head is near the bottom: then the frame goes
  // only as far below as keeps the head off the screen's bottom edge, and FACE_BELOW at most.
  const floor = s.bottom - below(-1, pitch) * (h / 2);
  cv = Math.max(cv, floor - FACE_BELOW, Math.min(floor, headTop));
  // The bottom corners reach farthest along the cut: they stay on the face. A face narrower than
  // that (the world's edge clips it) is shown whole, centred.
  const half = halfAt(-1, h, a, pitch);
  cu = s.faceHi - s.faceLo >= 2 * half
    ? Math.min(s.faceHi - half, Math.max(s.faceLo + half, cu))
    : (s.faceLo + s.faceHi) / 2;
  out.cu = cu;
  out.cv = cv;
  out.h = h;
  out.pitch = pitch;
  return out;
}
