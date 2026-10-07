import { describe, it, expect } from 'vitest';
import { trunkShadow, shadowCasters, type ShadowCaster } from '../../src/surface/treeShadows';

const SUN = { x: 0.5, y: 0.5, z: 0.7 };
const one: ShadowCaster[] = [{ x: 0, z: 0, radius: 0.4 }];
// Unit ground direction the shadows fall in (away from the sun).
const len = Math.hypot(SUN.x, SUN.z);
const dx = -SUN.x / len;
const dz = -SUN.z / len;

describe('trunkShadow', () => {
  it('is dark right behind a trunk, away from the sun', () => {
    expect(trunkShadow(dx * 3, dz * 3, one, SUN)).toBeGreaterThan(0.5);
  });
  it('is clear on the sunny side and well off to the side', () => {
    expect(trunkShadow(-dx * 2, -dz * 2, one, SUN)).toBe(0);
    expect(trunkShadow(dx * 3 + dz * 3, dz * 3 - dx * 3, one, SUN)).toBe(0);
  });
  it('fades out with distance along the shadow', () => {
    expect(trunkShadow(dx * 9, dz * 9, one, SUN)).toBeLessThan(trunkShadow(dx * 3, dz * 3, one, SUN));
    expect(trunkShadow(dx * 20, dz * 20, one, SUN)).toBe(0);
  });
  it('stays within 0..1 and finite across the world with every tree', () => {
    const casters = shadowCasters();
    expect(casters.length).toBeGreaterThanOrEqual(2);
    for (let x = -20; x <= 20; x += 0.7) {
      for (let z = -20; z <= 20; z += 0.7) {
        const s = trunkShadow(x, z, casters, SUN);
        expect(Number.isFinite(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
      }
    }
  });
});
