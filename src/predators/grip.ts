/**
 * The grip mini-game (V4, Matt 2026-10-22: "a space bar tapping thing ... you have to grab when
 * robin is pulling you and you also have an energy bar that goes down"). The robin takes turns:
 * it pulls (a yank), then lets go a little to get a new grip, then pulls again. The worm sits
 * somewhere from safe in its hole (0) to pulled out (1).
 *
 * - During a pull the worm slides up, unless the player taps Action: each tap in a pull grips and
 *   pulls the worm back down a step.
 * - A tap while the robin regrips does nothing (it is wasted), and so does one too soon after the
 *   last grip (it slips).
 * - Every tap costs energy, pull or not, so tapping as fast as you can runs the energy out. Energy
 *   comes back slowly while you rest (no tap for a moment).
 * - Back down to 0: escaped. Out to 1, or energy at 0: the robin wins ('pulledOut').
 *
 *   regrip (the lead-in) --> pull --> regrip --> pull ... --> the end
 *
 * The grip is real (setae: Journey North); the energy bar and the turns are a Game choice.
 * Pure and allocation-free: one state object, stepped at the game's fixed step with this step's
 * press (an edge: createPressEdge, or a tap) and the game's rand.
 */

/** Every number in one place (seconds, and shares of the way out or of full energy), to tune after Matt plays it. */
export const GRIP = {
  /** The robin settles its hold before the first pull. */
  lead: 0.8,
  /** Each pull lasts between these (s)... */
  pullMin: 0.7,
  pullMax: 1.0,
  /** ...and each regrip between these. */
  regripMin: 0.6,
  regripMax: 1.0,
  /** Where the worm starts (0 safe in its hole, 1 pulled out). */
  start: 0.5,
  /** During a pull the worm slides up this much a second. */
  slide: 0.25,
  /** Each tap in a pull pulls it this much back down... */
  step: 0.09,
  /**
   * ...unless it comes sooner than this after the last tap that gripped (s): then it slips (mashing
   * grips at most every other tap, about 7 a second at best).
   */
  gap: 0.13,
  /** Each tap (in a pull or not) costs this much energy (1 is full)... */
  cost: 0.085,
  /** ...and with no tap for `rest` seconds, energy comes back at `refill` a second. */
  rest: 0.2,
  refill: 0.65,
  /** The HUD marks energy at or under this as low. */
  low: 0.3,
} as const;

export type GripPhase = 'pull' | 'regrip';
export type GripResult = 'none' | 'escaped' | 'pulledOut';
/** What a step did: a pull began, a tap gripped (in a pull), or a tap was wasted (in a regrip, or too soon). */
export type GripEvent = 'none' | 'pull' | 'grip' | 'waste';

export interface GripState {
  phase: GripPhase;
  /** Seconds into the phase, and how long this phase lasts. */
  t: number;
  dur: number;
  /** Pulls so far (the one now counts). */
  pulls: number;
  /** 0 safe in the hole .. 1 pulled out. */
  pos: number;
  /** 0 .. 1. */
  energy: number;
  /** Seconds since the last tap, and since the last tap that gripped. */
  idle: number;
  since: number;
  result: GripResult;
  /** The robin won because the energy ran out (not because it pulled the worm out). */
  tired: boolean;
  /** Seconds since the grab began. */
  elapsed: number;
}

export function createGrip(): GripState {
  // The number fields start as fractions: a field that first held a whole number had V8 box every
  // fractional value written to it later (as burrower.ts). startGrip sets them for a grab.
  const s: GripState = { phase: 'regrip', t: 0.5, dur: 0.5, pulls: 0, pos: 0.5, energy: 0.5, idle: 0.5, since: 0.5, result: 'none', tired: false, elapsed: 0.5 };
  startGrip(s);
  return s;
}

/** A new grab: full energy, the worm partway out, the robin settling before its first pull. */
export function startGrip(s: GripState): void {
  s.phase = 'regrip';
  s.t = 0;
  s.dur = GRIP.lead;
  s.pulls = 0;
  s.pos = GRIP.start;
  s.energy = 1;
  s.idle = 0;
  s.since = GRIP.gap + 0.5;
  s.result = 'none';
  s.tired = false;
  s.elapsed = 0;
}

/**
 * One step. `pressed`: Action went down this step (a press edge or a tap). `rand`: the game's
 * random numbers in [0, 1) (each new phase's length). Returns what happened this step; a pull
 * beginning wins over a tap in the same step. Nothing changes once there is a result.
 */
export function stepGrip(s: GripState, dt: number, pressed: boolean, rand: () => number): GripEvent {
  if (s.result !== 'none') return 'none';
  s.elapsed += dt;
  s.t += dt;
  s.since += dt;
  let ev: GripEvent = 'none';
  if (s.t >= s.dur) {
    // The next turn: a pull after a regrip, a regrip after a pull.
    s.t -= s.dur;
    if (s.phase === 'regrip') {
      s.phase = 'pull';
      s.dur = GRIP.pullMin + (GRIP.pullMax - GRIP.pullMin) * rand();
      s.pulls++;
      ev = 'pull';
    } else {
      s.phase = 'regrip';
      s.dur = GRIP.regripMin + (GRIP.regripMax - GRIP.regripMin) * rand();
    }
  }
  if (pressed) {
    s.idle = 0;
    s.energy -= GRIP.cost;
    if (s.energy <= 1e-9) {
      s.energy = 0;
      s.tired = true;
      s.result = 'pulledOut';
      return ev;
    }
    if (s.phase === 'pull' && s.since >= GRIP.gap) {
      s.pos -= GRIP.step;
      s.since = 0;
      if (ev === 'none') ev = 'grip';
    } else if (ev === 'none') ev = 'waste';
  } else {
    s.idle += dt;
    if (s.idle >= GRIP.rest) s.energy = Math.min(1, s.energy + GRIP.refill * dt);
  }
  if (s.phase === 'pull') s.pos += GRIP.slide * dt;
  if (s.pos <= 0) {
    s.pos = 0;
    s.result = 'escaped';
  } else if (s.pos >= 1) {
    s.pos = 1;
    s.result = 'pulledOut';
  }
  return ev;
}
