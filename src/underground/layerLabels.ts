import type { Camera } from 'three';
import { TEXT, shown } from '../content/text';
import type { Slab } from './slab';
import { LAYER_LABEL_KEYS } from './layers';
import {
  LABEL_COUNT, createEndPoints, createEndPixels, projectEnd, namesShown, layoutEnd, writeChanged,
  type EndPoints, type EndPixels, type PixelSink,
} from './labelLayout';

/**
 * The layer names (V2 spec 5.3, 11.2): Leaf litter, Old leaves, Humus, Topsoil, Subsoil, always
 * shown at the two far ends of the playable slab only (nothing in the middle), each beside a small
 * tick line at its layer's top. Real DOM text (18 px bold ink on parchment, well over 7:1:
 * underground.css) over the canvas, below the HUD, never focusable. Placed each frame
 * (labelLayout.ts), but a style is written only when a whole-pixel position changes, so a still
 * camera writes nothing. Each name hides on its own once its point of the end leaves the screen,
 * and is held on screen where the world's edge leaves the end too little room. Screen readers get
 * one end's names as a list ("Soil layers"); the other end repeats them, so it is hidden from them
 * while the first shows all five. The ticks are decoration.
 */
export interface LayerLabels {
  /**
   * Places the labels for this frame's camera on a `width` x `height` screen, or hides them (`s`
   * null or `show` false). Allocates nothing unless a position changes.
   */
  update(camera: Camera, s: Slab | null, show: boolean, width: number, height: number): void;
}

interface End {
  readonly box: HTMLDivElement;
  readonly labels: HTMLSpanElement[];
  readonly ticks: HTMLSpanElement[];
  /** Each label's width in pixels, measured once it is first laid out (0: not yet). */
  readonly widths: Float64Array;
  readonly pts: EndPoints;
  /** Positions on the page now, and this frame's. */
  readonly last: EndPixels;
  readonly next: EndPixels;
  readonly sink: PixelSink;
  /** Which names show (each by its own point of the end: labelLayout.ts namesShown), and how many. */
  readonly on: Uint8Array;
  count: number;
  shown: boolean;
}

function makeEnd(root: HTMLElement): End {
  const box = document.createElement('div');
  box.className = 'cut-labels';
  box.setAttribute('role', 'list');
  box.setAttribute('aria-label', 'Soil layers');
  box.hidden = true;
  const labels: HTMLSpanElement[] = [];
  const ticks: HTMLSpanElement[] = [];
  for (const key of LAYER_LABEL_KEYS) {
    const l = document.createElement('span');
    l.className = 'cut-label';
    l.setAttribute('role', 'listitem');
    l.textContent = shown(TEXT[key]);
    labels.push(l);
  }
  for (let k = 0; k < LABEL_COUNT; k++) {
    // After the labels, so a tick stays visible where a label is held on screen over the end.
    const t = document.createElement('span');
    t.className = 'cut-tick';
    t.setAttribute('aria-hidden', 'true');
    ticks.push(t);
  }
  box.append(...labels, ...ticks);
  root.appendChild(box);
  return {
    box, labels, ticks, widths: new Float64Array(LABEL_COUNT), pts: createEndPoints(),
    last: createEndPixels(), next: createEndPixels(), on: new Uint8Array(LABEL_COUNT), count: 0, shown: false,
    sink: {
      label: (k, x, y) => { labels[k].style.transform = `translate(${x}px, ${y}px) translateY(-50%)`; },
      tick: (k, x, y) => { ticks[k].style.transform = `translate(${x}px, ${y}px)`; },
    },
  };
}

function setShown(e: End, on: boolean): void {
  if (on === e.shown) return;
  e.shown = on;
  e.box.hidden = !on;
}

/** Shows the names whose point of the end is on screen; the set shows while any does. */
function showNames(e: End, width: number): void {
  e.count = namesShown(e.pts, width, e.on);
  setShown(e, e.count > 0);
  for (let k = 0; k < LABEL_COUNT; k++) {
    const hide = e.on[k] === 0;
    if (e.labels[k].hidden !== hide) e.labels[k].hidden = e.ticks[k].hidden = hide;
  }
}

/** Reads each label's width once it renders (a layout read only until all are known). */
function measure(e: End): void {
  for (let k = 0; k < LABEL_COUNT; k++) if (e.widths[k] === 0) e.widths[k] = e.labels[k].offsetWidth;
}

function place(e: End, right: boolean, width: number): void {
  if (!e.shown) return;
  measure(e);
  writeChanged(e.last, layoutEnd(e.pts, right, e.widths, width, e.next), e.sink);
}

export function createLayerLabels(root: HTMLElement): LayerLabels {
  const lo = makeEnd(root);
  const hi = makeEnd(root);
  let hiSilent = false;
  return {
    update(camera, s, show, width, height) {
      if (!s || !show) {
        // Hidden names start afresh (each shows again only once it is on screen).
        lo.on.fill(0);
        hi.on.fill(0);
        setShown(lo, false);
        setShown(hi, false);
        return;
      }
      camera.updateMatrixWorld();
      projectEnd(camera, s, s.playLo, width, height, lo.pts);
      projectEnd(camera, s, s.playHi, width, height, hi.pts);
      showNames(lo, width);
      showNames(hi, width);
      // Screen readers hear one full set of names: the high end's repeats the low end's.
      const silent = lo.count === LABEL_COUNT;
      if (hiSilent !== silent) {
        hiSilent = silent;
        if (hiSilent) hi.box.setAttribute('aria-hidden', 'true');
        else hi.box.removeAttribute('aria-hidden');
      }
      // Whichever end is on the screen's right hangs its names to its right.
      const hiRight = !(hi.pts.tx[0] < lo.pts.tx[0]);
      place(lo, !hiRight, width);
      place(hi, hiRight, width);
    },
  };
}
