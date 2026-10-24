import { describe, expect, it } from 'vitest';
import { makeGame, N } from './burrowPlay';
import { createHold, holdFromSurface, poseHeld, setBill, snapHeld } from '../../src/underground/burrowGrab';
import { sagHeld } from '../../src/underground/holdSag';
import { AXIS_UP } from '../../src/underground/bodyPath';
import { B_TOP, boundaryAt, slabX, slabZ } from '../../src/underground/slab';

describe('the pulled worm meets the ground where it should (V4 revision 4)', () => {
  /** Grabbed on the surface, the bill `along` along the cut from the hole and `up` above the ground. */
  function held(along: number, up: number) {
    const { game } = makeGame();
    const hold = createHold();
    holdFromSurface(game, hold, 1);
    const s = game.slab!;
    const top = boundaryAt(s, B_TOP, hold.holeU);
    setBill(hold, s, { x: slabX(s, hold.holeU + along), y: top + up - AXIS_UP, z: slabZ(s, hold.holeU + along) });
    snapHeld(game, hold);
    return { game, hold, s, top };
  }

  it('the burrow goes almost straight down: the body bends at the hole, the part in the ground stays under it', () => {
    const { game, hold, s, top } = held(1.2, 1.5);
    const w = game.worm;
    for (let i = 0; i < N; i++) {
      if (w.v[i] < top - 0.3) expect(Math.abs(w.u[i] - hold.holeU)).toBeLessThan(0.35);
    }
    // The tail is in the ground, under the hole, not out past it in line with the bill.
    expect(w.v[N - 1]).toBeLessThan(boundaryAt(s, B_TOP, w.u[N - 1]) - 0.5);
  });

  it('slack, the span bows down between the bill and the hole; taut it is straight; never into the ground', () => {
    const { game, hold, s } = held(1.6, 0.8);
    const w = game.worm;
    poseHeld(game, hold, 0);
    const straight = Array.from(w.v);
    const inHole = w.v[N - 1];
    sagHeld(game, hold, 0);
    expect(Array.from(w.v)).toEqual(straight);
    sagHeld(game, hold, 1);
    let bowed = 0;
    for (let i = 0; i < N; i++) {
      bowed = Math.max(bowed, straight[i] - w.v[i]);
      expect(w.v[i]).toBeGreaterThan(Math.min(straight[i], boundaryAt(s, B_TOP, w.u[i])) - 1e-6);
    }
    expect(bowed).toBeGreaterThan(0.05);
    // The part in the hole doesn't move.
    expect(w.v[N - 1]).toBe(inHole);
  });
});
