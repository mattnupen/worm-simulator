import { UNITS_PER_CM } from '../surface/realScale';
import { HUNT, type HuntState } from './hunt';
import type { RobinPose } from './robin';
import { FLAP_HZ } from './robinDemo';
import type { TugState } from './tug';
import { TUG } from './tug';

/**
 * The robin's pose for the hunt (hunt.ts), with the same moves as the preview loop (robinDemo.ts):
 * flying in, short runs, the stare with its head tipped, the peck, the tug-of-war and flying off.
 * During a grab it follows the mini-game (tug.ts): it leans back as the warning, then tugs.
 * Writes into `out`; allocates nothing.
 */

const ease = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** 0 → 1 → 0 over [0, 1]. */
const bump = (k: number): number => (k <= 0 || k >= 1 ? 0 : Math.sin(Math.PI * k));
const beat = (s: number): number => 0.9 * Math.sin(s * Math.PI * 2 * FLAP_HZ);
const RUN_STEPS = 4;

/**
 * Poses the robin for hunt `h` (and the mini-game `tug` while it grabs). `ground(x, z)` is the
 * litter's top.
 */
export function huntPose(h: HuntState, tug: TugState, ground: (x: number, z: number) => number, out: RobinPose): void {
  out.visible = h.phase !== 'away';
  out.yaw = h.yaw;
  out.lift = 0; out.crouch = 0; out.pitch = 0; out.stride = 0;
  out.headYaw = 0; out.headPitch = 0; out.headRoll = 0;
  out.bill = 0; out.tail = 0; out.flying = false; out.flap = 0;
  // How far off its spot it is (cm), toward `h.away`: flying in or off.
  let off = 0;
  const t = h.t;
  switch (h.phase) {
    case 'away':
      break;
    case 'arrive':
      if (t < HUNT.flyIn) {
        // From behind its spot and above, slowing to land; legs down for the last few centimetres.
        const k = 1 - ease(t / HUNT.flyIn);
        out.lift = 60 * k * k;
        out.flying = out.lift > 5;
        out.flap = beat(t);
        out.pitch = out.flying ? 0.6 : 0;
        off = 40 * k;
      } else out.crouch = 1 - ease((t - HUNT.flyIn) / HUNT.settle);
      break;
    case 'stare': {
      // Still, head tipped so one eye looks at the ground; a flick of the tail now and then.
      const k = ease(t / 0.4);
      out.headRoll = 0.5 * k;
      out.headPitch = 0.25 * k;
      out.tail = 0.3 * bump((t - 0.8) / 0.25);
      out.crouch = 0.4 * bump(t / 0.25);
      break;
    }
    case 'dash': {
      // Quick running steps: alternate legs, a small bob each step, body level and head low.
      const k = Math.min(1, t / HUNT.dashTime);
      out.stride = 0.5 * Math.sin(k * Math.PI * RUN_STEPS);
      out.lift = 0.5 * Math.abs(Math.sin(k * Math.PI * RUN_STEPS));
      out.pitch = 0.25;
      out.headPitch = -0.1;
      break;
    }
    case 'strike': {
      // Leans in, bill opening as it reaches the ground; the tail stays low-ish.
      const k = ease(t / HUNT.strike);
      out.pitch = 0.95 * k;
      out.headPitch = 0.4 * k;
      out.tail = -0.55 * k;
      out.bill = bump(t / HUNT.strike);
      break;
    }
    case 'grab':
      grabPose(tug, out);
      break;
    case 'miss': {
      // Straightens up and looks round, then goes.
      const k = 1 - ease(t / 0.3);
      out.pitch = 0.95 * k;
      out.headPitch = 0.4 * k;
      out.tail = -0.55 * k;
      out.headYaw = 0.5 * bump((t - 0.3) / 0.9);
      out.headRoll = 0.3 * bump((t - 0.2) / 1.0);
      break;
    }
    case 'leave':
    case 'carry': {
      // A crouch, then up and away the way it came.
      if (t < 0.15) out.crouch = bump(t / 0.2);
      else {
        const k = ease((t - 0.15) / (HUNT.flyOff - 0.15));
        out.lift = 70 * k * k;
        out.flying = out.lift > 5;
        out.flap = beat(t - 0.15);
        out.pitch = out.flying ? 0.6 : 0.2;
        out.yaw = h.away;
        off = 50 * k * k;
      }
      break;
    }
  }
  const d = off * UNITS_PER_CM;
  out.x = h.x + Math.sin(h.away) * d;
  out.z = h.z + Math.cos(h.away) * d;
  out.y = ground(out.x, out.z);
}

/** Holding the worm: bent down to it, leaning back before a tug, then pulling hard. */
function grabPose(tug: TugState, out: RobinPose): void {
  out.crouch = 0.4;
  out.headPitch = 0.35;
  out.tail = -0.3;
  out.bill = 0.1;
  let back = 0;
  if (tug.phase === 'lean') back = 0.5 * ease(tug.t / TUG.lean);
  else if (tug.phase === 'tug') back = 0.5 + 0.3 * bump(tug.t / TUG.tugTime);
  else if (tug.t < 0.3) back = 0.5 * (1 - ease(tug.t / 0.3));
  // Down at the worm (0.6), easing back to upright and past it as it pulls.
  out.pitch = 0.6 - back * 1.2;
  out.crouch += 0.3 * back;
  // The tail lifts as the body tips back, so its tip stays off the ground.
  out.tail += 1.1 * back;
}
