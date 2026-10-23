import * as THREE from 'three';
import { bodyPoint, insideWall } from './body';
import { gutPoint } from './gut';
import { Mesher } from './mesher';
import { floorY } from './axes';
import { ORGANS, segAt, segStart, segmentLength, wallThickness } from './layout';
import { blob, sweep } from './sweep';
import { mulberry32 } from '../core/random';

/**
 * The reproductive organs (every earthworm has both sets): testes and sperm funnels in 10 and 11,
 * three pairs of lobed seminal vesicles in 9, 11 and 12, two pairs of seminal receptacles in 9 and
 * 10, ovaries in 13 with their egg funnels and oviducts to the female pores on 14, and the sperm
 * ducts back to the male pores on 15.
 */

const tone = (hex: string, vary = 0.08) => {
  const base = new THREE.Color(hex);
  return (u: number, v: number, _p: THREE.Vector3, o: THREE.Color) =>
    o.copy(base).multiplyScalar(1 - vary + vary * (0.5 + 0.5 * Math.sin(u * 19 + v * 31)));
};
const IVORY = tone('#efe4cc', 0.14);
const PEARL = tone('#efe3d6', 0.06);
const EGG = tone('#f1d98f', 0.1);
const DUCT = tone('#f3ece0', 0.02);

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export interface ReproParts {
  /** Organs on the midline. */
  inner: Mesher;
  /** Paired organs in the body cavity, by side (the near ones hide in the cutaway). */
  innerFar: Mesher;
  innerNear: Mesher;
  /** Parts joined to each side's body wall. */
  far: Mesher;
  near: Mesher;
  /** The see-through sperm reservoirs round the testes and funnels. */
  sacs: Mesher;
}

/** A seminal vesicle: a soft cluster of rounded lobes filling an ellipsoid of radii r. */
function vesicle(m: Mesher, c: THREE.Vector3, r: THREE.Vector3, seed: number): void {
  const rnd = mulberry32(seed);
  const n = 16;
  for (let i = 0; i < n; i++) {
    // Points spread through the volume (more toward the outside, so the surface is lumpy).
    const u = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const q = Math.sqrt(1 - u * u);
    const d = 0.45 + 0.4 * Math.sqrt(rnd());
    const p = V(c.x + r.x * d * q * Math.cos(a), c.y + r.y * d * u, c.z + r.z * d * q * Math.sin(a));
    const k = 0.42 + 0.22 * rnd();
    blob(m, p, V(r.x * k, Math.min(r.y, r.z) * k, Math.min(r.y, r.z) * k * 0.95), IVORY, { amp: 0.06, freq: 3, seed: seed + i, rows: 12, cols: 16 });
  }
  blob(m, c, r.clone().multiplyScalar(0.72), IVORY, { amp: 0.05, seed, rows: 16, cols: 20 });
}

export function buildRepro(): ReproParts {
  const out: ReproParts = { inner: new Mesher(), innerFar: new Mesher(), innerNear: new Mesher(), far: new Mesher(), near: new Mesher(), sacs: new Mesher() };
  const T = wallThickness();
  for (const side of [1, -1]) {
    const w = side > 0 ? out.near : out.far;
    const m = side > 0 ? out.innerNear : out.innerFar;
    // Seminal vesicles: three pairs, the back pair by far the biggest, beside and over the esophagus.
    ORGANS.seminalVesicles.forEach((n, i) => {
      const big = [0.55, 0.85, 1.12][i];
      const x = segAt(n, 0.66);
      const g = gutPoint(x, side * 1.1, new THREE.Vector3(), 0.7 * big);
      vesicle(m, g, V(0.34 * segmentLength(n) * (0.8 + 0.3 * big), 1.0 * big, 0.82 * big), n * 7 + (side > 0 ? 1 : 2));
    });
    // Testes (small, near the front wall of 10 and 11, beside the nerve cord) and sperm funnels.
    for (let n = ORGANS.testes[0]; n <= ORGANS.testes[1]; n++) {
      blob(m, V(segAt(n, 0.25), floorY(segAt(n, 0.25)) + 0.42, side * 0.42), V(0.18, 0.13, 0.22), IVORY, { amp: 0.3, freq: 5, seed: n + 20 });
      const f = V(segAt(n, 0.82), floorY(segAt(n, 0.82)) + 0.5, side * 0.62);
      blob(m, f, V(0.14, 0.3, 0.26), PEARL, { amp: 0.3, freq: 7, seed: n + 30, rows: 18, cols: 24 });
      // Sperm duct from the funnel back along the floor to the male pore on 15.
      const xp = segAt(ORGANS.malePores, 0.5);
      const pore = bodyPoint(xp, side * (Math.PI - 0.78), T + 0.03, new THREE.Vector3());
      const pts = [f.clone()];
      for (let k = n + 1; k <= ORGANS.malePores; k++) {
        const x = segAt(k, k === ORGANS.malePores ? 0.1 : 0.4);
        // Low along the body wall, well clear of the gut.
        pts.push(insideWall(x, side * (Math.PI - 0.6 - 0.08 * (n - 10)), 0.1, new THREE.Vector3()));
      }
      pts.push(pore);
      sweep(w, pts, () => 0.045, DUCT, { radial: 6, per: 0.12 });
      if (n === ORGANS.testes[0]) blob(w, pore, V(0.16, 0.16, 0.16), DUCT, { rows: 8, cols: 10 });
    }
  }
  // Sperm reservoirs: one median sac in each of 10 and 11, round the testes and funnels.
  for (let n = ORGANS.testes[0]; n <= ORGANS.testes[1]; n++) {
    const x = segAt(n, 0.52);
    // Above the nerve cord, never through it.
    blob(out.sacs, V(x, floorY(x) + 0.95, 0), V(0.42 * segmentLength(n), 0.4, 0.95), PEARL, { rows: 20, cols: 28 });
  }
  for (const side of [1, -1]) {
    const w = side > 0 ? out.near : out.far;
    const m = side > 0 ? out.innerNear : out.innerFar;
    // Seminal receptacles: round sacs on short ducts opening in the 9/10 and 10/11 furrows.
    for (let n = ORGANS.spermathecae[0]; n <= ORGANS.spermathecae[1]; n++) {
      const x = segAt(n, 0.5);
      const sac = insideWall(x, side * (Math.PI - 1.15), 0.42, new THREE.Vector3());
      blob(w, sac, V(0.36, 0.4, 0.36), PEARL, { amp: 0.03, seed: n + 40, rows: 18, cols: 24 });
      const open = bodyPoint(segStart(n + 1), side * (Math.PI - 1.12), T * 0.5, new THREE.Vector3());
      sweep(w, [sac.clone(), V((sac.x + open.x) / 2, (sac.y + open.y) / 2 - 0.05, (sac.z + open.z) / 2), open], (t) => 0.1 - 0.04 * t, PEARL, { radial: 8, per: 0.06 });
    }
    // Ovary in 13, hanging from its front septum, with eggs at its tip.
    const ov = V(segAt(ORGANS.ovaries, 0.28), floorY(segAt(ORGANS.ovaries, 0.28)) + 0.42, side * 0.55);
    blob(m, ov, V(0.32, 0.13, 0.15), EGG, { amp: 0.12, freq: 6, seed: side > 0 ? 50 : 51, rot: new THREE.Euler(0, side * 0.3, -0.2) });
    for (let k = 0; k < 3; k++) {
      blob(m, V(ov.x + 0.3 + k * 0.08, ov.y - 0.05 + k * 0.02, ov.z + side * 0.05 * k), V(0.06, 0.06, 0.06), EGG, { rows: 6, cols: 8 });
    }
    // Egg funnel on the 13/14 septum, the oviduct through it, and the egg sac in 14.
    const funnelX = segStart(ORGANS.ovaries + 1) - 0.12;
    const funnel = V(funnelX, floorY(funnelX) + 0.4, side * 0.62);
    blob(m, funnel, V(0.1, 0.22, 0.2), PEARL, { amp: 0.25, freq: 6, seed: side > 0 ? 60 : 61 });
    const femalePore = bodyPoint(segAt(ORGANS.femalePores, 0.35), side * (Math.PI - 0.42), T * 0.6, new THREE.Vector3());
    sweep(w, [funnel.clone(), V(funnelX + 0.35, floorY(funnelX + 0.35) + 0.25, side * 0.66), femalePore], () => 0.035, DUCT, { radial: 6, per: 0.08 });
    const sacX = segStart(ORGANS.femalePores) + 0.2 * segmentLength(ORGANS.femalePores);
    blob(m, V(sacX, floorY(sacX) + 0.75, side * 0.9), V(0.18, 0.22, 0.2), EGG, { amp: 0.15, freq: 5, seed: side > 0 ? 70 : 71 });
  }
  return out;
}
