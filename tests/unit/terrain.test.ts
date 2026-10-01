import { describe, it, expect } from 'vitest';
import { terrainHeight, terrainNormal, PLAY_HALF } from '../../src/surface/terrain';

const grid = (half: number, step: number): [number, number][] => {
  const pts: [number, number][] = [];
  for (let x = -half; x <= half; x += step) for (let z = -half; z <= half; z += step) pts.push([x, z]);
  return pts;
};

describe('terrainHeight', () => {
  it('is deterministic', () => {
    for (const [x, z] of grid(20, 3.7)) expect(terrainHeight(x, z)).toBe(terrainHeight(x, z));
  });

  it('is gentle and bounded inside the playable world', () => {
    let min = Infinity;
    let max = -Infinity;
    for (const [x, z] of grid(PLAY_HALF, 0.25)) {
      const h = terrainHeight(x, z);
      expect(Number.isFinite(h)).toBe(true);
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
    expect(max).toBeLessThanOrEqual(0.5);
    expect(min).toBeGreaterThanOrEqual(-0.5);
    // Not a flat plane: there is real undulation to see.
    expect(max - min).toBeGreaterThan(0.3);
  });

  it('stays finite and modest beyond the playable world (distant berm)', () => {
    for (const [x, z] of grid(60, 2.5)) {
      const h = terrainHeight(x, z);
      expect(Number.isFinite(h)).toBe(true);
      expect(Math.abs(h)).toBeLessThan(4);
    }
  });

  it('is continuous: a tiny step gives a tiny height change', () => {
    const d = 1e-3;
    for (const [x, z] of grid(40, 1.3)) {
      const h = terrainHeight(x, z);
      expect(Math.abs(terrainHeight(x + d, z) - h)).toBeLessThan(d * 1.5);
      expect(Math.abs(terrainHeight(x, z + d) - h)).toBeLessThan(d * 1.5);
    }
  });

  it('is near flat around the spawn point', () => {
    expect(terrainHeight(0, 0)).toBeCloseTo(0, 6);
    for (const [x, z] of grid(1.5, 0.25)) expect(Math.abs(terrainHeight(x, z))).toBeLessThan(0.02);
  });
});

describe('terrainNormal', () => {
  it('is unit length and roughly up everywhere in the playable world', () => {
    for (const [x, z] of grid(PLAY_HALF, 0.9)) {
      const n = terrainNormal(x, z);
      expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 6);
      expect(n.y).toBeGreaterThan(0.94); // slopes under ~20 degrees
    }
  });

  it('points straight up at the spawn point', () => {
    const n = terrainNormal(0, 0);
    expect(n.y).toBeCloseTo(1, 4);
  });

  it('tilts downhill (against the height gradient)', () => {
    for (const [x, z] of grid(15, 2.9)) {
      const n = terrainNormal(x, z);
      const gx = terrainHeight(x + 0.01, z) - terrainHeight(x - 0.01, z);
      if (Math.abs(gx) > 1e-4) expect(Math.sign(n.x)).toBe(-Math.sign(gx));
    }
  });
});
