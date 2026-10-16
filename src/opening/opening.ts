import * as THREE from 'three';
import { litterTopHeight } from '../surface/litterDepth';
import { terrainHeight } from '../surface/terrain';
import { pathDistance, sample, sample1, walkFoot, type FootPose, type Key } from './keys';
import { buildOpeningActors, type OpeningActors, type Part } from './actors';
import {
  BOX, BUS, CAMERA, EASE_END, EASE_START, HANDS_SHOWN, KIDS, LEAF, LEFT_HAND, LID, OPENING_END, RIGHT_HAND,
  CUP, SOIL, SOIL_SIZE, TEACHER_PATH, TEACHER_SHOWN, TEACHER_YAW, TUB, TUB_ON_BOX, WORM, kidPath, wormPush,
} from './script';

const M = 23.33;
const smoother = (u: number): number => {
  const x = Math.min(1, Math.max(0, u));
  return x * x * x * (x * (x * 6 - 15) + 10);
};
const ramp = (t: number, a: number, b: number): number => smoother((t - a) / (b - a));

/** A walker's build: how far apart its feet are, its stride, step lift and hip height. */
interface Gait { side: number; stride: number; lift: number; hip: number; legLength: number; ankle: number }
const TEACHER_GAIT: Gait = { side: 2.1, stride: 28, lift: 2.4, hip: 0.92 * M + 2.2, legLength: 0.92 * M, ankle: 2.2 };
const KID_GAIT: Gait = { side: 1.6, stride: 44, lift: 5, hip: 0.72 * M + 1.7, legLength: 0.72 * M, ankle: 1.7 };

/**
 * The opening scene (Matt's storyboard, 2026-10-16), played over the live forest from the fixed
 * camera in src/opening/script.ts. main.ts steps it with the simulation (`step`, which also says how
 * hard the worm is pushed forward: the real crawl moves it, so play starts exactly where the scene
 * leaves it) and poses it per frame (`pose`). It ends at OPENING_END, or at once on `stop` (Skip).
 * The big leaf stays where it lies until the worm has crawled away from it. Allocates nothing per
 * frame.
 */
export class Opening {
  readonly actors: OpeningActors;
  /** Seconds into the scene, at this and the last step (the frame poses between them). */
  t = 0;
  private prevT = 0;
  playing = false;
  /** The big leaf still lies on the litter (after the scene, until the worm is away from it). */
  private leafLeft = false;
  private readonly scratch: number[] = [0, 0, 0, 0, 0, 0];
  private readonly scratch2: number[] = [0, 0, 0, 0, 0, 0];
  private readonly foot: FootPose = { ahead: 0, lift: 0 };
  private readonly kidPaths: readonly Key[][] = KIDS.map(kidPath);
  private readonly kidYaw = KIDS.map(() => 0);
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly q2 = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly p2 = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly look = new THREE.Matrix4();
  private readonly boxM = new THREE.Matrix4();
  private readonly tubM = new THREE.Matrix4();

  constructor(scene: THREE.Scene) {
    this.actors = buildOpeningActors();
    scene.add(this.actors.bus, this.actors.leaf, this.actors.moving);
  }

  /** From the top: every prop in its first place. */
  start(): void {
    this.t = this.prevT = 0;
    this.playing = true;
    this.leafLeft = true;
    this.actors.show(true);
  }

  /** Ends the scene now (Skip, or its end): the props go; the leaf stays only if the worm is under it. */
  stop(headX: number, headZ: number): void {
    this.playing = false;
    this.actors.bus.visible = false;
    this.actors.moving.visible = false;
    this.leafLeft = Math.hypot(headX - LEAF.x, headZ - LEAF.z) < LEAF.size;
    this.actors.leaf.visible = this.leafLeft;
  }

  /** The scene has played to its end. */
  get done(): boolean {
    return this.t >= OPENING_END;
  }

  /** The worm is out of the tub (before this it is hidden, and the litter over it is whole). */
  get wormShown(): boolean {
    return !this.playing || this.t >= WORM.showAt;
  }

  /** One simulation step: the clock moves on, and the worm's forward push for the step. */
  step(dt: number, headZ: number): number {
    this.prevT = this.t;
    this.t += dt;
    return wormPush(this.t, headZ);
  }

  /**
   * After the scene: the big leaf stays until the worm is well away from it (or underground), then
   * goes for good. One distance check per frame.
   */
  keepLeaf(headX: number, headZ: number, surface: boolean): void {
    if (!this.leafLeft || this.playing) return;
    if (!surface || Math.hypot(headX - LEAF.x, headZ - LEAF.z) > LEAF.size * 1.6) {
      this.leafLeft = false;
      this.actors.leaf.visible = false;
    }
  }

  /**
   * Poses every prop for this frame, `alpha` between the last two steps, and the camera: the fixed
   * shot, easing into `game` (the follow camera as play would draw it) at the end.
   */
  pose(alpha: number, camera: THREE.PerspectiveCamera, game: THREE.PerspectiveCamera): void {
    const T = this.prevT + (this.t - this.prevT) * alpha;
    const a = this.actors;
    this.poseBus(T);
    a.leaf.position.set(LEAF.x, litterTopHeight(LEAF.x, LEAF.z), LEAF.z);
    a.leaf.rotation.set(0, LEAF.yaw, 0);
    const shownTeacher = T >= TEACHER_SHOWN[0] && T < TEACHER_SHOWN[1];
    const yaw = sample1(TEACHER_YAW, T);
    this.walker(TEACHER_PATH, T, yaw, TEACHER_GAIT, a.teacher.legs, a.teacher.boots, shownTeacher);
    this.kidPaths.forEach((path, i) => {
      const k = KIDS[i];
      const shown = T >= k.at && T < k.at + 1.25;
      const now = sample(path, T, this.scratch, true);
      const ahead = sample(path, T + 0.05, this.scratch2, true);
      const dx = ahead[0] - now[0];
      const dz = ahead[2] - now[2];
      if (Math.hypot(dx, dz) > 1e-3) this.kidYaw[i] = Math.atan2(dx, dz);
      this.walker(path, T, this.kidYaw[i], KID_GAIT, a.kids[i].legs, a.kids[i].shoes, shown);
    });
    this.poseBox(T, yaw);
    this.poseTub(T);
    this.poseHands(T);
    const size = sample1(SOIL_SIZE, T);
    a.soil.visible = T >= SOIL_SIZE[0][0] && size > 0.01;
    this.p.set(SOIL.x, litterTopHeight(SOIL.x, SOIL.z) - 0.05, SOIL.z);
    a.soil.matrix.compose(this.p, this.q.setFromAxisAngle(this.up, SOIL.yaw), this.s.set(size, size, size));
    this.poseDoors(T);
    a.update();
    this.poseCamera(T, camera, game);
  }

  private poseBus(T: number): void {
    const u = 1 - (1 - Math.min(1, T / BUS.stopAt)) ** 3;
    const { from: a, via: b, to: c } = BUS;
    const v = 1 - u;
    const x = v * v * a.x + 2 * v * u * b.x + u * u * c.x;
    const z = v * v * a.z + 2 * v * u * b.z + u * u * c.z;
    const tx = 2 * v * (b.x - a.x) + 2 * u * (c.x - b.x);
    const tz = 2 * v * (b.z - a.z) + 2 * u * (c.z - b.z);
    const yaw = Math.atan2(tx, tz);
    const bus = this.actors.bus;
    // Its door side's wheels on the ground (the berm rises beyond the floor's edge).
    const nearX = x - Math.cos(yaw) * 1.25 * M;
    bus.position.set(x, terrainHeight(nearX, z - 2 * M) - 0.3, z);
    bus.rotation.set(0, yaw, 0);
  }

  /** Feet and legs of one walker along `path` at time T, facing `yaw`. */
  private walker(path: readonly Key[], T: number, yaw: number, g: Gait, legs: readonly [Part, Part], feet: readonly [Part, Part], shown: boolean): void {
    for (let i = 0; i < 2; i++) {
      legs[i].visible = shown;
      feet[i].visible = shown;
    }
    if (!shown) return;
    const mid = sample(path, T, this.scratch, true);
    const d = pathDistance(path, T);
    const speed = (pathDistance(path, T + 0.05) - d) / 0.05;
    const moving = Math.min(1, speed / 6);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    // Right is (-fz, 0, fx) (yaw 0 faces +z, its right is -x).
    const rx = -fz;
    const rz = fx;
    const hipY = litterTopHeight(mid[0], mid[2]) + mid[1] + g.hip;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -g.side : g.side;
      walkFoot(d, g.stride, i as 0 | 1, g.lift, moving, this.foot);
      const x = mid[0] + fx * this.foot.ahead + rx * side;
      const z = mid[2] + fz * this.foot.ahead + rz * side;
      const y = litterTopHeight(x, z) + mid[1] + this.foot.lift;
      this.e.set(0, yaw, 0);
      this.q.setFromEuler(this.e);
      feet[i].matrix.compose(this.p.set(x, y, z), this.q, this.s.set(1, 1, 1));
      // The leg from the ankle up to the hip (a little nearer the middle than the foot).
      this.p.set(x, y + g.ankle, z);
      this.p2.set(mid[0] + rx * side * 0.8, hipY, mid[2] + rz * side * 0.8).sub(this.p);
      const len = this.p2.length();
      this.q.setFromUnitVectors(this.up, this.p2.normalize());
      legs[i].matrix.compose(this.p, this.q, this.s.set(1, len / g.legLength, 1));
    }
  }

  /** The tackle box: in the teacher's left hand, set down, then picked up again. */
  private poseBox(T: number, yaw: number): void {
    const b = this.actors.box;
    b.visible = T >= TEACHER_SHOWN[0] && T < TEACHER_SHOWN[1];
    const restY = litterTopHeight(BOX.x, BOX.z);
    const mid = sample(TEACHER_PATH, T, this.scratch, true);
    // Carried: beside the teacher's left leg, its bottom about 40 cm up.
    const lx = Math.cos(yaw);
    const lz = -Math.sin(yaw);
    const cx = mid[0] + lx * 5;
    const cz = mid[2] + lz * 5;
    const cy = litterTopHeight(mid[0], mid[2]) + mid[1] + 9.3;
    const down = ramp(T, BOX.dropAt, BOX.dropped) * (1 - ramp(T, BOX.liftAt, BOX.lifted));
    this.e.set(0, yaw + (-Math.PI - yaw) * down, 0);
    this.q.setFromEuler(this.e);
    this.p.set(cx + (BOX.x - cx) * down, cy + (restY - cy) * down, cz + (BOX.z - cz) * down);
    this.boxM.compose(this.p, this.q, this.s.set(1, 1, 1));
    b.matrix.copy(this.boxM);
  }

  /** The bait tub and its lid: riding on the box, falling, lying spilled, lifted away. */
  private poseTub(T: number): void {
    const a = this.actors;
    const t0 = TUB[0][0];
    a.tub.visible = T >= TEACHER_SHOWN[0] && T < TUB[TUB.length - 1][0];
    a.lid.visible = a.tub.visible;
    if (T < t0) {
      this.m.makeTranslation(TUB_ON_BOX.x, TUB_ON_BOX.y, TUB_ON_BOX.z);
      this.tubM.multiplyMatrices(this.boxM, this.m);
    } else {
      const k = sample(TUB, T, this.scratch, true);
      this.e.set(k[3], 0, k[4], 'ZYX');
      this.q.setFromEuler(this.e);
      this.q2.setFromAxisAngle(this.up, k[5]);
      this.q.premultiply(this.q2);
      this.p.set(k[0], litterTopHeight(k[0], k[2]) + k[1], k[2]);
      this.tubM.compose(this.p, this.q, this.s.set(1, 1, 1));
    }
    a.tub.matrix.copy(this.tubM);
    if (T < LID[0][0]) {
      this.m.makeTranslation(0, CUP.top + CUP.lidHalf, 0);
      a.lid.matrix.multiplyMatrices(this.tubM, this.m);
    } else {
      const k = sample(LID, T, this.scratch, true);
      this.e.set(k[3], 0, 0);
      this.q.setFromEuler(this.e);
      this.p.set(k[0], litterTopHeight(k[0], k[2]) + k[1], k[2]);
      a.lid.matrix.compose(this.p, this.q, this.s.set(1, 1, 1));
    }
  }

  private poseHands(T: number): void {
    const shown = T >= HANDS_SHOWN[0] && T < HANDS_SHOWN[1];
    const keys = [RIGHT_HAND, LEFT_HAND];
    for (let i = 0; i < 2; i++) {
      const h = this.actors.hands[i];
      h.visible = shown;
      if (!shown) continue;
      const k = sample(keys[i], T, this.scratch);
      // Turned to face the tub, toward the camera's side.
      this.e.set(0, -Math.PI / 2, 0);
      this.q.setFromEuler(this.e);
      h.matrix.compose(this.p.set(k[0], litterTopHeight(k[0], k[2]) + k[1], k[2]), this.q, this.s.set(1, 1, 1));
    }
  }

  /** The door's two panels fold in as it opens, and out again as it closes. */
  private poseDoors(T: number): void {
    const open = ramp(T, BUS.doorOpen[0], BUS.doorOpen[1]) * (1 - ramp(T, BUS.doorClose[0], BUS.doorClose[1]));
    const [d1, d0] = this.actors.doors;
    const x = -1.25 * M - 0.6;
    const y = 0.6 * M;
    this.e.set(0, Math.PI - 1.3 * open, 0);
    this.q.setFromEuler(this.e);
    d1.matrix.compose(this.p.set(x, y, -0.3 * M), this.q, this.s.set(1, 1, 1));
    this.e.set(0, 1.3 * open, 0);
    this.q.setFromEuler(this.e);
    d0.matrix.compose(this.p.set(x, y, -1.15 * M), this.q, this.s.set(1, 1, 1));
    d1.visible = d0.visible = true;
  }

  /** The fixed shot; from EASE_START it eases into the game's own camera. */
  private poseCamera(T: number, camera: THREE.PerspectiveCamera, game: THREE.PerspectiveCamera): void {
    const c = CAMERA;
    this.p.set(c.x, litterTopHeight(c.x, c.z) + c.y, c.z);
    this.p2.set(c.lookX, c.lookY, c.lookZ);
    this.look.lookAt(this.p, this.p2, this.up);
    this.q.setFromRotationMatrix(this.look);
    const w = ramp(T, EASE_START, EASE_END);
    camera.position.copy(this.p).lerp(game.position, w);
    this.q2.copy(game.quaternion);
    camera.quaternion.copy(this.q).slerp(this.q2, w);
    camera.up.set(0, 1, 0);
    camera.updateMatrixWorld();
  }
}
