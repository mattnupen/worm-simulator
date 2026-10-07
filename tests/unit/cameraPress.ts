import * as THREE from 'three';
import { Crawl, WORM_SEGMENTS } from '../../src/game/crawl';
import type { WormPose } from '../../src/worm/wormMesh';
import { footprints, insideTall } from '../../src/surface/obstacles';

/**
 * Shared by the camera tests: driving the worm at props, and watching its camera for snaps and
 * shake. The press-and-turn runs are split over several test files (cameraPress*.test.ts) so they
 * run side by side.
 */
export const DT = 1 / 60;
const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

/** Steers toward (tx, tz) for `steps` steps; `each` sees the crawl after every step. */
export function driveTo(c: Crawl, tx: number, tz: number, steps: number, each: (c: Crawl) => void): void {
  const move = { x: 0, y: 1 };
  for (let s = 0; s < steps; s++) {
    const h = c.motion.head;
    const err = wrap(Math.atan2(tx - h.x, tz - h.z) - c.motion.heading);
    move.x = Math.max(-1, Math.min(1, -err * 3));
    c.step(DT, move);
    each(c);
  }
}

/**
 * Watches the camera step by step: the largest change in its step (a snap or shake shows here),
 * and the largest turn of the view from one step to the next, as drawn on the classroom's
 * 1366 x 768 screen (a flip or spin shows here).
 */
export function watcher(c: Crawl) {
  const last = { ...c.cam.pos };
  const step = { x: 0, y: 0, z: 0 };
  const camera = new THREE.PerspectiveCamera(60, 1366 / 768, 0.2, 120);
  const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
  const lastTurn = new THREE.Quaternion();
  c.interpolate(1, 0, pose, camera);
  lastTurn.copy(camera.quaternion);
  const w = {
    jerk: 0,
    inside: 0,
    rotation: 0,
    see(cc: Crawl) {
      cc.interpolate(1, 0, pose, camera);
      w.rotation = Math.max(w.rotation, camera.quaternion.angleTo(lastTurn));
      lastTurn.copy(camera.quaternion);
      const p = cc.cam.pos;
      const sx = p.x - last.x;
      const sy = p.y - last.y;
      const sz = p.z - last.z;
      w.jerk = Math.max(w.jerk, Math.hypot(sx - step.x, sy - step.y, sz - step.z));
      if (insideTall(p.x, p.z, p.y)) w.inside++;
      step.x = sx;
      step.y = sy;
      step.z = sz;
      last.x = p.x;
      last.y = p.y;
      last.z = p.z;
    },
  };
  return w;
}

/**
 * Drives into every prop (straight, and off-centre by 0.3 and 0.6 either
 * way), presses into it, then holds only left or right (`turn`: 1 or -1), so the worm turns where
 * it is, against the prop. Returns the largest change in the camera's step over all of them, the
 * largest turn of its view in one step (rad), and how many steps it spent inside a prop taller
 * than it.
 */
export function pressAndTurn(turn: number): { jerk: number; rotation: number; inside: number } {
  const { round, log } = footprints();
  const targets = [];
  for (let o = 0; o < round.length; o += 4) targets.push({ x: round[o], z: round[o + 1] });
  targets.push({ x: log.x + log.dx * log.half * 0.3, z: log.z + log.dz * log.half * 0.3 });
  let jerk = 0;
  let rotation = 0;
  let inside = 0;
  const move = { x: turn, y: 0 };
  for (const t of targets) {
    for (const off of [0, -0.6, -0.3, 0.3, 0.6]) {
      const c = new Crawl();
      const w = watcher(c);
      driveTo(c, t.x + off, t.z - off, 700, w.see);
      for (let s = 0; s < 300; s++) {
        c.step(DT, move);
        w.see(c);
      }
      jerk = Math.max(jerk, w.jerk);
      rotation = Math.max(rotation, w.rotation);
      inside += w.inside;
    }
  }
  return { jerk, rotation, inside };
}
