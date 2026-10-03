import type { Vec3 } from '../core/vec';
import {
  smoothDampInto, type FollowCamOptions, type FollowCamState, type Spring,
} from '../surface/followCamera';
import { pushOutTall, sightReach } from '../surface/obstacles';
import { litterTop } from '../worm/surfaceHeight';

/** The follow camera's settings at full reach: distance behind and height above the head. */
export const CAM_OPTS: Readonly<FollowCamOptions> = {
  distance: 2.6, height: 1.1, yawSmoothTime: 0.5, posRate: 10, maxYawSpeed: 1.8,
};
/** The camera aims a little ahead of the head, so the worm sits low in frame and the forest looms. */
const LOOK_AHEAD = 1.0;
const LOOK_UP = 0.6;
/**
 * As a prop pulls the camera in, it cranes up: its height grows by this share of its full height
 * at reach 0 (it then stands right over the head), and its aim drops to a point CRANE_LOOK_AHEAD
 * along its yaw from the head (a little behind it, over the body) and CRANE_LOOK_UP above it. So
 * it looks down at the worm from above instead of ending level with it: about as much of the
 * worm stays in frame as at full reach (measured over the camera tests' drives).
 */
const CAM_CRANE = 0.25;
const CRANE_LOOK_AHEAD = -0.3;
const CRANE_LOOK_UP = -0.3;
/**
 * Below this reach the camera's "up" tilts from the sky toward the worm's forward (along its yaw),
 * fully at reach 0. Craned right over the head, the camera looks almost straight down, where
 * aiming with the sky as "up" is undefined and a small sideways move would spin the picture; with
 * forward as "up", the worm's forward stays at the top of the screen.
 */
const UP_TILT_REACH = 0.3;
/** The camera never dips closer than this (m) to the litter top beneath it... */
export const CAM_GROUND_MARGIN = 0.5;
/** ...easing onto that floor over its last this many metres above it. */
const GROUND_EASE = 0.1;
/** The camera stops this far (m) short of a trunk, rock or log in its way (spec 4.4)... */
const CAM_PROP_MARGIN = 0.35;
/** Half the angle (rad) of the fan of sight lines the camera checks behind the head. */
const CAM_FAN = 0.5;
/**
 * A side line only looks ahead: a prop on it pulls the camera in at most to this share of what
 * the middle line (its real line to the head) allows, unless the camera is swinging toward it
 * (CAM_LOOK). Only the middle line, or a side line the camera is about to reach, pulls it all the
 * way in. The trade-off: brushing past a trunk barely pulls the camera in, but when the worm slides
 * round a big trunk, the trunk can cut the middle line near its middle within a fifth of a second
 * (no earlier warning than a side line meeting it), and while the reach eases in, the camera sees
 * the worm partly through the trunk's edge: rarely, and for at most about half a second over the
 * camera tests' drives (0.4, the old floor, did the same a little less often). keepOut still keeps
 * the camera itself out of the trunk, without a snap.
 */
export const CAM_SIDE_FLOOR = 0.8;
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
 * line there, the camera's distance shrinks so it stops just short, easing in and back out, and
 * it cranes up to look down at the worm (cameraAim). Allocates nothing.
 */
export class CameraClearance {
  /** How much of its full distance the camera keeps (1 clear; less when a prop is in its way), and how fast that changes. */
  private readonly spring: Spring = { value: 1, velocity: 0 };
  /** CAM_OPTS with the distance cut to the reach and the height craned: what the follow camera steps with. */
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
    this.opts.height = CAM_OPTS.height * (1 + CAM_CRANE * (1 - r.value));
  }

  /**
   * The eased camera can trail a hard turn, or a prop that swings in beside the head: never let the
   * camera at `pos` itself into a prop. It is pushed sideways, straight out of any trunk (or rock or
   * log taller than it) it has come within CAM_HARD_MARGIN of, so it slides along the prop's edge.
   * Its line to the head may briefly cross a prop's edge while the reach eases in; it is never
   * moved along that line, which jumped (and shook, step to step) when the line's first blocked
   * point jumped. Then it is kept CAM_GROUND_MARGIN above the litter.
   */
  keepOut(pos: Vec3): void {
    pushOutTall(pos, CAM_HARD_MARGIN);
    // Never nearer the litter than CAM_GROUND_MARGIN, easing onto that floor over its last
    // GROUND_EASE (a smooth curve, so its rise and fall never turn sharply).
    const u = pos.y - litterTop(pos.x, pos.z) - CAM_GROUND_MARGIN;
    if (u < GROUND_EASE) pos.y += (u < -GROUND_EASE ? 0 : ((u + GROUND_EASE) * (u + GROUND_EASE)) / (4 * GROUND_EASE)) - u;
  }
}

/**
 * sightReach of the line from the head to the camera's full-distance spot along `yaw`. It checks
 * at the full, uncraned height on purpose: the craned camera stands higher, so a prop this line
 * clears, it clears too (conservative).
 */
function sightAt(h: Vec3, yaw: number): number {
  return sightReach(
    h.x, h.y, h.z,
    h.x - Math.sin(yaw) * CAM_OPTS.distance, h.y + CAM_OPTS.height, h.z - Math.cos(yaw) * CAM_OPTS.distance,
    CAM_PROP_MARGIN,
  );
}

/** Where the camera aims, and which way is up on screen: see cameraAim. */
export interface CameraAim {
  /** The point it looks at: this far ahead of the head along its yaw, and this far above it. */
  ahead: number;
  above: number;
  /** The screen's "up", a unit vector: the sky at full reach, tilting toward forward when craned. */
  upX: number;
  upY: number;
  upZ: number;
}

/** Where the camera aims at reach `reach` (0..1) and yaw `yaw`, into `out`. Allocates nothing. */
export function cameraAim(reach: number, yaw: number, out: CameraAim): void {
  out.ahead = CRANE_LOOK_AHEAD + (LOOK_AHEAD - CRANE_LOOK_AHEAD) * reach;
  out.above = CRANE_LOOK_UP + (LOOK_UP - CRANE_LOOK_UP) * reach;
  const b = Math.max(0, Math.min(1, (UP_TILT_REACH - reach) / UP_TILT_REACH));
  const t = b * b * (3 - 2 * b);
  // (sin yaw * t, 1 - t, cos yaw * t), made unit length: exactly the sky at t = 0.
  const n = 1 / Math.sqrt(t * t + (1 - t) * (1 - t));
  out.upX = Math.sin(yaw) * t * n;
  out.upY = (1 - t) * n;
  out.upZ = Math.cos(yaw) * t * n;
}
