import type * as THREE from 'three';
import type { Vec2, Vec3 } from '../core/vec';
import {
  createFollowCam, stepFollowCam, type FollowCamOptions, type FollowCamState,
} from '../surface/followCamera';
import { createBody, followHead } from '../worm/body';
import { clampToNeck, stepWorm, type WormMotion } from '../worm/locomotion';
import { advanceWave, type WaveState } from '../worm/wormShape';
import {
  WAVES, bodyCoordAt, peristalsisAmplitude, swellRange, wormExtent, wormLength, type WormExtent, type WormPose,
} from '../worm/wormMesh';
import { probeReach, type HeadProbe } from '../worm/wormShape';
import { bellyHeight, litterTop, wormSurface, type WormSurface } from '../worm/surfaceHeight';
import {
  createDisturbance, recentre, stamp, decay, clearDisturbance, type DisturbanceMap,
} from '../surface/disturbance';
import {
  createHeroLeaves, setHeroCount, settleHeroLeaves, snapshotHeroLeaves, stepHeroLeaves,
  HERO_MAX, PUSHER_SPAN, PUSHER_STRIDE, type HeroLeaves,
} from '../surface/heroLeaves';
import { LOCOMOTION } from './drive';

export const WORM_SEGMENTS = 16;
const SPACING = 0.22;
/** The camera aims a little ahead of the head, so the worm sits low in frame and the forest looms. */
const LOOK_AHEAD = 1.0;
const LOOK_UP = 0.6;
const MAX_NECK_BEND = 1.3;
/** Slow resting "breath" of the contraction wave, in waves per second. */
const BREATH_HZ = 0.22;
/** The camera never dips closer than this to the litter top beneath it. */
export const CAM_GROUND_MARGIN = 0.5;
const CAM_OPTS: FollowCamOptions = {
  distance: 2.6, height: 1.1, yawSmoothTime: 0.5, posRate: 10, maxYawSpeed: 1.8,
};
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

function copy(dst: Vec3, src: Vec3): void {
  dst.x = src.x;
  dst.y = src.y;
  dst.z = src.z;
}

/**
 * The worm and its follow camera, stepped at the fixed simulation rate (moved from the Step 0
 * page). Every body segment rests on wormSurface, so the worm slips under thin litter and
 * climbs onto piles head first. Keeps the previous step so rendering can interpolate by alpha.
 */
export class Crawl {
  motion: WormMotion;
  readonly body: Vec3[];
  cam: FollowCamState;
  readonly wave: WaveState = { phase: 0, activity: 0 };
  /** The head as last rendered (interpolated): leaf shaders and the detail layer centre on it. */
  readonly focus: Vec3 = { x: 0, y: 0, z: 0 };
  /** Per segment, head first: 1 under the litter, 0 on top (for the leaves it disturbs). */
  readonly under = new Float32Array(WORM_SEGMENTS);
  /** Leaves react to the worm (off on Low: it always rides on top). */
  reaction = true;
  /** The leaves the worm has disturbed: stamped every step, decaying back. */
  readonly disturbance: DisturbanceMap = createDisturbance();
  /** The disturbance map changed since the renderer last uploaded it. */
  disturbed = true;
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
  private readonly surf: WormSurface = { y: 0, under: 0 };
  private readonly prevBody: Vec3[];
  private readonly prevCam: Vec3;
  private readonly prevHead: Vec3;
  private readonly prevWave: WaveState = { phase: 0, activity: 0 };
  private prevYaw: number;
  private readonly move: Vec2 = { x: 0, y: 0 };

  constructor() {
    this.motion = { head: { x: 0, y: 0, z: 0 }, heading: 0 };
    this.motion.head.y = this.rest(0, 0, 0);
    this.body = createBody(WORM_SEGMENTS, SPACING, this.motion.head, this.motion.heading);
    this.cam = createFollowCam(this.motion.head, this.motion.heading, CAM_OPTS);
    this.prevBody = this.body.map((s) => ({ ...s }));
    this.prevCam = { ...this.cam.pos };
    this.prevHead = { ...this.motion.head };
    this.prevYaw = this.cam.yaw;
    copy(this.focus, this.motion.head);
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

  /** Switches leaf reaction (from the preset). Off clears the map, and stamping stops. */
  setReaction(on: boolean): void {
    if (on === this.reaction) return;
    this.reaction = on;
    if (!on) {
      clearDisturbance(this.disturbance);
      this.disturbed = true;
    }
  }

  /** Stamps the body into the disturbance map: every segment and the midpoints between them. */
  private disturbLeaves(dt: number): void {
    const m = this.disturbance;
    const b = this.body;
    decay(m, dt);
    recentre(m, b[MAP_CENTRE].x, b[MAP_CENTRE].z);
    const last = b.length - 1;
    for (let k = 0; k <= 2 * last; k++) {
      const i = k >> 1;
      const j = Math.min(last, i + (k & 1));
      stamp(m, (b[i].x + b[j].x) / 2, (b[i].z + b[j].z) / 2, (this.under[i] + this.under[j]) / 2);
    }
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
    setHeroCount(this.hero, n, h.x, h.z, this.motion.heading, litterTop, this.pushers, PUSHERS);
    settleHeroLeaves(this.hero, from, this.pushers, PUSHERS, litterTop);
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
    stepHeroLeaves(this.hero, dt, this.pushers, PUSHERS, h.x, h.z, this.motion.heading, litterTop);
  }

  /** Belly height at (x, z) for segment `i`; records whether that segment is under the litter. */
  private rest(i: number, x: number, z: number): number {
    const s = wormSurface(x, z, this.reaction, this.surf);
    this.under[i] = s.under;
    return bellyHeight(s);
  }

  /** One fixed step. `move`: x turns right, y crawls forward (backward input is ignored). */
  step(dt: number, move: Vec2): void {
    const { body, prevBody, wave } = this;
    for (let i = 0; i < body.length; i++) copy(prevBody[i], body[i]);
    copy(this.prevCam, this.cam.pos);
    this.prevYaw = this.cam.yaw;
    copy(this.prevHead, this.motion.head);
    this.prevWave.phase = wave.phase;
    this.prevWave.activity = wave.activity;
    snapshotHeroLeaves(this.hero);

    this.move.x = move.x;
    this.move.y = Math.max(0, move.y);
    this.motion.heading = clampToNeck(this.motion.heading, body[0], body[1], MAX_NECK_BEND);
    this.motion = stepWorm(this.motion, this.move, dt, LOCOMOTION);
    const head = this.motion.head;
    // stepWorm stays flat and pure; the litter decides the height here.
    head.y = this.rest(0, head.x, head.z);
    advanceWave(
      wave, Math.hypot(head.x - this.prevHead.x, head.z - this.prevHead.z), dt,
      LOCOMOTION.speed, WAVES_PER_UNIT, BREATH_HZ,
    );
    followHead(body, head, SPACING);
    // Settle each trailing segment onto its own surface, so the body climbs a pile head first.
    // On these gentle slopes (< ~20 degrees) this changes the 3D spacing by a few percent.
    for (let i = 1; i < body.length; i++) {
      const s = body[i];
      s.y = this.rest(i, s.x, s.z);
    }
    this.cam = stepFollowCam(this.cam, head, this.motion.heading, dt, CAM_OPTS);
    const floor = litterTop(this.cam.pos.x, this.cam.pos.z) + CAM_GROUND_MARGIN;
    if (this.cam.pos.y < floor) this.cam.pos.y = floor;
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
    camera.lookAt(f.x + Math.sin(yaw) * LOOK_AHEAD, f.y + LOOK_UP, f.z + Math.cos(yaw) * LOOK_AHEAD);
  }
}
