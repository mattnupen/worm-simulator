import * as THREE from 'three';
import type { Vec3 } from '../core/vec';
import type { LeafKind } from './leafLitter';
import type { LeafShape } from './leafShapes';
import { leafLift, leafNormal, type LeafForm } from './leafForm';
import { litterTopHeight } from './litterDepth';

/** Petiole: two extra vertices per leaf (one thin triangle off the blade's base). */
export const PETIOLE_VERTS = 2;
const PETIOLE: Record<LeafKind, number> = { maple: 0.32, oak: 0.08, aspen: 0.3, basswood: 0.22, ash: 0.07 };
/**
 * A litter vertex the rendered ground would hide rests this far above it instead (the static drape
 * in LeafBuffers.write)...
 */
export const DRAPE_FLOOR = 0.003;
/**
 * ...plus this much of its leaf's rest height, so the draped parts of overlapping leaves keep their
 * layer order and never z-fight (rests differ per leaf).
 */
export const DRAPE_FLOOR_LAYER = 0.1;

/** Everything about one litter leaf except its silhouette, worked out once at build time. */
export interface LeafLook {
  kind: LeafKind;
  /** Height of the leaf's rest plane above the rendered ground (litterTopHeight). */
  rest: number;
  /** Leaf-local (u, lift, -v) to world. */
  m: THREE.Matrix4;
  q: THREE.Quaternion;
  form: LeafForm;
  inner: THREE.Color;
  edge: THREE.Color;
  petiole: THREE.Color;
  wet: number;
  lateral: number;
  seed: number;
}

const tmp = new THREE.Vector3();
const nrm = new THREE.Vector3();
const n: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Typed buffers for a merged leaf mesh with the leaf material's attributes (position, normal,
 * aColor, aLeaf, aLeaf2), filled one leaf at a time. Positions are relative to an origin (a
 * chunk's centre). The litter never reacts to the worm (it lies over it), so it carries no drape
 * attributes: only the pocket's leaves drape, from their own anchors (detailGlsl.ts).
 * `ends[i]` is the index count after leaf i, so a draw range can show any prefix of whole leaves.
 * Also keeps the world x, z box of every vertex written. Build-time only.
 */
export class LeafBuffers {
  readonly pos: Float32Array;
  readonly nor: Float32Array;
  readonly colr: Float32Array;
  readonly leaf: Float32Array;
  readonly leaf2: Float32Array;
  readonly index: Uint16Array | Uint32Array;
  readonly ends: Uint32Array;
  /** World x, z box of the written vertices (min x, min z, max x, max z); empty until a write. */
  readonly box = [Infinity, Infinity, -Infinity, -Infinity];
  private v0 = 0;
  private ii = 0;
  private count = 0;

  constructor(verts: number, indices: number, leaves: number) {
    this.pos = new Float32Array(verts * 3);
    this.nor = new Float32Array(verts * 3);
    this.colr = new Float32Array(verts * 4);
    this.leaf = new Float32Array(verts * 4);
    this.leaf2 = new Float32Array(verts * 2);
    this.index = verts > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
    this.ends = new Uint32Array(leaves);
  }

  /** Vertices and indices one leaf of `shape` needs. */
  static size(shape: LeafShape, petiole: boolean): { verts: number; indices: number } {
    return {
      verts: shape.points.length / 2 + (petiole ? PETIOLE_VERTS : 0),
      indices: shape.indices.length + (petiole ? 3 : 0),
    };
  }

  /** One vertex: leaf-local (u, h, v) placed by the look, stored relative to (ox, 0, oz). */
  private put(k: number, look: LeafLook, u: number, v: number, h: number, nx: number, ny: number, nz: number, ox: number, oz: number): void {
    tmp.set(u, h, -v).applyMatrix4(look.m);
    this.pos[k * 3] = tmp.x - ox;
    this.pos[k * 3 + 1] = tmp.y;
    this.pos[k * 3 + 2] = tmp.z - oz;
    nrm.set(nx, ny, nz).applyQuaternion(look.q);
    this.nor[k * 3] = nrm.x;
    this.nor[k * 3 + 1] = nrm.y;
    this.nor[k * 3 + 2] = nrm.z;
    this.leaf2[k * 2] = look.lateral;
    this.leaf2[k * 2 + 1] = look.seed;
  }

  private colour(k: number, c: THREE.Color, wet: number, u: number, v: number, r: number, vein: number): void {
    this.colr[k * 4] = c.r;
    this.colr[k * 4 + 1] = c.g;
    this.colr[k * 4 + 2] = c.b;
    this.colr[k * 4 + 3] = wet;
    this.leaf[k * 4] = u;
    this.leaf[k * 4 + 1] = v;
    this.leaf[k * 4 + 2] = r;
    this.leaf[k * 4 + 3] = vein;
  }

  /** Writes one leaf of `shape` (with a petiole or not), positions relative to (ox, 0, oz). */
  write(look: LeafLook, shape: LeafShape, petiole: boolean, ox: number, oz: number): void {
    const pts = shape.points;
    const np = pts.length / 2;
    const v0 = this.v0;
    for (let p = 0; p < np; p++) {
      const u = pts[p * 2];
      const v = pts[p * 2 + 1];
      leafNormal(u, v, look.form, n);
      const k = v0 + p;
      this.put(k, look, u, v, leafLift(u, v, look.form), n.x, n.y, n.z, ox, oz);
      const onEdge = p < shape.outline ? 1 : 0;
      this.colour(k, onEdge ? look.edge : look.inner, look.wet, u, v, onEdge, shape.vein[p]);
    }
    for (let t = 0; t < shape.indices.length; t++) this.index[this.ii++] = v0 + shape.indices[t];
    let added = np;
    if (petiole) {
      // A thin sliver from the blade's base, curving a touch up off the ground.
      const bu = pts[shape.base * 2];
      const bv = pts[shape.base * 2 + 1];
      const len = PETIOLE[look.kind];
      const half = 0.012 + len * 0.03;
      const bh = leafLift(bu, bv, look.form);
      for (let e = 0; e < PETIOLE_VERTS; e++) {
        const k = v0 + np + e;
        const u = e === 0 ? bu + half : bu + 0.004;
        const v = e === 0 ? bv - 0.02 : bv - len;
        this.put(k, look, u, v, bh + (e === 0 ? 0.005 : 0.03 + len * 0.1), 0, 1, 0, ox, oz);
        this.colour(k, look.petiole, look.wet, u, v, 0.5, 1);
      }
      this.index[this.ii++] = v0 + shape.base;
      this.index[this.ii++] = v0 + np;
      this.index[this.ii++] = v0 + np + 1;
      added += PETIOLE_VERTS;
    }
    const box = this.box;
    for (let k = v0; k < v0 + added; k++) {
      const wx = this.pos[k * 3] + ox;
      const wz = this.pos[k * 3 + 2] + oz;
      box[0] = Math.min(box[0], wx);
      box[1] = Math.min(box[1], wz);
      box[2] = Math.max(box[2], wx);
      box[3] = Math.max(box[3], wz);
    }
    // Where the ground under a vertex rises past the leaf's plane (a hollow, the foot of a mound,
    // a big leaf's far ends), the vertex lies on the ground instead: a static drape. Only vertices
    // that were below the ground move, so a leaf that already clears it is written unchanged.
    const floor = DRAPE_FLOOR + DRAPE_FLOOR_LAYER * look.rest;
    for (let k = v0; k < v0 + added; k++) {
      const wx = this.pos[k * 3] + ox;
      const wz = this.pos[k * 3 + 2] + oz;
      const ground = litterTopHeight(wx, wz);
      if (this.pos[k * 3 + 1] < ground) this.pos[k * 3 + 1] = ground + floor;
    }
    this.v0 += added;
    this.ends[this.count++] = this.ii;
  }

  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.colr, 4));
    g.setAttribute('aLeaf', new THREE.BufferAttribute(this.leaf, 4));
    g.setAttribute('aLeaf2', new THREE.BufferAttribute(this.leaf2, 2));
    g.setIndex(new THREE.BufferAttribute(this.index, 1));
    return g;
  }
}
