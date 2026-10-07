import { FLOOR_CELL, FLOOR_CELL_BALL, FLOOR_KEEP, FLOOR_SEGS } from '../render/floorMaterial';
import { OCC_REACH } from '../render/occlusion';
import { SPINE_POINTS } from '../render/groundUniforms';
import { terrainHeight } from './terrain';
import { spineDistance } from '../render/nearClutterGlsl';

/**
 * The CPU's list of the floor patch's cells (floorPatch.ts updateFloorPatch), each frame: exactly
 * the cells floorCellShown keeps, at a fraction of the cost of testing every cell from scratch.
 * - Only cells within FLOOR_KEEP of the spine's box are tried.
 * - Near the spine: each cell's distance to a reference spine is kept (once per cell until the
 *   reference changes); the spine is never farther than `drift` from it (the most any spine point
 *   has moved), so a cell clearly nearer or farther than FLOOR_KEEP by more than that is decided at
 *   once, and only the thin band in between is measured (nearSpine). The reference moves to the
 *   spine whenever drift passes REBASE.
 * - The floor's height at a cell is kept too (on the same lattice).
 * - A frame whose spine, view and segments are all unchanged keeps the last list.
 * All decisions that are not exact by construction keep margins far above rounding, so the list is
 * the one floorCellShown gives, cell for cell (tests/unit/floorList.test.ts).
 */

const KEEP2 = FLOOR_KEEP * FLOOR_KEEP;
/** Past this drift (m) the reference spine moves to the spine. */
const REBASE = 0.2;
/** Far above the rounding of a distance (about 1e-15 m), far below any cell's size. */
const MARGIN = 1e-7;

/**
 * Whether (x, z) lies within FLOOR_KEEP of the spine (along the floor), i.e. spineDistance(spine,
 * x, z) <= FLOOR_KEEP, with the same arithmetic per segment, stopping at the first near segment
 * (from segment `from`, wrapping). Returns that segment's index, or -1. Allocates nothing.
 */
export function nearSpine(spine: ArrayLike<number>, x: number, z: number, from = 0): number {
  for (let n = 0, i = from; n < SPINE_POINTS - 1; n++, i = i === SPINE_POINTS - 2 ? 0 : i + 1) {
    const ax = spine[i * 3];
    const az = spine[i * 3 + 2];
    const abx = spine[i * 3 + 3] - ax;
    const abz = spine[i * 3 + 5] - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * abx + (z - az) * abz) / Math.max(abx * abx + abz * abz, 1e-8)));
    const qx = x - ax - abx * t;
    const qz = z - az - abz * t;
    const d2 = qx * qx + qz * qz;
    // The square root only where rounding could tell d2 <= KEEP2 and sqrt(d2) <= FLOOR_KEEP apart.
    if (d2 < KEEP2 * (1 - 1e-9) || (d2 <= KEEP2 * (1 + 1e-9) && Math.sqrt(d2) <= FLOOR_KEEP)) return i;
  }
  return -1;
}

/**
 * The view half of floorCellShown, for the cell centred at (cx, cy, cz) on the floor: its ball
 * of FLOOR_CELL_BALL, seen through `view`, within OCC_REACH of one of the `count` segments `seg` as
 * occlusion() measures it. Clear-cut cases are decided on squares, the rest exactly as written.
 * Allocates nothing.
 */
export function cellInView(
  view: ArrayLike<number>, seg: ArrayLike<number>, count: number, cx: number, cy: number, cz: number,
  reachBox?: ArrayLike<number>,
): boolean {
  const vx = view[0] * cx + view[4] * cy + view[8] * cz + view[12];
  const vy = view[1] * cx + view[5] * cy + view[9] * cz + view[13];
  const d = -(view[2] * cx + view[6] * cy + view[10] * cz + view[14]);
  const near = d - FLOOR_CELL_BALL;
  if (near < 0.05) return true;
  const tx = vx / d;
  const ty = vy / d;
  const r = FLOOR_CELL_BALL / near;
  // Outside every segment's reach box (reachBoxOf), grown by r: no segment can be near enough.
  const g = r * (1 + 1e-9) + 1e-12;
  if (reachBox && (tx < reachBox[0] - g || tx > reachBox[2] + g || ty < reachBox[1] - g || ty > reachBox[3] + g)) return false;
  for (let i = 0; i < count; i++) {
    if (reachBox) {
      const b = 4 + i * 4;
      if (tx < reachBox[b] - g || tx > reachBox[b + 2] + g || ty < reachBox[b + 1] - g || ty > reachBox[b + 3] + g) continue;
    }
    const o = i * 8;
    const abx = seg[o + 4] - seg[o];
    const aby = seg[o + 5] - seg[o + 1];
    const u = Math.min(1, Math.max(0, ((tx - seg[o]) * abx + (ty - seg[o + 1]) * aby) * seg[o + 3]));
    const qx = tx - seg[o] - abx * u;
    const qy = ty - seg[o + 1] - aby * u;
    const m = Math.max(seg[o + 2], seg[o + 6]);
    // (q - r) / m < OCC_REACH, q = hypot(qx, qy).
    const reach = r + OCC_REACH * m;
    const q2 = qx * qx + qy * qy;
    if (q2 > reach * reach * (1 + 1e-9)) continue;
    if (q2 < reach * reach * (1 - 1e-9)) return true;
    if ((Math.hypot(qx, qy) - r) / m < OCC_REACH) return true;
  }
  return false;
}

/**
 * Per segment of seg, the tan-space box (xmin, ymin, xmax, ymax) holding it grown by OCC_REACH
 * times its larger inverse depth, at out[4 + 4i]; their union at out[0]. A cell whose ball's centre
 * lies farther outside a segment's box than the ball's tan-space radius is not near enough to that
 * segment for cellInView; outside the union, to none. Writes `out` (4 + 4 OCC_SEGMENTS). Allocates
 * nothing.
 */
export function reachBoxOf(seg: ArrayLike<number>, count: number, out: Float64Array): void {
  out[0] = Infinity;
  out[1] = Infinity;
  out[2] = -Infinity;
  out[3] = -Infinity;
  for (let i = 0; i < count; i++) {
    const o = i * 8;
    const g = OCC_REACH * Math.max(seg[o + 2], seg[o + 6]) * (1 + 1e-9);
    const b = 4 + i * 4;
    out[b] = Math.min(seg[o], seg[o + 4]) - g;
    out[b + 1] = Math.min(seg[o + 1], seg[o + 5]) - g;
    out[b + 2] = Math.max(seg[o], seg[o + 4]) + g;
    out[b + 3] = Math.max(seg[o + 1], seg[o + 5]) + g;
    out[0] = Math.min(out[0], out[b]);
    out[1] = Math.min(out[1], out[b + 1]);
    out[2] = Math.max(out[2], out[b + 2]);
    out[3] = Math.max(out[3], out[b + 3]);
  }
}

/**
 * The floor cells' centres all lie on one world lattice: the grid's centre is a whole number of
 * cells (floorGridCentre) and FLOOR_CELL (0.25) is exact in binary, so a centre's x and z are
 * exactly (k + 0.5) cells. Per lattice point within LATTICE / 2 cells (26 m) of the origin: the floor's
 * height and the listers' kept distances.
 */
const LATTICE = 208;
const heights = new Float64Array(LATTICE * LATTICE).fill(NaN);

/** The lattice point of the cell centred at (cx, cz), or -1 outside the lattice. */
function latticeOf(cx: number, cz: number): number {
  const i = Math.floor(cx / FLOOR_CELL) + LATTICE / 2;
  const j = Math.floor(cz / FLOOR_CELL) + LATTICE / 2;
  return i < 0 || j < 0 || i >= LATTICE || j >= LATTICE ? -1 : j * LATTICE + i;
}

/** One floor patch's list, with what it keeps between frames. */
export class FloorLister {
  private readonly ref = new Float64Array(SPINE_POINTS * 3);
  private hasRef = false;
  private readonly dist = new Float64Array(LATTICE * LATTICE);
  private readonly stamp = new Uint32Array(LATTICE * LATTICE);
  private generation = 1;
  private readonly spine = new Float64Array(SPINE_POINTS * 3);
  private readonly view = new Float64Array(16);
  private readonly seg = new Float64Array(SPINE_POINTS * 8);
  private count = -1;
  private listed = 0;
  private hint = 0;
  private readonly box = new Float64Array(4 + 4 * (SPINE_POINTS - 1));
  /** Whether the last list() wrote a new list (false: the inputs were unchanged). */
  changed = false;

  /**
   * Writes into `idx` (6 indices per cell, cell c's corners at vertices 4c to 4c + 3) the cells of
   * the grid centred at (gx, gz) that floorCellShown keeps, ascending; returns how many. When the
   * spine, view and segments are the same as last time, `idx` is left as it was. Allocates nothing.
   */
  list(
    spine: ArrayLike<number>, view: ArrayLike<number>, seg: ArrayLike<number>, count: number,
    gx: number, gz: number, idx: Uint16Array,
  ): number {
    this.changed = !this.unchanged(spine, view, seg, count);
    if (!this.changed) return this.listed;
    // How far the spine has drifted from the reference; past REBASE, it becomes the reference.
    let drift = 0;
    for (let i = 0; i < SPINE_POINTS * 3; i += 3) {
      drift = Math.max(drift, Math.hypot(spine[i] - this.ref[i], spine[i + 2] - this.ref[i + 2]));
    }
    if (!this.hasRef || drift > REBASE) {
      this.ref.set(spine as ArrayLike<number>);
      this.hasRef = true;
      drift = 0;
      if (++this.generation === 0xffffffff) {
        this.stamp.fill(0);
        this.generation = 1;
      }
    }
    // The spine's box, grown by FLOOR_KEEP: no cell centre outside it is near enough.
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < SPINE_POINTS * 3; i += 3) {
      x0 = Math.min(x0, spine[i]);
      x1 = Math.max(x1, spine[i]);
      z0 = Math.min(z0, spine[i + 2]);
      z1 = Math.max(z1, spine[i + 2]);
    }
    const half = FLOOR_SEGS / 2 - 0.5;
    const i0 = Math.max(0, Math.floor((x0 - FLOOR_KEEP - gx) / FLOOR_CELL + half));
    const i1 = Math.min(FLOOR_SEGS - 1, Math.ceil((x1 + FLOOR_KEEP - gx) / FLOOR_CELL + half));
    const j0 = Math.max(0, Math.floor((z0 - FLOOR_KEEP - gz) / FLOOR_CELL + half));
    const j1 = Math.min(FLOOR_SEGS - 1, Math.ceil((z1 + FLOOR_KEEP - gz) / FLOOR_CELL + half));
    reachBoxOf(seg, count, this.box);
    const surelyNear = FLOOR_KEEP - drift - MARGIN;
    const surelyFar = FLOOR_KEEP + drift + MARGIN;
    const { dist, stamp, generation } = this;
    // Lattice points step one per cell: cell (i, j)'s is l0 + j * LATTICE + i, when all are inside.
    const l0 = latticeOf(gx + (i0 - FLOOR_SEGS / 2 + 0.5) * FLOOR_CELL, gz + (j0 - FLOOR_SEGS / 2 + 0.5) * FLOOR_CELL)
      - j0 * LATTICE - i0;
    const inLattice = latticeOf(gx + (i0 - FLOOR_SEGS / 2 + 0.5) * FLOOR_CELL, gz + (j0 - FLOOR_SEGS / 2 + 0.5) * FLOOR_CELL) >= 0
      && latticeOf(gx + (i1 - FLOOR_SEGS / 2 + 0.5) * FLOOR_CELL, gz + (j1 - FLOOR_SEGS / 2 + 0.5) * FLOOR_CELL) >= 0;
    let k = 0;
    for (let j = j0; j <= j1; j++) {
      const cz = gz + (j - FLOOR_SEGS / 2 + 0.5) * FLOOR_CELL;
      for (let i = i0; i <= i1; i++) {
        const cx = gx + (i - FLOOR_SEGS / 2 + 0.5) * FLOOR_CELL;
        let cy: number;
        if (inLattice) {
          const l = l0 + j * LATTICE + i;
          if (stamp[l] !== generation) {
            dist[l] = spineDistance(this.ref, cx, cz);
            stamp[l] = generation;
          }
          const dl = dist[l];
          if (dl > surelyFar || (dl >= surelyNear && !this.band(spine, cx, cz))) continue;
          cy = heights[l];
          if (Number.isNaN(cy)) cy = heights[l] = terrainHeight(cx, cz);
        } else {
          if (!this.band(spine, cx, cz)) continue;
          cy = terrainHeight(cx, cz);
        }
        if (!cellInView(view, seg, count, cx, cy, cz, this.box)) continue;
        const v = (j * FLOOR_SEGS + i) * 4;
        const p = k * 6;
        idx[p] = v; idx[p + 1] = v + 2; idx[p + 2] = v + 1;
        idx[p + 3] = v + 1; idx[p + 4] = v + 2; idx[p + 5] = v + 3;
        k++;
      }
    }
    this.listed = k;
    return k;
  }

  /** Whether the cell centred at (cx, cz) is within FLOOR_KEEP of the spine, measured (nearSpine). */
  private band(spine: ArrayLike<number>, cx: number, cz: number): boolean {
    const hit = nearSpine(spine, cx, cz, this.hint);
    if (hit < 0) return false;
    this.hint = hit;
    return true;
  }

  /** True if the inputs match the last list's; otherwise keeps them for next time. */
  private unchanged(spine: ArrayLike<number>, view: ArrayLike<number>, seg: ArrayLike<number>, count: number): boolean {
    let same = count === this.count;
    for (let i = 0; same && i < SPINE_POINTS * 3; i++) same = spine[i] === this.spine[i];
    for (let i = 0; same && i < 16; i++) same = view[i] === this.view[i];
    for (let i = 0; same && i < count * 8; i++) same = seg[i] === this.seg[i];
    if (same) return true;
    this.spine.set(spine as ArrayLike<number>);
    this.view.set(view as ArrayLike<number>);
    for (let i = 0; i < count * 8; i++) this.seg[i] = seg[i];
    this.count = count;
    return false;
  }
}
