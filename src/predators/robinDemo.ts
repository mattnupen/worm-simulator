import { UNITS_PER_CM } from '../surface/realScale';
import type { RobinPose } from './robin';

/**
 * `?robin=1` (Matt's review of the V4 robin, screenshots): a 12-second loop of everything the
 * robin can do, in front of the worm. It flies in and lands, hops toward the worm three times,
 * stands still and stares with its head tipped (the real hunting pose: Cornell, All About Birds),
 * strikes, tugs, looks round and flies off. `?robinAt=` holds one moment. Not the hunt itself:
 * that is the next step, and it will drive the same pose.
 */

export const DEMO_SECONDS = 12;

const HOPS = [1.5, 2.5, 3.5];
const HOP_TIME = 0.32;
const HOP_CM = 8;
const HOP_HIGH = 3;

const ease = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const span = (t: number, a: number, b: number): number => ease((t - a) / (b - a));
/** 0 → 1 → 0 over [a, b]. */
const bump = (t: number, a: number, b: number): number => (t <= a || t >= b ? 0 : Math.sin((Math.PI * (t - a)) / (b - a)));

/**
 * Poses the robin at `t` (looped) for a worm `toward` it: it starts `start` along +forward of
 * (x, z) facing back along -forward. `ground(x, z)` is the litter's top.
 */
export function demoPose(
  time: number, x: number, z: number, heading: number, start: number,
  ground: (x: number, z: number) => number, out: RobinPose,
): void {
  const t = ((time % DEMO_SECONDS) + DEMO_SECONDS) % DEMO_SECONDS;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  out.visible = t < 11.4;
  out.yaw = heading + Math.PI;
  out.lift = 0; out.crouch = 0; out.pitch = 0;
  out.headYaw = 0; out.headPitch = 0; out.headRoll = 0;
  out.bill = 0; out.tail = 0; out.flying = false; out.flap = 0;

  // How far it has come toward the worm (cm): the hops, and the flights in and out.
  let ahead = 0;
  for (const h of HOPS) ahead += HOP_CM * span(t, h, h + HOP_TIME);

  if (t < 1.2) {
    // Flying in, from behind it and above, slowing to land.
    const k = 1 - ease(t / 1.2);
    out.flying = true;
    out.flap = 0.9 * Math.sin(t * Math.PI * 2 * 6);
    out.lift = 60 * k * k;
    ahead -= 40 * k;
    out.pitch = -0.35 * k;
  } else if (t < 1.5) {
    out.crouch = 1 - span(t, 1.2, 1.5);
  }
  for (const h of HOPS) {
    // A small crouch, then a hop forward.
    out.crouch += bump(t, h - 0.12, h + 0.05) * 0.6 + bump(t, h + HOP_TIME - 0.04, h + HOP_TIME + 0.1) * 0.5;
    out.lift += HOP_HIGH * bump(t, h, h + HOP_TIME);
    out.headPitch += -0.15 * bump(t, h, h + HOP_TIME);
  }
  // Stands still and stares, head tipped so one eye looks down at the ground.
  const stare = span(t, 4.2, 4.7) * (1 - span(t, 7.3, 7.5));
  out.headRoll = 0.5 * stare;
  out.headPitch += 0.25 * stare;
  out.headYaw += 0.15 * stare * span(t, 5.8, 6.1);
  out.tail = 0.35 * bump(t, 5.2, 5.45) + 0.25 * bump(t, 9.3, 9.5);
  // Strike: leans in, bill opening as it reaches the ground, then tugs back.
  const strike = span(t, 7.5, 7.8) * (1 - span(t, 8.1, 8.9));
  out.pitch += 0.95 * strike - 0.2 * bump(t, 8.2, 8.5);
  out.headPitch += 0.4 * strike;
  // The tail stays low-ish while the body tips forward (it would point straight up otherwise).
  out.tail -= 0.55 * strike;
  out.bill = bump(t, 7.55, 8.1);
  // Looks round, then takes off back the way it came.
  out.headYaw += 0.5 * bump(t, 9.0, 9.7);
  if (t >= 9.9) {
    const k = ease((t - 10.05) / 1.35);
    if (t < 10.05) out.crouch = bump(t, 9.9, 10.1);
    else {
      out.flying = true;
      out.flap = 0.95 * Math.sin((t - 10.05) * Math.PI * 2 * 6);
      out.lift = 70 * k * k;
      out.pitch = -0.3;
      out.yaw = heading;
      ahead -= 50 * k * k;
    }
  }
  const d = start - ahead * UNITS_PER_CM;
  out.x = x + fx * d;
  out.z = z + fz * d;
  out.y = ground(out.x, out.z);
}
