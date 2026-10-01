import { describe, it, expect } from 'vitest';
import { buildLeafLitter } from '../../src/surface/leafLitterMesh';
import { buildGroundProps } from '../../src/surface/groundProps';
import { buildFallingLeaves, FALLING_COUNT } from '../../src/surface/fallingLeaves';
import { buildScene } from '../../src/spike/scene';

describe('leaf litter (merged)', () => {
  const litter = buildLeafLitter(2000);
  const g = litter.mesh.geometry;
  const full = g.index!.count;

  it('is one mesh with a sane vertex budget', () => {
    expect(g.getAttribute('position').count).toBeLessThanOrEqual(60000);
    expect(full / 3).toBeLessThanOrEqual(60000);
  });
  it('trims to a whole-leaf prefix with the density tiers', () => {
    litter.setDensity(1);
    expect(g.drawRange.count).toBe(full);
    litter.setDensity(0.5);
    expect(g.drawRange.count).toBeGreaterThan(full * 0.35);
    expect(g.drawRange.count).toBeLessThan(full * 0.65);
    expect(g.drawRange.count % 3).toBe(0);
    litter.setDensity(0);
    expect(g.drawRange.count).toBe(0);
  });
  it('keeps all positions finite', () => {
    for (const v of g.getAttribute('position').array as Float32Array) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('ground props', () => {
  it('keeps the rocks and thins the clutter with density', () => {
    const p = buildGroundProps();
    const g = p.mesh.geometry;
    p.setDensity(1);
    const full = g.drawRange.count;
    expect(full).toBe(g.index!.count);
    p.setDensity(0.5);
    const half = g.drawRange.count;
    p.setDensity(0);
    const rocks = g.drawRange.count;
    expect(rocks).toBeGreaterThan(0);
    expect(half).toBeGreaterThan(rocks);
    expect(half).toBeLessThan(full);
  });
});

describe('falling leaves', () => {
  it('are one small mesh, animated in the shader', () => {
    const m = buildFallingLeaves();
    expect(m.frustumCulled).toBe(false);
    expect(m.geometry.getAttribute('aFall').count).toBe(m.geometry.getAttribute('position').count);
    expect(FALLING_COUNT).toBeGreaterThanOrEqual(12);
    expect(FALLING_COUNT).toBeLessThanOrEqual(24);
  });
  it('live with the atmosphere extras that the low tiers switch off', () => {
    const world = buildScene(200, 16);
    expect(world.atmosphere.getObjectByName('fallingLeaves')).toBeDefined();
  });
});
