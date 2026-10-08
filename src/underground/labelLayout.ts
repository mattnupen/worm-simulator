import { Vector3, type Camera } from 'three';
import { boundaryAt, slabX, slabZ, B_TOP, B_F, B_H, B_A, B_E, type Slab } from './slab';
import { LAYER_LABEL_KEYS } from './layers';

/**
 * Where the layer names go on screen (layerLabels.ts draws them; V2 spec 5.3). Pure and
 * allocation-free: the slab's end is projected into pixels, the labels hang outward from it beside
 * their layers, pushed apart where layers are thin and kept on screen where the end leaves too
 * little room, and every position is rounded to a whole pixel so a still camera changes nothing.
 */

export const LABEL_COUNT = LAYER_LABEL_KEYS.length;
/** Label centres keep at least this many pixels apart (a label is 30 px tall: underground.css). */
export const LABEL_GAP = 30;
/** Pixels between the slab's end and its labels. */
export const LABEL_SIDE = 12;
/** A tick's length in pixels, from the slab's end outward (underground.css .cut-tick). */
export const TICK_W = 20;
/** Labels keep this far inside the screen's sides, however little room the end leaves them. */
export const SCREEN_EDGE = 6;
/**
 * A name shows once its point of the slab's end is on screen, and hides only once that point is
 * this far off it, so an end resting at the screen's edge never flickers.
 */
export const HIDE_PAD = 16;
/** The subsoil (E and B) label sits this far (u) below the E top: B runs on to the slab's bottom. */
const SUBSOIL_MID = 0.6;

/** One end of the slab on screen (pixels): each layer's top (tick) and middle (label). */
export interface EndPoints {
  /** False when a point is behind the camera. */
  ok: boolean;
  readonly tx: Float64Array;
  readonly ty: Float64Array;
  readonly mx: Float64Array;
  readonly my: Float64Array;
}

/** Whole-pixel positions: each label's left edge and centre, each tick's left edge and centre. */
export interface EndPixels {
  readonly lx: Float64Array;
  readonly ly: Float64Array;
  readonly tx: Float64Array;
  readonly ty: Float64Array;
}

export function createEndPoints(): EndPoints {
  const a = (): Float64Array => new Float64Array(LABEL_COUNT);
  return { ok: false, tx: a(), ty: a(), mx: a(), my: a() };
}

/** NaN everywhere: nothing written yet, so the first layout differs in every place. */
export function createEndPixels(): EndPixels {
  const a = (): Float64Array => new Float64Array(LABEL_COUNT).fill(NaN);
  return { lx: a(), ly: a(), tx: a(), ty: a() };
}

const v3 = new Vector3();
/** Scratch for projectPoint's result. */
export const px = { x: 0, y: 0 };

/**
 * Projects world (x, y, z) through `camera` (its matrices must be current) to pixels on a
 * `width` x `height` screen, into `px`. False (px untouched) when the point is behind the camera.
 */
export function projectPoint(camera: Camera, x: number, y: number, z: number, width: number, height: number): boolean {
  v3.set(x, y, z).project(camera);
  if (!(v3.z <= 1)) return false;
  px.x = (v3.x * 0.5 + 0.5) * width;
  px.y = (-v3.y * 0.5 + 0.5) * height;
  return true;
}

const tops = new Float64Array(LABEL_COUNT + 1);

/** The end of the slab at `u` on screen: each layer's top and middle, Leaf litter to Subsoil. */
export function projectEnd(camera: Camera, s: Slab, u: number, width: number, height: number, out: EndPoints): EndPoints {
  tops[0] = boundaryAt(s, B_TOP, u);
  tops[1] = boundaryAt(s, B_F, u);
  tops[2] = boundaryAt(s, B_H, u);
  tops[3] = boundaryAt(s, B_A, u);
  tops[4] = boundaryAt(s, B_E, u);
  tops[5] = tops[4] - 2 * SUBSOIL_MID;
  const x = slabX(s, u);
  const z = slabZ(s, u);
  out.ok = true;
  for (let k = 0; k < LABEL_COUNT; k++) {
    if (!projectPoint(camera, x, tops[k], z, width, height)) { out.ok = false; return out; }
    out.tx[k] = px.x;
    out.ty[k] = px.y;
    if (!projectPoint(camera, x, (tops[k] + tops[k + 1]) / 2, z, width, height)) { out.ok = false; return out; }
    out.mx[k] = px.x;
    out.my[k] = px.y;
  }
  return out;
}

/** Thin layers: each label at least `gap` below the one above it (top to bottom, in place). */
export function pushApart(ys: Float64Array, gap: number): void {
  for (let k = 1; k < ys.length; k++) if (ys[k] < ys[k - 1] + gap) ys[k] = ys[k - 1] + gap;
}

/**
 * Whether a name shows this frame: `x` is its tick's screen x, on the slab's end. On screen shows
 * it; it hides only once HIDE_PAD off (hysteresis, so an end resting at the edge never flickers).
 */
export function endShows(ok: boolean, wasShown: boolean, x: number, width: number): boolean {
  if (!ok || !Number.isFinite(x)) return false;
  const pad = wasShown ? HIDE_PAD : 0;
  return x >= -pad && x <= width + pad;
}

/**
 * Which of an end's names show (1) or hide (0), into `on` (which holds last frame's): each by
 * where its own layer meets the end, since the end leans on screen (the camera looks down a
 * little) and can be partly off it. Returns how many show.
 */
export function namesShown(p: EndPoints, width: number, on: Uint8Array): number {
  let n = 0;
  for (let k = 0; k < LABEL_COUNT; k++) {
    on[k] = endShows(p.ok, on[k] === 1, p.tx[k], width) ? 1 : 0;
    n += on[k];
  }
  return n;
}

/**
 * Lays out one end's labels and ticks in whole pixels into `out`. `right`: the end is the screen's
 * right one, so its names hang to its right. `widths`: each label's width in pixels (0 if not yet
 * measured). A label that would leave the screen is held SCREEN_EDGE inside it, each on its own
 * (only where the world's edge leaves the end too little room); its tick stays on the end.
 */
export function layoutEnd(p: EndPoints, right: boolean, widths: ArrayLike<number>, width: number, out: EndPixels): EndPixels {
  const { lx, ly, tx, ty } = out;
  for (let k = 0; k < LABEL_COUNT; k++) ly[k] = p.my[k];
  pushApart(ly, LABEL_GAP);
  for (let k = 0; k < LABEL_COUNT; k++) {
    const w = widths[k];
    const x = right
      ? Math.min(p.mx[k] + LABEL_SIDE, width - SCREEN_EDGE - w)
      : Math.max(p.mx[k] - LABEL_SIDE - w, SCREEN_EDGE);
    lx[k] = Math.round(x);
    ly[k] = Math.round(ly[k]);
    tx[k] = Math.round(right ? p.tx[k] : p.tx[k] - TICK_W);
    ty[k] = Math.round(p.ty[k]);
  }
  return out;
}

/** Where changed pixel positions are written (the page's elements; a counter in tests). */
export interface PixelSink {
  label(k: number, x: number, y: number): void;
  tick(k: number, x: number, y: number): void;
}

/**
 * Writes to `sink` only the labels and ticks whose whole-pixel position differs from `last`, and
 * remembers them there. Returns the number of writes: 0 for a still camera.
 */
export function writeChanged(last: EndPixels, next: EndPixels, sink: PixelSink): number {
  let n = 0;
  for (let k = 0; k < LABEL_COUNT; k++) {
    if (next.lx[k] !== last.lx[k] || next.ly[k] !== last.ly[k]) {
      last.lx[k] = next.lx[k];
      last.ly[k] = next.ly[k];
      sink.label(k, next.lx[k], next.ly[k]);
      n++;
    }
    if (next.tx[k] !== last.tx[k] || next.ty[k] !== last.ty[k]) {
      last.tx[k] = next.tx[k];
      last.ty[k] = next.ty[k];
      sink.tick(k, next.tx[k], next.ty[k]);
      n++;
    }
  }
  return n;
}
