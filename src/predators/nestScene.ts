import * as THREE from 'three';
import { sharedLighting } from '../render/paintedMaterial';
import { litterTopHeight } from '../surface/litterDepth';
import { UNITS_PER_CM } from '../surface/realScale';
import { terrainHeight } from '../surface/terrain';
import { treeSites } from '../surface/treeSites';
import { sceneFov } from '../opening/opening';
import { Robin } from './robin';
import { Nest } from './nest';
import { TRUNK_GAP } from './nestShape';
import { NEST_FOV, cameraAt, planCamera } from './nestCamera';
import { NEST_TIMES, darkAt, makeSetup, nestlingAt, robinAt, type NestSetup } from './nestScript';

/** How high the nest's cup sits (cm above the ground): robin nests are usually low in a tree. */
export const NEST_HEIGHT_CM = 180;

/**
 * Where the nest is: on the near sugar maple, out on a branch toward the middle of the forest
 * floor (so the shots look in over the forest, not out past its edge). World units; `yaw` is the
 * branch's outward way (0 = +z).
 */
export function nestSite(): { x: number; y: number; z: number; yaw: number } {
  const maple = treeSites().find((t) => !t.birch) ?? { x: 12, z: -10, birch: false };
  const yaw = Math.atan2(-maple.x, -maple.z);
  const out = TRUNK_GAP * UNITS_PER_CM;
  return {
    x: maple.x + Math.sin(yaw) * out,
    y: terrainHeight(maple.x, maple.z) + NEST_HEIGHT_CM * UNITS_PER_CM,
    z: maple.z + Math.cos(yaw) * out,
    yaw,
  };
}

/**
 * The nest scene's player (V4): main.ts starts it where the robin caught the whole worm, steps it
 * with the simulation (`step`) and poses it per drawn frame (`pose`), which also sets the camera.
 * It is `done` at NEST_TIMES.end; `stop` ends it at once (Skip, or its end). Its robin and the nest
 * mesh are the scene's only draws (+2), shown only while it plays. Allocates nothing per frame.
 */
export class NestScene {
  readonly robin: Robin;
  readonly nest = new Nest();
  /** Seconds into the scene, at this and the last step (the frame poses between them). */
  t = 0;
  private prevT = 0;
  /** The time the worm's rope was last moved to. */
  private wormT = 0;
  playing = false;
  /** Reduced motion: still shots, cut between (nestCamera.ts). */
  private reduced = false;
  private readonly site = nestSite();
  private readonly setup: NestSetup;
  private readonly fog = { near: 0, far: 0 };
  private readonly pos = [0, 0, 0];
  private readonly look = [0, 0, 0];
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly scene: THREE.Scene;
  /**
   * Up in the tree the camera sees past the far edge of the forest floor, where nothing is drawn:
   * there the screen is cleared to the haze's colour (as drawn) instead of the usual background.
   * No draw and no shader. The scene's own background comes back with stop.
   */
  private readonly haze = new THREE.Color(0xcaa878);
  private background: THREE.Scene['background'] = null;

  /** `robin`: the hunt's own robin, if it has one (one robin in the scene); else its own. */
  constructor(scene: THREE.Scene, robin?: Robin) {
    this.scene = scene;
    this.robin = robin ?? new Robin();
    if (!robin) scene.add(this.robin.mesh);
    scene.add(this.nest.mesh);
    const s = this.site;
    this.nest.place(s.x, s.y, s.z, s.yaw);
    this.setup = makeSetup(0, 0, 0, 0, s);
    // The litter's top under a point of the worm's rope (nest frame, cm).
    this.nest.worm.floor = (x, z) => {
      this.w.set(x, 0, z);
      this.nest.toWorld(this.w);
      return (litterTopHeight(this.w.x, this.w.z) - s.y) / UNITS_PER_CM;
    };
  }

  /**
   * From the top: the robin stands at (x, z) on the forest floor facing `heading`, the worm in its
   * bill. `reduced`: still shots instead of camera moves.
   */
  start(x: number, z: number, heading: number, reduced: boolean): void {
    this.t = this.prevT = this.wormT = 0;
    this.playing = true;
    this.reduced = reduced;
    makeSetup(x, litterTopHeight(x, z), z, heading, this.site, this.setup);
    planCamera(this.setup, this.robin.pose);
    this.nest.mesh.visible = true;
    this.nest.worm.shown = true;
    robinAt(0, this.setup, this.robin.pose);
    this.robin.update();
    this.pins();
    this.nest.worm.hang(this.a, this.b, this.c);
    // Up in the tree the camera sees far: the haze thins (it comes back with stop).
    this.fog.near = sharedLighting.uFogNear.value;
    this.fog.far = sharedLighting.uFogFar.value;
    sharedLighting.uFogNear.value = this.fog.near * 2;
    sharedLighting.uFogFar.value = this.fog.far * 1.6;
    this.background = this.scene.background;
    this.scene.background = this.haze;
  }

  /** Ends it now: the robin and the nest go, the haze is back. */
  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.robin.pose.visible = false;
    this.robin.update();
    this.nest.mesh.visible = false;
    sharedLighting.uFogNear.value = this.fog.near;
    sharedLighting.uFogFar.value = this.fog.far;
    this.scene.background = this.background;
  }

  /** The scene has played to its end (the fact card comes next). */
  get done(): boolean {
    return this.t >= NEST_TIMES.end;
  }

  /** How dark the screen is now (0..1): the overlay's darkness (ui/nestScene.ts). */
  get dark(): number {
    return darkAt(this.t);
  }

  /** Skip: straight to the end (the dark and the fact card). */
  skip(): void {
    this.t = this.prevT = NEST_TIMES.end;
  }

  /** One simulation step. */
  step(dt: number): void {
    this.prevT = this.t;
    this.t = Math.min(NEST_TIMES.end, this.t + dt);
  }

  /** Poses the robin, the nestlings, the worm and the camera for this frame, `alpha` between steps. */
  pose(alpha: number, camera: THREE.PerspectiveCamera): void {
    const T = this.prevT + (this.t - this.prevT) * alpha;
    robinAt(T, this.setup, this.robin.pose);
    this.robin.update();
    for (let i = 0; i < this.nest.chicks.length; i++) nestlingAt(T, i, this.nest.chicks[i]);
    this.pins();
    // The rope moves on by the frame's time (never back: a held frame stands still).
    const dt = Math.min(0.1, Math.max(0, T - this.wormT));
    this.wormT = Math.max(this.wormT, T);
    this.nest.worm.step(dt, this.a, this.b, this.c);
    this.nest.worm.shown = T < NEST_TIMES.fed;
    this.nest.update();
    cameraAt(T, this.setup, this.robin.pose, this.reduced, this.pos, this.look);
    camera.position.set(this.pos[0], this.pos[1], this.pos[2]);
    camera.up.copy(this.up);
    camera.lookAt(this.look[0], this.look[1], this.look[2]);
    const fov = sceneFov(camera.aspect, NEST_FOV);
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  }

  /** The bill's edges and middle (where the worm is held), in the nest frame. */
  private pins(): void {
    this.nest.toNest(this.robin.billHold(this.a, 0.7));
    this.nest.toNest(this.robin.billHold(this.b, 0));
    this.nest.toNest(this.robin.billHold(this.c, -0.7));
  }
}
