import { describe, it, expect } from 'vitest';
import { createDigMarkView } from '../../src/underground/digMarkMesh';
import { markShape, HOLE_FLOOR, HOLE_R, MOUND_R } from '../../src/underground/digMarkShape';
import { DigMarks, MAX_MARKS, MARK_OPENING, type DigTests } from '../../src/underground/digMarks';
import { createOpenings } from '../../src/underground/openings';
import { createBurrows } from '../../src/underground/burrows';
import { litterTopHeight } from '../../src/surface/litterDepth';

const always: DigTests = { spot: () => true, reuse: () => true };
const motion = { head: { x: 0, y: 0, z: 0 }, heading: 0 };

/** The drawn points of slot s over the ground at its centre: [min y, max y, x span]. */
function extent(v: ReturnType<typeof createDigMarkView>, s: number): [number, number, number] {
  const per = markShape().pos.length / 3;
  const p = v.mesh.geometry.getAttribute('position').array as Float32Array;
  let lo = Infinity, hi = -Infinity, xl = Infinity, xh = -Infinity;
  for (let i = 0; i < per; i++) {
    const k = (s * per + i) * 3;
    lo = Math.min(lo, p[k + 1]); hi = Math.max(hi, p[k + 1]);
    xl = Math.min(xl, p[k]); xh = Math.max(xh, p[k]);
  }
  const g = litterTopHeight(v.marks.x[s], v.marks.z[s]);
  return [lo - g, hi - g, xh - xl];
}

describe('the dig markers drawn (V4 spec, revision 1 item 3)', () => {
  it('is one small mesh on the plain props material: a casting mound with an open hole, no arrow', () => {
    const v = createDigMarkView(new DigMarks(always));
    const shape = markShape();
    const per = shape.pos.length / 3;
    expect(v.mesh.geometry.getAttribute('position').count).toBe(per * MAX_MARKS);
    expect(per).toBeLessThan(1200);
    expect((v.mesh.material as { defines: Record<string, string> }).defines).toEqual({});
    expect(v.mesh.visible).toBe(false);
    // Nothing floats: every point is within the mound's height and reach.
    let top = 0;
    for (let i = 0; i < per; i++) {
      const [x, y, z] = [shape.pos[i * 3], shape.pos[i * 3 + 1], shape.pos[i * 3 + 2]];
      expect(Math.hypot(x, z)).toBeLessThan(MOUND_R * 1.35);
      expect(y).toBeLessThan(0.5);
      top = Math.max(top, y);
    }
    // The hole: open (nothing in it above its floor) and dark (its floor near black), well below the lip.
    for (let i = 0; i < per; i++) {
      if (Math.hypot(shape.pos[i * 3], shape.pos[i * 3 + 2]) < HOLE_R * 0.7) {
        expect(shape.pos[i * 3 + 1]).toBeLessThan(HOLE_FLOOR + 0.03);
        expect(shape.prop[i * 4] + shape.prop[i * 4 + 1] + shape.prop[i * 4 + 2]).toBeLessThan(0.05);
      }
    }
    expect(top - HOLE_FLOOR).toBeGreaterThan(HOLE_R);
    // The hole is wider than the worm (0.23 u) and the mound a few cm across (Game choice: 1.5 u).
    expect(HOLE_R * 2).toBeGreaterThan(0.23);
    expect(MOUND_R * 2).toBeGreaterThan(1.2);
    expect(MOUND_R * 2).toBeLessThan(2);
  });

  it('grows the markers in on the ground, keeps them while shown, and hides them when not', () => {
    const v = createDigMarkView(new DigMarks(always));
    const w = { openings: createOpenings(), burrows: createBurrows() };
    for (let s = 0; s < 60; s++) v.step(motion, w);
    v.frame(true, 1 / 30);
    expect(extent(v, 0)[2]).toBeLessThan(0.5);
    for (let f = 0; f < 30; f++) v.frame(true, 1 / 30);
    expect(v.mesh.visible).toBe(true);
    for (let s = 0; s < MAX_MARKS; s++) {
      const [lo, hi, span] = extent(v, s);
      expect(lo).toBeGreaterThan(-0.3);
      expect(hi).toBeGreaterThan(0.25);
      expect(hi).toBeLessThan(0.6);
      expect(span).toBeGreaterThan(1.2);
    }
    // Grown and still: its points are not sent again.
    const pos = v.mesh.geometry.getAttribute('position') as import('three').BufferAttribute;
    const was = pos.version;
    v.frame(true, 1 / 30);
    expect(pos.version).toBe(was);
    v.frame(false, 1 / 30);
    expect(v.mesh.visible).toBe(false);
  });

  it('draws nothing for an old opening (its midden is the same mound with the same hole)', () => {
    const v = createDigMarkView(new DigMarks(always));
    const w = { openings: createOpenings(), burrows: createBurrows() };
    w.openings.data.set([0, 0, 3, 0]);
    w.openings.burrow[0] = 0;
    w.openings.count = 1;
    w.openings.version++;
    for (let s = 0; s < 30; s++) v.step(motion, w);
    const k = Array.from(v.marks.kind).indexOf(MARK_OPENING);
    expect(k).toBeGreaterThanOrEqual(0);
    for (let f = 0; f < 30; f++) v.frame(true, 1 / 30);
    expect(extent(v, k)[2]).toBeLessThan(1e-6);
  });
});
