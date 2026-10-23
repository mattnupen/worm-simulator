import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/random';
import { sample, sample1 } from '../opening/keys';
import { CASTS, CASTS_AFTER, FEEL, GRAB_AT, LEAF_LENGTH, LEAF_TIP_X, LIP, REACH } from './script';

/** The worm: as long and as wide as the game's (3.5 by 0.23), in this many beads. */
const BEADS = 48;
const WORM_LENGTH = 3.5;
const BEAD_GAP = WORM_LENGTH / BEADS;
const WORM_R = 0.115;
/** The burrow's half width on the cut face, and how deep the cut shows it. */
const BURROW_R = 0.16;
const BURROW_DEEP = 5.6;
/** The cut face's size: x from -FACE_W to FACE_W, y from -FACE_D to 0. */
const FACE_W = 8;
const FACE_D = 8;
/** The quarter turn over the burrow's lip, as a length along the body. */
const ARC = (Math.PI / 2) * LIP;

/** Soil colours by depth (a thin dark top where worms have mixed it, then brown, then paler). */
function soilColour(y: number, n: number, out: THREE.Color): THREE.Color {
  const top = new THREE.Color(0x2a1a10);
  const mid = new THREE.Color(0x4a3020);
  const low = new THREE.Color(0x7a5a3a);
  if (y > -0.3) out.copy(top);
  else if (y > -3.2) out.copy(top).lerp(mid, Math.min(1, (-y - 0.3) / 1.2));
  else out.copy(mid).lerp(low, Math.min(1, (-y - 3.2) / 1.5));
  return out.multiplyScalar(0.82 + n * 0.36);
}

/** A flat grid in the xy plane over the box, coloured by `colour(x, y)`. */
function grid(x0: number, x1: number, y0: number, y1: number, step: number, colour: (x: number, y: number) => THREE.Color): THREE.BufferGeometry {
  const nx = Math.max(1, Math.round((x1 - x0) / step));
  const ny = Math.max(1, Math.round((y1 - y0) / step));
  const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0, nx, ny);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) colour(pos.getX(i), pos.getY(i)).toArray(col, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** A leaf outline from its tip (0, 0) along +x to its stem end at `length`, `width` across. */
export function leafShape(length: number, width: number): THREE.Shape {
  const s = new THREE.Shape();
  const w = width / 2;
  s.moveTo(0, 0);
  s.bezierCurveTo(length * 0.25, w * 0.9, length * 0.7, w * 1.15, length * 0.95, w * 0.35);
  s.lineTo(length, 0);
  s.lineTo(length * 0.95, -w * 0.35);
  s.bezierCurveTo(length * 0.7, -w * 1.15, length * 0.25, -w * 0.9, 0, 0);
  return s;
}

/** A leaf lying flat (in xz, facing up), tip at the origin. */
function flatLeaf(length: number, width: number): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(leafShape(length, width), 6);
  g.rotateX(-Math.PI / 2);
  return g;
}

const lambert = (color: number, vertexColors = false): THREE.MeshLambertMaterial =>
  new THREE.MeshLambertMaterial({ color, vertexColors, side: THREE.DoubleSide });

/**
 * Outside, at night: the soil cut open through the burrow, the leaves on top, the midden round
 * the burrow's mouth, the worm in its burrow and the leaf it pulls in. `pose(t)` moves the worm,
 * the leaf and the casts to the script (script.ts). Allocates nothing per frame.
 */
export class Outside {
  readonly group = new THREE.Group();
  private readonly worm: THREE.InstancedMesh;
  private readonly leaf: THREE.Mesh;
  private readonly casts: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly e = new THREE.Euler();
  private readonly pt = [0, 0, 0, 0];
  private readonly head = new THREE.Vector3();
  private readonly headDir = new THREE.Vector3();

  constructor() {
    const rand = mulberry32(41);
    const c = new THREE.Color();
    // The cut face, with a gap where the burrow is cut in half, and the burrow's far half behind it.
    const soil = (_x: number, y: number): THREE.Color => soilColour(y, rand(), c);
    const face = mergeGeometries([
      grid(-FACE_W, -BURROW_R, -FACE_D, 0, 0.25, soil),
      grid(BURROW_R, FACE_W, -FACE_D, 0, 0.25, soil),
      grid(-BURROW_R, BURROW_R, -FACE_D, -BURROW_DEEP, 0.16, soil),
    ]);
    this.group.add(new THREE.Mesh(face, lambert(0xffffff, true)));
    const pipe = new THREE.CylinderGeometry(BURROW_R, BURROW_R, BURROW_DEEP, 12, 1, true, Math.PI / 2, Math.PI);
    pipe.translate(0, -BURROW_DEEP / 2, 0);
    const end = new THREE.SphereGeometry(BURROW_R, 12, 6, Math.PI, Math.PI, Math.PI / 2, Math.PI / 2);
    end.translate(0, -BURROW_DEEP, 0);
    this.group.add(new THREE.Mesh(mergeGeometries([pipe, end]), lambert(0x1c120b)));
    // The ground's top, going back from the cut, and a few trunks far off in the dark.
    const ground = grid(-FACE_W, FACE_W, 0, 12, 0.5, () => c.setHex(0x3a2616).multiplyScalar(0.8 + rand() * 0.4));
    ground.rotateX(-Math.PI / 2);
    this.group.add(new THREE.Mesh(ground, lambert(0xffffff, true)));
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.6, 30, 8, 1, true), lambert(0x1a1712), 5);
    [[-5, -11], [3.5, -14], [8, -9], [-9, -16], [12, -18]].forEach(([x, z], i) => trunks.setMatrixAt(i, this.m.makeTranslation(x, 12, z)));
    this.group.add(trunks);

    // Fallen leaves on top: maple, basswood, oak and birch colours, away from the burrow's mouth.
    const leafColours = [0x8a5a2b, 0xa8742e, 0x6e4a26, 0xb38a3a, 0x7d3a20, 0x9a8236];
    const litter = new THREE.InstancedMesh(flatLeaf(0.9, 0.55), lambert(0xffffff), 70);
    for (let i = 0; i < 70; i++) {
      let x = 0;
      let z = 0;
      do {
        x = (rand() * 2 - 1) * 6;
        z = -0.25 - rand() * 7;
      } while (Math.hypot(x - 0.2, z + 0.25) < 0.7 || (x > 0.5 && x < 2.3 && z > -1));
      this.e.set(rand() * 0.2, rand() * Math.PI * 2, rand() * 0.2);
      const k = 0.7 + rand() * 0.6;
      this.m.compose(this.p.set(x, 0.01 + rand() * 0.05, z), this.q.setFromEuler(this.e), this.s.set(k, 1, k));
      litter.setMatrixAt(i, this.m);
      litter.setColorAt(i, c.setHex(leafColours[i % leafColours.length]).multiplyScalar(0.85 + rand() * 0.3));
    }
    this.group.add(litter);

    // The midden: leaf stems poking up out of the burrow's mouth, and casts in a pile round it.
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.01, 0.016, 0.3, 5), lambert(0x6a4524), 7);
    for (let i = 0; i < 7; i++) {
      // Leaf stems, leaning every which way, their ends poking into the burrow's mouth.
      const a = rand() * Math.PI * 2;
      const r = 0.08 + rand() * 0.1;
      const lean = 0.5 + rand() * 0.8;
      this.e.set(Math.sin(a) * lean, rand() * 3, -Math.cos(a) * lean, 'YXZ');
      this.m.compose(this.p.set(Math.cos(a) * r, 0.06, -0.14 + Math.sin(a) * r), this.q.setFromEuler(this.e), this.s.set(1, 0.7 + rand() * 0.6, 1));
      stems.setMatrixAt(i, this.m);
    }
    this.group.add(stems);
    this.casts = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 7, 5), lambert(0x4a3828), CASTS_AFTER);
    for (let i = 0; i < CASTS_AFTER; i++) {
      // Spiral out from the mouth: the newer the cast, the further out it lies.
      const a = i * 2.4;
      const r = 0.2 + Math.sqrt(i) * 0.07;
      this.m.compose(this.p.set(Math.cos(a) * r, 0.03 + rand() * 0.02, Math.min(-0.04, -0.2 + Math.sin(a) * r)), this.q.identity(), this.s.set(0.8 + rand() * 0.5, 0.6 + rand() * 0.3, 1 + rand() * 0.4));
      this.casts.setMatrixAt(i, this.m);
    }
    this.group.add(this.casts);

    // The leaf the worm pulls in (a basswood leaf), tip at its origin.
    this.leaf = new THREE.Mesh(flatLeaf(LEAF_LENGTH, 0.8), lambert(0xa07a30));
    this.group.add(this.leaf);

    // The worm: beads along its body, darker at the head, with its clitellum band.
    this.worm = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 7), lambert(0xffffff), BEADS);
    const headC = new THREE.Color(0x6e2e2a);
    const bodyC = new THREE.Color(0xb8796a);
    for (let i = 0; i < BEADS; i++) {
      c.copy(headC).lerp(bodyC, Math.min(1, i / 10));
      if (i >= 11 && i <= 14) c.setHex(0xc4664e);
      this.worm.setColorAt(i, c);
    }
    this.worm.frustumCulled = false;
    this.group.add(this.worm);
  }

  /** The point and the way along the worm's path `u` past the burrow's mouth (negative: below). */
  private along(u: number, out: number[]): number[] {
    if (u < 0) return set(out, 0, u, 0, 1);
    if (u < ARC) {
      const a = u / LIP;
      return set(out, LIP - LIP * Math.cos(a), LIP * Math.sin(a), Math.sin(a), Math.cos(a));
    }
    return set(out, LIP + (u - ARC), LIP, 1, 0);
  }

  pose(t: number): void {
    const reach = sample1(REACH, t);
    const feel = sample1(FEEL, t);
    const pt = this.pt;
    for (let i = 0; i < BEADS; i++) {
      const u = reach - i * BEAD_GAP;
      this.along(u, pt);
      // Out on the leaves it lies a little back from the cut, and its front sways as it feels.
      const out = Math.min(1, Math.max(0, u / 0.4));
      const front = Math.max(0, 1 - i / 8);
      const sway = feel * front * 0.16 * Math.sin(t * 2.3 - i * 0.5);
      const lift = feel * front * 0.05 * (1 + Math.sin(t * 1.7));
      const taper = i < 3 ? 0.72 + i * 0.09 : i > BEADS - 6 ? 0.6 + (BEADS - 1 - i) * 0.08 : 1;
      this.p.set(pt[0], pt[1] + lift, -0.24 * out + sway);
      this.q.setFromAxisAngle(Z, Math.atan2(pt[3], pt[2]));
      this.m.compose(this.p, this.q, this.s.set(BEAD_GAP * 1.5, WORM_R * taper, WORM_R * taper));
      this.worm.setMatrixAt(i, this.m);
      if (i === 0) {
        this.head.copy(this.p);
        this.headDir.set(pt[2], pt[3], 0);
      }
    }
    this.worm.instanceMatrix.needsUpdate = true;

    // The leaf: at rest until the worm takes it by the tip; then the tip goes where the mouth goes
    // and the rest drags behind on the ground, rolling up as it is pulled into the burrow.
    if (t < GRAB_AT) {
      this.leaf.position.set(LEAF_TIP_X, 0.03, -0.24);
      this.leaf.rotation.set(0, 0, 0);
      this.leaf.scale.set(1, 1, 1);
    } else {
      const tipY = this.head.y + this.headDir.y * 0.06;
      const drop = Math.min(LEAF_LENGTH, Math.max(0, 0.03 - tipY));
      this.leaf.position.set(this.head.x + this.headDir.x * 0.06, tipY, Math.max(this.head.z, 0.03 - 0.27 * Math.max(0, tipY / LIP)));
      // It rolls up on its long side as it is pulled, so from the cut its face shows.
      const roll = (Math.PI / 2) * Math.min(1, (t - GRAB_AT) / 1.2);
      this.leaf.rotation.set(roll, 0, Math.asin(drop / LEAF_LENGTH), 'ZYX');
      this.leaf.scale.set(1, 1, 1 - 0.55 * Math.min(1, drop / 0.25));
    }
    this.casts.count = Math.round(sample(CASTS, t, this.pt)[0]);
  }
}

const Z = new THREE.Vector3(0, 0, 1);

function set(out: number[], a: number, b: number, c: number, d: number): number[] {
  out[0] = a;
  out[1] = b;
  out[2] = c;
  out[3] = d;
  return out;
}
