import { describe, it, expect } from 'vitest';
import { MeshWriter, icosphere } from '../../src/surface/meshWriter';
import { writeRock } from '../../src/surface/propGeometry';
import { rockRise, rockSeed } from '../../src/surface/rockShape';
import { rocks } from '../../src/surface/propPlacement';
import { terrainHeight } from '../../src/surface/terrain';
import { litterTopHeight } from '../../src/surface/litterDepth';

/** Raster cell (about 2 mm). */
const CELL = 0.05;

/**
 * Rasterizes the `i`th rock exactly as drawn (writeRock) from above, and finds where its surface
 * meets the drawn top of the litter: the highest the litter reaches against it. Returns the
 * rock's height over the soil at its centre, its top, and that level.
 */
function bank(i: number): { rise: number; top: number; level: number; showing: number } {
  const k = rocks()[i];
  const w = new MeshWriter('aProp', 4);
  writeRock(w, k.x, k.z, k.size, rockSeed(i));
  const p = w.pos;
  let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity; let top = -Infinity;
  for (let v = 0; v < p.length; v += 3) {
    x0 = Math.min(x0, p[v]); x1 = Math.max(x1, p[v]);
    z0 = Math.min(z0, p[v + 2]); z1 = Math.max(z1, p[v + 2]);
    top = Math.max(top, p[v + 1]);
  }
  const nx = Math.ceil((x1 - x0) / CELL) + 3;
  const nz = Math.ceil((z1 - z0) / CELL) + 3;
  const ox = x0 - CELL;
  const oz = z0 - CELL;
  // The rock's upper surface over each cell centre (-Infinity off the rock).
  const surf = new Float64Array(nx * nz).fill(-Infinity);
  for (let t = 0; t < w.idx.length; t += 3) {
    const [a, b, c] = [w.idx[t] * 3, w.idx[t + 1] * 3, w.idx[t + 2] * 3];
    const ax = p[a]; const az = p[a + 2]; const bx = p[b]; const bz = p[b + 2]; const cx = p[c]; const cz = p[c + 2];
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(det) < 1e-12) continue;
    const i0 = Math.floor((Math.min(ax, bx, cx) - ox) / CELL);
    const i1 = Math.ceil((Math.max(ax, bx, cx) - ox) / CELL);
    const j0 = Math.floor((Math.min(az, bz, cz) - oz) / CELL);
    const j1 = Math.ceil((Math.max(az, bz, cz) - oz) / CELL);
    for (let j = j0; j <= j1; j++) {
      for (let ii = i0; ii <= i1; ii++) {
        const x = ox + (ii + 0.5) * CELL;
        const z = oz + (j + 0.5) * CELL;
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
        const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        const y = l1 * p[a + 1] + l2 * p[b + 1] + l3 * p[c + 1];
        surf[j * nx + ii] = Math.max(surf[j * nx + ii], y);
      }
    }
  }
  const litter = new Float64Array(nx * nz);
  const shows = new Uint8Array(nx * nz);
  let showing = 0;
  for (let j = 0; j < nz; j++) {
    for (let ii = 0; ii < nx; ii++) {
      const c = j * nx + ii;
      litter[c] = litterTopHeight(ox + (ii + 0.5) * CELL, oz + (j + 0.5) * CELL);
      shows[c] = surf[c] > litter[c] ? 1 : 0;
      showing += shows[c];
    }
  }
  // The contact line: showing cells beside a buried one (or bare litter). The litter there is level with the rock.
  let level = -Infinity;
  for (let j = 1; j < nz - 1; j++) {
    for (let ii = 1; ii < nx - 1; ii++) {
      const c = j * nx + ii;
      if (shows[c] && !(shows[c - 1] && shows[c + 1] && shows[c - nx] && shows[c + nx])) level = Math.max(level, litter[c]);
    }
  }
  return { rise: top - terrainHeight(k.x, k.z), top, level, showing };
}

describe('the litter banks against every rock as drawn, never burying it (V2 spec 8.2)', () => {
  it('at least half of every drawn rock\'s height shows above the drawn top of the litter', () => {
    rocks().forEach((k, i) => {
      const b = bank(i);
      // The raster is real: the rock covers cells and shows through the litter.
      expect(b.showing).toBeGreaterThan(50);
      expect(b.rise).toBeCloseTo(rockRise(k.size, rockSeed(i)), 9);
      // Even where the litter rises highest against it (its contact line), half the rock stands clear.
      expect((b.top - b.level) / b.rise, `rock ${i} (size ${k.size})`).toBeGreaterThanOrEqual(0.5 - 0.005);
    });
  });
});

describe('rockShape: the drawn rock\'s shape as pure maths', () => {
  it('writeRock lays every vertex exactly as before the shape moved out (bit for bit)', () => {
    const { pos } = icosphere();
    rocks().forEach((k, i) => {
      const seed = rockSeed(i);
      const w = new MeshWriter('aProp', 4);
      writeRock(w, k.x, k.z, k.size, seed);
      const g = terrainHeight(k.x, k.z);
      const c = Math.cos(seed * Math.PI * 2);
      const s = Math.sin(seed * Math.PI * 2);
      for (let v = 0; v < pos.length; v += 3) {
        const [dx, dy, dz] = [pos[v], pos[v + 1], pos[v + 2]];
        // The formula as it stood inline in writeRock.
        const lump = 1 + 0.16 * Math.sin(2.7 * dx + 1.9 * dz + seed * 17) * Math.cos(2.1 * dy + seed * 5) + 0.07 * Math.sin(6.1 * dx - 5.3 * dz);
        const lx = dx * k.size * lump * 1.15;
        const lz = dz * k.size * lump * 0.9;
        const ly = Math.max(dy, -0.35) * k.size * lump * 0.62;
        expect(w.pos[v]).toBe(k.x + lx * c - lz * s);
        expect(w.pos[v + 1]).toBe(g - k.size * 0.18 + ly);
        expect(w.pos[v + 2]).toBe(k.z + lx * s + lz * c);
      }
    });
  });

  it('rockRise is the drawn rock\'s top over the soil at its centre, from the same 42 vertices, without three.js', () => {
    rocks().forEach((k, i) => {
      const w = new MeshWriter('aProp', 4);
      writeRock(w, k.x, k.z, k.size, rockSeed(i));
      let top = -Infinity;
      for (let v = 1; v < w.pos.length; v += 3) top = Math.max(top, w.pos[v]);
      expect(rockRise(k.size, rockSeed(i))).toBeCloseTo(top - terrainHeight(k.x, k.z), 12);
    });
  });
});
