import { mulberry32 } from '../core/random';
import { PLAY_HALF } from './terrain';
import { treeSites } from './treeSites';
import { AUTO_DRIVE_MOVE, LOCOMOTION } from '../game/drive';

/**
 * Where the forest-floor props go. Pure. Everything stays out of the worm's way: the
 * straight run ahead of the spawn point, the speed test's auto-drive loop (AUTO_DRIVE_MOVE
 * with LOCOMOTION: move {x: 0.35, y: 1} at speed 1.6 and turn rate 2.2 traces a circle of
 * radius 1.6 / 0.77 ~ 2.08 centred left of the spawn), the trailing camera, and the tree trunks.
 */
const LOOP_RADIUS = (LOCOMOTION.speed * AUTO_DRIVE_MOVE.move.y) / (LOCOMOTION.turnRate * AUTO_DRIVE_MOVE.move.x);
const LOOP = { x: -LOOP_RADIUS, z: 0, r: LOOP_RADIUS };
/** Clearance around the loop line: the body, its shadow, and the camera 2.6 behind the head. */
const LOOP_MARGIN = 1.8;
const CORRIDOR = { x0: -1.8, x1: 1.8, z0: -3.5, z1: 7.5 };
const TRUNK_CLEAR = 1.0;

const TREES = treeSites();

/** True when a prop of `radius` at (x, z) is clear of the worm paths, trunks and world edge. */
export function keepsClear(x: number, z: number, radius: number): boolean {
  if (Math.hypot(x - LOOP.x, z - LOOP.z) < LOOP.r + LOOP_MARGIN + radius) return false;
  if (x > CORRIDOR.x0 - radius && x < CORRIDOR.x1 + radius && z > CORRIDOR.z0 - radius && z < CORRIDOR.z1 + radius) return false;
  if (Math.abs(x) > PLAY_HALF - radius || Math.abs(z) > PLAY_HALF - radius) return false;
  return TREES.every((t) => Math.hypot(x - t.x, z - t.z) > TRUNK_CLEAR + radius);
}

/** The hero prop: a mossy fallen paper birch, right of the spawn view. */
export const HERO_LOG = { x: 3.9, z: 4.7, yaw: -0.5, length: 4.4, radius: 0.32 };

/** Distance from (x, z) to the log's centre line. */
export function logSegmentDistance(x: number, z: number): number {
  const dx = Math.cos(HERO_LOG.yaw);
  const dz = Math.sin(HERO_LOG.yaw);
  const t = Math.max(-HERO_LOG.length / 2, Math.min(HERO_LOG.length / 2, (x - HERO_LOG.x) * dx + (z - HERO_LOG.z) * dz));
  return Math.hypot(x - (HERO_LOG.x + dx * t), z - (HERO_LOG.z + dz * t));
}

/** A few lichen-spotted granite boulders (glacial erratics). */
export const ROCKS: readonly { x: number; z: number; size: number }[] = [
  { x: -5.2, z: 7.4, size: 0.9 },
  { x: 7.2, z: -3.6, size: 1.2 },
  { x: -8.2, z: -5.2, size: 0.7 },
  { x: 9.8, z: 8.6, size: 1.0 },
  { x: -11.5, z: 5.5, size: 1.4 },
  { x: 3.2, z: -8.2, size: 0.6 },
  { x: 6.2, z: 2.2, size: 0.45 },
];

export type ClutterKind = 'mushrooms' | 'sedge' | 'fern';
export const CLUTTER_KINDS: readonly ClutterKind[] = ['mushrooms', 'sedge', 'fern'];

export interface ClutterItem { x: number; z: number; rot: number; scale: number; kind: ClutterKind }

function freeOfProps(x: number, z: number, r: number): boolean {
  return logSegmentDistance(x, z) > HERO_LOG.radius + r && ROCKS.every((k) => Math.hypot(x - k.x, z - k.z) > k.size + r);
}

/**
 * Ground clutter: mushroom clusters, sedge tufts and fern clumps. The first four are
 * mushrooms growing beside the log; the rest are scattered in random order, so any prefix
 * (the density tiers draw a prefix) is an even thinning.
 */
export function placeClutter(count: number, seed = 5): ClutterItem[] {
  const rng = mulberry32(seed);
  const out: ClutterItem[] = [];
  const dx = Math.cos(HERO_LOG.yaw);
  const dz = Math.sin(HERO_LOG.yaw);
  for (let k = 0; k < Math.min(4, count); k++) {
    const along = (k / 3 - 0.5) * HERO_LOG.length * 0.7 + (rng() - 0.5) * 0.3;
    const side = k % 2 === 0 ? 1 : -1;
    const off = HERO_LOG.radius + 0.12 + rng() * 0.1;
    out.push({
      x: HERO_LOG.x + dx * along - dz * off * side,
      z: HERO_LOG.z + dz * along + dx * off * side,
      rot: rng() * Math.PI * 2, scale: 0.8 + rng() * 0.4, kind: 'mushrooms',
    });
  }
  let guard = 0;
  while (out.length < count && guard++ < count * 200) {
    const x = (rng() * 2 - 1) * PLAY_HALF;
    const z = (rng() * 2 - 1) * PLAY_HALF;
    const pick = rng();
    const kind: ClutterKind = pick < 0.3 ? 'mushrooms' : pick < 0.72 ? 'sedge' : 'fern';
    const rot = rng() * Math.PI * 2;
    const scale = 0.7 + rng() * 0.6;
    const r = kind === 'fern' ? 0.6 * scale : 0.3 * scale;
    if (keepsClear(x, z, r) && freeOfProps(x, z, r)) out.push({ x, z, rot, scale, kind });
  }
  return out;
}
