import { describe, it, expect } from 'vitest';
import { bellyHeight, litterTop, wormSurface, BELLY_UNDER } from '../../src/worm/surfaceHeight';
import { floorHeight, litterTopHeight, LITTER_MIN, PILES } from '../../src/surface/litterDepth';
import { PLAY_HALF } from '../../src/surface/terrain';
import { CAM_GROUND_MARGIN } from '../../src/game/cameraClearance';
import { wormExtent } from '../../src/worm/wormMesh';

const grid = (half: number, step: number): [number, number][] => {
  const pts: [number, number][] = [];
  for (let x = -half; x <= half; x += step) for (let z = -half; z <= half; z += step) pts.push([x, z]);
  return pts;
};

describe('wormSurface: the worm travels buried in the litter (V2 spec 8.2)', () => {
  it('rests on the floor (the F layer\'s top) everywhere, under the litter', () => {
    for (const [x, z] of grid(PLAY_HALF, 0.53)) {
      const s = wormSurface(x, z);
      expect(s.y).toBe(floorHeight(x, z));
      expect(s.under).toBe(1);
    }
  });

  it('is buried under piles too: the litter top stays 2 cm or more above the floor', () => {
    for (const p of PILES) {
      const s = wormSurface(p.x, p.z);
      expect(litterTop(p.x, p.z) - s.y).toBeGreaterThan(LITTER_MIN - 0.02);
    }
  });

  it('writes into and returns the object it is given', () => {
    const out = { y: 0, under: 0 };
    expect(wormSurface(3, 4, out)).toBe(out);
    expect(out.y).toBe(floorHeight(3, 4));
  });

  it('is smooth: 1 mm steps change the height by under 1 mm (the soil\'s gentle rolls)', () => {
    let prev = wormSurface(-6, -6).y;
    for (let t = 0.001; t < 12; t += 0.001) {
      const y = wormSurface(-6 + t, -6 + t * 0.7).y;
      expect(Math.abs(y - prev)).toBeLessThan(0.001);
      prev = y;
    }
  });
});

describe('bellyHeight and litterTop', () => {
  it('puts the belly just on the floor', () => {
    const s = wormSurface(2, 3);
    expect(bellyHeight(s)).toBeCloseTo(s.y + BELLY_UNDER, 12);
  });

  it('the whole body, at its fullest, stays under the top of the litter with room to spare', () => {
    const ext = { top: 0, half: 0, fall: 0, probe: 0 };
    let tallest = 0;
    for (let m = 0; m <= 1; m += 0.01) tallest = Math.max(tallest, wormExtent(m, 0.05, ext).top);
    for (const [x, z] of grid(PLAY_HALF, 0.47)) {
      const belly = bellyHeight(wormSurface(x, z));
      // The body's top with a full swell (and a quarter more for the probing head): still under the top.
      expect(litterTopHeight(x, z) - (belly + tallest * 1.25)).toBeGreaterThan(0.06);
    }
  });

  it('the litter top is the drawn top, and the camera floor clears it', () => {
    expect(litterTop(3, 4)).toBe(litterTopHeight(3, 4));
    expect(CAM_GROUND_MARGIN).toBeGreaterThan(0.3);
  });
});
