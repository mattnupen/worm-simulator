import * as THREE from 'three';
import type { MeshWriter } from '../surface/meshWriter';

/**
 * Build-time helpers for the robin's soft shapes (robinShape.ts): colours mixed in linear space,
 * a "loft" (a smooth skin round a curve, like the worm's body) and thin tubes for legs and toes.
 * They write the props' painted attribute (aProp: linear rgb, surface code 0 for plain).
 */

export type Rgb = readonly [number, number, number];

const tmp = new THREE.Color();

/** An sRGB hex colour as linear rgb (the attribute's space). */
export function lin(hex: number): Rgb {
  tmp.setHex(hex);
  return [tmp.r, tmp.g, tmp.b];
}

/** a to b by t (0..1, clamped). */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Brightness times `f`. */
export function shade(c: Rgb, f: number): Rgb {
  return [c[0] * f, c[1] * f, c[2] * f];
}

export function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** A small, steady ripple (-1..1) for feather-scale colour variation; no random state. */
export function ripple(u: number, v: number): number {
  return Math.sin(u * 12.9898 + v * 4.1414) * Math.sin(u * 3.7 - v * 9.2);
}

/** One loft vertex: where it is and its colour. */
export interface LoftPoint { x: number; y: number; z: number; c: Rgb }

/**
 * A smooth skin of (rings + 1) x (sides + 1) vertices: `at(s, a)` gives the point at s (0..1 along
 * the shape) and a (0..2π round it, or 0..1 across an open sheet). Normals are averaged from the
 * faces, so the light rolls across it like the worm's body. Returns the first vertex.
 */
export function loft(w: MeshWriter, rings: number, sides: number, at: (s: number, a: number) => LoftPoint, closed = true): number {
  const first = w.vertexCount;
  const firstIdx = w.idx.length;
  for (let i = 0; i <= rings; i++) {
    for (let k = 0; k <= sides; k++) {
      const p = at(i / rings, closed ? (k / sides) * Math.PI * 2 : k / sides);
      w.vertex(p.x, p.y, p.z, 0, 1, 0, [p.c[0], p.c[1], p.c[2], 0]);
    }
  }
  w.grid(first, rings + 1, sides + 1);
  w.smoothNormals(first, firstIdx);
  if (closed) weldSeam(w, first, rings, sides);
  return first;
}

/** The seam column (a = 0 and a = 2π) gets one averaged normal, so no crease shows down the back. */
function weldSeam(w: MeshWriter, first: number, rings: number, sides: number): void {
  const n = w.nor;
  for (let i = 0; i <= rings; i++) {
    const a = (first + i * (sides + 1)) * 3;
    const b = (first + i * (sides + 1) + sides) * 3;
    const x = n[a] + n[b];
    const y = n[a + 1] + n[b + 1];
    const z = n[a + 2] + n[b + 2];
    const l = Math.hypot(x, y, z) || 1;
    n[a] = n[b] = x / l;
    n[a + 1] = n[b + 1] = y / l;
    n[a + 2] = n[b + 2] = z / l;
  }
}

type V3 = readonly [number, number, number];

/**
 * A round tube from `a` to `b` (radius ra to rb), capped at both ends with a rounded tip: a leg
 * bone or a toe.
 */
export function tube(w: MeshWriter, a: V3, b: V3, ra: number, rb: number, c: Rgb, sides = 6): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  const t: V3 = [dx / len, dy / len, dz / len];
  // Any vector not along t, then two at right angles to it.
  const h: V3 = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(t, h));
  const v = cross(t, u);
  // Rounded ends: rings of the bone, pulled in to a point past each end.
  const rings: [number, number][] = [[-0.6, 0], [-0.4, 0.75], [0, 1], [1, 1], [1.4, 0.75], [1.6, 0]];
  loft(w, rings.length - 1, sides, (s, ang) => {
    const [along, k] = rings[Math.round(s * (rings.length - 1))];
    const f = Math.min(1, Math.max(0, along));
    const r = (ra + (rb - ra) * f) * k;
    const off = along < 0 ? along * ra : along > 1 ? (along - 1) * rb : along * len;
    const base = along > 1 ? len : 0;
    const cx = Math.cos(ang) * r;
    const cy = Math.sin(ang) * r;
    return {
      x: a[0] + t[0] * (base + off) + u[0] * cx + v[0] * cy,
      y: a[1] + t[1] * (base + off) + u[1] * cx + v[1] * cy,
      z: a[2] + t[2] * (base + off) + u[2] * cx + v[2] * cy,
      c,
    };
  });
}

function cross(p: V3, q: V3): V3 {
  return [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
}

function norm(p: V3): V3 {
  const l = Math.hypot(p[0], p[1], p[2]) || 1;
  return [p[0] / l, p[1] / l, p[2] / l];
}
