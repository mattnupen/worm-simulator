import * as THREE from 'three';
import { sharedLighting } from '../render/paintedMaterial';
import type { World } from '../game/world';
import { WORM_SEGMENTS, type Crawl } from '../game/crawl';
import type { WormPose } from '../worm/wormMesh';
import type { BurrowGame } from './burrowGame';
import type { Slab } from './slab';
import { createCutFace } from './cutFace';
import { createHollowMesh } from './hollowMesh';
import { createSlabProps } from './slabProps';
import { createMiddens } from './middens';
import { cutPose, CUT_MARGIN, type CutPose } from './cutCamera';
import { clipBeyond } from './cutClip';
import { swingPose } from './swingCamera';
import { bodyProgress, cameraProgress, dipDarkness, type Mode } from './modeMachine';
import { smootherstep } from './easing';
import { AXIS_UP } from './bodyPath';
import { slabX, slabZ } from './slab';
import { litterTopHeight } from '../surface/litterDepth';

/** What the cut scene shows over the canvas (DOM: burrowing.ts; nothing in the unit tests). */
export interface CutHud {
  /** The game's place, for tests and screenshots (`#app[data-place]`). */
  place(mode: Mode): void;
  /** The reduced-motion dip through dark soil: 0 clear .. 1 dark. */
  dip(o: number): void;
  /**
   * The layer names at the slab's ends (layerLabels.ts), shown once the camera is at the cut;
   * `headU` is the drawn head's place along the cut.
   */
  labels(camera: THREE.Camera, s: Slab | null, show: boolean, width: number, height: number, headU: number): void;
  /** The drawn head on screen underground (CSS pixels): the hint card keeps off it (hintPlace.ts). */
  head(x: number, y: number): void;
}

export interface CutScene {
  /** The cut face and its stones, roots and life (hidden on the surface). */
  readonly group: THREE.Group;
  /** Poses this frame: the surface as before, or the cut and the camera's moves between. */
  sync(alpha: number, timeSec: number, camera: THREE.PerspectiveCamera, width: number, height: number): void;
  /**
   * Sends the hollow tiles' buffers to the GPU now, at load (after warmShaders, while the Start
   * card is up), so the first dig-down does not (spec 2026-10-08 section 4.3).
   */
  preload(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** The forest beyond the cut fades into haze from just behind it (spec 4.1: "dimmed by depth haze"). */
const HAZE_FROM = 1.5;
const HAZE_SPAN = 26;
/**
 * Behind everything (the clear colour): deep soil, the colour the cut face fades to at its ends and
 * bottom as it comes out on screen: anything the camera sees past them reads as more soil, never a
 * black void. Over the surface the sky and the ground cover it. (sRGB, matched to the face's fade
 * by eye.)
 */
export const DEEP_SOIL = '#140d08';
const headAt = new THREE.Vector3();

/**
 * Draws the underground (V2 spec 4, 5, 7): the cut face, its stones, roots and life, the burrow
 * openings on the surface, and the camera's moves. Built once at load and added to the scene then,
 * so warmShaders compiles it with everything else; going down and coming up only show, hide and
 * set uniforms. From a dig until the worm is back up the crawl stands still (the game does not
 * step it; its hero leaves and leaf map are not touched here). While the camera is at the cut the
 * surface is drawn whole and cheap (World.syncWorm with no hole), its rim light off (the forest's
 * own rocks and log must not glow in front of the dark soil) and its forest hazed from just behind
 * the cut. The slab's props build over the frames the camera still holds behind the worm.
 */
export function createCutScene(game: BurrowGame, world: World, crawl: Crawl, hud: CutHud): CutScene {
  const face = createCutFace();
  // The tunnels' back halves (spec 2026-10-08 section 4.3), drawn after the face so their pixels
  // behind it fail the depth test early (the face has no named order in drawOrder.ts: opaque 0).
  const hollow = createHollowMesh(face.uniforms);
  hollow.mesh.renderOrder = face.mesh.renderOrder + 1;
  const props = createSlabProps();
  const middens = createMiddens();
  const group = new THREE.Group();
  group.name = 'underground';
  group.add(face.mesh, hollow.mesh, props.mesh);
  group.visible = false;
  world.scene.add(group, middens.mesh);
  world.scene.background = new THREE.Color(DEEP_SOIL);

  const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
  const scratch: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
  const focus = { x: 0, y: 0, z: 0 };
  const surfCam = new THREE.PerspectiveCamera();
  const cp: CutPose = { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0 };
  const baseFog = { near: sharedLighting.uFogNear.value, far: sharedLighting.uFogFar.value };
  /** Showing the game's moves or the cut (not the surface as V1 drew it). */
  let away = false;
  /** The slab the face shows, and whether its props are still building (one part a frame). */
  let slabVersion = game.slabVersion;
  let building = false;
  let place: Mode | null = null;
  /** How far the body lies off the cut toward the camera, at most (it slides in as it sinks). */
  let offMost = 0;

  /** Back on the surface: everything as before the dig. */
  function home(camera: THREE.PerspectiveCamera): void {
    away = false;
    group.visible = false;
    world.worm.showShadow(true);
    const up = world.worm.up;
    up.x = 0; up.y = 1; up.z = 0;
    world.setRimShare(1);
    sharedLighting.uFogNear.value = baseFog.near;
    sharedLighting.uFogFar.value = baseFog.far;
    camera.updateProjectionMatrix();
    hud.dip(0);
  }

  /** A new slab: the face at once (cheap), the props one part a frame while nothing shows yet. */
  function rebuild(s: Slab): void {
    if (slabVersion !== game.slabVersion) {
      slabVersion = game.slabVersion;
      face.setSlab(s, game.grid);
      hollow.setSlab(s, game.grid);
      props.startSlab(s, game.solids);
      building = true;
    }
    if (building) {
      if (game.slabHidden) building = !props.buildStep();
      else {
        while (!props.buildStep());
        building = false;
      }
    }
    // The soil's changed rows (none while the next slab's soil is still being laid).
    if (!game.stage) {
      face.upload(game.grid);
      hollow.upload(game.grid);
    }
  }

  /** The worm in the cut (and on its way in and out), from the game's last two steps; `offMost` too. */
  function poseWorm(s: Slab, alpha: number, timeSec: number): void {
    const w = game.worm;
    const sp = pose.spine;
    offMost = 0;
    for (let i = 0; i < WORM_SEGMENTS; i++) {
      const u = lerp(w.prevU[i], w.u[i], alpha);
      const off = lerp(game.prevW[i], game.offW[i], alpha);
      offMost = Math.max(offMost, off);
      sp[i * 3] = slabX(s, u) + s.nx * off;
      sp[i * 3 + 1] = lerp(w.prevV[i], w.v[i], alpha) - AXIS_UP;
      sp[i * 3 + 2] = slabZ(s, u) + s.nz * off;
    }
    pose.phase = lerp(w.prevWave.phase, w.wave.phase, alpha);
    pose.activity = lerp(w.prevWave.activity, w.wave.activity, alpha);
    pose.timeSec = timeSec;
    focus.x = sp[0];
    focus.y = sp[1];
    focus.z = sp[2];
  }

  return {
    group,
    preload(renderer, camera) {
      // An addition to spec 4.3 (which only builds the pool at load), for the first-dig hitch: the
      // pool (about 11 MB: 7.9 MB of attributes and a 3.1 MB index) has its first bufferData the
      // first frame it is drawn, and on the Mac that frame cost 4 to 6 ms more, several times that
      // on a Chromebook, mid camera swing. three has no call that only uploads a geometry, so draw
      // the hollow alone once: its draw range is empty (nothing is drawn, no pixel changes, nothing
      // is cleared) but three uploads every attribute and the index to draw it. Drawn alone, it
      // renders with three's _emptyScene (no fog, environment or lights), so its program matches
      // warmShaders' and this compiles nothing only while world.scene has no fog, environment or
      // three Lights either (the game lights by uniforms); add any of those and this compiles.
      const mesh = hollow.mesh;
      const culled = mesh.frustumCulled;
      const clear = renderer.autoClear;
      mesh.frustumCulled = false;
      renderer.autoClear = false;
      try {
        renderer.render(mesh, camera);
      } finally {
        mesh.frustumCulled = culled;
        renderer.autoClear = clear;
      }
    },
    sync(alpha, timeSec, camera, width, height) {
      const m = game.mode;
      if (m.mode !== place) {
        place = m.mode;
        hud.place(place);
      }
      middens.update(game.openings);
      middens.show(m);
      const s = game.slab;
      if (m.mode === 'surface' || !s) {
        if (away) home(camera);
        world.sync(crawl, alpha, timeSec, camera);
        hud.labels(camera, null, false, width, height, NaN);
        return;
      }
      if (!away) {
        away = true;
        world.worm.showShadow(false);
      }
      rebuild(s);

      // The camera: from the (still) surface follow camera round to the cut camera (swingCamera.ts),
      // the forest in front of the cut cut away as it comes (the body still sliding into the cut
      // kept); or a dip through dark soil with reduced motion, the camera cut in the dark.
      crawl.interpolate(1, timeSec, scratch, surfCam);
      const c = game.cam;
      const q = game.camPrev;
      cutPose(s, lerp(q.cu, c.cu.value, alpha), lerp(q.cv, c.cv.value, alpha), lerp(q.h, c.h.value, alpha),
        lerp(q.pitch, c.pitch.value, alpha), cp);
      const p = cameraProgress(m);
      const e = smootherstep(p);
      hud.dip(dipDarkness(m));
      poseWorm(s, alpha, timeSec);
      headAt.set(crawl.focus.x, crawl.focus.y, crawl.focus.z);
      const ahead = swingPose(surfCam, headAt, cp, s, p, CUT_MARGIN + offMost, camera);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      if (ahead < Infinity) clipBeyond(camera, s, ahead);
      // Shown once the camera starts to move (until then the worm sinks seen from behind, as on the
      // surface). Coming up, the props go once the camera is halfway home: the worm crawls out along
      // the cut's top, where they stand.
      group.visible = p > 0;
      props.mesh.visible = m.mode !== 'comingUp' || e >= 0.5;
      const d = Math.hypot(cp.px - cp.lx, cp.py - cp.ly, cp.pz - cp.lz);
      sharedLighting.uFogNear.value = lerp(baseFog.near, d + HAZE_FROM, e);
      sharedLighting.uFogFar.value = lerp(baseFog.far, d + HAZE_FROM + HAZE_SPAN, e);
      world.setRimShare(1 - e);

      // The tube's back turns from the sky to the camera as the worm sinks, and back as the
      // camera swings home with it.
      const b = m.mode === 'diggingDown' ? smootherstep(bodyProgress(m)) : e;
      const up = world.worm.up;
      const ul = Math.hypot(s.nx * b, 1 - b, s.nz * b) || 1;
      up.x = (s.nx * b) / ul; up.y = (1 - b) / ul; up.z = (s.nz * b) / ul;
      // The worm is seen through the litter (the hole in it: the leaf fade, the floor patch) only
      // while the camera is over the litter. Under it (at the cut, and as the camera comes down to
      // it) the litter's top is not drawn from below: the surface is whole. And once the ground in
      // front of the cut is being cut away, the hole shows the cut face below the worm, not a patch
      // of floor hanging in front of it.
      const over = camera.position.y > litterTopHeight(camera.position.x, camera.position.z);
      world.syncWorm(pose, focus, camera, e < 1 && over, ahead === Infinity);
      const headU = lerp(game.worm.prevU[0], game.worm.u[0], alpha);
      hud.labels(camera, s, m.mode === 'underground' && e > 0.98, width, height, headU);
      if (m.mode === 'underground') {
        headAt.set(focus.x, focus.y + AXIS_UP, focus.z).project(camera);
        hud.head(((headAt.x + 1) / 2) * width, ((1 - headAt.y) / 2) * height);
      }
    },
  };
}
