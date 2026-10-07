import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createDisturbance, recentre, stampBody, packDisturbance, DIST_N, DIST_CELL, DIST_REACH, type DisturbanceMap,
} from '../../src/surface/disturbance';
import { overBody } from '../../src/surface/heroClearance';
import { PUSHER_STRIDE } from '../../src/surface/heroBody';
import type { Vec3 } from '../../src/core/vec';
import { disturbVertex, packedMapSampler } from '../../src/render/leafGlsl';
import { buildDetailLeaves, POCKET_SHARE } from '../../src/surface/detailLeaves';
import { detailVertex, type DetailInputs } from '../../src/render/detailGlsl';
import { litterTextureData } from '../../src/render/litterTexture';
import { groundTextureData } from '../../src/render/groundTexture';
import { heroLeafMatrix } from '../../src/surface/heroLeafMesh';
import { HERO_MAX } from '../../src/surface/heroLeaves';
import { PRESETS } from '../../src/render/graphics';
import { Crawl, WORM_SEGMENTS } from '../../src/game/crawl';
import { advance, createStepper } from '../../src/core/stepper';
import { AUTO_DRIVE_MOVE } from '../../src/game/drive';
import type { WormPose } from '../../src/worm/wormMesh';
import { mulberry32 } from '../../src/core/random';
import { scaledLeafCount } from '../../src/surface/leafScale';

/**
 * Leaves must move smoothly as the worm crawls under them (Matt's Step 1a playtest: "a little
 * jittery"). Measured: the body was stamped as a row of points 11 cm apart, so as they slid past
 * a leaf its reading of the body (and the hero leaves' tilt, aimed at the nearest body point)
 * scalloped at about 15 Hz; and 8-bit packing rounded the map in 6 mm steps.
 */

/** Bilinear lookup of a float map's channel at world (x, z), as the GPU filters it. */
function read(m: DisturbanceMap, data: ArrayLike<number>, x: number, z: number, ch: number): number {
  const tx = (x - m.ci * DIST_CELL) / DIST_CELL - 0.5;
  const tz = (z - m.cj * DIST_CELL) / DIST_CELL - 0.5;
  const i = Math.floor(tx);
  const j = Math.floor(tz);
  const fx = tx - i;
  const fz = tz - j;
  const at = (a: number, b: number) => data[(b * DIST_N + a) * 4 + ch];
  const top = at(i, j) * (1 - fx) + at(i + 1, j) * fx;
  const bottom = at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx;
  return top * (1 - fz) + bottom * fz;
}

/** A straight worm along +z with its head at z = s: 16 segments 0.22 apart. */
function straightBody(s: number): Vec3[] {
  return Array.from({ length: 16 }, (_, i) => ({ x: 0, y: 0, z: s - i * 0.22 }));
}

describe('the disturbance map reads the body as a smooth tube', () => {
  it('beside a straight worm gliding along its own line, body and path nearness stay level', () => {
    const under = new Float32Array(16).fill(1);
    const besides = [0.13, 0.2, 0.3, 0.45, 0.7];
    const lo = besides.map(() => [Infinity, Infinity]);
    const hi = besides.map(() => [-Infinity, -Infinity]);
    for (let s = 0; s <= 0.22; s += 0.01) {
      const m = createDisturbance();
      recentre(m, 0, -1.5);
      stampBody(m, straightBody(s), under);
      besides.forEach((x, k) => {
        // Mid-body, well away from the head and tail.
        for (const ch of [0, 2]) {
          const v = read(m, m.data, x, -1.5, ch);
          const c = ch === 0 ? 0 : 1;
          lo[k][c] = Math.min(lo[k][c], v);
          hi[k][c] = Math.max(hi[k][c], v);
        }
      });
    }
    // 0.001 / DIST_REACH of nearness is 1 mm of distance.
    besides.forEach((_, k) => {
      expect(hi[k][0] - lo[k][0]).toBeLessThan(0.001 / DIST_REACH);
      expect(hi[k][1] - lo[k][1]).toBeLessThan(0.001 / DIST_REACH);
    });
  });

  it('packs path and body in two bytes each, to within a tenth of a mm of distance; the trail in one', () => {
    const m = createDisturbance();
    for (let k = 0; k < m.data.length; k++) m.data[k] = ((k * 7919) % 10007) / 10007;
    const near = new Uint8Array(DIST_N * DIST_N * 4);
    const trail = new Uint8Array(DIST_N * DIST_N * 2);
    packDisturbance(m, near, trail);
    const sample = packedMapSampler(near, trail);
    const out = [0, 0, 0, 0];
    let worst = 0;
    let worstTrail = 0;
    for (let c = 0; c < DIST_N * DIST_N; c++) {
      // At the texel's centre the lookup reads just that texel, as the shader decodes it.
      sample(((c % DIST_N) + 0.5) / DIST_N, (Math.floor(c / DIST_N) + 0.5) / DIST_N, out);
      worst = Math.max(worst, Math.abs(out[0] - m.data[c * 4]), Math.abs(out[2] - m.data[c * 4 + 2]));
      worstTrail = Math.max(worstTrail, Math.abs(out[3] - m.data[c * 4 + 3]));
    }
    expect(worst * DIST_REACH).toBeLessThan(0.0001);
    expect(worstTrail).toBeLessThanOrEqual(0.5 / 255 + 1e-9);
  });
});

describe('a hero leaf over the body keeps its tilt steady', () => {
  it('beside a straight worm gliding along its own line, it tips the same way', () => {
    // 31 pushers (segments and midpoints, 0.11 apart), as the crawl packs them, under the litter.
    const n = 31;
    const pushers = new Float32Array(n * PUSHER_STRIDE);
    const dirs: number[] = [];
    for (let s = 0; s <= 0.11; s += 0.005) {
      for (let k = 0; k < n; k++) {
        pushers.set([0, s - k * 0.11, 0.1, k === 0 ? 1 : 0.5, 0.22, 1, 0.01, 0.05], k * PUSHER_STRIDE);
      }
      // Beside the spine, mid-body, resting above the belly: it goes over the body.
      const dir = overBody(0.12, -1.5, 0.4, 0, 0.3, 0, 0, 0.05, pushers, n, 0, true);
      expect(dir).not.toBeNaN();
      dirs.push(dir);
    }
    // Straight out from the spine (+x) every time.
    for (const d of dirs) expect(Math.abs(d - Math.PI / 2)).toBeLessThan(0.01);
  });
});

/** Share of `xs` above `t`. */
const over = (xs: number[], t: number) => xs.filter((x) => x > t).length / xs.length;
const quantile = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.floor(q * (xs.length - 1))];
/** How far a track turns back at its middle sample (0 when it keeps going): per axis, the smaller step. */
function reversal(a: ArrayLike<number>, b: ArrayLike<number>, c: ArrayLike<number>, axes: number): number {
  let o = 0;
  for (let ax = 0; ax < axes; ax++) {
    const d1 = b[ax] - a[ax];
    const d2 = c[ax] - b[ax];
    if (d1 * d2 < 0) o = Math.max(o, Math.min(Math.abs(d1), Math.abs(d2)));
  }
  return o;
}

/**
 * The crawl as the game runs it (the auto-drive's loop): a 60 Hz display with uneven frames
 * (one in seven late), 60 Hz steps and the 30 fps cap. `frame` sees every rendered frame after
 * the first 3 s, with `heroes` hero leaves shown.
 */
function crawlFrames(seconds: number, frame: (crawl: Crawl, alpha: number) => void, heroes = HERO_MAX): Crawl {
  const crawl = new Crawl();
  crawl.setHeroCount(heroes);
  const st = createStepper();
  const rng = mulberry32(7);
  let wall = 0;
  while (wall < seconds * 1000) {
    const dt = (1000 / 60) * (rng() < 0.15 ? 2 : 1) + (rng() - 0.5) * 3;
    wall += dt;
    const r = advance(st, dt, 1000 / 60, 1000 / 30);
    for (let i = 0; i < r.steps; i++) crawl.step(1 / 60, AUTO_DRIVE_MOVE.move);
    if (r.render && wall > 3000) frame(crawl, r.alpha);
  }
  return crawl;
}

// Part 0 measured Step 1a's small leaves; V1 re-measured at real leaf sizes against the same thresholds.
describe('leaves over the crawling worm move smoothly (measured frame to frame)', () => {

  it('the pocket\'s leaves (round the buried worm): on screen, few turn back by more than half a pixel', () => {
    // Every vertex of the pocket's leaves, laid round the head as the GPU lays them each frame
    // (detailVertex), then moved by the map (disturbVertex): what the map does to each, on screen.
    const g = buildDetailLeaves(scaledLeafCount(PRESETS.ultra.detail * POCKET_SHARE), 5, true).mesh.geometry;
    const pos = g.getAttribute('position');
    const det = g.getAttribute('aDetail');
    const leaf2 = g.getAttribute('aLeaf2');
    const n = pos.count;
    const inp: DetailInputs = { focusX: 0, focusZ: 0, wrapX: 0, wrapZ: 0, litter: litterTextureData(), ground: groundTextureData() };
    const camera = new THREE.PerspectiveCamera(60, 1366 / 768, 0.2, 120);
    const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
    const near = new Uint8Array(DIST_N * DIST_N * 4);
    const trail = new Uint8Array(DIST_N * DIST_N * 2);
    const sample = packedMapSampler(near, trail);
    // Per frame, each vertex's on-screen offset from where it rests (pixels at 1366 x 768): only
    // what the map does to it, not the camera's own motion. NaN: off screen (or shrunk away).
    const frames: Float32Array[] = [];
    const p = [0, 0, 0];
    const a4 = [0, 0, 0, 0];
    const d4 = [0, 0, 0, 0];
    const l3 = [0, 0, 0];
    const moved = [0, 0, 0];
    const v3 = new THREE.Vector3();
    crawlFrames(9, (crawl, alpha) => {
      crawl.interpolate(alpha, 0, pose, camera);
      camera.updateMatrixWorld();
      inp.spine = pose.spine;
      inp.focusX = crawl.focus.x;
      inp.focusZ = crawl.focus.z;
      inp.wrapX = Math.round(crawl.focus.x);
      inp.wrapZ = Math.round(crawl.focus.z);
      // As uploadDisturbance packs it, and as the GPU reads it back.
      const m = crawl.disturbance;
      packDisturbance(m, near, trail);
      const off = new Float32Array(n * 2).fill(NaN);
      for (let v = 0; v < n; v++) {
        d4[0] = det.getX(v); d4[1] = det.getY(v); d4[2] = det.getZ(v); d4[3] = det.getW(v);
        l3[0] = pos.getX(v); l3[1] = pos.getY(v); l3[2] = pos.getZ(v);
        detailVertex(inp, d4, l3, leaf2.getY(v), p, a4, true);
        // Only full-size leaves: one growing or shrinking at the edge of the pocket (POCKET_NEAR
        // to POCKET_FAR from the spine) lies under the top of the litter, where nothing shows it.
        if (a4[2] < d4[3] - 1e-9) continue;
        if (camera.position.distanceTo(v3.set(p[0], p[1], p[2])) < 0.6) continue;
        v3.project(camera);
        if (Math.abs(v3.x) > 1 || Math.abs(v3.y) > 1 || v3.z > 1) continue;
        disturbVertex(sample, m.ci * DIST_CELL, m.cj * DIST_CELL, true, p, a4, 0, moved);
        if (moved[0] === p[0] && moved[1] === p[1] && moved[2] === p[2]) {
          off[v * 2] = off[v * 2 + 1] = 0;
          continue;
        }
        const rx = v3.x;
        const ry = v3.y;
        v3.set(moved[0], moved[1], moved[2]).project(camera);
        off[v * 2] = (v3.x - rx) * 683;
        off[v * 2 + 1] = (ry - v3.y) * 384;
      }
      frames.push(off);
    });
    const back: number[] = [];
    const a = [0, 0];
    const b = [0, 0];
    const c = [0, 0];
    for (let k = 1; k + 1 < frames.length; k++) {
      for (let v = 0; v < n; v++) {
        a[0] = frames[k - 1][v * 2]; a[1] = frames[k - 1][v * 2 + 1];
        b[0] = frames[k][v * 2]; b[1] = frames[k][v * 2 + 1];
        c[0] = frames[k + 1][v * 2]; c[1] = frames[k + 1][v * 2 + 1];
        // Seen in all three frames, and moved by the map in at least one.
        if (a[0] !== a[0] || b[0] !== b[0] || c[0] !== c[0]) continue;
        if (!(a[0] || a[1] || b[0] || b[1] || c[0] || c[1])) continue;
        back.push(reversal(a, b, c, 2));
      }
    }
    expect(back.length).toBeGreaterThan(5000);
    // Only the leaves round the body, which the drape moves most (V2 measured 1.6% over half a
    // pixel, p99 1.03 px, p99.9 3.3 px; V1's detail leaves on top, the same leaves round the body,
    // 1.3%, 0.75 px and 3.3 px). V1's big litter leaves were held to 1.2% and 0.5 px.
    expect(over(back, 0.5)).toBeLessThan(0.02);
    expect(quantile(back, 0.99)).toBeLessThan(1.2);
    expect(quantile(back, 0.999)).toBeLessThan(4);
  }, 120000);

  it('hero leaves: few turn back by more than 2 mm between frames', () => {
    const m4 = new THREE.Matrix4();
    const v = new THREE.Vector3();
    // The leaves Ultra shows (the most of any preset): real-size leaves are few (scaledLeafCount:
    // 8), so it crawls 45 s for a like sample. V1 measured 2.1 to 2.2% and a p99 of 4.2 to 4.5 mm
    // over seven frame-timing seeds.
    const heroes = scaledLeafCount(PRESETS.ultra.hero);
    const seconds = 45;
    // Three points on each leaf (its centre and two near its tip), per frame.
    const tracks: number[][][] = Array.from({ length: heroes * 3 }, () => []);
    crawlFrames(seconds, (crawl, alpha) => {
      for (let i = 0; i < crawl.hero.count; i++) {
        heroLeafMatrix(crawl.hero, i, alpha, m4);
        tracks[i * 3].push(v.set(0, 0, 0).applyMatrix4(m4).toArray());
        tracks[i * 3 + 1].push(v.set(0.4, 0, -0.5).applyMatrix4(m4).toArray());
        tracks[i * 3 + 2].push(v.set(-0.4, 0, -0.5).applyMatrix4(m4).toArray());
      }
    }, heroes);
    const back: number[] = [];
    for (const tr of tracks) {
      for (let k = 1; k + 1 < tr.length; k++) {
        // A recycled leaf jumps ahead of the worm: not motion.
        if (Math.hypot(tr[k + 1][0] - tr[k][0], tr[k + 1][2] - tr[k][2]) > 0.3) continue;
        back.push(reversal(tr[k - 1], tr[k], tr[k + 1], 3));
      }
    }
    expect(back.length).toBeGreaterThan(20000);
    // Before the fix (tilted away from the nearest of points 11 cm apart): 6.8% and 28 mm.
    expect(over(back, 0.002)).toBeLessThan(0.03);
    expect(quantile(back, 0.99)).toBeLessThan(0.006);
  }, 120000);
});
