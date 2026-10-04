import * as THREE from 'three';
import { buildSky } from '../render/sky';
import { buildAtmosphere, type Atmosphere } from '../render/atmosphere';
import { setRimLight } from '../render/paintedMaterial';
import {
  groundUniforms, setDisturbFade, setFocus, setLeafReaction, setSpine, uploadDisturbance,
} from '../render/groundUniforms';
import { occluderSegments } from '../render/occluderSegments';
import { refreshLitterTexture } from '../render/litterTexture';
import { refreshGroundTexture } from '../render/groundTexture';
import { disturbedBox } from '../surface/disturbance';
import { PRESETS, type PresetSpec } from '../render/graphics';
import { buildTerrain } from '../surface/terrainMesh';
import { buildForestTrees } from '../surface/forestTrees';
import { buildDistantTrees } from '../surface/distantTrees';
import { buildLeafLitter, type LeafLitter } from '../surface/leafLitterMesh';
import { buildDetailLayer, type DetailLayer } from '../surface/detailLeaves';
import { HeroLeafMesh } from '../surface/heroLeafMesh';
import { buildNearClutterLayer, type NearClutterLayer } from '../surface/nearClutter';
import { buildGroundProps, writeHeroLog, type GroundProps } from '../surface/groundProps';
import { HeroWorm, type WormPose } from '../worm/wormMesh';
import { wormSurface, type WormSurface } from '../worm/surfaceHeight';
import { WORM_SEGMENTS, type Crawl } from './crawl';
import { scaledLeafCount } from '../surface/leafScale';

/**
 * Everything the world scale mode sizes and places (worldScale.ts): the ground, the near and
 * distant trees with the log, the litter, the detail leaves and the ground props. Rebuilt when the
 * mode changes; the rest of the world stays.
 */
export interface Forest {
  readonly group: THREE.Group;
  readonly litter: LeafLitter;
  readonly detail: DetailLayer;
  readonly props: GroundProps;
}

export interface World {
  scene: THREE.Scene;
  /** The base litter in chunks (full and low-detail meshes), built with Ultra's leaf count. */
  readonly litter: LeafLitter;
  /** The close-up leaf layer around the worm (built when a preset first draws it). */
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
  /**
   * THE way to change the world scale mode: the caller calls setScale(mode), then this, then draws.
   * In order: rebuildForest, the crawl takes the mode (applyScale) and starts again at the spawn
   * with the last applied preset's hero count for the new mode, apply(that preset) on the new
   * forest, compileForest (the new materials take over the old ones' compiled programs), and only
   * then disposeForest(old): nothing recompiles and nothing leaks. Throws if no preset was ever
   * applied. Use only this; the three steps below are its parts, public for tests.
   */
  switchForest(renderer: ForestCompiler, camera: THREE.Camera): void;
  /**
   * Part of switchForest (do not call alone). After setScale: builds the forest for the new mode
   * in place of the old one (the baked litter and ground textures re-baked in place) and returns
   * the old one.
   */
  rebuildForest(): Forest;
  /** Part of switchForest. Compiles every program the forest can draw with (the litter's reacting one too), now. */
  compileForest(renderer: ForestCompiler, camera: THREE.Camera): void;
}

/** What compiling a forest needs of the renderer (a THREE.WebGLRenderer). */
export type ForestCompiler = Pick<THREE.WebGLRenderer, 'compile'>;

/** The scale mode's forest, built at Ultra size so presets only trim it. */
function buildForest(): Forest {
  const group = new THREE.Group();
  group.name = 'forest';
  // Built at Ultra's counts for the scale mode (bigger leaves, fewer of them: leafScale.ts). The
  // detail layer takes its count now and its leaf sizes when first shown: always build a new one
  // with the forest, so both come from the same mode.
  const litter = buildLeafLitter(scaledLeafCount(PRESETS.ultra.litter));
  const detail = buildDetailLayer(scaledLeafCount(PRESETS.ultra.detail));
  const props = buildGroundProps();
  // The ground fills most of the screen: draw it after everything that sits on it, so the
  // depth test skips ground pixels already covered by leaves, props and trunks.
  const terrain = buildTerrain();
  terrain.renderOrder = 5;
  group.add(terrain, buildForestTrees(writeHeroLog), buildDistantTrees(), litter.group, detail.group, props.mesh);
  return { group, litter, detail, props };
}

/**
 * Frees a forest's geometries and materials (after its replacement has compiled). The textures
 * its materials read (noise, baked litter and ground) are shared with the new forest and stay.
 */
export function disposeForest(f: Forest): void {
  const materials = new Set<THREE.Material>([f.litter.materials.active, f.litter.materials.plain, f.litter.materials.far]);
  f.group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    // The distant ring's per-instance buffers (instanceMatrix, instanceColor) are freed only here.
    if (o instanceof THREE.InstancedMesh) o.dispose();
    o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
  });
  for (const m of materials) m.dispose();
}

/**
 * The forest floor, built once at Ultra size so presets only trim it. Thin composer: every
 * part is built in its own module.
 */
export function buildWorld(crawl: Crawl): World {
  const scene = new THREE.Scene();
  let forest = buildForest();
  const hero = new HeroLeafMesh(crawl.hero);
  const nearClutter = buildNearClutterLayer();
  const atmosphere = buildAtmosphere();
  // The hero worm: no eyes (spec 8.3); it is posed from the simulated spine every frame.
  let reaction = true;
  const surf: WormSurface = { y: 0, under: 0 };
  // The contact shadow lies on the same surface the worm rests on.
  const worm = new HeroWorm(WORM_SEGMENTS, (x, z) => wormSurface(x, z, reaction, surf).y);
  const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
  const occBox = new Float32Array(5);
  // Where the uploaded map can move a leaf (disturbedBox); empty until the first upload.
  const distBox = new Float32Array([Infinity, Infinity, -Infinity, -Infinity]);
  /** The preset last shown (apply): a switch shows it again on the new forest. */
  let shown: PresetSpec | null = null;

  scene.add(forest.group, hero.mesh, nearClutter.group, worm.group, buildSky(), atmosphere.group);
  const world: World = {
    scene, hero, nearClutter, atmosphere, worm,
    get litter() { return forest.litter; },
    get detail() { return forest.detail; },
    get props() { return forest.props; },
    apply(spec) {
      shown = spec;
      reaction = spec.reaction;
      forest.litter.setCount(scaledLeafCount(spec.litter));
      forest.detail.setCount(scaledLeafCount(spec.detail));
      forest.props.setDensity(spec.clutter);
      nearClutter.show(spec.nearClutter);
      atmosphere.setLevel(spec.effects, spec.extraEffects);
      setRimLight(spec.rim);
      setLeafReaction(spec.reaction);
    },
    switchForest(renderer, camera) {
      const spec = shown;
      if (!spec) throw new Error('switchForest: apply a preset first');
      const old = world.rebuildForest();
      crawl.applyScale();
      crawl.reset(scaledLeafCount(spec.hero));
      world.apply(spec);
      world.compileForest(renderer, camera);
      disposeForest(old);
    },
    rebuildForest() {
      const old = forest;
      refreshLitterTexture();
      refreshGroundTexture();
      forest = buildForest();
      // A detail layer that was built is built again at once (apply() sets its count), so it
      // compiles with the rest.
      if (old.detail.built) forest.detail.setCount(forest.detail.max);
      scene.remove(old.group);
      scene.add(forest.group);
      return old;
    },
    compileForest(renderer, camera) {
      // The litter's reacting program is only put on a chunk when the worm comes near: lend it to
      // one for the compile, so it is ready too.
      const near = forest.litter.chunks.length > 0 ? forest.litter.chunks[0].near : null;
      const was = near?.material;
      if (near) near.material = forest.litter.materials.active;
      try {
        renderer.compile(forest.group, camera, scene);
      } finally {
        if (near && was) near.material = was;
      }
    },
    sync(crawl, alpha, timeSec, camera) {
      crawl.interpolate(alpha, timeSec, pose, camera);
      worm.update(pose);
      hero.update(crawl.hero, alpha);
      setFocus(crawl.focus.x, crawl.focus.y, crawl.focus.z);
      if (nearClutter.visible) setSpine(pose.spine);
      // The leaf fade (every preset): the body as this frame's camera sees it.
      camera.updateMatrixWorld();
      const pe = camera.projectionMatrix.elements;
      const g = groundUniforms;
      const view = camera.matrixWorldInverse.elements;
      g.uOccCount.value = occluderSegments(pose.spine, view, pe[0], pe[5], g.uOccSeg.value, occBox);
      g.uOccBox.value.fromArray(occBox);
      g.uOccDepth.value = occBox[4];
      g.uOccTan.value.set(1 / pe[0], 1 / pe[5]);
      if (crawl.disturbed) {
        uploadDisturbance(crawl.disturbance);
        // The mode's window: leaves past it never read the map, so chunks there need not react.
        setDisturbFade(crawl.reach.fadeFrom, crawl.reach.fadeTo);
        disturbedBox(crawl.disturbance, distBox, crawl.reach.fadeTo);
        crawl.disturbed = false;
      }
      // Per litter chunk: full or low-detail leaves, and whether it may react (as uploaded now).
      forest.litter.update(camera.position.x, camera.position.z, pose.spine, distBox);
    },
  };
  return world;
}
