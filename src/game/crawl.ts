import type * as THREE from 'three';
import { copy3 as copy, vec3s as blank, type Vec2, type Vec3 } from '../core/vec';
import { stepFollowCam, type FollowCamState } from '../surface/followCamera';
import { createBody, followHead } from '../worm/body';
import { clampToNeck, stepWorm, type WormMotion } from '../worm/locomotion';
import { advanceWave, type WaveState } from '../worm/wormShape';
import {
  WAVES, WORM_HALF_WIDTH, bodyCoordAt, peristalsisAmplitude, swellRange, wormExtent, wormLength,
  type WormExtent, type WormPose,
} from '../worm/wormMesh';
import { probeReach, type HeadProbe } from '../worm/wormShape';
import { bellyHeight, wormSurface, type WormSurface } from '../worm/surfaceHeight';
import { floorHeight } from '../surface/litterDepth';
import {
  createDisturbance, recentre, stampBody, decay, clearDisturbance, type DisturbanceMap,
} from '../surface/disturbance';
import {
  clearHeroLeaves, createHeroLeaves, setHeroCount, settleHeroLeaves, snapshotHeroLeaves, stepHeroLeaves,
  HERO_MAX, PUSHER_SPAN, PUSHER_STRIDE, type HeroLeaves,
} from '../surface/heroLeaves';
import { LOCOMOTION } from './drive';
import { disturbReach, type DisturbReach } from '../surface/leafScale';
import { pushOut, slideMove } from '../surface/obstacles';
import { CameraClearance, cameraAim, type CameraAim } from './cameraClearance';

export const WORM_SEGMENTS = 16;
export const SPACING = 0.22;
/** The most the body reaches to its side at its fullest swell (about 0.134): how far the spine keeps off solid props. */
export const BODY_RADIUS = WORM_HALF_WIDTH;
const MAX_NECK_BEND = 1.3;
/** Slow resting "breath" of the contraction wave, in waves per second. */
const BREATH_HZ = 0.22;
const WAVES_PER_UNIT = WAVES / wormLength(WORM_SEGMENTS, SPACING);
/**
 * The disturbance map centres on this segment (1.5 m behind the head), so the head and the tail,
 * plus the leaves they reach, all lie inside the map's unfaded middle.
 */
const MAP_CENTRE = 7;
/** Hero-leaf pushers: every segment and the midpoints between them, head first. */
const PUSHERS = 2 * WORM_SEGMENTS - 1;
/** The head pusher shoves hardest (>= 0.9 is the head to the leaf physics); the body gently. */
const HEAD_PUSH = 1;
const BODY_PUSH = 0.5;
/** A pusher stands for the rings within PUSHER_SPAN of it along the spine (in body coordinate). */
const PUSHER_REACH = PUSHER_SPAN / wormLength(WORM_SEGMENTS, SPACING);

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
  /** PUSHER_STRIDE floats per pusher ([x, z, radius, strength, top, under, belly, fall]), for the hero leaves. */
  readonly pushers = new Float32Array(PUSHERS * PUSHER_STRIDE);
  /** Per pusher, the body it stands for at rest thickness (wormExtent): top, half-width, fall, probe share. */
  private readonly pushTop = new Float32Array(PUSHERS);
  private readonly pushHalf = new Float32Array(PUSHERS);
  private readonly pushFall = new Float32Array(PUSHERS);
  private readonly pushProbe = new Float32Array(PUSHERS);
  /** Per pusher, its rest body coordinate. */
  private readonly pushM = new Float32Array(PUSHERS);
  private readonly swell = { min: 1, max: 1 };
  private readonly probe: HeadProbe = { lift: 0, sway: 0 };
  private readonly surf: WormSurface = { y: 0 };
  private readonly prevBody: Vec3[] = blank(WORM_SEGMENTS);
  private readonly prevCam: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly prevHead: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly prevWave: WaveState = { phase: 0, activity: 0 };
  private prevYaw = 0;
  private prevReach = 1;
  private readonly move: Vec2 = { x: 0, y: 0 };
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
    const ext: WormExtent = { top: 0, half: 0, fall: 0, probe: 0 };
    for (let k = 0; k < PUSHERS; k++) {
      this.pushM[k] = bodyCoordAt((k * SPACING) / 2, WORM_SEGMENTS, SPACING);
      wormExtent(this.pushM[k], PUSHER_REACH, ext);
      this.pushTop[k] = ext.top;
      this.pushHalf[k] = ext.half;
      this.pushFall[k] = ext.fall;
      this.pushProbe[k] = ext.probe;
    }
  }

  /**
   * The worm still, facing `heading`: at `at` (head first, x and z as given, each resting on the
   * floor), else straight at the spawn. Its camera settles behind it, and the previous step is
   * the same (nothing to interpolate, so nothing sweeps across a jump).
   */
  private place(at: readonly Vec3[] | null, heading: number): void {
    const head = { x: at ? at[0].x : 0, y: 0, z: at ? at[0].z : 0 };
    this.motion = { head, heading };
    head.y = this.rest(head.x, head.z);
    const body = at ?? createBody(WORM_SEGMENTS, SPACING, head, heading);
    for (let i = 0; i < WORM_SEGMENTS; i++) {
      this.body[i] = { x: body[i].x, y: at ? this.rest(body[i].x, body[i].z) : head.y, z: body[i].z };
      copy(this.prevBody[i], this.body[i]);
    }
    this.cam = this.clearance.settle(head, heading);
    copy(this.prevCam, this.cam.pos);
    copy(this.prevHead, head);
    this.prevYaw = this.cam.yaw;
    this.prevReach = 1;
    copy(this.focus, head);
    this.wave.phase = this.wave.activity = 0;
    this.prevWave.phase = this.prevWave.activity = 0;
    this.swell.min = this.swell.max = 1;
    this.probe.lift = this.probe.sway = 0;
    this.move.x = this.move.y = 0;
  }

  /**
   * Back to the start, exactly as a freshly built crawl given the same leaf reaction and hero
   * count: the worm and its camera at the spawn (see place), the disturbance map empty and back
   * on the spawn, and the hero leaves scattered around the spawn again, in the same deterministic
   * order as at the start. The speed test starts here, so its numbers never depend on where the
   * worm had been. `heroes`: how many hero leaves to scatter (the same count as now unless given).
   * With `at` (WORM_SEGMENTS points, head first) the same fresh start happens there, facing
   * `heading`: the worm coming up out of the cut, with no trail or leaf drawn across the jump.
   */
  reset(heroes = this.hero.count, at: readonly Vec3[] | null = null, heading = 0): void {
    this.place(at, heading);
    clearDisturbance(this.disturbance);
    recentre(this.disturbance, at ? at[MAP_CENTRE].x : 0, at ? at[MAP_CENTRE].z : 0);
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
    this.packPushers();
    setHeroCount(this.hero, n, h.x, h.z, this.motion.heading, floorHeight, this.pushers, PUSHERS);
    settleHeroLeaves(this.hero, from, this.pushers, PUSHERS, floorHeight);
  }

  /**
   * Packs the body for the hero leaves (every segment and the midpoints between them): where it
   * is, how wide, how hard it shoves (the head hardest), the height of its top, how far under
   * the litter it is, the height of its belly and how far its top falls to its side. The worm is
   * drawn between the last two steps, so its thickness (swellRange) and the head's probing
   * (probeReach) are bounded over the phase and activity of both.
   */
  private packPushers(): void {
    const b = this.body;
    const out = this.pushers;
    const last = b.length - 1;
    const a0 = this.prevWave.activity;
    const a1 = this.wave.activity;
    const amp0 = peristalsisAmplitude(a0);
    const amp1 = peristalsisAmplitude(a1);
    const swell = this.swell;
    const probe = this.probe;
    probeReach(1 - Math.min(a0, a1), probe);
    for (let k = 0; k < PUSHERS; k++) {
      const i = k >> 1;
      const j = Math.min(last, i + (k & 1));
      const o = k * PUSHER_STRIDE;
      swellRange(this.pushM[k], PUSHER_REACH, this.prevWave.phase, this.wave.phase, amp0, amp1, swell);
      const share = this.pushProbe[k];
      out[o] = (b[i].x + b[j].x) / 2;
      out[o + 1] = (b[i].z + b[j].z) / 2;
      out[o + 2] = this.pushHalf[k] * swell.max + probe.sway * share;
      out[o + 3] = k === 0 ? HEAD_PUSH : BODY_PUSH;
      // The segments rest at their belly height (bellyHeight of their surface).
      const belly = (b[i].y + b[j].y) / 2;
      out[o + 4] = belly + this.pushTop[k] * swell.max + probe.lift * share;
      out[o + 5] = (this.under[i] + this.under[j]) / 2;
      out[o + 6] = belly;
      out[o + 7] = this.pushFall[k] * swell.min;
    }
  }

  /** Steps the hero leaves against the body as it is now. */
  private pushLeaves(dt: number): void {
    this.packPushers();
    const h = this.motion.head;
    stepHeroLeaves(this.hero, dt, this.pushers, PUSHERS, h.x, h.z, this.motion.heading, floorHeight);
  }

  /** Belly height at (x, z): on the floor under the litter. */
  private rest(x: number, z: number): number {
    return bellyHeight(wormSurface(x, z, this.surf));
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
    snapshotHeroLeaves(this.hero);

    this.move.x = move.x;
    this.move.y = Math.max(0, move.y);
    this.motion.heading = clampToNeck(this.motion.heading, body[0], body[1], MAX_NECK_BEND);
    this.motion = stepWorm(this.motion, this.move, dt, LOCOMOTION);
    const head = this.motion.head;
    // Trunks, rocks and the log are solid: the head slides along their edge (spec 4.4), and stops
    // in a notch where two meet, or where one crosses the play area's edge (stepWorm's clamp,
    // which a slide must not undo). pushOut is the safety net (a hair inside by rounding).
    slideMove(this.prevHead, head, BODY_RADIUS, LOCOMOTION.halfSize);
    pushOut(head, BODY_RADIUS);
    // stepWorm stays flat and pure; the litter decides the height here.
    head.y = this.rest(head.x, head.z);
    advanceWave(
      wave, Math.hypot(head.x - this.prevHead.x, head.z - this.prevHead.z), dt,
      LOCOMOTION.speed, WAVES_PER_UNIT, BREATH_HZ,
    );
    followHead(body, head, SPACING);
    // Settle each trailing segment onto its own surface, so the body climbs a pile head first.
    // On these gentle slopes (< ~20 degrees) this changes the 3D spacing by a few percent.
    for (let i = 1; i < body.length; i++) {
      const s = body[i];
      // The body never cuts through a solid prop either.
      pushOut(s, BODY_RADIUS);
      s.y = this.rest(s.x, s.z);
    }
    const view = this.clearance.follow(head, dt);
    this.clearance.update(view, this.cam, dt);
    this.cam = stepFollowCam(this.cam, view, this.motion.heading, dt, this.clearance.opts);
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
    camera.position.set(lerp(this.prevCam.x, c.x, alpha), lerp(this.prevCam.y, c.y, alpha), lerp(this.prevCam.z, c.z, alpha));
    cameraAim(lerp(this.prevReach, this.clearance.reach, alpha), yaw, aim);
    camera.up.set(aim.upX, aim.upY, aim.upZ);
    camera.lookAt(f.x + Math.sin(yaw) * aim.ahead, f.y + aim.above, f.z + Math.cos(yaw) * aim.ahead);
  }
}
