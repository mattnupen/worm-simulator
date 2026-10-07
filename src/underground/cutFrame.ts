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
/** Wide: from this far above the highest litter down to about the B layer (this tall)... */
const WIDE_ABOVE = 1.4;
const WIDE_H = 8.5;
/** ...but on a narrow (phone) screen at least this wide. */
const WIDE_MIN_W = 7;
/** No frame is taller than this (the narrowest phones). */
const MAX_H = 13;
/** Looking down, the cut's top shows less width than the frame's centre: Wide frames a bit more. */
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
/** Wide follows the head down so it stays this share of the frame above its bottom. */
const KEEP_IN = 0.2;
/**
 * Near the slab's bottom the frame goes below it as far as it must to keep the head at most this
 * far down the screen (NDC), clear of the Action prompt on phones (Wide's follow lags the head
 * by up to 0.07 more while it digs down)...
 */
const HEAD_LOW = 0.65;
/**
 * ...but the screen's bottom edge never shows more than this below the slab's bottom: the face
 * must be drawn (fading dark) at least this deep. What each frame needs at most (the head stops
 * 0.3 above the bottom): on 1366 x 768 Wide 1.56 u and Close 0.89 u; on 360 x 640 Wide 2.42 u
 * and Close 1.82 u; a 13 u tall frame (the narrowest phones) Wide 2.55 u.
 */
export const FACE_BELOW = 2.6;
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
  // A screen with no height (or no width) yet: frame as for 16:9.
  const a = Number.isFinite(aspect) && aspect > 0 ? Math.min(4, Math.max(0.25, aspect)) : 16 / 9;
  const pitch = PITCH[view];
  let h: number;
  let cu: number;
  let cv: number;
  if (view === 'wide') {
    const lo = s.playLo - LABEL_ROOM;
    const hi = s.playHi + LABEL_ROOM;
    h = Math.min(MAX_H, Math.max(WIDE_H, WIDE_MIN_W / a));
    cu = (lo + hi) / 2;
    const w = (h * a) / PITCH_ROOM;
    if (w < hi - lo) cu = Math.min(hi - w / 2, Math.max(lo + w / 2, keepHead(cu, hu, w / 2, w * 0.25)));
    // From just above the highest litter; deeper than that reaches, it follows the head down.
    cv = Math.min(s.topMax + WIDE_ABOVE - h / 2, hv + h / 2 - h * KEEP_IN);
  } else {
    h = Math.min(MAX_H, a >= 1 ? CLOSE_SPAN : CLOSE_SPAN / a);
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
  // The bottom edge stays on the slab, unless the head is near the bottom: then the frame goes
  // only as far below as keeps the head off the screen's bottom edge, and FACE_BELOW at most.
  const drop = -below(-1, pitch) * (h / 2);
  const floor = s.bottom + drop;
  cv = Math.max(cv, floor - FACE_BELOW, Math.min(floor, hv - below(-HEAD_LOW, pitch) * (h / 2)));
  // The bottom corners reach farthest along the cut: they stay on the face. A face narrower than
  // that (the world's edge clips it) is shown whole, centred.
  const half = a * Math.cos(pitch) * drop;
  cu = s.faceHi - s.faceLo >= 2 * half
    ? Math.min(s.faceHi - half, Math.max(s.faceLo + half, cu))
    : (s.faceLo + s.faceHi) / 2;
  out.cu = cu;
  out.cv = cv;
  out.h = h;
  out.pitch = pitch;
  return out;
}
