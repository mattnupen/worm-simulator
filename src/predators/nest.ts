import * as THREE from 'three';
import { createPropMaterial } from '../render/propMaterial';
import { UNITS_PER_CM } from '../surface/realScale';
import { MeshWriter } from '../surface/meshWriter';
import { writeBranch, writeCup } from './nestShape';
import { GAPE, HEAD_ABOVE, NECK_BASE, NESTLING_PARTS, type NestlingPartName } from './nestlingShape';
import { WormCarry } from './wormCarry';

/**
 * The nest scene's mesh (V4): the cup on its maple branch, three nestlings, and the worm the robin
 * carries, all in one mesh on the forest props' painted material (one draw, no new program). The
 * mesh sits at the nest (`place`), scaled from centimetres; the cup and branch never change, the
 * nestlings' parts are rewritten from their poses like the robin's, and the worm is rewritten
 * along its rope (wormCarry.ts). Drawn only while the scene plays. Allocates nothing per frame.
 */

/** One nestling: how far it stretches up to beg (0..1), its mouth (0 shut, 1 wide), lean and wobble (radians). */
export interface NestlingPose {
  stretch: number;
  open: number;
  /** Positive: toward the parent on the rim (+z). */
  lean: number;
  sway: number;
}

/** Where each nestling sits in the cup (nest frame, cm), which way it faces, and its size. */
export const NESTLINGS: readonly { x: number; y: number; z: number; yaw: number; size: number }[] = [
  { x: 0.3, y: 1.3, z: 1.0, yaw: 0.4, size: 1.0 },
  { x: -2.4, y: 1.7, z: -1.9, yaw: 0.8, size: 0.95 },
  { x: 2.5, y: 1.7, z: -1.6, yaw: 0.1, size: 0.96 },
];

interface Part { start: number; count: number; matrix: THREE.Matrix4 }

/** Inside a nestling's head, behind its gape (head frame, cm): where a fed worm goes out of sight. */
const MOUTH_INNER = [0, -0.9, -0.2] as const;

export class Nest {
  readonly mesh: THREE.Mesh;
  readonly chicks: NestlingPose[] = NESTLINGS.map(() => ({ stretch: 0, open: 0, lean: 0, sway: 0 }));
  /** The carried worm (nest frame). */
  readonly worm: WormCarry;
  private readonly parts: Part[][] = [];
  private readonly restPos: Float32Array;
  private readonly restNor: Float32Array;
  private readonly place0 = NESTLINGS.map(() => new THREE.Matrix4());
  private readonly body = new THREE.Matrix4();
  private readonly neck = new THREE.Matrix4();
  private readonly m = new THREE.Matrix4();
  private readonly n = new THREE.Matrix3();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly toLocal = new THREE.Matrix4();

  constructor() {
    const w = new MeshWriter('aProp', 4);
    writeCup(w);
    writeBranch(w);
    for (let i = 0; i < NESTLINGS.length; i++) {
      const list: Part[] = [];
      for (const name of Object.keys(NESTLING_PARTS) as NestlingPartName[]) {
        const start = w.vertexCount;
        NESTLING_PARTS[name](w);
        list.push({ start, count: w.vertexCount - start, matrix: new THREE.Matrix4() });
      }
      this.parts.push(list);
      const c = NESTLINGS[i];
      this.place0[i].makeRotationY(c.yaw).scale(this.v.set(c.size, c.size, c.size)).setPosition(c.x, c.y, c.z);
    }
    this.worm = new WormCarry(w);
    const geometry = w.toGeometry();
    for (const name of ['position', 'normal'] as const) (geometry.getAttribute(name) as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    this.restPos = Float32Array.from(geometry.getAttribute('position').array as Float32Array);
    this.restNor = Float32Array.from(geometry.getAttribute('normal').array as Float32Array);
    this.mesh = new THREE.Mesh(geometry, createPropMaterial());
    this.mesh.name = 'robinNest';
    // The worm flies with the robin from the forest floor: the mesh is never culled as a whole.
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  get vertexCount(): number {
    return this.restPos.length / 3;
  }

  /** How many vertices are rewritten each frame (the nestlings and the worm). */
  get movingVertexCount(): number {
    let n = this.worm.count;
    for (const list of this.parts) for (const p of list) n += p.count;
    return n;
  }

  /** Puts the nest at (x, y, z) world units, its branch pointing out along `yaw` (0 = +z). */
  place(x: number, y: number, z: number, yaw: number): void {
    const s = UNITS_PER_CM;
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.set(0, yaw, 0);
    this.mesh.scale.set(s, s, s);
    this.mesh.updateMatrixWorld(true);
    this.toLocal.copy(this.mesh.matrixWorld).invert();
  }

  /** A world point into the nest frame (cm), in place. */
  toNest(p: THREE.Vector3): THREE.Vector3 {
    return p.applyMatrix4(this.toLocal);
  }

  /** A nest-frame point (cm) into world units, in place. */
  toWorld(p: THREE.Vector3): THREE.Vector3 {
    return p.applyMatrix4(this.mesh.matrixWorld);
  }

  /** Poses the nestlings and writes them and the worm. Call once per drawn frame while it shows (`posed`: poseChicks already ran this frame). */
  update(posed = false): void {
    if (!posed) this.poseChicks();
    for (const list of this.parts) for (const part of list) this.write(part);
    this.worm.write(this.mesh.geometry);
    (this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.mesh.geometry.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
  }

  /**
   * Nestling `i`'s open mouth as posed now (nest frame, cm): the middle of its gape between the
   * open halves of the bill into `mouth`, and a point inside its head behind it into `inner` (the
   * way down its throat). After poseChicks.
   */
  mouth(i: number, mouth: THREE.Vector3, inner: THREE.Vector3): void {
    const head = this.parts[i][2].matrix;
    const [, gy, gz] = GAPE;
    const a = 1.2 * this.chicks[i].open;
    // A third of the way out along each half of the bill: the upper as built, the lower dropped open.
    const ly = -0.03 * Math.cos(a) - 0.77 * Math.sin(a);
    const lz = -0.03 * Math.sin(a) + 0.77 * Math.cos(a);
    mouth.set(0, gy + (0.03 + ly) / 2, gz + (0.84 + lz) / 2).applyMatrix4(head);
    inner.set(0, MOUTH_INNER[1], MOUTH_INNER[2]).applyMatrix4(head);
  }

  /** Works out every nestling part's matrix from its pose (no vertices written). */
  poseChicks(): void {
    for (let i = 0; i < this.chicks.length; i++) {
      const p = this.chicks[i];
      const [body, neck, head, lower] = this.parts[i];
      // The body tips its front up a little as the nestling reaches, and rocks with its wobble.
      this.m.makeRotationFromEuler(this.e.set(-0.22 * p.stretch, 0, 0.25 * p.sway, 'YXZ'));
      this.body.multiplyMatrices(this.place0[i], this.m);
      body.matrix.copy(this.body);
      // The neck from the shoulders: bent forward at rest (the head lies on the body), straight up
      // to beg, and longer: nestlings stretch their necks as far as they go.
      const len = 0.9 + 2.3 * p.stretch;
      const bend = 1.15 * (1 - p.stretch) + p.lean;
      this.m.makeRotationFromEuler(this.e.set(bend, 0, p.sway, 'YXZ'));
      this.m.setPosition(NECK_BASE[0], NECK_BASE[1], NECK_BASE[2]);
      this.neck.multiplyMatrices(this.body, this.m);
      neck.matrix.copy(this.neck).multiply(this.m.makeScale(1, len, 1));
      // The head on the neck's tip: the bill forward and down at rest, pointing up (and a little
      // toward the parent) to beg.
      const pitch = 0.35 * (1 - p.stretch) - 1.5 * p.stretch - bend + 0.25 * p.lean;
      this.m.makeRotationFromEuler(this.e.set(pitch, 0, 0, 'YXZ'));
      this.m.setPosition(0, len + HEAD_ABOVE, 0);
      head.matrix.multiplyMatrices(this.neck, this.m);
      // The lower bill drops open at its hinge: a nestling's gape is very wide.
      this.about(lower.matrix, head.matrix, 1.2 * p.open);
    }
  }

  /** out = parent · (turn by `angle` round x at the gape). */
  private about(out: THREE.Matrix4, parent: THREE.Matrix4, angle: number): void {
    const [, py, pz] = GAPE;
    this.m.makeRotationX(angle);
    const e = this.m.elements;
    e[13] = py - (e[5] * py + e[9] * pz);
    e[14] = pz - (e[6] * py + e[10] * pz);
    out.multiplyMatrices(parent, this.m);
  }

  private write(part: Part): void {
    const geometry = this.mesh.geometry;
    const out = (geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    const outN = (geometry.getAttribute('normal') as THREE.BufferAttribute).array as Float32Array;
    const rp = this.restPos;
    const rn = this.restNor;
    const e = part.matrix.elements;
    // The neck's stretch is a non-uniform scale: normals go through the inverse transpose.
    const ne = this.n.getNormalMatrix(part.matrix).elements;
    const end = (part.start + part.count) * 3;
    for (let i = part.start * 3; i < end; i += 3) {
      const x = rp[i], y = rp[i + 1], z = rp[i + 2];
      out[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
      out[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      out[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const a = rn[i], b = rn[i + 1], c = rn[i + 2];
      const nx = ne[0] * a + ne[3] * b + ne[6] * c;
      const ny = ne[1] * a + ne[4] * b + ne[7] * c;
      const nz = ne[2] * a + ne[5] * b + ne[8] * c;
      const l = 1 / (Math.hypot(nx, ny, nz) || 1);
      outN[i] = nx * l; outN[i + 1] = ny * l; outN[i + 2] = nz * l;
    }
  }
}
