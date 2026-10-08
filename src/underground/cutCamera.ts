import { Spring } from '../surface/followCamera';
import type { Slab } from './slab';
import type { UndergroundView } from './modeMachine';
import { settle } from './easing';
import { FOV_DEG, frameAsked, type BodyPoints, type CutFrame, type FrameAsk } from './cutFrame';

export { frameAsked, frameTarget, FACE_BELOW, FACE_PAST, FOV_DEG, LABEL_ROOM, type BodyPoints, type CutFrame, type FrameAsk } from './cutFrame';

/**
 * The camera facing the cut (V2 spec 7). It stands square to the cut on the slab's camera side,
 * pitched a little down, and frames a rectangle of the plane: Wide shows the whole slab from just
 * above the surface down to about the B layer, following gently only when the slab is wider than
 * the screen; Close frames a few worm lengths around the head, with more room ahead. Its near
 * plane sits just in front of the cut, so the forest between the camera and the cut is never
 * drawn (no shader changes; the projection does it). Where each view wants the frame is
 * cutFrame.ts. Pure; allocates nothing per step.
 */
const TAN_HALF = Math.tan((FOV_DEG * Math.PI) / 360);
/** Seconds for the frame to settle: Wide follows gently, Close more closely. */
const SMOOTH = { wide: 0.9, close: 0.4 } as const;
/** The zoom and pitch settle this fast when the screen changes shape. */
const ZOOM_SMOOTH = 0.6;
/**
 * Switching view hands the shown frame over from where it was (and how it was moving) to the new
 * view's over this long, smoothly at both ends. (A spring alone, set off at full pull from a
 * standing start, jolted in its first frame, then panned at up to 15 u/s.)
 */
export const SWITCH_S = 1.0;
const AHEAD_SMOOTH = 0.8;
/**
 * The near plane stays this far in front of the cut's top (the worm stands out of it by 0.13; the
 * props' nearest point stays over 0.5 behind the cut's top as the camera sees it, measured on 40
 * slabs in both views): close in, so the forest's own rocks and log just in front are not drawn.
 */
export const CUT_MARGIN = 0.3;

export interface CutCam {
  /**
   * The frame shown (read `.value`; `.velocity` is its speed): its centre on the plane (u along
   * the cut, v height), its height there, and its pitch. It is the followed frame plus what is
   * left of a view switch's hand-over.
   */
  readonly cu: Spring;
  readonly cv: Spring;
  readonly h: Spring;
  readonly pitch: Spring;
  /** Which way the head faces, eased (Close keeps room ahead; a turn swings the room over slowly). */
  readonly au: Spring;
  readonly av: Spring;
  /** The view framed (null after a snap: the next step's view is taken as it is, with no switch). */
  view: UndergroundView | null;
  /** Seconds into the latest switch (SWITCH_S when none). */
  switchT: number;
  /** Per channel (cu, cv, h, pitch): the shown spring, the followed one, and what it last followed. */
  readonly shown: readonly Spring[];
  readonly follow: readonly Spring[];
  readonly aim: Float64Array;
  /** The hand-over's start per channel: offset from the followed frame, its speed, its acceleration. */
  readonly off: Float64Array;
}

export interface CutPose {
  /** Camera position and the point it looks at (world), and its near plane. */
  px: number; py: number; pz: number;
  lx: number; ly: number; lz: number;
  near: number;
}

export function createCutCam(): CutCam {
  const spring = (value: number): Spring => new Spring(value, 0);
  const shown = [spring(0), spring(0), spring(10), spring(0.2)];
  return {
    cu: shown[0], cv: shown[1], h: shown[2], pitch: shown[3], au: spring(0), av: spring(-1),
    view: null, switchT: SWITCH_S,
    shown, follow: shown.map((s) => spring(s.value)), aim: Float64Array.from(shown, (s) => s.value), off: new Float64Array(12),
  };
}

function frameAt(f: CutFrame, i: number): number {
  return i === 0 ? f.cu : i === 1 ? f.cv : i === 2 ? f.h : f.pitch;
}

/**
 * Puts the frame at `f`, facing `dir`, at once (arriving, or a reset), framed for `view` (a later
 * step in another view eases over); with no view, the next step's view is taken as it is.
 */
export function snapCutCam(c: CutCam, f: CutFrame, dir: number, view: UndergroundView | null = null): void {
  c.au.value = Math.cos(dir); c.au.velocity = 0;
  c.av.value = Math.sin(dir); c.av.velocity = 0;
  for (let i = 0; i < 4; i++) {
    c.shown[i].value = c.follow[i].value = frameAt(f, i);
    c.shown[i].velocity = c.follow[i].velocity = 0;
    c.aim[i] = frameAt(f, i);
  }
  c.view = view;
  c.switchT = SWITCH_S;
}

/**
 * A critically damped spring toward `target` (the same integration as followCamera's
 * smoothDampInto, without its clamp at the target: that clamp zeroes the speed the moment a moving
 * target is reached, a visible jolt when the frame catches up with the worm). Allocates nothing.
 */
export function springTo(s: Spring, target: number, smoothTime: number, dt: number): void {
  // A bad step (no time, or a target from a screen with no size) leaves the spring as it was.
  if (!(dt > 0) || !Number.isFinite(target)) return;
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = s.value - target;
  const temp = (s.velocity + omega * change) * dt;
  s.velocity = (s.velocity - omega * temp) * decay;
  s.value = target + (change + temp) * decay;
}

/** Eases the facing toward the head's `dir` (call before frameTarget). */
export function stepCutFacing(c: CutCam, dir: number, dt: number): void {
  springTo(c.au, Math.cos(dir), AHEAD_SMOOTH, dt);
  springTo(c.av, Math.sin(dir), AHEAD_SMOOTH, dt);
}

/**
 * One step of the camera following the worm `w` (head first, facing `w.dir`) in `view`:
 * stepCutFacing, then frameAsked (into `frame`, with `q.aspect`; it fills the rest of `q`), then
 * stepCutCam. The per-step form: it takes no loose numbers (cutFrame.ts FrameAsk).
 */
export function followCut(
  c: CutCam, view: UndergroundView, s: Slab, w: BodyPoints & { readonly dir: number }, q: FrameAsk, frame: CutFrame, dt: number,
): void {
  springTo(c.au, Math.cos(w.dir), AHEAD_SMOOTH, dt);
  springTo(c.av, Math.sin(w.dir), AHEAD_SMOOTH, dt);
  q.hu = w.u[0];
  q.hv = w.v[0];
  q.au = c.au.value;
  q.av = c.av.value;
  frameAsked(view, s, q, frame, w);
  stepCutCam(c, frame, view, dt);
}

/** Seconds channel `i` (cu, cv, h, pitch) of `view`'s followed frame takes to settle. */
function smoothOf(view: UndergroundView, i: number): number {
  // The zoom and pitch change only with the view (handed over) or the screen's shape.
  return i < 2 ? SMOOTH[view] : ZOOM_SMOOTH;
}

/**
 * Eases the frame toward `f`, framed for `view` (critically damped: no overshoot, no shake). When
 * `view` differs from the last step's, the followed frame moves to the new view's at once, at
 * rest, and the shown frame is handed over to it from where it is, at its speed and acceleration
 * (exact: the followed spring's and the hand-over's own), over SWITCH_S: no jump, no jolt, even
 * when switching again mid-switch.
 */
export function stepCutCam(c: CutCam, f: CutFrame, view: UndergroundView, dt: number): void {
  if (view !== c.view) {
    if (c.view !== null) {
      const s = c.switchT / SWITCH_S;
      for (let i = 0; i < 4; i++) {
        const k = c.follow[i];
        const w = 2 / smoothOf(c.view, i);
        const p = c.off[i]; const v = c.off[4 + i]; const a = c.off[8 + i];
        const speed = k.velocity + settle(p, v, a, s, 1) / SWITCH_S;
        const accel = w * w * (c.aim[i] - k.value) - 2 * w * k.velocity + settle(p, v, a, s, 2) / (SWITCH_S * SWITCH_S);
        const next = frameAt(f, i);
        if (!Number.isFinite(next)) continue;
        c.off[i] = c.shown[i].value - next;
        c.off[4 + i] = speed * SWITCH_S;
        c.off[8 + i] = accel * SWITCH_S * SWITCH_S;
        k.value = next;
        k.velocity = 0;
        c.aim[i] = next;
      }
      c.switchT = 0;
    }
    c.view = view;
  }
  if (!(dt > 0)) return;
  c.switchT = Math.min(SWITCH_S, c.switchT + dt);
  for (let i = 0; i < 4; i++) stepChannel(c, f, view, i, dt);
}

/** stepCutCam's step of channel `i` (a function of its own, small enough for V8 to inline its spring and easing). */
function stepChannel(c: CutCam, f: CutFrame, view: UndergroundView, i: number, dt: number): void {
  const s = c.switchT / SWITCH_S;
  const k = c.follow[i];
  const target = frameAt(f, i);
  springTo(k, target, smoothOf(view, i), dt);
  if (Number.isFinite(target)) c.aim[i] = target;
  const sh = c.shown[i];
  // The hand-over is over (settle is 0 from s = 1): no call then, so no numbers passed to box.
  const handing = !(s >= 1);
  sh.value = k.value + (handing ? settle(c.off[i], c.off[4 + i], c.off[8 + i], s, 0) : 0);
  sh.velocity = k.velocity + (handing ? settle(c.off[i], c.off[4 + i], c.off[8 + i], s, 1) : 0) / SWITCH_S;
}

/**
 * The camera for a frame centred at (cu, cv), `h` tall at the cut, pitched down by `pitch`:
 * square to the cut on its camera side, looking at the frame's centre. The near plane is just in
 * front of the highest point of the cut that can show (spec: the forest in front of the cut is
 * not drawn).
 */
export function cutPose(s: Slab, cu: number, cv: number, h: number, pitch: number, out: CutPose): CutPose {
  const d = h / (2 * TAN_HALF);
  const lx = s.ox + s.tx * cu;
  const lz = s.oz + s.tz * cu;
  const back = d * Math.cos(pitch);
  out.lx = lx;
  out.ly = cv;
  out.lz = lz;
  out.px = lx + s.nx * back;
  out.py = cv + d * Math.sin(pitch);
  out.pz = lz + s.nz * back;
  // View depth of a point of the cut at height y: back cos(pitch) + (py - y) sin(pitch).
  const top = s.topMax + 0.1;
  out.near = Math.max(0.2, back * Math.cos(pitch) + (out.py - top) * Math.sin(pitch) - CUT_MARGIN);
  return out;
}
