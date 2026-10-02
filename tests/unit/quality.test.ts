import { describe, it, expect } from 'vitest';
import { QualityController, TIERS } from '../../src/render/quality';

describe('TIERS', () => {
  it('degrade in spec order: resolution, then rim, then leaves', () => {
    expect(TIERS[0]).toEqual({ resolutionScale: 1, rimLight: true, leafDensity: 1 });
    expect(TIERS[1].resolutionScale).toBeLessThan(1);
    expect(TIERS[1].rimLight).toBe(true);
    expect(TIERS[2].rimLight).toBe(false);
    expect(TIERS[2].leafDensity).toBe(1);
    expect(TIERS[3].leafDensity).toBeLessThan(1);
  });
});

describe('QualityController', () => {
  it('stays at tier 0 when fps holds 30', () => {
    const q = new QualityController();
    for (let t = 0; t < 10_000; t += 100) expect(q.update(t, 30)).toBe(false);
    expect(q.tier).toBe(0);
  });

  it('drops one tier after fps stays low for 2 s', () => {
    const q = new QualityController();
    q.update(0, 20);
    expect(q.update(1900, 20)).toBe(false);
    expect(q.update(2000, 20)).toBe(true);
    expect(q.tier).toBe(1);
  });

  it('waits a 3 s cooldown before dropping again', () => {
    const q = new QualityController();
    q.update(0, 20);
    q.update(2000, 20); // tier 1
    q.update(2100, 20);
    expect(q.update(4500, 20)).toBe(false);
    expect(q.tier).toBe(1);
  });

  it('a good second resets the low-fps timer', () => {
    const q = new QualityController();
    q.update(0, 20);
    q.update(1500, 30);
    q.update(1600, 20);
    expect(q.update(3000, 20)).toBe(false);
    expect(q.tier).toBe(0);
  });

  it('never goes past the last tier, and reset() returns to 0', () => {
    const q = new QualityController();
    for (let t = 0; t < 60_000; t += 100) q.update(t, 5);
    expect(q.tier).toBe(TIERS.length - 1);
    q.reset();
    expect(q.tier).toBe(0);
  });

  it('interrupt() forgets a low-fps streak but keeps the tier', () => {
    const q = new QualityController();
    q.update(0, 20);
    q.update(1500, 20);
    q.interrupt();
    expect(q.update(2500, 20)).toBe(false);
    expect(q.tier).toBe(0);
  });
});

describe('QualityController levels', () => {
  it('stops at levels - 1 when given fewer levels than TIERS', () => {
    const q = new QualityController(30, 2000, 3000, 2);
    for (let t = 0; t < 60_000; t += 100) q.update(t, 5);
    expect(q.tier).toBe(1);
  });
  it('with one level never changes', () => {
    const q = new QualityController(30, 2000, 3000, 1);
    for (let t = 0; t < 10_000; t += 100) expect(q.update(t, 5)).toBe(false);
    expect(q.tier).toBe(0);
  });
});
