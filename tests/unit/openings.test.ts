import { describe, it, expect } from 'vitest';
import { createOpenings, addOpening, clearOpenings, MAX_OPENINGS, OPENING_MERGE } from '../../src/underground/openings';
import { createBodyPath } from '../../src/underground/bodyPath';
import { buildEmerge } from '../../src/underground/emergePath';
import { createEmergeMap, mapEmerge } from '../../src/underground/emergeMap';
import { createSlab, boundaryAt, slabX, slabZ, B_F, B_TOP } from '../../src/underground/slab';
import { createMiddens } from '../../src/underground/middens';
import { floorHeight, litterTopHeight } from '../../src/surface/litterDepth';
import { createModeState, type ModeState } from '../../src/underground/modeMachine';
import { bodyUnderTop } from './pathPlay';

describe('burrow openings on the surface (spec 4.2, 4.3)', () => {
  it('records where the worm came out, on the top of the leaves', () => {
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
    expect(o.data[1]).toBeCloseTo(boundaryAt(s, B_TOP, p.exitU), 5);
  });

  it('keeps the newest 8, replacing the oldest; nothing about them is stored', () => {
    const s = createSlab(0, 0, 0, 1, 1);
    const p = createBodyPath();
    const o = createOpenings();
    // 2 u apart (never merged), along the cut (it runs along z).
    for (let n = 0; n < MAX_OPENINGS + 3; n++) {
      p.exitU = 2 * n - 11;
      addOpening(o, p, s);
    }
    expect(o.count).toBe(MAX_OPENINGS);
    // The 3 oldest (exitU -11, -9, -7) were replaced by the newest.
    const zs = Array.from({ length: MAX_OPENINGS }, (_, i) => o.data[i * 4 + 2]);
    expect(zs).toContain(Math.fround(slabZ(s, 2 * (MAX_OPENINGS + 2) - 11)));
    for (const u of [-11, -9, -7]) expect(zs).not.toContain(Math.fround(slabZ(s, u)));
    expect(zs).toContain(Math.fround(slabZ(s, -5)));
    clearOpenings(o);
    expect(o.count).toBe(0);
  });

  it('an opening near an old one replaces it (no two middens grow into each other), as the newest', () => {
    const s = createSlab(0, 0, 0, 1, 1);
    const p = createBodyPath();
    const o = createOpenings();
    for (let n = 0; n < MAX_OPENINGS; n++) {
      p.exitU = 3 * n - 12;
      addOpening(o, p, s);
    }
    // Back up next to the oldest (exitU -12): it moves there and is now the newest.
    p.exitU = -12 + OPENING_MERGE * 0.9;
    addOpening(o, p, s);
    expect(o.count).toBe(MAX_OPENINGS);
    let zs = Array.from({ length: MAX_OPENINGS }, (_, i) => o.data[i * 4 + 2]);
    expect(zs).toContain(Math.fround(slabZ(s, p.exitU)));
    expect(zs).not.toContain(Math.fround(slabZ(s, -12)));
    for (let i = 0; i < MAX_OPENINGS; i++) {
      for (let j = i + 1; j < MAX_OPENINGS; j++) expect(Math.abs(zs[i] - zs[j])).toBeGreaterThanOrEqual(OPENING_MERGE);
    }
    // So a new one far away replaces the next oldest (exitU -9), not it.
    p.exitU = 15;
    addOpening(o, p, s);
    zs = Array.from({ length: MAX_OPENINGS }, (_, i) => o.data[i * 4 + 2]);
    expect(zs).toContain(Math.fround(slabZ(s, -12 + OPENING_MERGE * 0.9)));
    expect(zs).not.toContain(Math.fround(slabZ(s, -9)));
  });

  it('rewrites the mesh only when the openings change, and shows it only on the surface side', () => {
    const s = createSlab(0, 0, 0, 1, 1);
    const p = createBodyPath();
    const o = createOpenings();
    const middens = createMiddens();
    // Visible (so the shader compiles at load) with nothing to draw.
    expect(middens.mesh.visible).toBe(true);
    middens.update(o);
    expect(middens.mesh.geometry.drawRange.count).toBe(0);
    addOpening(o, p, s);
    middens.update(o);
    const pos = middens.mesh.geometry.getAttribute('position') as import('three').BufferAttribute;
    const written = pos.version;
    middens.update(o);
    middens.update(o);
    expect(pos.version).toBe(written);
    p.exitU = 3;
    addOpening(o, p, s);
    middens.update(o);
    expect(pos.version).toBeGreaterThan(written);
    const m: ModeState = createModeState();
    middens.show(m);
    expect(middens.mesh.visible).toBe(true);
    m.mode = 'underground';
    middens.show(m);
    expect(middens.mesh.visible).toBe(false);
    // Coming up: hidden while the camera is still at the cut, shown once it is back on the surface.
    m.mode = 'comingUp';
    m.moveS = 4;
    m.t = 0;
    middens.show(m);
    expect(middens.mesh.visible).toBe(false);
    m.t = m.moveS;
    middens.show(m);
    expect(middens.mesh.visible).toBe(true);
  });

  it('draws each as a midden about 5 cm across and 1-2 cm high, a plug down to the floor, all 8 in one draw', () => {
    const s = createSlab(-4, 5, 2.1, -1, 9);
    const p = createBodyPath();
    const o = createOpenings();
    const middens = createMiddens();
    for (let n = 0; n < MAX_OPENINGS; n++) {
      p.exitU = n * 1.6 - 6; // 1.6 u apart: never merged
      addOpening(o, p, s);
    }
    middens.update(o);
    const g = middens.mesh.geometry;
    const pos = g.getAttribute('position');
    const idx = g.index!;
    // Every opening's triangles fit, and use only written vertices.
    expect(g.drawRange.count).toBeGreaterThan(0);
    expect(g.drawRange.count).toBeLessThanOrEqual(idx.count);
    let used = 0;
    for (let i = 0; i < g.drawRange.count; i++) used = Math.max(used, idx.getX(i));
    for (let n = 0; n < MAX_OPENINGS; n++) {
      const x = o.data[n * 4];
      const z = o.data[n * 4 + 2];
      let high = -Infinity;
      let low = Infinity;
      let across = 0;
      let holeLow = Infinity;
      for (let v = 0; v <= used; v++) {
        const d = Math.hypot(pos.getX(v) - x, pos.getZ(v) - z);
        if (d > 0.79) continue;
        high = Math.max(high, pos.getY(v) - litterTopHeight(pos.getX(v), pos.getZ(v)));
        low = Math.min(low, pos.getY(v) - floorHeight(pos.getX(v), pos.getZ(v)));
        if (pos.getY(v) > litterTopHeight(pos.getX(v), pos.getZ(v))) across = Math.max(across, d);
        if (d < 0.09) holeLow = Math.min(holeLow, pos.getY(v) - litterTopHeight(pos.getX(v), pos.getZ(v)));
      }
      expect(high, 'heap height over the litter (1-2 cm)').toBeGreaterThan(0.23);
      expect(high).toBeLessThan(0.5);
      expect(2 * across, 'across (about 5 cm)').toBeGreaterThan(1);
      expect(2 * across).toBeLessThan(1.6);
      expect(low, 'reaches the floor').toBeLessThan(0.01);
      // The hole's dark floor lies over the drawn top (which would show through it, lit).
      expect(holeLow, 'hole over the top').toBeGreaterThan(0.025);
    }
  });
});
