import * as THREE from 'three';
import { mulberry32 } from '../core/random';
import { MeshWriter, icosphere } from '../surface/meshWriter';
import { PROP } from '../surface/propGeometry';
import { floorHeight, litterTopHeight } from '../surface/litterDepth';
import { createPropMaterial } from '../render/propMaterial';
import { MAX_OPENINGS, type Openings } from './openings';

/**
 * Burrow openings on the surface (V2 spec 4.2, 6): a dark hole with a nightcrawler midden round it,
 * castings mixed with leaf bits, about 5 cm across (1.2 u) and 1-2 cm high (0.25-0.4 u over the
 * litter's top, Great Lakes Worm Watch). On the deep litter (litterDepth.ts) the heap is a plug of castings
 * from the floor (where the burrow opens) up through the leaves, so it rises out of their top and,
 * seen through the hole over the buried worm, reaches down to the floor instead of hanging in the
 * litter. One draw on the prop material for all of them; rewritten only when an opening is added
 * (allocates then, never per frame).
 */

/** Marks a ring on the floor under the litter (the plug's foot and the burrow's mouth). */
const FLOOR = -9;
/**
 * The heap's rings out from the burrow (share of its radius) and their height over the litter's
 * top: the burrow's mouth on the floor, its shaft, the crater's lip and rim, the slope, its foot
 * at the litter's top, then tucked in under the leaves down to the floor.
 */
const RING_AT = [0, 0.16, 0.17, 0.3, 0.45, 0.62, 0.8, 0.95, 1.04, 0.7];
const RING_UP = [FLOOR, -0.25, 0.13, 0.28, 0.27, 0.19, 0.1, 0.03, -0.06, FLOOR];
/** Rings this far in are the hole: near black. */
const HOLE_RINGS = 3;
const SEGS = 26;
const LUMPS = 24;
const LEAF_BITS = 9;
/** Vertices and indices one midden needs (the heap; LUMPS icospheres of 42 vertices and 80 triangles; the leaf bits). */
const PER_VERTS = 1 + (RING_AT.length - 1) * SEGS + LUMPS * 42 + LEAF_BITS * 4;
const PER_INDEX = SEGS * 3 + (RING_AT.length - 2) * SEGS * 6 + LUMPS * 240 + LEAF_BITS * 6;
const MAX_VERTS = PER_VERTS * MAX_OPENINGS;
const MAX_INDEX = PER_INDEX * MAX_OPENINGS;
/** Castings: dark grey-brown crumbs (sRGB); the lumps a little paler, as drying crumbs are. */
const CAST_HEX = ['#2c231d', '#382d25', '#43372d', '#30271f'];
const LUMP_HEX = ['#3b2f26', '#45372c', '#33291f', '#4d3d2f'];
/** Leaf bits pulled in: browned, red, orange, tan (sRGB). */
const LEAF_HEX = ['#6b4a2c', '#a5401f', '#c47c2c', '#a8894f', '#7a5634'];
const HOLE_RGB = [0.005, 0.004, 0.003];
const col = new THREE.Color();
const rgba = [0, 0, 0, 0];

export interface Middens {
  readonly mesh: THREE.Mesh;
  /** Rewrites the mesh if the openings changed (their version). */
  update(o: Openings): void;
}

/** One of `hex` (sRGB), darkened by `dark`, as aProp (linear rgb and the surface code `kind`). */
function tint(hex: readonly string[], rand: () => number, dark: number, kind: number): number[] {
  col.set(hex[Math.floor(rand() * hex.length)]);
  rgba[0] = col.r * dark;
  rgba[1] = col.g * dark;
  rgba[2] = col.b * dark;
  rgba[3] = kind;
  return rgba;
}

/** The heap's height over the litter's top at share `t` of its radius (the hole and foot rings left out). */
function profile(t: number): number {
  let k = 3;
  while (k < 8 && RING_AT[k] < t) k++;
  const f = Math.min(1, Math.max(0, (t - RING_AT[k - 1]) / (RING_AT[k] - RING_AT[k - 1])));
  return RING_UP[k - 1] + (RING_UP[k] - RING_UP[k - 1]) * f;
}

/** One midden round the opening at (x, z), on the litter's top there; `turn` and `seed` vary it. */
function writeMidden(w: MeshWriter, x: number, z: number, turn: number, seed: number): void {
  const rand = mulberry32(seed);
  const radius = 0.56 + rand() * 0.08;
  const tall = 0.85 + rand() * 0.3;
  // An uneven outline and a lopsided heap (more castings on the side the worm reached out to).
  const p1 = rand() * 6.28;
  const p2 = rand() * 6.28;
  const p3 = rand() * 6.28;
  const lean = turn + rand() * 6.28;
  const reach = (a: number): number => radius * (1 + 0.12 * Math.sin(2 * a + p1) + 0.07 * Math.sin(5 * a + p2));
  const pile = (a: number): number => tall * (1 + 0.2 * Math.cos(a - lean) + 0.1 * Math.sin(3 * a + p3));
  const heap = (t: number, a: number): number => {
    const up = profile(t);
    return up > 0 ? up * pile(a) : up;
  };
  // The heap: the burrow's mouth on the floor, then ring after ring out to the plug's foot.
  const first = w.vertexCount;
  const firstIdx = w.idx.length;
  w.vertex(x, floorHeight(x, z), z, 0, 1, 0, [HOLE_RGB[0], HOLE_RGB[1], HOLE_RGB[2], PROP.plain]);
  for (let r = 1; r < RING_AT.length; r++) {
    for (let k = 0; k < SEGS; k++) {
      const a = (k / SEGS) * Math.PI * 2;
      // Crumbly: rougher down the slope than on the crater's rim.
      const rough = r === 3 ? 0.03 : r >= 4 && r <= 7 ? 0.09 : 0;
      const d = RING_AT[r] * reach(a) * (1 + (rand() - 0.5) * rough);
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      const y = RING_UP[r] === FLOOR ? floorHeight(px, pz) : litterTopHeight(px, pz) + heap(RING_AT[r], a) + (rand() - 0.5) * rough;
      const c = r < HOLE_RINGS ? HOLE_RGB : tint(CAST_HEX, rand, r === 3 ? 0.55 : 0.75 + rand() * 0.5, PROP.plain);
      w.vertex(px, y, pz, 0, 1, 0, [c[0], c[1], c[2], PROP.plain]);
    }
  }
  for (let k = 0; k < SEGS; k++) w.triFacing(first, first + 1 + ((k + 1) % SEGS), first + 1 + k, 0, 1, 0);
  for (let r = 1; r < RING_AT.length - 1; r++) {
    const a0 = first + 1 + (r - 1) * SEGS;
    const b0 = a0 + SEGS;
    for (let k = 0; k < SEGS; k++) {
      const k1 = (k + 1) % SEGS;
      w.quad(a0 + k, a0 + k1, b0 + k1, b0 + k);
    }
  }
  w.smoothNormals(first, firstIdx);
  // Castings: crumbly lumps half sunk in the heap, most of them round the crater.
  const { pos, index } = icosphere();
  for (let n = 0; n < LUMPS; n++) {
    const a = turn + (n / LUMPS) * Math.PI * 2 + rand() * 0.35;
    const t = 0.24 + Math.pow(rand(), 1.4) * 0.66;
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
  // Leaf bits pulled in: three stand up out of the hole (a nightcrawler drags leaves in by an end),
  // the rest lie on the heap.
  for (let n = 0; n < LEAF_BITS; n++) {
    const standing = n < 3;
    const a = turn + (n / LEAF_BITS) * Math.PI * 2 + rand() * 0.6;
    const t = standing ? 0.08 + rand() * 0.06 : 0.3 + rand() * 0.55;
    const d = t * reach(a);
    const cx = x + Math.cos(a) * d;
    const cz = z + Math.sin(a) * d;
    const top = litterTopHeight(cx, cz);
    const by = standing ? top - 0.05 : top + heap(t, a) + 0.04;
    const len = standing ? 0.4 + rand() * 0.15 : 0.2 + rand() * 0.12;
    const wide = standing ? 0.06 + rand() * 0.04 : len * (0.3 + rand() * 0.15);
    // Standing: up out of the hole, leaning outward; lying: any way, tipped with the heap's slope.
    const yaw = standing ? a + (rand() - 0.5) * 0.8 : rand() * Math.PI * 2;
    const ux = Math.cos(yaw) * (standing ? 0.6 : 1);
    const uz = Math.sin(yaw) * (standing ? 0.6 : 1);
    const uy = standing ? 1 : ((heap(Math.min(1, t + 0.1), a) - heap(t, a)) / (0.1 * radius)) * Math.cos(yaw - a);
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

export function createMiddens(): Middens {
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(MAX_VERTS * 3), 3);
  const nor = new THREE.BufferAttribute(new Float32Array(MAX_VERTS * 3), 3);
  const prop = new THREE.BufferAttribute(new Float32Array(MAX_VERTS * 4), 4);
  const index = new THREE.BufferAttribute(new Uint16Array(MAX_INDEX), 1);
  for (const a of [pos, nor, prop, index]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pos);
  geo.setAttribute('normal', nor);
  geo.setAttribute('aProp', prop);
  geo.setIndex(index);
  geo.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(geo, createPropMaterial());
  mesh.name = 'middens';
  mesh.visible = false;
  let version = -1;
  const box = new THREE.Box3();
  const pt = new THREE.Vector3();
  return {
    mesh,
    update(o) {
      if (o.version === version) return;
      version = o.version;
      const w = new MeshWriter('aProp', 4);
      for (let i = 0; i < o.count; i++) {
        const k = i * 4;
        writeMidden(w, o.data[k], o.data[k + 2], o.data[k + 3], 1 + i * 7919 + Math.round(o.data[k] * 13 + o.data[k + 2] * 7));
      }
      const nv = w.vertexCount;
      const pa = pos.array as Float32Array;
      const na = nor.array as Float32Array;
      const xa = prop.array as Float32Array;
      for (let i = 0; i < nv * 3; i++) { pa[i] = w.pos[i]; na[i] = w.nor[i]; }
      for (let i = 0; i < nv * 4; i++) xa[i] = w.extra[i];
      const ia = index.array as Uint16Array;
      for (let i = 0; i < w.idx.length; i++) ia[i] = w.idx[i];
      for (const a of [pos, nor, prop]) { a.clearUpdateRanges(); a.addUpdateRange(0, nv * a.itemSize); a.needsUpdate = true; }
      index.clearUpdateRanges();
      index.addUpdateRange(0, w.idx.length);
      index.needsUpdate = true;
      geo.setDrawRange(0, w.idx.length);
      // Culled by the written vertices only (the buffers' unused tail is stale or zero).
      box.makeEmpty();
      for (let i = 0; i < nv * 3; i += 3) box.expandByPoint(pt.set(pa[i], pa[i + 1], pa[i + 2]));
      geo.boundingSphere = box.getBoundingSphere(geo.boundingSphere ?? new THREE.Sphere());
      mesh.visible = o.count > 0;
    },
  };
}
