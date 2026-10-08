import type { WaveState } from '../worm/wormShape';
import { WORM_SEGMENTS } from '../game/crawl';
import { createTrail, resetTrail, type BodyTrail } from './bodyTrail';

/** The worm in the cut's plane (moved from burrowMotion.ts, which steps it). */
export interface Burrower {
  /** Body points head first: u along the cut, v world height. */
  readonly u: Float64Array;
  readonly v: Float64Array;
  readonly prevU: Float64Array;
  readonly prevV: Float64Array;
  /** The head's path, which the body follows inside its tunnel (bodyTrail.ts). */
  readonly trail: BodyTrail;
  /** The way the head faces, as an angle in the plane (0 = +u, pi / 2 = up). Unwrapped. */
  dir: number;
  prevDir: number;
  /** Current speed (eased toward `want`, itself eased toward what the soil and the stick allow). */
  speed: number;
  want: number;
  readonly wave: WaveState;
  readonly prevWave: WaveState;
  /** It is eating its way into fresh soil (not moving along an open tunnel). */
  eating: boolean;
  /** How much of the soil just ahead is fresh, eased (0..1): the peristalsis speeds up with it. */
  eat: number;
  /** Distance moved since the last casting. */
  sinceCast: number;
  /** How much farther the latest casting may still be tried (0: it landed, or none is due). */
  castLeft: number;
  /** How much of what it ate lately was leaves (0..1): darker castings. */
  gut: number;
  /** The head is near the litter (Action = Come up). */
  nearTop: boolean;
  /**
   * Seconds the head has tried to move (`tried`: how far its speed would have taken it) and stayed
   * near `stuckU`, `stuckV`, getting nowhere; and whether it is backing up (burrowBack.ts).
   */
  stuck: number;
  tried: number;
  stuckU: number;
  stuckV: number;
  backing: boolean;
  /**
   * Backing stopped with the tail blocked (or at its tunnel's end): it does not start again until
   * the stick stops pointing back (then pointing back again tries again, once stuck).
   */
  backSpent: boolean;
}

export function createBurrower(): Burrower {
  const n = WORM_SEGMENTS;
  return {
    u: new Float64Array(n), v: new Float64Array(n), prevU: new Float64Array(n), prevV: new Float64Array(n), trail: createTrail(n),
    dir: -Math.PI / 2, prevDir: -Math.PI / 2, speed: 0, want: 0,
    wave: { phase: 0, activity: 0 }, prevWave: { phase: 0, activity: 0 },
    eating: false, eat: 0, sinceCast: 0, castLeft: 0, gut: 0.5, nearTop: false, stuck: 0, tried: 0, stuckU: 0, stuckV: 0, backing: false, backSpent: false,
  };
}

/** Puts the body at the given points (head first), facing `dir`, still, with nothing to interpolate; its trail is the body as it lies. */
export function placeBurrower(b: Burrower, us: ArrayLike<number>, vs: ArrayLike<number>, dir: number, wave: WaveState): void {
  for (let i = 0; i < b.u.length; i++) {
    b.u[i] = b.prevU[i] = us[i];
    b.v[i] = b.prevV[i] = vs[i];
  }
  b.dir = b.prevDir = dir;
  b.speed = b.want = 0;
  b.wave.phase = b.prevWave.phase = wave.phase;
  b.wave.activity = b.prevWave.activity = wave.activity;
  b.eating = false;
  b.eat = 0;
  b.sinceCast = 0;
  b.castLeft = 0;
  b.nearTop = false;
  b.stuck = b.tried = 0;
  b.stuckU = us[0];
  b.stuckV = vs[0];
  b.backing = false;
  b.backSpent = false;
  resetTrail(b);
}
