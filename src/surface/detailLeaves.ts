import * as THREE from 'three';
import { mulberry32 } from '../core/random';
import type { Vec3 } from '../core/vec';
import { createLeafMaterial } from '../render/leafMaterial';
import { PRESETS } from '../render/graphics';
import { LEAF_KINDS, type LeafKind } from './leafLitter';
import { detailShape } from './detailShape';
import { leafLift, leafNormal, type LeafForm } from './leafForm';
import { leafTint, LEAF_SIZE, LATERAL_VEINS } from './leafPalette';
import { scaleSpec } from './worldScale';
import { scaledLeafCount } from './leafScale';

export interface DetailLeaves {
  mesh: THREE.Mesh;
  /** Leaves built: the most it can draw. */
  readonly max: number;
  /** Leaves drawn right now (0 while hidden). */
  readonly drawn: number;
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
 * Smaller, more curled, higher-vertex leaves covering about 6 m around the worm (spec 5.5). One
 * static mesh in leaf-local space, built once: each leaf's home in a DETAIL_BOX world tile, its yaw
 * and radius are attributes, and the vertex shader places the copy nearest the worm (snapped to a
 * 1 m grid), so the CPU does no work as the worm moves. Positions are scaled so each leaf's
 * farthest vertex is 1 out, which makes aDetail.w its radius: the disturbance map moves it as one
 * piece of that radius, as it does the litter.
 */
export function buildDetailLeaves(count = scaledLeafCount(PRESETS.ultra.detail), seed = 3): DetailLeaves {
  const rng = mulberry32(seed);
  // The scale mode's leaf sizes (worldScale.ts): 1 in Classic. Pass the mode's count (scaledLeafCount).
  const grow = scaleSpec().leaf;
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
  const n: Vec3 = { x: 0, y: 0, z: 0 };
  const form: LeafForm = { fold: 0, cup: 0, curl: 0 };
  let v0 = 0;
  let ii = 0;
  kinds.forEach((kind, li) => {
    const s = detailShape(kind);
    const np = s.points.length / 2;
    // Small (0.6x the first cut): they are many and near the camera, and a leaf's cost is its
    // area on screen (the layer is fill-bound). `size` is the leaf's scale, 0.21 to 0.39 of its
    // species' LEAF_SIZE, times spec.leaf (in Classic 0.21 to 0.62 m, against the litter's 0.6 to
    // 1.9); its radius (aDetail.w, size times the shape's reach) is 0.11 to 0.385 m in Classic.
    const size = LEAF_SIZE[kind] * (0.21 + rng() * 0.18) * grow[kind];
    form.fold = 0.1 + rng() * 0.2;
    form.cup = 0.2 + rng() * (kind === 'oak' ? 0.5 : 0.3);
    form.curl = 0.2 + rng() * (kind === 'oak' ? 0.35 : 0.25);
    // The top of the litter: drier than the damp bottom layer.
    const wet = leafTint(kind, 0.03 + rng() * 0.03, rng, inner, edge, stem);
    const rs = reach(kind);
    const home = [rng(), rng(), rng() * Math.PI * 2, size * rs];
    const layer = rng();
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
  const mesh = new THREE.Mesh(g, createLeafMaterial('detail'));
  // Placed around the worm in the shader.
  mesh.frustumCulled = false;
  mesh.name = 'detailLeaves';
  let drawn = count;
  return {
    mesh,
    max: count,
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
export interface DetailLayer {
  /** Always in the scene; holds the detail mesh once it is built. */
  readonly group: THREE.Group;
  /** The built layer, or null until the first setCount(n > 0). */
  readonly built: DetailLeaves | null;
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
 * while its shader compiles).
 */
export function buildDetailLayer(count = scaledLeafCount(PRESETS.ultra.detail), seed = 3): DetailLayer {
  const group = new THREE.Group();
  group.name = 'detailLayer';
  let built: DetailLeaves | null = null;
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
        built = buildDetailLeaves(count, seed);
        group.add(built.mesh);
      }
      built.setCount(n);
    },
  };
}

