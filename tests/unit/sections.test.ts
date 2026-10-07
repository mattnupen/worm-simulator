import { describe, it, expect } from 'vitest';
import { createSection, logSection, rockSection, type Section } from '../../src/underground/sections';
import { sectionDepth } from '../../src/underground/solidShapes';
import { createSlab, slabU, type Slab } from '../../src/underground/slab';
import { createSolids, placeSolids } from '../../src/underground/solids';
import { MeshWriter } from '../../src/surface/meshWriter';
import { writeRock } from '../../src/surface/propGeometry';
import { BARK, writeLog } from '../../src/surface/trunkGeometry';
import { heroLog, rocks, ROCK_FOOT } from '../../src/surface/propPlacement';
import { rockRise, rockSeed } from '../../src/surface/rockShape';
import { REAL_SCALE } from '../../src/surface/realScale';
import { terrainHeight } from '../../src/surface/terrain';

const hit = { nu: 0, nv: 0 };
/** Signed distance into the outline (outside: negative), also just outside its box. */
const depth = (sec: Section, u: number, v: number) => sectionDepth(sec, u, v, 1, hit) - 1;

/** Where the cut plane slices a drawn mesh: every crossing of a triangle edge, as (u, height). */
function meshCut(s: Slab, w: MeshWriter): [number, number][] {
  const p = w.pos;
  const side = (i: number) => (p[i * 3] - s.ox) * s.nx + (p[i * 3 + 2] - s.oz) * s.nz;
  const out: [number, number][] = [];
  for (let t = 0; t < w.idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = w.idx[t + e];
      const b = w.idx[t + ((e + 1) % 3)];
      const da = side(a);
      const db = side(b);
      if (da < 0 === db < 0) continue;
      const f = da / (da - db);
      const x = p[a * 3] + (p[b * 3] - p[a * 3]) * f;
      const z = p[a * 3 + 2] + (p[b * 3 + 2] - p[a * 3 + 2]) * f;
      out.push([slabU(s, x, z), p[a * 3 + 1] + (p[b * 3 + 1] - p[a * 3 + 1]) * f]);
    }
  }
  return out;
}

/** A slab dug `back` u before (x, z), heading so its cut runs through it, shifted `across`. */
function slabThrough(x: number, z: number, heading: number, back: number, across: number): Slab {
  const tx = Math.sin(heading);
  const tz = Math.cos(heading);
  return createSlab(x - tx * back + tz * across, z - tz * back - tx * across, heading, 1, 7);
}

const outlineOk = (sec: Section) => {
  for (let k = 0; k < sec.count; k++) {
    const j = (k + 1) % sec.count;
    const k2 = (k + 2) % sec.count;
    const turn = (sec.pts[j * 2] - sec.pts[k * 2]) * (sec.pts[k2 * 2 + 1] - sec.pts[k * 2 + 1])
      - (sec.pts[j * 2 + 1] - sec.pts[k * 2 + 1]) * (sec.pts[k2 * 2] - sec.pts[k * 2]);
    expect(turn).toBeGreaterThan(-1e-9); // convex, counter-clockwise
  }
};

describe('rocks and the log in section match the drawn props (spec 5.2)', () => {
  it('a rock\'s section is the drawn rock\'s mesh cut by the plane', () => {
    rocks().forEach((k, i) => {
      for (const [heading, across] of [[0, 0], [0.7, 0.35 * k.size], [2.2, -0.6 * k.size]]) {
        const s = slabThrough(k.x, k.z, heading, k.size * ROCK_FOOT + 1, across);
        const sec = createSection();
        expect(rockSection(s, i, sec)).toBe(true);
        outlineOk(sec);
        const w = new MeshWriter('aProp', 4);
        writeRock(w, k.x, k.z, k.size, rockSeed(i));
        const cut = meshCut(s, w);
        // Every point where the plane cuts the mesh lies on the outline or inside it (the hull)...
        for (const [u, v] of cut) expect(depth(sec, u, v)).toBeGreaterThan(-1e-4);
        // ...and every corner of the outline is one of them.
        for (let c = 0; c < sec.count; c++) {
          const near = Math.min(...cut.map(([u, v]) => Math.hypot(u - sec.pts[c * 2], v - sec.pts[c * 2 + 1])));
          expect(near).toBeLessThan(1e-4);
        }
        // Through the middle: as high as the drawn rock stands, and sunk into the soil.
        if (across === 0) {
          expect(sec.vHi).toBeCloseTo(terrainHeight(k.x, k.z) + rockRise(k.size, rockSeed(i)), 1);
          expect(sec.vLo).toBeLessThan(terrainHeight(k.x, k.z) - 0.3 * k.size);
        }
      }
    });
  });

  it('a cut that misses a rock has no section of it', () => {
    const k = rocks()[0];
    const s = slabThrough(k.x, k.z, 0, k.size * ROCK_FOOT + 1, 1.6 * k.size);
    expect(rockSection(s, 0, createSection())).toBe(false);
  });

  it('the log\'s section follows the drawn log, square across or slanting', () => {
    const log = heroLog();
    for (const heading of [0, 0.8, 1.15, Math.PI - 0.5]) {
      const s = slabThrough(log.x + 1.5, log.z, heading, log.radius * 1.15 + 1.2 + 0.3, 0);
      const cut = { u: 0, v: 0, rx: 0, ry: 0 };
      const sec = createSection();
      expect(logSection(s, cut, sec)).toBe(true);
      outlineOk(sec);
      const slant = Math.abs(Math.cos(heading));
      expect(cut.ry).toBeGreaterThan(log.radius * 0.85);
      expect(cut.ry).toBeLessThan(log.radius * 1.15);
      expect(cut.rx).toBeCloseTo(cut.ry / slant, 6);
      const w = new MeshWriter('aBark', 4);
      writeLog(w, log.x, log.z, log.yaw, log.length, log.radius, BARK.birch, 1.62, terrainHeight, REAL_SCALE.log);
      // The drawn log is 12-sided: its section lies on the outline or just inside (by its flat faces).
      const pts = meshCut(s, w);
      expect(pts.length).toBeGreaterThan(12);
      for (const [u, v] of pts) {
        const d = depth(sec, u, v);
        expect(d).toBeGreaterThan(-0.02);
        expect(d).toBeLessThan((0.04 * log.radius) / slant);
      }
      // And it reaches as far: the outline's ends and top match the mesh's.
      expect(Math.max(...pts.map((p) => p[1]))).toBeCloseTo(sec.vHi, 0);
      expect(Math.max(...pts.map((p) => p[0]))).toBeGreaterThan(sec.uHi - 0.2 / slant);
      expect(Math.min(...pts.map((p) => p[0]))).toBeLessThan(sec.uLo + 0.2 / slant);
    }
  });

  it('a slab heading across the log shows its section (and collides with it)', () => {
    const log = heroLog();
    const s = slabThrough(log.x - 3, log.z, 0.3, 4.4, 0);
    const o = placeSolids(s, createSolids());
    expect(o.log.rx).toBeGreaterThan(0);
    expect(Math.abs(o.log.u)).toBeLessThan(log.radius * 1.15 + 6);
    expect(Array.from(o.sections.slice(0, o.sectionCount)).some((q) => q.rock === -1)).toBe(true);
  });
});
