import * as THREE from 'three';
import { Mesher } from './mesher';
import { bodyPoint } from './body';
import { gutPoint } from './gut';
import { bucket } from './blood';
import { PEEL, SEGMENTS, WALL, inPeel, segStart, segmentAt, wallThickness } from './layout';
import { cutX, ringIndex, wallSheet } from './skin';
import { sweep } from './sweep';

/**
 * The muscles: the circular muscle sleeve just under the skin (it squeezes the body thin and
 * long), the thicker longitudinal muscle under it (it pulls the body short and fat), shown through
 * a window where the circular layer is peeled back; the septa between segments; and the strands
 * that pull the pharynx.
 */

const CIRC = new THREE.Color('#b0474d');
const CIRC_LIGHT = new THREE.Color('#cf6d6c');
const LONG = new THREE.Color('#d98a80');
const LONG_DARK = new THREE.Color('#b9655f');

export interface MuscleParts {
  far: Mesher;
  near: Mesher;
  rest: Mesher;
  septaFar: Mesher;
  septaNear: Mesher;
  septaRest: Mesher;
  strandsFar: Mesher;
  strandsNear: Mesher;
}

export function buildMuscles(): MuscleParts {
  const p: MuscleParts = {
    far: new Mesher(), near: new Mesher(), rest: new Mesher(),
    septaFar: new Mesher(), septaNear: new Mesher(), septaRest: new Mesher(),
    strandsFar: new Mesher(), strandsNear: new Mesher(),
  };
  // Rings: fine where the peel shows the fibres, coarse elsewhere.
  const xs: number[] = [];
  const w0 = segStart(PEEL.skin[0]) - 0.5;
  const w1 = segStart(PEEL.skin[1]) + 0.5;
  for (let x = segStart(2); x < segStart(SEGMENTS);) {
    xs.push(x);
    x += x > w0 && x < w1 ? 0.045 : 0.22;
  }
  xs.push(segStart(SEGMENTS));
  const ic = ringIndex(xs, cutX());
  xs[ic] = cutX();
  const circ = (x: number, _th: number, o: THREE.Color) => o.copy(CIRC).lerp(CIRC_LIGHT, 0.5 + 0.5 * Math.sin(x * 36));
  const ripple = (x: number) => 0.004 * Math.sin(x * 36);
  const keep = (x0: number, t0: number, x1: number, t1: number) => !inPeel('circular', segmentAt((x0 + x1) / 2), (t0 + t1) / 2);
  wallSheet(p.far, xs, 0, ic, [Math.PI, 2 * Math.PI], 56, WALL.epidermis, circ, { ripple });
  wallSheet(p.near, xs, 0, ic, [0, Math.PI], 56, WALL.epidermis, circ, { ripple });
  wallSheet(p.rest, xs, ic, xs.length - 1, [0, 2 * Math.PI], 112, WALL.epidermis, circ, { ripple, keep });
  // The longitudinal layer, only where the circular layer is peeled back.
  const i0 = ringIndex(xs, segStart(PEEL.circular[0])) - 1;
  const i1 = ringIndex(xs, segStart(PEEL.circular[1])) + 1;
  const dl = WALL.epidermis + WALL.circular;
  wallSheet(p.rest, xs, i0, i1, [PEEL.th[0] - 0.05, PEEL.th[1] + 0.05], 160, dl,
    (_x, th, o) => o.copy(LONG).lerp(LONG_DARK, 0.5 + 0.5 * Math.sin(th * 62)),
    { ripple: (_x, th) => 0.006 * Math.sin(th * 62) });
  // The cut edges of each peeled layer, so they read as layers with thickness.
  peelEdges(p.rest, 'skin', 0, WALL.epidermis, new THREE.Color('#e2b4a2'));
  peelEdges(p.rest, 'circular', WALL.epidermis, dl, CIRC);
  // Septa: thin walls across the body at each furrow, from the gut out to the wall.
  const T = wallThickness();
  for (let n = 4; n < SEGMENTS - 1; n++) {
    const x = segStart(n + 1);
    const thick = n >= 6 && n <= 14;
    const halves: [number, number, Mesher][] = x < cutX()
      ? [[Math.PI, 2 * Math.PI, p.septaFar], [0, Math.PI, p.septaNear]]
      : [[0, 2 * Math.PI, p.septaRest]];
    for (const [a, b, m] of halves) {
      const col = new THREE.Color(thick ? '#e9c3b7' : '#f2d8cf');
      const inner = new THREE.Vector3();
      const outer = new THREE.Vector3();
      m.surface(5, b - a > 4 ? 64 : 32, (u, v, o) => {
        const th = a + (b - a) * v;
        gutPoint(x, th, inner, 0.02);
        // The outer edge runs a little way into the wall, so the join never shows a gap.
        bodyPoint(x, th, T * 0.85, outer);
        o.lerpVectors(inner, outer, u);
        // A septum bows forward a little between its edges.
        o.x -= 0.12 * Math.sin(u * Math.PI);
      }, (u, _v, _q, o) => o.copy(col).multiplyScalar(u < 0.2 ? 0.82 : 0.95 + 0.05 * u), { wrapV: b - a > 4 });
    }
  }
  // Strands from the pharynx out to the body wall: they pull it open to suck in food.
  for (let n = 2; n <= 5; n++) {
    for (let k = 0; k < 7; k++) {
      const x = segStart(n) + 0.2 + 0.2 * k;
      for (const side of [1, -1]) {
        const th = side * (0.15 + 0.28 * k);
        const a = gutPoint(x, th, new THREE.Vector3(), -0.02);
        const b = bodyPoint(x + 0.35, th * 1.2, T, new THREE.Vector3());
        const m = bucket(x, side, { far: p.strandsFar, near: p.strandsNear, rest: p.strandsFar });
        sweep(m, [a, b], (t) => 0.045 - 0.015 * Math.sin(t * Math.PI), (_u, _v, _q, o) => o.set(0.82, 0.58, 0.55), { radial: 5, per: 0.2 });
      }
    }
  }
  return p;
}

/** The four cut edges of a peel window, from depth d0 to d1. */
function peelEdges(m: Mesher, which: 'skin' | 'circular', d0: number, d1: number, color: THREE.Color): void {
  const x0 = segStart(PEEL[which][0]);
  const x1 = segStart(PEEL[which][1]);
  const [t0, t1] = PEEL.th;
  const paint = (_u: number, _v: number, _p: THREE.Vector3, o: THREE.Color) => o.copy(color);
  const d = (v: number) => d0 + (d1 - d0) * v;
  m.surface(60, 1, (u, v, o) => bodyPoint(x0 + (x1 - x0) * u, t0, d(v), o), paint, { flip: true });
  m.surface(60, 1, (u, v, o) => bodyPoint(x0 + (x1 - x0) * u, t1, d(v), o), paint);
  m.surface(1, 60, (u, v, o) => bodyPoint(x0, t0 + (t1 - t0) * v, d(u), o), paint);
  m.surface(1, 60, (u, v, o) => bodyPoint(x1, t0 + (t1 - t0) * v, d(u), o), paint, { flip: true });
}
