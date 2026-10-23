import * as THREE from 'three';
import { fbm2 } from '../core/noise';
import { sampleBody, type BodySample } from './body';
import { Mesher } from './mesher';
import { LENGTH, ORGANS, segStart, segmentAt, smooth } from './layout';

/**
 * The digestive tube, one continuous surface from the mouth to the anus: buccal cavity, the
 * muscular pharynx, the narrow esophagus with its calciferous pouches and glands, the thin-walled
 * crop, the thick gizzard, and the long intestine, pinched in at every septum. In the cutaway the
 * intestine is opened too, showing its lining and the typhlosole folded down from its roof.
 * Other organs are placed against it with gutPoint().
 */

/** A bump that is 1 in the middle of [a, b] and 0 at its ends; `p` flattens the top (a barrel). */
const bump = (s: number, a: number, b: number, p = 2): number => {
  if (s <= a || s >= b) return 0;
  const t = (2 * (s - a)) / (b - a) - 1;
  return Math.pow(1 - Math.pow(Math.abs(t), p), 0.5);
};
/** Smooth maximum, so the organs blend into each other instead of meeting at a crease. */
const smax = (a: number, b: number, k = 0.18): number => {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return a * (1 - h) + b * h + k * h * (1 - h);
};

const bs: BodySample = { s: 0, w: 0, h: 0, yc: 0 };

/** Where the gut starts: just inside the mouth, under the prostomium. */
export const GUT_START = 0.05;
/** The intestine is shown opened from here back to the end of the cutaway. */
export const OPEN_FROM = 20;

/** Radius of the gut at segment position s, before its cross-section shaping. */
export function gutRadius(s: number, w: number): number {
  let r = 0.26 + 0.34 * smooth(0.9, 2.6, s);
  r = smax(r, 1.4 * bump(s, 2.3, 6.1, 1.7));
  r = smax(r, 0.62 * smooth(5.4, 6.4, s));
  // The crop: a thin, soft sac; the gizzard: a firm, wider barrel right behind it.
  r = smax(r, 1.4 * bump(s, ORGANS.crop[0] - 0.7, ORGANS.crop[1] + 1.15, 1.6), 0.35);
  // Its thick muscle shows as fine rings round it.
  const giz = bump(s, ORGANS.gizzard[0] - 0.1, ORGANS.gizzard[1] + 1.35, 2.6);
  r = smax(r, 1.9 * giz * (1 + 0.015 * giz * Math.sin(s * 2 * Math.PI * 4)));
  if (s > ORGANS.intestineFrom - 0.3) {
    const f = s % 1;
    const sac = 0.86 + 0.14 * Math.sin(f * Math.PI);
    // The intestine starts no wider than the gizzard and widens over the next few segments.
    const ri = Math.min(0.55 * w, 1.75 + 0.5 * smooth(ORGANS.intestineFrom + 0.5, ORGANS.intestineFrom + 4, s)) * sac
      * smooth(ORGANS.intestineFrom - 0.5, ORGANS.intestineFrom + 0.4, s);
    r = smax(r, ri, 0.25);
  }
  return r;
}

/** The gut's centre height at x: from the mouth on the underside, up to just above the body's middle. */
export function gutCentreY(x: number, b: BodySample): number {
  return b.yc + b.h * (-0.6 + 0.66 * smooth(GUT_START, 3.4, x));
}

/**
 * The calciferous region: a pair of pouches in 10, then two pairs of rounded glands in 11 and 12,
 * swelling out on each side of the esophagus (1 elsewhere).
 */
function calciferous(s: number, th: number): number {
  const side = Math.exp(-(((Math.abs(Math.sin(th)) - 1) / 0.45) ** 2));
  const lobe = (c: number, k: number) => k * Math.exp(-(((s - c) / 0.3) ** 2));
  return 1 + side * (lobe(10.55, 0.45) + lobe(11.5, 0.85) + lobe(12.5, 0.85));
}

/** A point on the gut's surface at x, angle th (0 dorsal), pushed out by `lift`. */
export function gutPoint(x: number, th: number, out: THREE.Vector3, lift = 0): THREE.Vector3 {
  const b = sampleBody(Math.max(0.05, x), bs);
  const s = segmentAt(Math.max(0, x));
  let r = gutRadius(s, b.w);
  // The intestine narrows into the anus over the last segments.
  r *= 0.35 + 0.65 * smooth(LENGTH - 0.1, LENGTH - 6, x);
  // In the head the mouth cavity stays well inside the body (worms have no tongue).
  if (x < 1.5) r = Math.min(r, 0.42 * b.h);
  // The mouth cavity's front end is rounded off, just inside the mouth.
  r *= Math.sqrt(smooth(GUT_START - 0.02, GUT_START + 0.35, x));
  const k = calciferous(s, th);
  const c = Math.cos(th);
  // The pharynx is thickest on top (its muscular dorsal mass); the intestine is flattened with the body.
  const top = 1 + 0.18 * bump(s, 2.3, 6.1) * Math.max(0, c);
  const flat = s > ORGANS.intestineFrom - 1 ? b.h / b.w : 1;
  return out.set(x, gutCentreY(x, b) + c * (r * top * flat + lift), Math.sin(th) * (r * k + lift));
}

const C = {
  pharynx: new THREE.Color('#c98577'),
  esophagus: new THREE.Color('#d0a08a'),
  gland: new THREE.Color('#efe3cc'),
  crop: new THREE.Color('#f0dccd'),
  gizzard: new THREE.Color('#b8957c'),
  wall: new THREE.Color('#7d6a4a'),
  chloragogen: new THREE.Color('#c99c48'),
  lining: new THREE.Color('#c9927a'),
  dark: new THREE.Color('#5a3a24'),
};

function gutColor(x: number, th: number, out: THREE.Color): void {
  const s = segmentAt(Math.max(0, x));
  out.copy(C.pharynx);
  out.lerp(C.esophagus, smooth(5.4, 6.6, s));
  out.lerp(C.gland, Math.min(1, (calciferous(s, th) - 1) * 1.8));
  out.lerp(C.crop, smooth(14.7, 15.2, s));
  out.lerp(C.gizzard, smooth(16.85, 17.2, s));
  // The gizzard's tough wall: faint fibres running round it.
  out.multiplyScalar(1 - 0.12 * bump(s, 16.9, 19.3) * (0.5 + 0.5 * Math.sin(s * 2 * Math.PI * 4)));
  out.lerp(C.wall, smooth(19.4, 20.0, s));
  // Chloragogen tissue: yellow-brown cells coating the intestine, fine and soft.
  const gran = fbm2(x * 7, th * 7, 3, 5, 0);
  out.lerp(C.chloragogen, smooth(19.4, 20.2, s) * (0.6 + 0.2 * smooth(0.3, 0.7, gran)));
  // The septa pinch the intestine; the pinches sit a little darker.
  if (s > ORGANS.intestineFrom) out.multiplyScalar(0.85 + 0.15 * Math.sin((s % 1) * Math.PI));
}

const rowsOf = (x0: number, x1: number, step: number): number[] => {
  const xs: number[] = [];
  for (let x = x0; x < x1 - step * 0.3; x += step) xs.push(x);
  xs.push(x1);
  return xs;
};

function tube(m: Mesher, xs: number[], th0: number, th1: number, cols: number, at: (x: number, th: number, o: THREE.Vector3) => void,
  color: (x: number, th: number, o: THREE.Color) => void, flip = false): void {
  const rows = xs.length - 1;
  const xAt = (u: number): number => {
    const f = u * rows;
    const i = Math.min(rows - 1, Math.floor(f));
    return xs[i] + (xs[i + 1] - xs[i]) * (f - i);
  };
  const th = (v: number) => th0 + (th1 - th0) * v;
  m.surface(rows, cols, (u, v, o) => at(xAt(u), th(v), o), (u, v, _p, o) => color(xAt(u), th(v), o),
    { wrapV: th1 - th0 > 6.28, flip });
}

const CUT_WALL = new THREE.Color('#d39a86');
const TYPHLO_CORE = new THREE.Color('#d9b26a');

/** Wall thickness of the opened intestine, and the typhlosole's depth (fractions of its radius). */
const WALL = 0.1;
const TYPHLO = 0.58;
const inward = new THREE.Vector3();

/** The intestine's inner lining, with the typhlosole folding down from the roof. */
export function liningPoint(x: number, th: number, o: THREE.Vector3): void {
  const a = Math.abs(Math.atan2(Math.sin(th), Math.cos(th)));
  const fold = TYPHLO * Math.exp(-((a / 0.26) ** 2));
  gutPoint(x, th, o);
  // gutPoint with lift -1 is one unit further in, so (that - o) is the inward direction.
  gutPoint(x, th, inward, -1).sub(o);
  const r = gutRadius(segmentAt(x), sampleBody(x, bs).w);
  o.addScaledVector(inward, r * (WALL + fold));
}

/**
 * The gut: `all` is the whole tube outside the opened stretch; `far`/`near` the two halves of the
 * opened intestine; `cut` its lining, typhlosole and cut edges (shown only while cut).
 */
export function buildGut(radial: number, stepFront: number, stepBack: number): { all: Mesher; far: Mesher; near: Mesher; cut: Mesher } {
  const out = { all: new Mesher(), far: new Mesher(), near: new Mesher(), cut: new Mesher() };
  const x0 = segStart(OPEN_FROM);
  const x1 = segStart(31);
  const end = LENGTH - 0.12;
  const at = (x: number, th: number, o: THREE.Vector3) => { gutPoint(x, th, o); };
  tube(out.all, rowsOf(GUT_START, x0, stepFront), 0, 2 * Math.PI, radial, at, gutColor);
  tube(out.all, rowsOf(x1, end, stepBack), 0, 2 * Math.PI, radial, at, gutColor);
  const open = rowsOf(x0, x1, stepFront);
  tube(out.far, open, Math.PI, 2 * Math.PI, radial / 2, at, gutColor);
  tube(out.near, open, 0, Math.PI, radial / 2, at, gutColor);
  const lining = (x: number, th: number, o: THREE.Color) => {
    const a = Math.abs(Math.atan2(Math.sin(th), Math.cos(th)));
    // The fold's sides sit in shadow, so it reads as a ridge hanging into the gut.
    const side = Math.exp(-(((a - 0.3) / 0.09) ** 2));
    o.copy(C.lining).lerp(C.dark, 0.35 * Math.exp(-((a / 0.22) ** 2))).multiplyScalar((0.9 + 0.1 * Math.sin(th * 30 + x * 3)) * (1 - 0.35 * side));
  };
  tube(out.cut, open, Math.PI, 2 * Math.PI, radial * 2, liningPoint, lining, true);
  // The cut edges of the wall, top and bottom, flat on the cut plane.
  const edge = (th: number, flip: boolean) => {
    const rows = open.length - 1;
    const a = new THREE.Vector3();
    out.cut.surface(rows, 6, (u, v, o) => {
      const f = u * rows;
      const i = Math.min(rows - 1, Math.floor(f));
      const x = open[i] + (open[i + 1] - open[i]) * (f - i);
      gutPoint(x, th, a);
      liningPoint(x, th, o);
      o.lerp(a, 1 - v);
      o.z = 0;
    }, (_u, v, _p, o) => {
      // The cut face, banded like a slide: the yellow chloragogen coat, the muscular wall, then
      // (in the roof) the typhlosole's chloragogen-filled core, and the lining at its edge.
      if (th !== 0) {
        o.copy(v < 0.3 ? C.chloragogen : v < 0.9 ? CUT_WALL : C.lining);
        return;
      }
      const wall = 0.17;
      if (v < 0.05) o.copy(C.chloragogen);
      else if (v < wall) o.copy(CUT_WALL);
      else if (v < 0.93) o.copy(TYPHLO_CORE).multiplyScalar(0.92 + 0.08 * Math.sin(v * 40));
      else o.copy(C.lining).multiplyScalar(0.85);
    }, { flip });
  };
  edge(0, false);
  edge(Math.PI, true);
  return out;
}
