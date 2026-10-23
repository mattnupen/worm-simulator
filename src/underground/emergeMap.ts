import { BODY_RADIUS } from '../game/crawl';
import { footprints } from '../surface/obstacles';
import { PLAY_HALF } from '../surface/terrain';
import { SLAB_HALF, type CutLine, type Slab } from './slab';
import { hypot2 } from '../core/vec';

/**
 * Where the worm can come up out of a slab (V2 spec 4.2): only where its whole body can then lie
 * on the floor along the cut, one way or the other, clear of every trunk, rock and log footprint
 * and inside the play area (the props are big at real size, so a run is often blocked). Built once
 * per dig (`mapEmerge`); `canEmergeAt` is a lookup, cheap for every step.
 */
/** The rise lands on the floor within this far along the cut from the head (emergePath.ts holds it to that)... */
export const LAND_MIN = 0.2;
export const LAND_MAX = 1.6;
/**
 * ...then the worm crawls this far along it: the body's full length (3.3) and a little more, so it
 * is all out. Full length on purpose: a worm made shorter by a break (bodyLength.ts) is out sooner,
 * and the same map serves it.
 */
export const OUT_LENGTH = 3.45;
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

/**
 * A point (px, pz) and a segment a..b, and their distance `d` (pointSeg): passed as an object, as a
 * number passed to or returned from a call V8 does not inline is boxed on the heap.
 */
const ps = { px: 0, pz: 0, ax: 0, az: 0, bx: 0, bz: 0, d: 0 };

/** Distance from (px, pz) to the segment a..b, into `q.d`. */
function pointSeg(q: typeof ps): void {
  const { px, pz, ax, az, bx, bz } = q;
  const dx = bx - ax;
  const dz = bz - az;
  const l = dx * dx + dz * dz;
  const f = l > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l)) : 0;
  q.d = hypot2(px - ax - dx * f, pz - az - dz * f);
}

/**
 * A stretch of a cut: through (ox, oz) along (tx, tz), from u = a to u = b. The per-step forms take
 * their numbers in objects (a number passed to a call V8 does not inline is boxed on the heap).
 */
const run = { ox: 0, oz: 0, tx: 0, tz: 0, a: 0, b: 0 };
const cut: Pick<CutLine, 'x' | 'z' | 'h'> = { x: 0, z: 0, h: 0 };

/**
 * Whether the stretch in `run` keeps the body (BODY_RADIUS) off every footprint and inside the play
 * area. Exact (segments, not samples), so the map and canEmergeNearEntry agree, and cheap enough
 * for every step.
 */
function stretchClear(): boolean {
  const { ox, oz, tx, tz, a, b } = run;
  const ax = ox + tx * a;
  const az = oz + tz * a;
  const bx = ox + tx * b;
  const bz = oz + tz * b;
  const lim = PLAY_HALF - PLAY_KEEP;
  if (Math.max(Math.abs(ax), Math.abs(az), Math.abs(bx), Math.abs(bz)) > lim) return false;
  const { round, log } = footprints();
  ps.ax = ax;
  ps.az = az;
  ps.bx = bx;
  ps.bz = bz;
  for (let k = 0; k < round.length; k += 4) {
    ps.px = round[k];
    ps.pz = round[k + 1];
    pointSeg(ps);
    if (ps.d < round[k + 2] + BODY_RADIUS) return false;
  }
  // The log's footprint is a capsule: two segments closer than its radius (they cross, or an end is near).
  const lx = log.x - log.dx * log.half;
  const lz = log.z - log.dz * log.half;
  const mx = log.x + log.dx * log.half;
  const mz = log.z + log.dz * log.half;
  const r = log.r + BODY_RADIUS;
  // Which side of each segment's line the other's ends lie on (the sign of the cross products).
  const d1 = (bx - ax) * (lz - az) - (bz - az) * (lx - ax);
  const d2 = (bx - ax) * (mz - az) - (bz - az) * (mx - ax);
  const d3 = (mx - lx) * (az - lz) - (mz - lz) * (ax - lx);
  const d4 = (mx - lx) * (bz - lz) - (mz - lz) * (bx - lx);
  if (d1 * d2 < 0 && d3 * d4 < 0) return false;
  // The least of the four end-to-segment distances (ps still holds the stretch a..b).
  ps.px = lx;
  ps.pz = lz;
  pointSeg(ps);
  let least = ps.d;
  ps.px = mx;
  ps.pz = mz;
  pointSeg(ps);
  least = Math.min(least, ps.d);
  ps.ax = lx;
  ps.az = lz;
  ps.bx = mx;
  ps.bz = mz;
  ps.px = ax;
  ps.pz = az;
  pointSeg(ps);
  least = Math.min(least, ps.d);
  ps.px = bx;
  ps.pz = bz;
  pointSeg(ps);
  return Math.min(least, ps.d) >= r;
}

/** The run out from a head at u, the way `sign`, wherever the rise lands (LAND_MIN..LAND_MAX). */
function runClear(ox: number, oz: number, tx: number, tz: number, u: number, sign: number): boolean {
  run.ox = ox;
  run.oz = oz;
  run.tx = tx;
  run.tz = tz;
  run.a = u + sign * LAND_MIN;
  run.b = u + sign * (LAND_MAX + OUT_LENGTH);
  return stretchClear();
}

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
  cut.x = x;
  cut.z = z;
  cut.h = heading;
  return canEmergeNearEntryOf(cut);
}

/** canEmergeNearEntry for the cut `c` (through c.x, c.z along c.h). */
export function canEmergeNearEntryOf(c: Pick<CutLine, 'x' | 'z' | 'h'>): boolean {
  run.ox = c.x;
  run.oz = c.z;
  run.tx = Math.sin(c.h);
  run.tz = Math.cos(c.h);
  // The runs from the samples at -MAP_STEP, 0 and MAP_STEP, the same way out, cover this one stretch.
  for (let sign = -1; sign <= 1; sign += 2) {
    run.a = sign * (LAND_MIN - MAP_STEP);
    run.b = sign * (LAND_MAX + OUT_LENGTH + MAP_STEP);
    if (stretchClear()) return true;
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
 * the cut one way or the other. The climb out starts at once only where `nearTop &&
 * canEmergeAt(map, head u)`; at the top elsewhere Action still comes up, the worm first heading out
 * to the nearest u where this holds (V4 hot fix: burrowOut.ts). Allocation-free.
 */
export function canEmergeAt(m: EmergeMap, u: number): boolean {
  return emergeSides(m, u) !== 0;
}
