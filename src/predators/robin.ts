import * as THREE from 'three';
import { createPropMaterial } from '../render/propMaterial';
import { UNITS_PER_CM } from '../surface/realScale';
import { MeshWriter } from '../surface/meshWriter';
import { ROBIN_PARTS, type RobinPartName } from './robinParts';
import { PIVOTS } from './robinShape';

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
  /** Running: the legs swing opposite ways by this angle (positive: right leg forward). */
  stride: number;
  /** 0 standing tall, 1 legs bent (landing, bracing to tug). */
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
    x: 0, y: 0, z: 0, yaw: 0, lift: 0, stride: 0, crouch: 0, pitch: 0,
    headYaw: 0, headPitch: 0, headRoll: 0, bill: 0, tail: 0, flying: false, flap: 0, visible: false,
  };
}

interface Part {
  readonly start: number;
  readonly count: number;
  readonly matrix: THREE.Matrix4;
  visible: boolean;
  /** Its vertices are collapsed already (hidden last frame too): nothing to write. */
  cleared: boolean;
}

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
  private readonly legs = new THREE.Matrix4();
  private readonly m = new THREE.Matrix4();
  private readonly n = new THREE.Matrix3();
  private readonly v = new THREE.Vector3();
  private readonly e = new THREE.Euler();

  constructor() {
    const w = new MeshWriter('aProp', 4);
    for (const name of Object.keys(ROBIN_PARTS) as RobinPartName[]) {
      const start = w.vertexCount;
      ROBIN_PARTS[name](w);
      this.parts[name] = { start, count: w.vertexCount - start, matrix: new THREE.Matrix4(), visible: true, cleared: false };
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
    if (p.flying) {
      this.about(P.legR.matrix, this.root, PIVOTS.hip, 1.3, 0, 0);
      P.legL.matrix.copy(P.legR.matrix);
    } else {
      // Swung by the stride (positive: right leg forward), then shortened by the crouch.
      this.legs.makeScale(1, 1 - 0.3 * p.crouch, 1);
      this.about(P.legR.matrix, this.root, PIVOTS.hip, -p.stride, 0, 0);
      P.legR.matrix.multiply(this.legs);
      this.about(P.legL.matrix, this.root, PIVOTS.hip, p.stride, 0, 0);
      P.legL.matrix.multiply(this.legs);
    }
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
    // The left wing is on +x: its tip rises with +z turns; the right wing's with -z.
    this.about(P.openL.matrix, this.body, PIVOTS.shoulder, 0, 0, p.flap);
    const [sx, sy, sz] = PIVOTS.shoulder;
    this.aboutAt(P.openR.matrix, this.body, -sx, sy, sz, 0, 0, -p.flap);
    this.write();
  }

  /** out = parent · (turn by x, y, z Euler angles round `pivot`). */
  private about(out: THREE.Matrix4, parent: THREE.Matrix4, pivot: readonly number[], rx: number, ry: number, rz: number): void {
    this.aboutAt(out, parent, pivot[0], pivot[1], pivot[2], rx, ry, rz);
  }

  private aboutAt(out: THREE.Matrix4, parent: THREE.Matrix4, px: number, py: number, pz: number, rx: number, ry: number, rz: number): void {
    // Yaw, then nod, then tip: the order a head turns.
    this.m.makeRotationFromEuler(this.e.set(rx, ry, rz, 'YXZ'));
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
    const rp = this.restPos;
    const rn = this.restNor;
    for (const part of this.list) {
      const end = (part.start + part.count) * 3;
      if (!part.visible) {
        // Collapsed to one point: nothing to draw, nothing to shade. Once, when it hides.
        if (!part.cleared) out.fill(0, part.start * 3, end);
        part.cleared = true;
        continue;
      }
      part.cleared = false;
      // Affine (rotation, uniform scale, translation): written out, no w divide.
      const e = part.matrix.elements;
      const ne = this.n.getNormalMatrix(part.matrix).elements;
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
    pos.needsUpdate = true;
    nor.needsUpdate = true;
  }
}
