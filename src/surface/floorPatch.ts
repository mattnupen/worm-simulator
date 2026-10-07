import * as THREE from 'three';
import {
  createFloorMaterial, FLOOR_CELL, FLOOR_CELL_BALL, FLOOR_CENTRE, FLOOR_KEEP, FLOOR_SEGS,
} from '../render/floorMaterial';
import { OCC_REACH } from '../render/occlusion';
import { terrainHeight } from './terrain';
import { FLOOR_ORDER } from '../render/drawOrder';
import { spineDistance } from '../render/nearClutterGlsl';

/**
 * The F layer under the worm (floorMaterial.ts): one static grid of FLOOR_SEGS x FLOOR_SEGS cells
 * that the vertex shader lays on the floor under the middle of the body. Each cell has its own four
 * corners, at vertices 4c to 4c + 3 for cell c = j * FLOOR_SEGS + i, so a dropped cell leaves its
 * neighbours whole. Each frame updateFloorPatch lists only the cells the hole over the worm can
 * show (floorCellShown) in its index buffer, so the vertex shader runs for those alone. One draw.
 */
export function buildFloorPatch(): THREE.Mesh {
  const cells = FLOOR_SEGS * FLOOR_SEGS;
  const pos = new Float32Array(cells * 4 * 3);
  const cell = new Float32Array(cells * 4 * 2);
  const idx = new Uint16Array(cells * 6);
  let v = 0;
  let p = 0;
  for (let j = 0; j < FLOOR_SEGS; j++) {
    for (let i = 0; i < FLOOR_SEGS; i++) {
      const x = i - FLOOR_SEGS / 2;
      const z = j - FLOOR_SEGS / 2;
      for (let c = 0; c < 4; c++) {
        pos[(v + c) * 3] = x + (c & 1);
        pos[(v + c) * 3 + 2] = z + (c >> 1);
        cell[(v + c) * 2] = x + 0.5;
        cell[(v + c) * 2 + 1] = z + 0.5;
      }
      // Corners a (x, z), b (x + 1, z), d (x, z + 1), e (x + 1, z + 1): counter-clockwise seen from above (+y).
      idx[p++] = v; idx[p++] = v + 2; idx[p++] = v + 1;
      idx[p++] = v + 1; idx[p++] = v + 2; idx[p++] = v + 3;
      v += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aCell', new THREE.BufferAttribute(cell, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1).setUsage(THREE.DynamicDrawUsage));
  // Nothing until the first updateFloorPatch places it.
  g.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(g, createFloorMaterial());
  // Placed round the worm in the shader.
  mesh.frustumCulled = false;
  mesh.renderOrder = FLOOR_ORDER;
  mesh.name = 'floorPatch';
  return mesh;
}

/**
 * The world (x, z) of the grid's centre for this spine (SPINE_POINTS x, y, z triples): its
 * FLOOR_CENTRE point, snapped to whole cells, as the vertex shader places it. Writes `out`.
 */
export function floorGridCentre(spine: ArrayLike<number>, out: number[]): void {
  out[0] = Math.floor(spine[FLOOR_CENTRE * 3] / FLOOR_CELL + 0.5) * FLOOR_CELL;
  out[1] = Math.floor(spine[FLOOR_CENTRE * 3 + 2] / FLOOR_CELL + 0.5) * FLOOR_CELL;
}

const centre = [0, 0];
const listed = { start: 0, count: 0 };

/**
 * Whether the vertex shader draws the floor's cell centred at world (cx, cz): within FLOOR_KEEP of
 * the spine, and its ball of FLOOR_CELL_BALL, seen through `view` (the view matrix, column-major),
 * within OCC_REACH of one of the body's `count` segments `seg` (occluderSegments' output) as
 * occlusion() measures it. TS twin of floorCellShown in floorMaterial.ts. Allocates nothing.
 */
export function floorCellShown(
  spine: ArrayLike<number>, view: ArrayLike<number>, seg: ArrayLike<number>, count: number, cx: number, cz: number,
): boolean {
  if (spineDistance(spine, cx, cz) > FLOOR_KEEP) return false;
  const cy = terrainHeight(cx, cz);
  const vx = view[0] * cx + view[4] * cy + view[8] * cz + view[12];
  const vy = view[1] * cx + view[5] * cy + view[9] * cz + view[13];
  const d = -(view[2] * cx + view[6] * cy + view[10] * cz + view[14]);
  const near = d - FLOOR_CELL_BALL;
  if (near < 0.05) return true;
  const tx = vx / d;
  const ty = vy / d;
  const r = FLOOR_CELL_BALL / near;
  for (let i = 0; i < count; i++) {
    const o = i * 8;
    const abx = seg[o + 4] - seg[o];
    const aby = seg[o + 5] - seg[o + 1];
    const u = Math.min(1, Math.max(0, ((tx - seg[o]) * abx + (ty - seg[o + 1]) * aby) * seg[o + 3]));
    const q = Math.hypot(tx - seg[o] - abx * u, ty - seg[o + 1] - aby * u);
    if ((q - r) / Math.max(seg[o + 2], seg[o + 6]) < OCC_REACH) return true;
  }
  return false;
}

/**
 * Whether the floor is drawn at world (x, z): inside the grid, in a cell floorCellShown keeps.
 * Allocates nothing.
 */
export function floorDrawnAt(
  spine: ArrayLike<number>, view: ArrayLike<number>, seg: ArrayLike<number>, count: number, x: number, z: number,
): boolean {
  floorGridCentre(spine, centre);
  const i = Math.floor((x - centre[0]) / FLOOR_CELL);
  const j = Math.floor((z - centre[1]) / FLOOR_CELL);
  if (Math.abs(i + 0.5) > FLOOR_SEGS / 2 || Math.abs(j + 0.5) > FLOOR_SEGS / 2) return false;
  return floorCellShown(spine, view, seg, count, centre[0] + (i + 0.5) * FLOOR_CELL, centre[1] + (j + 0.5) * FLOOR_CELL);
}

/**
 * Once per rendered frame, after the fade's segments are set: centres the floor patch `mesh` under
 * this `spine` (uFloorBase, floorGridCentre) and lists in its index buffer only the cells
 * floorCellShown keeps, ascending; returns how many. Allocates nothing.
 */
export function updateFloorPatch(
  mesh: THREE.Mesh, spine: ArrayLike<number>, view: ArrayLike<number>, seg: ArrayLike<number>, count: number,
): number {
  floorGridCentre(spine, centre);
  ((mesh.material as THREE.ShaderMaterial).uniforms.uFloorBase.value as THREE.Vector2).set(centre[0], centre[1]);
  const index = mesh.geometry.index!;
  const idx = index.array as Uint16Array;
  let k = 0;
  for (let j = 0; j < FLOOR_SEGS; j++) {
    for (let i = 0; i < FLOOR_SEGS; i++) {
      const cx = centre[0] + (i - FLOOR_SEGS / 2 + 0.5) * FLOOR_CELL;
      const cz = centre[1] + (j - FLOOR_SEGS / 2 + 0.5) * FLOOR_CELL;
      if (!floorCellShown(spine, view, seg, count, cx, cz)) continue;
      const v = (j * FLOOR_SEGS + i) * 4;
      const p = k * 6;
      idx[p] = v; idx[p + 1] = v + 2; idx[p + 2] = v + 1;
      idx[p + 3] = v + 1; idx[p + 4] = v + 2; idx[p + 5] = v + 3;
      k++;
    }
  }
  // One reused update range (addUpdateRange would allocate a record each frame).
  index.updateRanges.length = 0;
  if (k > 0) {
    listed.count = k * 6;
    index.updateRanges[0] = listed;
    index.needsUpdate = true;
  }
  mesh.geometry.setDrawRange(0, k * 6);
  // An empty draw range would still cost a draw call.
  mesh.visible = k > 0;
  return k;
}
