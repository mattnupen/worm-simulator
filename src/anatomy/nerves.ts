import * as THREE from 'three';
import { mulberry32 } from '../core/random';
import { bodyPoint, prostomiumCentre } from './body';
import { gutPoint } from './gut';
import { Mesher } from './mesher';
import { CORD_START, R, nerveCord } from './axes';
import { along, bucket } from './blood';
import { LENGTH, ORGANS, SEGMENTS, segMid, segStart, segmentAt, segmentLength, smooth, wallThickness } from './layout';
import { blob, sweep } from './sweep';

/**
 * The nervous system: the two-lobed brain (cerebral ganglia) on top of the pharynx in segment 3,
 * the connectives round the pharynx to the subpharyngeal ganglion in segment 4, the ventral nerve
 * cord with a ganglion in every segment, and three pairs of segmental nerves per segment running
 * round the inside of the body wall.
 */

const YELLOW = new THREE.Color('#f2c230');
const DEEP = new THREE.Color('#d39a14');
const paint = (_u: number, v: number, _p: THREE.Vector3, o: THREE.Color) => o.copy(YELLOW).lerp(DEEP, 0.3 * Math.max(0, -Math.sin(v * Math.PI * 2)));

/** The cord's radius at x: a ganglion swelling in the middle of every segment. */
export function cordRadius(x: number): number {
  const n = Math.max(1, Math.min(SEGMENTS, Math.floor(segmentAt(x))));
  const g = segMid(n) - 0.1 * segmentLength(n);
  const d = (x - g) / (0.28 * segmentLength(n));
  const taper = 1 - 0.3 * smooth(segStart(40), LENGTH, x);
  return (R.cord + (R.ganglion - R.cord) * Math.exp(-d * d)) * taper;
}

export function buildNerves(): { inner: Mesher; far: Mesher; near: Mesher; rest: Mesher } {
  const inner = new Mesher();
  const walls = { far: new Mesher(), near: new Mesher(), rest: new Mesher() };
  const rnd = mulberry32(7);
  const xb = segMid(ORGANS.brain);
  const top = gutPoint(xb, 0, new THREE.Vector3(), 0.26);
  // The brain: two pear-shaped lobes side by side.
  for (const side of [1, -1]) {
    const c = new THREE.Vector3(xb, top.y + 0.08, side * 0.36);
    blob(inner, c, new THREE.Vector3(0.52, 0.34, 0.38), paint, { amp: 0.04, freq: 3, seed: side > 0 ? 3 : 4, rows: 20, cols: 28, rot: new THREE.Euler(side * 0.25, 0, -0.15) });
    // A connective down round the pharynx to the subpharyngeal ganglion.
    const pts: THREE.Vector3[] = [c.clone()];
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      const x = xb + (CORD_START - xb) * t;
      pts.push(gutPoint(x, side * (0.35 + t * (Math.PI - 0.55)), new THREE.Vector3(), 0.1));
    }
    pts.push(nerveCord(CORD_START, new THREE.Vector3()).add(new THREE.Vector3(0, 0, side * 0.08)));
    sweep(inner, pts, () => 0.075, paint, { radial: 8, per: 0.1 });
    // Nerves forward into the prostomium and round the mouth.
    for (let k = 0; k < 3; k++) {
      const lc = prostomiumCentre(new THREE.Vector3());
      const end = new THREE.Vector3(lc.x - 0.25 + 0.3 * k, lc.y - 0.1 - 0.35 * k, side * (0.12 + 0.3 * k));
      const mid = new THREE.Vector3().lerpVectors(c, end, 0.5);
      mid.y += 0.15;
      sweep(inner, [c.clone().add(new THREE.Vector3(-0.3, 0, 0)), mid, end], (t) => 0.05 * (1 - 0.5 * t), paint, { radial: 6, per: 0.1 });
    }
  }
  // The subpharyngeal ganglion and the ventral nerve cord, beaded with a ganglion per segment.
  const sub = nerveCord(CORD_START + 0.05, new THREE.Vector3());
  blob(inner, sub, new THREE.Vector3(0.5, 0.28, 0.4), paint, { amp: 0.04, seed: 9, rows: 18, cols: 24 });
  sweep(inner, along(CORD_START, LENGTH - 2.2, 0.08, nerveCord), (t) => cordRadius(CORD_START + t * (LENGTH - 2.2 - CORD_START)), paint, { radial: 12, per: 0.08, caps: true });
  // The three giant fibres along the top of the cord (they carry the fast "pull back" message).
  const PALE = new THREE.Color('#fff2b8');
  for (const dz of [-0.075, 0, 0.075]) {
    const fibre = (x: number, o: THREE.Vector3) => nerveCord(x, o).add(new THREE.Vector3(0, cordRadius(x) * 0.93 - Math.abs(dz) * 0.5, dz));
    sweep(inner, along(CORD_START + 0.3, LENGTH - 3, 0.25, fibre), () => 0.028, (_u, _v, _p, o) => o.copy(PALE), { radial: 6, per: 0.25 });
  }
  // Three pairs of segmental nerves per segment, round the inside of the wall.
  const T = wallThickness();
  for (let n = ORGANS.subpharyngeal + 1; n <= SEGMENTS - 2; n++) {
    const len = segmentLength(n);
    const g = segMid(n) - 0.1 * len;
    const xs = [segStart(n) + 0.14 * len, g - 0.12 * len, g + 0.14 * len];
    for (const x of xs) {
      for (const side of [1, -1]) {
        const c = nerveCord(x, new THREE.Vector3());
        const pts: THREE.Vector3[] = [c.clone().add(new THREE.Vector3(0, 0, side * cordRadius(x) * 0.5))];
        const reach = 0.25 + 0.15 * rnd();
        for (let i = 0; i <= 12; i++) {
          const th = Math.PI - 0.16 - (i / 12) * (Math.PI - 0.16 - reach);
          pts.push(bodyPoint(x + 0.03 * Math.sin(i * 1.3 + n), side * th, T + 0.02, new THREE.Vector3()));
        }
        const target = bucket(x, side, walls);
        sweep(target, pts, (t) => 0.034 * (1 - 0.45 * t), paint, { radial: 5, per: 0.22 });
        // Fine twigs fanning out near the top, as in the dissection atlases.
        for (let k = 0; k < 2; k++) {
          const th0 = reach + 0.25 + k * 0.5;
          const dir = rnd() < 0.5 ? -1 : 1;
          const a = bodyPoint(x, side * th0, T + 0.02, new THREE.Vector3());
          const b = bodyPoint(x + dir * 0.22 * len, side * (th0 - 0.22), T + 0.02, new THREE.Vector3());
          const e = bodyPoint(x + dir * 0.32 * len, side * (th0 - 0.4), T + 0.02, new THREE.Vector3());
          sweep(target, [a, b, e], (t) => 0.02 * (1 - 0.5 * t), paint, { radial: 4, per: 0.2 });
        }
      }
    }
  }
  return { inner, ...walls };
}
