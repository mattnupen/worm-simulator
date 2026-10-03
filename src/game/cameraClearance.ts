import type { Vec3 } from '../core/vec';
import {
  smoothDampInto, type FollowCamOptions, type FollowCamState, type Spring,
} from '../surface/followCamera';
import { pushOutTall, sightReach } from '../surface/obstacles';

/** The follow camera's settings at full reach: distance behind and height above the head. */
export const CAM_OPTS: Readonly<FollowCamOptions> = {
  distance: 2.6, height: 1.1, yawSmoothTime: 0.5, posRate: 10, maxYawSpeed: 1.8,
};
/** The camera stops this far (m) short of a trunk, rock or log in its way (spec 4.4)... */
const CAM_PROP_MARGIN = 0.35;
/** Half the angle (rad) of the fan of sight lines the camera checks behind the head. */
const CAM_FAN = 0.5;
/**
 * A side line only looks ahead: a prop on it pulls the camera in at most to this share of what
 * the middle line (its real line to the head) allows, unless the camera is swinging toward it
 * (CAM_LOOK). Only the middle line, or a side line the camera is about to reach, pulls it all the
 * way in. 0.4 keeps a brush-past gentle while still pulling the camera most of the way in early
 * when the worm slides round a big trunk: the trunk can cut the middle line near its middle within
 * a fifth of a second, with no earlier warning than a side line meeting it. (Measured with a
 * line-of-sight clamp, 0.4 was the highest floor that clamp never fired at; the clamp now pushes
 * the camera clear instead, so a higher floor costs a brief look through a trunk's edge, not a snap.)
 */
export const CAM_SIDE_FLOOR = 0.4;
/** A side line counts in full when the camera's yaw would reach it within this time (s). */
const CAM_LOOK = 0.5;
/** The camera itself never comes nearer than this (m) to a prop taller than it (keepOut). */
const CAM_HARD_MARGIN = 0.15;
/**
 * ...on a critically damped spring, so it starts and stops gently: settling times (s) pulling in,
 * faster than easing back out. On top of the camera's own position smoothing.
 */
const CAM_IN_TIME = 0.25;
const CAM_OUT_TIME = 1;

/**
 * Keeps the follow camera out of tall props (spec 4.4): if the line from the head to where the
 * camera wants to be (behind it, along its yaw) runs into a trunk, rock or log taller than the
 * line there, the camera's distance and height shrink so it stops just short, easing in and back
 * out. Allocates nothing.
 */
export class CameraClearance {
  /** How much of its full distance the camera keeps (1 clear; less when a prop is in its way), and how fast that changes. */
  private readonly spring: Spring = { value: 1, velocity: 0 };
  /** CAM_OPTS with the distance and height cut to the reach: what the follow camera steps with. */
  readonly opts: FollowCamOptions = { ...CAM_OPTS };

  get reach(): number {
    return this.spring.value;
  }

  /** Back to full reach, at rest. */
  reset(): void {
    this.spring.value = 1;
    this.spring.velocity = 0;
    this.opts.distance = CAM_OPTS.distance;
    this.opts.height = CAM_OPTS.height;
  }

  /** Eases the reach toward what the sight lines behind the head allow, and sets `opts` from it. */
  update(head: Vec3, cam: FollowCamState, dt: number): void {
    // Three sight lines fanning out behind the head. The middle one is the camera's own line: a
    // prop on it pulls the camera in short of it. A prop on a side line is one the camera may meet
    // soon: it starts the pull-in early, in full only when the camera is swinging toward it.
    const mid = sightAt(head, cam.yaw);
    let reach = mid;
    for (let k = -1; k <= 1; k += 2) {
      const toward = Math.max(0, Math.min(1, (k * cam.yawVel * CAM_LOOK) / CAM_FAN));
      reach = Math.min(reach, Math.max(sightAt(head, cam.yaw + k * CAM_FAN), mid * CAM_SIDE_FLOOR * (1 - toward)));
    }
    const r = this.spring;
    smoothDampInto(r, reach, reach < r.value ? CAM_IN_TIME : CAM_OUT_TIME, dt);
    if (r.value < 0 || r.value > 1) {
      r.value = Math.max(0, Math.min(1, r.value));
      r.velocity = 0;
    }
    this.opts.distance = CAM_OPTS.distance * r.value;
    this.opts.height = CAM_OPTS.height * r.value;
  }

  /**
   * The eased camera can trail a hard turn, or a prop that swings in beside the head: never let the
   * camera at `pos` itself into a prop. It is pushed sideways, straight out of any trunk (or rock or
   * log taller than it) it has come within CAM_HARD_MARGIN of, so it slides along the prop's edge.
   * Its line to the head may cross a prop's edge for a few frames while the reach eases in; it is
   * never moved along that line, which jumped (and shook, step to step) when the line's first
   * blocked point jumped.
   */
  keepOut(pos: Vec3): void {
    pushOutTall(pos, CAM_HARD_MARGIN);
  }
}

/** sightReach of the line from the head to the camera's full-distance spot along `yaw`. */
function sightAt(h: Vec3, yaw: number): number {
  return sightReach(
    h.x, h.y, h.z,
    h.x - Math.sin(yaw) * CAM_OPTS.distance, h.y + CAM_OPTS.height, h.z - Math.cos(yaw) * CAM_OPTS.distance,
    CAM_PROP_MARGIN,
  );
}
