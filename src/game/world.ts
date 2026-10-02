import * as THREE from 'three';
import { buildSky } from '../render/sky';
import { buildAtmosphere, type Atmosphere } from '../render/atmosphere';
import { setRimLight } from '../render/paintedMaterial';
import { setFocus, setLeafReaction, uploadDisturbance } from '../render/groundUniforms';
import { PRESETS, type PresetSpec } from '../render/graphics';
import { buildTerrain } from '../surface/terrainMesh';
import { buildForestTrees } from '../surface/forestTrees';
import { buildDistantTrees } from '../surface/distantTrees';
import { buildLeafLitter, type LeafLitter } from '../surface/leafLitterMesh';
import { buildDetailLayer, type DetailLayer } from '../surface/detailLeaves';
import { buildGroundProps, writeHeroLog, type GroundProps } from '../surface/groundProps';
import { HeroWorm, type WormPose } from '../worm/wormMesh';
import { wormSurface, type WormSurface } from '../worm/surfaceHeight';
import { WORM_SEGMENTS, type Crawl } from './crawl';

export interface World {
  scene: THREE.Scene;
  /** One merged mesh, built with Ultra's leaf count. */
  litter: LeafLitter;
  /** The close-up leaf layer around the worm (built when a preset first draws it). */
  detail: DetailLayer;
  /** Rocks and ground clutter. */
  props: GroundProps;
  /** Light shafts, dust motes and falling leaves. */
  atmosphere: Atmosphere;
  /** Continuous tube body plus its contact shadow. */
  worm: HeroWorm;
  /**
   * Shows a preset: counts by draw range, effects by visibility, rim light by uniform. Allocates
   * nothing. The renderer's pixel ratio is the caller's.
   */
  apply(spec: PresetSpec): void;
  /** Poses everything that moves with the simulation for this rendered frame. Allocates nothing. */
  sync(crawl: Crawl, alpha: number, timeSec: number, camera: THREE.PerspectiveCamera): void;
}

/**
 * The forest floor, built once at Ultra size so presets only trim it. Thin composer: every
 * part is built in its own module.
 */
export function buildWorld(): World {
  const scene = new THREE.Scene();
  const litter = buildLeafLitter(PRESETS.ultra.litter);
  const detail = buildDetailLayer(PRESETS.ultra.detail);
  const props = buildGroundProps();
  const atmosphere = buildAtmosphere();
  // The hero worm: no eyes (spec 8.3); it is posed from the simulated spine every frame.
  let reaction = true;
  const surf: WormSurface = { y: 0, under: 0 };
  // The contact shadow lies on the same surface the worm rests on.
  const worm = new HeroWorm(WORM_SEGMENTS, (x, z) => wormSurface(x, z, reaction, surf).y);
  const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };

  // The ground fills most of the screen: draw it after everything that sits on it, so the
  // depth test skips ground pixels already covered by leaves, props and trunks.
  const terrain = buildTerrain();
  terrain.renderOrder = 5;
  scene.add(
    terrain, buildForestTrees(writeHeroLog), buildDistantTrees(), litter.mesh, detail.group, props.mesh, worm.group,
    buildSky(), atmosphere.group,
  );
  return {
    scene, litter, detail, props, atmosphere, worm,
    apply(spec) {
      reaction = spec.reaction;
      litter.setCount(spec.litter);
      detail.setCount(spec.detail);
      props.setDensity(spec.clutter);
      atmosphere.setLevel(spec.effects, spec.extraEffects);
      setRimLight(spec.rim);
      setLeafReaction(spec.reaction);
    },
    sync(crawl, alpha, timeSec, camera) {
      crawl.interpolate(alpha, timeSec, pose, camera);
      worm.update(pose);
      setFocus(crawl.focus.x, crawl.focus.y, crawl.focus.z);
      if (crawl.disturbed) {
        uploadDisturbance(crawl.disturbance);
        crawl.disturbed = false;
      }
    },
  };
}
