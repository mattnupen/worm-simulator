import { Vector3, type Camera } from 'three';
import { boundaryAt, slabU, slabX, slabZ, type Slab } from './slab';
import { LAYER_LABEL_KEYS } from './layers';

/**
 * Where the layer names go on screen (layerLabels.ts draws them; labelFrame.ts picks which end
 * shows what; V2 spec 5.3). Pure and allocation-free: a slab end's layers are projected into
 * pixels (or, off screen, where they meet the screen's edge), the labels hang outward beside
 * their layers, pushed apart where layers are thin, kept on screen and clear of the controls, and
 * every position is rounded to a whole pixel so a still camera changes nothing.
 */

export const LABEL_COUNT = LAYER_LABEL_KEYS.length;
/** Label centres keep at least this many pixels apart: a label is this tall (underground.css). */
export const LABEL_GAP = 30;
/** Pixels between the slab's end and its labels. */
export const LABEL_SIDE = 12;
/** A tick's length in pixels, from the slab's end outward (underground.css .cut-tick). */
export const TICK_W = 20;
/** Labels keep this far inside the screen's sides, however little room the end leaves them. */
export const SCREEN_EDGE = 6;
/**
 * A far-end name shows once its point of the slab's end is on screen, and hides only once that
 * point is this far off it, so an end resting at the screen's edge never flickers.
 */
export const HIDE_PAD = 16;
/** Labels keep this far from the controls (the joystick, the Action prompt, Pause)... */
export const CONTROL_GAP = 8;
/** ...and start sliding past one this far (sideways) before they reach it, so they never jump. */
export const CONTROL_RAMP = 30;
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
const eye = new Vector3();
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

/** Height of layer k's top (B_TOP .. B_E are 0 .. 4), or of its middle (`mid`), at u. */
function layerV(s: Slab, k: number, mid: boolean, u: number): number {
  const top = boundaryAt(s, k, u);
  if (!mid) return top;
  return (top + (k + 1 < LABEL_COUNT ? boundaryAt(s, k + 1, u) : top - 2 * SUBSOIL_MID)) / 2;
}

/** The end of the slab at `u` on screen: each layer's top and middle, Leaf litter to Subsoil. */
export function projectEnd(camera: Camera, s: Slab, u: number, width: number, height: number, out: EndPoints): EndPoints {
  const x = slabX(s, u);
  const z = slabZ(s, u);
  out.ok = true;
  for (let k = 0; k < LABEL_COUNT; k++) {
    if (!projectPoint(camera, x, layerV(s, k, false, u), z, width, height)) { out.ok = false; return out; }
    out.tx[k] = px.x;
    out.ty[k] = px.y;
    if (!projectPoint(camera, x, layerV(s, k, true, u), z, width, height)) { out.ok = false; return out; }
    out.mx[k] = px.x;
    out.my[k] = px.y;
  }
  return out;
}

/** u where the camera's ray through screen pixel (sx, sy) meets the cut; NaN if it never does. */
function screenU(camera: Camera, s: Slab, sx: number, sy: number, width: number, height: number): number {
  eye.setFromMatrixPosition(camera.matrixWorld);
  v3.set((sx / width) * 2 - 1, 1 - (sy / height) * 2, 0.5).unproject(camera).sub(eye);
  const along = v3.x * s.nx + v3.z * s.nz;
  if (Math.abs(along) < 1e-9) return NaN;
  const t = -((eye.x - s.ox) * s.nx + (eye.z - s.oz) * s.nz) / along;
  return t > 0 ? slabU(s, eye.x + t * v3.x, eye.z + t * v3.z) : NaN;
}

/** Where layer k's top (or middle) meets the screen's edge at `edge` (x): its y, into `ys[k]`. */
function dockPoint(camera: Camera, s: Slab, k: number, mid: boolean, edge: number, ys: Float64Array, width: number, height: number): void {
  // The layer's height at the edge depends on where along the cut the edge falls, which depends
  // on the height: a few rounds settle it well under a pixel.
  for (let i = 0; i < 3; i++) {
    const u = screenU(camera, s, edge, ys[k], width, height);
    if (!Number.isFinite(u)) return;
    if (!projectPoint(camera, slabX(s, u), layerV(s, k, mid, u), slabZ(s, u), width, height)) return;
    ys[k] = px.y;
  }
}

/**
 * Docks an end that lies off the screen's `right` (or left) side: each of its layer points
 * beyond the edge moves to where that layer meets the edge (its on-screen height there). An end
 * on screen is left as it is, so its names ride the true end, and the change is continuous.
 */
export function dockEnd(camera: Camera, s: Slab, p: EndPoints, right: boolean, width: number, height: number): void {
  if (!p.ok) return;
  const edge = right ? width : 0;
  for (let k = 0; k < LABEL_COUNT; k++) {
    if (right ? p.tx[k] > edge : p.tx[k] < edge) { dockPoint(camera, s, k, false, edge, p.ty, width, height); p.tx[k] = edge; }
    if (right ? p.mx[k] > edge : p.mx[k] < edge) { dockPoint(camera, s, k, true, edge, p.my, width, height); p.mx[k] = edge; }
  }
}

/**
 * Whether a far-end name shows this frame: `x` is its tick's screen x, on the slab's end. On
 * screen shows it; it hides only once HIDE_PAD off (hysteresis, so no flicker at the edge).
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
 * Fits a column of labels (centres `ys`, top to bottom, at left edges `lx`, `widths` wide) on a
 * screen `height` pixels tall, in place: at least LABEL_GAP apart (thin layers), on screen, and clear
 * of the controls (`rects`: `n` rectangles x0, y0, x1, y1). A label beside a control slides past
 * it vertically, below one in the screen's top half and above one in its bottom half, so the
 * names stay at the slab's end (or the screen's edge), never pushed toward the middle. A control
 * takes effect over CONTROL_RAMP pixels beside it, so a label never jumps; it is fully clear
 * before it reaches the control. Every step is a min or max: continuous, so nothing flickers.
 */
export function fitColumn(
  ys: Float64Array, lx: Float64Array, widths: ArrayLike<number>, rects: Float64Array, n: number, height: number,
): void {
  const half = LABEL_GAP / 2;
  for (let k = 0; k < LABEL_COUNT; k++) {
    let y = Math.max(ys[k], SCREEN_EDGE + half);
    if (k > 0) y = Math.max(y, ys[k - 1] + LABEL_GAP);
    for (let i = 0; i < n; i++) {
      if (rects[i * 4 + 1] + rects[i * 4 + 3] >= height) continue;
      const t = beside(lx[k], widths[k], rects, i);
      const floor = rects[i * 4 + 3] + CONTROL_GAP + half;
      if (t > 0 && y < floor) y += t * (floor - y);
    }
    ys[k] = y;
  }
  for (let k = LABEL_COUNT - 1; k >= 0; k--) {
    let y = Math.min(ys[k], height - SCREEN_EDGE - half);
    if (k + 1 < LABEL_COUNT) y = Math.min(y, ys[k + 1] - LABEL_GAP);
    for (let i = 0; i < n; i++) {
      if (rects[i * 4 + 1] + rects[i * 4 + 3] < height) continue;
      const t = beside(lx[k], widths[k], rects, i);
      const ceiling = rects[i * 4 + 1] - CONTROL_GAP - half;
      if (t > 0 && y > ceiling) y -= t * (y - ceiling);
    }
    ys[k] = y;
  }
}

/** How fully (0..1) a label at x, w wide, lies beside control i: 1 once it is within CONTROL_GAP of it. */
function beside(x: number, w: number, rects: Float64Array, i: number): number {
  const d = Math.min(x + w - (rects[i * 4] - CONTROL_GAP - CONTROL_RAMP), rects[i * 4 + 2] + CONTROL_GAP + CONTROL_RAMP - x);
  return Math.min(1, Math.max(0, d / CONTROL_RAMP));
}

/**
 * Lays out one end's labels and ticks in whole pixels into `out`. `right`: the end is the screen's
 * right one, so its names hang to its right. `widths`: each label's width in pixels (0 if not yet
 * measured). A label that would leave the screen's side is held SCREEN_EDGE inside it, each on its
 * own; the column then fits the screen's height and clears the controls (fitColumn, given `rects`,
 * `n` and `height`). Ticks stay on the end, or at the screen's edge where the end is docked.
 */
export function layoutEnd(
  p: EndPoints, right: boolean, widths: ArrayLike<number>, width: number, out: EndPixels,
  rects: Float64Array = NO_RECTS, n = 0, height = Infinity,
): EndPixels {
  const { lx, ly, tx, ty } = out;
  for (let k = 0; k < LABEL_COUNT; k++) {
    const w = widths[k];
    const x = right ? p.mx[k] + LABEL_SIDE : p.mx[k] - LABEL_SIDE - w;
    lx[k] = Math.round(Math.max(SCREEN_EDGE, Math.min(width - SCREEN_EDGE - w, x)));
    ly[k] = p.my[k];
  }
  fitColumn(ly, lx, widths, rects, n, height);
  for (let k = 0; k < LABEL_COUNT; k++) {
    ly[k] = Math.round(ly[k]);
    tx[k] = Math.round(right ? Math.min(p.tx[k], width - TICK_W) : Math.max(p.tx[k] - TICK_W, 0));
    ty[k] = Math.round(p.ty[k]);
  }
  return out;
}
const NO_RECTS = new Float64Array(0);

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
