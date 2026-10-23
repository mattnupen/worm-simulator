import { describe, it, expect } from 'vitest';
import type { BufferAttribute } from 'three';
import { createMoundView } from '../../src/underground/moundMesh';
import { markShape, HOLE_FLOOR, HOLE_R, MOUND_R } from '../../src/underground/digMarkShape';
import { Mounds } from '../../src/underground/mounds';
import { MOUND_SPOTS } from '../../src/underground/moundSpots';
import { createOpenings } from '../../src/underground/openings';
import { createModeState } from '../../src/underground/modeMachine';
import { litterTopHeight } from '../../src/surface/litterDepth';

const surface = createModeState();

/** The drawn points of mound s over the ground at its centre: [min y, max y, x span]. */
function extent(v: ReturnType<typeof createMoundView>, s: number): [number, number, number] {
  const per = markShape().pos.length / 3;
  const p = v.mesh.geometry.getAttribute('position').array as Float32Array;
  let lo = Infinity, hi = -Infinity, xl = Infinity, xh = -Infinity;
  for (let i = 0; i < per; i++) {
    const k = (s * per + i) * 3;
    lo = Math.min(lo, p[k + 1]); hi = Math.max(hi, p[k + 1]);
    xl = Math.min(xl, p[k]); xh = Math.max(xh, p[k]);
  }
  const g = litterTopHeight(v.mounds.x[s], v.mounds.z[s]);
  return [lo - g, hi - g, xh - xl];
}

describe('the casting mounds drawn (V4 spec, revision 1 item 3; Matt\'s review)', () => {
  it('the shape: a casting mound with an open, dark hole wider than the worm', () => {
    const shape = markShape();
    const per = shape.pos.length / 3;
    expect(per).toBeLessThan(1200);
    let top = 0;
    for (let i = 0; i < per; i++) {
      const [x, y, z] = [shape.pos[i * 3], shape.pos[i * 3 + 1], shape.pos[i * 3 + 2]];
      expect(Math.hypot(x, z)).toBeLessThan(MOUND_R * 1.35);
      expect(y).toBeLessThan(0.5);
      top = Math.max(top, y);
      if (Math.hypot(x, z) < HOLE_R * 0.7) {
        expect(y).toBeLessThan(HOLE_FLOOR + 0.03);
        expect(shape.prop[i * 4] + shape.prop[i * 4 + 1] + shape.prop[i * 4 + 2]).toBeLessThan(0.05);
      }
    }
    expect(top - HOLE_FLOOR).toBeGreaterThan(HOLE_R);
    expect(HOLE_R * 2).toBeGreaterThan(0.23);
    expect(MOUND_R * 2).toBeGreaterThan(1.2);
    expect(MOUND_R * 2).toBeLessThan(2);
  });

  it('is one mesh on the plain props material, every mound drawn on the ground from the start', () => {
    const v = createMoundView(new Mounds());
    const per = markShape().pos.length / 3;
    expect(v.mounds.count).toBe(MOUND_SPOTS.length / 2);
    expect(v.mesh.geometry.getAttribute('position').count).toBe(per * v.mounds.count);
    expect((v.mesh.material as { defines: Record<string, string> }).defines).toEqual({});
    for (let s = 0; s < v.mounds.count; s++) {
      const [lo, hi, span] = extent(v, s);
      expect(lo).toBeGreaterThan(-0.3);
      expect(hi).toBeGreaterThan(0.25);
      expect(hi).toBeLessThan(0.6);
      expect(span).toBeGreaterThan(1.2);
    }
    v.sync(createOpenings(), surface);
    expect(v.mesh.visible).toBe(true);
    v.sync(createOpenings(), surface, false);
    expect(v.mesh.visible).toBe(false);
  });

  it('never rewrites its points while nothing changes; a mound under an opening collapses and comes back', () => {
    const v = createMoundView(new Mounds());
    const o = createOpenings();
    const pos = v.mesh.geometry.getAttribute('position') as BufferAttribute;
    v.sync(o, surface);
    const was = pos.version;
    for (let f = 0; f < 30; f++) v.sync(o, surface);
    expect(pos.version).toBe(was);
    // The worm came up on mound 2: its midden stands there instead.
    o.data.set([v.mounds.x[2] + 0.4, 0, v.mounds.z[2] - 0.3, 0]);
    o.count = 1;
    o.version++;
    v.sync(o, surface);
    expect(pos.version).toBeGreaterThan(was);
    expect(extent(v, 2)[2]).toBeLessThan(1e-6);
    expect(extent(v, 1)[2]).toBeGreaterThan(1.2);
    // Openings cleared (the speed test's fresh start): back as it was.
    o.count = 0;
    o.version++;
    v.sync(o, surface);
    expect(extent(v, 2)[2]).toBeGreaterThan(1.2);
  });
});
