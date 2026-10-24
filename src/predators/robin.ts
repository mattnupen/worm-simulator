import * as THREE from 'three';
import { createPropMaterial } from '../render/propMaterial';
import { UNITS_PER_CM } from '../surface/realScale';
import { MeshWriter } from '../surface/meshWriter';
import { ROBIN_PARTS, type RobinPartName } from './robinParts';
import { WING_CHORD, WING_UP, WRIST_CHORD, WRIST_SPAN } from './robinFlight';
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
  /** Which way the wings are beating, -1..1: positive on the upstroke (the hands fold back), negative on the downstroke. */
  stroke: number;
  /**
   * Bits of leaf flicked up as it digs (V4 revision 4): 0..1 through one flick (0 or 1: none),
   * kicked back from its feet, or tossed aside from under its bill (`flickBill`).
   */
  flick: number;
  flickBill: boolean;
  visible: boolean;
}

export function restPose(): RobinPose {
  return {
    x: 0, y: 0, z: 0, yaw: 0, lift: 0, stride: 0, crouch: 0, pitch: 0,
    headYaw: 0, headPitch: 0, headRoll: 0, bill: 0, tail: 0, flying: false, flap: 0, stroke: 0, flick: 0, flickBill: false, visible: false,
  };
}

/** The upper bill's tip in the bird's frame (cm): writeBill's far end, a little in to grip with. */
const BILL_TIP = [0, PIVOTS.gape[1] - 0.25, PIVOTS.gape[2] + 1.6] as const;

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
  private readonly m2 = new THREE.Matrix4();
  private readonly chord = new THREE.Vector3(...WING_CHORD);
  private readonly up = new THREE.Vector3(...WING_UP);
  private readonly n = new THREE.Matrix3();
  private readonly v = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
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

  /**
   * Where something held in the bill sits (between the two halves, a little behind the tip), in
   * world units, as the last update() posed the head: the worm the robin carries to its nest
   * (nest.ts). `side` (cm) moves it to the bird's left (+) or right (-) along the bill's edge.
   * Writes `out` and returns it.
   */
  billHold(out: THREE.Vector3, side = 0): THREE.Vector3 {
    const [, gy, gz] = PIVOTS.gape;
    return out.set(side, gy - 0.15, gz + 1.3).applyMatrix4(this.head);
  }

  /** Poses every part from `pose` and rewrites the mesh. Call once per drawn frame while it shows. */
  update(): void {
    this.mesh.visible = this.pose.visible;
    if (!this.pose.visible) return;
    this.place();
    this.write();
  }

  /**
   * The tip of its bill (world units) as `pose` holds it now, into `out` (the hunt: the worm's head
   * follows it). Works out the parts' places only; writes no vertices.
   */
  billTip(out: { x: number; y: number; z: number }): void {
    this.place();
    this.v.set(BILL_TIP[0], BILL_TIP[1], BILL_TIP[2]).applyMatrix4(this.parts.head.matrix);
    out.x = this.v.x; out.y = this.v.y; out.z = this.v.z;
  }

  /** Every part's matrix from `pose`. */
  private place(): void {
    const p = this.pose;
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
    P.wingR.visible = P.wingL.visible = P.tail.visible = !p.flying;
    P.armR.visible = P.armL.visible = P.handR.visible = P.handL.visible = P.flightTail.visible = p.flying;
    P.flightTail.matrix.copy(P.tail.matrix);
    P.wingR.matrix.copy(this.body);
    P.wingL.matrix.copy(this.body);
    if (p.flying) this.poseWings(p);
    this.poseBits(p);
  }

  /**
   * The leaf bits (robinBits.ts): a little spray that opens out, hops up and falls through one
   * flick, from just behind its feet (thrown back) or from the ground under its bill (tossed aside).
   */
  private poseBits(p: RobinPose): void {
    const bits = this.parts.bits;
    const f = p.flick;
    bits.visible = f > 0 && f < 1 && !p.flying;
    if (!bits.visible) return;
    const s = UNITS_PER_CM;
    if (p.flickBill) {
      this.v.set(BILL_TIP[0], BILL_TIP[1], BILL_TIP[2]).applyMatrix4(this.parts.head.matrix);
      this.m2.makeRotationY(p.yaw + Math.PI / 2).scale(this.v2.set(s, s, s)).setPosition(this.v.x, p.y, this.v.z);
    } else this.m2.multiplyMatrices(this.root, this.m.makeTranslation(0, 0, -1));
    const spread = 0.2 + 0.8 * f;
    this.m.makeRotationY(1.5 * f).scale(this.v2.set(spread, spread, spread)).setPosition(0, 16 * f * (1 - f), 0);
    bits.matrix.multiplyMatrices(this.m2, this.m);
  }

  /**
   * The open wings beat round the shoulders, about the body's long axis (the left tip rises with
   * +flap, the right with -flap, mirrored). The hand bends at the wrist: on the upstroke it folds
   * back and trails below the arm; on the downstroke it is spread, lagging a little above.
   * Game choice: a simple stand-in for a real wingbeat, no source for the angles.
   */
  private poseWings(p: RobinPose): void {
    const P = this.parts;
    const [sx, sy, sz] = PIVOTS.shoulder;
    const up = Math.max(0, p.stroke);
    const down = Math.max(0, -p.stroke);
    // Low in the beat the hand trails above the arm (and clears the ground taking off and landing).
    const bend = -0.35 * up + 0.12 * down + 0.3 * Math.max(0, -p.flap);
    const sweep = 0.45 * up;
    const wy = sy + WRIST_CHORD * WING_CHORD[1];
    const wz = sz + WRIST_CHORD * WING_CHORD[2];
    // Left (+x), then right: mirrored, so every turn's angle flips.
    this.wingTurn(P.armL.matrix, this.body, sx, sy, sz, p.flap, 0);
    this.wingTurn(P.handL.matrix, P.armL.matrix, sx + WRIST_SPAN, wy, wz, bend, sweep);
    this.wingTurn(P.armR.matrix, this.body, -sx, sy, sz, -p.flap, 0);
    this.wingTurn(P.handR.matrix, P.armR.matrix, -sx - WRIST_SPAN, wy, wz, -bend, -sweep);
  }

  /** out = parent · (turn round the wing's chord by `c`, then round its up axis by `u`, at the pivot). */
  private wingTurn(out: THREE.Matrix4, parent: THREE.Matrix4, px: number, py: number, pz: number, c: number, u: number): void {
    this.m.makeRotationAxis(this.chord, c);
    if (u !== 0) this.m.multiply(this.m2.makeRotationAxis(this.up, u));
    this.pivotAt(out, parent, px, py, pz);
  }

  /** out = parent · (turn by x, y, z Euler angles round `pivot`). */
  private about(out: THREE.Matrix4, parent: THREE.Matrix4, pivot: readonly number[], rx: number, ry: number, rz: number): void {
    this.aboutAt(out, parent, pivot[0], pivot[1], pivot[2], rx, ry, rz);
  }

  private aboutAt(out: THREE.Matrix4, parent: THREE.Matrix4, px: number, py: number, pz: number, rx: number, ry: number, rz: number): void {
    // Yaw, then nod, then tip: the order a head turns.
    this.m.makeRotationFromEuler(this.e.set(rx, ry, rz, 'YXZ'));
    this.pivotAt(out, parent, px, py, pz);
  }

  /** out = parent · Translate(p) · (the turn in this.m) · Translate(-p). */
  private pivotAt(out: THREE.Matrix4, parent: THREE.Matrix4, px: number, py: number, pz: number): void {
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
