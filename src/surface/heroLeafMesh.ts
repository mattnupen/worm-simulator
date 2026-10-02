import * as THREE from 'three';
import type { Vec3 } from '../core/vec';
import { createLeafMaterial } from '../render/leafMaterial';
import { LEAF_KINDS } from './leafLitter';
import { detailShape } from './detailShape';
import { leafLift, leafNormal } from './leafForm';
import { HERO_FORM, LEAF_RIM } from './heroClearance';
import { leafTint, LATERAL_VEINS } from './leafPalette';
import { mulberry32 } from '../core/random';
import type { HeroLeaves } from './heroLeaves';

/** A leaf lying face down on the litter rests on its curled rim, sunk in a little: this much (per unit of size) higher. */
const FLIP_LIFT = 0.12;
/**
 * Per species, the highest point of the form (LEAF_RIM): a face-down leaf held over the worm
 * rests fully on its rim (raised this much per unit of size), so no part of it dips below the
 * plane the physics keeps clear of the body.
 */
const RIM = LEAF_RIM;
/** Over this lift (m) a face-down leaf is fully on its rim, and a leaf fully draped. */
const RIM_LIFT = 0.02;
/**
 * A leaf lying over the worm drapes: its cup and curl flatten this much (toward its base plane,
 * which the physics keeps clear of the body), so it rests on the worm instead of arching over it.
 */
const DRAPE = 0.8;

const pos = new THREE.Vector3();
const euler = new THREE.Euler(0, 0, 0, 'YZX');
const quat = new THREE.Quaternion();
const scale = new THREE.Vector3();
const press = new THREE.Matrix4();
const pitchAxis = new THREE.Vector3();
const pitchQ = new THREE.Quaternion();

/**
 * The instance matrix of hero leaf `i`, between its last two physics steps by `alpha`: scaled
 * to its size, flipped about its midrib, turned by its yaw, then tilted by its pitch (about the
 * horizontal axis across (sin pitchDir, cos pitchDir), so its far edge tips down away from the
 * body under it), at its position (raised onto its rim when face down; a leaf held over the
 * worm drapes, its cup flattening toward its base plane). Allocates nothing.
 */
export function heroLeafMatrix(p: HeroLeaves, i: number, alpha: number, out: THREE.Matrix4): THREE.Matrix4 {
  const flip = p.pflip[i] + (p.flip[i] - p.pflip[i]) * alpha;
  // The tilt as a ground vector (tan pitch toward pitchDir), interpolated: a leaf whose tilt
  // turns to the other side of the body between steps passes through level, never tipping
  // the old amount the new way.
  const t0 = Math.tan(p.ppitch[i]);
  const t1 = Math.tan(p.pitch[i]);
  const tx = t0 * Math.sin(p.ppitchDir[i]) + (t1 * Math.sin(p.pitchDir[i]) - t0 * Math.sin(p.ppitchDir[i])) * alpha;
  const tz = t0 * Math.cos(p.ppitchDir[i]) + (t1 * Math.cos(p.pitchDir[i]) - t0 * Math.cos(p.ppitchDir[i])) * alpha;
  const pitch = Math.atan(Math.sqrt(tx * tx + tz * tz));
  const held = Math.min(1, p.lift[i] / RIM_LIFT);
  // Only a leaf lying flat on either face drapes (one turning over keeps its shape).
  const level = Math.cos(flip);
  const flat = Math.max(p.pflat[i] + (p.flat[i] - p.pflat[i]) * alpha, DRAPE * held * level * level);
  const rim = FLIP_LIFT + (RIM[p.kind[i]] - FLIP_LIFT) * held;
  const lift = (1 - Math.cos(flip)) * 0.5 * rim * p.size[i] * (1 - flat);
  pos.set(
    p.px[i] + (p.x[i] - p.px[i]) * alpha,
    p.py[i] + (p.y[i] - p.py[i]) * alpha + lift,
    p.pz[i] + (p.z[i] - p.pz[i]) * alpha,
  );
  euler.set(0, p.pyaw[i] + (p.yaw[i] - p.pyaw[i]) * alpha, flip, 'YZX');
  quat.setFromEuler(euler);
  if (pitch !== 0) {
    // Turning (sin d, 0, cos d) about (cos d, 0, -sin d) by +pitch takes it downward.
    const d = Math.atan2(tx, tz);
    pitchAxis.set(Math.cos(d), 0, -Math.sin(d));
    pitchQ.setFromAxisAngle(pitchAxis, pitch);
    quat.premultiply(pitchQ);
  }
  scale.setScalar(p.size[i]);
  out.compose(pos, quat, scale);
  // Pressed flat: the leaf's own height (its cup and curl) shrinks, applied before everything else.
  if (flat > 0) out.multiply(press.makeScale(1, 1 - flat, 1));
  return out;
}

/**
 * All hero leaves in one instanced draw with the shared leaf material (species shapes, veins).
 * The geometry holds one leaf of every species; each instance shows only its own species (the
 * vertex shader collapses the others), so one draw covers them all. Matrices are rewritten from
 * the physics every rendered frame, interpolated by alpha; nothing is allocated.
 */
export class HeroLeafMesh {
  readonly mesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();

  constructor(pool: HeroLeaves) {
    const rng = mulberry32(17);
    let verts = 0;
    let idx = 0;
    for (const k of LEAF_KINDS) {
      verts += detailShape(k).points.length / 2;
      idx += detailShape(k).indices.length;
    }
    const pos = new Float32Array(verts * 3);
    const nor = new Float32Array(verts * 3);
    const colr = new Float32Array(verts * 4);
    const leaf = new Float32Array(verts * 4);
    const leaf2 = new Float32Array(verts * 2);
    const kindAttr = new Float32Array(verts);
    const index = new Uint16Array(idx);
    const inner = new THREE.Color();
    const edge = new THREE.Color();
    const stem = new THREE.Color();
    const n: Vec3 = { x: 0, y: 0, z: 0 };
    let v0 = 0;
    let ii = 0;
    LEAF_KINDS.forEach((kind, ki) => {
      const s = detailShape(kind);
      const np = s.points.length / 2;
      const wet = leafTint(kind, 0.05, rng, inner, edge, stem);
      for (let p = 0; p < np; p++) {
        const u = s.points[p * 2];
        const v = s.points[p * 2 + 1];
        const k = v0 + p;
        pos.set([u, leafLift(u, v, HERO_FORM), -v], k * 3);
        leafNormal(u, v, HERO_FORM, n);
        nor.set([n.x, n.y, n.z], k * 3);
        const onEdge = p < s.outline ? 1 : 0;
        const c = onEdge ? edge : inner;
        colr.set([c.r, c.g, c.b, wet], k * 4);
        leaf.set([u, v, onEdge, s.vein[p]], k * 4);
        leaf2.set([LATERAL_VEINS[kind], 0.5], k * 2);
        kindAttr[k] = ki;
      }
      for (const t of s.indices) index[ii++] = v0 + t;
      v0 += np;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(colr, 4));
    g.setAttribute('aLeaf', new THREE.BufferAttribute(leaf, 4));
    g.setAttribute('aLeaf2', new THREE.BufferAttribute(leaf2, 2));
    g.setAttribute('aKind', new THREE.BufferAttribute(kindAttr, 1));
    const heroKind = new Float32Array(pool.max);
    for (let i = 0; i < pool.max; i++) heroKind[i] = pool.kind[i];
    g.setAttribute('aHeroKind', new THREE.InstancedBufferAttribute(heroKind, 1));
    g.setIndex(new THREE.BufferAttribute(index, 1));

    this.mesh = new THREE.InstancedMesh(g, createLeafMaterial('hero'), pool.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const tint = new THREE.Color();
    for (let i = 0; i < pool.max; i++) this.mesh.setColorAt(i, tint.setScalar(0.85 + 0.3 * rng()));
    // Placed every frame from the physics; the instance bounds are never recomputed.
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.name = 'heroLeaves';
  }

  /** Writes every active leaf's matrix, between the last two physics steps by `alpha`. */
  update(p: HeroLeaves, alpha: number): void {
    for (let i = 0; i < p.count; i++) this.mesh.setMatrixAt(i, heroLeafMatrix(p, i, alpha, this.m));
    this.mesh.count = p.count;
    this.mesh.visible = p.count > 0;
    if (p.count > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
