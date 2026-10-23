import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/random';
import { sample, sample1 } from '../opening/keys';
import { detailShape } from '../surface/detailShape';
import { LEAF_KINDS, type LeafKind } from '../surface/leafLitter';
import { leafTint } from '../surface/leafPalette';
import { HeroWorm, WAVES, WORM_RADIUS, type WormPose } from '../worm/wormMesh';
import { CASTS, CASTS_AFTER, FEEL, GRAB_AT, LEAF_LENGTH, LEAF_TIP_X, LIP, REACH } from './script';

/**
 * The worm: the game's own (HeroWorm, Matt 2026-10-23: "use the same worm model"), as long as
 * the game's (3.5), on a spine of this many points. Its head tip reaches HEAD_EXT past the first.
 */
const SPINE = 16;
const WORM_LENGTH = 3.5;
const HEAD_EXT = 0.1;
const SPACING = (WORM_LENGTH - HEAD_EXT - 0.06) / (SPINE - 1);
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

/**
 * One of the game's leaves (its species outline, detailShape.ts; Matt 2026-10-23: "use the same
 * leaf models from the game"), lying flat in xz and facing up, its tip at the origin and its stem
 * end `length` along +x, cupped a little. Its veins and edge are a shade darker (vertex colours,
 * times the leaf's own colour).
 */
export function gameLeaf(kind: LeafKind, length: number): THREE.BufferGeometry {
  const sh = detailShape(kind);
  const tipY = sh.points[sh.tip * 2 + 1];
  const k = length / (tipY - sh.points[sh.base * 2 + 1]);
  const n = sh.points.length / 2;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const lx = sh.points[i * 2] * k;
    pos[i * 3] = (tipY - sh.points[i * 2 + 1]) * k;
    pos[i * 3 + 1] = 0.12 * lx * lx / length;
    pos[i * 3 + 2] = lx;
    const shade = (1 - 0.22 * sh.vein[i]) * (i < sh.outline ? 0.88 : 1);
    col.fill(shade, i * 3, i * 3 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(sh.indices, 1));
  g.computeVertexNormals();
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
  private readonly worm = new HeroWorm(SPINE);
  private readonly wormPose: WormPose = { spine: new Float32Array(SPINE * 3), phase: 0, activity: 0, timeSec: 0 };
  private readonly leaf: THREE.Mesh;
  /** Half the pulled leaf's width. */
  private readonly leafHalf: number;
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

    // Fallen leaves on top, the game's five kinds in its fall colours, away from the burrow's mouth.
    const edge = new THREE.Color();
    const stem = new THREE.Color();
    const PER_KIND = 14;
    for (const kind of LEAF_KINDS) {
      const litter = new THREE.InstancedMesh(gameLeaf(kind, 0.9), lambert(0xffffff, true), PER_KIND);
      for (let i = 0; i < PER_KIND; i++) {
        let x = 0;
        let z = 0;
        do {
          x = (rand() * 2 - 1) * 6;
          z = -0.25 - rand() * 7;
        } while (Math.hypot(x - 0.2, z + 0.25) < 0.7 || (x > 0.5 && x < 2.3 && z > -1));
        this.e.set(rand() * 0.2, rand() * Math.PI * 2, rand() * 0.2);
        const k = 0.7 + rand() * 0.6;
        this.m.compose(this.p.set(x, 0.01 + rand() * 0.05, z), this.q.setFromEuler(this.e), this.s.set(k, k, k));
        litter.setMatrixAt(i, this.m);
        leafTint(kind, 0.03, rand, c, edge, stem);
        litter.setColorAt(i, c);
      }
      this.group.add(litter);
    }

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
    const pulled = gameLeaf('basswood', LEAF_LENGTH);
    pulled.computeBoundingBox();
    this.leafHalf = Math.max(pulled.boundingBox!.max.z, -pulled.boundingBox!.min.z);
    this.leaf = new THREE.Mesh(pulled, lambert(BASSWOOD, true));
    this.group.add(this.leaf);

    // The worm. In the cut its back faces the camera (the body runs up the burrow, so "up" can't
    // be the sky), and its contact shadow is off.
    this.worm.up.x = 0; this.worm.up.y = 0; this.worm.up.z = 1;
    this.worm.showShadow(false);
    this.group.add(this.worm.group);
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
    const spine = this.wormPose.spine;
    for (let i = 0; i < SPINE; i++) {
      const u = reach - HEAD_EXT - i * SPACING;
      this.along(u, pt);
      // Out on the leaves it lies a little back from the cut, and its front sways as it feels.
      const out = Math.min(1, Math.max(0, u / 0.4));
      const front = Math.max(0, 1 - i / 3);
      const sway = feel * front * 0.16 * Math.sin(t * 2.3 - i * 1.6);
      const lift = feel * front * 0.05 * (1 + Math.sin(t * 1.7));
      // The spine is the belly line: a body radius under the old centre line.
      spine[i * 3] = pt[0];
      spine[i * 3 + 1] = pt[1] + lift - WORM_RADIUS;
      spine[i * 3 + 2] = -0.24 * out + sway;
    }
    // Its rings ripple along it as it moves, as in the game.
    const speed = Math.abs(sample1(REACH, t + 0.05) - sample1(REACH, t - 0.05)) / 0.1;
    this.wormPose.phase = (reach * WAVES) / WORM_LENGTH;
    this.wormPose.activity = Math.min(1, speed * 1.5);
    this.wormPose.timeSec = t;
    this.worm.update(this.wormPose);
    this.along(reach, pt);
    this.head.set(pt[0], pt[1], -0.24 * Math.min(1, Math.max(0, reach / 0.4)));
    this.headDir.set(pt[2], pt[3], 0);

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
      // Going down, it rolls tight enough to fit the burrow; on top, it stands on its edge.
      const roll = (Math.PI / 2) * Math.min(1, (t - GRAB_AT) / 1.2);
      const down = Math.min(1, drop / 0.25);
      const across = 1 - 0.62 * down;
      this.leaf.rotation.set(roll, 0, Math.asin(drop / LEAF_LENGTH), 'ZYX');
      this.leaf.scale.set(1, 1, across);
      this.leaf.position.y += this.leafHalf * across * Math.sin(roll) * (1 - down);
    }
    this.casts.count = Math.round(sample(CASTS, t, this.pt)[0]);
  }
}

/** The game's basswood fall colour, a shade darker for the dusk. */
const BASSWOOD = 0xc99a36;

function set(out: number[], a: number, b: number, c: number, d: number): number[] {
  out[0] = a;
  out[1] = b;
  out[2] = c;
  out[3] = d;
  return out;
}
