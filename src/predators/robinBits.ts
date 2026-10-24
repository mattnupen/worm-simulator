import type { MeshWriter } from '../surface/meshWriter';
import { lin, type Rgb } from './robinGeom';

/**
 * The bits of leaf litter the robin flicks up as it digs for a worm (V4 revision 4): a few small
 * flakes in a spray, part of the robin's own mesh (no new draw or material). robin.ts opens the
 * spray out and hops it up through each flick. Bird frame, centimetres, the spray flying toward -z
 * (behind the bird). Build-time only.
 */

const FLAKES = 7;
/** Browned, red, orange and tan leaf, and a crumb of dark soil (sRGB). */
const COLOURS: readonly Rgb[] = [0x6b4a2c, 0xa5401f, 0xc47c2c, 0xa8894f, 0x3b2f26].map(lin);

/** A small fraction from k (a fixed scatter, the same every load). */
const frac = (k: number, m: number): number => (k * m) % 1;

export function writeBits(w: MeshWriter): void {
  for (let k = 0; k < FLAKES; k++) {
    const a = (k / (FLAKES - 1) - 0.5) * 1.4;
    const d = 2.5 + 2.5 * frac(k, 0.37);
    const cx = Math.sin(a) * d;
    const cy = 0.4 + 1.6 * frac(k, 0.61);
    const cz = -Math.cos(a) * d;
    // Each flake tilted its own way: two edges across it.
    const t = frac(k, 0.73) * Math.PI;
    const ux = Math.cos(t) * 0.5, uy = Math.sin(t) * 0.35, uz = 0.2;
    const vx = -0.15, vy = Math.cos(t) * 0.3, vz = Math.sin(t) * 0.35 + 0.1;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const c = COLOURS[k % COLOURS.length];
    const e = [c[0], c[1], c[2], 0];
    // Both faces, so it shows whichever way it turns.
    for (const side of [1, -1]) {
      const v0 = w.vertex(cx - ux - vx, cy - uy - vy, cz - uz - vz, nx * side, ny * side, nz * side, e);
      const v1 = w.vertex(cx + ux - vx, cy + uy - vy, cz + uz - vz, nx * side, ny * side, nz * side, e);
      const v2 = w.vertex(cx + ux + vx, cy + uy + vy, cz + uz + vz, nx * side, ny * side, nz * side, e);
      const v3 = w.vertex(cx - ux + vx, cy - uy + vy, cz - uz + vz, nx * side, ny * side, nz * side, e);
      if (side > 0) w.quad(v0, v1, v2, v3);
      else w.quad(v0, v3, v2, v1);
    }
  }
}
