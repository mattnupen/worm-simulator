import * as THREE from 'three';
import { mulberry32 } from '../core/random';
import type { Vec3 } from '../core/vec';
import { createLeafMaterial } from '../render/leafMaterial';
import { placeLeaves, type LeafKind } from './leafLitter';
import { leafShape } from './leafShapes';
import { leafLift, leafNormal, type LeafForm } from './leafForm';
import { leafTint, LEAF_SIZE, LATERAL_VEINS } from './leafPalette';
import { terrainHeight, terrainNormal, WORLD_HALF } from './terrain';
import { makeShadeAt } from './treeShadows';
import { sharedLighting } from '../render/paintedMaterial';

/** Petiole: two extra vertices per leaf (one thin triangle off the blade's base). */
const PETIOLE_VERTS = 2;
const PETIOLE: Record<LeafKind, number> = { maple: 0.32, oak: 0.08, aspen: 0.3, basswood: 0.22, ash: 0.07 };

export interface LeafLitter {
  mesh: THREE.Mesh;
  /** Leaves built: the most it can draw. */
  readonly max: number;
  /** Draws the first `n` leaves (the order is random, so any prefix is an even thinning). */
  setCount(n: number): void;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * The whole leaf litter as ONE merged, static mesh (one draw, no per-instance cost):
 * species silhouettes with a midrib fold, cup and curl, tinted per leaf and lying on the
 * terrain in loose overlapping layers. Presets trim it with a draw range (no rebuild).
 */
export function buildLeafLitter(count: number, seed = 1): LeafLitter {
  const leaves = placeLeaves(count, WORLD_HALF, seed);
  let verts = 0;
  let idxCount = 0;
  for (const l of leaves) {
    const s = leafShape(l.kind);
    verts += s.points.length / 2 + PETIOLE_VERTS;
    idxCount += s.indices.length + 3;
  }
  const pos = new Float32Array(verts * 3);
  const nor = new Float32Array(verts * 3);
  const colr = new Float32Array(verts * 4);
  const leafAttr = new Float32Array(verts * 4);
  const leaf2 = new Float32Array(verts * 2);
  const index = verts > 65535 ? new Uint32Array(idxCount) : new Uint16Array(idxCount);
  const ends = new Uint32Array(count);

  // Extra per-leaf variety from a second stream, so placeLeaves' layout stays as seeded.
  const rng = mulberry32(seed * 7919 + 13);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const slope = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const nrm = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const n: Vec3 = { x: 0, y: 0, z: 0 };
  const form: LeafForm = { fold: 0, cup: 0, curl: 0 };
  const inner = new THREE.Color();
  const edge = new THREE.Color();
  const petiole = new THREE.Color();
  const shadeAt = makeShadeAt(sharedLighting.uLightDir.value);

  let v0 = 0;
  let ii = 0;
  leaves.forEach((l, li) => {
    const shape = leafShape(l.kind);
    const pts = shape.points;
    const np = pts.length / 2;
    const size = l.scale * LEAF_SIZE[l.kind];
    // Dry oak curls hardest; big leaves lie flatter, so no edge rises much over ~0.12.
    const flat = Math.min(1, 0.9 / size);
    form.fold = (0.04 + rng() * 0.2) * flat;
    form.cup = rng() * (l.kind === 'oak' ? 0.6 : 0.3) * flat;
    form.curl = rng() * (l.kind === 'oak' ? 0.45 : 0.25) * flat;
    const wet = leafTint(l.kind, l.y, rng, inner, edge, petiole);
    // Long trunk shadows, baked.
    const shade = shadeAt(l.x, l.z);
    inner.multiplyScalar(shade);
    edge.multiplyScalar(shade);
    petiole.multiplyScalar(shade);
    const lateral = LATERAL_VEINS[l.kind];
    const leafSeed = rng();

    const tn = terrainNormal(l.x, l.z);
    slope.setFromUnitVectors(UP, nrm.set(tn.x, tn.y, tn.z));
    q.setFromEuler(euler.set(l.tilt * 0.3, l.rotY, 0)).premultiply(slope);
    // Loose layers: each leaf at its own small height, so overlaps never z-fight.
    const lift = 0.006 + l.y * 0.4;
    tmp.set(l.x, terrainHeight(l.x, l.z) + lift, l.z);
    m.compose(tmp, q, scl.setScalar(size));

    const put = (k: number, u: number, v: number, h: number, nx: number, ny: number, nz: number) => {
      tmp.set(u, h, -v).applyMatrix4(m);
      pos.set([tmp.x, tmp.y, tmp.z], k * 3);
      nrm.set(nx, ny, nz).applyQuaternion(q);
      nor.set([nrm.x, nrm.y, nrm.z], k * 3);
      leaf2[k * 2] = lateral;
      leaf2[k * 2 + 1] = leafSeed;
    };
    for (let p = 0; p < np; p++) {
      const u = pts[p * 2];
      const v = pts[p * 2 + 1];
      leafNormal(u, v, form, n);
      const k = v0 + p;
      put(k, u, v, leafLift(u, v, form), n.x, n.y, n.z);
      const onEdge = p < shape.outline ? 1 : 0;
      const c = onEdge ? edge : inner;
      colr.set([c.r, c.g, c.b, wet], k * 4);
      leafAttr.set([u, v, onEdge, shape.vein[p]], k * 4);
    }
    // Petiole: a thin sliver from the blade's base, curving a touch up off the ground.
    const bu = pts[shape.base * 2];
    const bv = pts[shape.base * 2 + 1];
    const len = PETIOLE[l.kind];
    const half = 0.012 + len * 0.03;
    const bh = leafLift(bu, bv, form);
    for (let e = 0; e < PETIOLE_VERTS; e++) {
      const k = v0 + np + e;
      const u = e === 0 ? bu + half : bu + 0.004;
      const v = e === 0 ? bv - 0.02 : bv - len;
      put(k, u, v, bh + (e === 0 ? 0.005 : 0.03 + len * 0.1), 0, 1, 0);
      colr.set([petiole.r, petiole.g, petiole.b, wet], k * 4);
      leafAttr.set([u, v, 0.5, 1], k * 4);
    }
    for (let t = 0; t < shape.indices.length; t++) index[ii++] = v0 + shape.indices[t];
    index[ii++] = v0 + shape.base;
    index[ii++] = v0 + np;
    index[ii++] = v0 + np + 1;
    v0 += np + PETIOLE_VERTS;
    ends[li] = ii;
  });

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(colr, 4));
  g.setAttribute('aLeaf', new THREE.BufferAttribute(leafAttr, 4));
  g.setAttribute('aLeaf2', new THREE.BufferAttribute(leaf2, 2));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, createLeafMaterial());
  mesh.name = 'leafLitter';
  return {
    mesh,
    max: count,
    setCount(n: number) {
      const k = Math.max(0, Math.min(count, Math.floor(n)));
      g.setDrawRange(0, k > 0 ? ends[k - 1] : 0);
    },
  };
}
