import * as THREE from 'three';

/**
 * Pure numbers and shapes for the bristle close-up (scene.ts), in millimetres. The front of a
 * nightcrawler, cut open along its middle, digs through soil by peristalsis: a squeeze passes from
 * head to tail, and wherever the body is squeezed short and fat its bristles push out to grip. The
 * squeeze is a smooth wave along the body (not one segment at a time), so neighbours move together.
 *
 * Positions along the body are in segments, q: 0 at the front of the first segment (the
 * peristomium, round the mouth), growing toward the tail; the mouth lobe (prostomium) is q < 0.
 */

/** Segments in the piece, and the mouth lobe's length in segments. */
export const PIECE = 20;
export const LOBE = 0.75;
/** A resting segment's length and the body's radius (an adult is about 7 to 10 mm wide). */
export const SEG = 1.4;
export const RADIUS = 4;
/** The body wall's thickness: cuticle and skin, circular muscle, longitudinal muscle. */
export const WALL = 0.75;
export const LAYERS = [0.1, 0.18, 0.47] as const;
/** Segments per squeeze wave, and seconds for one wave to pass a point. */
export const WAVE = 7;
export const PERIOD = 2.6;
/** A bristle's drawn length and how far it slides out (no measured size: a recorded choice). */
export const BRISTLE = 0.95;
export const REACH = 0.5;
/** The widest the body gets: the tunnel it pushes open. */
export const WIDEST = RADIUS * 1.14;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
export const smooth = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** How squeezed the body is at q, `phase` waves in: 0 long and thin, 1 short and fat. Smooth in q and time. */
export function squeezeAt(q: number, phase: number): number {
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * (phase - q / WAVE));
}

/** Length per segment and radius at squeeze s: shorter and fatter, keeping about the same volume. */
export const segLength = (s: number): number => SEG * (1.15 - 0.4 * s);
export const segRadius = (s: number): number => RADIUS * (0.92 + 0.22 * s);

/** How far the bristles are out at squeeze s (0 in, 1 out): they follow the squeeze, a little late. */
export const bristleOut = (s: number): number => smooth(0.45, 0.9, s);

/**
 * The head's taper: from a blunt point at the lobe's tip, widening over the first five segments,
 * so the front works as a wedge.
 */
export function headScale(q: number): number {
  const t = clamp01((q + LOBE) / (LOBE + 5));
  return 1 - (1 - t) ** 2.2;
}

/** The lobe rides high, over the mouth: how far its middle sits above the body's (mm). */
export const headLift = (q: number): number => RADIUS * 0.24 * (1 - smooth(-LOBE, 1.6, q));

/** The furrow between segments (and behind the lobe): the radius dips a little at each boundary. */
export function grooveAt(q: number): number {
  if (q < 0) return 1 - 0.07 * Math.exp(-((q / 0.09) ** 2));
  const u = q - Math.floor(q);
  return 1 - 0.05 * (Math.exp(-((u / 0.08) ** 2)) + Math.exp(-(((1 - u) / 0.08) ** 2)));
}

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
