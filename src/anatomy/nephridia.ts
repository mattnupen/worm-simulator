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
const paint = (u: number, v: number, _p: THREE.Vector3, o: THREE.Color) =>
  o.copy(TUBE).lerp(BLOODY, 0.35 * (0.5 + 0.5 * Math.sin(u * 40 + v * 6)));

export function buildNephridia(): { far: Mesher; near: Mesher; rest: Mesher } {
  const out = { far: new Mesher(), near: new Mesher(), rest: new Mesher() };
  for (let n = ORGANS.firstNephridia; n <= SEGMENTS - 1; n++) {
    const x0 = segStart(n);
    const len = segmentLength(n);
    for (const side of [1, -1]) {
      const m = bucket(x0, side, out);
      // The funnel sits on the septum in front, low beside the nerve cord.
      const funnel = insideWall(x0 - 0.06, side * (Math.PI - 0.45), 0.3, new THREE.Vector3());
      blob(m, funnel, new THREE.Vector3(0.07, 0.13, 0.11), paint, { amp: 0.2, freq: 5, seed: n, rows: 8, cols: 10 });
      const pts: THREE.Vector3[] = [funnel.clone()];
      const N = 56;
      for (let i = 1; i <= N; i++) {
        const t = i / N;
        // A long loop up the side wall and back down (the two strands side by side), folded into
        // hairpins along the segment.
        const climb = Math.sin(t * Math.PI);
        const back = Math.tanh((t - 0.5) * 10);
        // Low on the side, beside the nerve cord and under the gut; no two segments coil alike.
        const th = Math.PI - (0.5 + (0.75 + 0.12 * Math.sin(n * 1.7)) * climb);
        const wob = 0.3 + 0.08 * Math.sin(n * 2.3);
        const x = x0 + len * (0.5 + wob * Math.sin(t * Math.PI * (6 + (n % 3)) + n) + 0.08 * Math.sin(t * Math.PI * 17 + n * 0.7) + 0.07 * back);
        const mm = 0.12 + 0.1 * (0.5 + 0.5 * Math.cos(t * Math.PI * 14)) + 0.07 * (back + 1);
        pts.push(insideWall(x, side * th, mm, new THREE.Vector3()));
      }
      // The bladder, then the duct out to the pore.
      const bl = insideWall(x0 + 0.35 * len, side * (Math.PI - 0.62), 0.14, new THREE.Vector3());
      blob(m, bl, new THREE.Vector3(0.12, 0.1, 0.1), paint, { rows: 8, cols: 10 });
      pts.push(bl);
      sweep(m, pts, (t) => 0.06 + 0.025 * Math.sin(t * Math.PI), paint, { radial: 7, per: 0.06 });
    }
  }
  return out;
}
