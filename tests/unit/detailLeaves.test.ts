import { describe, it, expect } from 'vitest';
import { buildDetailLeaves, buildDetailLayer } from '../../src/surface/detailLeaves';
import { DETAIL_BOX, DETAIL_FADE_OUT } from '../../src/render/detailGlsl';
import { PRESETS } from '../../src/render/graphics';

describe('detail leaves', () => {
  const d = buildDetailLeaves(300);
  const g = d.mesh.geometry;

  it('is one mesh placed by the shader, with a home for every vertex', () => {
    expect(d.mesh.frustumCulled).toBe(false);
    expect(d.mesh.material).toHaveProperty('defines.DETAIL');
    expect(d.mesh.material).toHaveProperty('defines.DISTURB');
    const n = g.getAttribute('position').count;
    expect(g.getAttribute('aDetail').count).toBe(n);
    const a = g.getAttribute('aDetail').array as Float32Array;
    for (let k = 0; k < a.length; k += 4) {
      expect(a[k]).toBeGreaterThanOrEqual(0);
      expect(a[k]).toBeLessThan(1);
      expect(a[k + 1]).toBeGreaterThanOrEqual(0);
      expect(a[k + 1]).toBeLessThan(1);
      // The leaf's radius (m): well under the litter's leaves (0.21 to 0.39 of a species' size,
      // against the litter's 0.6 to 1.2), as a leaf's cost is its area on screen.
      expect(a[k + 3]).toBeGreaterThan(0.1);
      expect(a[k + 3]).toBeLessThan(0.42);
    }
  });

  it('scales each shape so its farthest vertex is 1 out: aDetail.w is the leaf radius', () => {
    const pos = g.getAttribute('position');
    const det = g.getAttribute('aDetail');
    let far = 0;
    let prev = det.getW(0);
    for (let v = 0; v < pos.count; v++) {
      if (det.getW(v) !== prev) {
        expect(far).toBeCloseTo(1, 5);
        far = 0;
        prev = det.getW(v);
      }
      far = Math.max(far, Math.hypot(pos.getX(v), pos.getZ(v)));
    }
    expect(far).toBeCloseTo(1, 5);
  });

  it('every attribute value is finite', () => {
    for (const name of ['position', 'normal', 'aColor', 'aLeaf', 'aLeaf2', 'aDetail']) {
      expect((g.getAttribute(name).array as Float32Array).every(Number.isFinite)).toBe(true);
    }
  });

  it('draws a whole-leaf prefix and hides itself at zero', () => {
    d.setCount(300);
    const all = g.drawRange.count;
    expect(all).toBe(g.index!.count);
    d.setCount(150);
    expect(g.drawRange.count).toBeGreaterThan(all * 0.3);
    expect(g.drawRange.count).toBeLessThan(all * 0.7);
    expect(g.drawRange.count % 3).toBe(0);
    expect(d.mesh.visible).toBe(true);
    expect(d.drawn).toBe(150);
    d.setCount(0);
    expect(d.mesh.visible).toBe(false);
    expect(d.drawn).toBe(0);
  });

  it('covers the 6 m fade circle with its 13 m tile, and Ultra builds 2,500', () => {
    // A leaf jumps a tile only past half a box from the wrap centre, which sits up to half a metre
    // (per axis) from the head: there it must already be gone.
    expect(DETAIL_BOX / 2).toBeGreaterThanOrEqual(DETAIL_FADE_OUT + 0.5);
    expect(buildDetailLeaves().max).toBe(PRESETS.ultra.detail);
  });
});

describe('the lazily built detail layer', () => {
  it('builds nothing while no preset draws it, then builds once and switches live', () => {
    const d = buildDetailLayer(200);
    expect(d.max).toBe(200);
    d.setCount(0);
    expect(d.drawn).toBe(0);
    expect(d.built).toBeNull();
    expect(d.group.children).toHaveLength(0);
    d.setCount(100);
    expect(d.drawn).toBe(100);
    const built = d.built!;
    expect(d.group.children).toEqual([built.mesh]);
    expect(built.mesh.visible).toBe(true);
    const g = built.mesh.geometry;
    expect(g.drawRange.count).toBeLessThan(g.index!.count);
    d.setCount(0);
    expect(built.mesh.visible).toBe(false);
    expect(d.drawn).toBe(0);
    d.setCount(200);
    expect(d.drawn).toBe(200);
    expect(d.built).toBe(built);
    expect(g.drawRange.count).toBe(g.index!.count);
    expect(d.group.children).toHaveLength(1);
  });
});

