import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/random';
import { sample, sample1 } from '../opening/keys';
import { leafShape } from './outside';
import {
  CASTING, CROP_FULL, CROP_X, FOOD, GIZZARD_X, GRIND, LOBE_UP, PARTS, PHARYNX_OUT, SEG, SEGMENTS, SOAK,
  SPIT, SQUEEZE_HZ, TAIL, WHOLE,
} from './script';

const smooth = (u: number): number => {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
};

/** The body's radius at x: narrow at the mouth, full behind the head, rounded at the tail. */
export function bodyRadius(x: number): number {
  let r = 0.4 + 0.6 * smooth(x / 1.8);
  if (x > TAIL - 1.6) r *= 0.45 + 0.55 * smooth((TAIL - x) / 1.6);
  const [c0, c1] = PARTS.clitellum;
  if (x > c0 && x < c1) r += 0.07 * smooth((x - c0) / 0.2) * smooth((c1 - x) / 0.2);
  // Each segment bulges a little between the grooves.
  const f = (x / SEG) % 1;
  return r * (0.965 + 0.035 * Math.sin(f * Math.PI));
}

/**
 * The far half of a tube along x (the near half, z > 0, is cut away), radius `r(x)` from x0 to
 * x1. Lathe vertices are x = r sin(phi), z = r cos(phi); phi from pi/2 to 3pi/2 is the far half,
 * then the lathe's y axis is turned onto x.
 */
function halfTube(x0: number, x1: number, step: number, r: (x: number) => number, around = 14): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const n = Math.max(2, Math.round((x1 - x0) / step));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    pts.push(new THREE.Vector2(Math.max(0.001, r(x)), -x));
  }
  const g = new THREE.LatheGeometry(pts, around, Math.PI / 2, Math.PI);
  g.rotateZ(Math.PI / 2);
  return g;
}

/** A thin full tube along x at height y (vessels, the nerve cord). */
function rod(x0: number, x1: number, y: number, z: number, r: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, x1 - x0, 6, 1);
  g.rotateZ(Math.PI / 2);
  g.translate((x0 + x1) / 2, y, z);
  return g;
}

const lambert = (color: number, vertexColors = false): THREE.MeshLambertMaterial =>
  new THREE.MeshLambertMaterial({ color, vertexColors, side: THREE.DoubleSide });

const SPIT_N = 10;
const SAND_N = 11;
const CRUMB_N = 18;
const CAST_N = 6;
const SOAK_N = 16;

/**
 * Inside a nightcrawler, cut open lengthwise (the layout from school dissection guides,
 * docs/codev/research/eating.md): the body wall with its segments and septa, the mouth and its
 * lobe, pharynx, brain, esophagus with the five pairs of hearts, crop, gizzard, intestine, blood
 * vessels and nerve cord; and the food's trip through them (script.ts). Allocates nothing per frame.
 */
export class Inside {
  readonly group = new THREE.Group();
  private readonly pharynx = new THREE.Group();
  private readonly lobe = new THREE.Group();
  private readonly crop: THREE.Mesh;
  private readonly gizzard = new THREE.Group();
  private readonly bite: THREE.Mesh;
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

  constructor() {
    const rand = mulberry32(7);
    // Body wall: muscle inside, darker grooves between segments, the clitellum's band.
    const wall = halfTube(0, TAIL, SEG / 4, bodyRadius, 20);
    const pos = wall.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const [c0, c1] = PARTS.clitellum;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const f = (x / SEG) % 1;
      const groove = Math.min(f, 1 - f) < 0.08 ? 0.78 : 1;
      c.setHex(x > c0 && x < c1 ? 0xe0987a : 0xeab4a4).multiplyScalar(groove);
      c.toArray(col, i * 3);
    }
    wall.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.group.add(new THREE.Mesh(wall, lambert(0xffffff, true)));
    // The skin at the cut: a darker strip along the top and bottom edges, as thick as the skin.
    this.group.add(new THREE.Mesh(skinEdges(), lambert(0x8e4a3c)));
    // Septa: thin walls between segments, with a hole for the gut (none in the first few).
    const septum = new THREE.Shape();
    septum.absarc(0, 0, 1, -Math.PI / 2, Math.PI / 2, false);
    septum.absarc(0, 0, 0.56, Math.PI / 2, -Math.PI / 2, true);
    const sg = new THREE.ExtrudeGeometry(septum, { depth: 0.035, bevelEnabled: false, curveSegments: 10 });
    sg.rotateY(Math.PI / 2);
    const first = 6;
    const septa = new THREE.InstancedMesh(sg, lambert(0xf3d2c6), SEGMENTS - first);
    for (let i = first; i < SEGMENTS; i++) {
      const x = i * SEG;
      const r = bodyRadius(x) * 0.98;
      this.m.compose(this.p.set(x, 0, 0), this.q.identity(), this.s.set(1, r, r));
      septa.setMatrixAt(i - first, this.m);
    }
    this.group.add(septa);

    // Mouth lobe (the prostomium), hinged at the top of the mouth.
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), lambert(0x9b5442));
    lobe.scale.set(0.32, 0.18, 0.32);
    lobe.position.set(-0.14, 0.02, -0.12);
    this.lobe.add(lobe);
    this.lobe.position.set(0.05, 0.34, 0);
    this.group.add(this.lobe);
    // Pharynx, built from its back end (x = 1.6) forward, so it can stretch out of the mouth;
    // with the muscles that pull it.
    const [p0, p1] = PARTS.pharynx;
    const len = p1 - p0;
    const ph = halfTube(-len, 0, 0.05, (x) => 0.2 + 0.24 * Math.sin(Math.PI * Math.min(1, (x + len) / len) ** 0.8), 14);
    this.pharynx.add(new THREE.Mesh(ph, lambert(0xd47a6a)));
    this.pharynx.position.x = p1;
    // The muscles that pull it back, from its sides to the body wall (they stay put as it reaches).
    const muscles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 5), lambert(0xc78878), 6);
    for (let i = 0; i < 6; i++) {
      const up = i % 2 === 0 ? 1 : -1;
      const x = 0.95 + Math.floor(i / 2) * 0.25;
      const r = bodyRadius(x) * 0.95;
      this.m.compose(this.p.set(x, up * (0.36 + r) / 2, -0.2), this.q.setFromEuler(this.e.set(0, 0, up * 0.3)), this.s.set(1, r - 0.36, 1));
      muscles.setMatrixAt(i, this.m);
    }
    this.group.add(muscles);
    this.group.add(this.pharynx);
    // Brain, over the pharynx.
    const brain = mergeGeometries([new THREE.SphereGeometry(0.12, 10, 8).translate(0, 0, -0.12), new THREE.SphereGeometry(0.12, 10, 8).translate(0.05, 0, -0.34)]);
    brain.translate(0.9, 0.62, 0);
    this.group.add(new THREE.Mesh(brain, lambert(0xf0dc9a)));
    // Esophagus, and the five pairs of hearts looped round it (half loops: the near half is cut away).
    const [e0, e1] = PARTS.esophagus;
    this.group.add(new THREE.Mesh(halfTube(e0, e1, 0.1, () => 0.15), lambert(0xd9a77e)));
    // Each loop runs from the blood vessel on top round the esophagus to the one underneath.
    const loop = new THREE.TorusGeometry(0.68, 0.055, 6, 18, Math.PI);
    loop.rotateZ(-Math.PI / 2);
    loop.rotateY(Math.PI / 2);
    const hearts = new THREE.InstancedMesh(loop, lambert(0xb3261e), PARTS.hearts.length);
    PARTS.hearts.forEach((x, i) => hearts.setMatrixAt(i, this.m.makeTranslation(x, 0.06, 0)));
    this.group.add(hearts);
    // Crop: a thin bag that swells as it fills.
    this.crop = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 10, Math.PI, Math.PI), lambert(0xe9c49a));
    this.crop.position.set(CROP_X, 0, 0);
    this.group.add(this.crop);
    // Gizzard: a thick muscle barrel with a narrow middle where the sand is.
    const [g0, g1] = PARTS.gizzard;
    const gw = (g1 - g0) / 2;
    const barrel = (r: number) => (x: number) => r * (0.85 + 0.15 * Math.cos((x / gw) * Math.PI * 0.5));
    this.gizzard.add(new THREE.Mesh(halfTube(-gw, gw, 0.05, barrel(0.55)), lambert(0x9c4a37)));
    this.gizzard.add(new THREE.Mesh(halfTube(-gw * 0.9, gw * 0.9, 0.05, barrel(0.3)).translate(0, 0, -0.02), lambert(0x6b4a33)));
    this.gizzard.position.x = GIZZARD_X;
    this.group.add(this.gizzard);
    // Intestine: one long tube to the back end, pinched where it passes each septum.
    const [i0, i1] = PARTS.intestine;
    const pinch = (x: number): number => {
      const f = (x / SEG) % 1;
      return Math.min(0.5, 0.5 * bodyRadius(x)) * (0.84 + 0.16 * Math.sin(f * Math.PI));
    };
    this.group.add(new THREE.Mesh(halfTube(i0, i1, SEG / 6, pinch, 12), lambert(0xc99a6a)));
    // Blood vessels along the top and bottom, and the nerve cord under the gut.
    this.group.add(new THREE.Mesh(mergeGeometries([rod(1.7, TAIL - 1.8, 0.74, 0, 0.06), rod(1.7, TAIL - 1.8, -0.62, 0, 0.05)]), lambert(0xb3261e)));
    this.group.add(new THREE.Mesh(rod(2.1, TAIL - 1.8, -0.84, 0, 0.05), lambert(0xf0dc9a)));
    // The burrow's soil behind the worm.
    const back = new THREE.PlaneGeometry(TAIL + 60, 24, 60, 8);
    back.translate(TAIL / 2, 0, -2.4);
    const bc = new Float32Array(back.attributes.position.count * 3);
    for (let i = 0; i < back.attributes.position.count; i++) c.setHex(0x3e2a1c).multiplyScalar(0.75 + rand() * 0.5).toArray(bc, i * 3);
    back.setAttribute('color', new THREE.BufferAttribute(bc, 3));
    this.group.add(new THREE.Mesh(back, lambert(0xffffff, true)));

    // The food: a bite of leaf, spit, sand in the gizzard, crumbs, casts, and food soaking out.
    const biteG = new THREE.ShapeGeometry(leafShape(0.5, 0.42), 4);
    biteG.translate(-0.25, 0, 0);
    this.bite = new THREE.Mesh(biteG, lambert(0x6f8226));
    this.group.add(this.bite);
    this.spit = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshLambertMaterial({ color: 0xe4f4ff, emissive: 0x24384a }), SPIT_N);
    this.sand = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.045, 0), lambert(0x9c9a92), SAND_N);
    this.crumbs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.07, 0.02), lambert(0x5f7020), CRUMB_N);
    this.castBits = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 8, 6), lambert(0x4a3426), CAST_N);
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

  pose(t: number): void {
    const o = this.offsets;
    const out = sample1(PHARYNX_OUT, t);
    const len = PARTS.pharynx[1] - PARTS.pharynx[0];
    // The front reaches from x = 0.3 out to the bite, about 1.45 further; the back stays put.
    this.pharynx.scale.set(1 + (out * 1.45) / len, 1 - out * 0.25, 1 - out * 0.25);
    this.lobe.rotation.z = -sample1(LOBE_UP, t) * 0.75;
    this.crop.scale.set(0.95 + sample1(CROP_FULL, t) * 0.3, 1 + sample1(CROP_FULL, t) * 0.25, 1 + sample1(CROP_FULL, t) * 0.25);
    const grinding = t > GRIND[0] && t < GRIND[1];
    const squeeze = grinding ? 0.5 - 0.5 * Math.cos((t - GRIND[0]) * SQUEEZE_HZ * Math.PI * 2) : 0;
    this.gizzard.scale.set(1, 1 - squeeze * 0.14, 1 - squeeze * 0.14);

    const [fx, fy] = sample(FOOD, t, this.food);
    const whole = sample1(WHOLE, t);
    const casting = sample1(CASTING, t);
    this.bite.visible = whole > 0.02;
    this.e.set(0, 0, grinding ? Math.sin(t * 2.1) * 0.8 : 0.2);
    this.bite.position.set(fx, fy, -0.05);
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
      this.m.compose(this.p.set(GIZZARD_X + o[i * 3] * 0.32 + j, o[i * 3 + 1] * 0.14 * (1 - squeeze * 0.3) - j, -0.05), this.q.identity(), this.s.setScalar(1));
      this.sand.setMatrixAt(i, this.m);
    }
    const crumbSize = (1 - whole) * (1 - casting);
    for (let i = 0; i < CRUMB_N; i++) {
      const j = grinding ? 0.04 * Math.sin(t * 2.7 + o[i * 3 + 2]) : 0;
      this.e.set(0, 0, o[i * 3 + 2] + (grinding ? t * 1.3 : 0));
      this.m.compose(this.p.set(fx + o[i * 3] * 0.3 + j, fy + o[i * 3 + 1] * 0.15, -0.03), this.q.setFromEuler(this.e), this.s.setScalar(crumbSize));
      this.crumbs.setMatrixAt(i, this.m);
    }
    for (let i = 0; i < CAST_N; i++) {
      this.m.compose(this.p.set(fx - i * 0.2, fy + o[i * 3 + 1] * 0.08, -0.04), this.q.identity(), this.s.set(casting * 1.3, casting, casting));
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
      this.m.compose(this.p.set(x0 - ride * 1.6, 0.12 + rise * 0.62, -0.02), this.q.identity(), this.s.setScalar(shown));
      this.soak.setMatrixAt(i, this.m);
    }
    for (const im of [this.spit, this.sand, this.crumbs, this.castBits, this.soak]) im.instanceMatrix.needsUpdate = true;
  }
}

/** Strips along the cut's top and bottom edges, as thick as the skin, facing the camera. */
function skinEdges(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [1, -1]) {
    const n = Math.round(TAIL / (SEG / 4));
    const pos = new Float32Array((n + 1) * 2 * 3);
    const idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const x = (TAIL * i) / n;
      const r = bodyRadius(x);
      pos.set([x, side * r, 0.001, x, side * (r - 0.12), 0.001], i * 6);
      if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g);
  }
  return mergeGeometries(parts);
}
