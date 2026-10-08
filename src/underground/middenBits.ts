import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MeshWriter } from '../surface/meshWriter';
import { PROP } from '../surface/propGeometry';
import { litterTopHeight } from '../surface/litterDepth';

/**
 * What lies on a midden's heap (middens.ts): crumbly casting lumps and the leaf bits a nightcrawler
 * pulls in. Written once per new opening, with the heap's shape (`reach(a)`: its radius at angle
 * a; `heap(t, a)`: its height over the litter's top at share t of that) and its random sequence.
 */
const LUMPS = 24;
const LEAF_BITS = 9;
/** A casting lump: a coarse unit sphere (7 x 4: 23 vertices, 42 triangles), indexed. */
const CRUMB = (() => {
  const g = new THREE.SphereGeometry(1, 7, 4);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const m = mergeVertices(g);
  return { pos: m.getAttribute('position').array as Float32Array, index: m.getIndex()!.array };
})();
/** The vertices and indices one heap's lumps and leaf bits take. */
export const BITS_VERTS = LUMPS * (CRUMB.pos.length / 3) + LEAF_BITS * 8;
export const BITS_INDEX = LUMPS * CRUMB.index.length + LEAF_BITS * 24;
/** The lumps a little paler than the heap's castings, as drying crumbs are (sRGB). */
const LUMP_HEX = ['#3b2f26', '#45372c', '#33291f', '#4d3d2f'];
/** Leaf bits pulled in: browned, red, orange, tan (sRGB). */
const LEAF_HEX = ['#6b4a2c', '#a5401f', '#c47c2c', '#a8894f', '#7a5634'];
/**
 * A leaf bit's 8 points: [share along it, share of its width across (+ left), shade]. Along -1 is
 * its widest (the bit's `mid`), 2 the narrowing past it; the midrib (across 0) is a little darker,
 * and the base darker still (where it was torn or pulled in).
 */
const LEAF_OUTLINE: readonly (readonly [number, number, number])[] = [
  [0, 0, 0.8], [-1, 1, 1], [-1, 0, 0.9], [-1, -1, 1], [2, 0.62, 1], [2, 0, 0.9], [2, -0.62, 1], [1, 0, 1],
];
/** Its triangles: base to the widest, the widest to the narrowing, the narrowing to the tip. */
const LEAF_TRIS = [[0, 1, 2], [0, 2, 3], [2, 1, 4], [2, 4, 5], [2, 5, 6], [2, 6, 3], [5, 4, 7], [5, 7, 6]] as const;
const col = new THREE.Color();
const rgba = [0, 0, 0, 0];

/** One of `hex` (sRGB), darkened by `dark`, as aProp (linear rgb and the surface code `kind`). */
export function tint(hex: readonly string[], rand: () => number, dark: number, kind: number): number[] {
  col.set(hex[Math.floor(rand() * hex.length)]);
  rgba[0] = col.r * dark;
  rgba[1] = col.g * dark;
  rgba[2] = col.b * dark;
  rgba[3] = kind;
  return rgba;
}

type Reach = (a: number) => number;
type Heap = (t: number, a: number) => number;

/** The castings round the opening at (x, z). */
export function writeCastings(w: MeshWriter, x: number, z: number, turn: number, rand: () => number, reach: Reach, heap: Heap): void {
  // Castings: crumbly lumps half sunk in the heap, most of them round the crater.
  const { pos, index } = CRUMB;
  for (let n = 0; n < LUMPS; n++) {
    const a = turn + (n / LUMPS) * Math.PI * 2 + rand() * 0.35;
    const t = 0.3 + Math.pow(rand(), 1.4) * 0.6;
    const s = 0.04 + Math.pow(rand(), 2) * 0.06;
    const d = t * reach(a);
    const cx = x + Math.cos(a) * d;
    const cz = z + Math.sin(a) * d;
    const cy = litterTopHeight(cx, cz) + heap(t, a) - s * 0.2;
    const c = tint(LUMP_HEX, rand, 0.85 + rand() * 0.35, PROP.plain);
    const c0 = c[0];
    const c1 = c[1];
    const c2 = c[2];
    const f = w.vertexCount;
    const fi = w.idx.length;
    const q1 = rand() * 6;
    const q2 = rand() * 6;
    for (let i = 0; i < pos.length; i += 3) {
      const lump = 1 + 0.18 * Math.sin(5 * pos[i] + 3 * pos[i + 2] + q1) + 0.12 * Math.sin(7 * pos[i + 1] + 4 * pos[i] + q2);
      // Paler on top, where the crumbs dry.
      const dry = 0.85 + 0.25 * Math.max(0, pos[i + 1]);
      w.vertex(cx + pos[i] * s * lump, cy + pos[i + 1] * s * 0.65 * lump, cz + pos[i + 2] * s * lump, 0, 1, 0, [c0 * dry, c1 * dry, c2 * dry, PROP.plain]);
    }
    for (let i = 0; i < index.length; i += 3) w.tri(f + index[i], f + index[i + 1], f + index[i + 2]);
    w.smoothNormals(f, fi);
  }
}

/**
 * The leaf bits round the opening at (x, z), whose heap is `radius` across at most and whose hole's
 * floor is `holeUp` over the litter's top.
 */
export function writeLeafBits(
  w: MeshWriter, x: number, z: number, turn: number, radius: number, holeUp: number, rand: () => number, reach: Reach, heap: Heap,
): void {
  // Leaf bits pulled in: three stand up out of the hole (a nightcrawler drags leaves in by an end),
  // the rest lie on the heap's slope, clear of the crater so the hole shows.
  for (let n = 0; n < LEAF_BITS; n++) {
    const standing = n < 3;
    const a = turn + (n / LEAF_BITS) * Math.PI * 2 + rand() * 0.6;
    const t = standing ? 0.08 + rand() * 0.06 : 0.45 + rand() * 0.45;
    const d = t * reach(a);
    const cx = x + Math.cos(a) * d;
    const cz = z + Math.sin(a) * d;
    const top = litterTopHeight(cx, cz);
    const by = standing ? top + holeUp - 0.02 : top + heap(t, a) + 0.03;
    const len = standing ? 0.26 + rand() * 0.1 : 0.2 + rand() * 0.12;
    const wide = standing ? 0.06 + rand() * 0.04 : len * (0.22 + rand() * 0.12);
    // Standing: up out of the hole, leaning outward; lying: any way, tipped with the heap's slope.
    const yaw = standing ? a + (rand() - 0.5) * 0.8 : rand() * Math.PI * 2;
    const ux = Math.cos(yaw) * (standing ? 0.6 : 1);
    const uz = Math.sin(yaw) * (standing ? 0.6 : 1);
    // (Pointing uphill a bit tucks its tip into the heap rather than standing proud of it.)
    const uy = standing ? 1 : Math.min(0.3, ((heap(Math.min(1, t + 0.1), a) - heap(t, a)) / (0.1 * radius)) * Math.cos(yaw - a));
    const ul = Math.hypot(ux, uy, uz);
    const sx = -Math.sin(yaw);
    const sz = Math.cos(yaw);
    const c = tint(LEAF_HEX, rand, standing ? 0.85 : 1, PROP.plant);
    const c0 = c[0];
    const c1 = c[1];
    const c2 = c[2];
    const ex = (ux / ul) * len;
    const ey = (uy / ul) * len;
    const ez = (uz / ul) * len;
    const mid = 0.4 + rand() * 0.2;
    // A leaf's outline (base, widest at `mid`, narrowing, tip), a little lopsided, folded along its
    // midrib: lying bits curl up at their sides, standing ones fold outward along the middle.
    const lift = standing ? 0 : 0.025;
    const fold = standing ? 0.025 : 0;
    const skew = 0.08 * Math.sin(n * 2.3 + mid * 17);
    const fx = Math.cos(a) * fold;
    const fz = Math.sin(a) * fold;
    // Faces up (across the bit, toward the sky); each side's normal leans with its fold.
    const nl = Math.hypot(-ey * sz, ex * sz - ez * sx, ey * sx) || 1;
    const nx = (-ey * sz) / nl;
    const ny = (ex * sz - ez * sx) / nl;
    const nz = (ey * sx) / nl;
    const lean = standing ? 0.25 : 0.35;
    const first = w.vertexCount;
    for (let k = 0; k < LEAF_OUTLINE.length; k++) {
      const [at, across, shade] = LEAF_OUTLINE[k];
      const g = at < 0 ? mid : at > 1 ? mid + (1 - mid) * 0.55 : at;
      const side = Math.sign(across);
      const half = Math.abs(across) * wide * (1 + side * skew);
      const up = Math.abs(across) * lift;
      const v = w.vertex(
        cx + ex * g + sx * side * half + fx * Math.abs(across), by + ey * g + up, cz + ez * g + sz * side * half + fz * Math.abs(across),
        0, 1, 0, [c0 * shade, c1 * shade, c2 * shade, PROP.plant + 0.2 + 0.7 * g],
      );
      const lx = nx - side * sx * lean;
      const ly = ny;
      const lz = nz - side * sz * lean;
      const l = Math.hypot(lx, ly, lz) || 1;
      w.nor[v * 3] = lx / l;
      w.nor[v * 3 + 1] = ly / l;
      w.nor[v * 3 + 2] = lz / l;
    }
    for (const [i, j, k] of LEAF_TRIS) w.tri(first + i, first + j, first + k);
  }
}
