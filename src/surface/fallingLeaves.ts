import * as THREE from 'three';
import { mulberry32 } from '../core/random';
import type { Vec3 } from '../core/vec';
import { createLeafMaterial } from '../render/leafMaterial';
import type { LeafKind } from './leafLitter';
import { leafShape } from './leafShapes';
import { leafLift, leafNormal } from './leafForm';
import { leafTint, LATERAL_VEINS } from './leafPalette';

/** Falling leaves on Medium and High. */
export const FALLING_COUNT = 18;
/** Ultra's 1.5x; the mesh is built at this size and trimmed with a draw range. */
export const FALLING_MAX = 27;
/** Falling leaves come from the canopy overhead: maples and (aspen-shaped) birch leaves. */
const KINDS: readonly LeafKind[] = ['maple', 'aspen', 'maple', 'aspen', 'basswood'];

/**
 * A few leaves tumbling slowly down through the light around the camera, looping. Static
 * geometry in leaf-local space; all motion is in the vertex shader (shared uTime), so it
 * costs no CPU per frame. One draw.
 */
export interface FallingLeaves {
  mesh: THREE.Mesh;
  /** Draws the first `n` leaves. */
  setCount(n: number): void;
}

export function buildFallingLeaves(count = FALLING_MAX): FallingLeaves {
  const rng = mulberry32(2024);
  const kinds = Array.from({ length: count }, (_, i) => KINDS[i % KINDS.length]);
  let verts = 0;
  let idx = 0;
  for (const k of kinds) {
    verts += leafShape(k).points.length / 2;
    idx += leafShape(k).indices.length;
  }
  const pos = new Float32Array(verts * 3);
  const nor = new Float32Array(verts * 3);
  const colr = new Float32Array(verts * 4);
  const leaf = new Float32Array(verts * 4);
  const leaf2 = new Float32Array(verts * 2);
  const fall = new Float32Array(verts * 4);
  const index = new Uint16Array(idx);
  const ends = new Uint32Array(count);
  const inner = new THREE.Color();
  const edge = new THREE.Color();
  const stem = new THREE.Color();
  const n: Vec3 = { x: 0, y: 0, z: 0 };
  let v0 = 0;
  let ii = 0;
  kinds.forEach((kind, li) => {
    const s = leafShape(kind);
    const np = s.points.length / 2;
    const size = (kind === 'aspen' ? 0.38 : 0.55) * (0.85 + rng() * 0.3);
    const form = { fold: 0.2 + rng() * 0.2, cup: 0.2, curl: 0.15 + rng() * 0.2 };
    leafTint(kind, 0.05, rng, inner, edge, stem);
    const seed = (li + rng() * 0.8) / count;
    const spin = (rng() < 0.5 ? -1 : 1) * (0.35 + rng() * 0.45);
    const bx = rng();
    const bz = rng();
    for (let p = 0; p < np; p++) {
      const u = s.points[p * 2];
      const v = s.points[p * 2 + 1];
      const k = v0 + p;
      pos.set([u * size, leafLift(u, v, form) * size, -v * size], k * 3);
      leafNormal(u, v, form, n);
      nor.set([n.x, n.y, n.z], k * 3);
      const c = p < s.outline ? edge : inner;
      colr.set([c.r, c.g, c.b, 0], k * 4);
      leaf.set([u, v, p < s.outline ? 1 : 0, s.vein[p]], k * 4);
      leaf2.set([LATERAL_VEINS[kind], seed], k * 2);
      fall.set([seed, spin, bx, bz], k * 4);
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
  g.setAttribute('aFall', new THREE.BufferAttribute(fall, 4));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  const mesh = new THREE.Mesh(g, createLeafMaterial('falling'));
  // Positions are made in the shader around the camera.
  mesh.frustumCulled = false;
  mesh.name = 'fallingLeaves';
  return {
    mesh,
    setCount(n: number) {
      const k = Math.max(0, Math.min(count, Math.floor(n)));
      g.setDrawRange(0, k > 0 ? ends[k - 1] : 0);
    },
  };
}
