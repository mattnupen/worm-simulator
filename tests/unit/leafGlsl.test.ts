import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { disturbVertex, drapeProfile, packedMapSampler, DRAPE_FOOT, type MapSampler } from '../../src/render/leafGlsl';
import {
  createDisturbance, recentre, stamp, packDisturbance, DIST_N, DIST_CELL, DIST_REACH, DIST_SPAN,
} from '../../src/surface/disturbance';
import { HeroWorm, type WormPose } from '../../src/worm/wormMesh';
import { bellyHeight, wormSurface, type WormSurface } from '../../src/worm/surfaceHeight';
import { buildLeafLitter } from '../../src/surface/leafLitterMesh';
import { mulberry32 } from '../../src/core/random';
import { buildDetailLeaves, POCKET_SHARE } from '../../src/surface/detailLeaves';
import { detailVertex, pocketCap, POCKET_BOX, type DetailInputs } from '../../src/render/detailGlsl';
import { wrapAround } from '../../src/render/wrap';
import { litterTextureData } from '../../src/render/litterTexture';
import { groundTextureData } from '../../src/render/groundTexture';
import { PRESETS } from '../../src/render/graphics';
import { REAL_SCALE } from '../../src/surface/realScale';
import { leafReach, maxLeafRadius, onTopDistance, scaledLeafCount, stampLimit } from '../../src/surface/leafScale';
import { placeLeaves } from '../../src/surface/leafLitter';
import { litterDepth } from '../../src/surface/litterDepth';
import { WORLD_HALF } from '../../src/surface/terrain';


/** Where a leaf triangle near the worm lands, after placement and the drape: three moved points. */
type Tri = [number[], number[], number[]];

/** One worm placement: its spine (x, z), the map as the GPU sees it, and where the map's corner is. */
interface Placement { pts: number[][]; sample: MapSampler; ox: number; oz: number; spine: Float32Array }

/**
 * Lays the real worm, `count` times, anywhere (random place, heading and curve: it is always buried
 * in the litter, on the floor), stamps the map as the crawl does, and checks every leaf triangle
 * `leaves` yields against the worm's mesh vertices beneath it: each must clear the body by 5 mm.
 */
function clearance(count: number, leaves: (pl: Placement, emit: (t: Tri) => void) => void) {
  const n = 16;
  const worm = new HeroWorm(n);
  const wormMesh = worm.group.children.find((c) => c.name === 'worm') as THREE.Mesh;
  const wpos = wormMesh.geometry.getAttribute('position');
  const rng = mulberry32(2026);
  const surf: WormSurface = { y: 0 };
  const spine = new Float32Array(n * 3);
  const pts: number[][] = [];
  const m = createDisturbance();
  const near = new Uint8Array(DIST_N * DIST_N * 4);
  const trail = new Uint8Array(DIST_N * DIST_N * 2);
  const pl: Placement = { pts, sample: packedMapSampler(near, trail), ox: 0, oz: 0, spine };
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
    pts.length = 0;
    for (let i = 0; i < n; i++) {
      const along = i * 0.22;
      const th = curve * along;
      const lx = curve ? (1 - Math.cos(th)) / curve : 0;
      const lz = curve ? -Math.sin(th) / curve : -along;
      const x = hx + Math.cos(yaw) * lx - Math.sin(yaw) * lz;
      const z = hz + Math.sin(yaw) * lx + Math.cos(yaw) * lz;
      wormSurface(x, z, surf);
      pts.push([x, z]);
      spine[i * 3] = x;
      spine[i * 3 + 1] = bellyHeight(surf);
      spine[i * 3 + 2] = z;
    }
    placements++;
    const pose: WormPose = { spine, phase: rng(), activity: rng() > 0.5 ? 1 : 0.3, timeSec: rng() * 7 };
    worm.update(pose);
    // Stamped as the crawl stamps it.
    m.data.fill(0);
    recentre(m, pts[7][0], pts[7][1]);
    for (let k = 0; k <= 2 * (n - 1); k++) {
      const i = k >> 1;
      const j = Math.min(n - 1, i + (k & 1));
      stamp(m, (pts[i][0] + pts[j][0]) / 2, (pts[i][1] + pts[j][1]) / 2, 1, stampLimit(), onTopDistance());
    }
    packDisturbance(m, near, trail);
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

  it('every top leaf over the buried worm stays clear of it unmoved: 5 mm or more (400 placements)', () => {
    // The chunked litter's full leaves, as the chunk writer wrote them: positions relative to each
    // chunk's mesh. They lie on the top of the litter, 2 cm or more over
    // the floor, and the disturbance map never moves them (V2 spec 8.2). Thousands of worm
    // vertices end up under a leaf triangle, so the coverage floor below is far from vacuous.
    const litter = buildLeafLitter(scaledLeafCount(PRESETS.ultra.litter));
    // A leaf can cover the head (1.54 m from body point 7) if a vertex of it is within its diameter
    // of the head.
    const reach = Math.max(3.5, 1.8 + 2 * maxLeafRadius());
    const tri: Tri = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const r = clearance(400, ({ pts }, emit) => {
      for (const ch of litter.chunks) {
        const g = ch.near.geometry;
        const pos = g.getAttribute('position');
        const idx = g.getIndex()!;
        const { x: mx, y: my, z: mz } = ch.near.position;
        for (let t = 0; t < idx.count; t += 3) {
          const a = idx.getX(t);
          if (Math.hypot(pos.getX(a) + mx - pts[7][0], pos.getZ(a) + mz - pts[7][1]) > reach) continue;
          for (let c = 0; c < 3; c++) {
            const v = idx.getX(t + c);
            tri[c][0] = pos.getX(v) + mx;
            tri[c][1] = pos.getY(v) + my;
            tri[c][2] = pos.getZ(v) + mz;
          }
          emit(tri);
        }
      }
    });
    expect(r.placements).toBe(400);
    expect(r.covered).toBeGreaterThan(10000);
    expect({ failed: r.failed, worst: r.worst }).toEqual({ failed: 0, worst: expect.any(Number) });
    // Well clear: the top of the litter is 2 cm or more over the floor in the open, the body under
    // 1.2 cm tall. Banked against a rock it may be thinner (down to ROCK_BANK_MIN), and these
    // placements ignore the rocks' collision: the closest, beside a rock, is still 5 mm clear.
    expect(r.worst).toBeLessThan(-0.1);
  }, 120000);

  it('every leaf in the worm\'s pocket clears its body by 5 mm, placed round the head and draped as the GPU does (400 placements)', () => {
    const count = scaledLeafCount(PRESETS.ultra.detail * POCKET_SHARE);
    const detail = buildDetailLeaves(count, 5, true);
    // A detail leaf's radius is at most 0.385 m at base size, times the biggest real-size growth.
    const reach = 0.9 + 0.39 * Math.max(...Object.values(REAL_SCALE.leaf));
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
    expect(firstV.length - 1).toBe(count);
    const inp: DetailInputs = {
      focusX: 0, focusZ: 0, wrapX: 0, wrapZ: 0, litter: litterTextureData(), ground: groundTextureData(),
    };
    const placed: number[][] = Array.from({ length: 64 }, () => [0, 0, 0]);
    const tri: Tri = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const a4 = [0, 0, 0, 0];
    const lp = [0, 0, 0];
    const dv = [0, 0, 0, 0];
    let near = 0;
    const r = clearance(400, ({ pts, sample, ox, oz, spine }, emit) => {
      // The head is the focus; the layer wraps around it snapped to the 1 m grid.
      inp.spine = spine;
      inp.focusX = pts[0][0];
      inp.focusZ = pts[0][1];
      inp.wrapX = Math.round(pts[0][0]);
      inp.wrapZ = Math.round(pts[0][1]);
      for (let l = 0; l < firstV.length - 1; l++) {
        const v0 = firstV[l];
        // Only a leaf whose home is within reach (radius + slide + half the body) can cover the worm.
        const hx = wrapAround(det.getX(v0), inp.wrapX, POCKET_BOX);
        const hz = wrapAround(det.getY(v0), inp.wrapZ, POCKET_BOX);
        if (!pts.some(([x, z]) => Math.hypot(hx - x, hz - z) < reach)) continue;
        near++;
        dv[0] = det.getX(v0);
        dv[1] = det.getY(v0);
        dv[2] = det.getZ(v0);
        dv[3] = det.getW(v0);
        for (let v = v0; v < firstV[l + 1]; v++) {
          lp[0] = pos.getX(v);
          lp[1] = pos.getY(v);
          lp[2] = pos.getZ(v);
          detailVertex(inp, dv, lp, leaf2.getY(v), placed[v - v0], a4, true);
          // dip is 0: the curl only lifts a detail leaf off its rest plane. A leaf shrunk to
          // nothing skips the drape, as the shader does; then the shader caps it under the top.
          if (a4[2] > 0) disturbVertex(sample, ox, oz, true, placed[v - v0], a4, 0, placed[v - v0]);
          pocketCap(inp, placed[v - v0]);
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
    expect(near).toBeGreaterThan(400 * 6);
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

describe('litter leaf sizes', () => {

  it('every vertex of both chunk shapes lies within maxLeafRadius of its leaf\'s centre, and the map reaches the biggest leaf', () => {
    // Many more than any preset draws, so the biggest leaf is about as big as any can be.
    const litter = buildLeafLitter(6000);
    const placed = placeLeaves(6000, WORLD_HALF, 1, litterDepth);
    let biggest = 0;
    let leaves = 0;
    for (const ch of litter.chunks) {
      // Full leaves: relative to the chunk's mesh, the chunk's own ends. Low detail: in world space,
      // the shared buffer's ends from the chunk's first leaf there.
      const near = { g: ch.near.geometry, at: ch.near.position, ends: ch.nearEnds, first: 0 };
      const far = { g: litter.far.all, at: new THREE.Vector3(), ends: litter.far.ends, first: ch.farFirst };
      for (const { g, at, ends, first } of [near, far]) {
        const pos = g.getAttribute('position');
        const idx = g.getIndex()!;
        for (let i = 0; i < ch.leaves.length; i++) {
          const { x, z } = placed[ch.leaves[i]];
          const p = first + i;
          let reach = 0;
          for (let t = p > 0 ? ends[p - 1] : 0; t < ends[p]; t++) {
            const v = idx.getX(t);
            reach = Math.max(reach, Math.hypot(pos.getX(v) + at.x - x, pos.getZ(v) + at.z - z));
          }
          biggest = Math.max(biggest, reach);
          leaves++;
        }
      }
    }
    expect(leaves).toBe(12000);
    // maxLeafRadius bounds every leaf, and the reach built on it (plus the drape's foot) stays on the map.
    expect(biggest).toBeLessThanOrEqual(maxLeafRadius());
    expect(biggest).toBeGreaterThan(maxLeafRadius() * 0.85);
    expect(biggest + DRAPE_FOOT).toBeLessThanOrEqual(leafReach());
    expect(leafReach()).toBeLessThan(stampLimit());
    expect(stampLimit()).toBeLessThanOrEqual(DIST_REACH);
  });
});
