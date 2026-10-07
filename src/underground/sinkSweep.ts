import type { Vec3 } from '../core/vec';
import { BODY_RADIUS, SPACING, WORM_SEGMENTS } from '../game/crawl';
import { footprints } from '../surface/obstacles';

/**
 * Digging down, the body on the surface turns to lie along the cut (bodyPath.ts buildSink). This is
 * the cheap, allocation-free check digSpot.ts makes for each candidate cut, every step: that turn
 * must keep the body off every trunk, rock and log footprint. Call `bodyFan` once for the body,
 * then `sweepClear` per cut direction.
 */
const TAU = 2 * Math.PI;
/** A world direction's angle: (sin a, cos a) in x, z, as headings are. */
const angleOf = (dx: number, dz: number): number => Math.atan2(dx, dz);
const wrapPi = (a: number): number => a - TAU * Math.round(a / TAU);

/**
 * The body's sweep as it turns into the cut (bodyPath.ts buildSink): each segment keeps its length
 * and turns from its own direction to straight back along the cut, so every body point stays
 * within `reach` of the head and within the fan of directions from the most to the least turned
 * segment (a sum of segments pointing within a fan under half a turn points within it too). The
 * fan's directions point tailward: lo..hi, unwrapped down the body from the first segment.
 */
const fan = { lo: 0, hi: 0, first: 0, reach: 0 };
/**
 * The sweep keeps this far off a footprint: the body's radius, less a hair, so a crawl body resting
 * against a footprint's edge (the crawl pushes it out to exactly BODY_RADIUS) still counts as clear.
 */
const SWEEP_PAD = BODY_RADIUS - 0.02;

/** The body's fan (no body: lying straight behind the head, as a settled crawl does). */
export function bodyFan(heading: number, body?: ArrayLike<Vec3>): void {
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
    const l = Math.hypot(dx, dz);
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

/** Whether the circle (px, pz, r) touches the fan from (x, z) over angles lo .. lo + width, radius `reach`. */
function circleInFan(x: number, z: number, lo: number, width: number, reach: number, px: number, pz: number, r: number): boolean {
  const dx = px - x;
  const dz = pz - z;
  const d = Math.hypot(dx, dz);
  if (d > reach + r) return false;
  if (d <= r || width >= TAU) return true;
  const rel = angleOf(dx, dz) - lo;
  if (rel - TAU * Math.floor(rel / TAU) <= width) return true;
  for (let e = 0; e < 2; e++) {
    const a = lo + e * width;
    const t = Math.max(0, Math.min(reach, dx * Math.sin(a) + dz * Math.cos(a)));
    if (Math.hypot(dx - Math.sin(a) * t, dz - Math.cos(a) * t) <= r) return true;
  }
  return false;
}

/**
 * Whether the body (its fan, `bodyFan`) turning to lie back along the cut `heading` keeps off every
 * trunk, rock and log footprint, by the body's radius. Conservative: the whole fan must be clear.
 */
export function sweepClear(x: number, z: number, heading: number): boolean {
  const back = fan.first + wrapPi(heading + Math.PI - fan.first);
  const lo = Math.min(fan.lo, back);
  const width = Math.max(fan.hi, back) - lo;
  const reach = fan.reach;
  const { round, log } = footprints();
  for (let k = 0; k < round.length; k += 4) {
    if (circleInFan(x, z, lo, width, reach, round[k], round[k + 1], round[k + 2] + SWEEP_PAD)) return false;
  }
  // The log as a row of circles 0.5 apart (grown by the most a row can miss), near enough only.
  const r = log.r + SWEEP_PAD + 0.04;
  const across = (z - log.z) * log.dx - (x - log.x) * log.dz;
  if (Math.abs(across) >= reach + r) return true;
  const along = (x - log.x) * log.dx + (z - log.z) * log.dz;
  const near = Math.sqrt((reach + r) ** 2 - across * across);
  const from = Math.max(-log.half, along - near);
  const to = Math.min(log.half, along + near);
  for (let a = from; a <= to + 0.25; a += 0.5) {
    const c = Math.min(a, to);
    if (circleInFan(x, z, lo, width, reach, log.x + log.dx * c, log.z + log.dz * c, r)) return false;
  }
  return true;
}
