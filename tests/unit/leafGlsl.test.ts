import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { drapeProfile, DRAPE_FOOT } from '../../src/render/leafGlsl';
import {
  createDisturbance, recentre, stamp, packDisturbance, DIST_N, DIST_CELL, DIST_REACH, DIST_SPAN,
  type DisturbanceMap,
} from '../../src/surface/disturbance';
import { HeroWorm, type WormPose } from '../../src/worm/wormMesh';
import { BELLY_UNDER } from '../../src/worm/surfaceHeight';
import { buildLeafLitter } from '../../src/surface/leafLitterMesh';

/** The packed body nearness at (x, z), filtered as the GPU does (bilinear between cell centres). */
function sampleBody(m: DisturbanceMap, bytes: Uint8Array, x: number, z: number): number {
  const tx = (x - m.ci * DIST_CELL) / DIST_CELL - 0.5;
  const tz = (z - m.cj * DIST_CELL) / DIST_CELL - 0.5;
  const i = Math.floor(tx);
  const j = Math.floor(tz);
  const fx = tx - i;
  const fz = tz - j;
  const at = (a: number, b: number) => {
    const ia = Math.min(DIST_N - 1, Math.max(0, a));
    const jb = Math.min(DIST_N - 1, Math.max(0, b));
    return bytes[(jb * DIST_N + ia) * 4 + 2] / 255;
  };
  const top = at(i, j) * (1 - fx) + at(i + 1, j) * fx;
  const bottom = at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx;
  return top * (1 - fz) + bottom * fz;
}

describe('drapeProfile', () => {
  it('a leaf over the crawling worm clears it by 1 cm, read back through the packed map', () => {
    const n = 16;
    const worm = new HeroWorm(n);
    const mesh = worm.group.children.find((c) => c.name === 'worm') as THREE.Mesh;
    const m = createDisturbance();
    const bytes = new Uint8Array(m.data.length);
    let worst = Infinity;
    let trial = 0;
    for (const activity of [0, 0.5, 1]) {
      for (let phase = 0; phase < 1; phase += 0.1) {
        // Each pose at a different heading and sub-cell offset, against the map's grid.
        const yaw = trial * 0.71;
        const ox = (trial * 0.037) % DIST_CELL;
        const oz = (trial * 0.061) % DIST_CELL;
        trial++;
        const c = Math.cos(yaw);
        const s = Math.sin(yaw);
        const pose: WormPose = { spine: new Float32Array(n * 3), phase, activity, timeSec: phase * 7 };
        for (let i = 0; i < n; i++) pose.spine[i * 3 + 2] = -i * 0.22;
        worm.update(pose);
        m.data.fill(0);
        // Centred on the worm's middle, as the crawl centres it near there.
        recentre(m, ox + s * 1.65, oz - c * 1.65);
        // As the crawl stamps: every segment and the midpoints between them.
        for (let k = 0; k <= 2 * (n - 1); k++) {
          const z = -k * 0.11;
          stamp(m, ox - s * z, oz + c * z, 1);
        }
        packDisturbance(m, bytes);
        const p = mesh.geometry.getAttribute('position');
        for (let v = 0; v < p.count; v++) {
          const x = p.getX(v);
          const z = p.getZ(v);
          const wx = ox + c * x - s * z;
          const wz = oz + s * x + c * z;
          const read = (1 - sampleBody(m, bytes, wx, wz)) * DIST_REACH;
          worst = Math.min(worst, drapeProfile(read) - (p.getY(v) + BELLY_UNDER));
        }
      }
    }
    expect(worst).toBeGreaterThanOrEqual(0.01);
  });

  it('falls to nothing at its foot', () => {
    expect(drapeProfile(DRAPE_FOOT)).toBe(0);
    expect(drapeProfile(0)).toBeGreaterThan(0.25);
    expect(DRAPE_FOOT).toBeLessThan(DIST_SPAN);
  });
});

describe('litter leaf anchors', () => {
  it('every vertex lies within its leaf radius, and the map reaches the biggest leaf', () => {
    const litter = buildLeafLitter(1500);
    const g = litter.mesh.geometry;
    const pos = g.getAttribute('position');
    const a = g.getAttribute('aAnchor');
    let biggest = 0;
    for (let v = 0; v < pos.count; v++) {
      const r = a.getZ(v);
      biggest = Math.max(biggest, r);
      expect(Math.hypot(pos.getX(v) - a.getX(v), pos.getZ(v) - a.getY(v))).toBeLessThanOrEqual(r + 1e-4);
      expect(a.getW(v)).toBeGreaterThan(0);
    }
    // A leaf whose edge reaches the drape's foot is still on the map, so it never pops.
    expect(biggest + DRAPE_FOOT).toBeLessThan(DIST_REACH);
  });
});
