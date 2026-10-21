import type { MeshWriter } from '../surface/meshWriter';
import { lin, loft, mix, ripple, shade, smooth, type Rgb } from './robinGeom';
import { BACK, PIVOTS, PRIMARY, TAIL, WHITE, WING, WING_EDGE } from './robinShape';

/**
 * The robin's flight parts (V4): the open wing as an arm (shoulder to wrist: coverts over the
 * secondaries) and a hand (wrist out: primary coverts and nine separate primaries), and the tail
 * fanned for flight. robin.ts swaps them in for the folded wings and the closed tail while it flies,
 * flaps the arm round the shoulder and bends the hand at the wrist. Bird frame, in centimetres.
 *
 * Shape: wingspan 31-41 cm (Cornell, All About Birds, "American Robin"); this one is about 38 cm.
 * A thrush's wing is broad with a rounded tip (the 6th to 8th primaries longest, the outermost
 * shorter), so the tips spread only a little. Colours: grey-brown above with darker flight feathers
 * edged paler; below, orange underwing coverts (Cornell, All About Birds, "American Robin: similar
 * species", photo caption: "Note orange underwing coverts in flight") and greyer flight feathers.
 * Build-time only.
 */

/** Wing frame: the chord runs along the body's axis (38° up at the front, robinShape.ts) plus 4°. */
const A = (42 * Math.PI) / 180;
const SIN_A = Math.sin(A);
const COS_A = Math.cos(A);
/** The way the chord points (forward) and the way the wing's top faces, in the bird frame. */
export const WING_CHORD = [0, SIN_A, COS_A] as const;
export const WING_UP = [0, COS_A, -SIN_A] as const;
/** Shoulder to wrist along the span (cm). */
export const WRIST_SPAN = 6.5;
/** The wrist sits this far forward of the shoulder, along the chord: the hand turns round it. */
export const WRIST_CHORD = 1.4;

const UNDER_COVERT = lin(0xb0602f);
const UNDER_FLIGHT = lin(0x7d756e);
const SECONDARY = mix(WING, PRIMARY, 0.5);

/** A point in the wing frame (span s out from the shoulder, chord c forward, t up) to the bird frame. */
function at(side: number, s: number, c: number, t: number, col: Rgb): { x: number; y: number; z: number; c: Rgb } {
  const [sx, sy, sz] = PIVOTS.shoulder;
  return { x: side * (sx + s), y: sy + c * SIN_A + t * COS_A, z: sz + c * COS_A - t * SIN_A, c: col };
}

/** Round the section (a, 0..2π from the leading edge over the top and back under): chord share and top or not. */
function section(a: number): { q: number; top: boolean } {
  return { q: 0.5 * (1 - Math.cos(a)), top: Math.sin(a) >= 0 };
}

/** Thickness profile (0..1) along the chord: full near the leading edge, thin to the trailing edge. */
const thick = (q: number): number => (Math.sqrt(q) * Math.pow(1 - q, 1.6)) / 0.315;

/**
 * The arm: the inner wing from inside the body to just past the wrist. A rounded, thick leading
 * edge (the bones and coverts), cambered, thinning back to the secondaries' scalloped tips.
 */
export function writeOpenArm(w: MeshWriter, side: number): void {
  const s0 = -0.7;
  const s1 = WRIST_SPAN + 0.3;
  const feathers = 10;
  loft(w, 30, 16, (u, a) => {
    const s = s0 + (s1 - s0) * u;
    const k = Math.min(1, Math.max(0, s / WRIST_SPAN));
    const fu = ((s - s0) / (s1 - s0)) * feathers;
    // One rounded tip per secondary: notches between them.
    const notch = 0.4 * Math.pow(1 - Math.abs(Math.sin(Math.PI * fu)), 3);
    const le = 0.9 + (WRIST_CHORD + 0.5 - 0.9) * smooth(0, 1, k);
    const te = -6.5 + 0.9 * k + notch;
    const { q, top } = section(a);
    const c = le - q * (le - te);
    const camber = (0.6 - 0.15 * k) * Math.sin(Math.PI * Math.pow(q, 0.7));
    const half = 0.5 * (1.15 - 0.5 * k) * thick(q) + 0.03;
    const t = camber + (top ? half : -0.45 * half);
    let col: Rgb;
    if (top) {
      // Coverts, their tips a paler row, then the secondaries edged paler, feather by feather.
      col = mix(shade(BACK, 0.9), shade(WING, 0.92), smooth(0.02, 0.2, q));
      col = mix(col, WING_EDGE, smooth(0.32, 0.42, q) * smooth(0.52, 0.44, q) * 0.3);
      const edge = fu % 1;
      const sec = mix(SECONDARY, WING_EDGE, smooth(0.82, 0.97, edge) * 0.35 + smooth(0.88, 1, q) * 0.2);
      col = mix(col, sec, smooth(0.46, 0.56, q));
    } else {
      col = mix(mix(UNDER_FLIGHT, UNDER_COVERT, smooth(0.0, 0.1, q)), UNDER_FLIGHT, smooth(0.45, 0.58, q));
    }
    return at(side, s, c, t, shade(col, 1 + 0.05 * ripple(s * 3, q * 9)));
  });
}

/** Primary p (0 innermost .. 8 outermost): length (cm) and its angle back from straight out (rad). */
const PRIMARIES: readonly (readonly [number, number])[] = [
  [6.8, 1.3], [7.1, 1.12], [7.4, 0.95], [7.8, 0.78], [8.1, 0.62], [8.5, 0.47], [8.7, 0.33], [8.5, 0.2], [7.6, 0.09],
];

/** The hand's leading edge (chord, cm) at span s: from the wrist, sweeping back to the hand's tip. */
const handLead = (s: number): number => WRIST_CHORD + 0.5 - 1.3 * smooth(WRIST_SPAN - 0.3, WRIST_SPAN + 3.5, s);

/**
 * The hand: the primary coverts over the hand bones, and nine primaries fanned from them, each its
 * own feather with a rounded tip; the outer four narrow near their tips, so the tips part a little.
 * Inner feathers lie over outer ones, as when the wing folds.
 */
export function writeOpenHand(w: MeshWriter, side: number): void {
  const h0 = WRIST_SPAN - 0.4;
  const h1 = WRIST_SPAN + 3.5;
  loft(w, 8, 12, (u, a) => {
    const s = h0 + (h1 - h0) * u;
    const le = handLead(s);
    const { q, top } = section(a);
    const c = le - q * (2.8 - 1.6 * u);
    const half = 0.5 * (0.75 - 0.4 * u) * thick(q) + 0.03;
    const t = 0.35 * Math.sin(Math.PI * Math.pow(q, 0.7)) + (top ? half : -0.45 * half);
    const col = top ? mix(WING, PRIMARY, 0.25 + 0.2 * smooth(0.3, 0.9, q)) : mix(UNDER_COVERT, UNDER_FLIGHT, smooth(0.1, 0.6, q));
    return at(side, s, c, t, shade(col, 1 + 0.05 * ripple(u * 11, q * 7)));
  });
  for (let p = 0; p < PRIMARIES.length; p++) {
    const [len, ang] = PRIMARIES[p];
    const f = p / (PRIMARIES.length - 1);
    const bs = WRIST_SPAN + 0.1 + 3.3 * f;
    const bc = handLead(bs) - 0.9;
    const bt = 0.12 + 0.035 * (PRIMARIES.length - 1 - p);
    const dx = Math.cos(ang);
    const dc = -Math.sin(ang);
    const outer = p >= 5;
    loft(w, 7, 6, (u, a) => {
      // Full width soon after the base, a rounded tip; the outer ones narrower at the end.
      const r = 0.28;
      const tip = u > 1 - r ? Math.sqrt(Math.max(0, 1 - ((u - 1 + r) / r) ** 2)) : 1;
      const half = (0.98 - 0.04 * p) * Math.min(1, (u + 0.2) / 0.35) * (outer ? 1 - 0.25 * smooth(0.62, 0.88, u) : 1) * tip + 0.04;
      const across = Math.cos(a) * half;
      const top = Math.sin(a) >= 0;
      // Curved down along its length and across the vane, a thin shaft-thick bulge on top.
      const t = bt - 0.45 * u * u - 0.1 * (across / half) ** 2 + Math.sin(a) * (0.07 * (1 - 0.5 * u));
      const along = u * len;
      const s = bs + dx * along - dc * across;
      const c = bc + dc * along + dx * across;
      let col: Rgb;
      if (top) {
        // Dark, the outer vane (toward the tip) edged paler, the very tip a touch darker.
        col = mix(PRIMARY, WING_EDGE, smooth(0.6, 0.98, Math.cos(a)) * 0.4 * smooth(0.1, 0.3, u));
        col = shade(col, 1 - 0.12 * smooth(0.8, 1, u));
      } else {
        col = UNDER_FLIGHT;
      }
      return at(side, s, c, t, shade(col, 1 + 0.04 * ripple(p * 1.7, u * 5)));
    });
  }
}

/** The white undertail coverts under the tail's base, joining it to the belly (both tails). */
export function writeUndertail(w: MeshWriter): void {
  const [, ty, tz] = PIVOTS.rump;
  const drop = (24 * Math.PI) / 180;
  loft(w, 6, 12, (u, ang) => {
    const len = 2.6 * u;
    const r = 1.2 * (1 - u * u) + 0.1;
    const x = Math.sin(ang) * r;
    const y = ty - 0.45 - Math.sin(drop) * len + Math.min(0, Math.cos(ang)) * r * 0.6;
    return { x, y, z: tz + 1.1 - Math.cos(drop) * len, c: WHITE };
  });
}

/**
 * The tail in flight: fanned a little (twelve feathers, each tip rounded), domed so the outer
 * feathers sit lower, thick at the base where the coverts lie and thin at the tips, so it keeps
 * some depth seen from the side. White corners on the outer feathers, above and below.
 */
export function writeFlightTail(w: MeshWriter): void {
  const [, ty, tz] = PIVOTS.rump;
  const drop = (24 * Math.PI) / 180;
  loft(w, 10, 48, (u, a) => {
    // Round the section: across the top from the left edge (v = 1) to the right, back underneath.
    const k = a / (Math.PI * 2);
    const top = k <= 0.5;
    const v = top ? 1 - 4 * k : -3 + 4 * k;
    const fv = (v + 1) * 6;
    const notch = Math.pow(1 - Math.abs(Math.sin(Math.PI * fv)), 3);
    const len = 8.6 * u * (1 - 0.05 * v * v) * (1 - 0.05 * notch * smooth(0.6, 1, u));
    const hw = 1.1 + 1.9 * u;
    const dome = 0.3 - (0.4 + 0.8 * u) * v * v;
    const half = (0.9 * Math.pow(1 - u, 1.5) + 0.08) * Math.sqrt(Math.max(0, 1 - v * v));
    const lift = dome + (top ? half : -0.7 * half);
    let c = shade(TAIL, (1 + 0.05 * ripple(u * 13, v * 6)) * (1 - 0.12 * notch * smooth(0.3, 0.9, u)));
    c = mix(c, WHITE, smooth(0.84, 0.96, u) * smooth(0.68, 0.92, Math.abs(v)) * 0.9);
    return { x: v * hw, y: ty - Math.sin(drop) * len + Math.cos(drop) * lift, z: tz - Math.cos(drop) * len - Math.sin(drop) * lift, c };
  });
  writeUndertail(w);
}
