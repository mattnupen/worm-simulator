import * as THREE from 'three';
import { createPaintedMaterial } from '../render/paintedMaterial';
import { placeLeaves, LEAF_COLORS } from './leafLitter';
import { terrainHeight, terrainNormal, WORLD_HALF } from './terrain';

const UP = new THREE.Vector3(0, 1, 0);

/** Leaf litter in one instanced draw, each leaf lying on the terrain and tilted to its slope. */
export function buildLeafLitter(count: number): THREE.InstancedMesh {
  const leafGeo = new THREE.CircleGeometry(0.5, 7);
  leafGeo.scale(1, 0.62, 1);
  leafGeo.rotateX(-Math.PI / 2);
  const leaves = new THREE.InstancedMesh(
    leafGeo,
    createPaintedMaterial({ color: '#ffffff', doubleSide: true, brush: 0.4 }),
    count,
  );
  const tmp = new THREE.Object3D();
  const color = new THREE.Color();
  const slope = new THREE.Quaternion();
  const local = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const n = new THREE.Vector3();
  placeLeaves(count, WORLD_HALF, 1).forEach((l, i) => {
    const tn = terrainNormal(l.x, l.z);
    slope.setFromUnitVectors(UP, n.set(tn.x, tn.y, tn.z));
    local.setFromEuler(euler.set(l.tilt, l.rotY, 0));
    tmp.quaternion.copy(slope).multiply(local);
    tmp.position.set(l.x, terrainHeight(l.x, l.z) + 0.02 + l.y, l.z);
    tmp.scale.setScalar(l.scale);
    tmp.updateMatrix();
    leaves.setMatrixAt(i, tmp.matrix);
    leaves.setColorAt(i, color.set(LEAF_COLORS[l.kind]));
  });
  leaves.name = 'leafLitter';
  return leaves;
}
