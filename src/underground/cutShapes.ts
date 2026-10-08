import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sharedLighting } from '../render/paintedMaterial';
import { icosphere, type MeshWriter } from '../surface/meshWriter';
import type { Slab } from './slab';
import { faceShade, smooth } from './faceLight';

/**
 * Shape writers for what stands in the cut (V2 spec 5.2), into a MeshWriter for the forest's prop
 * material ('aProp': linear rgb, then kind + parameter). Shapes are placed in the cut's own
 * coordinates: u along the cut, v the world height, d toward the camera (along the slab's normal).
 *
 * The prop material lights by the sun, the cut face (cutFaceGlsl.ts) does not: it darkens with
 * depth, warms near the top and dims past the playable slab. A Pen bakes that rule into the
 * colours, and for shapes half sunk in the face (`face` 1) it leans the normals toward the camera
 * and a little up, so the warm rim light does not ring them in the dark soil, and scales their
 * colour so they come out as bright as the face would paint the same colour on any slab, whichever
 * side of the cut the sun is on. Build-time only (once per dig): these allocate.
 */
const TAU = Math.PI * 2;

export interface Pen {
  readonly w: MeshWriter;
  readonly s: Slab;
  /** The normal of a shape flat on the face: toward the camera and a little up. */
  readonly fx: number;
  readonly fy: number;
  readonly fz: number;
  /** How much brighter such a shape's colour is baked, to make up for the sun missing it. */
  readonly k: number;
  /** True when (u, v, d) is a left-handed frame in the world (the camera on the slab's +1 side): windings swap. */
  readonly mirror: boolean;
}

/** The prop material's light (paintedLight, with average dapple) on normal n, as luminance. */
function lightOn(nx: number, ny: number, nz: number): number {
  const L = sharedLighting.uLightDir.value;
  const ndl = nx * L.x + ny * L.y + nz * L.z;
  const band = smooth(-0.02, 0.16, ndl) * (0.5 + 0.38 * smooth(0.4, 0.62, ndl)) * 0.8;
  const t = ny * 0.5 + 0.5;
  const sky = sharedLighting.uSkyColor.value;
  const ground = sharedLighting.uGroundColor.value;
  const sun = sharedLighting.uLightColor.value;
  const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return (lum(ground) + (lum(sky) - lum(ground)) * t) * 0.68 + lum(sun) * band;
}

export function createPen(w: MeshWriter, s: Slab): Pen {
  const l = Math.hypot(1, 0.45);
  const fx = s.nx / l;
  const fy = 0.45 / l;
  const fz = s.nz / l;
  return { w, s, fx, fy, fz, k: 1 / lightOn(fx, fy, fz), mirror: s.tx * s.nz - s.tz * s.nx < 0 };
}

const col = new THREE.Color();
const tmp = new THREE.Vector3();

/** World position of plane point (u, v) standing d toward the camera. */
export function at(s: Slab, u: number, v: number, d: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(s.ox + s.tx * u + s.nx * d, v, s.oz + s.tz * u + s.nz * d);
}

/**
 * Adds a vertex at plane point (u, v, d) with world normal (nx, ny, nz) leaned `face` (0..1) toward
 * the pen's flat-on-face normal, coloured `hex` times `mul`, shaded as the face is at that point
 * (and brightened as much as the lean needs), kind code `code` (PROP kind + parameter).
 */
export function dot(
  p: Pen, u: number, v: number, d: number, nx: number, ny: number, nz: number, face: number,
  hex: string | THREE.Color, mul: number, code: number,
): number {
  if (typeof hex === 'string') col.set(hex);
  else col.copy(hex);
  col.multiplyScalar(mul * faceShade(p.s, u, v) * (1 + (p.k - 1) * face));
  at(p.s, u, v, d, tmp);
  return p.w.vertex(
    tmp.x, tmp.y, tmp.z,
    nx * (1 - face) + p.fx * face, ny * (1 - face) + p.fy * face, nz * (1 - face) + p.fz * face,
    [col.r, col.g, col.b, code],
  );
}

let ico2: { pos: Float32Array; index: ArrayLike<number> } | null = null;
/** A unit icosphere of detail 3 (162 vertices): rounder than meshWriter's (42) for shapes seen up close. */
export function roundSphere(): { pos: Float32Array; index: ArrayLike<number> } {
  if (ico2) return ico2;
  const g = new THREE.IcosahedronGeometry(1, 3);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const m = mergeVertices(g);
  ico2 = { pos: m.getAttribute('position').array as Float32Array, index: m.getIndex()!.array };
  return ico2;
}

export interface BlobLook {
  /** Colour of the unit sphere point (x, y, z) (x along the blob's u axis, y up, z toward the camera), and its brightness. */
  hex: (x: number, y: number, z: number) => string | THREE.Color;
  mul?: (x: number, y: number, z: number) => number;
  code: number;
  face: number;
  /** Lumpiness (0.1: a pebble) and its seed. */
  lump: number;
  seed: number;
  /** Pulls the two halves (x < 0, x > 0) this far apart along u: a capsule, not an ellipsoid. */
  stretch?: number;
  /** A rounder sphere (162 vertices, not 42), for big or close-up shapes. */
  fine?: boolean;
  /** Shape the unit sphere point before scaling (a pear, a dome): returns its radius scale. */
  shape?: (x: number, y: number, z: number) => number;
}

/**
 * A lumpy ellipsoid centred at plane point (u, v, d): radii ru along the cut, rv up and rd toward
 * the camera, turned `rot` in the plane.
 */
export function writeBlob(
  p: Pen, u: number, v: number, d: number, ru: number, rv: number, rd: number, rot: number, look: BlobLook,
): void {
  const { pos, index } = look.fine ? roundSphere() : icosphere();
  const w = p.w;
  const first = w.vertexCount;
  const firstIdx = w.idx.length;
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  const sd = look.seed * 17.3;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i];
    const y = pos[i + 1];
    const z = pos[i + 2];
    const lump = (1 + look.lump * Math.sin(2.7 * x + 1.9 * z + sd) * Math.cos(2.3 * y + sd * 0.3)) * (look.shape ? look.shape(x, y, z) : 1);
    const a = x * ru * lump + Math.sign(x) * (look.stretch ?? 0);
    const b = y * rv * lump;
    dot(p, u + a * c - b * sn, v + a * sn + b * c, d + z * rd * lump, 0, 1, 0, look.face, look.hex(x, y, z), look.mul ? look.mul(x, y, z) : 1, look.code);
  }
  const [b, c2] = p.mirror ? [2, 1] : [1, 2];
  for (let i = 0; i < index.length; i += 3) w.tri(first + index[i], first + index[i + b], first + index[i + c2]);
  w.smoothNormals(first, firstIdx);
  if (look.face > 0) leanNormals(p, first, look.face);
}

/** Leans the normals of vertices [first..) `face` of the way to the pen's flat-on-face normal. */
export function leanNormals(p: Pen, first: number, face: number): void {
  const n = p.w.nor;
  for (let v = first * 3; v < n.length; v += 3) {
    const x = n[v] * (1 - face) + p.fx * face;
    const y = n[v + 1] * (1 - face) + p.fy * face;
    const z = n[v + 2] * (1 - face) + p.fz * face;
    const l = Math.hypot(x, y, z) || 1;
    n[v] = x / l; n[v + 1] = y / l; n[v + 2] = z / l;
  }
}

/**
 * A tube through plane points (u[i], v[i], d[i]) with radius r[i], `sides` round: roots, stalks,
 * legs, the snail's whorl. `hex(i, a)` colours point i at angle a round it (a = PI/2 faces the camera
 * for a tube in the plane), lit from above by `up` (brighter on top, darker below); the parameter
 * of its kind code runs 0..1 along it. With `sharp`, each bend in the plane gets three rings
 * (square to the way in, the bisector, square to the way out), so the tube's outline is its
 * capsules' to within a few thousandths: straight sides meeting in the crease inside a bend, round
 * outside it. (A bend toward or away from the camera, as a root sinking into the wall, gets one.)
 */
export function writeTube(
  p: Pen, u: readonly number[], v: readonly number[], d: readonly number[], r: readonly number[],
  hex: (i: number, a: number) => string | THREE.Color, kind: number, sides: number, face: number, up = 0, sharp = false,
): void {
  const w = p.w;
  const first = w.vertexCount;
  const n = u.length;
  let rows = 0;
  for (let i = 0; i < n; i++) {
    if (sharp && i > 0 && i < n - 1 && d[i - 1] === d[i] && d[i + 1] === d[i]) {
      ring(p, u, v, d, r, i, i - 1, i, hex, kind, sides, face, up, true);
      ring(p, u, v, d, r, i, i - 1, i + 1, hex, kind, sides, face, up, true);
      ring(p, u, v, d, r, i, i, i + 1, hex, kind, sides, face, up, true);
      rows += 3;
    } else {
      ring(p, u, v, d, r, i, Math.max(0, i - 1), Math.min(n - 1, i + 1), hex, kind, sides, face, up);
      rows++;
    }
  }
  w.grid(first, rows, sides + 1, p.mirror);
}

/** One ring of writeTube round point i, square to the way from point a to point b. */
function ring(
  p: Pen, u: readonly number[], v: readonly number[], d: readonly number[], r: readonly number[], i: number, a: number, b: number,
  hex: (i: number, a: number) => string | THREE.Color, kind: number, sides: number, face: number, up: number,
  joint = false,
): void {
  const s = p.s;
  const n = u.length;
  // At a bend in the plane, the half of the ring inside it sits on the crease where the two
  // segments' surfaces meet (the same for all three of the bend's rings, so they never fold over).
  let iu = 0;
  let iv = 0;
  let miter = 0;
  if (joint && d[i - 1] === d[i] && d[i + 1] === d[i]) {
    const l1 = Math.hypot(u[i] - u[i - 1], v[i] - v[i - 1]) || 1;
    const l2 = Math.hypot(u[i + 1] - u[i], v[i + 1] - v[i]) || 1;
    const au = (u[i] - u[i - 1]) / l1;
    const av = (v[i] - v[i - 1]) / l1;
    const bu = (u[i + 1] - u[i]) / l2;
    const bv = (v[i + 1] - v[i]) / l2;
    const half = Math.hypot(au + bu, av + bv) / 2;
    const il = Math.hypot(bu - au, bv - av);
    if (il > 1e-6 && half > 0.2) { iu = (bu - au) / il; iv = (bv - av) / il; miter = 1 / half; }
  }
  // Tangent in (u, v, d) and a frame round it: `side` across it in the plane where it can be.
  let tu = u[b] - u[a];
  let tv = v[b] - v[a];
  let td = d[b] - d[a];
  const tl = Math.hypot(tu, tv, td) || 1;
  tu /= tl; tv /= tl; td /= tl;
  // side = t x (0, 0, 1) in (u, v, d), or t x (0, 1, 0) for a tube pointing at the camera.
  let su = tv;
  let sv = -tu;
  let sd = 0;
  if (Math.hypot(su, sv) < 0.2) { su = -td; sv = 0; sd = tu; }
  const sl = Math.hypot(su, sv, sd) || 1;
  su /= sl; sv /= sl; sd /= sl;
  // out = side x t
  const ou = sv * td - sd * tv;
  const ov = sd * tu - su * td;
  const od = su * tv - sv * tu;
  for (let k = 0; k <= sides; k++) {
    const ang = (k / sides) * TAU;
    const cs = Math.cos(ang);
    const sn = Math.sin(ang);
    const nu = su * cs + ou * sn;
    const nv = sv * cs + ov * sn;
    const nd = sd * cs + od * sn;
    // How far this vertex lies toward the inside of the bend (in the plane).
    const inward = (su * iu + sv * iv) * cs;
    const pu = miter && inward > 0 ? iu * Math.abs(cs) * miter : nu;
    const pv = miter && inward > 0 ? iv * Math.abs(cs) * miter : nv;
    dot(
      p, u[i] + pu * r[i], v[i] + pv * r[i], d[i] + nd * r[i],
      s.tx * nu + s.nx * nd, nv, s.tz * nu + s.nz * nd, face,
      hex(i, ang), Math.max(0.3, 1 + up * nv), kind + Math.min(0.99, i / Math.max(1, n - 1)),
    );
  }
}
