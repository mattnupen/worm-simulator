import * as THREE from 'three';
import { buildSky } from '../render/sky';
import { buildAtmosphere } from '../render/atmosphere';
import { buildTerrain } from '../surface/terrainMesh';
import { buildForestTrees } from '../surface/forestTrees';
import { buildDistantTrees } from '../surface/distantTrees';
import { buildLeafLitter, type LeafLitter } from '../surface/leafLitterMesh';
import { buildFallingLeaves } from '../surface/fallingLeaves';
import { buildGroundProps, writeHeroLog, type GroundProps } from '../surface/groundProps';
import { HeroWorm } from '../worm/wormMesh';

export interface SpikeScene {
  scene: THREE.Scene;
  /** One merged mesh; `setDensity` trims it for the quality tiers. */
  leaves: LeafLitter;
  /** Continuous tube body plus its contact shadow. */
  worm: HeroWorm;
  /** Rocks and ground clutter; `setDensity` trims the clutter. */
  props: GroundProps;
  /** Light shafts, dust motes and falling leaves; hidden on low quality tiers. */
  atmosphere: THREE.Group;
}

/** Thin composer: every part is built in its own module. */
export function buildScene(leafCount: number, wormSegments: number): SpikeScene {
  const scene = new THREE.Scene();
  const leaves = buildLeafLitter(leafCount);
  const props = buildGroundProps();
  const atmosphere = buildAtmosphere();
  atmosphere.add(buildFallingLeaves());

  // The hero worm: no eyes (spec 8.3); it is posed from the simulated spine every frame.
  const worm = new HeroWorm(wormSegments);

  // The ground fills most of the screen: draw it after everything that sits on it, so the
  // depth test skips ground pixels already covered by leaves, props and trunks.
  const terrain = buildTerrain();
  terrain.renderOrder = 5;
  scene.add(
    terrain, buildForestTrees(writeHeroLog), buildDistantTrees(), leaves.mesh, props.mesh, worm.group,
    buildSky(), atmosphere,
  );
  return { scene, leaves, props, worm, atmosphere };
}
