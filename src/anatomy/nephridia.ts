import * as THREE from 'three';
import { insideWall } from './body';
import { Mesher } from './mesher';
import { bucket } from './blood';
import { ORGANS, SEGMENTS, segStart, segmentLength } from './layout';
import { blob, sweep } from './sweep';

/**
 * The nephridia: a pair in almost every segment (none in the first three or the last). Each starts
 * as a ciliated funnel on the septum in front, then a long tubule coils in loops against the side
 * of the body wall and opens through a tiny pore low on the side. They clean waste out of the
 * body fluid, a little like kidneys.
 */

const TUBE = new THREE.Color('#efe2cf');
const BLOODY = new THREE.Color('#c97f72');
const paint = (u: number, _v: number, _p: THREE.Vector3, o: THREE.Color) =>
  o.copy(TUBE).lerp(BLOODY, 0.25 * (0.5 + 0.5 * Math.sin(u * 12)));

export function buildNephridia(): { far: Mesher; near: Mesher; rest: Mesher } {
  const out = { far: new Mesher(), near: new Mesher(), rest: new Mesher() };
  for (let n = ORGANS.firstNephridia; n <= SEGMENTS - 1; n++) {
    const x0 = segStart(n);
    const len = segmentLength(n);
    for (const side of [1, -1]) {
      const m = bucket(x0, side, out);
      // The funnel sits on the septum in front, low beside the nerve cord.
      const funnel = insideWall(x0 - 0.06, side * (Math.PI - 0.42), 0.3, new THREE.Vector3());
      blob(m, funnel, new THREE.Vector3(0.07, 0.13, 0.11), paint, { amp: 0.2, freq: 5, seed: n, rows: 8, cols: 10 });
      const pts: THREE.Vector3[] = [funnel.clone()];
      // Through the septum, then three neat loops lying against the side wall, low down: the same
      // shape in every segment, mirrored left and right.
      pts.push(insideWall(x0 + 0.12 * len, side * (Math.PI - 0.55), 0.24, new THREE.Vector3()));
      const N = 54;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const phi = t * 3 * 2 * Math.PI;
        const x = x0 + len * (0.25 + 0.4 * t + 0.12 * Math.sin(phi));
        const th = Math.PI - (0.85 + 0.2 * Math.cos(phi));
        pts.push(insideWall(x, side * th, 0.2 + 0.05 * Math.cos(phi), new THREE.Vector3()));
      }
      // The bladder, then the duct out to the pore low on the side.
      const bl = insideWall(x0 + 0.8 * len, side * (Math.PI - 0.62), 0.16, new THREE.Vector3());
      blob(m, bl, new THREE.Vector3(0.13, 0.1, 0.1), paint, { rows: 8, cols: 10 });
      pts.push(bl);
      pts.push(insideWall(x0 + 0.88 * len, side * (Math.PI - 0.6), -0.02, new THREE.Vector3()));
      sweep(m, pts, () => 0.065, paint, { radial: 7, per: 0.05 });
    }
  }
  return out;
}
