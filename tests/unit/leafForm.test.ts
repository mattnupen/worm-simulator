import { describe, it, expect } from 'vitest';
import { leafLift, leafNormal, type LeafForm } from '../../src/surface/leafForm';

const FORMS: LeafForm[] = [
  { fold: 0, cup: 0, curl: 0 },
  { fold: 0.3, cup: 0, curl: 0 },
  { fold: 0.1, cup: 0.4, curl: 0.25 },
  { fold: 0.3, cup: 0.4, curl: 0.3 },
];

describe('leafLift', () => {
  it('is flat for a flat form', () => {
    expect(leafLift(0.3, -0.2, FORMS[0])).toBe(0);
  });
  it('never dips below the leaf base plane and is finite', () => {
    for (const f of FORMS) {
      for (let u = -0.5; u <= 0.5; u += 0.05) {
        for (let v = -0.5; v <= 0.5; v += 0.05) {
          const h = leafLift(u, v, f);
          expect(Number.isFinite(h)).toBe(true);
          expect(h).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
  it('folds along the midrib: zero on it, rising evenly to both edges', () => {
    const f = FORMS[1];
    expect(leafLift(0, 0.3, f)).toBe(0);
    expect(leafLift(0.2, 0, f)).toBeCloseTo(leafLift(-0.2, 0, f), 10);
    expect(leafLift(0.4, 0, f)).toBeGreaterThan(leafLift(0.2, 0, f));
  });
  it('stays a gentle form (edges lift less than a third of the leaf size)', () => {
    for (const f of FORMS) expect(leafLift(0.5, 0.5, f)).toBeLessThan(0.34);
  });
});

describe('leafNormal', () => {
  it('is unit length and mostly up', () => {
    const n = { x: 0, y: 0, z: 0 };
    for (const f of FORMS) {
      for (let u = -0.5; u <= 0.5; u += 0.1) {
        for (let v = -0.5; v <= 0.5; v += 0.1) {
          leafNormal(u, v, f, n);
          expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 6);
          expect(n.y).toBeGreaterThan(0.5);
        }
      }
    }
  });
  it('tilts away from the midrib on a folded leaf (toward -x on the right half)', () => {
    const n = { x: 0, y: 0, z: 0 };
    leafNormal(0.2, 0, FORMS[1], n);
    expect(n.x).toBeLessThan(0);
    leafNormal(-0.2, 0, FORMS[1], n);
    expect(n.x).toBeGreaterThan(0);
    leafNormal(0, 0, FORMS[1], n);
    expect(n.x).toBeCloseTo(0, 10);
  });
  it('leans back from an up-curled tip (the tip lies toward -z)', () => {
    const n = { x: 0, y: 0, z: 0 };
    leafNormal(0, 0.4, { fold: 0, cup: 0, curl: 0.3 }, n);
    expect(n.z).toBeGreaterThan(0);
  });
});
