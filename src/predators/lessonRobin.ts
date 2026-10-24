import type * as THREE from 'three';
import { UNITS_PER_CM } from '../surface/realScale';
import type { RobinPose } from './robin';
import { wingBeat } from './robinDemo';

/**
 * The V4 lesson's "Food up top" scene (Matt, 2026-10-23: the game's own robin, fully animated,
 * instead of the drawn one): the hunt's robin, timed to the scene's words and sounds (the cue's
 * 8.2 s, lessonSound.ts and lesson.css). Its shadow passes as it flies in over the worm (0 to
 * 3.6 s) and lands ahead; it hops three times toward the worm (landing at 4.45, 5.35 and 6.25 s,
 * on the thumps); then it stands very still and tips its head to look down (from 6.9 s), and holds
 * there while the question shows.
 */

/** When the scene settles: reduced motion shows this one still moment. */
export const LESSON_ROBIN_STILL = 7.6;

const FLY_FROM = 0.4;
const LAND_AT = 3.3;
const HOPS = [3.6, 4.5, 5.4];
const HOP_TIME = 0.85;
const HOP_CM = 7;
/** Where it lands, and where it ends, ahead of the worm (cm), and a little to one side. */
const LAND_CM = 17 + HOP_CM * HOPS.length;
const SIDE_CM = 9;

const ease = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const span = (t: number, a: number, b: number): number => ease((t - a) / (b - a));
const bump = (t: number, a: number, b: number): number => (t <= a || t >= b ? 0 : Math.sin((Math.PI * (t - a)) / (b - a)));

/**
 * Poses the robin `t` seconds into the scene, for a worm whose head is at (x, z) facing `heading`
 * (0 = +z). `ground(x, z)` is the litter's top.
 */
export function lessonRobinPose(
  t: number, x: number, z: number, heading: number,
  ground: (x: number, z: number) => number, out: RobinPose,
): void {
  out.visible = t >= FLY_FROM;
  out.lift = 0; out.crouch = 0; out.pitch = 0; out.stride = 0;
  out.headYaw = 0; out.headPitch = 0; out.headRoll = 0;
  out.bill = 0; out.tail = 0; out.flying = false; out.flap = 0; out.stroke = 0;
  out.flick = 0; out.flickBill = false;

  // Ahead of the worm (cm), and to the side.
  let ahead = LAND_CM;
  let side = SIDE_CM;
  // Facing the worm once landed; flying, it faces the way it flies (away from the worm).
  out.yaw = heading + Math.PI;
  if (t < LAND_AT) {
    // In from behind and above the worm, over it, slowing and dropping to land ahead of it.
    const k = span(t, FLY_FROM, LAND_AT);
    ahead = -70 + (LAND_CM + 70) * k;
    side = SIDE_CM + 30 * (1 - k);
    out.lift = 70 * (1 - k) * (1 - k) + 4 * bump(t, LAND_AT - 0.5, LAND_AT);
    out.flying = out.lift > 3;
    wingBeat(t, out);
    out.pitch = out.flying ? 0.6 : 0;
    out.yaw = heading;
  } else if (t < HOPS[0]) {
    // Lands and turns round to face the worm.
    out.crouch = 1 - span(t, LAND_AT, HOPS[0]);
    out.yaw = heading + Math.PI * span(t, LAND_AT, HOPS[0] - 0.05);
  }
  // Three hops toward the worm, both feet together: a crouch, a jump, a landing.
  for (const h of HOPS) {
    const k = (t - h) / HOP_TIME;
    ahead -= HOP_CM * ease(k);
    if (k > 0 && k < 1) {
      out.lift = 4 * Math.sin(Math.PI * Math.min(1, k / 0.8));
      out.crouch = 0.6 * bump(k, 0, 0.2) + 0.7 * bump(k, 0.8, 1);
      out.pitch = 0.15;
      out.tail = 0.2 * bump(k, 0.7, 1);
    }
  }
  // Very still, head tipped so one eye looks down at the ground; a slow small turn now and then.
  const stare = span(t, 6.6, 7.2);
  out.headRoll = 0.55 * stare;
  out.headPitch += 0.3 * stare;
  out.headYaw += stare * 0.12 * Math.sin(Math.max(0, t - 7.2) * 0.7);

  const d = ahead * UNITS_PER_CM;
  const s = side * UNITS_PER_CM;
  out.x = x + Math.sin(heading) * d + Math.cos(heading) * s;
  out.z = z + Math.cos(heading) * d - Math.sin(heading) * s;
  out.y = ground(out.x, out.z);
}

/**
 * The scene's camera: low, just behind and beside the worm's head, looking ahead past it to where
 * the robin lands, wide enough that the whole bird shows. Writes `camera` (main.ts's follow camera
 * puts it back the next frame).
 */
export function robinShot(
  camera: THREE.PerspectiveCamera, x: number, z: number, heading: number,
  ground: (x: number, z: number) => number,
): void {
  const sx = Math.sin(heading), cz = Math.cos(heading);
  const back = SHOT_BACK_CM * UNITS_PER_CM;
  const aside = -SHOT_SIDE_CM * UNITS_PER_CM;
  const cx = x - sx * back + cz * aside;
  const czz = z - cz * back - sx * aside;
  camera.position.set(cx, ground(cx, czz) + SHOT_UP_CM * UNITS_PER_CM, czz);
  const ahead = SHOT_LOOK_CM * UNITS_PER_CM;
  const lx = x + sx * ahead + cz * SIDE_CM * 0.5 * UNITS_PER_CM;
  const lz = z + cz * ahead - sx * SIDE_CM * 0.5 * UNITS_PER_CM;
  camera.lookAt(lx, ground(lx, lz) + SHOT_LOOK_UP_CM * UNITS_PER_CM, lz);
  camera.updateMatrixWorld();
}

const SHOT_BACK_CM = 20;
const SHOT_SIDE_CM = 6;
const SHOT_UP_CM = 6;
const SHOT_LOOK_CM = 22;
const SHOT_LOOK_UP_CM = 11;
