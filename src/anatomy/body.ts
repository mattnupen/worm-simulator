import * as THREE from 'three';
import { fbm2 } from '../core/noise';
import {
  CLITELLUM, LENGTH, ORGANS, PROSTOMIUM, SEGMENTS, WALL, TUBERCULA, flatten, halfWidth, segStart, segmentAt,
  segmentLength, smooth,
} from './layout';

/**
 * The body's surface as a function of (x, angle round the body, depth into the wall). Every layer
 * of the wall, and every organ placed against it, asks this one function where the wall is, so
 * nothing pokes through it. Angle 0 is the dorsal midline and pi/2 the worm's left (+z).
 */

/** The front of the body: the tip of the prostomium. */
export const TUBE_FRONT = -PROSTOMIUM;
/** Where the head's rounded front ends and the ordinary body begins. */
const HEAD_END = 0.75;

/** How much of the full half-width the head's front has at x (0 at the very front). */
function headTaper(x: number): number {
  if (x >= HEAD_END) return 1;
  const t = (HEAD_END - x) / (HEAD_END - TUBE_FRONT);
  return Math.sqrt(Math.max(0, 1 - t * t));
}

/** The tip sits a little high: the prostomium overhangs the mouth. */
function headLift(x: number, w: number): number {
  if (x >= HEAD_END) return 0;
  const t = (HEAD_END - x) / (HEAD_END - TUBE_FRONT);
  return w * 0.16 * t * t;
}

/**
 * The prostomium's outline as an angle from the dorsal midline at x: round the front from the
 * mouth's corners, then its tongue runs back over segment 1 to the 1/2 furrow (tanylobic).
 */
function prostomiumEdge(x: number): number {
  if (x < -0.3) return 2.2;
  if (x < 0.25) return 2.2 + (0.45 - 2.2) * smooth(-0.3, 0.25, x);
  return 0.45 - 0.1 * smooth(0.25, segStart(2), x);
}

/** The middle of the prostomium (where its nerves end). */
export function prostomiumCentre(out: THREE.Vector3): THREE.Vector3 {
  return out.set(-0.55, halfWidth(1) * 0.32, 0);
}

/** 1 in an intersegmental furrow, falling to 0 within ~0.1 mm of it. */
export function furrow(x: number): number {
  const s = segmentAt(x);
  if (s < 2 || s > SEGMENTS) return 0;
  const n = Math.floor(s);
  const d = Math.min(x - segStart(n), segStart(n + 1) - x);
  return Math.exp(-(d / 0.07) * (d / 0.07));
}

/** 1 over the back and sides of the clitellum's segments, fading out low on the sides. */
export function saddle(s: number, th: number): number {
  const along = smooth(CLITELLUM[0] - 0.35, CLITELLUM[0] + 0.5, s) * smooth(CLITELLUM[1] + 1.35, CLITELLUM[1] + 0.5, s);
  return along * smooth(-0.45, -0.02, Math.cos(th));
}

const angleDist = (a: number, b: number): number => {
  const d = Math.abs(((a - b) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
  return d;
};

/** Raised glandular lips round the male pores (segment 15) and the tubercula ridges (33 to 36). */
function swellings(s: number, th: number): number {
  let k = 0;
  const side = Math.min(angleDist(th, Math.PI - 0.78), angleDist(th, Math.PI + 0.78));
  if (s > ORGANS.malePores - 0.6 && s < ORGANS.malePores + 1.6) {
    const a = (s - (ORGANS.malePores + 0.5)) / 0.95;
    const b = side / 0.3;
    const q = Math.max(0, 1 - a * a - b * b);
    k += 0.07 * q * q * (3 - 2 * q);
  }
  if (s > TUBERCULA[0] && s < TUBERCULA[1] + 1) {
    const tp = Math.min(angleDist(th, Math.PI - 0.95), angleDist(th, Math.PI + 0.95));
    k += 0.035 * Math.exp(-(tp / 0.1) * (tp / 0.1)) * smooth(TUBERCULA[0], TUBERCULA[0] + 0.3, s) * smooth(TUBERCULA[1] + 1, TUBERCULA[1] + 0.7, s);
  }
  return k;
}

export interface BodySample {
  /** Segment position (3.5 = middle of segment 3). */
  s: number;
  /** Half-width and height of the cross-section here (outer skin, no furrows). */
  w: number;
  h: number;
  /** Height of the body's centre line (raised at the head's tip). */
  yc: number;
}

export function sampleBody(x: number, out: BodySample): BodySample {
  const s = segmentAt(x);
  const taper = headTaper(x);
  const w0 = halfWidth(Math.max(1, s));
  out.s = s;
  out.w = w0 * taper;
  out.h = out.w * flatten(s);
  out.yc = headLift(x, w0);
  return out;
}

const tmp: BodySample = { s: 0, w: 0, h: 0, yc: 0 };

/**
 * A point on the body wall: `depth` 0 is the outer skin (with its furrows and swellings), and
 * larger depths (fractions of the half-width) run inward through the wall, smoother each layer.
 */
export function bodyPoint(x: number, th: number, depth: number, out: THREE.Vector3): THREE.Vector3 {
  const b = sampleBody(x, tmp);
  const sharp = Math.max(0, 1 - depth * 6);
  let k = 1 - depth;
  const g = furrow(x);
  const sad = saddle(b.s, th);
  k -= g * (0.024 - 0.013 * sad) * sharp;
  if (b.s >= 2 && b.s <= SEGMENTS) {
    const f = b.s % 1;
    k += 0.004 * Math.sin(f * Math.PI) * sharp;
  }
  // The clitellum is a saddle: swollen over the back and sides, not under the belly.
  k += 0.19 * sad * Math.max(0, 1 - depth * 3);
  if (depth === 0) {
    k += swellings(b.s, th);
    if (x < segStart(2)) {
      // Distance to the outline across the surface, in mm, so the groove keeps its width where
      // the outline turns round the front.
      const slope = (prostomiumEdge(x + 0.01) - prostomiumEdge(x - 0.01)) / 0.02;
      const d = (Math.abs(angleDist(th, 0) - prostomiumEdge(x)) * b.w) / Math.sqrt(1 + slope * slope * b.w * b.w);
      k -= 0.028 * Math.exp(-(d / 0.11) * (d / 0.11)) * smooth(TUBE_FRONT + 0.35, TUBE_FRONT + 0.8, x) * smooth(segStart(2), segStart(2) - 0.15, x);
      k -= 0.16 * mouthMask(x, th);
    }
    if (x > LENGTH - 0.6) k -= 0.05 * anusMask(x, th);
  }
  const c = Math.cos(th);
  // The belly is a little flat; behind the clitellum the whole section flattens into a paddle,
  // squarer at its edges.
  const paddle = smooth(60, SEGMENTS - 4, b.s);
  const sq = 1 - 0.35 * paddle;
  const y = c >= 0 ? Math.pow(c, sq) * b.h : -Math.pow(-c, 0.8 * sq) * b.h * 0.95;
  return out.set(x, b.yc + y * k, Math.sin(th) * b.w * k);
}

const tmp2: BodySample = { s: 0, w: 0, h: 0, yc: 0 };

/** A point `mm` millimetres in from the inner face of the body wall (for organs lying against it). */
export function insideWall(x: number, th: number, mm: number, out: THREE.Vector3): THREE.Vector3 {
  const w = Math.max(0.3, sampleBody(x, tmp2).w);
  return bodyPoint(x, th, WALL.epidermis + WALL.circular + WALL.longitudinal + mm / w, out);
}

/** The mouth: a crescent under the prostomium, on the front of segment 1. */
export function mouthMask(x: number, th: number): number {
  const a = angleDist(th, Math.PI);
  return smooth(1.0, 0.55, a) * smooth(-0.6, -0.25, x) * smooth(0.5, 0.15, x);
}

/** The anus: an up-and-down slit at the tail tip. */
export function anusMask(x: number, th: number): number {
  const a = Math.min(angleDist(th, 0), angleDist(th, Math.PI));
  return smooth(0.5, 0.15, Math.PI / 2 - Math.abs(Math.PI / 2 - a)) * smooth(LENGTH - 0.6, LENGTH - 0.05, x);
}

const C = {
  belly: new THREE.Color('#e6c3a2'),
  dorsalFront: new THREE.Color('#45161f'),
  dorsalBack: new THREE.Color('#6e3a40'),
  tip: new THREE.Color('#c48a78'),
  tail: new THREE.Color('#d9a690'),
  clitellum: new THREE.Color('#b0684e'),
  gland: new THREE.Color('#e7c0a6'),
  dark: new THREE.Color('#3a1418'),
  vessel: new THREE.Color('#6a1422'),
};
const work = new THREE.Color();

/** The skin's colour at x and angle th: dark reddish-brown back, pale belly, an orange-brown saddle. */
export function skinColor(x: number, th: number, out: THREE.Color): THREE.Color {
  const s = segmentAt(x);
  const d = Math.cos(th);
  const back = smooth(-0.45, 0.85, d);
  const fade = smooth(50, 150, s);
  work.copy(C.dorsalFront).lerp(C.dorsalBack, fade);
  out.copy(C.belly).lerp(work, back * (0.96 - 0.3 * fade));
  // The clitellum: a saddle over the back and sides, not under the belly.
  const clit = saddle(s, th);
  out.lerp(C.clitellum, clit * 0.7);
  // Its glandular surface: a fine, even grain.
  out.multiplyScalar(1 + clit * (fbm2(x * 16, th * 30, 2, 23, 0) - 0.5) * 0.18);
  // Furrows show paler, with fewer pigment cells; the dorsal vessel shows through the back.
  out.multiplyScalar(1 - furrow(x) * 0.2 * (1 - clit));
  const mid = Math.exp(-(th / 0.07) * (th / 0.07)) + Math.exp(-(((2 * Math.PI - th) / 0.07) ** 2));
  out.lerp(C.vessel, mid * 0.28 * (1 - fade * 0.6) * smooth(3, 8, s));
  const sw = swellings(s, th);
  out.lerp(C.gland, Math.min(1, sw * 9));
  if (s >= ORGANS.firstDorsalPore && furrow(x) > 0.75 && Math.min(th, 2 * Math.PI - th) < 0.025) out.lerp(C.dark, 0.3);
  const n = fbm2(x * 0.9, th * 6, 3, 11, 0) - 0.5;
  out.multiplyScalar(1 + n * 0.12);
  // The prostomium's tip is one even colour (back and belly tones meet there in a point otherwise).
  out.lerp(C.tip, smooth(-0.35, TUBE_FRONT + 0.25, x));
  // Same at the tail tip, round the anus.
  out.lerp(C.tail, smooth(LENGTH - 0.9, LENGTH - 0.25, x));
  if (x < 1) out.lerp(C.dark, mouthMask(x, th) * 0.85);
  if (x > LENGTH - 1) out.lerp(C.dark, anusMask(x, th) * 0.45);
  return out;
}

/**
 * Ring positions along the body: dense at the head and tail tips and near every furrow, so the
 * furrows stay crisp without wasting rings on the flat middle of each segment.
 */
export function ringXs(perSegment: (n: number) => number, headRings = 64): number[] {
  const xs: number[] = [];
  for (let i = 0; i < headRings; i++) {
    const t = i / headRings;
    xs.push(TUBE_FRONT + (HEAD_END - TUBE_FRONT) * Math.pow(t, 1.6));
  }
  xs.push(HEAD_END);
  const k = 0.82;
  xs.push((HEAD_END + segStart(2)) / 2);
  for (let n = 2; n <= SEGMENTS; n++) {
    const K = perSegment(n);
    const len = segmentLength(n);
    for (let i = 0; i < K; i++) {
      const u = i / K;
      xs.push(segStart(n) + len * (u - (k * Math.sin(2 * Math.PI * u)) / (2 * Math.PI)));
    }
  }
  // The last segment closes to the anus.
  const last = xs[xs.length - 1];
  for (let i = 1; i <= 8; i++) xs.push(last + (LENGTH - last) * Math.sin((i / 8) * (Math.PI / 2)));
  return xs;
}
