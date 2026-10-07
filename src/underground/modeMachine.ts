import type { ActionKind } from '../ui/actionPrompt';
import { createPressEdge } from '../input/actionEdge';

/**
 * Surface or underground, and the moves between (V2 spec 4, 10): a small pure state machine.
 * One Action press does what fits (spec 11.8): on the surface where allowed it digs down;
 * underground near the top it comes up; deeper it switches the camera view.
 *
 *   surface --Action, canDig--> diggingDown --(sink, then camera)--> underground
 *   underground --Action, nearTop--> comingUp --(rise, then camera)--> surface
 *   underground --Action, deeper--> underground (view switched)
 *
 * The machine owns the press edge (createPressEdge): feed it the held Action level every step
 * (Space or the touch button, Plan A's `touchHeld` included). A press fires once, so holding the
 * button through a move, a pause or a view switch never fires again; the level must go up and
 * down first. A press on a step that ends a move is dropped with the rest of the move's presses.
 * `canDig` must come from `canDigAt(x, z, heading)` (the heading is required there); `nearTop`
 * from the burrower. Nothing here allocates per step.
 */
export type Mode = 'surface' | 'diggingDown' | 'underground' | 'comingUp';
export type UndergroundView = 'wide' | 'close';
export const DEFAULT_UNDERGROUND_VIEW: UndergroundView = 'wide';

/** Digging down: the head turns down and the front sinks for this long... */
export const SINK_S = 1.0;
/** ...then the camera swings to side-on for this long (spec 4.1). */
export const SWING_S = 1.5;
/** With reduced motion the swing is a short cross-fade instead. */
export const FADE_S = 0.7;
/** Coming up: the head rises through the cut, then the worm crawls out while the camera swings back. */
export const RISE_S = 1.0;
export const OUT_S = 1.1;

export interface ModeState {
  mode: Mode;
  /** Seconds into the current mode (moves only; 0 while settled). */
  t: number;
  /** The move in progress uses the cross-fade (prefers-reduced-motion, read when it starts). */
  reduced: boolean;
}

export type ModeEvent = 'none' | 'startDig' | 'arrive' | 'startUp' | 'emerge' | 'switchView';

export function createModeState(): ModeState {
  return { mode: 'surface', t: 0, reduced: false };
}

const camTime = (s: ModeState): number => (s.reduced ? FADE_S : SWING_S);

/** How long the current move lasts (0 on the surface and underground). */
export function moveDuration(s: ModeState): number {
  if (s.mode === 'diggingDown') return SINK_S + camTime(s);
  if (s.mode === 'comingUp') return RISE_S + Math.max(OUT_S, camTime(s));
  return 0;
}

export interface ModeMachine {
  readonly state: ModeState;
  /**
   * One game step. `action`: the held Action level. `canDig`: the surface spot allows digging.
   * `nearTop`: the head is near the top of the litter. `reduced`: prefers-reduced-motion now.
   * Presses during a move do nothing. A bad `dt` (negative or not a number) counts as 0.
   */
  step(action: boolean, canDig: boolean, nearTop: boolean, reduced: boolean, dt: number): ModeEvent;
  /**
   * A step that must not act (paused, or another screen): the move's clock stands still, and the
   * Action level is still watched, so a press made meanwhile and held on is not a new press on
   * resuming.
   */
  hold(action: boolean): void;
}

export function createModeMachine(): ModeMachine {
  const state = createModeState();
  const edge = createPressEdge();
  return {
    state,
    hold(action: boolean): void {
      edge.update(action);
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
          return 'startDig';
        case 'underground':
          if (!pressed) return 'none';
          if (!nearTop) return 'switchView';
          s.mode = 'comingUp';
          s.t = 0;
          s.reduced = reduced;
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

/** Linear 0..1 progress of the worm's own move (sink, or rise then crawl out). */
export function bodyProgress(s: ModeState): number {
  if (s.mode === 'diggingDown') return Math.min(1, s.t / SINK_S);
  if (s.mode === 'comingUp') return Math.min(1, s.t / (RISE_S + OUT_S));
  return s.mode === 'underground' ? 1 : 0;
}

/** Linear 0..1 progress of the camera's move from the surface view (0) to the cut (1). */
export function cameraProgress(s: ModeState): number {
  if (s.mode === 'diggingDown') return Math.max(0, Math.min(1, (s.t - SINK_S) / camTime(s)));
  if (s.mode === 'comingUp') return 1 - Math.max(0, Math.min(1, (s.t - RISE_S) / camTime(s)));
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
