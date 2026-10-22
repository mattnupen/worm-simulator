import type { Slab, UV } from './slab';
import { B_TOP, bound, boundaryOf } from './slab';
import { snapCutCam, stepCutCam, type CutFrame } from './cutCamera';
import type { MoveState } from './burrowMoves';

/**
 * The side view while a robin hunts a worm underground or holds it (V4 spec revision 1): the cut
 * framed higher than the player's own view, so the ground line sits low in the middle, the robin
 * stands whole above it, and the worm shows below. The frame takes in the robin (at `ru` along the
 * cut) and the head (hu, hv), a little toward the side away from the robin's side (the grip's
 * ring sits on the screen's right: hunt.css). Pure; allocates nothing.
 */

/** Room above the ground for the robin standing (about 14 cm tall, 19 cm leaning back: 4.5 u). */
const ROBIN_ROOM = 5.2;
/** The frame is at least this tall, and never taller than this. */
const LEAST_H = 9;
const MOST_H = 14;
/** Room below the head. */
const BELOW_HEAD = 1.4;
/** Room either side of the robin and the head (along the cut). */
const SIDE_ROOM = 1.6;
/** On a wide screen the action sits this share of the frame's width left of centre (the ring is right). */
const LEFT_SHIFT = 0.14;
/** Looking almost straight at the cut (a little down). */
const PITCH = 0.06;
/** Neither view shows more along the cut than on a 16:9 screen (cutFrame.ts WIDEST). */
const WIDEST = 16 / 9;

// Fields start as fractions: a field that first held a whole number had V8 box every fraction written later.
const pt: UV = { u: 0.5, v: 0.5 };

/** What the hunt view frames: the head (hu, hv), the robin at ru along the cut, on a screen of `aspect`. */
export interface HuntAsk { hu: number; hv: number; ru: number; aspect: number }

/** Where the hunt view wants the frame, into `out`. */
export function huntFrame(s: Slab, q: Readonly<HuntAsk>, out: CutFrame): CutFrame {
  const hu = q.hu;
  const hv = q.hv;
  const ru = q.ru;
  const aspect = q.aspect;
  const a = Number.isFinite(aspect) && aspect > 0 ? Math.min(WIDEST, Math.max(0.4, aspect)) : WIDEST;
  pt.u = ru;
  boundaryOf(s, B_TOP, pt);
  const top = bound.v + ROBIN_ROOM;
  const lo = Math.min(hu, ru) - SIDE_ROOM;
  const hi = Math.max(hu, ru) + SIDE_ROOM;
  // Tall enough for the robin and the head, and wide enough for both side by side.
  let h = Math.max(LEAST_H, top - (hv - BELOW_HEAD), (hi - lo) / (a * (1 - 2 * LEFT_SHIFT)));
  h = Math.min(MOST_H, h);
  const w = h * a;
  // The robin's head on screen first; a head deeper than the tallest frame reaches drops off the bottom.
  out.cv = top - h / 2;
  // The pair a little left of centre on a landscape screen; centred on a portrait one.
  const shift = a > 1 ? LEFT_SHIFT * w : 0;
  let cu = (lo + hi) / 2 + shift;
  const half = w / 2;
  cu = s.faceHi - s.faceLo >= w ? Math.min(s.faceHi - half, Math.max(s.faceLo + half, cu)) : (s.faceLo + s.faceHi) / 2;
  out.cu = cu;
  out.h = h;
  out.pitch = PITCH;
  return out;
}

const ask: HuntAsk = { hu: 0.5, hv: 0.5, ru: 0.5, aspect: 1.5 };

/**
 * The hunt's frame for the game's camera, framing the robin at `g.robinU`: eased toward it (`snap`:
 * put there at once, the last step's too).
 */
export function frameHunt(g: MoveState & { readonly robinU: number }, dt: number, snap: boolean): void {
  const c = g.cam;
  const p = g.camPrev;
  const w = g.worm;
  if (!snap) {
    p.cu = c.cu.value; p.cv = c.cv.value; p.h = c.h.value; p.pitch = c.pitch.value;
  }
  ask.hu = w.u[0];
  ask.hv = w.v[0];
  ask.ru = g.robinU;
  ask.aspect = g.aspect;
  huntFrame(g.slab!, ask, g.frame);
  if (snap) {
    snapCutCam(c, g.frame, w.dir, g.view);
    p.cu = c.cu.value; p.cv = c.cv.value; p.h = c.h.value; p.pitch = c.pitch.value;
    return;
  }
  stepCutCam(c, g.frame, g.view, dt);
}
