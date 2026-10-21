import { hypot2 } from '../core/vec';
import type { Slab } from './slab';
import { GRID_H, GRID_W, HOLLOW_H, HOLLOW_W, markHollowWhole, type SoilGrid } from './soilGrid';
import { MAX_OPENINGS, OPENING_MERGE, type Openings } from './openings';

/**
 * The burrows dug this play (V4 spec 4.1, "tunnels stay"): each slab the worm went down into, and a
 * copy of what it dug there (the open cells, the castings, the mixed walls and the hollow), so that
 * digging down again at one of its openings, or where it first went in, puts the old tunnels back.
 * A burrow can have two openings or more (the worm often comes up far from where it went in): the
 * tunnels belong to the slab, and each opening names its burrow (Openings.burrow).
 *
 * Up to MAX_BURROWS, the oldest replaced first. Every copy is made once, here, at the game's start;
 * saving and restoring only copy into them (about 2.9 MB in all, most of it the hollow). The slab
 * itself is kept (a slab never changes once made). The rest of its soil (layers, moisture, the
 * blockers) follows from the slab alone, as every dig-down rebuilds it (burrowMoves.ts buildStage),
 * so only what the worm changed is copied. For the play only: never saved after the page closes.
 */
export const MAX_BURROWS = MAX_OPENINGS;

export interface Burrows {
  /** Each slot's slab, or null while free. */
  readonly slabs: (Slab | null)[];
  /** Each slot's copy of SoilGrid.open, .cast, .mixed and .hollow, as it was when the worm last left. */
  readonly open: readonly Uint8Array[];
  readonly cast: readonly Uint8Array[];
  readonly mixed: readonly Uint8Array[];
  readonly hollow: readonly Uint8Array[];
  /** 1 once a slot's copy holds its tunnels (saveBurrow); 0: nothing dug kept yet. */
  readonly saved: Uint8Array;
  /** When each slot was last dug into or saved (`added` then): the oldest is replaced once all are taken. */
  readonly born: Float64Array;
  added: number;
}

export function createBurrows(): Burrows {
  const n = GRID_W * GRID_H;
  const each = (size: number) => Array.from({ length: MAX_BURROWS }, () => new Uint8Array(size));
  return {
    slabs: new Array<Slab | null>(MAX_BURROWS).fill(null),
    open: each(n), cast: each(n), mixed: each(n), hollow: each(HOLLOW_W * HOLLOW_H),
    saved: new Uint8Array(MAX_BURROWS), born: new Float64Array(MAX_BURROWS), added: 0,
  };
}

/**
 * A slot for the new slab `s` (a dig somewhere new): a free one, else the oldest. Nothing of it is
 * kept yet. Openings over the burrow it replaces keep their middens but no longer lead to it.
 */
export function claimBurrow(b: Burrows, s: Slab, o: Openings): number {
  let k = b.slabs.indexOf(null);
  if (k < 0) {
    k = 0;
    for (let i = 1; i < MAX_BURROWS; i++) if (b.born[i] < b.born[k]) k = i;
    for (let i = 0; i < MAX_OPENINGS; i++) if (o.burrow[i] === k) o.burrow[i] = -1;
  }
  b.slabs[k] = s;
  b.saved[k] = 0;
  b.born[k] = ++b.added;
  return k;
}

/** Slot k was just dug into again: it is now the newest. */
export function useBurrow(b: Burrows, k: number): void {
  b.born[k] = ++b.added;
}

/** Keeps what the worm dug in slot k's slab (`g` is that slab's grid): the worm is leaving it. */
export function saveBurrow(b: Burrows, k: number, g: SoilGrid): void {
  if (k < 0 || !b.slabs[k]) return;
  b.open[k].set(g.open);
  b.cast[k].set(g.cast);
  b.mixed[k].set(g.mixed);
  b.hollow[k].set(g.hollow);
  b.saved[k] = 1;
  b.born[k] = ++b.added;
}

/**
 * Puts slot k's kept tunnels back into `g`, freshly filled for its slab (fillSoilGrid and
 * markSolids), and marks every row and the whole hollow changed so the renderer redraws them all.
 * Returns false (g unchanged) when the slot keeps nothing.
 */
export function restoreBurrow(b: Burrows, k: number, g: SoilGrid): boolean {
  if (k < 0 || !b.saved[k]) return false;
  g.open.set(b.open[k]);
  g.cast.set(b.cast[k]);
  g.mixed.set(b.mixed[k]);
  g.hollow.set(b.hollow[k]);
  g.dirtyLo = 0;
  g.dirtyHi = GRID_H - 1;
  markHollowWhole(g);
  return true;
}

/**
 * The burrow to dig back into from the point `p` (world x, z: the head): the one with an opening,
 * or its entry (where it was dug), nearest to `p` within OPENING_MERGE; -1 where none is. Allocates
 * nothing (the point comes in an object: no number crosses the call).
 */
export function findBurrow(b: Burrows, o: Openings, p: { readonly x: number; readonly z: number }): number {
  const x = p.x;
  const z = p.z;
  let best = -1;
  let near = OPENING_MERGE;
  for (let i = 0; i < o.count; i++) {
    const k = o.burrow[i];
    if (k < 0 || !b.slabs[k]) continue;
    const d = hypot2(o.data[i * 4] - x, o.data[i * 4 + 2] - z);
    if (d < near) {
      near = d;
      best = k;
    }
  }
  for (let k = 0; k < MAX_BURROWS; k++) {
    const s = b.slabs[k];
    if (!s) continue;
    const d = hypot2(s.ox - x, s.oz - z);
    if (d < near) {
      near = d;
      best = k;
    }
  }
  return best;
}

/** Forgets every burrow (a fresh play, as clearOpenings). */
export function clearBurrows(b: Burrows): void {
  b.slabs.fill(null);
  b.saved.fill(0);
  b.born.fill(0);
  b.added = 0;
}
