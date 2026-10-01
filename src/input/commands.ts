import type { Vec2 } from '../core/vec';

/** Everything gameplay is allowed to know about input. move.y = forward, move.x = turn right. */
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

/** Converts a drag offset in screen pixels (y down) into a move vector (y forward). */
export function dragToMove(dx: number, dy: number, radius: number): Vec2 {
  let x = dx / radius;
  let y = -dy / radius;
  const m = Math.hypot(x, y);
  if (m < DEAD_ZONE) return { x: 0, y: 0 };
  if (m > 1) {
    x /= m;
    y /= m;
  }
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
