import { UNITS_PER_CM } from '../surface/realScale';
import { aimAt, distCm, face, offLineCm, slide } from './huntMove';
import { HUNT } from './huntTune';

export { HUNT };

/**
 * The robin's hunt (V4 spec 1, revision 1): when it comes, how it closes in, and when it strikes.
 * A small pure state machine; huntPose.ts turns it into the robin's pose and huntGame.ts plays the
 * warnings, the grip mini-game (grip.ts) and what happens after.
 *
 *   away --(time catchable)--> arrive (warnings; flies in, lands about a metre off)
 *   arrive --> stare --(still too far)--> dash --> stare ... --(within reach)--> strike
 *   strike --(on the surface)--> grab --(the mini-game's end: endGrab)--> leave / miss / carry
 *   strike --(underground)--> dig (scratches the litter, probes with its bill) --> grab
 *   any time before the grab, the worm gets out of reach --> miss (pecks or looks round) --> leave
 *   leave --> away
 *
 * Revision 4 (Matt, 2026-10-24): a worm crawling away can't outrun it (a stare is cut short and it
 * runs after the worm, further each run), and digging down doesn't lose it: while the worm digs
 * down (or is up on a rock) it waits where it is, then walks over and can still get the worm in
 * the top two layers. Only deeper than that (`escapeLayer`) is the worm away.
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


export type HuntPhase = 'away' | 'arrive' | 'stare' | 'dash' | 'strike' | 'dig' | 'grab' | 'miss' | 'leave' | 'carry';

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
  /** How long this stare lasts, and how far off the worm was as it began (cm). */
  stare: number;
  seen: number;
  /** How long this run lasts. */
  run: number;
  /** The worm crawled off during the last stare: the next run goes further. */
  chase: boolean;
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
  /**
   * Out of reach for now, but not gone (revision 4): digging down or coming up, or up on a rock or
   * the log. The robin keeps after it (it waits, and walks over) but can't strike.
   */
  wait: boolean;
  /** Underground: the robin hunts along the cut (hx, hz is then the spot on the ground above the head). */
  under: boolean;
  /** Where the robin's bill must reach (world units): the worm's head, or the ground above it. */
  hx: number;
  hz: number;
  /** The worm's heading on the surface; underground, the way along the cut the robin lands. */
  heading: number;
  /** Underground: the cut's way (a unit vector; 0, 0 on the surface). The robin ends its runs on this line through (hx, hz). */
  ax: number;
  az: number;
}

export function createHunt(rand: () => number): HuntState {
  return {
    phase: 'away', t: 0, wait: HUNT.waitMin + HUNT.waitSpread * rand(), x: 0, z: 0, yaw: 0,
    fromX: 0, fromZ: 0, toX: 0, toZ: 0, stare: HUNT.stareMin, seen: 0.5, run: HUNT.dashTime, chase: false, away: 0, withTail: false, count: 0, struck: false,
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
/** Underground, the robin strikes only from this close to the cut's line (cm). */
const LINE_CM = 3;

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
      if (s.t >= HUNT.flyIn + HUNT.settle) startStare(s, rand, w);
      return 'none';
    case 'stare': {
      face(s, w);
      if (hunting(s, w)) return missed(s, w);
      const d = distCm(s, w);
      // A worm crawling off doesn't get the whole stare: after a moment the robin goes after it.
      const fled = d > s.seen + HUNT.creepCm && s.t >= HUNT.react;
      if (s.t < s.stare && !fled) return 'none';
      s.chase = fled;
      // (Underground it walks onto the cut's line first.)
      if (d > HUNT.reachCm * HUNT.lunge || offLineCm(s, w) > LINE_CM) startDash(s, w);
      else if (w.catchable) startStrike(s, w);
      // In reach but out of sight for now (mid-move, up on a rock): it keeps watching.
      else s.seen = d;
      return 'none';
    }
    case 'dash':
      if (slide(s, s.run)) startStare(s, rand, w);
      return 'none';
    case 'strike':
      // A lunge: a step in as it leans, so its bill meets the head.
      if (!slide(s, HUNT.strike)) return 'none';
      if (!w.catchable) return w.wait ? (startStare(s, rand, w), 'none') : missed(s, w);
      if (!s.under) {
        go(s, 'grab');
        return 'grab';
      }
      go(s, 'dig');
      return 'none';
    case 'dig':
      // Scratching and probing above the worm: it can still dig deeper and get away.
      if (!w.catchable) return w.wait ? (startStare(s, rand, w), 'none') : missed(s, w);
      // A worm moving along under it: it shuffles after it, no faster than it runs.
      aimAt(s, w, HUNT.reachCm, HUNT.runSpeed * dt);
      s.x = s.toX;
      s.z = s.toZ;
      face(s, w);
      if (s.t < HUNT.scratch + HUNT.probe) return 'none';
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

/**
 * A stare's checks: the robin hunts the worm where it is now (surface or underground: it keeps
 * after a worm that digs down or comes up), and true when the worm is away for good (a miss).
 */
function hunting(s: HuntState, w: HuntInput): boolean {
  s.under = w.under;
  return !w.catchable && !w.wait;
}

function startStare(s: HuntState, rand: () => number, w: HuntInput): void {
  go(s, 'stare');
  s.stare = HUNT.stareMin + HUNT.stareSpread * rand();
  s.seen = distCm(s, w);
}

function startDash(s: HuntState, w: HuntInput): void {
  // Close in, stopping just within reach: a short run (longer after a worm crawling off), never past the worm.
  const len = aimAt(s, w, HUNT.reachCm * 0.8, s.chase ? HUNT.runCm : HUNT.dashCm);
  s.run = Math.max(HUNT.dashTime, len / HUNT.runSpeed);
  go(s, 'dash');
}

function startStrike(s: HuntState, w: HuntInput): void {
  aimAt(s, w, HUNT.reachCm, Infinity);
  go(s, 'strike');
}

function missed(s: HuntState, w: HuntInput): HuntEvent {
  face(s, w);
  s.struck = s.phase === 'strike' || s.phase === 'dig';
  go(s, 'miss');
  return 'miss';
}
