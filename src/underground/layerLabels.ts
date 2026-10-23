import type { Camera } from 'three';
import { TEXT, shown, type Line } from '../content/text';
import type { Slab } from './slab';
import { LAYER_LABEL_KEYS } from './layers';
import { LABEL_COUNT, createEndPixels, writeChanged, type EndPixels, type PixelSink } from './labelLayout';
import { createLabelFrame, clearLabelFrame, layoutLabels, type LabelEnd } from './labelFrame';

/**
 * The layer names (V2 spec 5.3, 11.2): Leaf litter, Old leaves, Humus, Topsoil, Subsoil, always
 * shown, only at the slab's ends (never in the middle of the screen), each beside a small tick
 * line at its layer's top. The end nearer the head always shows all five, docked at the screen's
 * edge while the end is off screen; the far end's show where it is on screen (labelFrame.ts).
 * Real DOM text (18 px bold ink on parchment, well over 7:1: underground.css) over the canvas,
 * below the HUD and clear of its controls, never focusable. Placed each frame, but a style is
 * written only when a whole-pixel position changes, so a still camera writes nothing. Screen
 * readers get the near end's five names as one list; the far end's repeat them, so they are
 * hidden from them. The ticks are decoration.
 */
export interface LayerLabels {
  /**
   * Places the labels for this frame's camera on a `width` x `height` screen, or hides them (`s`
   * null or `show` false). `headU`: the worm's head along the cut (the nearer end shows all its
   * names); without it, the middle of the camera's frame. Allocates nothing unless a position changes.
   */
  update(camera: Camera, s: Slab | null, show: boolean, width: number, height: number, headU?: number): void;
}

/** The controls the names keep clear of (hud.css), read from the page. */
const CONTROLS = ['.joystick', '.action-prompt'] as const;
/** The controls are read again this often (frames): the Action prompt's word changes its width. */
const RECHECK = 60;
/** The list's name for screen readers (TEXT.layerListLabel, once content/text.ts has it). */
const LIST_LABEL: Line | undefined = (TEXT as Readonly<Record<string, Line | undefined>>)['layerListLabel'];

interface End {
  readonly box: HTMLDivElement;
  readonly labels: HTMLSpanElement[];
  readonly ticks: HTMLSpanElement[];
  /** Positions on the page now. */
  readonly last: EndPixels;
  readonly sink: PixelSink;
  shown: boolean;
  /** The near end (the one screen readers hear), as last written. */
  heard: boolean;
}

function makeEnd(root: HTMLElement): End {
  const box = document.createElement('div');
  box.className = 'cut-labels';
  box.setAttribute('role', 'list');
  if (LIST_LABEL) box.setAttribute('aria-label', shown(LIST_LABEL));
  box.setAttribute('aria-hidden', 'true');
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
    box, labels, ticks, last: createEndPixels(), shown: false, heard: false,
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

/** Shows this frame's names (the set while any shows), and lets screen readers hear the near end. */
function showNames(e: End, f: LabelEnd): void {
  setShown(e, f.count > 0);
  for (let k = 0; k < LABEL_COUNT; k++) {
    const hide = f.on[k] === 0;
    if (e.labels[k].hidden !== hide) e.labels[k].hidden = e.ticks[k].hidden = hide;
  }
  if (e.heard !== f.near) {
    e.heard = f.near;
    if (f.near) e.box.removeAttribute('aria-hidden');
    else e.box.setAttribute('aria-hidden', 'true');
  }
}

/** Reads the widths of shown labels not yet measured (a layout read only until each is known). */
function measure(e: End, f: LabelEnd): boolean {
  let got = false;
  for (let k = 0; k < LABEL_COUNT; k++) {
    if (f.widths[k] !== 0 || f.on[k] === 0) continue;
    f.widths[k] = e.labels[k].offsetWidth;
    got ||= f.widths[k] > 0;
  }
  return got;
}

export function createLayerLabels(root: HTMLElement): LayerLabels {
  const lo = makeEnd(root);
  const hi = makeEnd(root);
  const frame = createLabelFrame();
  /** Each control's last seen rectangle (kept while it is hidden: it comes back in the same place). */
  const seen = new Float64Array(CONTROLS.length * 4);
  let seenW = -1;
  let seenH = -1;
  let frames = 0;
  let showing = false;

  function readControls(width: number, height: number): void {
    if (width !== seenW || height !== seenH) {
      seen.fill(0);
      seenW = width;
      seenH = height;
    }
    let n = 0;
    for (let i = 0; i < CONTROLS.length; i++) {
      const el = root.querySelector(CONTROLS[i]);
      const r = el?.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0) {
        seen[i * 4] = r.left; seen[i * 4 + 1] = r.top; seen[i * 4 + 2] = r.right; seen[i * 4 + 3] = r.bottom;
      }
      if (seen[i * 4 + 2] > seen[i * 4]) {
        for (let j = 0; j < 4; j++) frame.rects[n * 4 + j] = seen[i * 4 + j];
        n++;
      }
    }
    frame.rectCount = n;
  }

  return {
    update(camera, s, show, width, height, headU) {
      if (!s || !show) {
        if (showing) {
          showing = false;
          clearLabelFrame(frame);
          setShown(lo, false);
          setShown(hi, false);
        }
        return;
      }
      camera.updateMatrixWorld();
      if (!showing || width !== seenW || height !== seenH || ++frames >= RECHECK) {
        frames = 0;
        readControls(width, height);
      }
      showing = true;
      const e = camera.matrixWorld.elements;
      const hu = headU ?? (e[12] - s.ox) * s.tx + (e[14] - s.oz) * s.tz;
      layoutLabels(frame, camera, s, hu, width, height);
      showNames(lo, frame.lo);
      showNames(hi, frame.hi);
      // Newly shown labels: measured once, then laid out again with their real widths.
      const newLo = measure(lo, frame.lo);
      if (measure(hi, frame.hi) || newLo) layoutLabels(frame, camera, s, hu, width, height);
      if (lo.shown) writeChanged(lo.last, frame.lo.px, lo.sink);
      if (hi.shown) writeChanged(hi.last, frame.hi.px, hi.sink);
    },
  };
}
