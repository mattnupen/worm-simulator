import * as THREE from 'three';
import { buildSky } from '../render/sky';
import { buildAtmosphere, type Atmosphere } from '../render/atmosphere';
import { setRimLight } from '../render/paintedMaterial';
import {
  groundUniforms, setDisturbFade, setFocus, setLeafReaction, setSpine, uploadDisturbance,
} from '../render/groundUniforms';
import { occluderSegments } from '../render/occluderSegments';
import { worldUpInView } from '../render/occlusion';
import { PRESETS, type PresetSpec } from '../render/graphics';
import { buildTerrain } from '../surface/terrainMesh';
import { buildForestTrees } from '../surface/forestTrees';
import { buildDistantTrees } from '../surface/distantTrees';
import { buildLeafLitter, type LeafLitter } from '../surface/leafLitterMesh';
import { buildDetailLayer, type DetailLayer } from '../surface/detailLeaves';
import { HeroLeafMesh } from '../surface/heroLeafMesh';
import { buildNearClutterLayer, type NearClutterLayer } from '../surface/nearClutter';
import { buildGroundProps, writeHeroLog, type GroundProps } from '../surface/groundProps';
import { buildFloorPatch } from '../surface/floorPatch';
import { GROUND_ORDER } from '../render/drawOrder';
import { HeroWorm, type WormPose } from '../worm/wormMesh';
import { wormSurface, type WormSurface } from '../worm/surfaceHeight';
import { WORM_SEGMENTS, type Crawl } from './crawl';
import { scaledLeafCount } from '../surface/leafScale';

export interface World {
  scene: THREE.Scene;
  /** The base litter in chunks (full and low-detail meshes), built with Ultra's leaf count. */
  readonly litter: LeafLitter;
  /** The close-up leaf layer around the worm, on the top of the litter (built when a preset first draws it). */
  readonly detail: DetailLayer;
  /** The loose physics leaves near the head (one instanced draw; the crawl's pool sets the count). */
  hero: HeroLeafMesh;
  /** Rocks and ground clutter. */
  readonly props: GroundProps;
  /** Ultra's extra clutter around the worm (built when Ultra is first shown). */
  nearClutter: NearClutterLayer;
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
export function buildWorld(crawl: Crawl): World {
  const scene = new THREE.Scene();
  const forest = new THREE.Group();
  forest.name = 'forest';
  // Built at Ultra's counts for real-size leaves (bigger leaves, fewer of them: leafScale.ts).
  const litter = buildLeafLitter(scaledLeafCount(PRESETS.ultra.litter));
  const detail = buildDetailLayer(scaledLeafCount(PRESETS.ultra.detail));
  const props = buildGroundProps();
  // The ground fills most of the screen: draw it after everything that sits on it, so the
  // depth test skips ground pixels already covered by leaves, props and trunks.
  const terrain = buildTerrain();
  terrain.renderOrder = GROUND_ORDER;
  forest.add(
    terrain, buildFloorPatch(), buildForestTrees(writeHeroLog), buildDistantTrees(), litter.group, detail.group,
    props.mesh,
  );
  const hero = new HeroLeafMesh(crawl.hero);
  const nearClutter = buildNearClutterLayer();
  const atmosphere = buildAtmosphere();
  // The hero worm: no eyes (spec 8.3); it is posed from the simulated spine every frame.
  const surf: WormSurface = { y: 0, under: 1 };
  // The contact shadow lies on the same surface the worm rests on.
  const worm = new HeroWorm(WORM_SEGMENTS, (x, z) => wormSurface(x, z, surf).y);
  const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
  const occBox = new Float32Array(5);

  scene.add(forest, hero.mesh, nearClutter.group, worm.group, buildSky(), atmosphere.group);
  return {
    scene, litter, detail, props, hero, nearClutter, atmosphere, worm,
    apply(spec) {
      litter.setCount(scaledLeafCount(spec.litter));
      detail.setCount(scaledLeafCount(spec.detail));
      props.setDensity(spec.clutter);
      nearClutter.show(spec.nearClutter);
      atmosphere.setLevel(spec.effects, spec.extraEffects);
      setRimLight(spec.rim);
      setLeafReaction(spec.reaction);
    },
    sync(crawl, alpha, timeSec, camera) {
      crawl.interpolate(alpha, timeSec, pose, camera);
      worm.update(pose);
      hero.update(crawl.hero, alpha, timeSec);
      setFocus(crawl.focus.x, crawl.focus.y, crawl.focus.z);
      // The near clutter keeps clear of the spine, and the floor patch centres on it.
      setSpine(pose.spine);
      // The leaf fade (every preset): the body as this frame's camera sees it.
      camera.updateMatrixWorld();
      const pe = camera.projectionMatrix.elements;
      const g = groundUniforms;
      const view = camera.matrixWorldInverse.elements;
      g.uOccCount.value = occluderSegments(pose.spine, view, pe[0], pe[5], g.uOccSeg.value, occBox);
      g.uOccBox.value.fromArray(occBox);
      g.uOccDepth.value = occBox[4];
      worldUpInView(view, g.uOccUp.value);
      g.uOccTan.value.set(1 / pe[0], 1 / pe[5]);
      if (crawl.disturbed) {
        uploadDisturbance(crawl.disturbance);
        // The window the pocket's leaves read the map in.
        setDisturbFade(crawl.reach.fadeFrom, crawl.reach.fadeTo);
        crawl.disturbed = false;
      }
      // Per litter chunk: full or low-detail leaves, and whether it may fade.
      litter.update(camera.position.x, camera.position.z, pose.spine);
    },
  };
}
