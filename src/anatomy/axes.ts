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
  // Behind the esophagus it runs smoothly over the crop, gizzard and the intestine's bulges, not
  // down into each pinch.
  const k = smooth(segStart(ORGANS.crop[0] - 2), segStart(ORGANS.crop[0]), x);
  if (k > 0) {
    // A smooth maximum over a window (log-sum-exp), so the line has no corners.
    let sum = 0;
    const K = 8;
    for (let d = -1.5; d <= 1.51; d += 0.15) sum += Math.exp(K * gutPoint(x + d, 0, a, r * 0.92).y);
    const top = Math.max(out.y, Math.log(sum / 21) / K + 0.03);
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
  // Averaged over a short stretch, so it bends smoothly under the crop and gizzard.
  let y = 0;
  for (let d = -0.8; d <= 0.81; d += 0.2) y += ventralRaw(x + d);
  nerveCord(x, out);
  out.y = Math.max(out.y + R.cord + R.ventral + 0.05, y / 9);
  return out;
}

function ventralRaw(x: number): number {
  gutPoint(x, Math.PI, b, 0);
  const low = floorY(x) + R.cord + 0.14 + R.cord + R.ventral + 0.05;
  const high = b.y - R.ventral - 0.03;
  return Math.max(low, Math.min(high, (low + high) / 2));
}

/** Centre of the subneural vessel, under the cord. */
export function subneural(x: number, out: THREE.Vector3): THREE.Vector3 {
  nerveCord(x, out);
  out.y -= R.cord + R.subneural + 0.01;
  return out;
}

/** The x where the cord begins (the subpharyngeal ganglion in segment 4). */
export const CORD_START = segStart(ORGANS.subpharyngeal) + 0.35;
