import * as THREE from 'three';
import { sharedLighting } from '../render/paintedMaterial';
import type { World } from '../game/world';
import { WORM_SEGMENTS, type Crawl } from '../game/crawl';
import type { WormPose } from '../worm/wormMesh';
import type { BurrowGame } from './burrowGame';
import type { Slab } from './slab';
import { createCutFace } from './cutFace';
import { createSlabProps } from './slabProps';
import { createMiddens } from './middens';
import { cutPose, CUT_MARGIN, FOV_DEG, type CutPose } from './cutCamera';
import { bodyProgress, cameraProgress, dipDarkness, type Mode } from './modeMachine';
import { smootherstep } from './easing';
import { AXIS_UP } from './bodyPath';
import { slabX, slabZ } from './slab';

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
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** The forest beyond the cut fades into haze from just behind it (spec 4.1: "dimmed by depth haze"). */
const HAZE_FROM = 1.5;
const HAZE_SPAN = 26;
/** The camera's swing rises this much at its middle, up over the leaves rather than through them. */
const SWING_ARC = 1.2;
/**
 * Behind everything (the clear colour): deep soil, the colour the cut face fades to at its ends and
 * bottom as it comes out on screen. Mid-swing the camera can see past the face's end and under the
 * ground its near plane opens: that reads as more soil, never a black void. Over the surface the
 * sky and the ground cover it. (sRGB, matched to the face's fade by eye.)
 */
export const DEEP_SOIL = '#140d08';
/** The near plane reaches the cut's plane over this share of the camera's swing. */
const CLIP_IN = 0.25;
const TAN_HALF = Math.tan((FOV_DEG * Math.PI) / 360);
const fwd = new THREE.Vector3();
const headAt = new THREE.Vector3();
const right = new THREE.Vector3();
const upV = new THREE.Vector3();

/**
 * The nearest depth (along the view) at which the camera sees the cut's plane, anywhere on screen,
 * or Infinity where it is behind or edge-on. A point at image-plane (x, y) lies at depth
 * dist / (a + b x + c y), so the nearest is at the corner where that is largest.
 */
function planeDepth(s: Slab, camera: THREE.PerspectiveCamera): number {
  const p = camera.position;
  const dist = s.nx * (p.x - s.ox) + s.nz * (p.z - s.oz);
  if (!(dist > 0)) return Infinity;
  const q = camera.quaternion;
  fwd.set(0, 0, -1).applyQuaternion(q);
  right.set(1, 0, 0).applyQuaternion(q);
  upV.set(0, 1, 0).applyQuaternion(q);
  const a = -(s.nx * fwd.x + s.nz * fwd.z);
  const b = Math.abs(s.nx * right.x + s.nz * right.z) * TAN_HALF * camera.aspect;
  const c = Math.abs(s.nx * upV.x + s.nz * upV.z) * TAN_HALF;
  const most = a + b + c;
  return most > 0 ? dist / most : Infinity;
}

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
  const props = createSlabProps();
  const middens = createMiddens();
  const group = new THREE.Group();
  group.name = 'underground';
  group.add(face.mesh, props.mesh);
  group.visible = false;
  world.scene.add(group, middens.mesh);
  world.scene.background = new THREE.Color(DEEP_SOIL);

  const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
  const scratch: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
  const focus = { x: 0, y: 0, z: 0 };
  const surfCam = new THREE.PerspectiveCamera();
  const cutCam = new THREE.PerspectiveCamera();
  const cp: CutPose = { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0, near: 0.2 };
  const baseFog = { near: sharedLighting.uFogNear.value, far: sharedLighting.uFogFar.value };
  let baseNear = -1;
  /** Showing the game's moves or the cut (not the surface as V1 drew it). */
  let away = false;
  /** The slab the face shows, and whether its props are still building (one part a frame). */
  let slabVersion = game.slabVersion;
  let building = false;
  let place: Mode | null = null;
  /** How far the body lies off the cut toward the camera, at most (it slides in as it sinks). */
  let offMost = 0;

  function setNear(camera: THREE.PerspectiveCamera, near: number): void {
    if (camera.near === near) return;
    camera.near = near;
    camera.updateProjectionMatrix();
  }

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
    setNear(camera, baseNear);
    hud.dip(0);
  }

  /** A new slab: the face at once (cheap), the props one part a frame while nothing shows yet. */
  function rebuild(s: Slab): void {
    if (slabVersion !== game.slabVersion) {
      slabVersion = game.slabVersion;
      face.setSlab(s, game.grid);
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
    if (!game.stage) face.upload(game.grid);
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
    sync(alpha, timeSec, camera, width, height) {
      if (baseNear < 0) baseNear = camera.near;
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

      // The camera: from the (still) surface follow camera to the cut camera, eased; or a dip
      // through dark soil with reduced motion.
      crawl.interpolate(1, timeSec, scratch, surfCam);
      const c = game.cam;
      const q = game.camPrev;
      cutPose(s, lerp(q.cu, c.cu.value, alpha), lerp(q.cv, c.cv.value, alpha), lerp(q.h, c.h.value, alpha),
        lerp(q.pitch, c.pitch.value, alpha), cp);
      cutCam.position.set(cp.px, cp.py, cp.pz);
      cutCam.up.set(0, 1, 0);
      cutCam.lookAt(cp.lx, cp.ly, cp.lz);
      const p = cameraProgress(m);
      const e = m.reduced ? (p < 0.5 ? 0 : 1) : smootherstep(p);
      hud.dip(dipDarkness(m));
      camera.position.lerpVectors(surfCam.position, cutCam.position, e);
      camera.position.y += SWING_ARC * Math.sin(Math.PI * e);
      camera.quaternion.slerpQuaternions(surfCam.quaternion, cutCam.quaternion, e);
      // The near plane: just in front of the cut wherever the camera stands off it (the forest between
      // is not drawn; the body still sliding into the cut is kept), closing in on cutPose's at the end.
      poseWorm(s, alpha, timeSec);
      // It moves out from the surface's over the camera's first CLIP_IN of the swing (never a jump).
      const clear = Math.max(baseNear, planeDepth(s, camera) - CUT_MARGIN - offMost);
      const near = lerp(baseNear, Number.isFinite(clear) ? clear : baseNear, Math.min(1, e / CLIP_IN));
      setNear(camera, Math.max(near, lerp(baseNear, cp.near, e ** 6)));
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
      // At the cut (e = 1) no litter lies between the camera and the worm: the surface is whole.
      world.syncWorm(pose, focus, camera, e < 1);
      const headU = lerp(game.worm.prevU[0], game.worm.u[0], alpha);
      hud.labels(camera, s, m.mode === 'underground' && e > 0.98, width, height, headU);
      if (m.mode === 'underground') {
        headAt.set(focus.x, focus.y + AXIS_UP, focus.z).project(camera);
        hud.head(((headAt.x + 1) / 2) * width, ((1 - headAt.y) / 2) * height);
      }
    },
  };
}
