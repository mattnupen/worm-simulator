import { UNITS_PER_CM } from '../surface/realScale';

/**
 * The robin's hunt (V4 spec 1, revision 1): when it comes, how it closes in, and when it strikes.
 * A small pure state machine; huntPose.ts turns it into the robin's pose and huntGame.ts plays the
 * warnings, the grip mini-game (rhythm.ts) and what happens after.
 *
 *   away --(time catchable)--> arrive (warnings; flies in, lands about a metre off)
 *   arrive --> stare --(still too far)--> dash --> stare ... --(within reach)--> strike
 *   strike --(worm still catchable)--> grab --(the mini-game's end: endGrab)--> leave / miss / carry
 *   any time before the grab, the worm gets out of reach --> miss (pecks or looks round) --> leave
 *   leave --> away
 *
 * Catchable (revision 1): on the surface, or underground with its head in the top two layers
 * (leaf litter and old leaves). Real: robins pull worms that are near the surface out of their
 * burrows (Journey North). For a worm underground the robin hunts along the cut, on the ground
 * just behind it (huntGame.ts gives it the spot above the head): it lands closer
 * (`landUnderCm`), along the cut, so the side view shows it all.
 *
 * The real hunt (Cornell, All About Birds): a short run, a stop, a stare with its head tipped.
 * Each stare is the player's time to act. Positions are world units; nothing allocates.
 */

/** Every number in one place (seconds and centimetres), so they can change after Matt plays it. */
export const HUNT = {
  /** Time on the surface before a robin comes: from `waitMin` to `waitMin + waitSpread` seconds. */
  waitMin: 20,
  waitSpread: 20,
  /** It lands this far from the worm's head (on the surface)... */
  landCm: 100,
  /** ...or this far along the cut from the spot above the head (underground: on screen in the side view). */
  landUnderCm: 32,
  /** ...somewhere in front of the worm, within this angle either side, so the player sees it. */
  landSpread: 0.8,
  /** Flying in, then settling on its legs. */
  flyIn: 1.2,
  settle: 0.3,
  /** Each stare: from `stareMin` to `stareMin + stareSpread` seconds. */
  stareMin: 1.5,
  stareSpread: 1.0,
  /** Each run: up to `dashCm` closer, in `dashTime` seconds. */
  dashCm: 32,
  dashTime: 0.5,
  /** Its bill reaches the worm's head from this far (between its feet and the head). */
  reachCm: 12,
  /** It strikes from up to this many reaches away, stepping in as it pecks (the worm may have moved). */
  lunge: 1.6,
  /** The strike: leaning in to peck. */
  strike: 0.35,
  /** After a miss: looks round, then goes. */
  missLook: 1.4,
  /** Flying off (and with the worm's tail end). */
  flyOff: 1.4,
} as const;

export type HuntPhase = 'away' | 'arrive' | 'stare' | 'dash' | 'strike' | 'grab' | 'miss' | 'leave' | 'carry';

/** What happened this step, for the game to act on. */
export type HuntEvent = 'none' | 'warn' | 'grab' | 'miss' | 'gone';

/** How the grab ended: the worm got back in, or the worm broke, or the robin took all of it. */
export type GrabEnd = 'escaped' | 'broke' | 'taken';

export interface HuntState {
  phase: HuntPhase;
  /** Seconds into the phase. */
  t: number;
  /** Seconds on the surface still to go before the next robin. */
  wait: number;
  /** Where the robin stands (world units) and the way it faces (0 = +z). */
  x: number;
  z: number;
  yaw: number;
  /** A run: from here... */
  fromX: number;
  fromZ: number;
  /** ...to here. */
  toX: number;
  toZ: number;
  /** How long this stare lasts. */
  stare: number;
  /** The robin flies in from, and off toward, this direction (radians, like yaw). */
  away: number;
  /** The robin flies off with the worm's tail end (a break) rather than empty-billed. */
  withTail: boolean;
  /** Robins so far this life (the first one's hint). */
  count: number;
  /** A miss began mid-strike (already leaning in), not from a stare (it pecks the empty spot first). */
  struck: boolean;
  /** This robin came for a worm underground: it stays on the line along the cut. */
  under: boolean;
  /** How far off it landed (cm): its flight in comes from about this far past the worm. */
  land: number;
}

/** Where the worm is, each step. */
export interface HuntInput {
  /**
   * The robin can get the worm: on the surface and free to move, or underground with its head in
   * the top two layers (not mid-move: digging down or coming up).
   */
  catchable: boolean;
  /** Underground: the robin hunts along the cut (hx, hz is then the spot on the ground above the head). */
  under: boolean;
  /** Where the robin's bill must reach (world units): the worm's head, or the ground above it. */
  hx: number;
  hz: number;
  /** The worm's heading on the surface; underground, the way along the cut the robin lands. */
  heading: number;
}

export function createHunt(rand: () => number): HuntState {
  return {
    phase: 'away', t: 0, wait: HUNT.waitMin + HUNT.waitSpread * rand(), x: 0, z: 0, yaw: 0,
    fromX: 0, fromZ: 0, toX: 0, toZ: 0, stare: HUNT.stareMin, away: 0, withTail: false, count: 0, struck: false,
    under: false, land: HUNT.landCm,
  };
}

/** Back to waiting (a new life, or a reset): the robin is gone. */
export function resetHunt(s: HuntState, rand: () => number): void {
  go(s, 'away');
  s.wait = HUNT.waitMin + HUNT.waitSpread * rand();
  s.withTail = false;
}

/** Brings the next robin in `seconds` (the `?robinIn=` test link). */
export function robinIn(s: HuntState, seconds: number): void {
  if (s.phase === 'away') s.wait = seconds;
}

function go(s: HuntState, phase: HuntPhase): void {
  s.phase = phase;
  s.t = 0;
}

const CM = UNITS_PER_CM;

/** One step of the hunt. Returns what happened, for the game to play. */
export function stepHunt(s: HuntState, dt: number, w: HuntInput, rand: () => number): HuntEvent {
  s.t += dt;
  switch (s.phase) {
    case 'away': {
      if (!w.catchable) return 'none';
      s.wait -= dt;
      if (s.wait > 0) return 'none';
      // Lands ahead of the worm, a little to one side, facing it; underground, along the cut.
      s.under = w.under;
      s.land = w.under ? HUNT.landUnderCm : HUNT.landCm;
      const a = w.heading + (w.under ? 0 : (rand() * 2 - 1) * HUNT.landSpread);
      s.x = w.hx + Math.sin(a) * s.land * CM;
      s.z = w.hz + Math.cos(a) * s.land * CM;
      s.yaw = a + Math.PI;
      s.away = a;
      s.withTail = false;
      s.count++;
      go(s, 'arrive');
      return 'warn';
    }
    case 'arrive':
      if (s.t >= HUNT.flyIn + HUNT.settle) startStare(s, rand);
      return 'none';
    case 'stare':
      face(s, w);
      if (!w.catchable) return missed(s, w);
      if (s.t < s.stare) return 'none';
      if (distCm(s, w) <= HUNT.reachCm * HUNT.lunge) startStrike(s, w);
      else startDash(s, w);
      return 'none';
    case 'dash':
      if (slide(s, HUNT.dashTime)) startStare(s, rand);
      return 'none';
    case 'strike':
      // A lunge: a step in as it leans, so its bill meets the head.
      if (!slide(s, HUNT.strike)) return 'none';
      if (!w.catchable) return missed(s, w);
      go(s, 'grab');
      return 'grab';
    case 'grab':
      // Held until the game calls endGrab with the mini-game's result.
      return 'none';
    case 'miss':
      if (s.t >= HUNT.missLook) go(s, 'leave');
      return 'none';
    case 'leave':
    case 'carry':
      if (s.t < HUNT.flyOff) return 'none';
      resetHunt(s, rand);
      return 'gone';
  }
}

/** The mini-game is over: the robin goes, with nothing, the worm's tail end, or all of the worm. */
export function endGrab(s: HuntState, end: GrabEnd): void {
  if (s.phase !== 'grab') return;
  s.withTail = end === 'broke';
  // It flies off back the way it came.
  s.away = s.yaw;
  s.struck = true;
  go(s, end === 'escaped' ? 'miss' : end === 'broke' ? 'leave' : 'carry');
}

/** The robin is in the scene (from flying in to gone). */
export function robinShown(s: HuntState): boolean {
  return s.phase !== 'away';
}

function startStare(s: HuntState, rand: () => number): void {
  go(s, 'stare');
  s.stare = HUNT.stareMin + HUNT.stareSpread * rand();
}

function startDash(s: HuntState, w: HuntInput): void {
  // Close in, stopping just within reach: a short run, never past the worm.
  aimAt(s, w, Math.min(HUNT.dashCm, distCm(s, w) - HUNT.reachCm * 0.8));
  go(s, 'dash');
}

function startStrike(s: HuntState, w: HuntInput): void {
  aimAt(s, w, distCm(s, w) - HUNT.reachCm);
  go(s, 'strike');
}

/** Sets a move `stepCm` toward the worm's head from where the robin is (negative backs off). */
function aimAt(s: HuntState, w: HuntInput, stepCm: number): void {
  const k = stepCm / Math.max(distCm(s, w), 1e-6);
  s.fromX = s.x;
  s.fromZ = s.z;
  s.toX = s.x + (w.hx - s.x) * k;
  s.toZ = s.z + (w.hz - s.z) * k;
}

/** Moves along the run or lunge over `time` seconds; true once it's there. */
function slide(s: HuntState, time: number): boolean {
  const k = Math.min(1, s.t / time);
  s.x = s.fromX + (s.toX - s.fromX) * k;
  s.z = s.fromZ + (s.toZ - s.fromZ) * k;
  return k >= 1;
}

function missed(s: HuntState, w: HuntInput): HuntEvent {
  face(s, w);
  s.struck = s.phase === 'strike';
  go(s, 'miss');
  return 'miss';
}

function face(s: HuntState, w: HuntInput): void {
  s.yaw = Math.atan2(w.hx - s.x, w.hz - s.z);
}

function distCm(s: HuntState, w: HuntInput): number {
  return Math.hypot(w.hx - s.x, w.hz - s.z) / CM;
}
