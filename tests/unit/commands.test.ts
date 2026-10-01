import { describe, it, expect } from 'vitest';
import { keysToCommands, dragToMove, mergeCommands, NO_COMMANDS } from '../../src/input/commands';

describe('keysToCommands', () => {
  it('maps arrows and WASD: y = forward, x = turn right', () => {
    expect(keysToCommands(new Set(['ArrowUp'])).move).toEqual({ x: 0, y: 1 });
    expect(keysToCommands(new Set(['KeyS'])).move).toEqual({ x: 0, y: -1 });
    expect(keysToCommands(new Set(['KeyA', 'KeyW'])).move).toEqual({ x: -1, y: 1 });
    expect(keysToCommands(new Set(['ArrowRight'])).move).toEqual({ x: 1, y: 0 });
  });
  it('opposite keys cancel', () => {
    expect(keysToCommands(new Set(['ArrowLeft', 'ArrowRight'])).move).toEqual({ x: 0, y: 0 });
  });
  it('maps Space, V and Escape/P', () => {
    const c = keysToCommands(new Set(['Space', 'KeyV', 'Escape']));
    expect(c.action).toBe(true);
    expect(c.wormView).toBe(true);
    expect(c.pause).toBe(true);
    expect(keysToCommands(new Set(['KeyP'])).pause).toBe(true);
  });
  it('no keys gives no commands', () => {
    expect(keysToCommands(new Set())).toEqual(NO_COMMANDS);
  });
});

describe('dragToMove', () => {
  it('drag up is forward', () => {
    expect(dragToMove(0, -60, 60)).toEqual({ x: 0, y: 1 });
  });
  it('clamps to the unit circle', () => {
    const m = dragToMove(300, 0, 60);
    expect(m.x).toBeCloseTo(1);
    expect(m.y).toBeCloseTo(0);
  });
  it('ignores tiny drags (dead zone)', () => {
    expect(dragToMove(3, 3, 60)).toEqual({ x: 0, y: 0 });
  });
});

describe('mergeCommands', () => {
  it('adds moves (clamped) and ORs buttons', () => {
    const a = { ...NO_COMMANDS, move: { x: 1, y: 0 }, action: true };
    const b = { ...NO_COMMANDS, move: { x: 1, y: 1 }, wormView: true };
    const m = mergeCommands(a, b);
    expect(m.move).toEqual({ x: 1, y: 1 });
    expect(m.action).toBe(true);
    expect(m.wormView).toBe(true);
    expect(m.pause).toBe(false);
  });
});
