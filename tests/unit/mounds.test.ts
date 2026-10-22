import { afterEach, describe, it, expect } from 'vitest';
import { Mounds, OPENING_CLEAR, TOP_R } from '../../src/underground/mounds';
import { heapAt, MOUND_R } from '../../src/underground/digMarkShape';
import { createOpenings } from '../../src/underground/openings';
import { floorHeight, litterTopHeight } from '../../src/surface/litterDepth';
import { setWormRise, wormSurface } from '../../src/worm/surfaceHeight';
import { Crawl } from '../../src/game/crawl';
import { createBody } from '../../src/worm/body';

afterEach(() => setWormRise(null));

describe('the casting mounds: fixed, and the worm crawls over them', () => {
  it('lifts the belly over every mound\'s castings (over them, never through), smoothly down to the floor', () => {
    const m = new Mounds();
    for (let i = 0; i < m.count; i++) {
      const cx = m.x[i];
      const cz = m.z[i];
      expect(m.rise(cx, cz)).toBeCloseTo(m.lift[i], 9);
      expect(m.lift[i]).toBeLessThan(1.3);
      for (let a = 0; a < 16; a++) {
        const dx = Math.cos(a * 0.3927);
        const dz = Math.sin(a * 0.3927);
        // Over the heap (its unjittered profile on the drawn ground), out to its foot.
        for (let d = TOP_R; d <= MOUND_R; d += 0.05) {
          const x = cx + dx * d;
          const z = cz + dz * d;
          expect(floorHeight(x, z) + m.rise(x, z)).toBeGreaterThan(litterTopHeight(x, z) + heapAt(d) - 0.01);
        }
        // No step anywhere along the ride, and nothing past its reach.
        let prev = m.rise(cx, cz);
        for (let d = 0.02; d <= m.reach[i] + 0.1; d += 0.02) {
          const r = m.rise(cx + dx * d, cz + dz * d);
          expect(Math.abs(r - prev)).toBeLessThan(0.04);
          prev = r;
        }
        expect(prev).toBe(0);
      }
    }
    expect(m.rise(0, 0)).toBe(0);
  });

  it('a mound with an opening on it stops lifting the worm (its midden stands there); back once cleared', () => {
    const m = new Mounds();
    const o = createOpenings();
    m.sync(o);
    expect(Array.from(m.shown).every((s) => s === 1)).toBe(true);
    o.data.set([m.x[3] + OPENING_CLEAR * 0.9, 0, m.z[3], 0]);
    o.count = 1;
    o.version++;
    const v = m.version;
    m.sync(o);
    expect(m.version).toBeGreaterThan(v);
    expect(m.shown[3]).toBe(0);
    expect(Array.from(m.shown).filter((s) => s === 0).length).toBe(1);
    expect(m.rise(m.x[3], m.z[3])).toBe(0);
    o.count = 0;
    o.version++;
    m.sync(o);
    expect(m.shown[3]).toBe(1);
  });

  it('the worm crawls straight over one: up out of the leaves onto the castings and down again', () => {
    const m = new Mounds();
    setWormRise(m);
    expect(wormSurface(m.x[0], m.z[0]).y).toBeCloseTo(floorHeight(m.x[0], m.z[0]) + m.lift[0], 9);
    // Mound 1 (near the spawn): the worm starts 3 u short of it, facing it (+x), and crawls past it.
    const cx = m.x[1];
    const cz = m.z[1];
    const c = new Crawl();
    const heading = Math.PI / 2;
    c.reset(undefined, createBody(c.body.length, 0.1, { x: cx - 3, y: 0, z: cz }, heading), heading);
    let top = -Infinity;
    let passed = false;
    for (let s = 0; s < 600 && !passed; s++) {
      c.step(1 / 60, { x: 0, y: 1 });
      const h = c.motion.head;
      if (Math.hypot(h.x - cx, h.z - cz) < 0.3) top = Math.max(top, h.y - litterTopHeight(h.x, h.z));
      passed = h.x > cx + 1.8;
    }
    expect(passed).toBe(true);
    // Up on the castings, over the leaves' top (the belly line is the body's underside).
    expect(top).toBeGreaterThan(0.3);
  });
});
