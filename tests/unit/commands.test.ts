import { describe, it, expect } from 'vitest';
import {
  keysToCommands, keysToCommandsInto, dragToMove, mergeCommands, mergeCommandsInto, NO_COMMANDS,
  type Commands,
} from '../../src/input/commands';

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
  it('ramps smoothly from the dead zone edge', () => {
    const m = dragToMove(0, -0.13 * 60, 60);
    expect(m.y).toBeGreaterThan(0);
    expect(m.y).toBeLessThan(0.05);
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

const fresh = (): Commands => ({ move: { x: 9, y: 9 }, action: true, wormView: true, pause: true });

describe('keysToCommandsInto', () => {
  it('matches keysToCommands for every key combination, overwriting what was there', () => {
    const codes = ['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS', 'ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD', 'Space', 'KeyV', 'Escape', 'KeyP'];
    const out = fresh();
    for (let mask = 0; mask < 1 << codes.length; mask += 7) {
      const down = new Set(codes.filter((_, i) => mask & (1 << i)));
      expect(keysToCommandsInto(down, out)).toBe(out);
      expect(out).toEqual(keysToCommands(down));
    }
    keysToCommandsInto(new Set(), out);
    expect(out).toEqual(NO_COMMANDS);
  });
  it('writes into the same move object each time', () => {
    const out = fresh();
    const move = out.move;
    keysToCommandsInto(new Set(['ArrowUp']), out);
    expect(out.move).toBe(move);
    expect(move).toEqual({ x: 0, y: 1 });
  });
});

describe('mergeCommandsInto', () => {
  it('matches mergeCommands, clamping and ORing', () => {
    const a = { ...NO_COMMANDS, move: { x: 1, y: -0.5 }, action: true };
    const b = { ...NO_COMMANDS, move: { x: 0.5, y: -1 }, pause: true };
    const out = fresh();
    expect(mergeCommandsInto(a, b, out)).toBe(out);
    expect(out).toEqual(mergeCommands(a, b));
    expect(out.move).toEqual({ x: 1, y: -1 });
    expect(out.wormView).toBe(false);
  });
  it('is safe when the output is one of the inputs', () => {
    const a: Commands = { move: { x: 0.75, y: 0.25 }, action: false, wormView: true, pause: false };
    const b: Commands = { move: { x: 0.5, y: 1 }, action: true, wormView: false, pause: false };
    const expected = mergeCommands(a, b);
    mergeCommandsInto(a, b, a);
    expect(a).toEqual(expected);
  });
  it('does not touch its inputs when the output is separate', () => {
    const a = { ...NO_COMMANDS, move: { x: 1, y: 0 } };
    const b = { ...NO_COMMANDS, move: { x: 1, y: 1 } };
    mergeCommandsInto(a, b, fresh());
    expect(a.move).toEqual({ x: 1, y: 0 });
    expect(b.move).toEqual({ x: 1, y: 1 });
  });
});
