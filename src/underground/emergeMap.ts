import { BODY_RADIUS } from '../game/crawl';
import { footprints } from '../surface/obstacles';
import { PLAY_HALF } from '../surface/terrain';
import { SLAB_HALF, type Slab } from './slab';

/**
 * Where the worm can come up out of a slab (V2 spec 4.2): only where its whole body can then lie
 * on the floor along the cut, one way or the other, clear of every trunk, rock and log footprint
 * and inside the play area (the props are big at real size, so a run is often blocked). Built once
 * per dig (`mapEmerge`); `canEmergeAt` is a lookup, cheap for every step.
 */
/** The rise lands on the floor within this far along the cut from the head (emergePath.ts holds it to that)... */
export const LAND_MIN = 0.2;
export const LAND_MAX = 1.6;
/** ...then the worm crawls this far along it: the body's length and a little more, so it is all out. */
export const OUT_LENGTH = 3.8;
/** The map's sample spacing along the cut, and its most samples. */
const MAP_STEP = 0.05;
const MAP_MAX = Math.ceil((2 * SLAB_HALF) / MAP_STEP) + 2;
/** The body out on the surface keeps this far inside the play area. */
const PLAY_KEEP = 0.5;

/** Where coming up is possible along one slab: per MAP_STEP of the playable range, which ways out are clear. */
export interface EmergeMap {
  /** Sample j stands at u = (first + j) * MAP_STEP. */
  first: number;
  count: number;
  /** Bit 1: the way out along +u is clear; bit 2: along -u. */
  readonly sides: Uint8Array;
}

export function createEmergeMap(): EmergeMap {
  return { first: 0, count: 0, sides: new Uint8Array(MAP_MAX) };
}

/** Distance from (px, pz) to the segment a..b. */
function pointSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l = dx * dx + dz * dz;
  const f = l > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l)) : 0;
  return Math.hypot(px - ax - dx * f, pz - az - dz * f);
}

/** Which side of the line p..q the point s lies on (the sign), and how far times |q - p|. */
function cross(px: number, pz: number, qx: number, qz: number, sx: number, sz: number): number {
  return (qx - px) * (sz - pz) - (qz - pz) * (sx - px);
}

/**
 * Whether the stretch of the cut through (ox, oz) along (tx, tz) from u = a to u = b keeps the body
 * (BODY_RADIUS) off every footprint and inside the play area. Exact (segments, not samples), so the
 * map and canEmergeNearEntry agree, and cheap enough for every step.
 */
function stretchClear(ox: number, oz: number, tx: number, tz: number, a: number, b: number): boolean {
  const ax = ox + tx * a;
  const az = oz + tz * a;
  const bx = ox + tx * b;
  const bz = oz + tz * b;
  const lim = PLAY_HALF - PLAY_KEEP;
  if (Math.max(Math.abs(ax), Math.abs(az), Math.abs(bx), Math.abs(bz)) > lim) return false;
  const { round, log } = footprints();
  for (let k = 0; k < round.length; k += 4) {
    if (pointSeg(round[k], round[k + 1], ax, az, bx, bz) < round[k + 2] + BODY_RADIUS) return false;
  }
  // The log's footprint is a capsule: two segments closer than its radius (they cross, or an end is near).
  const lx = log.x - log.dx * log.half;
  const lz = log.z - log.dz * log.half;
  const mx = log.x + log.dx * log.half;
  const mz = log.z + log.dz * log.half;
  const r = log.r + BODY_RADIUS;
  const d1 = cross(ax, az, bx, bz, lx, lz);
  const d2 = cross(ax, az, bx, bz, mx, mz);
  const d3 = cross(lx, lz, mx, mz, ax, az);
  const d4 = cross(lx, lz, mx, mz, bx, bz);
  if (d1 * d2 < 0 && d3 * d4 < 0) return false;
  return Math.min(pointSeg(lx, lz, ax, az, bx, bz), pointSeg(mx, mz, ax, az, bx, bz),
    pointSeg(ax, az, lx, lz, mx, mz), pointSeg(bx, bz, lx, lz, mx, mz)) >= r;
}

/** The run out from a head at u, the way `sign`, wherever the rise lands (LAND_MIN..LAND_MAX). */
const runClear = (ox: number, oz: number, tx: number, tz: number, u: number, sign: number): boolean =>
  stretchClear(ox, oz, tx, tz, u + sign * LAND_MIN, u + sign * (LAND_MAX + OUT_LENGTH));

/** Fills the map for slab `s`: once per dig (about 330 samples, nothing allocated). */
export function mapEmerge(m: EmergeMap, s: Slab): void {
  // Samples on whole multiples of MAP_STEP, so one falls exactly on the entry (u = 0).
  const first = Math.ceil(s.playLo / MAP_STEP);
  m.first = first;
  m.count = Math.min(MAP_MAX, Math.floor(s.playHi / MAP_STEP) - first + 1);
  for (let j = 0; j < m.count; j++) {
    const u = (first + j) * MAP_STEP;
    m.sides[j] = (runClear(s.ox, s.oz, s.tx, s.tz, u, 1) ? 1 : 0) | (runClear(s.ox, s.oz, s.tx, s.tz, u, -1) ? 2 : 0);
  }
}

/**
 * Whether a worm digging down at (x, z) along the cut `heading` could come back up near where it
 * went in (from the samples at the entry and either side of it, the same way out): so no dig
 * leaves it with nowhere to come up. digSpot.ts requires it of every cut it offers.
 */
export function canEmergeNearEntry(x: number, z: number, heading: number): boolean {
  const tx = Math.sin(heading);
  const tz = Math.cos(heading);
  // The runs from the samples at -MAP_STEP, 0 and MAP_STEP, the same way out, cover this one stretch.
  for (let sign = -1; sign <= 1; sign += 2) {
    if (stretchClear(x, z, tx, tz, sign * (LAND_MIN - MAP_STEP), sign * (LAND_MAX + OUT_LENGTH + MAP_STEP))) return true;
  }
  return false;
}

/** The ways out clear for a head at u (bits as `EmergeMap.sides`): both neighbouring samples must agree. */
export function emergeSides(m: EmergeMap, u: number): number {
  if (!(m.count > 0) || !Number.isFinite(u)) return 0;
  const f = u / MAP_STEP - m.first;
  const a = Math.max(0, Math.min(m.count - 1, Math.floor(f)));
  const b = Math.max(0, Math.min(m.count - 1, Math.ceil(f)));
  return m.sides[a] & m.sides[b];
}

/**
 * Whether the worm can come up with its head at u: the whole body can lie out on the floor along
 * the cut one way or the other. FOR THE GAME (Task 15): Action means "Come up" only where
 * `nearTop && canEmergeAt(map, head u)`; near the top elsewhere it stays the view switch.
 * Allocation-free.
 */
export function canEmergeAt(m: EmergeMap, u: number): boolean {
  return emergeSides(m, u) !== 0;
}
