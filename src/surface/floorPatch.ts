import * as THREE from 'three';
import { createFloorMaterial, FLOOR_SEGS } from '../render/floorMaterial';
import { FLOOR_ORDER } from '../render/drawOrder';

/**
 * The F layer under the worm (floorMaterial.ts): one static grid of FLOOR_SEGS x FLOOR_SEGS cells
 * that the vertex shader lays on the floor round the head. One draw call.
 */
export function buildFloorPatch(): THREE.Mesh {
  const n = FLOOR_SEGS + 1;
  const pos = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = (j * n + i) * 3;
      pos[k] = i - FLOOR_SEGS / 2;
      pos[k + 2] = j - FLOOR_SEGS / 2;
    }
  }
  const idx = new Uint16Array(FLOOR_SEGS * FLOOR_SEGS * 6);
  let p = 0;
  for (let j = 0; j < FLOOR_SEGS; j++) {
    for (let i = 0; i < FLOOR_SEGS; i++) {
      const a = j * n + i;
      const b = a + 1;
      const d = a + n;
      const e = d + 1;
      // Counter-clockwise seen from above (+y).
      idx[p++] = a; idx[p++] = d; idx[p++] = b;
      idx[p++] = b; idx[p++] = d; idx[p++] = e;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const mesh = new THREE.Mesh(g, createFloorMaterial());
  // Placed round the worm in the shader.
  mesh.frustumCulled = false;
  mesh.renderOrder = FLOOR_ORDER;
  mesh.name = 'floorPatch';
  return mesh;
}
