import * as THREE from 'three';
import { createPaintedMaterial } from '../render/paintedMaterial';
import { placeLeaves, LEAF_COLORS } from '../surface/leafLitter';
import { mulberry32 } from '../core/random';

export const WORLD_HALF = 20;

export interface SpikeScene {
  scene: THREE.Scene;
  leaves: THREE.InstancedMesh;
  worm: THREE.InstancedMesh;
  totalLeaves: number;
}

export function buildScene(leafCount: number, wormSegments: number): SpikeScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f3c98b');

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2).rotateX(-Math.PI / 2),
    createPaintedMaterial({ color: '#7a4f2a', brush: 0.9 }),
  );
  scene.add(ground);

  // Paper birch (white) and sugar maple (brown) trunks with simple canopies.
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.45, 14, 8).translate(0, 7, 0);
  const canopyGeo = new THREE.IcosahedronGeometry(3.5, 1);
  const birchBark = createPaintedMaterial({ color: '#efe9dc', brush: 0.8 });
  const mapleBark = createPaintedMaterial({ color: '#5b4330', brush: 0.8 });
  const birchLeaves = createPaintedMaterial({ color: '#e8a33a' });
  const mapleLeaves = createPaintedMaterial({ color: '#d9622b' });
  const rng = mulberry32(7);
  for (let i = 0; i < 14; i++) {
    const birch = i % 2 === 0;
    let x = 0;
    let z = 0;
    do {
      x = (rng() * 2 - 1) * (WORLD_HALF - 2);
      z = (rng() * 2 - 1) * (WORLD_HALF - 2);
    } while (Math.hypot(x, z) < 4);
    const trunk = new THREE.Mesh(trunkGeo, birch ? birchBark : mapleBark);
    trunk.position.set(x, 0, z);
    const canopy = new THREE.Mesh(canopyGeo, birch ? birchLeaves : mapleLeaves);
    canopy.position.set(x, 14, z);
    scene.add(trunk, canopy);
  }

  // Leaf litter: one instanced draw call.
  const leafGeo = new THREE.CircleGeometry(0.5, 7);
  leafGeo.scale(1, 0.62, 1);
  leafGeo.rotateX(-Math.PI / 2);
  const leaves = new THREE.InstancedMesh(
    leafGeo,
    createPaintedMaterial({ color: '#ffffff', doubleSide: true, brush: 0.4 }),
    leafCount,
  );
  const tmp = new THREE.Object3D();
  const color = new THREE.Color();
  placeLeaves(leafCount, WORLD_HALF, 1).forEach((l, i) => {
    tmp.position.set(l.x, 0.02 + l.y, l.z);
    tmp.rotation.set(l.tilt, l.rotY, 0);
    tmp.scale.setScalar(l.scale);
    tmp.updateMatrix();
    leaves.setMatrixAt(i, tmp.matrix);
    leaves.setColorAt(i, color.set(LEAF_COLORS[l.kind]));
  });
  scene.add(leaves);

  // Worm: one instanced sphere per segment. No eyes (spec 8.3).
  const worm = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 10, 8),
    createPaintedMaterial({ color: '#d98c8c', brush: 0.3 }),
    wormSegments,
  );
  worm.frustumCulled = false;
  scene.add(worm);

  return { scene, leaves, worm, totalLeaves: leafCount };
}
