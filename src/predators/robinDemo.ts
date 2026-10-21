import { UNITS_PER_CM } from '../surface/realScale';
import type { RobinPose } from './robin';

/**
 * `?robin=1` (Matt's review of the V4 robin, screenshots): a 12-second loop of everything the
 * robin can do, in front of the worm. It flies in and lands, runs toward the worm in two short
 * dashes, stands still and stares with its head tipped (the real hunting pose: Cornell, All About
 * Birds), pecks, tugs hard, looks round and flies off. `?robinAt=` holds one moment. Not the hunt
 * itself: that is the next step, and it will drive the same pose.
 */

export const DEMO_SECONDS = 12;

/** Wingbeats a second. Game choice: no source found; about right for a bird its size. */
export const FLAP_HZ = 9;

/** The dashes: when each starts (s); each is a few quick running steps, then a stop. */
const RUNS = [1.7, 2.9];
const RUN_TIME = 0.45;
const RUN_STEPS = 4;
const RUN_CM = 12;

const ease = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const span = (t: number, a: number, b: number): number => ease((t - a) / (b - a));
/** 0 → 1 → 0 over [a, b]. */
const bump = (t: number, a: number, b: number): number => (t <= a || t >= b ? 0 : Math.sin((Math.PI * (t - a)) / (b - a)));
/**
 * The open wings `s` seconds into a flight: their angle (flap) and which way they are going
 * (stroke, positive on the upstroke). Shared by the hunt and the nest scene.
 */
export function wingBeat(s: number, out: RobinPose): void {
  const ph = s * Math.PI * 2 * FLAP_HZ;
  out.flap = 0.9 * Math.sin(ph);
  out.stroke = Math.cos(ph);
}

/**
 * Poses the robin at `t` (looped) for a worm at (x, z) facing `heading`: it starts `start` world
 * units ahead of the worm, facing back at it. `ground(x, z)` is the litter's top.
 */
export function demoPose(
  time: number, x: number, z: number, heading: number, start: number,
  ground: (x: number, z: number) => number, out: RobinPose,
): void {
  const t = ((time % DEMO_SECONDS) + DEMO_SECONDS) % DEMO_SECONDS;
  out.visible = t < 11.4;
  out.yaw = heading + Math.PI;
  out.lift = 0; out.crouch = 0; out.pitch = 0; out.stride = 0;
  out.headYaw = 0; out.headPitch = 0; out.headRoll = 0;
  out.bill = 0; out.tail = 0; out.flying = false; out.flap = 0; out.stroke = 0;

  // How far it has come toward the worm (cm): the dashes, and the flights in and out.
  let ahead = 0;
  for (const r of RUNS) {
    const k = (t - r) / RUN_TIME;
    ahead += RUN_CM * Math.min(1, Math.max(0, k));
    if (k > 0 && k < 1) {
      // Alternate legs, a small bob each step, body level and head low.
      out.stride = 0.5 * Math.sin(k * Math.PI * RUN_STEPS);
      out.lift = 0.5 * Math.abs(Math.sin(k * Math.PI * RUN_STEPS));
      out.pitch = 0.25;
      out.headPitch = -0.1;
    }
    // A short settle as it stops.
    out.crouch += 0.4 * bump(t, r + RUN_TIME - 0.05, r + RUN_TIME + 0.2);
  }

  if (t < 1.2) {
    // Flying in, from behind it and above, slowing to land; legs down for the last few centimetres.
    const k = 1 - ease(t / 1.2);
    out.lift = 60 * k * k;
    out.flying = out.lift > 5;
    wingBeat(t, out);
    ahead -= 40 * k;
    // Flying, the body lies level.
    out.pitch = out.flying ? 0.6 : 0;
  } else if (t < 1.5) {
    out.crouch = 1 - span(t, 1.2, 1.5);
  }
  // Stands still and stares, head tipped so one eye looks down at the ground.
  const stare = span(t, 3.6, 4.1) * (1 - span(t, 7.3, 7.45));
  out.headRoll = 0.5 * stare;
  out.headPitch += 0.25 * stare;
  out.headYaw += 0.15 * stare * span(t, 5.6, 5.9);
  out.tail = 0.35 * bump(t, 5.0, 5.25) + 0.25 * bump(t, 9.3, 9.5);
  // A quick peck: leans in, bill opening as it reaches the ground.
  const peck = span(t, 7.5, 7.65) * (1 - span(t, 7.75, 7.9));
  out.pitch += 0.95 * peck;
  out.headPitch += 0.4 * peck;
  // The tail stays low-ish while the body tips forward (it would point straight up otherwise).
  out.tail -= 0.55 * peck;
  out.bill = bump(t, 7.52, 7.8);
  // Then it tugs hard, three times, leaning back with its legs braced: the worm's bristles hold on.
  const tug = t > 7.8 && t < 8.9 ? Math.max(0, Math.sin(((t - 7.8) / 1.1) * Math.PI * 3)) : 0;
  const tugging = bump(t, 7.75, 8.95);
  out.pitch += 0.5 * tugging - 0.35 * tug - 0.35 * tugging * (1 - tug);
  out.headPitch += 0.35 * tugging;
  out.crouch += 0.4 * tugging;
  // Looks round, then takes off back the way it came.
  out.headYaw += 0.5 * bump(t, 9.0, 9.7);
  if (t >= 9.9) {
    if (t < 10.05) out.crouch = bump(t, 9.9, 10.1);
    else {
      const k = ease((t - 10.05) / 1.35);
      out.lift = 70 * k * k;
      out.flying = out.lift > 5;
      wingBeat(t - 10.05, out);
      out.pitch = out.flying ? 0.6 : 0.2;
      out.yaw = heading;
      ahead -= 50 * k * k;
    }
  }
  const d = start - ahead * UNITS_PER_CM;
  out.x = x + Math.sin(heading) * d;
  out.z = z + Math.cos(heading) * d;
  out.y = ground(out.x, out.z);
}
