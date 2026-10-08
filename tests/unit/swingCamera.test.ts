import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { swingPose, CLIP_FROM, TURN_BY } from '../../src/underground/swingCamera';
import { cutPose, CUT_MARGIN, FOV_DEG, type CutPose } from '../../src/underground/cutCamera';
import { cameraProgress } from '../../src/underground/modeMachine';
import { boundaryAt, slabU, B_TOP, type Slab } from '../../src/underground/slab';
import { FACE_BELOW } from '../../src/underground/cutFrame';
import { FACE_FADE } from '../../src/underground/faceLight';
import { litterTopHeight } from '../../src/surface/litterDepth';
import type { WormPose } from '../../src/worm/wormMesh';
import { DT, N, STILL, makeGame, press, run, steerToTop } from './burrowPlay';
import type { BurrowGame } from '../../src/underground/burrowGame';

const ASPECT = 1366 / 768;
const pose: WormPose = { spine: new Float32Array(N * 3), phase: 0, activity: 0, timeSec: 0 };

interface Frame { p: number; cam: THREE.PerspectiveCamera; ahead: number; s: Slab; head: THREE.Vector3; surf: THREE.Camera; cp: CutPose }

/** The swing as cutScene draws it at the end of the step (alpha 1). */
function frameOf(game: BurrowGame): Frame {
  const surf = new THREE.PerspectiveCamera(FOV_DEG, ASPECT, 0.2, 120);
  game.crawl.interpolate(1, 0, pose, surf);
  const s = game.slab!;
  const c = game.cam;
  const cp = cutPose(s, c.cu.value, c.cv.value, c.h.value, c.pitch.value, { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0 });
  const head = new THREE.Vector3(game.crawl.focus.x, game.crawl.focus.y, game.crawl.focus.z);
  let keep = 0;
  for (let i = 0; i < N; i++) keep = Math.max(keep, game.offW[i]);
  const cam = new THREE.PerspectiveCamera(FOV_DEG, ASPECT, 0.2, 120);
  const p = cameraProgress(game.mode);
  const ahead = swingPose(surf, head, cp, s, p, CUT_MARGIN + keep, cam);
  cam.updateMatrixWorld();
  return { p, cam, ahead, s, head, surf, cp };
}

/** Every frame of a dig down and the come up after it, from a few places. */
function swings(): Frame[][] {
  const out: Frame[][] = [];
  for (const [x, y] of [[0.4, 1], [-0.6, 1], [0, 1]] as const) {
    const { game } = makeGame();
    run(game, 0.8, { x, y });
    press(game);
    const down: Frame[] = [];
    for (let k = 0; k < 600 && game.mode.mode === 'diggingDown'; k++) { game.step(DT, STILL, false); if (game.mode.mode === 'diggingDown') down.push(frameOf(game)); }
    steerToTop(game);
    press(game);
    const up: Frame[] = [];
    for (let k = 0; k < 600 && game.mode.mode === 'comingUp'; k++) { game.step(DT, STILL, false); if (game.mode.mode === 'comingUp') up.push(frameOf(game)); }
    out.push(down, up);
  }
  return out;
}
const all = swings();

/** The angle (degrees) between the camera's level view and square on to the cut. */
function offSquare(f: Frame): number {
  const d = new THREE.Vector3(0, 0, -1).applyQuaternion(f.cam.quaternion);
  return (Math.acos(Math.min(1, -(d.x * f.s.nx + d.z * f.s.nz) / Math.hypot(d.x, d.z))) * 180) / Math.PI;
}

describe('the camera\'s swing between the surface and the cut (swingCamera.ts)', () => {
  it('starts exactly on the surface camera and ends exactly on the cut camera', () => {
    const f = all[0][0];
    const cam = new THREE.PerspectiveCamera();
    expect(swingPose(f.surf, f.head, f.cp, f.s, 0, CUT_MARGIN, cam)).toBe(Infinity);
    expect(cam.position.distanceTo(f.surf.position)).toBeLessThan(1e-9);
    expect(cam.quaternion.angleTo(f.surf.quaternion)).toBeLessThan(1e-6);
    expect(swingPose(f.surf, f.head, f.cp, f.s, 1, CUT_MARGIN, cam)).toBeCloseTo(CUT_MARGIN, 9);
    expect(cam.position.distanceTo(new THREE.Vector3(f.cp.px, f.cp.py, f.cp.pz))).toBeLessThan(1e-9);
    const cut = new THREE.PerspectiveCamera();
    cut.position.set(f.cp.px, f.cp.py, f.cp.pz);
    cut.lookAt(f.cp.lx, f.cp.ly, f.cp.lz);
    expect(cam.quaternion.angleTo(cut.quaternion)).toBeLessThan(1e-6);
  });

  it('moves smoothly frame to frame, and keeps the worm on screen', () => {
    for (const frames of all) {
      for (let k = 1; k < frames.length; k++) {
        const a = frames[k - 1].cam;
        const b = frames[k].cam;
        expect(a.position.distanceTo(b.position)).toBeLessThan(0.25);
        expect(a.quaternion.angleTo(b.quaternion)).toBeLessThan(0.08);
        const h = frames[k].head.clone().project(b);
        expect(Math.abs(h.x)).toBeLessThan(1);
        expect(Math.abs(h.y)).toBeLessThan(1);
      }
    }
  });

  it('turns square to the cut before cutting anything away, and only then comes down beside it', () => {
    for (const frames of all) {
      for (const f of frames) {
        if (f.p >= TURN_BY) expect(offSquare(f)).toBeLessThan(1);
        if (f.ahead < Infinity) expect(offSquare(f)).toBeLessThan(12);
        if (f.p <= CLIP_FROM) {
          expect(f.ahead).toBe(Infinity);
          // Over the leaves while the ground is whole.
          expect(f.cam.position.y).toBeGreaterThan(litterTopHeight(f.cam.position.x, f.cam.position.z) + 0.5);
        }
      }
    }
  });

  it('once the ground in front is cut away, every ray meets the ground, the cut face or the forest beyond: no empty soil', () => {
    let rays = 0;
    for (const frames of all) {
      for (const f of frames) {
        if (f.ahead === Infinity) continue;
        const s = f.s;
        const cam = f.cam;
        const o = cam.position;
        for (let i = 0; i <= 8; i++) {
          for (let j = 0; j <= 4; j++) {
            const d = new THREE.Vector3(i / 4 - 1, j / 2 - 1, 0.5).unproject(cam).sub(o).normalize();
            // Down the ray: ground still drawn (at most `ahead` in front of the cut) ends it.
            const toward = -(d.x * s.nx + d.z * s.nz);
            const tPlane = toward > 1e-6 ? (o.x - s.ox) * s.nx / toward + (o.z - s.oz) * s.nz / toward : Infinity;
            let ground = false;
            for (let t = 0.05; t < Math.min(tPlane, 60); t += 0.05) {
              const x = o.x + d.x * t;
              const z = o.z + d.z * t;
              const y = o.y + d.y * t;
              if (y <= litterTopHeight(x, z) && (x - s.ox) * s.nx + (z - s.oz) * s.nz <= f.ahead) { ground = true; break; }
            }
            if (ground) continue;
            rays++;
            // It reaches the cut: on the face (with its fading margins), or above its top (the forest beyond).
            expect(tPlane).toBeLessThan(Infinity);
            const x = o.x + d.x * tPlane;
            const z = o.z + d.z * tPlane;
            const y = o.y + d.y * tPlane;
            const u = slabU(s, x, z);
            if (u >= s.faceLo && u <= s.faceHi && y >= boundaryAt(s, B_TOP, u)) continue;
            expect(u).toBeGreaterThan(s.faceLo - FACE_FADE);
            expect(u).toBeLessThan(s.faceHi + FACE_FADE);
            expect(y).toBeGreaterThan(s.bottom - FACE_BELOW);
          }
        }
      }
    }
    expect(rays).toBeGreaterThan(500);
  });
});
