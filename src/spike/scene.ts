import * as THREE from 'three';
import { buildSky } from '../render/sky';
import { buildAtmosphere } from '../render/atmosphere';
import { buildTerrain } from '../surface/terrainMesh';
import { buildForestTrees } from '../surface/forestTrees';
import { buildDistantTrees } from '../surface/distantTrees';
import { buildLeafLitter } from '../surface/leafLitterMesh';
import { HeroWorm } from '../worm/wormMesh';

export { WORLD_HALF } from '../surface/terrain';

export interface SpikeScene {
  scene: THREE.Scene;
  leaves: THREE.InstancedMesh;
  /** Continuous tube body plus its contact shadow. */
  worm: HeroWorm;
  /** Light shafts and dust motes; hidden on low quality tiers. */
  atmosphere: THREE.Group;
  totalLeaves: number;
}

/** Thin composer: every part is built in its own module. */
export function buildScene(leafCount: number, wormSegments: number): SpikeScene {
  const scene = new THREE.Scene();
  const leaves = buildLeafLitter(leafCount);
  const atmosphere = buildAtmosphere();

  // The hero worm: no eyes (spec 8.3); it is posed from the simulated spine every frame.
  const worm = new HeroWorm(wormSegments);

  scene.add(buildTerrain(), buildForestTrees(), buildDistantTrees(), leaves, worm.group, buildSky(), atmosphere);
  return { scene, leaves, worm, atmosphere, totalLeaves: leafCount };
}
