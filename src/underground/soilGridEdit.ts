import { AIR, GRID_H, GRID_W, colOf, rowOf, cellU, cellV, touch, type SoilGrid } from './soilGrid';

// Blockers, moisture and texture packing: the soil grid's other writes and its one read-out.

/** Marks a blocker's cells (a disc) so they are never dug. */
export function markSolid(g: SoilGrid, u: number, v: number, r: number, kind: number): void {
  const c0 = Math.max(0, colOf(u - r));
  const c1 = Math.min(GRID_W - 1, colOf(u + r));
  const r0 = Math.max(0, rowOf(g, v - r));
  const r1 = Math.min(GRID_H - 1, rowOf(g, v + r));
  for (let row = r0; row <= r1; row++) {
    const dv = cellV(g, row) - v;
    for (let c = c0; c <= c1; c++) {
      const du = cellU(c) - u;
      if (du * du + dv * dv <= r * r) g.solid[row * GRID_W + c] = kind;
    }
  }
}

/** Raises the moisture of soil within r of (u, v) by `add` (damp under stones and logs). */
export function dampen(g: SoilGrid, u: number, v: number, r: number, add: number): void {
  const c0 = Math.max(0, colOf(u - r));
  const c1 = Math.min(GRID_W - 1, colOf(u + r));
  const r0 = Math.max(0, rowOf(g, v - r));
  const r1 = Math.min(GRID_H - 1, rowOf(g, v + r));
  for (let row = r0; row <= r1; row++) {
    const dv = cellV(g, row) - v;
    let changed = false;
    for (let c = c0; c <= c1; c++) {
      const du = cellU(c) - u;
      const d2 = du * du + dv * dv;
      if (d2 > r * r) continue;
      const i = row * GRID_W + c;
      if (g.layer[i] === AIR) continue;
      const was = g.damp[i];
      g.damp[i] = Math.min(255, was + Math.round(add * (1 - Math.sqrt(d2) / r)));
      if (g.damp[i] !== was) changed = true;
    }
    if (changed) touch(g, row);
  }
}

/**
 * Packs rows lo..hi into RGBA bytes for the face's data texture: R open, G castings, B mixed,
 * A moisture. Allocates nothing.
 */
export function packRows(g: SoilGrid, bytes: Uint8Array, lo: number, hi: number): void {
  for (let r = Math.max(0, lo); r <= Math.min(GRID_H - 1, hi); r++) {
    for (let c = 0; c < GRID_W; c++) {
      const i = r * GRID_W + c;
      const o = i * 4;
      bytes[o] = g.open[i] && !g.cast[i] ? 255 : 0;
      bytes[o + 1] = g.cast[i];
      bytes[o + 2] = g.mixed[i] ? 255 : 0;
      bytes[o + 3] = g.damp[i];
    }
  }
}
