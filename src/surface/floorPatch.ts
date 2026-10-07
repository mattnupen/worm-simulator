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
 * that the vertex shader lays on the floor under the middle of the body, drawing only the cells
 * the hole over the worm can show (floorCellShown). Each cell has its own four corners, so a dropped cell leaves its neighbours
 * whole. One draw call.
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
  g.setIndex(new THREE.BufferAttribute(idx, 1));
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
