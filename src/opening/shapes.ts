import * as THREE from 'three';
import { MeshWriter } from '../surface/meshWriter';

/**
 * Simple solid shapes for the opening's props, written into a MeshWriter with the props' painted
 * attribute (aProp: linear rgb, surface code 0 for plain). Build-time only. The painted lighting,
 * brush strokes and haze give them the forest's look, so plain shapes are enough.
 */
export function writer(): MeshWriter {
  return new MeshWriter('aProp', 4);
}

const c = new THREE.Color();
let gain = 1;
const rgb = (hex: number): number[] => {
  c.setHex(hex);
  return [c.r * gain, c.g * gain, c.b * gain, 0];
};

/**
 * Writes with every colour brightened by `g` (linear), then back to plain. The bus stands far off
 * with the low sun behind it, so its side is in shade and the haze greys it: brightened, it still
 * reads as school-bus yellow.
 */
export function withGain(g: number, write: () => void): void {
  gain = g;
  try {
    write();
  } finally {
    gain = 1;
  }
}

/** A box from (x0, y0, z0) to (x1, y1, z1), flat-shaded. */
export function box(w: MeshWriter, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, hex: number): void {
  const p = rgb(hex);
  const face = (n: [number, number, number], q: [number, number, number][]): void => {
    const i = q.map(([x, y, z]) => w.vertex(x, y, z, n[0], n[1], n[2], p));
    w.triFacing(i[0], i[1], i[2], n[0], n[1], n[2]);
    w.triFacing(i[0], i[2], i[3], n[0], n[1], n[2]);
  };
  face([1, 0, 0], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]);
  face([-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]);
  face([0, 1, 0], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]);
  face([0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
  face([0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
  face([0, 0, -1], [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]]);
}

/**
 * A cylinder along y from y0 to y1 round (cx, cz), smooth-sided, with flat caps (`caps`: which
 * ends get one). `r1` (default r0) tapers it.
 */
export function cylinder(
  w: MeshWriter, cx: number, cz: number, y0: number, y1: number, r0: number, sides: number, hex: number,
  caps: { bottom?: boolean; top?: boolean } = { bottom: true, top: true }, r1 = r0,
): void {
  const p = rgb(hex);
  const ring = (y: number, r: number): number => {
    const first = w.vertexCount;
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      w.vertex(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, Math.cos(a), (r0 - r1) / Math.max(1e-6, y1 - y0), Math.sin(a), p);
    }
    return first;
  };
  const a = ring(y0, r0);
  const b = ring(y1, r1);
  for (let k = 0; k < sides; k++) {
    w.triFacing(a + k, a + k + 1, b + k + 1, Math.cos(((k + 0.5) / sides) * Math.PI * 2), 0, Math.sin(((k + 0.5) / sides) * Math.PI * 2));
    w.triFacing(a + k, b + k + 1, b + k, Math.cos(((k + 0.5) / sides) * Math.PI * 2), 0, Math.sin(((k + 0.5) / sides) * Math.PI * 2));
  }
  const cap = (y: number, r: number, ny: number): void => {
    const mid = w.vertex(cx, y, cz, 0, ny, 0, p);
    const first = w.vertexCount;
    for (let k = 0; k <= sides; k++) {
      const ang = (k / sides) * Math.PI * 2;
      w.vertex(cx + Math.cos(ang) * r, y, cz + Math.sin(ang) * r, 0, ny, 0, p);
    }
    for (let k = 0; k < sides; k++) w.triFacing(mid, first + k, first + k + 1, 0, ny, 0);
  };
  if (caps.bottom) cap(y0, r0, -1);
  if (caps.top) cap(y1, r1, 1);
}

/**
 * A wheel: a cylinder along x (the axle) at (cx, cy, cz), tyre and a lighter hub on the outer
 * face (`outward`: -1 the hub faces -x).
 */
export function wheel(w: MeshWriter, cx: number, cy: number, cz: number, r: number, width: number, outward: 1 | -1, tyre: number, hub: number): void {
  const sides = 20;
  const t = rgb(tyre);
  const h = rgb(hub);
  const x0 = cx - width / 2;
  const x1 = cx + width / 2;
  const first = w.vertexCount;
  for (let k = 0; k <= sides; k++) {
    const a = (k / sides) * Math.PI * 2;
    const y = cy + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    w.vertex(x0, y, z, 0, Math.cos(a), Math.sin(a), t);
    w.vertex(x1, y, z, 0, Math.cos(a), Math.sin(a), t);
  }
  for (let k = 0; k < sides; k++) {
    const a = first + k * 2;
    const ang = ((k + 0.5) / sides) * Math.PI * 2;
    w.triFacing(a, a + 1, a + 3, 0, Math.cos(ang), Math.sin(ang));
    w.triFacing(a, a + 3, a + 2, 0, Math.cos(ang), Math.sin(ang));
  }
  // The faces: tyre rubber in a ring, the hub in the middle (both ends, so it reads from either side).
  for (const side of [-1, 1] as const) {
    const x = side < 0 ? x0 : x1;
    const hubbed = side === outward;
    const mid = w.vertex(x, cy, cz, side, 0, 0, hubbed ? h : t);
    const ringStart = w.vertexCount;
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      w.vertex(x, cy + Math.cos(a) * r * 0.55, cz + Math.sin(a) * r * 0.55, side, 0, 0, hubbed ? h : t);
    }
    for (let k = 0; k < sides; k++) w.triFacing(mid, ringStart + k, ringStart + k + 1, side, 0, 0);
    const outer = w.vertexCount;
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      w.vertex(x, cy + Math.cos(a) * r * 0.55, cz + Math.sin(a) * r * 0.55, side, 0, 0, t);
      w.vertex(x, cy + Math.cos(a) * r, cz + Math.sin(a) * r, side, 0, 0, t);
    }
    for (let k = 0; k < sides; k++) {
      const a = outer + k * 2;
      w.triFacing(a, a + 1, a + 3, side, 0, 0);
      w.triFacing(a, a + 3, a + 2, side, 0, 0);
    }
  }
}

/**
 * A rounded lump (a squashed half sphere) on y = 0, `rx` by `rz` across and `h` high: spilled soil.
 * Its rim is a little uneven so it reads as a heap, not a dome.
 */
export function heap(w: MeshWriter, rx: number, rz: number, h: number, hex: number, seed: number): void {
  const p = rgb(hex);
  const rings = 5;
  const sides = 18;
  const first = w.vertexCount;
  const firstIdx = w.idx.length;
  for (let i = 0; i <= rings; i++) {
    const v = i / rings;
    const rr = Math.cos((v * Math.PI) / 2);
    const y = Math.sin((v * Math.PI) / 2) * h;
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const wobble = 1 + 0.12 * Math.sin(a * 3 + seed) * (1 - v) + 0.06 * Math.sin(a * 7 + seed * 2);
      w.vertex(Math.cos(a) * rx * rr * wobble, y, Math.sin(a) * rz * rr * wobble, 0, 1, 0, p);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < sides; k++) {
      const a = first + i * (sides + 1) + k;
      const b = a + sides + 1;
      w.tri(a, b, a + 1);
      w.tri(a + 1, b, b + 1);
    }
  }
  w.smoothNormals(first, firstIdx);
}

/**
 * A thin round tube along a curve of (x, z) points at height `y` (a bait worm lying on the soil).
 */
export function tube(w: MeshWriter, pts: readonly [number, number][], y: number, r: number, hex: number): void {
  const p = rgb(hex);
  const sides = 6;
  const first = w.vertexCount;
  const firstIdx = w.idx.length;
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const [nx, nz] = pts[Math.min(i + 1, pts.length - 1)];
    const [px, pz] = pts[Math.max(i - 1, 0)];
    let tx = nx - px;
    let tz = nz - pz;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    // Thinner at both ends, like a worm.
    const rr = r * (0.55 + 0.45 * Math.sin((Math.PI * (i + 0.5)) / pts.length));
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      // Round the tangent: a side vector (-tz, tx) and up.
      const sx = -tz * Math.cos(a);
      const sy = Math.sin(a);
      const sz = tx * Math.cos(a);
      w.vertex(x + sx * rr, y + rr + sy * rr, z + sz * rr, sx, sy, sz, p);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const a = first + i * (sides + 1) + k;
      const b = a + sides + 1;
      w.tri(a, a + 1, b);
      w.tri(a + 1, b + 1, b);
    }
  }
  w.smoothNormals(first, firstIdx);
}
