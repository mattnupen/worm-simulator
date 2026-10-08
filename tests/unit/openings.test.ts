import { describe, it, expect } from 'vitest';
import { createOpenings, addOpening, clearOpenings, MAX_OPENINGS, MIDDEN_SINK } from '../../src/underground/openings';
import { createBodyPath } from '../../src/underground/bodyPath';
import { buildEmerge } from '../../src/underground/emergePath';
import { createEmergeMap, mapEmerge } from '../../src/underground/emergeMap';
import { createSlab, boundaryAt, slabX, slabZ, B_F, B_TOP } from '../../src/underground/slab';
import { createMiddens } from '../../src/underground/middens';
import { floorHeight, litterTopHeight } from '../../src/surface/litterDepth';
import { bodyUnderTop } from './pathPlay';

describe('burrow openings on the surface (spec 4.2, 4.3)', () => {
  it('records where the worm came out, sitting just into the top of the leaves', () => {
    const s = createSlab(2, -3, 0.8, 1, 6);
    const m = createEmergeMap();
    mapEmerge(m, s);
    const p = createBodyPath();
    const { us, vs } = bodyUnderTop(s, 1, boundaryAt(s, B_F, 1) - 0.1, 0.1, 0);
    buildEmerge(p, s, m, us, vs, 0.1);
    const o = createOpenings();
    addOpening(o, p, s);
    expect(o.count).toBe(1);
    expect(o.data[0]).toBeCloseTo(slabX(s, p.exitU), 5);
    expect(o.data[2]).toBeCloseTo(slabZ(s, p.exitU), 5);
    expect(o.data[1]).toBeCloseTo(boundaryAt(s, B_TOP, p.exitU) - MIDDEN_SINK, 5);
  });

  it('keeps the newest 8, replacing the oldest; nothing about them is stored', () => {
    const s = createSlab(0, 0, 0, 1, 1);
    const p = createBodyPath();
    const o = createOpenings();
    for (let n = 0; n < MAX_OPENINGS + 3; n++) {
      p.exitU = n - 5;
      addOpening(o, p, s);
    }
    expect(o.count).toBe(MAX_OPENINGS);
    // The 3 oldest (exitU -5, -4, -3) were replaced by the newest. (This cut runs along z.)
    const zs = Array.from({ length: MAX_OPENINGS }, (_, i) => o.data[i * 4 + 2]);
    expect(zs).toContain(Math.fround(slabZ(s, MAX_OPENINGS + 2 - 5)));
    expect(zs).not.toContain(Math.fround(slabZ(s, -5)));
    expect(zs).not.toContain(Math.fround(slabZ(s, -3)));
    clearOpenings(o);
    expect(o.count).toBe(0);
  });

  it('draws each as a midden about 5 cm across and 1-2 cm high, a plug down to the floor, all 8 in one draw', () => {
    const s = createSlab(-4, 5, 2.1, -1, 9);
    const p = createBodyPath();
    const o = createOpenings();
    const middens = createMiddens();
    middens.update(o);
    expect(middens.mesh.visible).toBe(false);
    for (let n = 0; n < MAX_OPENINGS; n++) {
      p.exitU = n * 1.6 - 6;
      addOpening(o, p, s);
    }
    middens.update(o);
    const g = middens.mesh.geometry;
    const pos = g.getAttribute('position');
    const idx = g.index!;
    expect(middens.mesh.visible).toBe(true);
    // Every opening's triangles fit, and use only written vertices.
    expect(g.drawRange.count).toBeGreaterThan(0);
    expect(g.drawRange.count).toBeLessThanOrEqual(idx.count);
    let used = 0;
    for (let i = 0; i < g.drawRange.count; i++) used = Math.max(used, idx.getX(i));
    for (let n = 0; n < MAX_OPENINGS; n++) {
      const x = o.data[n * 4];
      const z = o.data[n * 4 + 2];
      const top = litterTopHeight(x, z);
      let high = -Infinity;
      let low = Infinity;
      let across = 0;
      for (let v = 0; v <= used; v++) {
        const d = Math.hypot(pos.getX(v) - x, pos.getZ(v) - z);
        if (d > 0.79) continue;
        high = Math.max(high, pos.getY(v) - top);
        low = Math.min(low, pos.getY(v) - floorHeight(pos.getX(v), pos.getZ(v)));
        if (pos.getY(v) > litterTopHeight(pos.getX(v), pos.getZ(v))) across = Math.max(across, d);
      }
      expect(high, 'heap height over the litter (1-2 cm)').toBeGreaterThan(0.23);
      expect(high).toBeLessThan(0.5);
      expect(2 * across, 'across (about 5 cm)').toBeGreaterThan(1);
      expect(2 * across).toBeLessThan(1.6);
      expect(low, 'reaches the floor').toBeLessThan(0.01);
    }
  });
});
