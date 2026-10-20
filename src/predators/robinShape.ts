import type { MeshWriter } from '../surface/meshWriter';
import { lin, loft, mix, ripple, shade, smooth, tube, type LoftPoint, type Rgb } from './robinGeom';

/**
 * The American robin's shape and markings, built once at load (V4). Bird frame, in centimetres:
 * feet on y = 0, facing +z, x to its right. An adult is about 25 cm from bill to tail tip (Cornell,
 * All About Birds, "American Robin": length 20-28 cm, wingspan 31-41 cm). Markings follow the same
 * page and field photos: blackish head with a broken white eye ring, white throat with dark streaks,
 * yellow bill, grey-brown back and wings, brick-orange breast, white lower belly and undertail.
 * The pale tips on the breast feathers follow fall field photos. The painted material adds the
 * brush texture.
 *
 * Each part is written at its rest place in the bird frame; robin.ts moves them round the pivots
 * below. Build-time only.
 */

// sRGB colours, as linear rgb.
const BACK = lin(0x605852);
const NAPE = lin(0x3a3632);
const HEAD = lin(0x272422);
const BREAST = lin(0xbf5527);
const BREAST_TIP = lin(0xd9a074);
const FLANK = lin(0xa4491f);
const WHITE = lin(0xe9e4d9);
const THIGH = lin(0x8a7d72);
const EYE = lin(0x15100d);
const GLINT = lin(0xe2ddd3);
const BILL = lin(0xe1aa2b);
const BILL_TIP = lin(0x5e4b23);
const WING = lin(0x5c554f);
const WING_EDGE = lin(0x8d847a);
const PRIMARY = lin(0x3c3733);
const TAIL = lin(0x2d2926);
const LEG = lin(0x4d3f37);

/** Body: an egg along an axis tilted up 38° at the front, an alert standing posture (our choice). */
const BODY = { cy: 7.5, cz: 0.5, tilt: (38 * Math.PI) / 180, length: 13.5, rx: 3.2, up: 2.8, down: 4.0 };
const SIN_T = Math.sin(BODY.tilt);
const COS_T = Math.cos(BODY.tilt);

/** Head centre (cm) and its size. */
const HEAD_AT = { y: 12.0, z: 5.6, back: 2.1, front: 2.3, rx: 1.8, up: 1.9, down: 1.85 };

/** Where the parts turn (bird frame, cm). */
export const PIVOTS = {
  /** The body leans round the hips, over the feet. */
  hip: [0, 4.5, 0.6],
  /** The head tips and turns here. */
  neck: [0, 11.0, 4.9],
  /** The lower bill opens here. */
  gape: [0, HEAD_AT.y - 0.35, HEAD_AT.z + 1.85],
  /** The tail lifts and fans from the rump. */
  rump: [0, 4.6, -3.6],
  /** The open wings flap from the shoulders (x is ±). */
  shoulder: [1.8, 10.0, 3.2],
} as const;

/** Body thickness factor along its axis (0 rump, 1 neck): fullest just in front of the middle. */
function bodyFullness(s: number): number {
  const t = Math.min(1, Math.max(0, s));
  return Math.pow(Math.sin(Math.PI * Math.pow(t, 1.25)), 0.65);
}

/** A point on the body's skin: s along it, a round it from the top (0) toward its right (π/2). */
function bodyPoint(s: number, a: number, grow = 0, minFull = 0): [number, number, number] {
  const f = Math.max(bodyFullness(s), minFull);
  const along = (s - 0.5) * BODY.length;
  const ca = Math.cos(a);
  const ry = (ca > 0 ? BODY.up : BODY.down) * f + grow;
  const rx = BODY.rx * f + grow;
  const side = Math.sin(a) * rx;
  const lift = ca * ry;
  return [side, BODY.cy + SIN_T * along + COS_T * lift, BODY.cz + COS_T * along - SIN_T * lift];
}

function bodyColour(s: number, a: number): Rgb {
  const up = Math.cos(a);
  let c: Rgb = mix(BREAST, FLANK, smooth(0.0, 0.5, Math.abs(Math.sin(a))) * 0.5);
  // Pale fall tips on the breast feathers, in rows like scales.
  c = mix(c, BREAST_TIP, smooth(0.55, 0.95, ripple(s * 38, a * 7)) * 0.5 * smooth(0.25, 0.6, s));
  // White lower belly and undertail, between the legs and back.
  c = mix(c, WHITE, smooth(0.58, 0.3, s) * smooth(0.0, -0.5, up));
  // Grey-brown back, darkening to the nape behind the head.
  const back = mix(BACK, NAPE, smooth(0.72, 0.95, s));
  c = mix(c, back, smooth(-0.05, 0.38, up));
  return shade(c, 1 + 0.05 * ripple(s * 31, a * 5));
}

function writeBody(w: MeshWriter): void {
  loft(w, 34, 30, (s, a): LoftPoint => {
    const [x, y, z] = bodyPoint(s, a);
    return { x, y, z, c: bodyColour(s, a) };
  });
}

/** A point on the head: s from the back of the skull (0) to the bill's base (1), a as the body. */
function headPoint(s: number, a: number): [number, number, number] {
  const q = Math.pow(Math.max(0, 1 - (2 * s - 1) ** 2), 0.45);
  const ca = Math.cos(a);
  const ry = (ca > 0 ? HEAD_AT.up : HEAD_AT.down) * q;
  const rx = HEAD_AT.rx * q * (1 - 0.18 * s);
  // The forehead slopes down to the bill.
  return [Math.sin(a) * rx, HEAD_AT.y - 0.35 * s + ca * ry, HEAD_AT.z - HEAD_AT.back + s * (HEAD_AT.back + HEAD_AT.front)];
}

function headColour(s: number, a: number, x: number): Rgb {
  const up = Math.cos(a);
  let c = shade(HEAD, 1 + 0.06 * ripple(s * 20, a * 4));
  // White chin and throat with dark streaks running back from the bill.
  const throat = smooth(0.05, -0.5, up) * smooth(0.35, 0.7, s);
  // Thin, uneven streaks; the chin by the bill stays plain.
  const streak = smooth(0.6, 0.85, Math.sin(x * 15 + 1.2 + 1.5 * ripple(s * 9, x * 3))) * smooth(0.88, 0.72, s);
  c = mix(c, mix(WHITE, HEAD, streak * 0.85), throat);
  // Below and behind, the throat runs into the orange breast.
  return mix(c, BREAST, smooth(-0.35, -0.8, up) * smooth(0.5, 0.15, s));
}

function writeHead(w: MeshWriter): void {
  loft(w, 30, 28, (s, a) => {
    const [x, y, z] = headPoint(s, a);
    return { x, y, z, c: headColour(s, a, x) };
  });
  writeNeck(w);
  for (const side of [1, -1]) writeEye(w, side);
  writeBill(w, false);
}

/**
 * The neck, on the head part: from under the skull down into the body, so the head never parts
 * from the body when it nods or tips. Dark above, orange below like the breast it joins.
 */
function writeNeck(w: MeshWriter): void {
  const [, ny, nz] = PIVOTS.neck;
  loft(w, 8, 20, (s, a) => {
    const r = 1.9 + 0.6 * s;
    const ca = Math.cos(a);
    const y = HEAD_AT.y - 0.4 + (ny - 1.6 - HEAD_AT.y + 0.4) * s;
    const z = HEAD_AT.z - 0.6 + (nz - 1.6 - HEAD_AT.z + 0.6) * s;
    const c = mix(BREAST, mix(HEAD, NAPE, s), smooth(-0.3, 0.3, ca));
    return { x: Math.sin(a) * r, y: y + ca * r * 0.25, z: z - ca * r * 0.9, c };
  });
}

/** The eye, its glint and the broken white ring round it (above and below, open front and back). */
function writeEye(w: MeshWriter, side: number): void {
  const s = 0.62;
  const a = side * 1.45;
  const p = headPoint(s, a);
  // The skin's outward direction there, from two nearby points.
  const ds = headPoint(s + 0.01, a);
  const da = headPoint(s, a + 0.01);
  const n = unitToward(cross(sub(ds, p), sub(da, p)), [side, 0, 0]);
  const up = unitToward(cross(n, [0, 0, 1]), [0, 1, 0]);
  const fwd = cross(up, n);
  const at = (k: number): [number, number, number] => [p[0] + n[0] * k, p[1] + n[1] * k, p[2] + n[2] * k];
  ball(w, at(-0.2), 0.3, EYE);
  const g = at(0.08);
  ball(w, [g[0] + up[0] * 0.12 + fwd[0] * 0.08, g[1] + up[1] * 0.12, g[2] + up[2] * 0.12 + fwd[2] * 0.08], 0.06, GLINT);
  for (const [from, to] of [[0.35, 2.8], [3.5, 5.95]]) {
    const c = at(-0.05);
    loft(w, 12, 5, (t, ang) => {
      const th = from + (to - from) * t;
      const rr = 0.5;
      // Thin at both ends of each crescent.
      const tr = 0.075 * Math.sin(Math.PI * t) + 0.015;
      const ox = Math.cos(th) * rr;
      const oy = Math.sin(th) * rr;
      const rx = Math.cos(th) * Math.cos(ang) * tr;
      const ry = Math.sin(th) * Math.cos(ang) * tr;
      const rn = Math.sin(ang) * tr;
      return {
        x: c[0] + fwd[0] * (ox + rx) + up[0] * (oy + ry) + n[0] * rn,
        y: c[1] + fwd[1] * (ox + rx) + up[1] * (oy + ry) + n[1] * rn,
        z: c[2] + fwd[2] * (ox + rx) + up[2] * (oy + ry) + n[2] * rn,
        c: WHITE,
      };
    });
  }
}

/** The upper bill (on the head) or the lower one (its own part, opening at the gape). */
function writeBill(w: MeshWriter, lower: boolean): void {
  const [, gy, gz] = PIVOTS.gape;
  const len = lower ? 1.65 : 1.95;
  const half = lower ? 0.36 : 0.42;
  const deep = lower ? 0.26 : 0.48;
  loft(w, 12, 12, (s, a) => {
    const taper = Math.pow(1 - s, 0.85);
    const ca = Math.cos(a);
    // Upper: rounded on top, flat below. Lower: flat on top, rounded below.
    const v = lower ? (ca < 0 ? ca * deep : ca * 0.04) : (ca > 0 ? ca * deep : ca * 0.04);
    const droop = (lower ? -0.12 : -0.2) * Math.pow(s, 2.5);
    const c = lower ? BILL : mix(BILL, BILL_TIP, smooth(0.8, 1.0, s) * 0.5 + smooth(0.5, 0.95, ca) * 0.2);
    return { x: Math.sin(a) * half * taper, y: gy + (lower ? -0.06 : 0.02) + v * taper + droop - 0.12 * s, z: gz - 0.15 + s * len, c };
  });
}

/** A folded wing on the body's side (`side` 1 right, -1 left), its tip crossing over the rump. */
function writeFoldedWing(w: MeshWriter, side: number): void {
  loft(w, 20, 10, (u, v) => {
    const s = 0.9 - 0.95 * u;
    const top = 0.42 - 0.22 * u;
    const span = (1.35 * (1 - Math.pow(u, 1.6)) + 0.03) * (0.45 + 0.55 * smooth(0, 0.18, u));
    const a = side * (top + v * span);
    const [x, y, z] = bodyPoint(s, a, 0.28 + 0.12 * Math.sin(Math.PI * v), 0.32);
    let c = mix(WING, PRIMARY, smooth(0.55, 0.75, u));
    // Pale edges on the tertials and secondaries, feather by feather.
    const edge = (v * 5 + u * 0.8) % 1;
    c = mix(c, WING_EDGE, smooth(0.86, 0.97, edge) * smooth(0.12, 0.25, u) * smooth(0.72, 0.6, u) * 0.7);
    return { x, y, z, c: shade(c, 1 + 0.05 * ripple(u * 17, v * 9)) };
  }, false);
}

/**
 * An open wing for flight, from the shoulder out along ±x (about 17 cm): the arm's broad inner wing
 * (coverts and secondaries), then six long primaries fanned out from the hand like fingers.
 */
function writeOpenWing(w: MeshWriter, side: number): void {
  const [sx, sy, sz] = PIVOTS.shoulder;
  const arm = 8.5;
  loft(w, 10, 6, (u, v) => {
    // Rounded at the leading edge, a scalloped trailing edge (one bump per secondary).
    const chord = (7.6 - 1.6 * u) * (1 - 0.06 * Math.abs(Math.sin(u * Math.PI * 4.5)) * v);
    const lead = sz + 1.0 - 0.6 * u;
    const c = mix(mix(WING, PRIMARY, 0.3), WING_EDGE, smooth(0.55, 0.85, v) * 0.3);
    return {
      x: side * (sx + u * arm),
      y: sy + 0.4 * u + 0.5 * Math.sin(Math.PI * Math.min(1, v * 1.4)),
      z: lead - v * chord,
      c: shade(c, 1 + 0.06 * ripple(u * 23, v * 7)),
    };
  }, false);
  const hx = sx + arm - 0.6;
  for (let f = 0; f < 6; f++) {
    // From pointing out and a little forward (outermost) to back toward the body (innermost).
    const ang = 0.2 - f * 0.07;
    const len = 8.6 - f * 0.9;
    const dx = Math.cos(ang);
    const dz = Math.sin(ang);
    const z0 = sz + 0.4 - f * 0.4;
    loft(w, 8, 3, (u, v) => {
      const half = 1.5 * Math.sin(Math.PI * (0.15 + 0.85 * u)) ** 0.4 * (1 - 0.3 * u);
      const across = (v * 2 - 1) * half;
      return {
        x: side * (hx + dx * u * len - dz * across * 0.4),
        y: sy + 0.55 + 0.25 * u + 0.08 * f,
        z: z0 + dz * u * len + across,
        c: shade(PRIMARY, 1 + 0.05 * ripple(u * 19, f)),
      };
    }, false);
  }
}

/** The tail: a long dark fan from the rump, back and a little down, white corners on the outer feathers. */
function writeTail(w: MeshWriter): void {
  const [, ty, tz] = PIVOTS.rump;
  const drop = (24 * Math.PI) / 180;
  loft(w, 14, 8, (u, k) => {
    const v = k * 2 - 1;
    const len = 8.5 * u * (1 - 0.04 * v * v);
    const hw = 1.0 + 0.9 * u;
    const lift = -0.6 * v * v + 0.3;
    let c = shade(TAIL, 1 + 0.05 * ripple(u * 13, v * 6));
    c = mix(c, WHITE, smooth(0.86, 0.97, u) * smooth(0.68, 0.95, Math.abs(v)) * 0.9);
    return { x: v * hw, y: ty - Math.sin(drop) * len + Math.cos(drop) * lift, z: tz - Math.cos(drop) * len - Math.sin(drop) * lift, c };
  }, false);  // White undertail feathers under the tail's base, joining it to the belly.
  loft(w, 6, 12, (u, ang) => {
    const len = 2.6 * u;
    const r = 1.2 * (1 - u * u) + 0.1;
    const x = Math.sin(ang) * r;
    const y = ty - 0.45 - Math.sin(drop) * len + Math.min(0, Math.cos(ang)) * r * 0.6;
    return { x, y, z: tz + 1.1 - Math.cos(drop) * len, c: WHITE };
  });
}

/** A leg (`side` ±1): feathered thigh, the bare tarsus, three toes forward and one back. */
function writeLeg(w: MeshWriter, side: number): void {
  const foot: [number, number, number] = [side * 1.0, 0.3, 1.0];
  const ankle: [number, number, number] = [side * 1.05, 3.6, 0.2];
  tube(w, ankle, [side * 1.15, 5.4, 0.5], 0.42, 0.7, THIGH, 8);
  tube(w, foot, ankle, 0.2, 0.24, LEG);
  const toes: [number, number][] = [[-0.38, 1.9], [0, 2.2], [0.38, 1.8], [Math.PI, 1.5]];
  for (const [yaw, len] of toes) {
    const ang = yaw * side;
    tube(w, [foot[0], 0.15, foot[2]], [foot[0] + Math.sin(ang) * len, 0.1, foot[2] + Math.cos(ang) * len], 0.13, 0.07, LEG, 5);
  }
}

/** A small ball: an eye or its glint. */
function ball(w: MeshWriter, c: readonly number[], r: number, col: Rgb): void {
  loft(w, 8, 10, (s, a) => {
    const ph = Math.PI * s;
    return { x: c[0] + Math.sin(ph) * Math.cos(a) * r, y: c[1] + Math.cos(ph) * r, z: c[2] + Math.sin(ph) * Math.sin(a) * r, c: col };
  });
}

type V = readonly number[];
const sub = (p: V, q: V): [number, number, number] => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const cross = (p: V, q: V): [number, number, number] => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
/** `p` at unit length, flipped if needed to point the same way as `hint`. */
function unitToward(p: V, hint: V): [number, number, number] {
  const l = Math.hypot(p[0], p[1], p[2]) || 1;
  const k = p[0] * hint[0] + p[1] * hint[1] + p[2] * hint[2] < 0 ? -1 / l : 1 / l;
  return [p[0] * k, p[1] * k, p[2] * k];
}

/** The parts, in the order robin.ts names them. */
export const ROBIN_PARTS = {
  body: writeBody,
  head: writeHead,
  lowerBill: (w: MeshWriter) => writeBill(w, true),
  wingR: (w: MeshWriter) => writeFoldedWing(w, 1),
  wingL: (w: MeshWriter) => writeFoldedWing(w, -1),
  openR: (w: MeshWriter) => writeOpenWing(w, 1),
  openL: (w: MeshWriter) => writeOpenWing(w, -1),
  tail: writeTail,
  legR: (w: MeshWriter) => writeLeg(w, 1),
  legL: (w: MeshWriter) => writeLeg(w, -1),
} as const;

export type RobinPartName = keyof typeof ROBIN_PARTS;
