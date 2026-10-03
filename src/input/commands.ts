import type { Vec2 } from '../core/vec';

/** Everything gameplay is allowed to know about input. move.y = forward, move.x = turn right. action/wormView/pause are held levels, not presses; consumers do their own edge detection. */
export interface Commands { move: Vec2; action: boolean; wormView: boolean; pause: boolean }

export const NO_COMMANDS: Commands = Object.freeze({
  move: Object.freeze({ x: 0, y: 0 }),
  action: false,
  wormView: false,
  pause: false,
}) as Commands;

const DEAD_ZONE = 0.12;

export function keysToCommands(down: ReadonlySet<string>): Commands {
  const has = (...codes: string[]) => codes.some((c) => down.has(c));
  const x = (has('ArrowRight', 'KeyD') ? 1 : 0) - (has('ArrowLeft', 'KeyA') ? 1 : 0);
  const y = (has('ArrowUp', 'KeyW') ? 1 : 0) - (has('ArrowDown', 'KeyS') ? 1 : 0);
  return {
    move: { x, y },
    action: has('Space'),
    wormView: has('KeyV'),
    pause: has('Escape', 'KeyP'),
  };
}

/**
 * Same as keysToCommands, but fills `out` (move included) and returns it, allocating nothing:
 * for the per-step path, where a new object every 60 Hz step would add garbage-collector work.
 */
export function keysToCommandsInto(down: ReadonlySet<string>, out: Commands): Commands {
  const right = down.has('ArrowRight') || down.has('KeyD') ? 1 : 0;
  const left = down.has('ArrowLeft') || down.has('KeyA') ? 1 : 0;
  const up = down.has('ArrowUp') || down.has('KeyW') ? 1 : 0;
  const downward = down.has('ArrowDown') || down.has('KeyS') ? 1 : 0;
  out.move.x = right - left;
  out.move.y = up - downward;
  out.action = down.has('Space');
  out.wormView = down.has('KeyV');
  out.pause = down.has('Escape') || down.has('KeyP');
  return out;
}

/** Converts a drag offset in screen pixels (y down) into a move vector (y forward). */
export function dragToMove(dx: number, dy: number, radius: number): Vec2 {
  let x = dx / radius;
  let y = -dy / radius;
  const m = Math.hypot(x, y);
  if (m < DEAD_ZONE) return { x: 0, y: 0 };
  const k = Math.min(m, 1);
  const scaled = (k - DEAD_ZONE) / (1 - DEAD_ZONE);
  x = (x / m) * scaled;
  y = (y / m) * scaled;
  return { x: x + 0, y: y + 0 }; // + 0 turns -0 into 0
}

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

export function mergeCommands(a: Commands, b: Commands): Commands {
  return {
    move: { x: clamp1(a.move.x + b.move.x), y: clamp1(a.move.y + b.move.y) },
    action: a.action || b.action,
    wormView: a.wormView || b.wormView,
    pause: a.pause || b.pause,
  };
}

/** Same as mergeCommands, but fills `out` (move included) and returns it, allocating nothing. `out` may be `a` or `b`. */
export function mergeCommandsInto(a: Commands, b: Commands, out: Commands): Commands {
  const x = clamp1(a.move.x + b.move.x);
  const y = clamp1(a.move.y + b.move.y);
  out.move.x = x;
  out.move.y = y;
  out.action = a.action || b.action;
  out.wormView = a.wormView || b.wormView;
  out.pause = a.pause || b.pause;
  return out;
}
