import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mulberry32 } from '../core/random';
import { sample, sample1 } from '../opening/keys';
import { detailShape } from '../surface/detailShape';
import { AnatomyWorm } from '../anatomy/model';
import { setMotion, type WormMotion } from '../anatomy/motion';
import { sampleBody, type BodySample } from '../anatomy/body';
import { gutCentreY } from '../anatomy/gut';
import { dorsalVessel } from '../anatomy/axes';
import { gameLeaf } from './outside';
import {
  BITE_R, CAST_GAP, CAST_N, CASTING, CROP_FULL, FLOOR_Y, FOOD, GIZZARD_X, GRIND, LOBE_UP, MM, NOTCH_X,
  NOTCH_Y, PHARYNX_OUT, SOAK, SPIT, SQUEEZE_HZ, TAIL, TEAR_AT, TUG, TUG_X, WHOLE,
} from './script';

const smooth = (u: number): number => {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
};

const lambert = (color: number, vertexColors = false): THREE.MeshLambertMaterial =>
  new THREE.MeshLambertMaterial({ color, vertexColors, side: THREE.DoubleSide });

/** A height along the body (film units), from a table sampled every STEP along it. */
const STEP = 0.05;
function table(f: (x: number) => number): Float32Array {
  const t = new Float32Array(Math.ceil(TAIL / STEP) + 2);
  for (let i = 0; i < t.length; i++) t[i] = f(i * STEP);
  return t;
}
function read(t: Float32Array, x: number): number {
  const f = Math.min(t.length - 1.001, Math.max(0, x / STEP));
  const i = Math.floor(f);
  return t[i] + (t[i + 1] - t[i]) * (f - i);
}
/** How far the pharynx's front reaches out of the mouth, at full stretch (to the leaf's edge). */
const REACH = -NOTCH_X + 0.3;

const SPIT_N = 10;
const SAND_N = 11;
const CRUMB_N = 18;
const SOAK_N = 16;

/**
 * Inside a nightcrawler, cut open lengthwise: the project's anatomy model (src/anatomy/, a
 * lighter build of the same parts), with its gut opened too so the food can be followed. The
 * model's own motion moves the pharynx, the prostomium, the crop and the gizzard. Around it: the
 * leaf, the burrow, and the food's trip (script.ts). The model is built by `build` (slow: main.ts
 * runs it after the game has loaded, or when the film first plays). Allocates nothing per frame.
 */
export class Inside {
  readonly group = new THREE.Group();
  /** The anatomy model, once built. */
  worm: AnatomyWorm | null = null;
  private readonly bite: THREE.Mesh;
  /** The leaf in front of the mouth, and the notch the bite leaves in it. */
  private readonly leaf = new THREE.Group();
  private readonly notch: THREE.Mesh;
  private readonly spit: THREE.InstancedMesh;
  private readonly sand: THREE.InstancedMesh;
  private readonly crumbs: THREE.InstancedMesh;
  private readonly castBits: THREE.InstancedMesh;
  private readonly soak: THREE.InstancedMesh;
  private readonly offsets: Float32Array;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly e = new THREE.Euler();
  private readonly food = [0, 0];
  private readonly motion: WormMotion = { pharynx: 0, prostomium: 0, crop: 0, gizzard: 0 };
  private xray = -1;
  private gutY: Float32Array = new Float32Array(1);
  private vesselY: Float32Array = new Float32Array(1);

  constructor() {
    const rand = mulberry32(7);
    const c = new THREE.Color();
    // The burrow's soil behind the worm.
    const back = new THREE.PlaneGeometry(TAIL + 60, 24, 60, 8);
    back.translate(TAIL / 2, 0, -2.4);
    const bc = new Float32Array(back.attributes.position.count * 3);
    for (let i = 0; i < back.attributes.position.count; i++) c.setHex(0x3e2a1c).multiplyScalar(0.75 + rand() * 0.5).toArray(bc, i * 3);
    back.setAttribute('color', new THREE.BufferAttribute(bc, 3));
    this.group.add(new THREE.Mesh(back, lambert(0xffffff, true)));

    // The leaf in front of the mouth (the game's basswood, much bigger than life, like the worm),
    // standing on its stem end with its edge at the notch; and the bite, a ragged half circle of
    // its edge, in the same colour, so it can't be told from the leaf until it tears off. The notch
    // it leaves shows the burrow's soil behind.
    const big = gameLeaf('basswood', 3.8);
    big.deleteAttribute('color');
    big.rotateZ(Math.PI / 2);
    big.rotateY(-Math.PI / 2);
    // Its widest point, nearest the mouth, sits at the notch's middle.
    const bp = big.attributes.position;
    let edge = 0;
    for (let i = 1; i < bp.count; i++) if (bp.getX(i) > bp.getX(edge)) edge = i;
    const dx = NOTCH_X - bp.getX(edge);
    const dy = NOTCH_Y - bp.getY(edge);
    big.translate(dx, dy, -0.07 - bp.getZ(edge));
    const leafCol = 0xc99a36;
    this.leaf.add(new THREE.Mesh(big, lambert(leafCol)));
    // The bite: the part of the leaf inside a circle round that point, so it fits its notch.
    const sh = detailShape('basswood');
    const k = 3.8 / (sh.points[sh.tip * 2 + 1] - sh.points[sh.base * 2 + 1]);
    const outline: [number, number][] = [];
    // The same turns as the leaf: its across (x) ends up along -x, its length along y.
    for (let i = 0; i < sh.outline; i++) {
      const lx = sh.points[i * 2] * k;
      const v = new THREE.Vector3((sh.points[sh.tip * 2 + 1] - sh.points[i * 2 + 1]) * k, (0.12 * lx * lx) / 3.8, lx);
      v.applyAxisAngle(Z_AXIS, Math.PI / 2).applyAxisAngle(Y_AXIS, -Math.PI / 2);
      outline.push([v.x + dx - NOTCH_X, v.y + dy - NOTCH_Y]);
    }
    const circle: [number, number][] = [];
    for (let i = 0; i < 20; i++) circle.push([Math.cos((i / 20) * Math.PI * 2) * BITE_R, Math.sin((i / 20) * Math.PI * 2) * BITE_R]);
    const piece = clip(outline, circle);
    const biteShape = new THREE.Shape(piece.map(([x, y]) => new THREE.Vector2(x, y)));
    const biteG = new THREE.ShapeGeometry(biteShape);
    this.notch = new THREE.Mesh(biteG, lambert(0x3e2a1c));
    this.notch.position.set(NOTCH_X, NOTCH_Y, -0.06);
    this.leaf.add(this.notch);
    this.group.add(this.leaf);
    // The burrow's floor under the tail, where the casts drop.
    const floor = new THREE.BoxGeometry(9, 0.6, 2.8);
    floor.translate(TAIL + 1.5, FLOOR_Y - 0.3, -1.1);
    this.group.add(new THREE.Mesh(floor, lambert(0x9a7a58)));

    // The food: the bite of leaf, spit, sand in the gizzard, crumbs, casts, and food soaking out.
    this.bite = new THREE.Mesh(biteG, lambert(leafCol));
    this.group.add(this.bite);
    this.spit = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshLambertMaterial({ color: 0xe4f4ff, emissive: 0x24384a }), SPIT_N);
    this.sand = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.045, 0), lambert(0x9c9a92), SAND_N);
    this.crumbs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.07, 0.02), lambert(0x9a7428), CRUMB_N);
    this.castBits = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 8, 6), lambert(0x3a2a1e), CAST_N);
    this.soak = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshLambertMaterial({ color: 0xf2c23a, emissive: 0x3a2a00 }), SOAK_N);
    for (const im of [this.spit, this.sand, this.crumbs, this.castBits, this.soak]) {
      im.frustumCulled = false;
      this.group.add(im);
    }
    // Fixed scatter for each little thing: x, y offsets and a phase.
    this.offsets = new Float32Array(32 * 3);
    for (let i = 0; i < 32; i++) {
      this.offsets[i * 3] = rand() * 2 - 1;
      this.offsets[i * 3 + 1] = rand() * 2 - 1;
      this.offsets[i * 3 + 2] = rand() * Math.PI * 2;
    }
  }

  /**
   * Builds the anatomy model (a lighter build of the viewer's), opened along its length with its
   * gut opened too, and gives it the studio's soft reflections. Then compiles every shader the
   * film can need, the model's see-through ones included, so nothing stalls while it plays.
   */
  build(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.worm) return;
    const worm = new AnatomyWorm('lesson');
    worm.setWall('cut');
    worm.openGut(true);
    // Only what the film is about: no reproductive organs or nephridia in the way.
    worm.setSystem('repro', false);
    worm.setSystem('nephridia', false);
    const pmrem = new THREE.PMREMGenerator(renderer);
    worm.useEnvironment(pmrem.fromScene(new RoomEnvironment(), 0.16).texture, 0.5);
    pmrem.dispose();
    worm.group.scale.setScalar(MM);
    this.group.add(worm.group);
    const bs: BodySample = { s: 0, w: 0, h: 0, yc: 0 };
    this.gutY = table((x) => gutCentreY(Math.max(0.1, x / MM), sampleBody(Math.max(0.1, x / MM), bs)) * MM);
    const v = new THREE.Vector3();
    this.vesselY = table((x) => dorsalVessel(Math.max(2, x / MM), v).y * MM);
    this.worm = worm;
    const was = this.group.visible;
    this.group.visible = true;
    worm.precompile(renderer, scene, camera);
    this.group.visible = was;
  }

  pose(t: number): void {
    const o = this.offsets;
    // The tugs pull the leaf's edge (and the pharynx with it) toward the mouth.
    const tug = sample1(TUG, t) * TUG_X;
    const torn = t >= TEAR_AT;
    this.leaf.position.x = tug;
    this.notch.visible = torn;
    const grinding = t > GRIND[0] && t < GRIND[1];
    const squeeze = grinding ? 0.5 - 0.5 * Math.cos((t - GRIND[0]) * SQUEEZE_HZ * Math.PI * 2) : 0;
    // The model's own moving parts: the pharynx reaches out to the leaf's edge, the lobe over the
    // mouth lifts, the crop fills and the gizzard squeezes.
    const m = this.motion;
    m.pharynx = Math.max(0, sample1(PHARYNX_OUT, t) * REACH - tug) / MM;
    m.prostomium = sample1(LOBE_UP, t) * 0.6;
    m.crop = sample1(CROP_FULL, t);
    m.gizzard = squeeze;
    setMotion(m);
    // Behind the cut-open part the wall is whole: once the food goes there, it turns see-through.
    const xray = Math.round(smooth((t - 40.4) / 1.4) * 20) / 20;
    if (this.worm && xray !== this.xray) {
      this.xray = xray;
      this.worm.setFade('skin', 1 - 0.75 * xray);
      this.worm.setFade('muscles', 1 - 0.8 * xray);
      this.worm.setFade('gut', 1 - 0.5 * xray);
    }

    const [fx, lift] = sample(FOOD, t, this.food);
    // The food rides along the gut's middle line.
    const fy = read(this.gutY, fx) + lift;
    const whole = sample1(WHOLE, t);
    const casting = sample1(CASTING, t);
    this.bite.visible = whole > 0.02;
    this.e.set(0, 0, grinding ? Math.sin(t * 2.1) * 0.8 : torn ? 0.2 * Math.min(1, (t - TEAR_AT) / 0.6) : 0);
    if (torn) this.bite.position.set(fx, fy, -0.05);
    else this.bite.position.set(NOTCH_X + tug, NOTCH_Y, -0.05);
    this.bite.quaternion.setFromEuler(this.e);
    this.bite.scale.setScalar(0.25 + whole * 0.75);

    const wet = sample1(SPIT, t);
    for (let i = 0; i < SPIT_N; i++) {
      const a = o[i * 3 + 2];
      this.m.compose(this.p.set(fx + Math.cos(a) * 0.24, fy + Math.sin(a) * 0.16, 0.02), this.q.identity(), this.s.setScalar(wet * (0.7 + 0.3 * Math.abs(o[i * 3]))));
      this.spit.setMatrixAt(i, this.m);
    }
    for (let i = 0; i < SAND_N; i++) {
      const j = grinding ? 0.05 * Math.sin(t * 3.1 + o[i * 3 + 2]) * (0.4 + squeeze) : 0;
      this.m.compose(this.p.set(GIZZARD_X + o[i * 3] * 0.26 + j, read(this.gutY, GIZZARD_X) + o[i * 3 + 1] * 0.12 * (1 - squeeze * 0.3) - j, -0.05), this.q.identity(), this.s.setScalar(1));
      this.sand.setMatrixAt(i, this.m);
    }
    const crumbSize = (1 - whole) * (1 - casting);
    for (let i = 0; i < CRUMB_N; i++) {
      const j = grinding ? 0.04 * Math.sin(t * 2.7 + o[i * 3 + 2]) : 0;
      this.e.set(0, 0, o[i * 3 + 2] + (grinding ? t * 1.3 : 0));
      this.m.compose(this.p.set(fx + o[i * 3] * 0.3 + j, fy + o[i * 3 + 1] * 0.15, -0.03), this.q.setFromEuler(this.e), this.s.setScalar(crumbSize));
      this.crumbs.setMatrixAt(i, this.m);
    }
    // The casts, one behind another; once past the back end each is pushed out, then drops onto
    // the burrow's floor in a little pile.
    for (let i = 0; i < CAST_N; i++) {
      const x = fx - i * CAST_GAP;
      const past = x - (TAIL - 0.05);
      const fall = smooth((past - 0.3) / 0.7);
      const px = TAIL + 0.42 + ((i % 3) - 1) * 0.2 + o[i * 3] * 0.04;
      const py = FLOOR_Y + 0.08 + Math.floor(i / 3) * 0.13;
      const sx = past > 0 ? TAIL - 0.05 + Math.min(past, 0.3) : x;
      this.p.set(sx + (px - sx) * fall, (fy + o[i * 3 + 1] * 0.08) * (1 - fall) + py * fall, -0.04);
      this.e.set(0, 0, fall * (o[i * 3 + 2] - 3));
      this.m.compose(this.p, this.q.setFromEuler(this.e), this.s.set(casting * 1.3, casting, casting));
      this.castBits.setMatrixAt(i, this.m);
    }
    // Each dot rises out of the gut to the blood vessel on top, then rides along it.
    const soak = sample1(SOAK, t);
    for (let i = 0; i < SOAK_N; i++) {
      const q = Math.min(1, Math.max(0, soak * 1.6 - (i / SOAK_N) * 0.6));
      const x0 = fx + o[i * 3] * 0.35;
      const rise = Math.min(1, q / 0.5);
      const ride = Math.max(0, (q - 0.5) * 2);
      const shown = q > 0 && q < 1 ? 1 : 0;
      const x = x0 - ride * 1.6;
      const y0 = read(this.gutY, x0) + 0.12;
      this.m.compose(this.p.set(x, y0 + (read(this.vesselY, x) - y0) * rise, -0.02), this.q.identity(), this.s.setScalar(shown));
      this.soak.setMatrixAt(i, this.m);
    }
    for (const im of [this.spit, this.sand, this.crumbs, this.castBits, this.soak]) im.instanceMatrix.needsUpdate = true;
  }
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * The polygon `subject` cut down to what lies inside the convex polygon `edge` (both
 * counter-clockwise or both clockwise; Sutherland-Hodgman).
 */
function clip(subject: [number, number][], edge: [number, number][]): [number, number][] {
  let out = subject;
  const sign = Math.sign(area(edge)) || 1;
  for (let i = 0; i < edge.length && out.length; i++) {
    const [ax, ay] = edge[i];
    const [bx, by] = edge[(i + 1) % edge.length];
    const inside = ([x, y]: [number, number]): boolean => sign * ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) >= 0;
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j];
      const q = input[(j + 1) % input.length];
      const pin = inside(p);
      const qin = inside(q);
      if (pin) out.push(p);
      if (pin !== qin) {
        // Where pq crosses the edge's line.
        const d1 = (bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax);
        const d2 = (bx - ax) * (q[1] - ay) - (by - ay) * (q[0] - ax);
        const u = d1 / (d1 - d2);
        out.push([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]);
      }
    }
  }
  return out;
}

function area(poly: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}
