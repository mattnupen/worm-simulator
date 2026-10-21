import { describe, it, expect } from 'vitest';
import { createDigMarkView } from '../../src/underground/digMarkMesh';
import { markShape, ARROW_LIFT } from '../../src/underground/digMarkShape';
import { DigMarks, MAX_MARKS, MARK_OPENING, type DigTests } from '../../src/underground/digMarks';
import { createOpenings } from '../../src/underground/openings';
import { createBurrows } from '../../src/underground/burrows';
import { litterTopHeight } from '../../src/surface/litterDepth';

const always: DigTests = { spot: () => true, reuse: () => true };
const motion = { head: { x: 0, y: 0, z: 0 }, heading: 0 };

/** The drawn points of slot s: [min y, max y, x span] over its mound or arrow. */
function extent(v: ReturnType<typeof createDigMarkView>, s: number, arrow: boolean): [number, number, number] {
  const shape = markShape();
  const per = shape.pos.length / 3;
  const p = v.mesh.geometry.getAttribute('position').array as Float32Array;
  let lo = Infinity, hi = -Infinity, xl = Infinity, xh = -Infinity;
  for (let i = arrow ? shape.moundVerts : 0; i < (arrow ? per : shape.moundVerts); i++) {
    const k = (s * per + i) * 3;
    lo = Math.min(lo, p[k + 1]); hi = Math.max(hi, p[k + 1]);
    xl = Math.min(xl, p[k]); xh = Math.max(xh, p[k]);
  }
  return [lo, hi, xh - xl];
}

describe('the dig markers drawn (V4 spec 4.2)', () => {
  it('is one small mesh on the plain props material: a mound and a down-arrow per marker', () => {
    const v = createDigMarkView(new DigMarks(always));
    const shape = markShape();
    expect(v.mesh.geometry.getAttribute('position').count).toBe((shape.pos.length / 3) * MAX_MARKS);
    expect((v.mesh.material as { defines: Record<string, string> }).defines).toEqual({});
    expect(v.mesh.visible).toBe(false);
    // The arrow points down: its lowest point is its tip, on the axis, over the mound.
    let tip = 0;
    for (let i = shape.moundVerts; i < shape.pos.length / 3; i++) if (shape.pos[i * 3 + 1] < shape.pos[tip * 3 + 1] || tip === 0) tip = i;
    expect(Math.hypot(shape.pos[tip * 3], shape.pos[tip * 3 + 2])).toBeLessThan(1e-6);
    expect(shape.pos[tip * 3 + 1]).toBeCloseTo(ARROW_LIFT, 5);
  });

  it('grows the markers in on the ground, hides them when not shown, and sinks the arrow under the head on a spot', () => {
    const v = createDigMarkView(new DigMarks(always));
    const w = { openings: createOpenings(), burrows: createBurrows() };
    for (let s = 0; s < 60; s++) v.step(motion, w);
    for (let f = 0; f < 30; f++) v.frame(true, motion.head, false, f / 30, 1 / 30);
    expect(v.mesh.visible).toBe(true);
    const m = v.marks;
    for (let s = 0; s < MAX_MARKS; s++) {
      const ground = litterTopHeight(m.x[s], m.z[s]);
      const [lo, hi, span] = extent(v, s, true);
      expect(lo).toBeGreaterThan(ground + 0.3);
      expect(hi).toBeLessThan(ground + 1.3);
      expect(span).toBeGreaterThan(0.3);
      expect(extent(v, s, false)[2]).toBeGreaterThan(0.9);
    }
    // The head on marker 0's spot with the prompt up: its arrow sinks away, the others stay.
    const head = { x: m.x[0], z: m.z[0] };
    for (let f = 0; f < 30; f++) v.frame(true, head, true, 1 + f / 30, 1 / 30);
    expect(extent(v, 0, true)[2]).toBeLessThan(1e-6);
    expect(extent(v, 1, true)[2]).toBeGreaterThan(0.3);
    v.frame(false, head, true, 2, 1 / 30);
    expect(v.mesh.visible).toBe(false);
  });

  it('an old opening\'s marker is the arrow alone (its midden is the mound)', () => {
    const v = createDigMarkView(new DigMarks(always));
    const w = { openings: createOpenings(), burrows: createBurrows() };
    w.openings.data.set([0, 0, 3, 0]);
    w.openings.burrow[0] = 0;
    w.openings.count = 1;
    w.openings.version++;
    for (let s = 0; s < 30; s++) v.step(motion, w);
    const k = Array.from(v.marks.kind).indexOf(MARK_OPENING);
    expect(k).toBeGreaterThanOrEqual(0);
    for (let f = 0; f < 30; f++) v.frame(true, motion.head, false, f / 30, 1 / 30);
    expect(extent(v, k, false)[2]).toBeLessThan(1e-6);
    expect(extent(v, k, true)[2]).toBeGreaterThan(0.3);
  });
});
