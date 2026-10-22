import type * as THREE from 'three';
import { hypot2, copy3 as copy, vec3s as blank, type Vec2, type Vec3 } from '../core/vec';
import { stepFollowCamInto, type FollowCamState } from '../surface/followCamera';
import { createBody, followHead } from '../worm/body';
import { clampToNeck, stepWormInto, type WormMotion } from '../worm/locomotion';
import { advanceWave, type WaveState } from '../worm/wormShape';
import { WORM_HALF_WIDTH, type WormPose } from '../worm/wormMesh';
import { FULL_SPACING, WORM_SEGMENTS, wormBody } from '../worm/bodyLength';
import { EasedGap } from '../worm/easedGap';
import { bellyHeight, wormSurface, type WormSurface } from '../worm/surfaceHeight';
import { floorHeight } from '../surface/litterDepth';
import { createDisturbance, recentre, stampBody, decay, clearDisturbance, type DisturbanceMap } from '../surface/disturbance';
import {
  clearHeroLeaves, createHeroLeaves, setHeroCount, settleHeroLeaves, snapshotHeroLeaves, stepHeroLeaves,
  HERO_MAX, type HeroLeaves,
} from '../surface/heroLeaves';
import { createPushers, fitPushers, packPushers } from './pushers';
import { LOCOMOTION } from './drive';
import { disturbReach, type DisturbReach } from '../surface/leafScale';
import { pushOut, slideMove } from '../surface/obstacles';
import { CameraClearance, cameraAim, type CameraAim } from './cameraClearance';

export { WORM_SEGMENTS };
/** The gap between body points at full length (bodyLength.ts holds the length now: `wormBody.spacing`). */
export const SPACING = FULL_SPACING;
/** The most the body reaches to its side at its fullest swell (about 0.134): how far the spine keeps off solid props. */
export const BODY_RADIUS = WORM_HALF_WIDTH;
const MAX_NECK_BEND = 1.3;
/** Slow resting "breath" of the contraction wave, in waves per second. */
const BREATH_HZ = 0.22;
/**
 * The disturbance map centres on this segment (1.5 m behind the head), so the head and the tail,
 * plus the leaves they reach, all lie inside the map's unfaded middle.
 */
const MAP_CENTRE = 7;

/** Looking up at a robin close by (V4 spec 6.2), at `lookUp` 1: the camera backs off and rises this far, and aims this much higher. */
const LOOK_UP_BACK = 1.6;
const LOOK_UP_RISE = 0.3;
const LOOK_UP_AIM = 0.7;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Scratch for interpolate: where the camera aims (cameraAim). */
const aim: CameraAim = { ahead: 0, above: 0, upX: 0, upY: 1, upZ: 0 };

/**
 * The worm and its follow camera, stepped at the fixed simulation rate (moved from the Step 0
 * page). Every body segment rests on wormSurface: the worm travels buried in the leaf litter, on
 * the floor under it (V2 spec 8.2). Keeps the previous step so rendering can interpolate by alpha.
 */
export class Crawl {
  motion: WormMotion = { head: { x: 0, y: 0, z: 0 }, heading: 0 };
  readonly body: Vec3[] = blank(WORM_SEGMENTS);
  cam: FollowCamState = { yaw: 0, yawVel: 0, pos: { x: 0, y: 0, z: 0 } };
  readonly wave: WaveState = { phase: 0, activity: 0 };
  /** The head as last rendered (interpolated): leaf shaders and the detail layer centre on it. */
  readonly focus: Vec3 = { x: 0, y: 0, z: 0 };
  /** Per segment, head first: how far under the litter. Always 1 (buried); kept as stampBody and the pushers take it. */
  readonly under = new Float32Array(WORM_SEGMENTS).fill(1);
  /** Leaves react to the worm (off on Low: they stay still, though the worm is still buried). */
  reaction = true;
  /** The leaves the worm has disturbed: stamped every step, decaying back. */
  readonly disturbance: DisturbanceMap = createDisturbance();
  /** The disturbance map changed since the renderer last uploaded it. */
  disturbed = true;
  /**
   * The reach on the disturbance map (leafScale.ts): how far it is stamped, how much farther a body
   * on top counts as, and the window the renderer fades it in.
   */
  readonly reach: DisturbReach = disturbReach();
  /** Loose physics leaves near the head. */
  readonly hero: HeroLeaves = createHeroLeaves(HERO_MAX);
  /** The body as the hero leaves feel it (pushers.ts). */
  private readonly push = createPushers(WORM_SEGMENTS, SPACING);
  /** The gap between body points, eased toward the worm's length (bodyLength.ts) when it changes. */
  private readonly gap = new EasedGap();
  /** PUSHER_STRIDE floats per pusher ([x, z, radius, strength, top, under, belly, fall]), for the hero leaves. */
  readonly pushers = this.push.out;
  private readonly surf: WormSurface = { y: 0 };
  private readonly prevBody: Vec3[] = blank(WORM_SEGMENTS);
  private readonly prevCam: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly prevHead: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly prevWave: WaveState = { phase: 0, activity: 0 };
  private prevYaw = 0;
  private prevReach = 1;
  private readonly move: Vec2 = { x: 0, y: 0 };
  /**
   * V4: how much the camera looks up at a robin close by (0 not at all, 1 most), set each step by
   * the hunt, which eases it: the camera backs off a little, rises and aims higher, all on top of
   * its own follow (interpolate). Scaled by the reach, so a camera a prop pulled in stays in.
   */
  lookUp = 0;
  private prevLookUp = 0;
  /** Keeps the camera out of trunks, rocks and the log (spec 4.4). */
  private readonly clearance = new CameraClearance();
  /** How much of its full distance the camera keeps (1 clear; less when a prop is in its way). */
  get cameraReach(): number {
    return this.clearance.reach;
  }
  /** The point the camera follows over the head, near the top of the litter (CameraClearance.follow). */
  get follow(): Readonly<Vec3> {
    return this.clearance.view;
  }

  constructor() {
    this.place(null, 0);
  }

  /**
   * The worm still, facing `heading`: at `at` (head first, on the floor, then held to the body's
   * spacing as steps hold it: three passes converge, so an idle first step moves nothing), else
   * straight at the spawn. Its camera settles behind it, and the previous step is the same
   * (nothing to interpolate, so nothing sweeps or turns across a jump).
   */
  private place(at: readonly Vec3[] | null, heading: number): void {
    const head = { x: at ? at[0].x : 0, y: 0, z: at ? at[0].z : 0 };
    this.motion = { head, heading };
    head.y = this.rest(head.x, head.z);
    this.gap.place(at);
    fitPushers(this.push, this.gap.to);
    const body = at ?? createBody(WORM_SEGMENTS, this.gap.value, head, heading);
    body.forEach((p, i) => (this.body[i] = { x: p.x, y: at ? this.rest(p.x, p.z) : head.y, z: p.z }));
    for (let k = 0; at && k < 3; k++) this.trail(head);
    for (let i = 0; i < WORM_SEGMENTS; i++) copy(this.prevBody[i], this.body[i]);
    this.cam = this.clearance.settle(head, heading);
    copy(this.prevCam, this.cam.pos);
    copy(this.prevHead, head);
    this.prevYaw = this.cam.yaw;
    this.prevReach = this.clearance.reach;
    copy(this.focus, head);
    this.wave.phase = this.wave.activity = 0;
    this.prevWave.phase = this.prevWave.activity = 0;
    this.move.x = this.move.y = 0;
    this.lookUp = this.prevLookUp = 0;
  }

  /**
   * Back to the start, exactly as a freshly built crawl given the same leaf reaction and hero
   * count: the worm and its camera at the spawn (see place), the disturbance map empty and back
   * on the spawn, and the hero leaves scattered around the spawn again, in the same deterministic
   * order as at the start. The speed test starts here, so its numbers never depend on where the
   * worm had been. `heroes`: how many hero leaves to scatter (the same count as now unless given).
   * With `at` (WORM_SEGMENTS points, head first) the same fresh start happens there, facing
   * `heading`: the worm coming up out of the cut, with no trail or leaf drawn across the jump. Frame
   * 0 is `at` exactly only where the points, rested on the floor, are at most the gap apart in 3D;
   * farther apart (flat spacing over a slope) the body is first pulled to the gap and off props, as
   * a step would. The body starts at the length now (wormBody), or as long as `at` if that is longer.
   */
  reset(heroes = this.hero.count, at: readonly Vec3[] | null = null, heading = 0): void {
    this.place(at, heading);
    clearDisturbance(this.disturbance);
    recentre(this.disturbance, at ? this.body[MAP_CENTRE].x : 0, at ? this.body[MAP_CENTRE].z : 0);
    this.disturbed = true;
    clearHeroLeaves(this.hero);
    this.pushers.fill(0);
    this.setHeroCount(heroes);
  }

  /** Switches leaf reaction (from the preset). Off clears the map, and stamping stops. */
  setReaction(on: boolean): void {
    if (on === this.reaction) return;
    this.reaction = on;
    if (!on) {
      clearDisturbance(this.disturbance);
      this.disturbed = true;
    }
  }

  /** Stamps the body into the disturbance map: the segments joining its body points. */
  private disturbLeaves(dt: number): void {
    const m = this.disturbance;
    const b = this.body;
    decay(m, dt);
    recentre(m, b[MAP_CENTRE].x, b[MAP_CENTRE].z);
    stampBody(m, b, this.under, this.reach.stamp, this.reach.onTop);
    this.disturbed = true;
  }

  /**
   * How many hero leaves are live (the preset). New ones are scattered around the head, over or
   * under the body at once if they land on it.
   */
  setHeroCount(n: number): void {
    const h = this.motion.head;
    const from = this.hero.count;
    packPushers(this.push, this.body, this.under, this.prevWave, this.wave);
    setHeroCount(this.hero, n, h.x, h.z, this.motion.heading, floorHeight, this.pushers, this.push.count);
    settleHeroLeaves(this.hero, from, this.pushers, this.push.count, floorHeight);
  }

  /** Steps the hero leaves against the body as it is now. */
  private pushLeaves(dt: number): void {
    packPushers(this.push, this.body, this.under, this.prevWave, this.wave);
    const h = this.motion.head;
    stepHeroLeaves(this.hero, dt, this.pushers, this.push.count, h.x, h.z, this.motion.heading, floorHeight);
  }

  /** Belly height at (x, z): on the floor under the litter. */
  private rest(x: number, z: number): number {
    return bellyHeight(wormSurface(x, z, this.surf));
  }

  /** The body follows `head`, each trailing segment kept out of solid props and on its own surface (head first up a pile). */
  private trail(head: Vec3): void {
    followHead(this.body, head, this.gap.value);
    for (let i = 1; i < this.body.length; i++) {
      pushOut(this.body[i], BODY_RADIUS);
      this.body[i].y = this.rest(this.body[i].x, this.body[i].z);
    }
  }

  /** One fixed step. `move`: x turns right, y crawls forward (backward input is ignored). */
  step(dt: number, move: Vec2): void {
    const { body, prevBody, wave } = this;
    for (let i = 0; i < body.length; i++) copy(prevBody[i], body[i]);
    copy(this.prevCam, this.cam.pos);
    this.prevYaw = this.cam.yaw;
    this.prevReach = this.clearance.reach;
    copy(this.prevHead, this.motion.head);
    this.prevWave.phase = wave.phase;
    this.prevWave.activity = wave.activity;
    this.prevLookUp = this.lookUp;
    snapshotHeroLeaves(this.hero);

    this.move.x = move.x;
    this.move.y = Math.max(0, move.y);
    this.motion.heading = clampToNeck(this.motion.heading, body[0], body[1], MAX_NECK_BEND);
    stepWormInto(this.motion, this.move, dt, LOCOMOTION);
    const head = this.motion.head;
    // Trunks, rocks and the log are solid: the head slides along their edge (spec 4.4), and stops
    // in a notch where two meet, or where one crosses the play area's edge (stepWorm's clamp,
    // which a slide must not undo). pushOut is the safety net (a hair inside by rounding).
    slideMove(this.prevHead, head, BODY_RADIUS, LOCOMOTION.halfSize);
    pushOut(head, BODY_RADIUS);
    // stepWorm stays flat and pure; the litter decides the height here.
    head.y = this.rest(head.x, head.z);
    advanceWave(
      wave, hypot2(head.x - this.prevHead.x, head.z - this.prevHead.z), dt,
      LOCOMOTION.speed, wormBody.wavesPerUnit, BREATH_HZ,
    );
    // The gap eases toward the worm's length; the leaves feel the length it is going to.
    this.gap.step(dt);
    fitPushers(this.push, this.gap.to);
    this.trail(head);
    const view = this.clearance.follow(head, dt);
    this.clearance.update(view, this.cam, dt);
    stepFollowCamInto(this.cam, view, this.motion.heading, dt, this.clearance.opts);
    const c = this.cam.pos;
    // Out of trunks, rocks and the log, and off the litter.
    this.clearance.keepOut(c);
    if (this.reaction) this.disturbLeaves(dt);
    this.pushLeaves(dt);
  }

  /** Writes the render pose, the camera and `focus`, between the last two steps by `alpha`. */
  interpolate(alpha: number, timeSec: number, pose: WormPose, camera: THREE.PerspectiveCamera): void {
    const sp = pose.spine;
    for (let i = 0; i < this.body.length; i++) {
      const a = this.prevBody[i];
      const b = this.body[i];
      sp[i * 3] = lerp(a.x, b.x, alpha);
      sp[i * 3 + 1] = lerp(a.y, b.y, alpha);
      sp[i * 3 + 2] = lerp(a.z, b.z, alpha);
    }
    pose.phase = lerp(this.prevWave.phase, this.wave.phase, alpha);
    pose.activity = lerp(this.prevWave.activity, this.wave.activity, alpha);
    pose.timeSec = timeSec;

    const h = this.motion.head;
    const f = this.focus;
    f.x = lerp(this.prevHead.x, h.x, alpha);
    f.y = lerp(this.prevHead.y, h.y, alpha);
    f.z = lerp(this.prevHead.z, h.z, alpha);
    const yaw = lerp(this.prevYaw, this.cam.yaw, alpha);
    const c = this.cam.pos;
    const reach = lerp(this.prevReach, this.clearance.reach, alpha);
    // Looking up at a robin: back along the yaw, up, and aimed higher (0 almost always).
    const up = lerp(this.prevLookUp, this.lookUp, alpha) * reach;
    const back = up * LOOK_UP_BACK;
    camera.position.set(
      lerp(this.prevCam.x, c.x, alpha) - Math.sin(yaw) * back,
      lerp(this.prevCam.y, c.y, alpha) + up * LOOK_UP_RISE,
      lerp(this.prevCam.z, c.z, alpha) - Math.cos(yaw) * back,
    );
    cameraAim(reach, yaw, aim);
    camera.up.set(aim.upX, aim.upY, aim.upZ);
    camera.lookAt(f.x + Math.sin(yaw) * aim.ahead, f.y + aim.above + up * LOOK_UP_AIM, f.z + Math.cos(yaw) * aim.ahead);
  }
}
