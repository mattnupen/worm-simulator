import * as THREE from 'three';

/**
 * Pure numbers and shapes for the bristle close-up (scene.ts), in millimetres. A short piece of a
 * nightcrawler, cut open along its middle, crawls through soil by peristalsis: a squeeze passes
 * from head to tail, and each segment that squeezes short and fat pushes its bristles out to grip.
 */

/** Segments in the piece. */
export const PIECE = 20;
/** A resting segment's length and the body's radius (an adult is about 7 to 10 mm wide). */
export const SEG = 1.4;
export const RADIUS = 4;
/** The body wall's thickness: cuticle and skin, circular muscle, longitudinal muscle. */
export const WALL = 0.75;
export const LAYERS = [0.1, 0.18, 0.47] as const;
/** Segments per squeeze wave, and seconds for one wave to pass a segment. */
export const WAVE = 7;
export const PERIOD = 2.6;
/** A bristle's drawn length and how far it slides out (no measured size: a recorded choice). */
export const BRISTLE = 0.95;
export const REACH = 0.5;
/** Where the soil floor sits under the belly: a fat segment's belly nearly touches it. */
export const FLOOR = -RADIUS * 1.14 - 0.08;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
export const smooth = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** How squeezed segment i (0 at the head) is at `phase` waves: 0 long and thin, 1 short and fat. */
export function squeeze(i: number, phase: number): number {
  const c = 0.5 - 0.5 * Math.cos(2 * Math.PI * (phase - i / WAVE));
  return smooth(0.15, 0.85, c);
}

/** A segment's length and radius at squeeze s: shorter and fatter, keeping about the same volume. */
export const segLength = (s: number): number => SEG * (1.15 - 0.4 * s);
export const segRadius = (s: number): number => RADIUS * (0.92 + 0.22 * s);

/** How far a segment's bristles are out (0 in, 1 out): they follow the squeeze, a little late. */
export const bristleOut = (s: number): number => smooth(0.45, 0.9, s);

/** Radius scale along the piece (u 0 at a segment's front): the head rounds off; behind, the body goes on out of view. */
export function capScale(i: number, u: number): number {
  if (i === 0) return Math.sqrt(1 - (1 - u) * (1 - u));
  return 1;
}

/** The ring groove at a segment's ends (u 0..1 along it). */
export const groove = (u: number): number => 1 - 0.05 * (Math.exp(-((u / 0.08) ** 2)) + Math.exp(-(((1 - u) / 0.08) ** 2)));

/**
 * A bristle: a slim, slightly S-curved rod with a swelling (the nodulus) a little below its middle
 * and a hooked tip. Built along -y from the origin (its inner end), so it points out of the belly.
 */
export function bristleGeometry(): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.05, -0.28, 0),
    new THREE.Vector3(-0.02, -0.55, 0),
    new THREE.Vector3(0.03, -0.8, 0),
    new THREE.Vector3(-0.07, -BRISTLE, 0),
  ]);
  const rings = 28;
  const around = 8;
  const pos: number[] = [];
  const idx: number[] = [];
  const frames = curve.computeFrenetFrames(rings, false);
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const p = curve.getPointAt(t);
    const r = 0.055 * (1 - 0.8 * t) + 0.022 * Math.exp(-(((t - 0.45) / 0.07) ** 2));
    for (let j = 0; j < around; j++) {
      const a = (j / around) * Math.PI * 2;
      const n = frames.normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < around; j++) {
      const a = i * around + j;
      const b = i * around + ((j + 1) % around);
      idx.push(a, a + around, b, b, a + around, b + around);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
