import * as THREE from 'three';
import { mulberry32 } from '../core/random';
import { createPaintedMaterial } from '../render/paintedMaterial';
import { terrainHeight, WORLD_HALF } from './terrain';

/** Trunks sink this far below the ground so their base never floats on a slope. */
const TRUNK_SINK = 0.3;

/**
 * Paper birch (white) and sugar maple (brown) trunks with simple canopies, standing on the
 * terrain. (Placeholder art; a later pass replaces these with instanced bark-detailed trees.)
 */
export function buildForestTrees(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'forestTrees';
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
    const ground = terrainHeight(x, z) - TRUNK_SINK;
    const trunk = new THREE.Mesh(trunkGeo, birch ? birchBark : mapleBark);
    trunk.position.set(x, ground, z);
    const canopy = new THREE.Mesh(canopyGeo, birch ? birchLeaves : mapleLeaves);
    canopy.position.set(x, ground + 14, z);
    group.add(trunk, canopy);
  }
  return group;
}
