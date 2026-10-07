import * as THREE from 'three';
import { OCC_REACH } from '../render/occlusion';
import { createPaintedMaterial } from '../render/paintedMaterial';
import { GROUND_ORDER } from '../render/drawOrder';
import { ballMayFade, type FadeFrame } from '../render/fadeBall';
import { IndexSplit } from '../render/indexSplit';
import { cellOf } from './meshGrid';
import { hullBox } from './litterChunks';

/**
 * The top of the litter over the buried worm (V2 spec 8.2), split off the terrain mesh so that the
 * bulk of the ground keeps its early depth test (indexSplit.ts): the terrain draws without the
 * fade, and skips the cells the hole over the worm could reach; this patch draws exactly those
 * cells, with the fade, from the terrain's own vertex buffers. The cells are picked on the CPU each
 * frame from the same segments the fade reads (ballMayFade).
 */

/** The most cells the patch holds: far more than the hull of the camera and the body can cover. */
export const TOP_PATCH_MAX = 1600;

/**
 * Per cell of the terrain grid (`lines` along x and z, cell id j * (n - 1) + i), a ball holding
 * both its triangles: (x, y, z) the mean of its four corners and its radius (the farthest corner,
 * plus a hair). `heights` are the grid's vertex heights (row j holds line j along z).
 */
export function cellBalls(lines: readonly number[], heights: ArrayLike<number>): Float32Array {
  const n = lines.length;
  const out = new Float32Array((n - 1) * (n - 1) * 4);
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const o = (j * (n - 1) + i) * 4;
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let k = 0; k < 4; k++) {
        cx += lines[i + (k & 1)] / 4;
        cz += lines[j + (k >> 1)] / 4;
        cy += heights[(j + (k >> 1)) * n + i + (k & 1)] / 4;
      }
      let r = 0;
      for (let k = 0; k < 4; k++) {
        const dx = lines[i + (k & 1)] - cx;
        const dz = lines[j + (k >> 1)] - cz;
        const dy = heights[(j + (k >> 1)) * n + i + (k & 1)] - cy;
        r = Math.max(r, Math.hypot(dx, dy, dz));
      }
      out[o] = cx;
      out[o + 1] = cy;
      out[o + 2] = cz;
      out[o + 3] = r * 1.001 + 1e-3;
    }
  }
  return out;
}

const hull = new Float32Array(4);

/**
 * The cells the patch draws this frame, ascending, into `out` (at most out.length); returns how
 * many. Only cells meeting the hull of the camera (camX, camZ) and the `spine`, grown by
 * OCC_REACH, are tested (every pixel the fade drops lies there: litterChunks.ts hullBox), each
 * with ballMayFade. Allocates nothing.
 */
export function pickTopCells(
  lines: readonly number[], balls: Float32Array, fade: FadeFrame, camX: number, camZ: number,
  spine: ArrayLike<number>, out: Int32Array,
): number {
  if (fade.count === 0) return 0;
  hullBox(camX, camZ, spine, hull);
  const m = lines.length - 1;
  const i0 = cellOf(lines, hull[0] - OCC_REACH);
  const i1 = cellOf(lines, hull[2] + OCC_REACH);
  const j0 = cellOf(lines, hull[1] - OCC_REACH);
  const j1 = cellOf(lines, hull[3] + OCC_REACH);
  let k = 0;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const c = j * m + i;
      const o = c * 4;
      if (!ballMayFade(fade, balls[o], balls[o + 1], balls[o + 2], balls[o + 3])) continue;
      if (k === out.length) {
        // Never in play (the hull holds far fewer cells): a dev build says so rather than drop
        // cells silently, which would leave part of the hole closed.
        if (import.meta.env.DEV) console.warn(`pickTopCells: more than ${out.length} cells; the rest stay closed`);
        return k;
      }
      out[k++] = c;
    }
  }
  return k;
}

export interface TopPatch {
  /** The patch: the top over the worm, with the fade. */
  readonly mesh: THREE.Mesh;
  /** Cells the patch draws right now (ascending ids, the first `count`); the terrain skips exactly these. */
  readonly cells: Int32Array;
  readonly count: number;
  /** Once per rendered frame, after the fade's uniforms are set: moves the cells. Allocates nothing. */
  update(fade: FadeFrame, camX: number, camZ: number, spine: ArrayLike<number>): void;
}

/**
 * The patch for the terrain mesh `terrain` (terrainMesh.ts buildTerrain: cell c's two triangles at
 * indices 6c to 6c + 5), whose grid is `lines` with vertex heights `heights`.
 */
export function buildTopPatch(terrain: THREE.Mesh, lines: readonly number[], heights: ArrayLike<number>): TopPatch {
  const n = lines.length;
  const ends = new Uint32Array((n - 1) * (n - 1));
  for (let c = 0; c < ends.length; c++) ends[c] = (c + 1) * 6;
  const split = new IndexSplit(terrain.geometry, ends, TOP_PATCH_MAX);
  const balls = cellBalls(lines, heights);
  const mesh = new THREE.Mesh(
    split.fade, createPaintedMaterial({ color: '#ffffff', brush: 1, vertexColors: true, occlude: true }),
  );
  // Placed by its index buffer round the worm; tiny next to the terrain. Shown only while it holds
  // a cell (an empty draw range would still cost a draw call); warmShaders compiles it hidden.
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = GROUND_ORDER;
  mesh.name = 'litterTopPatch';

  const next = new Int32Array(TOP_PATCH_MAX);
  return {
    mesh,
    cells: split.parts,
    get count() { return split.count; },
    update(fade, camX, camZ, spine) {
      split.setParts(next, pickTopCells(lines, balls, fade, camX, camZ, spine, next));
      mesh.visible = split.count > 0;
    },
  };
}
