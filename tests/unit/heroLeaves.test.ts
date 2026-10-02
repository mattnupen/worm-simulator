import { describe, it, expect } from 'vitest';
import {
  createHeroLeaves, setHeroCount, snapshotHeroLeaves, stepHeroLeaves, HERO_MAX, HERO_RADIUS, HERO_RECYCLE,
  type HeroLeaves, type SurfaceFn,
} from '../../src/surface/heroLeaves';

const DT = 1 / 60;
const flat = () => 0.05;
const bumpy = (x: number, z: number) => 0.05 + 0.1 * Math.sin(3 * x) * Math.cos(2 * z);
const NONE = new Float32Array(0);

function fields(p: HeroLeaves): Float32Array[] {
  return [p.x, p.y, p.z, p.yaw, p.flip, p.vx, p.vy, p.vz, p.spin, p.flipRate];
}

function pool(n = HERO_MAX, surface: SurfaceFn = flat): HeroLeaves {
  const p = createHeroLeaves(HERO_MAX, 5);
  setHeroCount(p, n, 0, 0, 0, surface);
  return p;
}

describe('hero leaves', () => {
  it('scatters the active leaves within 3 m of the head, on the litter', () => {
    const p = pool();
    expect(p.count).toBe(HERO_MAX);
    for (let i = 0; i < p.count; i++) {
      expect(Math.hypot(p.x[i], p.z[i])).toBeLessThanOrEqual(HERO_RADIUS + 1e-6);
      expect(p.y[i]).toBeCloseTo(0.05, 6);
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
    const pushers = new Float32Array(16 * 4);
    for (let t = 0; t < 2000; t++) {
      for (let k = 0; k < 16; k++) {
        pushers.set([Math.sin(t * 0.37 + k) * 2.5, Math.cos(t * 0.29 + k * 1.7) * 2.5, 0.14, k === 0 ? 1 : 0.5], k * 4);
      }
      stepHeroLeaves(p, t % 7 === 0 ? 0.1 : DT, pushers, 16, 0, 0, t * 0.01, bumpy);
    }
    for (const f of fields(p)) expect(f.every(Number.isFinite)).toBe(true);
  });

  it('never sinks below the litter surface', () => {
    const p = pool(HERO_MAX, bumpy);
    const pushers = new Float32Array(4);
    for (let t = 0; t < 1500; t++) {
      pushers.set([Math.sin(t * 0.02) * 2, Math.cos(t * 0.02) * 2, 0.14, 1]);
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
      expect(p.y[i]).toBeCloseTo(0.05, 6);
    }
  });

  it('flips over under a strong push from the head', () => {
    const p = createHeroLeaves(1, 5);
    setHeroCount(p, 1, 0, 0, 0, flat);
    p.x[0] = 0;
    p.z[0] = 1;
    p.flip[0] = 0;
    const pushers = new Float32Array(4);
    // The head crawls at 1.6 m/s straight through the leaf.
    for (let t = 0; t < 120; t++) {
      pushers.set([0, -0.5 + 1.6 * t * DT, 0.14, 1]);
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
    const pushers = new Float32Array(4);
    for (let t = 0; t < 300; t++) {
      pushers.set([0, -0.5 + 0.3 * t * DT, 0.14, 0.5]);
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

  it('snapshot copies the current state for interpolation', () => {
    const p = pool(4);
    p.x[2] = 1.25;
    snapshotHeroLeaves(p);
    expect(p.px[2]).toBe(1.25);
  });
});
