import { hypot2, type Vec3 } from '../core/vec';
import { BODY_RADIUS, SPACING, WORM_SEGMENTS } from '../game/crawl';
import { footprints } from '../surface/obstacles';
import type { CutLine } from './slab';

/**
 * Digging down, the body on the surface turns to lie along the cut (sinkPath.ts buildSink). This is
 * the cheap, allocation-free check digSpot.ts makes for each candidate cut, every step: that turn
 * must keep the body off every trunk, rock and log footprint. Call `bodyFan` once for the body,
 * then `sweepClear` per cut direction.
 */
const TAU = 2 * Math.PI;
/** A world direction's angle: (sin a, cos a) in x, z, as headings are. */
const angleOf = (dx: number, dz: number): number => Math.atan2(dx, dz);
const wrapPi = (a: number): number => a - TAU * Math.round(a / TAU);

/**
 * The body's sweep as it turns into the cut (sinkPath.ts): each point stays within `reach` of the
 * head (its distance from the hole moves steadily between where it lay and where it will lie, both
 * no more than its distance along the body) and its direction from the hole turns steadily from where
 * it lay to straight back along the cut. A point's direction from the hole lies within the fan of
 * its segments' directions (a sum of segments pointing within a fan under half a turn points within
 * it too), so every point stays inside the fan from the most to the least turned segment and the
 * cut. The fan's directions point tailward: lo..hi, unwrapped down the body from the first segment.
 */
const fan = { lo: 0, hi: 0, first: 0, reach: 0 };
/**
 * The sweep keeps this far off a footprint: the body's radius, less a hair, so a crawl body resting
 * against a footprint's edge (the crawl pushes it out to exactly BODY_RADIUS) still counts as clear.
 */
const SWEEP_PAD = BODY_RADIUS - 0.02;

/**
 * A body curled further than this, counting the turn into the cut, may not dig: it must uncurl a
 * little first (sinkPath.ts swings each point round the hole in polar terms, which keeps a body
 * this open evenly spaced, but would crush a coil).
 */
export const MAX_FAN = (170 * Math.PI) / 180;

/** After `bodyFan`: the fan's width (radians) for the cut along `heading` (the turn included). */
export function fanWidth(heading: number): number {
  const back = fan.first + wrapPi(heading + Math.PI - fan.first);
  return Math.max(fan.hi, back) - Math.min(fan.lo, back);
}

/** The body's fan (no body: lying straight behind the head, as a settled crawl does). */
export function bodyFan(heading: number, body?: ArrayLike<Vec3>): void {
  asked.heading = heading;
  bodyFanOf(asked, body);
}

/**
 * The per-step forms take their numbers in objects (a number passed to a call V8 does not inline
 * is boxed on the heap: garbage every step).
 */
const asked = { heading: 0 };
const cut: Pick<CutLine, 'x' | 'z' | 'h'> = { x: 0, z: 0, h: 0 };

/** bodyFan for the worm heading `m.heading`. */
export function bodyFanOf(m: { readonly heading: number }, body?: ArrayLike<Vec3>): void {
  const heading = m.heading;
  if (!body) {
    fan.lo = fan.hi = fan.first = heading + Math.PI;
    fan.reach = (WORM_SEGMENTS - 1) * SPACING;
    return;
  }
  let prev = NaN;
  fan.reach = 0;
  for (let k = 0; k < body.length - 1; k++) {
    const dx = body[k + 1].x - body[k].x;
    const dz = body[k + 1].z - body[k].z;
    const l = hypot2(dx, dz);
    fan.reach += l;
    if (l < 1e-9) continue;
    const a = Number.isNaN(prev) ? angleOf(dx, dz) : prev + wrapPi(angleOf(dx, dz) - prev);
    if (Number.isNaN(prev)) fan.lo = fan.hi = fan.first = a;
    fan.lo = Math.min(fan.lo, a);
    fan.hi = Math.max(fan.hi, a);
    prev = a;
  }
  if (Number.isNaN(prev)) fan.lo = fan.hi = fan.first = heading + Math.PI;
}

/** The fan sweepClearOf tests against: from (x, z) over angles lo .. lo + width, radius `reach`. */
const sweep = { x: 0, z: 0, lo: 0, width: 0, reach: 0 };

/**
 * The circles sweepClearOf tests, CIRCLE floats each (x, z, radius): every footprint grown by
 * SWEEP_PAD (filled once: the props never move), then room for the log's row of circles.
 */
const CIRCLE = 3;
const LOG_ROW = 64;
let circles: Float64Array | null = null;
let fixedEnd = 0;
function footCircles(): Float64Array {
  if (circles) return circles;
  const { round } = footprints();
  fixedEnd = (round.length / 4) * CIRCLE;
  const c = new Float64Array(fixedEnd + LOG_ROW * CIRCLE);
  for (let k = 0, j = 0; k < round.length; k += 4, j += CIRCLE) {
    c[j] = round[k];
    c[j + 1] = round[k + 1];
    c[j + 2] = round[k + 2] + SWEEP_PAD;
  }
  circles = c;
  return c;
}

/** Whether circle `j` of `cs` (x, z, radius) touches the fan in `sweep`. */
function circleInFan(cs: Float64Array, j: number): boolean {
  const px = cs[j];
  const pz = cs[j + 1];
  const r = cs[j + 2];
  const x = sweep.x;
  const z = sweep.z;
  const lo = sweep.lo;
  const width = sweep.width;
  const reach = sweep.reach;
  const dx = px - x;
  const dz = pz - z;
  const d = hypot2(dx, dz);
  if (d > reach + r) return false;
  // A fan of half a turn or more is no longer a convex wedge (its points need not stay inside it):
  // treat it as the whole disc, so the test stays safe by construction.
  if (d <= r || width >= Math.PI) return true;
  const rel = angleOf(dx, dz) - lo;
  if (rel - TAU * Math.floor(rel / TAU) <= width) return true;
  for (let e = 0; e < 2; e++) {
    const a = lo + e * width;
    const t = Math.max(0, Math.min(reach, dx * Math.sin(a) + dz * Math.cos(a)));
    if (hypot2(dx - Math.sin(a) * t, dz - Math.cos(a) * t) <= r) return true;
  }
  return false;
}

/**
 * Whether the body (its fan, `bodyFan`) turning to lie back along the cut `heading` keeps off every
 * trunk, rock and log footprint, by the body's radius. Conservative: the whole fan must be clear.
 * False for a fan wider than MAX_FAN.
 */
export function sweepClear(x: number, z: number, heading: number): boolean {
  cut.x = x;
  cut.z = z;
  cut.h = heading;
  return sweepClearOf(cut);
}

/** sweepClear for the cut `q` (through q.x, q.z along q.h). */
export function sweepClearOf(q: Pick<CutLine, 'x' | 'z' | 'h'>): boolean {
  const x = q.x;
  const z = q.z;
  const heading = q.h;
  const back = fan.first + wrapPi(heading + Math.PI - fan.first);
  const lo = Math.min(fan.lo, back);
  const width = Math.max(fan.hi, back) - lo;
  if (width > MAX_FAN) return false;
  const reach = fan.reach;
  sweep.x = x;
  sweep.z = z;
  sweep.lo = lo;
  sweep.width = width;
  sweep.reach = reach;
  const cs = footCircles();
  let end = fixedEnd;
  // The log as a row of circles 0.5 apart (grown by the most a row can miss), near enough only.
  const { log } = footprints();
  const r = log.r + SWEEP_PAD + 0.04;
  const across = (z - log.z) * log.dx - (x - log.x) * log.dz;
  if (Math.abs(across) < reach + r) {
    const along = (x - log.x) * log.dx + (z - log.z) * log.dz;
    const near = Math.sqrt((reach + r) ** 2 - across * across);
    const from = Math.max(-log.half, along - near);
    const to = Math.min(log.half, along + near);
    for (let a = from; a <= to + 0.25 && end < cs.length; a += 0.5) {
      const c = Math.min(a, to);
      cs[end] = log.x + log.dx * c;
      cs[end + 1] = log.z + log.dz * c;
      cs[end + 2] = r;
      end += CIRCLE;
    }
  }
  // Clear only if no circle touches the fan (one call site: V8 inlines it with its hypot2s).
  for (let j = 0; j < end; j += CIRCLE) {
    if (circleInFan(cs, j)) return false;
  }
  return true;
}
