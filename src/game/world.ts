import * as THREE from 'three';
import { buildSky } from '../render/sky';
import { buildAtmosphere, type Atmosphere } from '../render/atmosphere';
import { setRimLight } from '../render/paintedMaterial';
import {
  groundUniforms, occTileWords, setDisturbFade, setFocus, setLeafReaction, setSpine, uploadDisturbance,
} from '../render/groundUniforms';
import { occluderAxis, occluderSegments } from '../render/occluderSegments';
import { occlusionTiles } from '../render/occlusionTiles';
import { worldUpInView } from '../render/occlusion';
import type { FadeFrame } from '../render/fadeBall';
import { PRESETS, type PresetSpec } from '../render/graphics';
import { buildTerrain, heightGrid } from '../surface/terrainMesh';
import { buildTopPatch } from '../surface/topPatch';
import { buildForestTrees } from '../surface/forestTrees';
import { buildDistantTrees } from '../surface/distantTrees';
import { buildLeafLitter, type LeafLitter } from '../surface/leafLitterMesh';
import { buildDetailLayer, pocketCount, type DetailLayer } from '../surface/detailLeaves';
import { buildPocketLeaves, type PocketLeaves } from '../surface/pocketLeaves';
import { HeroLeafMesh } from '../surface/heroLeafMesh';
import { buildNearClutterLayer, type NearClutterLayer } from '../surface/nearClutter';
import { buildGroundProps, writeHeroLog, type GroundProps } from '../surface/groundProps';
import { buildFloorPatch, updateFloorPatch } from '../surface/floorPatch';
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
  /** The leaves in the litter round the buried worm, seen through the hole over it (built with the detail layer). */
  readonly pocket: DetailLayer<PocketLeaves>;
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
  const pocket = buildDetailLayer(pocketCount(PRESETS.ultra.detail), buildPocketLeaves, 'pocketLayer');
  const props = buildGroundProps();
  // The ground fills most of the screen: draw it after everything that sits on it, so the
  // depth test skips ground pixels already covered by leaves, props and trunks.
  const terrain = buildTerrain();
  terrain.renderOrder = GROUND_ORDER;
  // The top over the worm, with the fade: the terrain skips the cells it draws.
  const grid = heightGrid();
  const top = buildTopPatch(terrain, grid.lines, grid.heights);
  const floor = buildFloorPatch();
  forest.add(
    terrain, top.mesh, floor, buildForestTrees(writeHeroLog), buildDistantTrees(), litter.group, detail.group,
    pocket.group, props.mesh,
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
  // What the fade sees this frame, for the parts split off to carry it (indexSplit.ts).
  const fade: FadeFrame = { view: occBox, seg: groundUniforms.uOccSeg.value, count: 0, far: 0 };

  scene.add(forest, hero.mesh, nearClutter.group, worm.group, buildSky(), atmosphere.group);
  return {
    scene, litter, detail, pocket, props, hero, nearClutter, atmosphere, worm,
    apply(spec) {
      litter.setCount(scaledLeafCount(spec.litter));
      detail.setCount(scaledLeafCount(spec.detail));
      pocket.setCount(pocketCount(spec.detail));
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
      // The near clutter keeps clear of the spine, the floor patch centres on it, and the pocket's
      // leaves keep round it.
      setSpine(pose.spine);
      // The leaf fade (every preset): the body as this frame's camera sees it.
      camera.updateMatrixWorld();
      const pe = camera.projectionMatrix.elements;
      const g = groundUniforms;
      const view = camera.matrixWorldInverse.elements;
      g.uOccCount.value = occluderSegments(pose.spine, view, pe[0], pe[5], g.uOccSeg.value, occBox);
      occluderAxis(g.uOccSeg.value, g.uOccCount.value, g.uOccAxis.value);
      // Only on-screen pixels fade: the box clipped to the screen, cut into the fade's tiles.
      for (let k = 0; k < 2; k++) {
        occBox[k] = Math.max(-1, occBox[k]);
        occBox[k + 2] = Math.min(1, occBox[k + 2]);
      }
      g.uOccBox.value.fromArray(occBox);
      if (occBox[0] < occBox[2] && occBox[1] < occBox[3]) {
        occlusionTiles(g.uOccSeg.value, g.uOccCount.value, occBox, pe[0], pe[5], occTileWords);
      }
      g.uOccDepth.value = occBox[4];
      worldUpInView(view, g.uOccUp.value);
      g.uOccTan.value.set(1 / pe[0], 1 / pe[5]);
      fade.view = view;
      fade.count = g.uOccCount.value;
      fade.far = occBox[4];
      top.update(fade, camera.position.x, camera.position.z, pose.spine);
      updateFloorPatch(floor, pose.spine, view, g.uOccSeg.value, g.uOccCount.value);
      const wrap = g.uWrapCentre.value;
      pocket.built?.update(fade, pose.spine, crawl.focus.x, crawl.focus.z, wrap.x, wrap.y, crawl.disturbance);
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
