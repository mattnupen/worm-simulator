import * as THREE from 'three';
import {
  LAYERS, LOBE, PIECE, SEG, WALL, grooveAt, headLift, headScale, segLength, segRadius, squeezeAt,
} from './shapes';

/** Rings per segment, rings in all (lobe included), and points round half the body. */
export const RPS = 8;
export const RINGS = Math.round((PIECE + LOBE) * RPS) + 1;
const AROUND = 24;
/** The tail end of the piece sits here (mm); the head reaches forward from it. */
export const TAIL_X = -(PIECE * SEG) / 2;

const COLORS = {
  back: new THREE.Color('#5e2a32'),
  front: new THREE.Color('#45161f'),
  belly: new THREE.Color('#e2bf9f'),
  lobe: new THREE.Color('#7a3a40'),
  circular: new THREE.Color('#b9474f'),
  longitudinal: new THREE.Color('#d98a84'),
  lining: new THREE.Color('#d6a49a'),
};

/**
 * The worm piece's body as one smooth tube: ring k sits at q = -LOBE + k / RPS. Each frame the
 * squeeze wave sets every ring's radius and spacing, so the bulge flows from segment to segment.
 * Drawn as the far half (outer skin, inner lining) with the cut faces' three layers top and
 * bottom; the near half's skin is a second mesh, shown when the body is drawn whole.
 */
export class WormBody {
  /** Per ring: where along the body (segments), its x (mm), radius, centre lift and squeeze. */
  readonly q = new Float64Array(RINGS);
  readonly x = new Float64Array(RINGS);
  readonly r = new Float64Array(RINGS);
  readonly lift = new Float64Array(RINGS);
  readonly s = new Float64Array(RINGS);
  readonly far: THREE.Mesh;
  readonly near: THREE.Mesh;
  private readonly tmpBack = new THREE.Color();

  constructor() {
    for (let k = 0; k < RINGS; k++) this.q[k] = -LOBE + k / RPS;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide });
    this.far = tubeMesh(RINGS * ((AROUND + 1) * 2 + 12), mat, (c) => this.farIndices(c));
    this.near = tubeMesh(RINGS * (AROUND + 1), mat, (c) => this.nearIndices(c));
    this.near.visible = false;
  }

  /** Poses the body `phase` waves in. */
  pose(phase: number): void {
    const { q, x, r, lift, s } = this;
    for (let k = 0; k < RINGS; k++) s[k] = squeezeAt(q[k], phase);
    x[RINGS - 1] = TAIL_X;
    for (let k = RINGS - 2; k >= 0; k--) x[k] = x[k + 1] + (segLength((s[k] + s[k + 1]) / 2) / RPS);
    for (let k = 0; k < RINGS; k++) {
      r[k] = segRadius(s[k]) * headScale(q[k]) * grooveAt(q[k]);
      lift[k] = headLift(q[k]);
    }
    this.writeFar();
    if (this.near.visible) this.writeNear();
  }

  /** The ring nearest q. */
  ringAt(q: number): number {
    return Math.max(0, Math.min(RINGS - 1, Math.round((q + LOBE) * RPS)));
  }

  private writeFar(): void {
    const attr = this.far.geometry.getAttribute('position') as THREE.BufferAttribute;
    const p = attr.array as Float32Array;
    let o = 0;
    for (let k = 0; k < RINGS; k++) {
      const x = this.x[k];
      const r = this.r[k];
      const lift = this.lift[k];
      for (const rad of [r, Math.max(0, r - WALL)]) {
        for (let j = 0; j <= AROUND; j++) {
          const th = (j / AROUND) * Math.PI;
          p[o++] = x; p[o++] = lift + rad * Math.cos(th); p[o++] = -rad * Math.sin(th);
        }
      }
      // The cut faces: three layers each, top (y > 0) and bottom.
      for (const sign of [1, -1]) {
        let at = r;
        for (const t of LAYERS) {
          const next = Math.max(0, at - t);
          p[o++] = x; p[o++] = lift + sign * at; p[o++] = 0;
          p[o++] = x; p[o++] = lift + sign * next; p[o++] = 0;
          at = next;
        }
      }
    }
    attr.needsUpdate = true;
    this.far.geometry.computeVertexNormals();
  }

  private writeNear(): void {
    const attr = this.near.geometry.getAttribute('position') as THREE.BufferAttribute;
    const p = attr.array as Float32Array;
    let o = 0;
    for (let k = 0; k < RINGS; k++) {
      for (let j = 0; j <= AROUND; j++) {
        const th = (j / AROUND) * Math.PI;
        p[o++] = this.x[k]; p[o++] = this.lift[k] + this.r[k] * Math.cos(th); p[o++] = this.r[k] * Math.sin(th);
      }
    }
    attr.needsUpdate = true;
    this.near.geometry.computeVertexNormals();
  }

  /** Skin colour round the body: dark back, pale belly; the lobe a little redder. */
  private skin(k: number, j: number, out: THREE.Color): THREE.Color {
    // Darkest at the front, as on the model (src/anatomy/body.ts).
    const back = this.tmpBack.copy(COLORS.front).lerp(COLORS.back, Math.min(1, Math.max(0, this.q[k] / 10)));
    out.copy(COLORS.belly).lerp(back, (1 + Math.cos((j / AROUND) * Math.PI)) / 2);
    return this.q[k] < 0 ? out.lerp(COLORS.lobe, 0.4) : out;
  }

  private farIndices(color: THREE.BufferAttribute): number[] {
    const idx: number[] = [];
    const c = color.array as Float32Array;
    const per = (AROUND + 1) * 2 + 12;
    const tmp = new THREE.Color();
    for (let k = 0; k < RINGS; k++) {
      const base = k * per;
      for (let side = 0; side < 2; side++) {
        for (let j = 0; j <= AROUND; j++) {
          const v = base + side * (AROUND + 1) + j;
          (side === 0 ? this.skin(k, j, tmp) : tmp.copy(COLORS.lining)).toArray(c, v * 3);
          if (k === RINGS - 1 || j === AROUND) continue;
          idx.push(v, v + per, v + 1, v + 1, v + per, v + per + 1);
        }
      }
      for (let f = 0; f < 6; f++) {
        const v = base + (AROUND + 1) * 2 + f * 2;
        const layer = f % 3;
        const col = layer === 0 ? (f < 3 ? COLORS.back : COLORS.belly) : layer === 1 ? COLORS.circular : COLORS.longitudinal;
        col.toArray(c, v * 3);
        col.toArray(c, (v + 1) * 3);
        if (k === RINGS - 1) continue;
        idx.push(v, v + per, v + 1, v + 1, v + per, v + 1 + per);
      }
    }
    return idx;
  }

  private nearIndices(color: THREE.BufferAttribute): number[] {
    const idx: number[] = [];
    const c = color.array as Float32Array;
    const per = AROUND + 1;
    const tmp = new THREE.Color();
    for (let k = 0; k < RINGS; k++) {
      for (let j = 0; j <= AROUND; j++) {
        const v = k * per + j;
        this.skin(k, j, tmp).toArray(c, v * 3);
        if (k === RINGS - 1 || j === AROUND) continue;
        idx.push(v, v + per, v + 1, v + 1, v + per, v + per + 1);
      }
    }
    return idx;
  }
}

/** A mesh whose positions change every frame and whose colours and triangles never do. */
function tubeMesh(verts: number, mat: THREE.Material, indices: (c: THREE.BufferAttribute) => number[]): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(verts * 3), 3);
  pos.setUsage(THREE.DynamicDrawUsage);
  const col = new THREE.BufferAttribute(new Float32Array(verts * 3), 3);
  geo.setAttribute('position', pos);
  geo.setAttribute('color', col);
  geo.setIndex(indices(col));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

