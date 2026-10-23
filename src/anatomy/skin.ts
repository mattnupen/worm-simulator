import * as THREE from 'three';
import { Mesher } from './mesher';
import { TUBE_FRONT, bodyPoint, ringXs, skinColor } from './body';
import { sweep } from './sweep';
import { LENGTH, SEGMENTS, PEEL, SETAE, WALL, inPeel, segMid, segStart, segmentAt, segmentLength, wallThickness } from './layout';

/** The cutaway opens the body from the head back to the front of this segment. */
export const CUT_END = 31;
export const cutX = (): number => segStart(CUT_END);

/** Angles: the far half (kept in the cutaway) runs from the belly round to the back. */
const FAR: readonly [number, number] = [Math.PI, 2 * Math.PI];
const NEAR: readonly [number, number] = [0, Math.PI];
const FULL: readonly [number, number] = [0, 2 * Math.PI];

type Paint = (u: number, v: number, p: THREE.Vector3, out: THREE.Color) => void;

/** A sheet of the body wall over rings xs[i0..i1] and angles th, at `depth` into the wall. */
export function wallSheet(
  m: Mesher, xs: readonly number[], i0: number, i1: number, th: readonly [number, number], cols: number,
  depth: number, paint: (x: number, th: number, out: THREE.Color) => void,
  opts: { flip?: boolean; ripple?: (x: number, th: number) => number; keep?: (x0: number, t0: number, x1: number, t1: number) => boolean } = {},
): void {
  const rows = i1 - i0;
  const xAt = (u: number): number => {
    const f = i0 + u * rows;
    const i = Math.min(i1 - 1, Math.floor(f));
    return xs[i] + (xs[i + 1] - xs[i]) * (f - i);
  };
  const thAt = (v: number): number => th[0] + (th[1] - th[0]) * v;
  const at = (u: number, v: number, out: THREE.Vector3): void => {
    const x = xAt(u);
    const t = thAt(v);
    bodyPoint(x, t, depth - (opts.ripple ? opts.ripple(x, t) : 0), out);
  };
  const color: Paint = (u, v, _p, out) => paint(xAt(u), thAt(v), out);
  const wrapV = th[1] - th[0] > 6.28;
  const keep = opts.keep
    ? (u0: number, v0: number, u1: number, v1: number) => opts.keep!(xAt(u0), thAt(v0), xAt(u1), thAt(v1))
    : undefined;
  // The prostomium's tip, where every angle meets: its normal points straight forward.
  const pole = xs[i0] <= TUBE_FRONT + 1e-6 ? new THREE.Vector3(-1, 0, 0) : undefined;
  m.surface(rows, cols, at, color, { wrapV, flip: opts.flip, keep, pole });
}

/** Index of the first ring at or behind x. */
export const ringIndex = (xs: readonly number[], x: number): number => {
  let i = 0;
  while (i < xs.length - 1 && xs[i] < x - 1e-6) i++;
  return i;
};

export interface Shell {
  far: Mesher;
  near: Mesher;
  rest: Mesher;
}

/** The outer skin, split into the cutaway's far and near halves and the uncut rest. */
export function buildSkin(radial: number, perSegment: (n: number) => number): Shell & { xs: number[]; patch: Mesher; caps: Mesher } {
  const xs = ringXs(perSegment);
  const ic = ringIndex(xs, cutX());
  xs[ic] = cutX();
  const paint = (x: number, th: number, out: THREE.Color) => skinColor(x, th, out);
  const far = new Mesher();
  const near = new Mesher();
  const rest = new Mesher();
  wallSheet(far, xs, 0, ic, FAR, Math.round(radial * 0.8), 0, paint);
  wallSheet(near, xs, 0, ic, NEAR, Math.round(radial * 0.8), 0, paint);
  const caps = new Mesher();
  const patch = new Mesher();
  const peeled = (x0: number, t0: number, x1: number, t1: number) => inPeel('skin', segmentAt((x0 + x1) / 2), (t0 + t1) / 2);
  wallSheet(rest, xs, ic, xs.length - 1, FULL, radial, 0, paint, { keep: (a, b, c, d) => !peeled(a, b, c, d) });
  wallSheet(patch, xs, ringIndex(xs, segStart(PEEL.skin[0])) - 1, ringIndex(xs, segStart(PEEL.skin[1])) + 1, FULL, radial, 0, paint, { keep: peeled });
  return { far, near, rest, xs, patch, caps };
}

const BANDS: { d0: number; d1: number; color: string }[] = [
  { d0: 0, d1: WALL.epidermis, color: '#e3b6a4' },
  { d0: WALL.epidermis, d1: WALL.epidermis + WALL.circular, color: '#a8434a' },
  { d0: WALL.epidermis + WALL.circular, d1: wallThickness(), color: '#d98a83' },
];

/**
 * The cut faces of the body wall in the cutaway, banded by layer (skin, circular muscle,
 * longitudinal muscle), plus the inside surface of the far half's wall.
 */
export function buildCutWall(xs: readonly number[]): Mesher {
  const m = new Mesher();
  const ic = ringIndex(xs, cutX());
  const T = wallThickness();
  const fibre = new THREE.Color();
  const lin = new THREE.Color('#c97c76');
  const deep = new THREE.Color('#9e4d4f');
  for (const band of BANDS) {
    const c = new THREE.Color(band.color);
    const paint = (x: number, d: number, out: THREE.Color) => {
      out.copy(c);
      if (band.d1 === T) out.multiplyScalar(0.92 + 0.12 * Math.sin(x * 14 + d * 90));
    };
    const rimAt = (th: number) => (u: number, v: number, out: THREE.Vector3) => {
      const f = u * ic;
      const i = Math.min(ic - 1, Math.floor(f));
      const x = xs[i] + (xs[i + 1] - xs[i]) * (f - i);
      bodyPoint(x, th, band.d0 + (band.d1 - band.d0) * v, out);
      out.z = 0;
    };
    const xOf = (u: number) => xs[Math.min(ic, Math.round(u * ic))];
    m.surface(ic, 2, rimAt(0), (u, v, _p, o) => paint(xOf(u), v, o));
    m.surface(ic, 2, rimAt(Math.PI), (u, v, _p, o) => paint(xOf(u), v, o), { flip: true });
    // The front face of the uncut half, where the cut stops.
    const x0 = cutX();
    m.surface(2, 48, (u, v, out) => bodyPoint(x0, v * Math.PI, band.d0 + (band.d1 - band.d0) * u, out),
      (u, _v, _p, o) => paint(x0, u, o), { flip: true });
  }
  // The inner face of the far wall: longitudinal muscle bundles under a thin shiny lining.
  wallSheet(m, xs, 0, ic, FAR, 96, T, (x, th, out) => {
    const bundle = 0.5 + 0.5 * Math.sin(th * 46);
    fibre.copy(lin).lerp(deep, 0.35 * bundle);
    out.copy(fibre).multiplyScalar(0.94 + 0.08 * Math.sin(x * 3.1));
  }, { flip: true, ripple: (_x, th) => -0.006 * Math.sin(th * 46) });
  return m;
}

/**
 * The setae: eight per segment from segment 2, in four close pairs (two on the belly, two on
 * each side), each a short amber bristle that curves back toward the tail.
 */
export function buildSetae(): { far: Mesher; near: Mesher; rest: Mesher; patch: Mesher } {
  const out = { far: new Mesher(), near: new Mesher(), rest: new Mesher(), patch: new Mesher() };
  const amber = new THREE.Color('#d9b27a');
  const tip = new THREE.Color('#f2dcb0');
  const paint = (u: number, _v: number, _p: THREE.Vector3, o: THREE.Color) => o.copy(amber).lerp(tip, u);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let seg = 2; seg < SEGMENTS; seg++) {
    const x = segMid(seg) - 0.08 * segmentLength(seg);
    if (x > LENGTH - 0.4) continue;
    for (const side of [1, -1]) {
      for (const off of SETAE) {
        const th = Math.PI - side * off;
        bodyPoint(x, th, 0.02, a);
        bodyPoint(x, th, 0, b);
        // Outward normal, roughly: from the centre line through the skin.
        const outward = new THREE.Vector3(0, b.y - a.y, b.z - a.z).normalize();
        // Only the hooked tip shows: about a tenth of a segment long.
        const len = 0.15;
        const pts = [
          a.clone(),
          b.clone().addScaledVector(outward, len * 0.45).add(new THREE.Vector3(0.015, 0, 0)),
          b.clone().addScaledVector(outward, len * 0.85).add(new THREE.Vector3(0.05, 0, 0)),
          b.clone().addScaledVector(outward, len).add(new THREE.Vector3(0.1, 0, 0)),
        ];
        const target = x < cutX() ? (Math.sin(th) > 0 ? out.near : out.far) : inPeel('skin', seg + 0.5, th) ? out.patch : out.rest;
        sweep(target, pts, (t) => 0.042 * (1 - 0.75 * t), paint, { radial: 6, per: 0.05 });
      }
    }
  }
  return out;
}
