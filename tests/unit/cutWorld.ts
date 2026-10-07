import {
  createCutCam, frameTarget, snapCutCam, stepCutCam, stepCutFacing, cutPose, FOV_DEG,
  type CutCam, type CutFrame, type CutPose,
} from '../../src/underground/cutCamera';
import { createSlab, boundaryAt, slabX, slabZ, B_F, type Slab } from '../../src/underground/slab';
import { createSoilGrid, fillSoilGrid } from '../../src/underground/soilGrid';
import { createSolids, placeSolids, markSolids } from '../../src/underground/solids';
import { createBurrower, placeBurrower, stepBurrower, type Burrower } from '../../src/underground/burrowMotion';
import { SPACING } from '../../src/game/crawl';
import { mulberry32 } from '../../src/core/random';
import type { UndergroundView } from '../../src/underground/modeMachine';

// Shared by cutCamera.test.ts and cutCamera.jitter.test.ts: the real burrower digging in a slab,
// the cut camera following it, and the camera's view of a point.

export const DT = 1 / 60;
const TAN = Math.tan((FOV_DEG * Math.PI) / 360);
export const SCREENS = [[1366, 768], [360, 640]] as const;
export const frame: CutFrame = { cu: 0, cv: 0, h: 0, pitch: 0 };
export const pose: CutPose = { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0, near: 0 };

/** The point (x, y, z) in the camera's view: NDC x, y and depth. */
export function project(p: CutPose, aspect: number, x: number, y: number, z: number): { nx: number; ny: number; d: number } {
  let fx = p.lx - p.px; let fy = p.ly - p.py; let fz = p.lz - p.pz;
  const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  // right = f x up(0,1,0); up' = right x f
  let rx = -fz; let rz = fx; const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl;
  const ux = -rz * fy; const uy = rz * fx - rx * fz; const uz = rx * fy;
  const dx = x - p.px; const dy = y - p.py; const dz = z - p.pz;
  const d = dx * fx + dy * fy + dz * fz;
  return { nx: (dx * rx + dz * rz) / (d * TAN * aspect), ny: (dx * ux + dy * uy + dz * uz) / (d * TAN), d };
}

export function world(s: Slab, u: number, v: number): [number, number, number] {
  return [slabX(s, u), v, slabZ(s, u)];
}

/** The angle (radians) between two poses' view directions. */
export function turnBetween(a: CutPose, b: CutPose): number {
  const ax = a.lx - a.px; const ay = a.ly - a.py; const az = a.lz - a.pz;
  const bx = b.lx - b.px; const by = b.ly - b.py; const bz = b.lz - b.pz;
  const c = (ax * bx + ay * by + az * bz) / (Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz));
  return Math.acos(Math.min(1, Math.max(-1, c)));
}

export type Each = (p: CutPose, prev: CutPose, s: Slab, hu: number, hv: number, b: Burrower, cam: CutCam, k: number) => void;
export type ViewAt = UndergroundView | ((k: number) => UndergroundView);

/**
 * Runs the real burrower for `seconds` (25), pointing at random (or `steer`), the camera
 * following in `view` (or the view `view(k)` at step k); calls `each` every frame.
 */
export function sweep(
  view: ViewAt, w: number, hgt: number, seed: number, each: Each, steer?: (k: number) => [number, number], seconds = 25,
): void {
  const viewAt = (k: number): UndergroundView => (typeof view === 'function' ? view(k) : view);
  const rand = mulberry32(seed);
  const s = createSlab(rand() * 10 - 5, rand() * 10 - 5, rand() * 6, rand() < 0.5 ? 1 : -1, seed);
  const g = createSoilGrid();
  fillSoilGrid(g, s);
  const o = placeSolids(s, createSolids());
  markSolids(g, o);
  const b = createBurrower();
  // Lying in the cut under the F top, as the sink leaves it, the head turned down.
  const us = Array.from({ length: 16 }, (_, i) => i * SPACING);
  const vs = us.map(() => boundaryAt(s, B_F, 0) - 0.8);
  placeBurrower(b, us, vs, -Math.PI / 2, { phase: 0, activity: 0 });
  // One still step first: it lets any body point placed in a stone out, before the camera snaps.
  stepBurrower(b, s, g, o, 0, 0, DT);
  const cam = createCutCam();
  const aspect = w / hgt;
  snapCutCam(cam, frameTarget(viewAt(0), s, b.u[0], b.v[0], Math.cos(b.dir), Math.sin(b.dir), aspect, NaN, NaN, frame, b), b.dir);
  const prev: CutPose = { ...pose };
  cutPose(s, cam.cu.value, cam.cv.value, cam.h.value, cam.pitch.value, prev);
  let du = 0; let dv = -1;
  for (let k = 0; k < 60 * seconds; k++) {
    if (steer) [du, dv] = steer(k);
    else if (k % 40 === 0) { const a = rand() * Math.PI * 2; du = Math.cos(a); dv = Math.sin(a); }
    const v = viewAt(k);
    stepBurrower(b, s, g, o, du, dv, DT);
    stepCutFacing(cam, b.dir, DT);
    frameTarget(v, s, b.u[0], b.v[0], cam.au.value, cam.av.value, aspect, cam.cu.value, cam.cv.value, frame, b);
    stepCutCam(cam, frame, v, DT);
    cutPose(s, cam.cu.value, cam.cv.value, cam.h.value, cam.pitch.value, pose);
    each(pose, prev, s, b.u[0], b.v[0], b, cam, k);
    Object.assign(prev, pose);
  }
}
