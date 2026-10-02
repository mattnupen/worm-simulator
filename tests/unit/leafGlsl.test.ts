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
import { buildDetailLeaves } from '../../src/surface/detailLeaves';
import { detailVertex, DETAIL_BOX, type DetailInputs } from '../../src/render/detailGlsl';
import { wrapAround } from '../../src/render/wrap';
import { litterTextureData } from '../../src/render/litterTexture';
import { groundTextureData } from '../../src/render/groundTexture';
import { PRESETS } from '../../src/render/graphics';

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

/** Where a leaf triangle near the worm lands, after placement and the drape: three moved points. */
type Tri = [number[], number[], number[]];

/** One worm placement: its spine (x, z), the map as the GPU sees it, and where the map's corner is. */
interface Placement { pts: number[][]; sample: MapSampler; ox: number; oz: number }

/**
 * Lays the real worm, `count` times, anywhere it lies under the leaves (random place, heading and
 * curve), stamps the map as the crawl does, and checks every leaf triangle `leaves` yields against
 * the worm's mesh vertices beneath it: each must clear the body by 5 mm.
 */
function clearance(count: number, leaves: (pl: Placement, emit: (t: Tri) => void) => void) {
  const n = 16;
  const worm = new HeroWorm(n);
  const wormMesh = worm.group.children.find((c) => c.name === 'worm') as THREE.Mesh;
  const wpos = wormMesh.geometry.getAttribute('position');
  const rng = mulberry32(2026);
  const surf: WormSurface = { y: 0, under: 0 };
  const spine = new Float32Array(n * 3);
  const pts: number[][] = [];
  const m = createDisturbance();
  const bytes = new Uint8Array(m.data.length);
  const pl: Placement = { pts, sample: samplerOf(bytes), ox: 0, oz: 0 };
  const buckets = new Map<string, number[]>();
  let placements = 0;
  let failed = 0;
  let covered = 0;
  let worst = -Infinity;
  const check = ([p0, p1, p2]: Tri) => {
    const den = (p1[2] - p2[2]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[2] - p2[2]);
    if (Math.abs(den) < 1e-9) return;
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
  };
  for (let attempt = 0; attempt < 100000 && placements < count; attempt++) {
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
    pl.ox = m.ci * DIST_CELL;
    pl.oz = m.cj * DIST_CELL;
    // Worm vertices in 10 cm buckets, to find the ones under each leaf triangle.
    buckets.clear();
    for (let v = 0; v < wpos.count; v++) {
      const key = `${Math.floor(wpos.getX(v) / 0.1)},${Math.floor(wpos.getZ(v) / 0.1)}`;
      const list = buckets.get(key);
      if (list) list.push(v);
      else buckets.set(key, [v]);
    }
    leaves(pl, check);
  }
  return { placements, covered, failed, worst };
}

describe('the drape on the real litter and the real worm', () => {
  it('every leaf over the worm clears its body by 5 mm (shipped maths, 400 placements)', () => {
    const litter = buildLeafLitter(6000);
    const g = litter.mesh.geometry;
    const pos = g.getAttribute('position');
    const anc = g.getAttribute('aAnchor');
    const dipA = g.getAttribute('aDip');
    const idx = g.getIndex()!;
    const tri: Tri = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const p = [0, 0, 0];
    const a4 = [0, 0, 0, 0];
    const r = clearance(400, ({ pts, sample, ox, oz }, emit) => {
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
          disturbVertex(sample, ox, oz, true, p, a4, dipA.getX(v), tri[c]);
        }
        emit(tri);
      }
    });
    expect(r.placements).toBe(400);
    expect(r.covered).toBeGreaterThan(10000);
    expect({ failed: r.failed, worst: r.worst }).toEqual({ failed: 0, worst: expect.any(Number) });
  }, 120000);

  it('so does every detail leaf, placed around the head as the GPU places it (400 placements)', () => {
    const detail = buildDetailLeaves(PRESETS.ultra.detail);
    const g = detail.mesh.geometry;
    const pos = g.getAttribute('position');
    const det = g.getAttribute('aDetail');
    const leaf2 = g.getAttribute('aLeaf2');
    const idx = g.getIndex()!;
    // Each leaf's vertices and triangles, both runs in leaf order (a leaf's vertices share one aDetail).
    const firstV: number[] = [];
    const leafOf = new Uint32Array(pos.count);
    for (let v = 0; v < pos.count; v++) {
      const u = firstV[firstV.length - 1];
      if (v === 0 || det.getX(v) !== det.getX(u) || det.getY(v) !== det.getY(u) || det.getW(v) !== det.getW(u)) firstV.push(v);
      leafOf[v] = firstV.length - 1;
    }
    const firstT: number[] = [];
    for (let t = 0; t < idx.count; t += 3) if (leafOf[idx.getX(t)] === firstT.length) firstT.push(t);
    firstV.push(pos.count);
    firstT.push(idx.count);
    expect(firstT.length).toBe(firstV.length);
    expect(firstV.length - 1).toBe(PRESETS.ultra.detail);
    const inp: DetailInputs = {
      focusX: 0, focusZ: 0, wrapX: 0, wrapZ: 0, litter: litterTextureData(), ground: groundTextureData(),
    };
    const placed: number[][] = Array.from({ length: 64 }, () => [0, 0, 0]);
    const tri: Tri = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const a4 = [0, 0, 0, 0];
    const lp = [0, 0, 0];
    const dv = [0, 0, 0, 0];
    let near = 0;
    const r = clearance(400, ({ pts, sample, ox, oz }, emit) => {
      // The head is the focus; the layer wraps around it snapped to the 1 m grid.
      inp.focusX = pts[0][0];
      inp.focusZ = pts[0][1];
      inp.wrapX = Math.round(pts[0][0]);
      inp.wrapZ = Math.round(pts[0][1]);
      for (let l = 0; l < firstV.length - 1; l++) {
        const v0 = firstV[l];
        // Only a leaf whose home is within reach (radius + slide + half the body) can cover the worm.
        const hx = wrapAround(det.getX(v0), inp.wrapX, DETAIL_BOX);
        const hz = wrapAround(det.getY(v0), inp.wrapZ, DETAIL_BOX);
        if (!pts.some(([x, z]) => Math.hypot(hx - x, hz - z) < 1.3)) continue;
        near++;
        dv[0] = det.getX(v0);
        dv[1] = det.getY(v0);
        dv[2] = det.getZ(v0);
        dv[3] = det.getW(v0);
        for (let v = v0; v < firstV[l + 1]; v++) {
          lp[0] = pos.getX(v);
          lp[1] = pos.getY(v);
          lp[2] = pos.getZ(v);
          detailVertex(inp, dv, lp, leaf2.getY(v), placed[v - v0], a4);
          // dip is 0: the curl only lifts a detail leaf off its rest plane. A leaf shrunk to
          // nothing skips the drape, as the shader does.
          if (a4[2] > 0) disturbVertex(sample, ox, oz, true, placed[v - v0], a4, 0, placed[v - v0]);
        }
        for (let t = firstT[l]; t < firstT[l + 1]; t += 3) {
          for (let c = 0; c < 3; c++) {
            const q = placed[idx.getX(t + c) - v0];
            tri[c][0] = q[0];
            tri[c][1] = q[1];
            tri[c][2] = q[2];
          }
          emit(tri);
        }
      }
    });
    expect(r.placements).toBe(400);
    expect(near).toBeGreaterThan(400 * 50);
    expect(r.covered).toBeGreaterThan(10000);
    expect({ failed: r.failed, worst: r.worst }).toEqual({ failed: 0, worst: expect.any(Number) });
  }, 180000);
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
