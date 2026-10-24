import { UNITS_PER_CM } from '../surface/realScale';
import { HUNT, type HuntState } from './hunt';
import type { RobinPose } from './robin';
import { wingBeat } from './robinDemo';

/**
 * The robin's pose for the hunt (hunt.ts), with the same moves as the preview loop (robinDemo.ts):
 * flying in, short runs, the stare with its head tipped, the peck, the tug-of-war and flying off.
 * During a grab it follows the mini-game (huntGrab.ts): bent down to the worm when the worm has
 * pulled most of itself back in, leaning back when it has pulled the worm out; leaning back hard
 * and yanking through each pull, and its bill loosening for a new grip between pulls.
 * Writes into `out`; allocates nothing.
 */

/** How the robin holds the worm in a grab (huntGrab.ts sets it each step). */
export interface GripLook {
  /** How far out it has pulled the worm: 0 bent right down to the ground, 1 leaning back with most of it out. */
  level: number;
  /** 0..1: loosening its hold to get a new grip (the bill opens a little between pulls). */
  loosen: number;
  /** 0..1: pulling, leaning back further and bracing (through each pull). */
  tug: number;
}

const ease = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** 0 → 1 → 0 over [0, 1]. */
const bump = (k: number): number => (k <= 0 || k >= 1 ? 0 : Math.sin(Math.PI * k));
const RUN_STEPS = 4;
/** Digging for a worm underground: kicks back with its feet this many times a second, then stabs with its bill this many times (both under 3 a second). */
const SCRATCH_HZ = 2.5;
const STABS = 2;
/** The share of the probe spent stabbing; the rest bends right down to the hole (grabPose at level 0). */
const STAB_SHARE = 0.7;

/**
 * Poses the robin for hunt `h` (and the grip `look` while it grabs). `ground(x, z)` is the
 * litter's top.
 */
export function huntPose(h: HuntState, look: GripLook, ground: (x: number, z: number) => number, out: RobinPose): void {
  out.visible = h.phase !== 'away';
  out.yaw = h.yaw;
  out.lift = 0; out.crouch = 0; out.pitch = 0; out.stride = 0;
  out.headYaw = 0; out.headPitch = 0; out.headRoll = 0;
  out.bill = 0; out.tail = 0; out.flying = false; out.flap = 0; out.stroke = 0;
  out.flick = 0; out.flickBill = false;
  // How far off its spot it is (cm), toward `h.away`: flying in or off.
  let off = 0;
  const t = h.t;
  switch (h.phase) {
    case 'away':
      break;
    case 'arrive':
      if (t < HUNT.flyIn) {
        // From behind the worm, over it (its shadow sweeps across), out to its spot, slowing to
        // land; legs down for the last few centimetres. It flies facing its way...
        const k = 1 - ease(t / HUNT.flyIn);
        out.lift = 60 * k * k;
        out.flying = out.lift > 5;
        wingBeat(t, out);
        out.pitch = out.flying ? 0.6 : 0;
        out.yaw = h.away;
        off = -(h.land + 60) * k;
      } else {
        // ...then hops round to face the worm as it settles.
        const k = ease((t - HUNT.flyIn) / HUNT.settle);
        out.crouch = 1 - k;
        out.yaw = h.away + Math.PI * k;
      }
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
      // (A whole number of steps a run, about RUN_STEPS each half second: a longer run, more steps.)
      const k = Math.min(1, t / h.run);
      const steps = Math.max(2, 2 * Math.round(h.run * RUN_STEPS));
      out.stride = 0.5 * Math.sin(k * Math.PI * steps);
      out.lift = 0.5 * Math.abs(Math.sin(k * Math.PI * steps));
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
    case 'dig':
      digPose(t, out);
      break;
    case 'grab':
      grabPose(look, out);
      break;
    case 'miss': {
      // Straightens up and looks round, then goes. From a stare it first pecks the empty spot.
      const k = h.struck ? 1 - ease(t / 0.3) : bump(t / 0.5);
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
        wingBeat(t - 0.15, out);
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

/**
 * Digging for a worm underground (revision 4), `t` seconds in: from the strike's lean it scratches
 * the leaf litter, kicking back with one foot then the other and bobbing (looking down at the
 * spot), then stabs down twice with its bill, leaf bits flying with each kick and stab (robinBits.ts),
 * and bends right down to the hole, ending in
 * grabPose's level 0, so the grab goes on from there without a jump.
 */
export function digPose(t: number, out: RobinPose): void {
  if (t < HUNT.scratch) {
    const k = ease(t / 0.15);
    const kick = Math.sin(2 * Math.PI * SCRATCH_HZ * t);
    out.pitch = 0.95 - 0.45 * k;
    out.headPitch = 0.4 + 0.1 * k;
    out.tail = -0.55 + 0.75 * k;
    out.stride = 0.7 * kick * k;
    out.lift = 0.8 * Math.abs(kick) * k;
    out.crouch = 0.35 * (1 - Math.abs(kick)) * k;
    // Each kick throws a little spray of leaf bits back.
    out.flick = t < 0.1 ? 0 : (t * SCRATCH_HZ) % 1;
    return;
  }
  const s = (t - HUNT.scratch) / HUNT.probe;
  if (s < STAB_SHARE) {
    const stab = bump(((s / STAB_SHARE) * STABS) % 1);
    out.pitch = 0.5 + 0.45 * stab;
    out.bill = 0.5 * stab;
    out.headPitch = 0.5 - 0.15 * stab;
    out.crouch = 0.35 * stab;
    out.tail = 0.2 - 0.75 * stab;
    // Each stab tosses bits aside from under its bill.
    out.flick = ((s / STAB_SHARE) * STABS) % 1;
    out.flickBill = true;
    return;
  }
  // Down to the hole: grabPose at level 0 (pitch 0.92, crouch 0.35, head 0.35, bill 0.08).
  const k = ease((s - STAB_SHARE) / (1 - STAB_SHARE));
  out.pitch = 0.5 + 0.42 * k;
  out.headPitch = 0.5 - 0.15 * k;
  out.crouch = 0.35 * k;
  out.tail = 0.2 - (0.2 + 0.3 + 0.7 * 0.32) * k;
  out.bill = 0.08 * k;
}

/**
 * Holding the worm: bent down to it (pitch 0.92 puts the bill at the ground) or leaning back as it
 * pulls (pitch -0.3: the bill about 12 cm up, most of the worm out); legs braced as it pulls.
 */
export function grabPose(look: GripLook, out: RobinPose): void {
  // Never further back than -0.42: past it the tail and feet reach below the ground.
  out.pitch = Math.max(-0.42, 0.92 - 1.2 * look.level - 0.4 * look.tug);
  out.crouch = 0.35 + 0.3 * look.level + 0.2 * look.tug;
  // Head pulled back through a pull: the yank.
  out.headPitch = 0.35 - 0.3 * look.tug;
  // The tail goes down as it bends in and lifts as it tips back, so its tip stays off the ground.
  out.tail = out.pitch > 0.6 ? -0.3 - 0.7 * (out.pitch - 0.6) : -0.3 + 0.92 * (0.6 - out.pitch);
  out.bill = 0.08 + 0.45 * look.loosen;
}
