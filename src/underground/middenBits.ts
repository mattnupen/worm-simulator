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
export const BITS_VERTS = LUMPS * (CRUMB.pos.length / 3) + LEAF_BITS * 4;
export const BITS_INDEX = LUMPS * CRUMB.index.length + LEAF_BITS * 6;
/** The lumps a little paler than the heap's castings, as drying crumbs are (sRGB). */
const LUMP_HEX = ['#3b2f26', '#45372c', '#33291f', '#4d3d2f'];
/** Leaf bits pulled in: browned, red, orange, tan (sRGB). */
const LEAF_HEX = ['#6b4a2c', '#a5401f', '#c47c2c', '#a8894f', '#7a5634'];
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
    // Lying bits curl up at their sides; standing ones fold along the middle.
    const lift = standing ? 0 : 0.025;
    const fold = standing ? 0.025 : 0;
    const v0 = w.vertex(cx, by, cz, 0, 1, 0, [c0 * 0.8, c1 * 0.8, c2 * 0.8, PROP.plant + 0.2]);
    const v1 = w.vertex(cx + ex * mid + sx * wide + Math.cos(a) * fold, by + ey * mid + lift, cz + ez * mid + sz * wide + Math.sin(a) * fold, 0, 1, 0, [c0, c1, c2, PROP.plant + 0.5]);
    const v2 = w.vertex(cx + ex, by + ey, cz + ez, 0, 1, 0, [c0, c1, c2, PROP.plant + 0.9]);
    const v3 = w.vertex(cx + ex * mid - sx * wide + Math.cos(a) * fold, by + ey * mid + lift, cz + ez * mid - sz * wide + Math.sin(a) * fold, 0, 1, 0, [c0, c1, c2, PROP.plant + 0.5]);
    w.quad(v0, v1, v2, v3);
    // Faces up (across the bit, toward the sky).
    const nx = -ey * sz;
    const ny = ex * sz - ez * sx;
    const nz = ey * sx;
    for (const v of [v0, v1, v2, v3]) {
      const l = Math.hypot(nx, ny, nz) || 1;
      w.nor[v * 3] = nx / l;
      w.nor[v * 3 + 1] = ny / l;
      w.nor[v * 3 + 2] = nz / l;
    }
  }
}
