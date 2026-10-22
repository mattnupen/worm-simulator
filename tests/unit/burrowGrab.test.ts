import { describe, expect, it } from 'vitest';
import { makeGame, digDown, run, DT, N, UP } from './burrowPlay';
import {
  createHold, headCatchable, holdFromBelow, holdFromSurface, leaveBelow, poseHeld, releaseHold, setBill, slideEnd, snapHeld,
} from '../../src/underground/burrowGrab';
import { huntFrame } from '../../src/underground/huntFrame';
import { AXIS_UP } from '../../src/underground/bodyPath';
import { B_A, B_F, B_H, B_TOP, boundaryAt, createSlab } from '../../src/underground/slab';
import { cellAt } from '../../src/underground/soilGrid';
import { slabX, slabZ } from '../../src/underground/slab';

describe('the robin can reach the top two layers only (V4 revision 1)', () => {
  it('leaf litter and old leaves: catchable; humus and deeper: safe', () => {
    const s = createSlab(0, 0, 0, 1, 5);
    for (const u of [-3, 0, 2.5]) {
      const top = boundaryAt(s, B_TOP, u);
      const f = boundaryAt(s, B_F, u);
      const h = boundaryAt(s, B_H, u);
      expect(headCatchable(s, u, (top + f) / 2)).toBe(true);
      expect(headCatchable(s, u, (f + h) / 2)).toBe(true);
      expect(headCatchable(s, u, h - 0.05)).toBe(false);
      expect(headCatchable(s, u, boundaryAt(s, B_A, u) - 0.5)).toBe(false);
    }
  });
});

describe('the worm in the robin\'s bill, in the side view', () => {
  it('grabbed on the surface: a burrow at once where it lies, its front up to the bill, the rest down a dug hole', () => {
    const { game } = makeGame();
    const hold = createHold();
    expect(holdFromSurface(game, hold, 1)).toBe(true);
    expect(game.mode.mode).toBe('underground');
    expect(game.slab).not.toBeNull();
    expect(game.stage).toBe(0);
    expect(game.visits).toBe(0);
    const s = game.slab!;
    const top = boundaryAt(s, B_TOP, hold.holeU);
    // The bill 1.2 above the hole, a little behind the cut.
    setBill(hold, s, { x: slabX(s, hold.holeU + 0.5) - s.nx * 0.75, y: top + 1.2 - AXIS_UP, z: slabZ(s, hold.holeU + 0.5) - s.nz * 0.75 });
    snapHeld(game, hold);
    const w = game.worm;
    expect(w.u[0]).toBeCloseTo(hold.holeU + 0.5, 5);
    expect(w.v[0]).toBeCloseTo(top + 1.2, 5);
    expect(game.offW[0]).toBeCloseTo(-0.75, 5);
    // The tail is in the ground, in an open tunnel; nothing to interpolate on the first step.
    expect(w.v[N - 1]).toBeLessThan(top - 0.2);
    expect(game.grid.open[cellAt(game.grid, w.u[N - 1], w.v[N - 1])]).toBe(1);
    expect(Array.from(w.prevU)).toEqual(Array.from(w.u));
    // The bill higher: more of the worm out, the tail higher up its tunnel.
    const tailWas = w.v[N - 1];
    setBill(hold, s, { x: slabX(s, hold.holeU + 0.5), y: top + 2.2 - AXIS_UP, z: slabZ(s, hold.holeU + 0.5) });
    poseHeld(game, hold, DT);
    expect(w.v[N - 1]).toBeGreaterThan(tailWas);
    // Every point keeps the body's spacing along the path.
    for (let i = 1; i < N; i++) expect(Math.hypot(w.u[i] - w.u[i - 1], w.v[i] - w.v[i - 1], game.offW[i] - game.offW[i - 1])).toBeLessThan(0.23);
  });

  it('let go after sliding down its hole: the head below the ground, the burrower has it, in the plane', () => {
    const { game } = makeGame();
    const hold = createHold();
    holdFromSurface(game, hold, -1);
    const s = game.slab!;
    setBill(hold, s, { x: slabX(s, hold.holeU), y: boundaryAt(s, B_TOP, hold.holeU) + 1 - AXIS_UP, z: slabZ(s, hold.holeU) });
    snapHeld(game, hold);
    const end = slideEnd(hold);
    while (hold.slide < end) {
      hold.slide = Math.min(end, hold.slide + 0.1);
      poseHeld(game, hold, DT);
    }
    releaseHold(game);
    const w = game.worm;
    expect(w.v[0]).toBeLessThan(boundaryAt(s, B_TOP, w.u[0]) - 0.3);
    expect(Array.from(game.offW).every((x) => x === 0)).toBe(true);
    // Play goes on underground from there.
    game.step(DT, { x: 0, y: -1 }, false);
    expect(game.mode.mode).toBe('underground');
    expect(w.u.every(Number.isFinite) && w.v.every(Number.isFinite)).toBe(true);
  });

  it('grabbed underground: the front pulled up through the litter, the body following its own tunnel', () => {
    const { game } = makeGame();
    run(game, 0.5, UP);
    digDown(game);
    const hold = createHold();
    const w = game.worm;
    const head = { u: w.u[0], v: w.v[0] };
    holdFromBelow(game, hold);
    const s = game.slab!;
    const top = boundaryAt(s, B_TOP, head.u);
    setBill(hold, s, { x: slabX(s, head.u + 0.4), y: top + 0.8 - AXIS_UP, z: slabZ(s, head.u + 0.4) });
    snapHeld(game, hold);
    expect(w.v[0]).toBeCloseTo(top + 0.8, 5);
    // The peck's hole from the litter's top down to where the head was is open.
    expect(game.grid.open[cellAt(game.grid, head.u, (top + head.v) / 2)]).toBe(1);
  });

  it('back to the surface view for the nest scene, the burrow kept', () => {
    const { game } = makeGame();
    const hold = createHold();
    holdFromSurface(game, hold, 1);
    const b = game.burrow;
    leaveBelow(game);
    expect(game.mode.mode).toBe('surface');
    expect(game.home).toBe(b);
  });
});

describe('the hunt frame (V4 revision 1)', () => {
  it('shows the robin standing above the ground and the head below, the ground low in the middle', () => {
    const s = createSlab(0, 0, 0, 1, 5);
    const top = boundaryAt(s, B_TOP, 2);
    const f = huntFrame(s, { hu: 0, hv: top - 0.5, ru: 2.5, aspect: 16 / 9 }, { cu: 0, cv: 0, h: 0, pitch: 0 });
    // The robin (about 4.5 u tall) fits above the ground; the ground below the frame's middle.
    expect(f.cv + f.h / 2).toBeGreaterThan(top + 4.5);
    expect(f.cv).toBeGreaterThan(top);
    expect(f.cv - f.h / 2).toBeLessThan(top - 1.5);
    // Both in, left of centre (the ring panel is on the right).
    const w = f.h * (16 / 9);
    expect(f.cu - w / 2).toBeLessThan(0 - 1);
    expect(f.cu + w / 2).toBeGreaterThan(2.5 + 1);
    expect(f.cu).toBeGreaterThan(1.25);
  });
});
