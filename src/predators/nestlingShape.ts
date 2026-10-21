import { mulberry32 } from '../core/random';
import type { MeshWriter } from '../surface/meshWriter';
import { lin, loft, mix, ripple, shade, smooth } from './robinGeom';
import { strand } from './nestShape';

/**
 * A robin nestling about a week old (V4 nest scene), built once at load. Hatchlings are "helpless
 * at birth, mostly naked with spare whitish down" (Cornell, All About Birds, "American Robin", Life
 * History), and their eyes stay shut for about five days (Journey North, "Baby Robins", Laura
 * Erickson): so pinkish-grey skin with dark lines where the feathers are coming in, wisps of grey
 * down, bulging closed eyes, and the big yellow-edged mouth they hold up wide to beg. Chick frame,
 * in centimetres: sitting on y = 0, facing +z. Each part is built where it turns (nest.ts poses
 * them): the neck from 0 to 1 cm up the y axis (stretched by its pose), the head round its middle
 * with the bill along +z, the lower bill from its hinge. Build-time only.
 */

const SKIN = lin(0xc8957f);
const SKIN_PALE = lin(0xd9ae96);
const TRACT = lin(0x4f4a48);
const DOWN = lin(0xb9b3ab);
const EYE = lin(0x5d5a6a);
const SLIT = lin(0x24222c);
const FLANGE = lin(0xf3dc6a);
const MOUTH = lin(0xf59a1c);
const THROAT = lin(0xd9661a);
const BILL = lin(0xc9b07a);

/** Where the neck leaves the body (chick frame, cm), and the head's middle above the neck's tip. */
export const NECK_BASE = [0, 2.9, 1.7] as const;
export const HEAD_ABOVE = 1.2;
/** The lower bill's hinge in the head's frame. */
export const GAPE = [0, -0.5, 0.75] as const;

/** The body: a soft egg, a little wider than tall, sunk into the cup. */
function writeBody(w: MeshWriter): void {
  loft(w, 18, 18, (s, a) => {
    const along = (s - 0.5) * 5.8;
    const f = Math.pow(Math.sin(Math.PI * s), 0.6);
    const up = Math.cos(a);
    const x = Math.sin(a) * 2.35 * f;
    const y = 1.95 + up * (up > 0 ? 1.9 : 1.75) * f;
    const z = along - 0.3;
    // Bare skin, the dark spinal tract down the back and the wing tracts on the sides.
    let c = mix(SKIN, SKIN_PALE, smooth(0.2, -0.8, up));
    const spine = smooth(0.4, 0.05, Math.abs(Math.sin(a))) * smooth(0.3, 0.8, up);
    const wing = smooth(0.25, 0.05, Math.abs(Math.abs(Math.sin(a)) - 0.9)) * smooth(0.15, 0.65, s) * smooth(0.95, 0.7, s);
    c = mix(c, TRACT, Math.max(spine * 0.8, wing * 0.85) * (0.75 + 0.25 * ripple(s * 30, a * 4)));
    // Wisps of grey down over the back.
    c = mix(c, DOWN, smooth(0.5, 0.95, ripple(s * 17, a * 6)) * smooth(-0.1, 0.5, up) * 0.6);
    return { x, y, z, c: shade(c, 1 + 0.05 * ripple(s * 23, a * 7)) };
  });
  writeWisps(w, 7, 5, 1.95, (rng) => {
    const s = 0.15 + rng() * 0.6;
    const a = (rng() - 0.5) * 2.2;
    return [Math.sin(a) * 2.2, 1.95 + Math.cos(a) * 1.85, (s - 0.5) * 5.8 - 0.3];
  });
}

/** The neck: a short tube up the y axis, 0 to 1 cm (nest.ts stretches it). */
function writeNeck(w: MeshWriter): void {
  loft(w, 3, 14, (s, a) => {
    const r = 1.25 - 0.15 * s;
    const front = Math.cos(a);
    return { x: Math.sin(a) * r, y: s * 1.02 - 0.01, z: front * r, c: mix(SKIN, SKIN_PALE, smooth(0.0, 0.8, front) * 0.6) };
  });
}

/** The head: a round skull, bulging closed eyes, down on the crown, and the upper bill with its yellow flanges. */
function writeHead(w: MeshWriter): void {
  loft(w, 14, 16, (s, a) => {
    const along = (s - 0.5) * 2.9;
    const f = Math.pow(Math.sin(Math.PI * s), 0.55);
    const up = Math.cos(a);
    let c = mix(SKIN, TRACT, smooth(0.3, 0.9, up) * 0.55);
    c = mix(c, DOWN, smooth(0.55, 0.95, ripple(s * 13, a * 5)) * smooth(0.2, 0.7, up) * 0.5);
    return { x: Math.sin(a) * 1.6 * f, y: up * 1.5 * f, z: along * 1.1 - 0.15, c: shade(c, 1 + 0.05 * ripple(s * 19, a * 3)) };
  });
  for (const side of [1, -1]) {
    // A closed eye: a big, bulging bluish lid on each side, a little forward of the middle, shut
    // along a dark slit.
    loft(w, 8, 10, (s, a) => {
      const ph = Math.PI * s;
      const slit = smooth(0.18, 0.04, Math.abs(Math.cos(ph))) * smooth(0.2, 0.6, Math.sin(ph) * Math.cos(a));
      return {
        x: side * (1.15 + Math.sin(ph) * Math.cos(a) * 0.4),
        y: 0.3 + Math.cos(ph) * 0.55,
        z: 0.3 + Math.sin(ph) * Math.sin(a) * 0.65,
        c: mix(shade(EYE, 1 + 0.12 * Math.cos(ph)), SLIT, slit),
      };
    });
    // The flange: a thick, pale yellow roll at the corner of the mouth.
    loft(w, 6, 8, (s, a) => {
      const ph = Math.PI * s;
      return {
        x: side * (1.3 + Math.sin(ph) * Math.cos(a) * 0.3),
        y: GAPE[1] + Math.cos(ph) * 0.24,
        z: GAPE[2] + 0.1 + Math.sin(ph) * Math.sin(a) * 0.5,
        c: FLANGE,
      };
    });
  }
  writeBill(w, false);
  // The throat, between the open halves of the bill: what a parent sees, a bright target.
  loft(w, 6, 10, (s, a) => {
    const ph = Math.PI * s;
    return {
      x: Math.sin(ph) * Math.cos(a) * 1.0,
      y: GAPE[1] + Math.cos(ph) * 0.45,
      z: GAPE[2] + 0.45 + Math.sin(ph) * Math.sin(a) * 0.8,
      c: THROAT,
    };
  });
  writeWisps(w, 9, 23, 0, (rng) => {
    const a = (rng() - 0.5) * 2.0;
    const z = (rng() - 0.5) * 1.9 - 0.3;
    return [Math.sin(a) * 1.25, Math.cos(a) * 1.2, z];
  });
}

/**
 * One half of the bill, from its base at the gape out to the tip (along +z): broad at the base,
 * where the flanges make the mouth wide, its outer side horn-coloured and its inner side, the
 * mouth, bright yellow-orange, edged pale yellow.
 */
export function writeBill(w: MeshWriter, lower: boolean): void {
  const [, gy, gz] = GAPE;
  const len = lower ? 2.2 : 2.4;
  loft(w, 10, 14, (s, a) => {
    const half = 1.4 * Math.pow(1 - s, 0.8) + 0.06;
    const ca = Math.cos(a);
    const outer = lower ? ca < 0 : ca > 0;
    const v = outer ? ca * (lower ? 0.42 : 0.55) * (1 - 0.6 * s) : ca * 0.06;
    const edge = smooth(0.55, 0.95, Math.abs(Math.sin(a)));
    const c = outer ? mix(BILL, FLANGE, edge * 0.8 + smooth(0.35, 0.0, s) * 0.5) : mix(MOUTH, FLANGE, edge * 0.7);
    return { x: Math.sin(a) * half, y: gy + (lower ? -0.03 : 0.03) + v, z: gz + s * len, c };
  });
}

/** `n` short wisps of down standing out (away from height `cy` on the y axis) from points `at` gives. */
function writeWisps(w: MeshWriter, n: number, seed: number, cy: number, at: (rng: () => number) => readonly number[]): void {
  const rng = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const p = at(rng);
    const l = Math.hypot(p[0], p[1] - cy, p[2]) || 1;
    const out = [p[0] / l, (p[1] - cy) / l, p[2] / l];
    const len = 0.7 + rng() * 0.6;
    const curl = (rng() - 0.5) * 0.6;
    strand(w, 4, 3, (s) => [
      p[0] + out[0] * len * s + curl * s * s,
      p[1] + out[1] * len * s + 0.2 * s,
      p[2] + out[2] * len * s - 0.3 * s * s,
    ], (s) => 0.09 * (1 - 0.7 * s), (s) => mix(DOWN, SKIN_PALE, s * 0.4));
  }
}

/** The parts, in the order nest.ts poses them. */
export const NESTLING_PARTS = {
  body: writeBody,
  neck: writeNeck,
  head: writeHead,
  lowerBill: (w: MeshWriter) => writeBill(w, true),
} as const;

export type NestlingPartName = keyof typeof NESTLING_PARTS;
