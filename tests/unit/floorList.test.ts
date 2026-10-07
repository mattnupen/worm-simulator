import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildFloorPatch, floorGridCentre, updateFloorPatch } from '../../src/surface/floorPatch';
import {
  FLOOR_CELL, FLOOR_CELL_BALL, FLOOR_KEEP, FLOOR_SEGS,
} from '../../src/render/floorMaterial';
import { OCC_REACH, OCC_SEGMENTS } from '../../src/render/occlusion';
import { occluderSegments } from '../../src/render/occluderSegments';
import { spineDistance } from '../../src/render/nearClutterGlsl';
import { terrainHeight } from '../../src/surface/terrain';
import { LOCOMOTION } from '../../src/game/drive';
import { mulberry32 } from '../../src/core/random';
import { Crawl, WORM_SEGMENTS } from '../../src/game/crawl';
import type { WormPose } from '../../src/worm/wormMesh';

/** floorCellShown as first written (Task 7): every cell tested from scratch, the reference. */
function shownFromScratch(
  spine: ArrayLike<number>, view: ArrayLike<number>, seg: ArrayLike<number>, count: number, cx: number, cz: number,
): boolean {
  if (spineDistance(spine, cx, cz) > FLOOR_KEEP) return false;
  const cy = terrainHeight(cx, cz);
  const vx = view[0] * cx + view[4] * cy + view[8] * cz + view[12];
  const vy = view[1] * cx + view[5] * cy + view[9] * cz + view[13];
  const d = -(view[2] * cx + view[6] * cy + view[10] * cz + view[14]);
  const near = d - FLOOR_CELL_BALL;
  if (near < 0.05) return true;
  const tx = vx / d;
  const ty = vy / d;
  const r = FLOOR_CELL_BALL / near;
  for (let i = 0; i < count; i++) {
    const o = i * 8;
    const abx = seg[o + 4] - seg[o];
    const aby = seg[o + 5] - seg[o + 1];
    const u = Math.min(1, Math.max(0, ((tx - seg[o]) * abx + (ty - seg[o + 1]) * aby) * seg[o + 3]));
    const q = Math.hypot(tx - seg[o] - abx * u, ty - seg[o + 1] - aby * u);
    if ((q - r) / Math.max(seg[o + 2], seg[o + 6]) < OCC_REACH) return true;
  }
  return false;
}

describe('the floor patch\'s cell list, worked out incrementally (floorList.ts)', () => {
  it('lists exactly the cells a from-scratch test keeps, every frame of a crawl with sharp turns and still spells', () => {
    const camera = new THREE.PerspectiveCamera(60, 1366 / 768, 0.2, 120);
    const seg = new Float32Array(OCC_SEGMENTS * 8);
    const box = new Float32Array(5);
    const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
    const mesh = buildFloorPatch();
    const crawl = new Crawl();
    const rng = mulberry32(91);
    const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
    const H = LOCOMOTION.halfSize - 1.5;
    const move = { x: 0, y: 1 };
    const c = [0, 0];
    const want = new Set<number>();
    let tx = 0;
    let tz = 0;
    let sharp = 0;
    let frames = 0;
    let cells = 0;
    let wrong = 0;
    for (let s = 0; s < 3600; s++) {
      if (s % 300 === 0) {
        tx = (rng() * 2 - 1) * H;
        tz = (rng() * 2 - 1) * H;
        sharp = rng() < 0.5 ? 0 : rng() < 0.5 ? -1 : 1;
      }
      const h = crawl.motion.head;
      move.x = s % 300 < 120 && sharp ? sharp : Math.max(-1, Math.min(1, -wrap(Math.atan2(tx - h.x, tz - h.z) - crawl.motion.heading) * 3));
      // A still spell every so often: the worm stops, then the list must not go stale.
      if (s % 600 >= 500) move.y = 0;
      else move.y = 1;
      crawl.step(1 / 60, move);
      crawl.interpolate(1, 0, pose, camera);
      camera.updateMatrixWorld();
      const view = camera.matrixWorldInverse.elements;
      const pe = camera.projectionMatrix.elements;
      const count = occluderSegments(pose.spine, view, pe[0], pe[5], seg, box);
      const k = updateFloorPatch(mesh, pose.spine, view, seg, count);
      if (s % 3 !== 0) continue;
      frames++;
      floorGridCentre(pose.spine, c);
      want.clear();
      for (let j = 0; j < FLOOR_SEGS; j++) {
        for (let i = 0; i < FLOOR_SEGS; i++) {
          const cx = c[0] + (i - FLOOR_SEGS / 2 + 0.5) * FLOOR_CELL;
          const cz = c[1] + (j - FLOOR_SEGS / 2 + 0.5) * FLOOR_CELL;
          if (shownFromScratch(pose.spine, view, seg, count, cx, cz)) want.add(j * FLOOR_SEGS + i);
        }
      }
      const idx = mesh.geometry.index!.array;
      expect(mesh.geometry.drawRange.count).toBe(k * 6);
      if (k !== want.size) wrong++;
      // Ascending (so distinct), and each one wanted: with the count, the same set.
      for (let t = 0; t < k * 6; t += 6) {
        if (!want.has(idx[t] / 4)) wrong++;
        if (t > 0 && idx[t] <= idx[t - 6]) wrong++;
      }
      cells += k;
    }
    expect(frames).toBe(1200);
    expect(cells / frames).toBeGreaterThan(100);
    expect(wrong).toBe(0);
  }, 300000);
});
