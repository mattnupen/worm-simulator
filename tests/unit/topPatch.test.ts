import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildTopPatch, cellBalls, pickTopCells, TOP_PATCH_MAX } from '../../src/surface/topPatch';
import { ballMayFade, type FadeFrame } from '../../src/render/fadeBall';
import { buildTerrain, heightGrid } from '../../src/surface/terrainMesh';
import { cellOf } from '../../src/surface/meshGrid';
import { occlusion, worldUpInView, OCC_SEGMENTS } from '../../src/render/occlusion';
import { occluderSegments } from '../../src/render/occluderSegments';
import { litterTopHeight } from '../../src/surface/litterDepth';
import { GROUND_ORDER } from '../../src/render/drawOrder';
import { LOCOMOTION } from '../../src/game/drive';
import { mulberry32 } from '../../src/core/random';
import { Crawl, WORM_SEGMENTS } from '../../src/game/crawl';
import type { WormPose } from '../../src/worm/wormMesh';

const { lines, heights } = heightGrid();
const n = lines.length;
const cells = (n - 1) * (n - 1);

/** Per cell, how many of the terrain's and the patch's triangles draw it (0, 1 or 2 each). */
function drawnBy(index: ArrayLike<number>, from: number, count: number, out: Uint8Array): void {
  for (let t = from; t < from + count; t += 3) {
    const a = index[t];
    const b = index[t + 1];
    const c = index[t + 2];
    if (a === b || b === c || a === c) continue;
    // The cell's (i, j): the lowest column and row among its corners.
    const i = Math.min(a % n, b % n, c % n);
    const j = Math.min(Math.floor(a / n), Math.floor(b / n), Math.floor(c / n));
    out[j * (n - 1) + i]++;
  }
}

describe('the top of the litter over the worm: the terrain and its patch (V2 spec 8.2)', () => {
  it('orders the terrain index buffer by cell: cell c\'s two triangles at 6c to 6c + 5', () => {
    const index = buildTerrain().geometry.index!.array;
    for (let c = 0; c < cells; c++) {
      const i = c % (n - 1);
      const a = ((c - i) / (n - 1)) * n + i;
      expect(Array.from(index.slice(c * 6, c * 6 + 6))).toEqual([a, a + n, a + 1, a + 1, a + n, a + n + 1]);
    }
  });

  it('holds each cell, both its triangles, in its ball', () => {
    const balls = cellBalls(lines, heights);
    for (let c = 0; c < cells; c += 7) {
      const i = c % (n - 1);
      const j = (c - i) / (n - 1);
      for (let k = 0; k < 4; k++) {
        const x = lines[i + (k & 1)];
        const z = lines[j + (k >> 1)];
        const y = heights[(j + (k >> 1)) * n + i + (k & 1)];
        expect(Math.hypot(x - balls[c * 4], y - balls[c * 4 + 1], z - balls[c * 4 + 2])).toBeLessThan(balls[c * 4 + 3]);
      }
    }
  });

  it('shares the terrain\'s vertex buffers and carries the fade the terrain no longer has', () => {
    const terrain = buildTerrain();
    const top = buildTopPatch(terrain, lines, heights);
    for (const a of ['position', 'normal', 'color']) {
      expect(top.mesh.geometry.getAttribute(a)).toBe(terrain.geometry.getAttribute(a));
    }
    expect((terrain.material as THREE.ShaderMaterial).defines).not.toHaveProperty('OCCLUDE');
    expect((top.mesh.material as THREE.ShaderMaterial).defines).toHaveProperty('OCCLUDE');
    expect(top.mesh.renderOrder).toBe(GROUND_ORDER);
    expect(top.count).toBe(0);
  });

  it('crawling over the real litter: every cell is drawn once, and every pixel the fade drops is the patch\'s', () => {
    const camera = new THREE.PerspectiveCamera(60, 1366 / 768, 0.2, 120);
    const seg = new Float32Array(OCC_SEGMENTS * 8);
    const box = new Float32Array(5);
    const up = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const v = new THREE.Vector3();
    const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
    const terrain = buildTerrain();
    const top = buildTopPatch(terrain, lines, heights);
    const main = terrain.geometry.index!.array;
    const patch = top.mesh.geometry.index!.array;
    const seen = new Uint8Array(cells);
    const inPatch = new Uint8Array(cells);
    const march = (from: number): number => {
      const o = camera.position;
      let last = from;
      for (let t = from; t < 30; t += 0.04) {
        if (o.y + dir.y * t < litterTopHeight(o.x + dir.x * t, o.z + dir.z * t)) {
          let lo = last;
          let hi = t;
          for (let k = 0; k < 16; k++) {
            const m = (lo + hi) / 2;
            if (o.y + dir.y * m < litterTopHeight(o.x + dir.x * m, o.z + dir.z * m)) hi = m;
            else lo = m;
          }
          return hi;
        }
        last = t;
      }
      return NaN;
    };
    const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
    const crawl = new Crawl();
    const rng = mulberry32(611);
    const H = LOCOMOTION.halfSize - 1.5;
    const move = { x: 0, y: 1 };
    let tx = 0;
    let tz = 0;
    let sharp = 0;
    let rays = 0;
    let missed = 0;
    let frames = 0;
    let most = 0;
    // 3000 steps, not 2400 (V4 hot fix): the worm now crawls up over rocks and the log, out of the
    // litter, so the same course spends less time buried; the longer drive keeps the sample as big.
    for (let s = 0; s < 3000; s++) {
      if (s % 300 === 0) {
        tx = (rng() * 2 - 1) * H;
        tz = (rng() * 2 - 1) * H;
        sharp = rng() < 0.5 ? 0 : rng() < 0.5 ? -1 : 1;
      }
      const h = crawl.motion.head;
      move.x = s % 300 < 120 && sharp ? sharp : Math.max(-1, Math.min(1, -wrap(Math.atan2(tx - h.x, tz - h.z) - crawl.motion.heading) * 3));
      crawl.step(1 / 60, move);
      if (s % 12 !== 0 || s < 120) continue;
      crawl.interpolate(1, 0, pose, camera);
      camera.updateMatrixWorld();
      const view = camera.matrixWorldInverse.elements;
      const pe = camera.projectionMatrix.elements;
      const count = occluderSegments(pose.spine, view, pe[0], pe[5], seg, box);
      worldUpInView(view, up);
      const upA = up.toArray();
      const fade: FadeFrame = { view, seg, count, far: box[4] };
      top.update(fade, camera.position.x, camera.position.z, pose.spine);
      frames++;
      most = Math.max(most, top.count);
      // No double draw and no gap: the terrain and the patch draw every cell once between them.
      seen.fill(0);
      drawnBy(main, 0, main.length, seen);
      drawnBy(patch, 0, top.mesh.geometry.drawRange.count, seen);
      for (let c = 0; c < cells; c++) if (seen[c] !== 2) throw new Error(`cell ${c} drawn by ${seen[c]} triangles`);
      inPatch.fill(0);
      for (let a = 0; a < top.count; a++) inPatch[top.cells[a]] = 1;
      // Every pixel of the hole's box where the top fades lies on a cell of the patch.
      const x0 = Math.max(-1, box[0]);
      const x1 = Math.min(1, box[2]);
      const y0 = Math.max(-1, box[1]);
      const y1 = Math.min(1, box[3]);
      for (let a = 0; a <= 24; a++) {
        for (let b = 0; b <= 24; b++) {
          const nx = x0 + ((x1 - x0) * a) / 24;
          const ny = y0 + ((y1 - y0) * b) / 24;
          dir.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
          if (dir.y >= 0) continue;
          const t = march(0.2);
          if (!Number.isFinite(t)) continue;
          v.copy(camera.position).addScaledVector(dir, t).applyMatrix4(camera.matrixWorldInverse);
          if (occlusion(nx / pe[0], ny / pe[5], -v.z, seg, count, box[4], upA) <= 0) continue;
          rays++;
          const px = camera.position.x + dir.x * t;
          const pz = camera.position.z + dir.z * t;
          if (!inPatch[cellOf(lines, pz) * (n - 1) + cellOf(lines, px)]) missed++;
        }
      }
    }
    expect(frames).toBeGreaterThan(150);
    expect(rays).toBeGreaterThan(30000);
    expect(missed).toBe(0);
    // The patch stays small (it pays for the discard) and well inside its buffer.
    expect(most).toBeGreaterThan(10);
    expect(most).toBeLessThan(TOP_PATCH_MAX / 4);
  }, 180000);

  it('picks nothing with no body on screen, and rejects a ball behind the whole body', () => {
    const out = new Int32Array(8);
    const balls = cellBalls(lines, heights);
    const id = new THREE.Matrix4().elements;
    const none: FadeFrame = { view: id, seg: new Float32Array(8), count: 0, far: 5 };
    expect(pickTopCells(lines, balls, none, 0, 0, new Float32Array(48), out)).toBe(0);
    // One segment straight ahead at depth 2 (tan space (0, 0) to (0.1, 0)): a ball at depth 5 is behind it.
    const f: FadeFrame = { view: id, seg: new Float32Array([0, 0, 0.5, 100, 0.1, 0, 0.5, 0]), count: 1, far: 2 };
    expect(ballMayFade(f, 0, 0, -5, 0.3)).toBe(false);
    expect(ballMayFade(f, 0, 0, -1.5, 0.3)).toBe(true);
    // Far to the side of it on screen: no.
    expect(ballMayFade(f, 1.5, 0, -1.5, 0.3)).toBe(false);
  });
});
