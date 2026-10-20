import * as THREE from 'three';
import { createPropMaterial } from '../render/propMaterial';
import { UNITS_PER_CM } from '../surface/realScale';
import { MeshWriter } from '../surface/meshWriter';
import { PIVOTS, ROBIN_PARTS, type RobinPartName } from './robinShape';

/**
 * The robin (V4): one mesh built at load, its parts (body, head, bill, wings, tail, legs) moved
 * by rewriting their vertices from a pose each frame, like the opening's actors. One draw, on the
 * forest props' painted material (the same program as the ground props: nothing new compiles).
 * Allocates nothing per frame.
 */

/** Where the robin is and what it is doing. Angles in radians, lengths in centimetres. */
export interface RobinPose {
  /** Between its feet, on the ground (world units), and the way it faces (0 = +z). */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Off the ground (cm): a hop or flight. */
  lift: number;
  /** 0 standing tall, 1 legs bent (before a hop, landing). */
  crouch: number;
  /** The body's lean round the hips: positive tips the head down (a strike). */
  pitch: number;
  /** The head on the neck: turn, nod (positive down) and tip (positive: right eye down). */
  headYaw: number;
  headPitch: number;
  headRoll: number;
  /** The bill, 0 shut to 1 open. */
  bill: number;
  /** The tail's lift (positive up). */
  tail: number;
  /** Flying: open wings, legs tucked. */
  flying: boolean;
  /** The open wings' beat angle (positive up). */
  flap: number;
  visible: boolean;
}

export function restPose(): RobinPose {
  return {
    x: 0, y: 0, z: 0, yaw: 0, lift: 0, crouch: 0, pitch: 0,
    headYaw: 0, headPitch: 0, headRoll: 0, bill: 0, tail: 0, flying: false, flap: 0, visible: false,
  };
}

interface Part { readonly start: number; readonly count: number; readonly matrix: THREE.Matrix4; visible: boolean }

export class Robin {
  readonly mesh: THREE.Mesh;
  readonly pose: RobinPose = restPose();
  private readonly parts = {} as Record<RobinPartName, Part>;
  private readonly list: Part[] = [];
  private readonly restPos: Float32Array;
  private readonly restNor: Float32Array;
  private readonly root = new THREE.Matrix4();
  private readonly body = new THREE.Matrix4();
  private readonly head = new THREE.Matrix4();
  private readonly m = new THREE.Matrix4();
  private readonly n = new THREE.Matrix3();
  private readonly v = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();

  constructor() {
    const w = new MeshWriter('aProp', 4);
    for (const name of Object.keys(ROBIN_PARTS) as RobinPartName[]) {
      const start = w.vertexCount;
      ROBIN_PARTS[name](w);
      this.parts[name] = { start, count: w.vertexCount - start, matrix: new THREE.Matrix4(), visible: true };
      this.list.push(this.parts[name]);
    }
    const geometry = w.toGeometry();
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    const nor = geometry.getAttribute('normal') as THREE.BufferAttribute;
    pos.setUsage(THREE.DynamicDrawUsage);
    nor.setUsage(THREE.DynamicDrawUsage);
    this.restPos = Float32Array.from(pos.array as Float32Array);
    this.restNor = Float32Array.from(nor.array as Float32Array);
    this.mesh = new THREE.Mesh(geometry, createPropMaterial());
    this.mesh.name = 'robin';
    // Its vertices are written in world space each frame; it is never culled as a whole.
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** How many vertices the robin has (tests: it must stay small enough to rewrite each frame). */
  get vertexCount(): number {
    return this.restPos.length / 3;
  }

  /** Poses every part from `pose` and rewrites the mesh. Call once per drawn frame while it shows. */
  update(): void {
    const p = this.pose;
    this.mesh.visible = p.visible;
    if (!p.visible) return;
    const s = UNITS_PER_CM;
    const P = this.parts;
    // Root: on the ground at (x, y, z), turned to yaw, in centimetres from here on.
    this.root.makeRotationY(p.yaw).scale(this.v.set(s, s, s)).setPosition(p.x, p.y, p.z);
    this.root.multiply(this.m.makeTranslation(0, p.lift, 0));
    // Legs: bent by `crouch`, tucked back under the body in flight.
    P.legR.visible = P.legL.visible = true;
    if (p.flying) this.about(P.legR.matrix, this.root, PIVOTS.hip, 1.3, 0, 0);
    else P.legR.matrix.copy(this.root).multiply(this.m.makeScale(1, 1 - 0.3 * p.crouch, 1));
    P.legL.matrix.copy(P.legR.matrix);
    // Body: lowered by the crouch, leaning round the hips.
    this.m.makeTranslation(0, -1.1 * p.crouch, 0);
    this.body.multiplyMatrices(this.root, this.m);
    this.about(this.body, this.body, PIVOTS.hip, p.pitch, 0, 0);
    P.body.matrix.copy(this.body);
    this.about(this.head, this.body, PIVOTS.neck, p.headPitch, p.headYaw, p.headRoll);
    P.head.matrix.copy(this.head);
    this.about(P.lowerBill.matrix, this.head, PIVOTS.gape, 0.35 * p.bill, 0, 0);
    this.about(P.tail.matrix, this.body, PIVOTS.rump, p.tail, 0, 0);
    P.wingR.visible = P.wingL.visible = !p.flying;
    P.openR.visible = P.openL.visible = p.flying;
    P.wingR.matrix.copy(this.body);
    P.wingL.matrix.copy(this.body);
    this.about(P.openR.matrix, this.body, PIVOTS.shoulder, 0, 0, p.flap);
    const [sx, sy, sz] = PIVOTS.shoulder;
    this.aboutAt(P.openL.matrix, this.body, -sx, sy, sz, 0, 0, -p.flap);
    this.write();
  }

  /** out = parent · (turn by x, y, z Euler angles round `pivot`). */
  private about(out: THREE.Matrix4, parent: THREE.Matrix4, pivot: readonly number[], rx: number, ry: number, rz: number): void {
    this.aboutAt(out, parent, pivot[0], pivot[1], pivot[2], rx, ry, rz);
  }

  private aboutAt(out: THREE.Matrix4, parent: THREE.Matrix4, px: number, py: number, pz: number, rx: number, ry: number, rz: number): void {
    // Yaw, then nod, then tip: the order a head turns.
    this.q.setFromEuler(this.e.set(rx, ry, rz, 'YXZ'));
    this.m.makeRotationFromQuaternion(this.q);
    const e = this.m.elements;
    // Translate(p) · R · Translate(-p), written straight into the matrix.
    e[12] = px - (e[0] * px + e[4] * py + e[8] * pz);
    e[13] = py - (e[1] * px + e[5] * py + e[9] * pz);
    e[14] = pz - (e[2] * px + e[6] * py + e[10] * pz);
    out.multiplyMatrices(parent, this.m);
  }

  private write(): void {
    const geometry = this.mesh.geometry;
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    const nor = geometry.getAttribute('normal') as THREE.BufferAttribute;
    const out = pos.array as Float32Array;
    const outN = nor.array as Float32Array;
    const v = this.v;
    for (const part of this.list) {
      const end = (part.start + part.count) * 3;
      if (!part.visible) {
        // Collapsed to one point: nothing to draw, nothing to shade.
        out.fill(0, part.start * 3, end);
        continue;
      }
      this.n.getNormalMatrix(part.matrix);
      for (let i = part.start * 3; i < end; i += 3) {
        v.set(this.restPos[i], this.restPos[i + 1], this.restPos[i + 2]).applyMatrix4(part.matrix);
        out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z;
        v.set(this.restNor[i], this.restNor[i + 1], this.restNor[i + 2]).applyMatrix3(this.n).normalize();
        outN[i] = v.x; outN[i + 1] = v.y; outN[i + 2] = v.z;
      }
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
  }
}
