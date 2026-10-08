import type { Camera } from 'three';
import type { Slab } from './slab';
import {
  LABEL_COUNT, createEndPoints, createEndPixels, projectEnd, dockEnd, namesShown, layoutEnd,
  type EndPoints, type EndPixels,
} from './labelLayout';

/**
 * Which end of the slab shows which names this frame (V2 spec 5.3, answer 11.2: always shown,
 * only at the ends). The end nearer the worm's head always shows all five: on screen they ride
 * the true end; off screen they dock at the screen's edge on the side the end lies on, beside
 * each layer's height there. The far end's names show only where it is on screen. Nothing goes in
 * the middle of the screen. Pure and allocation-free (layerLabels.ts puts it on the page).
 */

/** The nearer end changes only once the head is this far past the playable slab's middle. */
export const NEAR_SWITCH = 0.5;
/** Room for the controls' rectangles (the joystick, the Action prompt, Pause, and spare). */
const MAX_RECTS = 4;

export interface LabelEnd {
  readonly pts: EndPoints;
  /** Which names show (1), and how many. */
  readonly on: Uint8Array;
  count: number;
  /** Each label's width in pixels (0: not measured yet; the page measures it). */
  readonly widths: Float64Array;
  /** This frame's whole-pixel layout. */
  readonly px: EndPixels;
  /** The end is the screen's right one (its names hang right); it is the end nearer the head. */
  right: boolean;
  near: boolean;
}

export interface LabelFrame {
  /** The nearer end: 1 the high (playHi) end, 0 the low one, -1 not chosen yet. */
  nearHi: number;
  readonly lo: LabelEnd;
  readonly hi: LabelEnd;
  /** The controls labels keep clear of: `rectCount` rectangles (x0, y0, x1, y1), in pixels. */
  readonly rects: Float64Array;
  rectCount: number;
}

function createEnd(): LabelEnd {
  return {
    pts: createEndPoints(), on: new Uint8Array(LABEL_COUNT), count: 0, widths: new Float64Array(LABEL_COUNT),
    px: createEndPixels(), right: false, near: false,
  };
}

export function createLabelFrame(): LabelFrame {
  return { nearHi: -1, lo: createEnd(), hi: createEnd(), rects: new Float64Array(MAX_RECTS * 4), rectCount: 0 };
}

/** Names hidden: each far-end name shows again only once on screen, and the near end is chosen afresh. */
export function clearLabelFrame(f: LabelFrame): void {
  f.nearHi = -1;
  for (const e of [f.lo, f.hi]) { e.on.fill(0); e.count = 0; e.near = false; }
}

/**
 * Lays out both ends for this frame's camera (matrices current) on a `width` x `height` screen,
 * with the worm's head at `headU` along the cut.
 */
export function layoutLabels(f: LabelFrame, camera: Camera, s: Slab, headU: number, width: number, height: number): void {
  projectEnd(camera, s, s.playLo, width, height, f.lo.pts);
  projectEnd(camera, s, s.playHi, width, height, f.hi.pts);
  const off = headU - (s.playLo + s.playHi) / 2;
  if (off > NEAR_SWITCH) f.nearHi = 1;
  else if (off < -NEAR_SWITCH) f.nearHi = 0;
  else if (f.nearHi < 0) f.nearHi = off >= 0 ? 1 : 0;
  // Whichever end is on the screen's right hangs its names to its right.
  f.hi.right = !(f.hi.pts.tx[0] < f.lo.pts.tx[0]);
  f.lo.right = !f.hi.right;
  f.hi.near = f.nearHi === 1;
  f.lo.near = !f.hi.near;
  for (const e of [f.lo, f.hi]) {
    if (e.near) {
      dockEnd(camera, s, e.pts, e.right, width, height);
      e.on.fill(e.pts.ok ? 1 : 0);
      e.count = e.pts.ok ? LABEL_COUNT : 0;
    } else {
      e.count = namesShown(e.pts, width, e.on);
    }
    if (e.count > 0) layoutEnd(e.pts, e.right, e.widths, width, e.px, f.rects, f.rectCount, height);
  }
}
