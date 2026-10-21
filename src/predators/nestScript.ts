import type { TextKey } from '../content/text';
import { UNITS_PER_CM } from '../surface/realScale';
import type { RobinPose } from './robin';
import { FLAP_HZ } from './robinDemo';
import type { NestlingPose } from './nest';
import { RIM_R, RIM_Y } from './nestShape';

/**
 * The nest scene's script (V4 spec section 5; about 10 seconds), as plain data and pure poses: the
 * robin, with the whole worm in its bill, flies from the forest floor up to its nest in the sugar
 * maple, lands on the rim, the three nestlings stretch up with their mouths wide, the robin leans
 * in to feed one, and the screen fades to dark. Then the fact card (nestScene.ts). Gentle on
 * purpose: nothing is shown being swallowed (the picture is nearly dark when the worm is given).
 * Times in seconds from the catch.
 */
export const NEST_TIMES = {
  /** The robin springs off the ground with the worm. */
  takeoff: 0.85,
  /** Its feet touch the rim. */
  land: 4.45,
  /** The nestlings feel it coming and reach up, mouths open. */
  beg: 4.15,
  /** It leans in to the nearest nestling, holds there, and straightens up again (in the dark). */
  leanIn: [6.4, 7.2],
  leanOut: [8.9, 9.6],
  /** The worm is given (the picture is nearly dark by now): it is no longer drawn. */
  fed: 8.75,
  /** The screen goes dark, and the fact card comes up at the end. */
  fade: [7.5, 9.0],
  end: 10,
} as const;

/** The scene's captions (sounds, in brackets, like the opening's): from `at` until the next. */
export const NEST_CAPTIONS: readonly { at: number; line: TextKey | null }[] = [
  { at: 0, line: null },
  { at: NEST_TIMES.takeoff, line: 'nestWings' },
  { at: 3.4, line: null },
  { at: NEST_TIMES.beg + 0.2, line: 'nestCheep' },
  { at: 7.4, line: null },
];

/** The caption at `t` (null: none). */
export function nestCaptionAt(t: number): TextKey | null {
  let line: TextKey | null = null;
  for (const c of NEST_CAPTIONS) if (t >= c.at) line = c.line;
  return line;
}

/**
 * Where the scene happens, worked out once when it starts: the robin's start on the forest floor
 * (where it caught the worm, facing `heading`), the nest (its cup's floor, world units) with its
 * branch's outward direction, and the flight between (a curve from P0 to P3: straight up off the
 * ground, then in to the rim from outside the tree).
 */
export interface NestSetup {
  x0: number; y0: number; z0: number; heading: number;
  nx: number; ny: number; nz: number; nestYaw: number;
  /** The flight's curve: four points, x y z each. */
  curve: Float64Array;
  /**
   * Which side of the flight the moving camera keeps to (1 or -1, 0: the nest shot's side) and
   * how far from the robin: chosen when it starts so the camera never goes into a trunk
   * (nestCamera.ts planCamera).
   */
  camSide: number;
  camTrack: number;
}

export function makeSetup(x0: number, y0: number, z0: number, heading: number, nest: { x: number; y: number; z: number; yaw: number }, out?: NestSetup): NestSetup {
  const s = out ?? { x0, y0, z0, heading, nx: 0, ny: 0, nz: 0, nestYaw: 0, curve: new Float64Array(12), camSide: 0, camTrack: 13 };
  Object.assign(s, { x0, y0, z0, heading, nx: nest.x, ny: nest.y, nz: nest.z, nestYaw: nest.yaw, camSide: 0, camTrack: 13 });
  const c = s.curve;
  const ox = Math.sin(nest.yaw);
  const oz = Math.cos(nest.yaw);
  // The perch: on the rim's outer edge, on the side away from the trunk.
  const px = nest.x + ox * (RIM_R + 0.8) * UNITS_PER_CM;
  const pz = nest.z + oz * (RIM_R + 0.8) * UNITS_PER_CM;
  const py = nest.y + (RIM_Y + 0.7) * UNITS_PER_CM;
  const dx = px - x0;
  const dz = pz - z0;
  const flat = Math.hypot(dx, dz) || 1;
  c.set([
    x0, y0, z0,
    x0 + (dx / flat) * 3, y0 + (py - y0) * 0.55, z0 + (dz / flat) * 3,
    px + ox * 14, py + 6, pz + oz * 14,
    px, py, pz,
  ]);
  return s;
}

/** The flight's curve at u (0..1), into `out` (a 3-array). */
export function curveAt(s: NestSetup, u: number, out: number[]): number[] {
  const c = s.curve;
  const v = 1 - u;
  const a = v * v * v, b = 3 * v * v * u, d = 3 * v * u * u, e = u * u * u;
  for (let k = 0; k < 3; k++) out[k] = a * c[k] + b * c[3 + k] + d * c[6 + k] + e * c[9 + k];
  return out;
}

const ease = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const span = (t: number, a: number, b: number): number => ease((t - a) / (b - a));
const bump = (t: number, a: number, b: number): number => (t <= a || t >= b ? 0 : Math.sin((Math.PI * (t - a)) / (b - a)));
/** The short way round from angle a to b, by k. */
const turn = (a: number, b: number, k: number): number => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

/** How far along the flight the robin is at t (0..1): eased off the ground and into the landing. */
export function flightU(t: number): number {
  return span(t, NEST_TIMES.takeoff, NEST_TIMES.land);
}

const here = [0, 0, 0];
const ahead = [0, 0, 0];

/** Poses the robin at t. */
export function robinAt(t: number, s: NestSetup, out: RobinPose): void {
  const T = NEST_TIMES;
  out.visible = true;
  out.lift = 0; out.stride = 0; out.crouch = 0; out.pitch = 0; out.headYaw = 0; out.headRoll = 0;
  out.tail = 0; out.flap = 0; out.flying = false;
  // Holding the worm: the bill shut on it, the head up after the pull.
  out.bill = 0.12;
  out.headPitch = -0.3;
  const perchYaw = s.nestYaw + Math.PI;
  if (t < T.takeoff) {
    out.x = s.x0; out.y = s.y0; out.z = s.z0; out.yaw = s.heading;
    // Settles from the pull, then crouches to spring.
    out.pitch = -0.15 * (1 - span(t, 0, 0.4));
    out.crouch = 0.9 * span(t, 0.5, T.takeoff);
    out.tail = 0.2 * span(t, 0.5, T.takeoff);
    return;
  }
  if (t < T.land) {
    const u = flightU(t);
    curveAt(s, u, here);
    curveAt(s, Math.min(1, u + 0.02), ahead);
    out.x = here[0]; out.y = here[1]; out.z = here[2];
    const dx = ahead[0] - here[0];
    const dz = ahead[2] - here[2];
    const along = Math.hypot(dx, dz) > 1e-4 ? Math.atan2(dx, dz) : s.heading;
    // Faces its way at first, then turns to face the nestlings as it comes in.
    out.yaw = turn(turn(s.heading, along, span(t, T.takeoff, T.takeoff + 0.5)), perchYaw, span(t, T.land - 0.8, T.land));
    out.flying = true;
    out.flap = 0.9 * Math.sin((t - T.takeoff) * Math.PI * 2 * FLAP_HZ);
    // Level in flight, rearing up to brake as it lands.
    out.pitch = 0.6 - 0.75 * span(t, T.land - 0.6, T.land);
    out.tail = 0.3 * span(t, T.land - 0.6, T.land);
    out.headPitch = -0.1;
    return;
  }
  out.x = s.curve[9]; out.y = s.curve[10]; out.z = s.curve[11]; out.yaw = perchYaw;
  out.crouch = 0.8 * bump(t, T.land, T.land + 0.45);
  out.tail = 0.35 * bump(t, T.land, T.land + 0.8);
  // Looks down at its young, a glance from one to another.
  const look = span(t, T.land + 0.2, T.land + 0.7);
  out.headPitch = -0.3 + 0.55 * look;
  out.headYaw = 0.3 * Math.sin((t - T.land) * 2.2) * look * (1 - span(t, T.leanIn[0] - 0.4, T.leanIn[0]));
  // Leans in to the nearest one, and back.
  const lean = span(t, T.leanIn[0], T.leanIn[1]) * (1 - span(t, T.leanOut[0], T.leanOut[1]));
  out.pitch = 0.95 * lean;
  out.headPitch += 0.3 * lean;
  out.tail -= 0.5 * lean;
  out.crouch += 0.35 * lean;
  // The bill opens to let go of the worm.
  out.bill = t < T.fed ? 0.12 : 0.12 + 0.3 * bump(t, T.fed, T.fed + 0.4);
}

/** Phases so the three nestlings never move together. */
const PHASE = [0, 2.1, 4.3];
const BEG_RATE = [6.4, 7.3, 5.8];

/** Poses nestling `i` at t. The first is the one fed. */
export function nestlingAt(t: number, i: number, out: NestlingPose): void {
  const T = NEST_TIMES;
  const reach = span(t, T.beg + i * 0.12, T.beg + 0.5 + i * 0.12);
  // The fed one sinks back first; the others beg on a little, then settle too.
  const settle = i === 0 ? span(t, T.fed + 0.1, T.fed + 0.9) : span(t, T.leanOut[0], T.leanOut[1] + 0.2);
  const begging = reach * (1 - settle);
  const ph = PHASE[i];
  // Wobbling on their weak necks, mouths opening and shutting a little as they cheep.
  const still = i === 0 ? span(t, T.leanIn[0], T.leanIn[1]) : 0;
  out.sway = begging * (1 - 0.8 * still) * 0.24 * Math.sin(t * BEG_RATE[i] + ph) + (1 - reach) * 0.02 * Math.sin(t * 1.3 + ph);
  out.stretch = begging * (0.88 + 0.12 * Math.sin(t * 3.1 + ph)) + 0.12 * settle;
  out.lean = begging * (0.18 + 0.1 * Math.sin(t * 2.3 + ph) + 0.15 * still);
  const shut = i === 0 ? span(t, T.fed, T.fed + 0.25) : settle;
  out.open = reach * (1 - shut) * (0.82 + 0.18 * Math.sin(t * 13 + ph * 3) * (1 - still));
}

/** How dark the screen is at t (0 clear, 1 black). */
export function darkAt(t: number): number {
  return span(t, NEST_TIMES.fade[0], NEST_TIMES.fade[1]);
}
