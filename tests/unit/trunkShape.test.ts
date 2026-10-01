import { describe, it, expect } from 'vitest';
import { trunkRadius, trunkAxis, RING_HEIGHTS, type TrunkParams } from '../../src/surface/trunkShape';

const P: TrunkParams = { height: 14, radius: 0.4, taper: 0.4, flare: 0.7, buttress: 0.6, lobes: 5, phase: 1.1 };
const angles = Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2);

describe('trunkRadius', () => {
  it('is positive and finite everywhere on the trunk (and below ground)', () => {
    for (const h of [-0.3, 0, 0.1, 1, 5, 14]) {
      for (const a of angles) {
        const r = trunkRadius(h, a, P);
        expect(Number.isFinite(r)).toBe(true);
        expect(r).toBeGreaterThan(0);
      }
    }
  });
  it('flares out at the root collar', () => {
    for (const a of angles) expect(trunkRadius(0, a, P)).toBeGreaterThan(trunkRadius(2, a, P) * 1.3);
  });
  it('tapers steadily above the flare', () => {
    let prev = Infinity;
    for (let h = 1.5; h <= 14; h += 0.5) {
      const r = trunkRadius(h, 0.3, P);
      expect(r).toBeLessThan(prev);
      prev = r;
    }
    expect(trunkRadius(14, 0.3, P)).toBeCloseTo(P.radius * (1 - P.taper), 2);
  });
  it('has buttress lobes at the base that fade out up the trunk', () => {
    const spread = (h: number) => {
      const rs = angles.map((a) => trunkRadius(h, a, P));
      return (Math.max(...rs) - Math.min(...rs)) / Math.min(...rs);
    };
    expect(spread(0)).toBeGreaterThan(0.15);
    expect(spread(3)).toBeLessThan(0.01);
  });
});

describe('trunkAxis', () => {
  it('starts at the base and leans smoothly to the top offset', () => {
    const out = { x: 0, y: 0, z: 0 };
    trunkAxis(0, 14, 0.5, -0.3, out);
    expect(Math.hypot(out.x, out.y, out.z)).toBe(0);
    trunkAxis(14, 14, 0.5, -0.3, out);
    expect(out.x).toBeCloseTo(0.5);
    expect(out.y).toBeCloseTo(14);
    expect(out.z).toBeCloseTo(-0.3);
    trunkAxis(7, 14, 0.5, -0.3, out);
    // Gentle curve: the lower half barely leans.
    expect(out.x).toBeLessThan(0.25);
  });
});

describe('RING_HEIGHTS', () => {
  it('rises strictly, starts buried and is dense near the base', () => {
    for (let i = 1; i < RING_HEIGHTS.length; i++) expect(RING_HEIGHTS[i]).toBeGreaterThan(RING_HEIGHTS[i - 1]);
    expect(RING_HEIGHTS[0]).toBeLessThan(0);
    expect(RING_HEIGHTS.filter((h) => h >= 0 && h <= 1).length).toBeGreaterThanOrEqual(5);
    expect(RING_HEIGHTS[RING_HEIGHTS.length - 1]).toBe(1);
  });
});
