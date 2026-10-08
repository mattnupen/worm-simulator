import * as THREE from 'three';
import { expect } from 'vitest';
import { BurrowGame } from '../../src/underground/burrowGame';
import { Crawl, WORM_SEGMENTS } from '../../src/game/crawl';
import { AXIS_UP } from '../../src/underground/bodyPath';
import { slabX, slabZ } from '../../src/underground/slab';
import type { UndergroundView } from '../../src/underground/modeMachine';
import type { Vec2 } from '../../src/core/vec';
import type { WormPose } from '../../src/worm/wormMesh';

// Shared by burrowGame.test.ts and burrowGame.continuity.test.ts: the real game driving the real
// crawl, Action pressed as a player presses it, and the worm and cameras as the renderer reads them.

export const DT = 1 / 60;
export const N = WORM_SEGMENTS;
export const STILL: Vec2 = { x: 0, y: 0 };
export const UP: Vec2 = { x: 0, y: 1 };
export const RIGHT: Vec2 = { x: 1, y: 0 };

export function makeGame(opts: { reduced?: () => boolean; view?: UndergroundView; save?: (v: UndergroundView) => void } = {}) {
  const saved: UndergroundView[] = [];
  const crawl = new Crawl();
  const game = new BurrowGame(crawl, {
    reducedMotion: () => opts.reduced?.() ?? false,
    saveView: (v) => { saved.push(v); opts.save?.(v); },
  }, opts.view ?? 'wide');
  return { crawl, game, saved };
}

/** Action held for 0.15 s (a real press: Space or the touch button), then let go. `each` runs after every step. */
export function press(game: BurrowGame, move: Vec2 = STILL, each?: () => void): void {
  for (let k = 0; k < 9; k++) { game.step(DT, move, true); each?.(); }
  game.step(DT, move, false);
  each?.();
}

export function run(game: BurrowGame, seconds: number, move: Vec2 = STILL, each?: () => void): void {
  for (let k = 0; k < Math.round(seconds / DT); k++) { game.step(DT, move, false); each?.(); }
}

/** Steps until the mode is `mode` (at most `seconds`). */
export function until(game: BurrowGame, mode: string, seconds = 8, move: Vec2 = STILL, each?: () => void): void {
  for (let k = 0; k < seconds / DT && game.mode.mode !== mode; k++) { game.step(DT, move, false); each?.(); }
  expect(game.mode.mode).toBe(mode);
}

export function digDown(game: BurrowGame, each?: () => void): void {
  expect(game.prompt).toBe('digDown');
  press(game, STILL, each);
  until(game, 'underground', 8, STILL, each);
}

/**
 * Steers the worm up until Action would bring it out (`nearTop`, where it can emerge), trying along
 * the cut each way in turn if straight up is not such a place.
 */
export function steerToTop(game: BurrowGame, each?: () => void): void {
  const ways: Vec2[] = [UP, { x: 0.7, y: 0.7 }, { x: -0.7, y: 0.7 }];
  for (let k = 0; k < 60 * 30 && !game.nearTop; k++) {
    game.step(DT, ways[Math.floor(k / 240) % 3], false);
    each?.();
  }
  expect(game.nearTop).toBe(true);
  expect(game.prompt).toBe('comeUp');
}

const pose: WormPose = { spine: new Float32Array(N * 3), phase: 0, activity: 0, timeSec: 0 };
const camera = new THREE.PerspectiveCamera();

export interface Shown {
  /** The worm's belly points (x, y, z), head first, as drawn. */
  body: number[];
  /** The surface follow camera's position (the moves blend from or to it). */
  surfCam: [number, number, number];
  /** The cut camera's frame (cu, cv, h, pitch), when not on the surface. */
  cut: [number, number, number, number] | null;
  /** The peristalsis wave drawn: its phase (in waves: only its fraction shows) and activity. */
  phase: number;
  activity: number;
}

/**
 * What the renderer (Task 17) draws between the last two steps at `alpha`: on the surface the
 * crawl's interpolated pose and camera; otherwise the worm in or beside the cut (from the game's
 * last and current poses), the crawl's camera as it stands, and the cut camera's frame.
 */
export function shown(game: BurrowGame, alpha: number): Shown {
  const lerp = (a: number, b: number) => a + (b - a) * alpha;
  const surface = game.mode.mode === 'surface';
  game.crawl.interpolate(surface ? alpha : 1, 0, pose, camera);
  const surfCam: [number, number, number] = [camera.position.x, camera.position.y, camera.position.z];
  if (surface) return { body: Array.from(pose.spine), surfCam, cut: null, phase: pose.phase, activity: pose.activity };
  const s = game.slab!;
  const w = game.worm;
  const body: number[] = [];
  for (let i = 0; i < N; i++) {
    const u = lerp(w.prevU[i], w.u[i]);
    const off = lerp(game.prevW[i], game.offW[i]);
    body.push(slabX(s, u) + s.nx * off, lerp(w.prevV[i], w.v[i]) - AXIS_UP, slabZ(s, u) + s.nz * off);
  }
  const c = game.cam;
  const q = game.camPrev;
  return {
    body, surfCam, cut: [lerp(q.cu, c.cu.value), lerp(q.cv, c.cv.value), lerp(q.h, c.h.value), lerp(q.pitch, c.pitch.value)],
    phase: lerp(w.prevWave.phase, w.wave.phase), activity: lerp(w.prevWave.activity, w.wave.activity),
  };
}

/** The largest distance between matching points of two flat xyz lists. */
export function gap(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let most = 0;
  for (let i = 0; i < a.length; i += 3) most = Math.max(most, Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2]));
  return most;
}
