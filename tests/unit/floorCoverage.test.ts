import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { floorDrawnAt } from '../../src/surface/floorPatch';
import { FLOOR_REACH } from '../../src/render/floorMaterial';
import { occlusion, worldUpInView, OCC_SEGMENTS } from '../../src/render/occlusion';
import { occluderSegments } from '../../src/render/occluderSegments';
import { cameraAim, CAM_OPTS, CAM_OVER_TOP, type CameraAim } from '../../src/game/cameraClearance';
import { BELLY_UNDER } from '../../src/worm/surfaceHeight';
import { floorHeight, litterTopHeight } from '../../src/surface/litterDepth';
import { terrainHeight } from '../../src/surface/terrain';
import { spineDistance } from '../../src/render/nearClutterGlsl';
import { LOCOMOTION } from '../../src/game/drive';
import { mulberry32 } from '../../src/core/random';
import { Crawl, WORM_SEGMENTS } from '../../src/game/crawl';
import type { WormPose } from '../../src/worm/wormMesh';

/**
 * The floor patch draws only the cells the hole over the worm can show (floorCellShown): rays
 * cast through the hole, as the top of the litter fades, must all land on a drawn cell, or a
 * dithered pixel would show the sky through the forest floor.
 */
describe('the floor under the buried worm covers everything the hole shows (V2 spec 8.2)', () => {
  it('is under every ray the hole over the worm lets through (ray-cast sweep)', () => {
    // The real floor (terrainHeight) and a litter top d over it; the worm's head at (hx, hz) heading
    // +z, its body straight, curved or curled either way, on the floor; the camera where the crawl
    // puts it, at full reach or craned over the head, behind the worm or swung up to side-on.
    // Every pixel of the hole's box: where the top of the litter fades at all (occlusion() > 0, so
    // some dithered pixel shows through), the ray must land on a drawn cell of the floor.
    const camera = new THREE.PerspectiveCamera(60, 1366 / 768, 0.2, 120);
    const seg = new Float32Array(OCC_SEGMENTS * 8);
    const box = new Float32Array(5);
    const spine = new Float32Array(16 * 3);
    const up = new THREE.Vector3();
    const aim = {} as CameraAim;
    const dir = new THREE.Vector3();
    const v = new THREE.Vector3();
    // Where the ray first meets the floor raised by `lift`: from the plane at the head's floor,
    // refined by secant steps (the floor's slope stays under 0.25).
    const meet = (lift: number, hy: number): number => {
      const o = camera.position;
      const g = (t: number) => o.y + dir.y * t - terrainHeight(o.x + dir.x * t, o.z + dir.z * t) - lift;
      let t0 = (hy + lift - o.y) / dir.y;
      let t1 = t0 * 1.01 + 0.01;
      for (let n = 0; n < 12; n++) {
        const g0 = g(t0);
        const g1 = g(t1);
        if (Math.abs(g1) < 1e-7 || g1 === g0) break;
        const t2 = t1 - (g1 * (t1 - t0)) / (g1 - g0);
        t0 = t1;
        t1 = t2;
      }
      return t1;
    };
    let rays = 0;
    let missed = 0;
    let reach = 0;
    for (const [hx, hz] of [[0, 0], [6, -4], [-9, 7], [12, 10], [-14, -12], [3, 15], [-16, 2], [10, -15]]) for (const d of [0.2, 0.45, 0.7, 1.0, 1.2]) {
      for (const k of [0, 1.2, -1.2, 2.5, -2.5]) {
        for (const r of [0, 0.25, 0.5, 0.75, 1]) {
          for (const yawDeg of [-90, -60, -30, 0, 30, 60, 90]) {
            for (let i = 0; i < 16; i++) {
              const s = i * 0.22;
              const x = hx + (k ? (1 - Math.cos(k * s)) / k : 0);
              const z = hz + (k ? -Math.sin(k * s) / k : -s);
              spine[i * 3] = x;
              spine[i * 3 + 1] = terrainHeight(x, z) + BELLY_UNDER;
              spine[i * 3 + 2] = z;
            }
            const hy = terrainHeight(hx, hz);
            const yaw = (yawDeg * Math.PI) / 180;
            const dist = CAM_OPTS.distance * r;
            camera.position.set(
              hx - Math.sin(yaw) * dist, hy + d + CAM_OVER_TOP + CAM_OPTS.height * (1 + 0.25 * (1 - r)), hz - Math.cos(yaw) * dist,
            );
            cameraAim(r, yaw, aim);
            camera.up.set(aim.upX, aim.upY, aim.upZ);
            camera.lookAt(hx + Math.sin(yaw) * aim.ahead, hy + BELLY_UNDER + aim.above, hz + Math.cos(yaw) * aim.ahead);
            camera.updateMatrixWorld();
            const view = camera.matrixWorldInverse.elements;
            const pe = camera.projectionMatrix.elements;
            const count = occluderSegments(spine, view, pe[0], pe[5], seg, box);
            worldUpInView(view, up);
            const upA = up.toArray();
            const x0 = Math.max(-1, box[0]);
            const x1 = Math.min(1, box[2]);
            const y0 = Math.max(-1, box[1]);
            const y1 = Math.min(1, box[3]);
            for (let a = 0; a <= 40; a++) {
              for (let b = 0; b <= 40; b++) {
                const nx = x0 + ((x1 - x0) * a) / 40;
                const ny = y0 + ((y1 - y0) * b) / 40;
                dir.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
                if (dir.y >= -0.02) continue;
                v.copy(camera.position).addScaledVector(dir, meet(d, hy)).applyMatrix4(camera.matrixWorldInverse);
                if (occlusion(nx / pe[0], ny / pe[5], -v.z, seg, count, box[4], upA) <= 0) continue;
                const t = meet(0, hy);
                const fx = camera.position.x + dir.x * t;
                const fz = camera.position.z + dir.z * t;
                rays++;
                reach = Math.max(reach, spineDistance(spine, fx, fz));
                if (!floorDrawnAt(spine, view, seg, count, fx, fz)) missed++;
              }
            }
          }
        }
      }
    }
    expect(rays).toBeGreaterThan(1.5e6);
    expect(missed).toBe(0);
    // FLOOR_REACH keeps a margin over the farthest the hole shows the floor from the spine.
    expect(reach).toBeGreaterThan(2);
    expect(reach).toBeLessThan(FLOOR_REACH - 0.2);
  }, 120000);

  it('and so it is over the real forest floor, crawling with sharp turns where the body curls', () => {
    // The real crawl and camera over the real litter: the top and the floor found by marching each ray.
    const camera = new THREE.PerspectiveCamera(60, 1366 / 768, 0.2, 120);
    const seg = new Float32Array(OCC_SEGMENTS * 8);
    const box = new Float32Array(5);
    const up = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const v = new THREE.Vector3();
    const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
    const march = (h: (x: number, z: number) => number, from: number): number => {
      const o = camera.position;
      let last = from;
      for (let t = from; t < 30; t += 0.04) {
        if (o.y + dir.y * t < h(o.x + dir.x * t, o.z + dir.z * t)) {
          let lo = last;
          let hi = t;
          for (let n = 0; n < 16; n++) {
            const m = (lo + hi) / 2;
            if (o.y + dir.y * m < h(o.x + dir.x * m, o.z + dir.z * m)) hi = m;
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
    const rng = mulberry32(524);
    const H = LOCOMOTION.halfSize - 1.5;
    const move = { x: 0, y: 1 };
    let tx = 0;
    let tz = 0;
    let sharp = 0;
    let rays = 0;
    let missed = 0;
    for (let s = 0; s < 2400; s++) {
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
          const top = march(litterTopHeight, 0.2);
          if (!Number.isFinite(top)) continue;
          v.copy(camera.position).addScaledVector(dir, top).applyMatrix4(camera.matrixWorldInverse);
          if (occlusion(nx / pe[0], ny / pe[5], -v.z, seg, count, box[4], upA) <= 0) continue;
          const t = march(floorHeight, top);
          if (!Number.isFinite(t)) continue;
          rays++;
          if (!floorDrawnAt(pose.spine, view, seg, count, camera.position.x + dir.x * t, camera.position.z + dir.z * t)) missed++;
        }
      }
    }
    expect(rays).toBeGreaterThan(30000);
    expect(missed).toBe(0);
  }, 180000);
});
