import { describe, it, expect, afterAll } from 'vitest';
import {
  clearHeroLeaves, createHeroLeaves, setHeroCount, settleHeroLeaves, snapshotHeroLeaves, stepHeroLeaves,
  HERO_MAX, HERO_RADIUS, HERO_RECYCLE, HERO_Y_BIAS, PUSHER_STRIDE,
  type HeroLeaves, type SurfaceFn,
} from '../../src/surface/heroLeaves';
import { PLAY_HALF } from '../../src/surface/terrain';
import { DEFAULT_SCALE, setScale } from '../../src/surface/worldScale';

// Hero-leaf physics at Classic's layout: the spots below are chosen clear of its props.
// (Set at load: some describe blocks build meshes as they are collected.)
setScale('classic');
afterAll(() => { setScale(DEFAULT_SCALE); });

const DT = 1 / 60;
const flat = () => 0.05;
const bumpy = (x: number, z: number) => 0.05 + 0.1 * Math.sin(3 * x) * Math.cos(2 * z);
const NONE = new Float32Array(0);
/** Worm top surface used in the tests: 0.15 m over the 0.05 m litter. */
const TOP = 0.2;
const bias = (i: number) => i * HERO_Y_BIAS;

/**
 * Packs one pusher: [x, z, radius, strength, top, under, belly] (fall 0: a flat-topped dome).
 * Under the litter (under > 0.5) its belly lies below the 0.05 m litter top; riding on it, above.
 */
function push(
  buf: Float32Array, k: number, x: number, z: number, strength: number, under: number, top = TOP,
  belly = under > 0.5 ? 0.03 : 0.07,
): void {
  buf.set([x, z, 0.14, strength, top, under, belly], k * PUSHER_STRIDE);
}

function fields(p: HeroLeaves): Float32Array[] {
  return [p.x, p.y, p.z, p.yaw, p.flip, p.vx, p.vy, p.vz, p.spin, p.flipRate];
}

function pool(n = HERO_MAX, surface: SurfaceFn = flat): HeroLeaves {
  const p = createHeroLeaves(HERO_MAX, 5);
  setHeroCount(p, n, 0, 0, 0, surface);
  return p;
}

/** Height of leaf i's plane (its base, tilted by its pitch) above the point (x, z). */
function planeAt(p: HeroLeaves, i: number, x: number, z: number): number {
  const d = (x - p.x[i]) * Math.sin(p.pitchDir[i]) + (z - p.z[i]) * Math.cos(p.pitchDir[i]);
  return p.y[i] - d * Math.tan(p.pitch[i]);
}

describe('hero leaves', () => {
  it('scatters the active leaves within 3 m of the head, on the litter', () => {
    const p = pool();
    expect(p.count).toBe(HERO_MAX);
    for (let i = 0; i < p.count; i++) {
      expect(Math.hypot(p.x[i], p.z[i])).toBeLessThanOrEqual(HERO_RADIUS + 1e-6);
      expect(p.y[i]).toBeCloseTo(0.05 + bias(i), 6);
    }
  });

  it('setHeroCount clamps to the pool and keeps existing leaves where they are', () => {
    const p = pool(12);
    const x0 = p.x[3];
    setHeroCount(p, 24, 0, 0, 0, flat);
    expect(p.count).toBe(24);
    expect(p.x[3]).toBe(x0);
    setHeroCount(p, 999, 0, 0, 0, flat);
    expect(p.count).toBe(HERO_MAX);
    setHeroCount(p, 0, 0, 0, 0, flat);
    expect(p.count).toBe(0);
  });

  it('is deterministic', () => {
    const a = pool();
    const b = pool();
    expect(Array.from(a.x)).toEqual(Array.from(b.x));
  });

  it('stays finite under wild pushes and big steps', () => {
    const p = pool(HERO_MAX, bumpy);
    const pushers = new Float32Array(16 * PUSHER_STRIDE);
    for (let t = 0; t < 2000; t++) {
      for (let k = 0; k < 16; k++) {
        push(pushers, k, Math.sin(t * 0.37 + k) * 2.5, Math.cos(t * 0.29 + k * 1.7) * 2.5, k === 0 ? 1 : 0.5, (k % 3) / 2);
      }
      stepHeroLeaves(p, t % 7 === 0 ? 0.1 : DT, pushers, 16, 0, 0, t * 0.01, bumpy);
    }
    for (const f of fields(p)) expect(f.every(Number.isFinite)).toBe(true);
  });

  it('never sinks below the litter surface', () => {
    const p = pool(HERO_MAX, bumpy);
    const pushers = new Float32Array(PUSHER_STRIDE);
    for (let t = 0; t < 1500; t++) {
      push(pushers, 0, Math.sin(t * 0.02) * 2, Math.cos(t * 0.02) * 2, 1, 0);
      stepHeroLeaves(p, DT, pushers, 1, 0, 0, 0, bumpy);
      for (let i = 0; i < p.count; i++) expect(p.y[i]).toBeGreaterThanOrEqual(bumpy(p.x[i], p.z[i]) - 1e-6);
    }
  });

  it('comes to rest: still, flat, face up or face down', () => {
    const p = pool();
    for (let i = 0; i < p.count; i++) {
      p.vx[i] = Math.sin(i) * 2;
      p.vz[i] = Math.cos(i) * 2;
      p.spin[i] = 3;
      p.flipRate[i] = i % 2 ? 4 : -4;
      p.vy[i] = 1;
    }
    for (let t = 0; t < 600; t++) stepHeroLeaves(p, DT, NONE, 0, 0, 0, 0, flat);
    for (let i = 0; i < p.count; i++) {
      expect(p.vx[i]).toBe(0);
      expect(p.vz[i]).toBe(0);
      expect(p.vy[i]).toBe(0);
      expect(p.spin[i]).toBe(0);
      expect(p.flipRate[i]).toBe(0);
      expect(Math.abs(Math.cos(p.flip[i]))).toBeCloseTo(1, 9);
      expect(p.y[i]).toBeCloseTo(0.05 + bias(i), 6);
    }
  });

  it('flips over under a strong push from the head', () => {
    const p = createHeroLeaves(1, 5);
    setHeroCount(p, 1, 0, 0, 0, flat);
    p.x[0] = 0;
    p.z[0] = 1;
    p.flip[0] = 0;
    const pushers = new Float32Array(PUSHER_STRIDE);
    // The head crawls at 1.6 m/s straight through the leaf.
    for (let t = 0; t < 120; t++) {
      push(pushers, 0, 0, -0.5 + 1.6 * t * DT, 1, 0);
      stepHeroLeaves(p, DT, pushers, 1, 0, 0, 0, flat);
    }
    for (let t = 0; t < 300; t++) stepHeroLeaves(p, DT, NONE, 0, 0, 0, 0, flat);
    expect(Math.cos(p.flip[0])).toBeCloseTo(-1, 6);
  });

  it('a gentle body push slides a leaf without flipping it', () => {
    const p = createHeroLeaves(1, 5);
    setHeroCount(p, 1, 0, 0, 0, flat);
    p.x[0] = 0;
    p.z[0] = 1;
    p.flip[0] = 0;
    const pushers = new Float32Array(PUSHER_STRIDE);
    for (let t = 0; t < 300; t++) {
      push(pushers, 0, 0, -0.5 + 0.3 * t * DT, 0.5, 0);
      stepHeroLeaves(p, DT, pushers, 1, 0, 0, 0, flat);
    }
    for (let t = 0; t < 300; t++) stepHeroLeaves(p, DT, NONE, 0, 0, 0, 0, flat);
    expect(Math.cos(p.flip[0])).toBeCloseTo(1, 6);
    expect(p.z[0]).toBeGreaterThan(1);
  });

  it('recycles a leaf more than 4 m away to a free spot ahead of the worm', () => {
    const p = pool();
    // The worm is now 10 m away, heading +x.
    stepHeroLeaves(p, DT, NONE, 0, 10, 0, Math.PI / 2, flat);
    for (let i = 0; i < p.count; i++) {
      const dx = p.x[i] - 10;
      const dz = p.z[i];
      expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(HERO_RECYCLE);
      expect(dx).toBeGreaterThan(0);
      expect(p.vx[i]).toBe(0);
      // Recycled leaves do not streak across the screen: the previous step is the new spot.
      expect(p.px[i]).toBe(p.x[i]);
    }
  });

  it('at the world\'s edge, a recycled leaf lands clear of the body (not on it, where the spots ahead are clamped)', () => {
    const p = pool();
    // The worm crawls along the edge (z = PLAY_HALF) heading +z, into it: every spot ahead clamps
    // back onto the body. 16 body points trail behind the head along the edge.
    const pushers = new Float32Array(16 * PUSHER_STRIDE);
    for (let k = 0; k < 16; k++) push(pushers, k, 0, PLAY_HALF - 0.11 * k, k === 0 ? 1 : 0.5, 1);
    stepHeroLeaves(p, DT, pushers, 16, 0, PLAY_HALF, 0, flat);
    for (let i = 0; i < p.count; i++) {
      for (let k = 0; k < 16; k++) {
        const d = Math.hypot(p.x[i] - pushers[k * PUSHER_STRIDE], p.z[i] - pushers[k * PUSHER_STRIDE + 1]);
        expect(d).toBeGreaterThan(0.14 + p.size[i] * 0.3);
      }
    }
  });

  it('snapshot copies the current state for interpolation', () => {
    const p = pool(4);
    p.x[2] = 1.25;
    snapshotHeroLeaves(p);
    expect(p.px[2]).toBe(1.25);
  });

  it('the head flips a leaf even when the worm is under the litter', () => {
    const p = createHeroLeaves(1, 5);
    setHeroCount(p, 1, 0, 0, 0, flat);
    p.x[0] = 0;
    p.z[0] = 1;
    p.flip[0] = 0;
    const pushers = new Float32Array(PUSHER_STRIDE);
    for (let t = 0; t < 120; t++) {
      push(pushers, 0, 0, -0.5 + 1.6 * t * DT, 1, 1);
      stepHeroLeaves(p, DT, pushers, 1, 0, 0, 0, flat);
    }
    for (let t = 0; t < 300; t++) stepHeroLeaves(p, DT, NONE, 0, 0, 0, 0, flat);
    expect(Math.cos(p.flip[0])).toBeCloseTo(-1, 6);
  });

  it('a worm crawling under the litter passes beneath a leaf: it is lifted over the body, not shoved into a halo', () => {
    const p = createHeroLeaves(1, 5);
    setHeroCount(p, 1, 0, 0, 0, flat);
    p.x[0] = 0;
    p.z[0] = 1;
    p.flip[0] = 0;
    const pushers = new Float32Array(PUSHER_STRIDE);
    let overlaps = 0;
    let maxPitch = 0;
    for (let t = 0; t < 400; t++) {
      const wz = -0.5 + 0.5 * t * DT;
      push(pushers, 0, 0, wz, 0.5, 1);
      stepHeroLeaves(p, DT, pushers, 1, 0, 0, 0, flat);
      expect(Number.isFinite(p.y[0]) && Number.isFinite(p.pitch[0])).toBe(true);
      if (Math.hypot(p.x[0], p.z[0] - wz) < 0.14) {
        overlaps++;
        // Its plane, where it passes over the body point, clears the top.
        expect(planeAt(p, 0, 0, wz)).toBeGreaterThanOrEqual(TOP + 0.005);
      }
      maxPitch = Math.max(maxPitch, p.pitch[0]);
    }
    expect(overlaps).toBeGreaterThan(20);
    // Not shoved aside, and tilted to sit across the body while lifted.
    expect(Math.abs(p.x[0])).toBeLessThan(1e-4);
    expect(Math.abs(p.z[0] - 1)).toBeLessThan(1e-4);
    expect(maxPitch).toBeGreaterThan(0.1);
    // Once the worm has passed it settles back down, flat and face up.
    for (let t = 0; t < 200; t++) stepHeroLeaves(p, DT, NONE, 0, 0, 0, 0, flat);
    expect(p.y[0]).toBeCloseTo(0.05, 3);
    expect(p.pitch[0]).toBeCloseTo(0, 3);
    expect(Math.cos(p.flip[0])).toBeCloseTo(1, 6);
  });

  it('a worm riding on top shoves a leaf aside and never lifts it', () => {
    const p = createHeroLeaves(1, 5);
    setHeroCount(p, 1, 0, 0, 0, flat);
    p.x[0] = 0;
    p.z[0] = 1;
    p.flip[0] = 0;
    const pushers = new Float32Array(PUSHER_STRIDE);
    for (let t = 0; t < 400; t++) {
      push(pushers, 0, 0, -0.5 + 0.5 * t * DT, 0.5, 0);
      stepHeroLeaves(p, DT, pushers, 1, 0, 0, 0, flat);
      expect(p.y[0]).toBeCloseTo(0.05, 6);
    }
    expect(p.z[0]).toBeGreaterThan(1.2);
    expect(Math.cos(p.flip[0])).toBeCloseTo(1, 6);
  });

  it('half under the litter (belly below the leaf): shoved out from under the body, held up over it while it reaches it', () => {
    const p = createHeroLeaves(1, 5);
    setHeroCount(p, 1, 0, 0, 0, flat);
    p.x[0] = 0;
    p.z[0] = 1;
    const pushers = new Float32Array(PUSHER_STRIDE);
    let held = 0;
    for (let t = 0; t < 60; t++) {
      // The body point creeps after the leaf, so its rim keeps reaching it.
      const wz = 1 + 1.4 * t * DT;
      push(pushers, 0, 0, wz, 0.5, 0.5, TOP, 0.03);
      stepHeroLeaves(p, DT, pushers, 1, 0, 0, 0, flat);
      if (p.lift[0] > 0) held++;
      // Never pressed under it: the worm is beneath the leaf here.
      expect(p.flat[0]).toBe(0);
    }
    expect(held).toBeGreaterThan(0);
    expect(Math.hypot(p.x[0], p.z[0] - 1)).toBeGreaterThan(0.1);
  });

  it('a body riding over a leaf presses it flat before it reaches it, and it springs back after', () => {
    const p = createHeroLeaves(1, 5);
    setHeroCount(p, 1, 0, 0, 0, flat);
    p.x[0] = 0;
    p.z[0] = 1;
    const pushers = new Float32Array(PUSHER_STRIDE);
    // A riding body point passes 0.3 m to the side: close enough for the leaf's rim to reach it.
    let pressed = false;
    for (let t = 0; t < 240; t++) {
      const wz = -1 + t * DT * 1.5;
      push(pushers, 0, 0.3, wz, 0.5, 0);
      stepHeroLeaves(p, DT, pushers, 1, 0, 0, 0, flat);
      const reach = Math.hypot(p.x[0] - 0.3, p.z[0] - wz) < 0.14 + p.size[0] * 0.5;
      if (reach) {
        pressed = true;
        expect(p.flat[0]).toBe(1);
      }
      expect(p.lift[0]).toBe(0);
    }
    expect(pressed).toBe(true);
    for (let t = 0; t < 180; t++) stepHeroLeaves(p, DT, NONE, 0, 0, 0, 0, flat);
    expect(p.flat[0]).toBeLessThan(0.01);
  });

  it('a leaf placed on the body goes over it at once, with no step to interpolate through it', () => {
    const p = createHeroLeaves(1, 5);
    setHeroCount(p, 1, 0, 0, 0, flat);
    const pushers = new Float32Array(PUSHER_STRIDE);
    push(pushers, 0, p.x[0], p.z[0], 0.5, 1);
    settleHeroLeaves(p, 0, pushers, 1);
    expect(p.lift[0]).toBeGreaterThan(TOP - 0.05);
    expect(p.py[0]).toBe(p.y[0]);
    expect(p.ppitch[0]).toBe(p.pitch[0]);
    expect(planeAt(p, 0, p.x[0], p.z[0])).toBeGreaterThanOrEqual(TOP + 0.005);
  });

  it('recycles a leaf pinned against the body (tight coils) for more than 2 s', () => {
    const p = createHeroLeaves(1, 5);
    setHeroCount(p, 1, 0, 0, 0, flat);
    p.x[0] = 0;
    p.z[0] = 1;
    const pushers = new Float32Array(PUSHER_STRIDE);
    const spawned = p.spawned;
    // The body riding on the litter keeps pressing into the leaf's side, wherever it goes.
    const pin = (steps: number) => {
      for (let t = 0; t < steps; t++) {
        push(pushers, 0, p.x[0] - 0.2, p.z[0], 0.5, 0);
        // The head stays near, so the leaf is never recycled for distance.
        stepHeroLeaves(p, DT, pushers, 1, p.x[0], p.z[0], 0, flat);
      }
    };
    pin(110);
    expect(p.spawned).toBe(spawned);
    pin(40);
    expect(p.spawned).toBeGreaterThan(spawned);
  });

  it('recycling never lands outside the playable world', () => {
    const p = pool();
    // The head is at the east edge, heading east: "ahead" would be outside.
    stepHeroLeaves(p, DT, NONE, 0, PLAY_HALF - 0.5, 0, Math.PI / 2, flat);
    for (let i = 0; i < p.count; i++) {
      expect(Math.abs(p.x[i])).toBeLessThanOrEqual(PLAY_HALF);
      expect(Math.abs(p.z[i])).toBeLessThanOrEqual(PLAY_HALF);
    }
  });

  it('each slot sits a hair higher than the last, so overlapping leaves never z-fight', () => {
    const p = pool();
    for (let i = 1; i < p.count; i++) expect(p.y[i]).toBeGreaterThan(p.y[i - 1]);
  });

  it('ignores a non-finite or oversized step and a NaN count', () => {
    const p = pool(8);
    const before = Array.from(p.x);
    stepHeroLeaves(p, Infinity, NONE, 0, 50, 50, 0, flat);
    stepHeroLeaves(p, NaN, NONE, 0, 50, 50, 0, flat);
    expect(Array.from(p.x)).toEqual(before);
    setHeroCount(p, NaN, 0, 0, 0, flat);
    expect(p.count).toBe(8);
  });

  it('a NaN surface at respawn falls back to a finite height', () => {
    const p = createHeroLeaves(4, 5);
    setHeroCount(p, 4, 0, 0, 0, () => NaN);
    for (let i = 0; i < 4; i++) expect(Number.isFinite(p.y[i])).toBe(true);
    stepHeroLeaves(p, DT, NONE, 0, 0, 0, 0, () => NaN);
    for (const f of fields(p)) expect(f.every(Number.isFinite)).toBe(true);
  });

  it('comes to rest with big steps too (dt 0.1 and 0.25)', () => {
    for (const dt of [0.1, 0.25]) {
      const p = pool();
      for (let i = 0; i < p.count; i++) {
        p.vx[i] = Math.sin(i) * 2;
        p.vz[i] = Math.cos(i) * 2;
        p.spin[i] = 3;
        p.flipRate[i] = i % 2 ? 4 : -4;
        p.vy[i] = 1;
      }
      for (let t = 0; t < 200; t++) stepHeroLeaves(p, dt, NONE, 0, 0, 0, 0, flat);
      for (let i = 0; i < p.count; i++) {
        expect(p.flipRate[i]).toBe(0);
        expect(Math.abs(Math.cos(p.flip[i]))).toBeCloseTo(1, 9);
        expect(p.y[i]).toBeCloseTo(0.05 + bias(i), 6);
      }
    }
  });
});

describe('clearHeroLeaves', () => {
  it('empties the pool back to exactly how createHeroLeaves made it', () => {
    const p = pool(HERO_MAX, bumpy);
    const body = new Float32Array(PUSHER_STRIDE);
    push(body, 0, 0.3, 0.3, 1, 0);
    for (let i = 0; i < 240; i++) {
      push(body, 0, 0.3 + i * 0.02, 0.3, 1, 0);
      stepHeroLeaves(p, DT, body, 1, 0.3 + i * 0.02, 0.3, Math.PI / 2, bumpy);
    }
    expect(p.spawned).toBeGreaterThan(0);
    clearHeroLeaves(p);
    expect(p).toEqual(createHeroLeaves(HERO_MAX, 5));
  });
});
