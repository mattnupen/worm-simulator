import * as THREE from 'three';
import { mulberry32 } from '../core/random';
import { bodyPoint } from './body';
import { OPEN_FROM, gutPoint } from './gut';
import { Mesher } from './mesher';
import { CORD_START, R, dorsalVessel, subneural, ventralVessel } from './axes';
import { LENGTH, ORGANS, SEGMENTS, segMid, segStart, segmentLength, wallThickness } from './layout';
import { sweep } from './sweep';
import { cutX } from './skin';

/**
 * The closed blood system: the dorsal vessel (it pumps blood forward), the ventral vessel (it
 * carries it back), five pairs of hearts looping round the esophagus between them in segments 7
 * to 11, the subneural vessel under the nerve cord, and in every segment the vessels that run to
 * the gut and round the body wall, ending in fine networks on the gut.
 */

/** Points along a line through x0..x1, `step` mm apart. */
export function along(x0: number, x1: number, step: number, at: (x: number, out: THREE.Vector3) => THREE.Vector3): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const n = Math.max(2, Math.ceil((x1 - x0) / step));
  for (let i = 0; i <= n; i++) pts.push(at(x0 + ((x1 - x0) * i) / n, new THREE.Vector3()));
  return pts;
}

const RED = new THREE.Color('#a3172a');
const DARK = new THREE.Color('#5e0a16');
const red = (_u: number, v: number, _p: THREE.Vector3, o: THREE.Color) => o.copy(RED).lerp(DARK, 0.35 * Math.max(0, Math.sin(v * Math.PI * 2)));

/** Which bucket a wall-attached part goes in: the cutaway's near or far half, or the rest. */
export function bucket<T>(x: number, z: number, b: { far: T; near: T; rest: T }): T {
  if (x >= cutX()) return b.rest;
  return z > 0 ? b.near : b.far;
}

/** A branching network of fine vessels on the gut's surface, from the dorsal vessel down one side. */
function gutNetwork(m: Mesher, x: number, side: number, len: number, rnd: () => number): void {
  const x0n = x - len * 0.45;
  const x1 = x + len * 0.45;
  const grow = (x0: number, th0: number, dir: number, depth: number, r0: number): void => {
    const pts: THREE.Vector3[] = [];
    let xx = x0;
    let th = th0;
    const steps = 6 - depth;
    for (let i = 0; i <= steps; i++) {
      pts.push(gutPoint(xx, side * th, new THREE.Vector3(), r0 * 1.25));
      const dth = (0.32 - depth * 0.05) * (0.8 + 0.4 * rnd());
      const dx = dir * len * (0.05 + 0.08 * rnd()) + (rnd() - 0.5) * len * 0.06;
      // Two points in between, so the vessel follows the gut's curves instead of cutting across.
      if (i < steps) for (const f of [1 / 3, 2 / 3]) pts.push(gutPoint(xx + dx * f, side * (th + dth * f), new THREE.Vector3(), r0 * 1.25));
      th += dth;
      // Each segment's network stays on its own segment (it never wanders over an organ's edge).
      xx = Math.min(x1, Math.max(x0n, xx + dx));
      if (depth < 2 && i > 0 && i < steps && rnd() < 0.55) grow(xx, th, rnd() < 0.5 ? -1 : 1, depth + 1, r0 * 0.62);
    }
    sweep(m, pts, (t) => r0 * (1 - 0.85 * t), red, { radial: 5, per: 0.1, caps: true });
  };
  grow(x, 0.12, rnd() < 0.5 ? -0.3 : 0.3, 0, 0.065);
}

export interface BloodParts {
  /** The long vessels. */
  inner: Mesher;
  /** The fine networks on the gut. */
  fine: Mesher;
  /** Fine networks on the near half of the opened intestine. */
  fineNear: Mesher;
  heartsFar: Mesher;
  heartsNear: Mesher;
  /** Vessels round the body wall, by cutaway half. */
  far: Mesher;
  near: Mesher;
  rest: Mesher;
}

export function buildBlood(): BloodParts {
  const inner = new Mesher();
  const fine = new Mesher();
  const fineNear = new Mesher();
  const hearts = { far: new Mesher(), near: new Mesher() };
  const walls = { far: new Mesher(), near: new Mesher(), rest: new Mesher() };
  const rnd = mulberry32(42);
  const xEnd = LENGTH - 2.5;
  // The dorsal vessel, from over the pharynx (where it splits into branches) to the tail.
  const x0 = segStart(3) + 0.4;
  sweep(inner, along(x0, xEnd, 0.3, dorsalVessel), (t) => R.dorsal * (0.7 + 0.3 * Math.min(1, t * 20)), red, { radial: 12, per: 0.2, caps: true });
  for (const side of [1, -1]) {
    const a = dorsalVessel(x0 + 0.1, new THREE.Vector3());
    const pts = [a, gutPoint(segStart(2) + 0.8, side * 0.5, new THREE.Vector3(), 0.08), gutPoint(segStart(2), side * 0.9, new THREE.Vector3(), 0.06), gutPoint(0.8, side * 1.2, new THREE.Vector3(), 0.05)];
    sweep(inner, pts, (t) => 0.09 * (1 - 0.5 * t), red, { radial: 6, caps: true });
  }
  // The ventral vessel and the subneural vessel.
  sweep(inner, along(segStart(4), xEnd, 0.3, ventralVessel), () => R.ventral, red, { radial: 10, per: 0.2, caps: true });
  sweep(inner, along(CORD_START, xEnd, 0.4, subneural), () => R.subneural, red, { radial: 6, per: 0.3, caps: true });
  // Five pairs of hearts, beaded and swollen, looping from the dorsal vessel round the esophagus.
  for (let n = ORGANS.hearts[0]; n <= ORGANS.hearts[1]; n++) {
    const x = segStart(n) + 0.3 * segmentLength(n);
    for (const side of [1, -1]) {
      const pts: THREE.Vector3[] = [];
      const top = dorsalVessel(x - 0.15, new THREE.Vector3());
      const bot = ventralVessel(x + 0.15, new THREE.Vector3());
      pts.push(top);
      for (let i = 1; i < 12; i++) {
        const th = (i / 12) * Math.PI;
        pts.push(gutPoint(x - 0.15 + 0.3 * (i / 12), side * th, new THREE.Vector3(), 0.32 + 0.12 * Math.sin(th)));
      }
      pts.push(bot);
      // Beaded: a string of swellings, fattest on the side of the esophagus.
      sweep(side > 0 ? hearts.near : hearts.far, pts, (t) => {
        const swell = Math.sin(t * Math.PI);
        const beads = Math.pow(0.5 + 0.5 * Math.cos(t * Math.PI * 10), 2);
        return 0.12 + 0.09 * swell + 0.07 * beads * swell;
      }, red, { radial: 14, per: 0.04 });
    }
  }
  // Every segment behind the hearts: vessels to the gut and round the body wall.
  const T = wallThickness();
  for (let n = 5; n <= SEGMENTS - 2; n++) {
    const len = segmentLength(n);
    for (const side of [1, -1]) {
      if (n > ORGANS.hearts[1] || n < ORGANS.hearts[0]) gutNetwork(side > 0 && n >= OPEN_FROM && n < 31 ? fineNear : fine, segMid(n) + (rnd() - 0.5) * 0.3 * len, side, len, rnd);
      if (n <= ORGANS.hearts[1] + 1) continue;
      // Parietal vessel: from the dorsal vessel up to the wall, round it, and down to the subneural.
      const x = segStart(n + 1) - 0.18;
      const pts: THREE.Vector3[] = [dorsalVessel(x, new THREE.Vector3())];
      for (let i = 1; i <= 14; i++) {
        const th = 0.12 + (i / 14) * (Math.PI - 0.32);
        pts.push(bodyPoint(x - 0.1 * Math.sin(i * 0.55 + n) - 0.04 * Math.sin(i * 1.7), side * th, T + 0.035, new THREE.Vector3()));
      }
      pts.push(subneural(x, new THREE.Vector3()).add(new THREE.Vector3(0, 0, side * 0.05)));
      sweep(bucket(x, side, walls), pts, () => 0.045, red, { radial: 5, per: 0.2 });
      // A short vessel from the ventral vessel to the gut.
      const v = ventralVessel(segMid(n), new THREE.Vector3());
      const gx = segMid(n);
      sweep(fine, [v, gutPoint(gx, side * 2.8, new THREE.Vector3(), 0.08), gutPoint(gx + 0.07, side * 2.55, new THREE.Vector3(), 0.08),
        gutPoint(gx + 0.14, side * 2.3, new THREE.Vector3(), 0.08), gutPoint(gx + 0.2, side * 2.05, new THREE.Vector3(), 0.08)],
      (t) => 0.05 * (1 - 0.6 * t), red, { radial: 5, per: 0.08, caps: true });
    }
  }
  return { inner, fine, fineNear, heartsFar: hearts.far, heartsNear: hearts.near, ...walls };
}
