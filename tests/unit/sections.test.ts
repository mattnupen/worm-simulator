import { describe, it, expect } from 'vitest';
import { createSection, logSection, rockSection, type Section } from '../../src/underground/sections';
import { sectionDepth } from '../../src/underground/solidShapes';
import { createSlab, slabU, type Slab } from '../../src/underground/slab';
import { createSolids, placeSolids } from '../../src/underground/solids';
import { MeshWriter } from '../../src/surface/meshWriter';
import { writeRock } from '../../src/surface/propGeometry';
import { writeHeroLog } from '../../src/surface/trunkGeometry';
import { mulberry32 } from '../../src/core/random';
import { heroLog, rocks, ROCK_FOOT } from '../../src/surface/propPlacement';
import { rockRise, rockSeed } from '../../src/surface/rockShape';
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
    expect(turn).toBeGreaterThan(-1e-5); // convex, counter-clockwise (to the float32 points)
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

  it('the log\'s section is the drawn log cut by the plane: square across, slanting, and past its ends', () => {
    const log = heroLog();
    const w = new MeshWriter('aBark', 4);
    writeHeroLog(w);
    const rand = mulberry32(21);
    let found = 0;
    let pastEnd = 0;
    let shallow = 0;
    for (let n = 0; n < 1500; n++) {
      // Spots off the log (its footprint plus 0.5), heading any way; half of them near its broken ends.
      const x = n % 2 ? (rand() < 0.5 ? -1 : 1) * (12 + rand() * 6.5) : rand() * 36 - 18;
      const z = log.z - (log.radius * 1.15 + 0.5 + rand() * 6); // the far side is past the play edge
      const s = createSlab(x, z, rand() * Math.PI * 2, 1, 7);
      const cut = { u: 0, v: 0, rx: 0, ry: 0 };
      const sec = createSection();
      const pts = meshCut(s, w).filter(([u]) => u > s.faceLo && u < s.faceHi);
      const has = logSection(s, cut, sec);
      // Wherever the drawn log meets the face, there is a section.
      if (pts.length > 2 && Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])) > 0.05) expect(has).toBe(true);
      if (!has) continue;
      found++;
      outlineOk(sec);
      // No bark outside the outline; every corner of the outline is where the plane cuts the bark.
      const all = meshCut(s, w);
      for (const [u, v] of all) expect(depth(sec, u, v)).toBeGreaterThan(-0.02);
      for (let c = 0; c < sec.count; c++) {
        const near = Math.min(...all.map(([u, v]) => Math.hypot(u - sec.pts[c * 2], v - sec.pts[c * 2 + 1])));
        expect(near).toBeLessThan(1e-4);
      }
      const dx = Math.cos(log.yaw);
      const dz = Math.sin(log.yaw);
      const sin = dx * s.tz - dz * s.tx;
      const slant = Math.abs(sin);
      // Where the cut crosses the log's middle line, well between its ends, it is the log's whole
      // ellipse (its radius varies 0.87-1.15 of the log's along it, as drawn).
      const a = -((log.x - s.ox) * s.tz - (log.z - s.oz) * s.tx) / sin;
      if (Math.abs(a) < log.length / 2 - (1.2 * log.radius * Math.sqrt(1 - slant * slant)) / slant - 0.5) {
        expect(cut.ry).toBeGreaterThan(log.radius * 0.8);
        expect(cut.ry).toBeLessThan(log.radius * 1.2);
        expect(Math.abs(cut.rx * slant - cut.ry) / cut.ry).toBeLessThan(0.15);
      } else pastEnd++;
      if (slant < 0.45) shallow++;
    }
    expect(found).toBeGreaterThan(200);
    expect(pastEnd).toBeGreaterThan(20);
    expect(shallow).toBeGreaterThan(20);
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
