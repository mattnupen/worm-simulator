import type { MeshWriter } from '../surface/meshWriter';
import { loft, mix, ripple, shade, smooth, tube } from './robinGeom';
import { writeFlightTail, writeOpenArm, writeOpenHand, writeUndertail } from './robinFlight';
import {
  LEG, PIVOTS, PRIMARY, TAIL, THIGH, WHITE, WING, WING_EDGE, bodyPoint, writeBill, writeBody, writeHead,
} from './robinShape';

/**
 * The robin's folded wings, tail and legs (robinShape.ts has the body, head and bill, the colours and
 * the pivots; robinFlight.ts the open wings and the fanned tail), and the list of parts robin.ts
 * builds and moves. Bird frame, in centimetres. Build-time only.
 */

/** A folded wing on the body's side (`side` 1 its left, -1 its right), its tip crossing over the rump. */
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
  }, false);
  writeUndertail(w);
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

/** The parts, in the order robin.ts names them. */
export const ROBIN_PARTS = {
  body: writeBody,
  head: writeHead,
  lowerBill: (w: MeshWriter) => writeBill(w, true),
  // Side 1 is +x, the bird's left; -1 its right.
  wingR: (w: MeshWriter) => writeFoldedWing(w, -1),
  wingL: (w: MeshWriter) => writeFoldedWing(w, 1),
  // In flight: the open wings (arm and hand) and the fanned tail, in place of the folded ones.
  armR: (w: MeshWriter) => writeOpenArm(w, -1),
  armL: (w: MeshWriter) => writeOpenArm(w, 1),
  handR: (w: MeshWriter) => writeOpenHand(w, -1),
  handL: (w: MeshWriter) => writeOpenHand(w, 1),
  tail: writeTail,
  flightTail: writeFlightTail,
  legR: (w: MeshWriter) => writeLeg(w, -1),
  legL: (w: MeshWriter) => writeLeg(w, 1),
} as const;

export type RobinPartName = keyof typeof ROBIN_PARTS;
