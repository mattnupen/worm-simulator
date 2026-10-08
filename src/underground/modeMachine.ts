import type { ActionKind } from '../ui/actionPrompt';
import { createPressEdge } from '../input/actionEdge';

/**
 * Surface or underground, and the moves between (V2 spec 4, 10): a small pure state machine.
 * One Action press does what fits (spec 11.8): on the surface where allowed it digs down;
 * underground near the top it comes up; deeper it switches the camera view.
 *
 *   surface --Action, canDig--> diggingDown --(turn and sink; the camera swings at the end)--> underground
 *   underground --Action, nearTop--> comingUp --(rise, then camera)--> surface
 *   underground --Action, deeper--> underground (view switched)
 *
 * The machine owns the press edge (createPressEdge): feed it the held Action level every step
 * (Space or the touch button, Plan A's `touchHeld` included). A press fires once, so holding the
 * button through a move, a pause or a view switch never fires again; the level must go up and
 * down first. A press on a step that ends a move is dropped with the rest of the move's presses.
 * `canDig` must come from `canDigAt(x, z, heading, crawl.body)` (the heading is required there).
 * `nearTop` must be `burrower.nearTop && canEmergeAt(map, head u)` (emergeMap.ts): near the top
 * where the body could not lie out on the surface, Action stays the view switch. On `startDig`
 * and on `startUp`, give the machine the path's length (`setMoveTime(path.seconds)`): a big turn
 * or a long way out takes longer, so no part of the worm outruns the speed caps (bodyPath.ts).
 * Nothing here allocates per step.
 */
export type Mode = 'surface' | 'diggingDown' | 'underground' | 'comingUp';
export type UndergroundView = 'wide' | 'close';
export const DEFAULT_UNDERGROUND_VIEW: UndergroundView = 'wide';

/**
 * Digging down: the camera holds for at least this long while the worm turns and starts to sink...
 * (the worm's own move runs through the whole dig-down, at least SINK_S plus the camera's move)
 */
export const SINK_S = 1.0;
/** ...then swings to side-on for this long, ending with the worm's move (spec 4.1). */
export const SWING_S = 1.5;
/** With reduced motion the swing is a short cross-fade instead. */
export const FADE_S = 0.7;
/** Coming up: the head rises through the cut, then the worm crawls out while the camera swings back. */
export const RISE_S = 1.0;
export const OUT_S = 1.1;
/**
 * Coming up, the worm's own move (rise and crawl out) lasts at least RISE_S + OUT_S. The game sets
 * its real length once the path is built (`setMoveTime(p.seconds)`, which keeps every point under
 * the speed caps); the camera swing then ends with it, and never starts before RISE_S.
 */
const UP_S = RISE_S + OUT_S;

export interface ModeState {
  mode: Mode;
  /** Seconds into the current mode (moves only; 0 while settled). */
  t: number;
  /** The move in progress uses the cross-fade (prefers-reduced-motion, read when it starts). */
  reduced: boolean;
  /**
   * Seconds of the worm's own move in the move in progress: digging down SINK_S plus the camera's
   * move or more (the whole move), coming up UP_S or more.
   */
  moveS: number;
}

export type ModeEvent = 'none' | 'startDig' | 'arrive' | 'startUp' | 'emerge' | 'switchView';

export function createModeState(): ModeState {
  return { mode: 'surface', t: 0, reduced: false, moveS: SINK_S + SWING_S };
}

const camTime = (s: ModeState): number => (s.reduced ? FADE_S : SWING_S);
/**
 * When the camera's move starts. Digging down: so that it ends with the worm's move. Coming up:
 * after the rise, and so that a full swing ends with the worm's move.
 */
const camFrom = (s: ModeState): number =>
  (s.mode === 'diggingDown' ? s.moveS - camTime(s) : Math.max(RISE_S, s.moveS - SWING_S));

/** How long the current move lasts (0 on the surface and underground). */
export function moveDuration(s: ModeState): number {
  if (s.mode === 'diggingDown') return s.moveS;
  if (s.mode === 'comingUp') return Math.max(s.moveS, camFrom(s) + camTime(s));
  return 0;
}

export interface ModeMachine {
  readonly state: ModeState;
  /**
   * One game step. `action`: the held Action level. `canDig`: the surface spot allows digging.
   * `nearTop`: the head is near the top of the litter where it can come out (see above).
   * `reduced`: prefers-reduced-motion now.
   * Presses during a move do nothing. A bad `dt` (negative or not a number) counts as 0.
   */
  step(action: boolean, canDig: boolean, nearTop: boolean, reduced: boolean, dt: number): ModeEvent;
  /**
   * A step that must not act (paused, or another screen): the move's clock stands still, and the
   * Action level is still watched, so a press made meanwhile and held on is not a new press on
   * resuming.
   */
  hold(action: boolean): void;
  /**
   * The worm's own move in progress lasts `seconds`: digging down at least SINK_S plus the camera's
   * move, coming up at least RISE_S + OUT_S. Ignored when settled, or when not a finite number.
   * Call it on the `startDig` or `startUp` step, once the path is built.
   */
  setMoveTime(seconds: number): void;
  /**
   * Back on the surface, settled (the speed test's fresh start). The Action level is still
   * watched as it was, so a press held through the reset does not fire on the next step.
   */
  reset(): void;
}

export function createModeMachine(): ModeMachine {
  const state = createModeState();
  const edge = createPressEdge();
  return {
    state,
    hold(action: boolean): void {
      edge.update(action);
    },
    reset(): void {
      state.mode = 'surface';
      state.t = 0;
      state.reduced = false;
      state.moveS = SINK_S + SWING_S;
    },
    setMoveTime(seconds: number): void {
      if (!Number.isFinite(seconds)) return;
      if (state.mode === 'comingUp') state.moveS = Math.max(UP_S, seconds);
      if (state.mode === 'diggingDown') state.moveS = Math.max(SINK_S + camTime(state), seconds);
    },
    step(action, canDig, nearTop, reduced, dt): ModeEvent {
      const pressed = edge.update(action);
      const s = state;
      switch (s.mode) {
        case 'surface':
          if (!pressed || !canDig) return 'none';
          s.mode = 'diggingDown';
          s.t = 0;
          s.reduced = reduced;
          s.moveS = SINK_S + camTime(s);
          return 'startDig';
        case 'underground':
          if (!pressed) return 'none';
          if (!nearTop) return 'switchView';
          s.mode = 'comingUp';
          s.t = 0;
          s.reduced = reduced;
          s.moveS = UP_S;
          return 'startUp';
        case 'diggingDown':
        case 'comingUp': {
          s.t += dt > 0 ? dt : 0;
          if (s.t < moveDuration(s)) return 'none';
          const down = s.mode === 'diggingDown';
          s.mode = down ? 'underground' : 'surface';
          s.t = 0;
          return down ? 'arrive' : 'emerge';
        }
      }
    },
  };
}

/**
 * Linear 0..1 progress of the worm's own move (sink, or rise then crawl out). It runs 0..1 again for
 * each move, so a consumer must switch on the mode to know which move it is.
 */
export function bodyProgress(s: ModeState): number {
  if (s.mode === 'diggingDown' || s.mode === 'comingUp') return Math.min(1, s.t / s.moveS);
  return s.mode === 'underground' ? 1 : 0;
}

/** Linear 0..1 progress of the camera's move from the surface view (0) to the cut (1). */
export function cameraProgress(s: ModeState): number {
  if (s.mode === 'diggingDown') return Math.max(0, Math.min(1, (s.t - camFrom(s)) / camTime(s)));
  if (s.mode === 'comingUp') return 1 - Math.max(0, Math.min(1, (s.t - camFrom(s)) / camTime(s)));
  return s.mode === 'underground' ? 1 : 0;
}

/**
 * What Action would do now, for the prompt (null: nothing). Underground it names the view the
 * press would switch to.
 */
export function promptKind(s: ModeState, canDig: boolean, nearTop: boolean, view: UndergroundView): ActionKind | null {
  if (s.mode === 'surface') return canDig ? 'digDown' : null;
  if (s.mode !== 'underground') return null;
  if (nearTop) return 'comeUp';
  return view === 'wide' ? 'viewClose' : 'viewWide';
}
