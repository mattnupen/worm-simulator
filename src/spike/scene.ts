import * as THREE from 'three';
import { createPaintedMaterial } from '../render/paintedMaterial';
import { buildSky } from '../render/sky';
import { buildAtmosphere } from '../render/atmosphere';
import { buildTerrain } from '../surface/terrainMesh';
import { buildForestTrees } from '../surface/forestTrees';
import { buildDistantTrees } from '../surface/distantTrees';
import { buildLeafLitter } from '../surface/leafLitterMesh';

export { WORLD_HALF } from '../surface/terrain';

export interface SpikeScene {
  scene: THREE.Scene;
  leaves: THREE.InstancedMesh;
  worm: THREE.InstancedMesh;
  /** Light shafts and dust motes; hidden on low quality tiers. */
  atmosphere: THREE.Group;
  totalLeaves: number;
}

/** Thin composer: every part is built in its own module. */
export function buildScene(leafCount: number, wormSegments: number): SpikeScene {
  const scene = new THREE.Scene();
  const leaves = buildLeafLitter(leafCount);
  const atmosphere = buildAtmosphere();

  // Worm: one instanced sphere per segment. No eyes (spec 8.3).
  const worm = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 10, 8),
    createPaintedMaterial({ color: '#d98c8c', brush: 0.3 }),
    wormSegments,
  );
  worm.frustumCulled = false;

  scene.add(buildTerrain(), buildForestTrees(), buildDistantTrees(), leaves, worm, buildSky(), atmosphere);
  return { scene, leaves, worm, atmosphere, totalLeaves: leafCount };
}
