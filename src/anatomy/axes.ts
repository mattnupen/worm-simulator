import * as THREE from 'three';
import { bodyPoint } from './body';
import { gutPoint } from './gut';
import { ORGANS, segStart, smooth, wallThickness } from './layout';

/**
 * The long lines everything else hangs from: the dorsal blood vessel on top of the gut, the
 * ventral vessel under it, and the nerve cord on the floor of the body, with the subneural
 * vessel beneath it. Each returns the line's centre at x.
 */

export const R = {
  dorsal: 0.17,
  ventral: 0.12,
  cord: 0.16,
  ganglion: 0.25,
  subneural: 0.045,
} as const;

const a = new THREE.Vector3();
const b = new THREE.Vector3();

/** Where the floor of the body cavity is, just inside the wall, at x. */
export function floorY(x: number): number {
  return bodyPoint(x, Math.PI, wallThickness(), a).y;
}

/** Centre of the dorsal vessel, lying along the top of the gut (it starts over the pharynx). */
export function dorsalVessel(x: number, out: THREE.Vector3): THREE.Vector3 {
  const r = R.dorsal * (0.75 + 0.25 * smooth(segStart(6), segStart(20), x));
  gutPoint(x, 0, out, r * 0.92);
  // Over the intestine it runs straight along the tops of the bulges, not down into each pinch.
  const k = smooth(segStart(ORGANS.intestineFrom), segStart(ORGANS.intestineFrom + 1), x);
  if (k > 0) {
    let top = out.y;
    for (const d of [-0.7, -0.35, 0.35, 0.7]) top = Math.max(top, gutPoint(x + d, 0, a, r * 0.92).y);
    out.y += (top - out.y) * k;
  }
  return out;
}

/** Centre of the nerve cord: on the floor, from the subpharyngeal ganglion back. */
export function nerveCord(x: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(x, floorY(x) + R.cord + 0.14, 0);
}

/** Centre of the ventral vessel: under the gut, above the nerve cord. */
export function ventralVessel(x: number, out: THREE.Vector3): THREE.Vector3 {
  gutPoint(x, Math.PI, b, 0);
  nerveCord(x, out);
  const low = out.y + R.cord + R.ventral + 0.05;
  const high = b.y - R.ventral - 0.03;
  out.y = Math.max(low, Math.min(high, (low + high) / 2));
  return out;
}

/** Centre of the subneural vessel, under the cord. */
export function subneural(x: number, out: THREE.Vector3): THREE.Vector3 {
  nerveCord(x, out);
  out.y -= R.cord + R.subneural + 0.01;
  return out;
}

/** The x where the cord begins (the subpharyngeal ganglion in segment 4). */
export const CORD_START = segStart(ORGANS.subpharyngeal) + 0.35;
