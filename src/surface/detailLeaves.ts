import * as THREE from 'three';
import { mulberry32 } from '../core/random';
import type { Vec3 } from '../core/vec';
import { createLeafMaterial } from '../render/leafMaterial';
import { PRESETS } from '../render/graphics';
import { LEAF_KINDS, type LeafKind } from './leafLitter';
import { detailShape } from './detailShape';
import { leafLift, leafNormal, type LeafForm } from './leafForm';
import { leafTint, LEAF_SIZE, LATERAL_VEINS } from './leafPalette';
import { REAL_SCALE } from './realScale';
import { scaledLeafCount } from './leafScale';
import { POCKET_ORDER } from '../render/drawOrder';

export interface DetailLeaves {
  mesh: THREE.Mesh;
  /** A second draw beside `mesh` (its sibling, shown and hidden on its own): the pocket's fading leaves. */
  readonly beside?: THREE.Mesh;
  /** Leaves built: the most it can draw. */
  readonly max: number;
  /** Leaves drawn right now (0 while hidden). */
  readonly drawn: number;
  /** Per leaf, where its indices end in the index buffer (leaf p holds ends[p - 1] to ends[p]). */
  readonly ends: Uint32Array;
  /** Draws the first `n` leaves; hides the mesh at 0. */
  setCount(n: number): void;
}

/** Leaf-local reach of a silhouette: its farthest point from the leaf centre. */
function reach(kind: LeafKind): number {
  const p = detailShape(kind).points;
  let r = 0;
  for (let k = 0; k < p.length; k += 2) r = Math.max(r, Math.hypot(p[k], p[k + 1]));
  return r;
}

/**
 * The pocket's leaves, as a share of a preset's detail leaves (V2 spec 8.2): packed round the worm
 * in a smaller tile (detailGlsl.ts POCKET_BOX), they lie far more densely than the top's.
 */
export const POCKET_SHARE = 1.25;
/**
 * How many pocket leaves a preset with `detail` detail leaves draws: Ultra's full count, falling
 * only as the square root of the preset's detail leaves (High about 0.8 of it), as the hole must
 * still read as full of leaves (only those it may show are drawn: pocketLeaves.ts); none without
 * detail leaves.
 */
export function pocketCount(detail: number): number {
  return scaledLeafCount(PRESETS.ultra.detail * POCKET_SHARE * Math.sqrt(Math.max(0, detail) / PRESETS.ultra.detail));
}
/** The pocket's leaves are this much smaller than the top's: older leaves, broken up and matted. */
export const POCKET_SIZE = 0.65;
/** Dark wet brown, the old leaves low in the pocket go toward (IMG_2427, IMG_2428)... */
const WET_BROWN = new THREE.Color(0.15, 0.09, 0.05);
/** ...and bleached tan, some of the upper ones. */
const BLEACHED = new THREE.Color(0.55, 0.47, 0.36);

/**
 * A pocket leaf's colours (inner, edge, stem, from leafTint), aged by its place in the litter
 * (`layer`, 0 on the floor to 1 just under the top): most go dark, wet brown, black-brown low
 * down; some of the upper ones are bleached tan (research notes: this fall's bright leaves on top,
 * bleached and then dark brown below). Returns its wetness.
 */
function agePocketLeaf(layer: number, rng: () => number, cols: THREE.Color[]): number {
  const age = 1 - layer;
  if (rng() < 0.25 * layer) {
    for (const c of cols) c.lerp(BLEACHED, 0.75).multiplyScalar(0.85);
    return 0.25;
  }
  for (const c of cols) c.lerp(WET_BROWN, 0.7 + 0.3 * age).multiplyScalar(0.7 - 0.3 * age);
  return 0.6 + 0.35 * age;
}

/**
 * Smaller, more curled, higher-vertex leaves about 6 m around the worm (spec 5.5): on the top of
 * the litter, or (`pocket`) in the litter round the buried worm, seen only through the hole over
 * it, older and darker the lower they lie (V2 spec 8.2). One
 * static mesh in leaf-local space, built once: each leaf's home in a DETAIL_BOX world tile, its yaw
 * and radius are attributes, and the vertex shader places the copy nearest the worm (snapped to a
 * 1 m grid), so the CPU does no work as the worm moves. Positions are scaled so each leaf's
 * farthest vertex is 1 out, which makes aDetail.w its radius: the disturbance map moves it as one
 * piece of that radius, as it does the litter.
 */
export function buildDetailLeaves(count = scaledLeafCount(PRESETS.ultra.detail), seed = 3, pocket = false): DetailLeaves {
  const rng = mulberry32(seed);
  // Real leaf sizes (realScale.ts). Pass the real-size count (scaledLeafCount).
  const grow = REAL_SCALE.leaf;
  const kinds = Array.from({ length: count }, () => LEAF_KINDS[Math.floor(rng() * LEAF_KINDS.length)]);
  let verts = 0;
  let idx = 0;
  for (const k of kinds) {
    verts += detailShape(k).points.length / 2;
    idx += detailShape(k).indices.length;
  }
  const pos = new Float32Array(verts * 3);
  const nor = new Float32Array(verts * 3);
  const colr = new Float32Array(verts * 4);
  const leaf = new Float32Array(verts * 4);
  const leaf2 = new Float32Array(verts * 2);
  const detail = new Float32Array(verts * 4);
  const index = new Uint32Array(idx);
  const ends = new Uint32Array(count);
  const inner = new THREE.Color();
  const edge = new THREE.Color();
  const stem = new THREE.Color();
  const cols = [inner, edge, stem];
  const n: Vec3 = { x: 0, y: 0, z: 0 };
  const form: LeafForm = { fold: 0, cup: 0, curl: 0 };
  let v0 = 0;
  let ii = 0;
  kinds.forEach((kind, li) => {
    const s = detailShape(kind);
    const np = s.points.length / 2;
    // Small (0.6x the first cut): they are many and near the camera, and a leaf's cost is its
    // area on screen (the layer is fill-bound). `size` is the leaf's scale, 0.21 to 0.39 of its
    // species' LEAF_SIZE (a third of the litter's 0.6 to 1.2), times its real-size growth.
    const size = LEAF_SIZE[kind] * (0.21 + rng() * 0.18) * grow[kind] * (pocket ? POCKET_SIZE : 1);
    form.fold = 0.1 + rng() * 0.2;
    form.cup = 0.2 + rng() * (kind === 'oak' ? 0.5 : 0.3);
    form.curl = 0.2 + rng() * (kind === 'oak' ? 0.35 : 0.25);
    const fresh = leafTint(kind, 0.03 + rng() * 0.03, rng, inner, edge, stem);
    const rs = reach(kind);
    const home = [rng(), rng(), rng() * Math.PI * 2, size * rs];
    const layer = rng();
    // Its place in the pocket's litter (detailGlsl.ts): lower down, older.
    const wet = pocket ? agePocketLeaf(layer, rng, cols) : fresh;
    for (let p = 0; p < np; p++) {
      const u = s.points[p * 2];
      const v = s.points[p * 2 + 1];
      const k = v0 + p;
      pos.set([u / rs, leafLift(u, v, form) / rs, -v / rs], k * 3);
      leafNormal(u, v, form, n);
      nor.set([n.x, n.y, n.z], k * 3);
      const onEdge = p < s.outline ? 1 : 0;
      const c = onEdge ? edge : inner;
      colr.set([c.r, c.g, c.b, wet], k * 4);
      leaf.set([u, v, onEdge, s.vein[p]], k * 4);
      leaf2.set([LATERAL_VEINS[kind], layer], k * 2);
      detail.set(home, k * 4);
    }
    for (const t of s.indices) index[ii++] = v0 + t;
    v0 += np;
    ends[li] = ii;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(colr, 4));
  g.setAttribute('aLeaf', new THREE.BufferAttribute(leaf, 4));
  g.setAttribute('aLeaf2', new THREE.BufferAttribute(leaf2, 2));
  g.setAttribute('aDetail', new THREE.BufferAttribute(detail, 4));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  const mesh = new THREE.Mesh(g, createLeafMaterial(pocket ? 'pocket' : 'detail'));
  // Placed around the worm in the shader.
  mesh.frustumCulled = false;
  // The pocket is under the top of the litter: drawn after it (drawOrder.ts).
  if (pocket) mesh.renderOrder = POCKET_ORDER;
  mesh.name = pocket ? 'pocketLeaves' : 'detailLeaves';
  let drawn = count;
  return {
    mesh,
    max: count,
    ends,
    get drawn() {
      return drawn;
    },
    setCount(c: number) {
      const k = Math.max(0, Math.min(count, Math.floor(c)));
      drawn = k;
      g.setDrawRange(0, k > 0 ? ends[k - 1] : 0);
      mesh.visible = k > 0;
    },
  };
}

/** The detail layer as the world holds it: built only when a preset first draws it. */
export interface DetailLayer<T extends DetailLeaves = DetailLeaves> {
  /** Always in the scene; holds the detail mesh once it is built. */
  readonly group: THREE.Group;
  /** The built layer, or null until the first setCount(n > 0). */
  readonly built: T | null;
  /** Leaves it builds: the most it can draw. */
  readonly max: number;
  /** Leaves drawn right now: 0 until the layer is first built and shown. */
  readonly drawn: number;
  /** Draws the first `n` leaves, building the layer on the first n > 0; hides it at 0. */
  setCount(n: number): void;
}

/**
 * The detail layer, built lazily: on Low (no detail leaves) neither the mesh, its material nor the
 * baked litter and ground textures it reads are ever made, which saves memory and start-up time on
 * the weakest machines. Switching up to a preset that draws it builds it then (a one-time hitch
 * while its shader compiles). `build` makes the leaves (the top's detail leaves by default; the
 * pocket's: pocketLeaves.ts).
 */
export function buildDetailLayer<T extends DetailLeaves = DetailLeaves>(
  count = scaledLeafCount(PRESETS.ultra.detail), build: (count: number) => T = (c) => buildDetailLeaves(c) as T,
  name = 'detailLayer',
): DetailLayer<T> {
  const group = new THREE.Group();
  group.name = name;
  let built: T | null = null;
  return {
    group,
    max: count,
    get drawn() {
      return built ? built.drawn : 0;
    },
    get built() {
      return built;
    },
    setCount(n: number) {
      if (!built) {
        if (n <= 0) return;
        built = build(count);
        group.add(built.mesh);
        if (built.beside) group.add(built.beside);
      }
      built.setCount(n);
    },
  };
}
