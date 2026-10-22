import * as THREE from 'three';
import { mulberry32 } from '../core/random';
import { MeshWriter } from '../surface/meshWriter';
import { PROP } from '../surface/propGeometry';
import { floorHeight, litterTopHeight } from '../surface/litterDepth';
import { createPropMaterial } from '../render/propMaterial';
import { MAX_OPENINGS, type Openings } from './openings';
import { cameraProgress, type ModeState } from './modeMachine';
import { mix } from '../predators/robinGeom';
import { HOLE_FLOOR, LIP_RING, MOUND_R, RING_R as MARK_RING_R, RING_UP as MARK_RING_UP, LIP as MARK_LIP, WALL as MARK_WALL, WALL_TOP as MARK_WALL_TOP } from './digMarkShape';
import { tint, writeCastings, writeLeafBits, BITS_INDEX, BITS_VERTS } from './middenBits';

/**
 * Burrow openings on the surface (V2 spec 4.2, 6): an open hole with a nightcrawler midden round it,
 * castings mixed with leaf bits, about 5 cm across and 1-2 cm high (Great Lakes Worm Watch). Since
 * V4 (revision 1 item 3) its heap and hole are the dig markers' (digMarkShape.ts: a little bigger,
 * a labelled Game choice), so every place to dig down looks alike: a dark hole you can see into. On the deep litter (litterDepth.ts) the heap is a plug of castings
 * from the floor (where the burrow opens) up through the leaves, so it rises out of their top and,
 * seen through the hole over the buried worm, reaches down to the floor instead of hanging in the
 * litter. Where it lies over the buried worm it fades as the leaves do (the prop material's
 * OCCLUDE variant), so a worm crawling through an old opening stays in sight. One draw for all of
 * them; rewritten only when an opening is added (allocates then, never per frame).
 */

/** Marks a ring on the floor under the litter (the plug's foot and the burrow's mouth). */
const FLOOR = -9;
/**
 * The heap's rings out from the burrow (share of its radius) and their height over the litter's
 * top, the dig markers': the hole's floor (near black, well over the top, so neither the drawn top
 * of the litter nor its curled close-up leaves cross it), its dark walls up to the lip, the rim,
 * the slope, its foot at the litter's top, then tucked in under the leaves down to the floor.
 */
const RING_AT = [0, ...MARK_RING_R.map((r) => r / MOUND_R), 0.7];
const RING_UP = [HOLE_FLOOR, ...MARK_RING_UP, FLOOR];
/** Rings this far in are the hole: dark, round, at a fixed height (the heap's lean leaves them be). */
const HOLE_RINGS = 1 + LIP_RING;
/** The ring tucked in under the leaves (the heap's profile runs from the lip to it). */
const TUCK = RING_AT.length - 2;
const SEGS = 26;

/** Vertices and indices one midden needs (the heap; its castings and leaf bits). */
const PER_VERTS = 1 + (RING_AT.length - 1) * SEGS + BITS_VERTS;
const PER_INDEX = SEGS * 3 + (RING_AT.length - 2) * SEGS * 6 + BITS_INDEX;
const MAX_VERTS = PER_VERTS * MAX_OPENINGS;
const MAX_INDEX = PER_INDEX * MAX_OPENINGS;
/** Castings: dark grey-brown crumbs (sRGB). */
const CAST_HEX = ['#2c231d', '#382d25', '#43372d', '#30271f'];
const HOLE_RGB = [0.005, 0.004, 0.003];

export interface Middens {
  readonly mesh: THREE.Mesh;
  /** Rewrites the mesh if the openings changed (their version); else does nothing. */
  update(o: Openings): void;
  /**
   * Shown on the surface only (an old midden must not stand in front of the cut): hidden from
   * halfway through the camera's move down until halfway through its move back up (the dark
   * moment of the reduced-motion dip). Call every frame with the game's mode; allocates nothing.
   */
  show(s: ModeState): void;
}

/** The heap's height over the litter's top at share `t` of its radius (the hole and foot rings left out). */
function profile(t: number): number {
  let k = HOLE_RINGS + 1;
  while (k < TUCK && RING_AT[k] < t) k++;
  const f = Math.min(1, Math.max(0, (t - RING_AT[k - 1]) / (RING_AT[k] - RING_AT[k - 1])));
  return RING_UP[k - 1] + (RING_UP[k] - RING_UP[k - 1]) * f;
}

/** One midden round the opening at (x, z), on the litter's top there; `turn` and `seed` vary it. */
function writeMidden(w: MeshWriter, x: number, z: number, turn: number, seed: number): void {
  const rand = mulberry32(seed);
  const radius = MOUND_R * (0.95 + rand() * 0.1);
  const tall = 0.8 + rand() * 0.25;
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
  // The heap: the hole's dark floor, then ring after ring out to the plug's foot.
  const first = w.vertexCount;
  const firstIdx = w.idx.length;
  w.vertex(x, litterTopHeight(x, z) + RING_UP[0], z, 0, 1, 0, [HOLE_RGB[0], HOLE_RGB[1], HOLE_RGB[2], PROP.plain]);
  for (let r = 1; r < RING_AT.length; r++) {
    for (let k = 0; k < SEGS; k++) {
      const a = (k / SEGS) * Math.PI * 2;
      // The hole and its lip stay round and level; the heap outside is crumbly down its slope.
      const rough = r > HOLE_RINGS && r < TUCK ? 0.09 : 0;
      const d = RING_AT[r] * (r > HOLE_RINGS ? reach(a) : radius) * (1 + (rand() - 0.5) * rough);
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      const up = r <= HOLE_RINGS ? RING_UP[r] : heap(RING_AT[r], a) + (rand() - 0.5) * rough;
      const y = RING_UP[r] === FLOOR ? floorHeight(px, pz) : litterTopHeight(px, pz) + up;
      const c = r === 1 ? MARK_WALL : r < HOLE_RINGS ? MARK_WALL_TOP : r === HOLE_RINGS ? mix(MARK_LIP, MARK_WALL_TOP, rand() * 0.3)
        : tint(CAST_HEX, rand, 0.75 + rand() * 0.5, PROP.plain);
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
  writeCastings(w, x, z, turn, rand, reach, heap, RING_AT[HOLE_RINGS]);
  writeLeafBits(w, x, z, turn, radius, RING_UP[0], rand, reach, heap);
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
  const mesh = new THREE.Mesh(geo, createPropMaterial(false, true));
  mesh.name = 'middens';
  // Visible from the start with nothing to draw, so warmShaders compiles its program at load.
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
    },
    show(s) {
      mesh.visible = s.mode === 'surface' || (s.mode !== 'underground' && cameraProgress(s) < 0.5);
    },
  };
}
