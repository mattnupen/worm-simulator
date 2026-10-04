import { describe, it, expect, afterEach } from 'vitest';
import {
  SCALE_SPECS, SCALE_MODES, SCALE_LABELS, SCALE_DESCRIPTIONS, DEFAULT_SCALE, REAL_LEAF_CM, UNITS_PER_CM,
  isScaleMode, scaleSpec, setScale,
} from '../../src/surface/worldScale';
import { LEAF_KINDS } from '../../src/surface/leafLitter';
import { LEAF_SIZE } from '../../src/surface/leafPalette';
import { leafCountScale, scaledLeafCount } from '../../src/surface/leafScale';

afterEach(() => { setScale(DEFAULT_SCALE); });

describe('world scale table', () => {
  it('has the three modes, each with a label and a one-line description', () => {
    expect(SCALE_MODES).toEqual(['classic', 'hybrid', 'true']);
    for (const m of SCALE_MODES) {
      expect(SCALE_SPECS[m].mode).toBe(m);
      expect(SCALE_LABELS[m].length).toBeGreaterThan(0);
      expect(SCALE_DESCRIPTIONS[m]).toMatch(/\.$/);
    }
    expect(SCALE_DESCRIPTIONS).toEqual({
      classic: 'The forest as it is now.',
      hybrid: 'Small things real size, big things half.',
      true: 'Everything real size, next to a real worm.',
    });
  });

  it('Classic is exactly the Step 1a world', () => {
    const c = SCALE_SPECS.classic;
    expect(c).toMatchObject({ mushroom: 1, fern: 1, sedge: 1, rock: 1, log: 1, birch: 1, maple: 1, clutter: 64, clutterSeed: 5 });
    expect(c.trees).toEqual({ count: 14, seed: 7, clear: 4 });
    expect(c.logSite).toEqual({ x: 3.9, z: 4.7, yaw: -0.5, length: 4.4, radius: 0.32 });
    expect(c.rocks).toHaveLength(7);
    for (const k of LEAF_KINDS) expect(c.leaf[k]).toBe(1);
    expect([c.distantScale, c.distantCount]).toEqual([1, 72]);
  });

  it('matches the spec table (section 4.1)', () => {
    const h = SCALE_SPECS.hybrid;
    const t = SCALE_SPECS.true;
    expect(h).toMatchObject({ mushroom: 3, rock: 4, fern: 7, sedge: 7, log: 4.5, birch: 4.5, maple: 4.5 });
    expect(t).toMatchObject({ mushroom: 3, rock: 4, fern: 7, sedge: 7, log: 9, birch: 9, maple: 11 });
    for (const k of LEAF_KINDS) expect(h.leaf[k]).toBe(1);
    expect(h.trees.count).toBe(5);
    expect(t.trees.count).toBe(2);
  });

  it('True leaves are each species\' real length on average', () => {
    for (const k of LEAF_KINDS) {
      const meanLength = SCALE_SPECS.true.leaf[k] * LEAF_SIZE[k] * 0.9;
      expect(meanLength / UNITS_PER_CM).toBeCloseTo(REAL_LEAF_CM[k], 1);
    }
  });

  it('starts a fresh device on True (spec 2)', () => {
    expect(DEFAULT_SCALE).toBe('true');
  });

  it('switches the active spec', () => {
    expect(scaleSpec()).toBe(SCALE_SPECS[DEFAULT_SCALE]);
    expect(setScale('true')).toBe(SCALE_SPECS.true);
    expect(scaleSpec().mode).toBe('true');
  });

  it('knows its mode names', () => {
    expect(isScaleMode('hybrid')).toBe(true);
    expect(isScaleMode('TRUE')).toBe(false);
    expect(isScaleMode(undefined)).toBe(false);
  });
});

describe('leaf counts follow leaf area', () => {
  it('Classic and Hybrid keep the preset counts', () => {
    expect(leafCountScale(SCALE_SPECS.classic)).toBe(1);
    expect(leafCountScale(SCALE_SPECS.hybrid)).toBe(1);
    expect(scaledLeafCount(1500, SCALE_SPECS.classic)).toBe(1500);
  });
  it('True has about a quarter as many leaves, each about four times the area', () => {
    const f = leafCountScale(SCALE_SPECS.true);
    expect(f).toBeGreaterThan(0.22);
    expect(f).toBeLessThan(0.3);
    expect(scaledLeafCount(1500, SCALE_SPECS.true)).toBe(Math.round(1500 * f));
    expect(scaledLeafCount(0, SCALE_SPECS.true)).toBe(0);
    expect(scaledLeafCount(1, SCALE_SPECS.true)).toBe(1);
  });
});
