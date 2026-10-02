import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { disturbVertex, drapeProfile, DRAPE_FOOT, type MapSampler } from '../../src/render/leafGlsl';
import {
  createDisturbance, recentre, stamp, packDisturbance, DIST_N, DIST_CELL, DIST_REACH, DIST_SPAN,
} from '../../src/surface/disturbance';
import { HeroWorm, type WormPose } from '../../src/worm/wormMesh';
import { bellyHeight, wormSurface, type WormSurface } from '../../src/worm/surfaceHeight';
import { buildLeafLitter } from '../../src/surface/leafLitterMesh';
import { mulberry32 } from '../../src/core/random';

/** Bilinear lookup of packed map bytes, as the GPU filters it (clamped at the edges). */
function samplerOf(bytes: Uint8Array): MapSampler {
  return (u, v, out) => {
    const tx = u * DIST_N - 0.5;
    const tz = v * DIST_N - 0.5;
    const i = Math.floor(tx);
    const j = Math.floor(tz);
    const fx = tx - i;
    const fz = tz - j;
    const at = (a: number, b: number, ch: number) =>
      bytes[(Math.min(DIST_N - 1, Math.max(0, b)) * DIST_N + Math.min(DIST_N - 1, Math.max(0, a))) * 4 + ch] / 255;
    for (let ch = 0; ch < 4; ch++) {
      const top = at(i, j, ch) * (1 - fx) + at(i + 1, j, ch) * fx;
      const bottom = at(i, j + 1, ch) * (1 - fx) + at(i + 1, j + 1, ch) * fx;
      out[ch] = top * (1 - fz) + bottom * fz;
    }
  };
}

describe('the drape on the real litter and the real worm', () => {
  it('every leaf over the worm clears its body by 5 mm (shipped maths, 400 placements)', () => {
    const n = 16;
    const litter = buildLeafLitter(6000);
    const g = litter.mesh.geometry;
    const pos = g.getAttribute('position');
    const anc = g.getAttribute('aAnchor');
    const dipA = g.getAttribute('aDip');
    const idx = g.getIndex()!;
    const worm = new HeroWorm(n);
    const wormMesh = worm.group.children.find((c) => c.name === 'worm') as THREE.Mesh;
    const wpos = wormMesh.geometry.getAttribute('position');
    const rng = mulberry32(2026);
    const surf: WormSurface = { y: 0, under: 0 };
    const spine = new Float32Array(n * 3);
    const pts: number[][] = [];
    const m = createDisturbance();
    const bytes = new Uint8Array(m.data.length);
    const sample = samplerOf(bytes);
    const moved = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const p = [0, 0, 0];
    const a4 = [0, 0, 0, 0];
    let placements = 0;
    let failed = 0;
    let covered = 0;
    let worst = -Infinity;
    for (let attempt = 0; attempt < 100000 && placements < 400; attempt++) {
      // A worm anywhere it lies under the leaves: random place, heading and curve.
      const hx = (rng() - 0.5) * 30;
      const hz = (rng() - 0.5) * 30;
      const yaw = rng() * Math.PI * 2;
      const curve = (rng() - 0.5) * 1.2;
      let under = true;
      pts.length = 0;
      for (let i = 0; i < n && under; i++) {
        const along = i * 0.22;
        const th = curve * along;
        const lx = curve ? (1 - Math.cos(th)) / curve : 0;
        const lz = curve ? -Math.sin(th) / curve : -along;
        const x = hx + Math.cos(yaw) * lx - Math.sin(yaw) * lz;
        const z = hz + Math.sin(yaw) * lx + Math.cos(yaw) * lz;
        wormSurface(x, z, true, surf);
        under = surf.under >= 0.999;
        pts.push([x, z]);
        spine[i * 3] = x;
        spine[i * 3 + 1] = bellyHeight(surf);
        spine[i * 3 + 2] = z;
      }
      if (!under) continue;
      placements++;
      const pose: WormPose = { spine, phase: rng(), activity: rng() > 0.5 ? 1 : 0.3, timeSec: rng() * 7 };
      worm.update(pose);
      // Stamped as the crawl stamps it.
      m.data.fill(0);
      recentre(m, pts[7][0], pts[7][1]);
      for (let k = 0; k <= 2 * (n - 1); k++) {
        const i = k >> 1;
        const j = Math.min(n - 1, i + (k & 1));
        stamp(m, (pts[i][0] + pts[j][0]) / 2, (pts[i][1] + pts[j][1]) / 2, 1);
      }
      packDisturbance(m, bytes);
      const ox = m.ci * DIST_CELL;
      const oz = m.cj * DIST_CELL;
      // Worm vertices in 10 cm buckets, to find the ones under each leaf triangle.
      const buckets = new Map<string, number[]>();
      for (let v = 0; v < wpos.count; v++) {
        const key = `${Math.floor(wpos.getX(v) / 0.1)},${Math.floor(wpos.getZ(v) / 0.1)}`;
        const list = buckets.get(key);
        if (list) list.push(v);
        else buckets.set(key, [v]);
      }
      for (let t = 0; t < idx.count; t += 3) {
        const a = idx.getX(t);
        if (Math.hypot(anc.getX(a) - pts[7][0], anc.getY(a) - pts[7][1]) > 3.5) continue;
        for (let c = 0; c < 3; c++) {
          const v = idx.getX(t + c);
          p[0] = pos.getX(v);
          p[1] = pos.getY(v);
          p[2] = pos.getZ(v);
          a4[0] = anc.getX(v);
          a4[1] = anc.getY(v);
          a4[2] = anc.getZ(v);
          a4[3] = anc.getW(v);
          disturbVertex(sample, ox, oz, true, p, a4, dipA.getX(v), moved[c]);
        }
        const [p0, p1, p2] = moved;
        const den = (p1[2] - p2[2]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[2] - p2[2]);
        if (Math.abs(den) < 1e-9) continue;
        const minX = Math.min(p0[0], p1[0], p2[0]);
        const maxX = Math.max(p0[0], p1[0], p2[0]);
        const minZ = Math.min(p0[2], p1[2], p2[2]);
        const maxZ = Math.max(p0[2], p1[2], p2[2]);
        for (let bx = Math.floor(minX / 0.1); bx <= Math.floor(maxX / 0.1); bx++) {
          for (let bz = Math.floor(minZ / 0.1); bz <= Math.floor(maxZ / 0.1); bz++) {
            for (const w of buckets.get(`${bx},${bz}`) ?? []) {
              const qx = wpos.getX(w);
              const qz = wpos.getZ(w);
              const l0 = ((p1[2] - p2[2]) * (qx - p2[0]) + (p2[0] - p1[0]) * (qz - p2[2])) / den;
              const l1 = ((p2[2] - p0[2]) * (qx - p2[0]) + (p0[0] - p2[0]) * (qz - p2[2])) / den;
              const l2 = 1 - l0 - l1;
              if (l0 < 0 || l1 < 0 || l2 < 0) continue;
              covered++;
              const gap = l0 * p0[1] + l1 * p1[1] + l2 * p2[1] - wpos.getY(w);
              worst = Math.max(worst, -gap);
              if (gap < 0.005) failed++;
            }
          }
        }
      }
    }
    expect(placements).toBe(400);
    expect(covered).toBeGreaterThan(10000);
    expect({ failed, worst }).toEqual({ failed: 0, worst: expect.any(Number) });
  }, 120000);
});

describe('drapeProfile', () => {
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
